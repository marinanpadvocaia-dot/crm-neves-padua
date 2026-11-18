-- crm_0020_ia_pedido_humano.sql
-- Agentes de IA só no Instagram e no Google (atendimento não contínuo). No WhatsApp, quem atende é a equipe.
-- Quando o contato pede para falar com uma pessoa (ou a IA indica que precisa de uma pessoa), a IA PARA na hora
-- para aquele contato e passa o atendimento para uma pessoa:
--   * a conversa vai para "transferida" (sem rascunho), rascunhos ainda pendentes do mesmo contato também;
--   * a IA fica pausada para o contato (padrão 30 dias, crm.config 'ia_pausa_dias'); novas mensagens dele vão direto para a equipe;
--   * por ser o primeiro contato, o atendimento é delegado a um atendente do Comercial (rodízio da fila; crm.config
--     'ia_delegar' {"fila":"comercial"}), que recebe uma menção (aparece na fila "Menções" do atendimento).
--     Sem ninguém no Comercial, a menção vai para os líderes e administradores.
-- Idempotente. NÃO altera tabelas do sistema jurídico.

-- agentes: só Instagram e Google
delete from crm.agentes where canal not in ('instagram','google') and not exists (select 1 from crm.revisoes_ia r where r.agente_id = crm.agentes.id);
update crm.agentes set ativo = false where canal not in ('instagram','google');
alter table crm.revisoes_ia add column if not exists delegado_id uuid references auth.users(id) on delete set null;
comment on column crm.revisoes_ia.delegado_id is 'Quem ficou com o atendimento depois que a IA parou (rodízio do Comercial ou quem assumiu).';
alter table crm.avisos add column if not exists revisao_id uuid references crm.revisoes_ia(id) on delete set null;
comment on table crm.avisos is 'Menções para uma pessoa da equipe (passo "Avisar alguém da equipe" dos fluxos e pedido de atendimento humano na IA). Aparecem na fila "Menções". Cada um vê só as suas.';

create table if not exists crm.ia_pausas (
  contato    text primary key,                      -- mesmo formato de revisoes_ia.contato (instagram:…, google:…)
  ate        timestamptz not null,
  motivo     text,
  agente_id  uuid references crm.agentes(id) on delete set null,
  criada_em  timestamptz not null default now()
);
comment on table crm.ia_pausas is 'Contatos com a IA pausada (pediram uma pessoa ou foram assumidos pela equipe).';
insert into crm.config (chave, valor) values ('ia_pausa_dias', '{"dias": 30}') on conflict (chave) do nothing;
insert into crm.config (chave, valor) values ('ia_delegar', '{"fila": "comercial"}') on conflict (chave) do nothing;

-- o contato pode ser atendido pela IA? (não recusou e não está pausado)
create or replace function crm.ia_pode_processar(p_contato text) returns boolean
language sql stable as $$
  select coalesce((
    select c.revogado_em is null or (c.concedido_em is not null and c.concedido_em > c.revogado_em)
    from crm.consentimentos c
    where c.contato_ref = p_contato and c.finalidade = 'ia'
    order by greatest(coalesce(c.concedido_em, '-infinity'), coalesce(c.revogado_em, '-infinity')) desc, c.created_at desc
    limit 1), true)
  and not exists (select 1 from crm.ia_pausas p where p.contato = p_contato and p.ate > now())
$$;

-- atendente do Comercial para o primeiro contato: segue o rodízio da fila; com o rodízio desligado, o primeiro da lista.
-- Pula quem está inativo ou sem acesso. Sem ninguém, devolve null.
create or replace function crm.ia_escolher_atendente() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_fila text; v_n int; v_u uuid;
begin
  v_fila := coalesce((select c.valor->>'fila' from crm.config c where c.chave = 'ia_delegar'), 'comercial');
  select count(*) into v_n from crm.fila_membros m where m.fila_ref = v_fila;
  for i in 1..coalesce(v_n, 0) loop
    v_u := crm.atribuir_rodizio(v_fila);
    exit when v_u is null;
    if exists (select 1 from crm.perfis p where p.user_id = v_u and p.ativo) and crm.tipo_acesso(v_u) is not null then return v_u; end if;
  end loop;
  select m.user_id into v_u from crm.fila_membros m join crm.perfis p on p.user_id = m.user_id and p.ativo
   where m.fila_ref = v_fila and crm.tipo_acesso(m.user_id) is not null order by m.ordem, m.user_id limit 1;
  return v_u;
end $$;

-- conversa transferida para uma pessoa: pausa a IA para o contato, tira os rascunhos pendentes dele
-- e delega o atendimento a um atendente do Comercial (menção para ele)
create or replace function crm.ia_ao_transferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_dias int; v_resp uuid; v_canal text; v_txt text;
begin
  if pg_trigger_depth() > 1 then return null; end if;                  -- as mudanças feitas aqui não disparam de novo
  if new.status <> 'transferida' or (tg_op = 'UPDATE' and old.status = 'transferida') or new.contato is null then return null; end if;
  v_dias := coalesce((select (c.valor->>'dias')::int from crm.config c where c.chave = 'ia_pausa_dias'), 30);
  insert into crm.ia_pausas (contato, ate, motivo, agente_id) values (new.contato, now() + make_interval(days => v_dias), new.motivo, new.agente_id)
  on conflict (contato) do update set ate = excluded.ate, motivo = excluded.motivo, agente_id = excluded.agente_id;
  update crm.revisoes_ia set status = 'transferida', motivo = 'O contato foi para uma pessoa: rascunho descartado.'
   where contato = new.contato and id <> new.id and status in ('pendente','bloqueada');
  if auth.uid() is not null then                                      -- uma pessoa assumiu: fica com ela, sem menção
    update crm.revisoes_ia set delegado_id = auth.uid() where id = new.id;
    return null;
  end if;
  v_resp := crm.ia_escolher_atendente();
  select a.canal into v_canal from crm.agentes a where a.id = new.agente_id;
  v_txt := left(case when new.motivo ilike '%pediu para falar com uma pessoa%'
                     then '🙋 ' || coalesce(new.contato_nome, 'Contato') || ' pediu para falar com uma pessoa no ' || initcap(coalesce(v_canal, 'canal')) || ': “' || left(coalesce(new.mensagem_cliente, ''), 120) || '”. A IA parou para este contato.'
                     else coalesce(new.contato_nome, 'Contato') || ' (' || initcap(coalesce(v_canal, 'canal')) || ') precisa de uma pessoa: ' || coalesce(new.motivo, 'transferido pela IA') || ' Mensagem: “' || left(coalesce(new.mensagem_cliente, ''), 120) || '”.' end
                || case when v_resp is not null then ' O atendimento é seu (primeiro contato, Comercial).'
                        else ' Ninguém no Comercial para receber: escolha quem atende.' end, 1000);
  if v_resp is not null then
    update crm.revisoes_ia set delegado_id = v_resp where id = new.id;
    insert into crm.avisos (user_id, texto, revisao_id) values (v_resp, v_txt, new.id);
  else
    insert into crm.avisos (user_id, texto, revisao_id)
    select p.user_id, v_txt, new.id from crm.perfis p where p.ativo and crm.tipo_acesso(p.user_id) in ('lider','admin');
  end if;
  return null;
end $$;
drop trigger if exists trg_ia_ao_transferir on crm.revisoes_ia;
create trigger trg_ia_ao_transferir after insert or update of status on crm.revisoes_ia for each row execute function crm.ia_ao_transferir();

-- "Devolver para a IA": a equipe tira a pausa de um contato (ex.: assunto resolvido)
create or replace function crm.ia_despausar(p_contato text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.pode('atendimento') then raise exception 'sem permissão' using errcode = '42501'; end if;
  delete from crm.ia_pausas where contato = p_contato;
end $$;

select crm.proteger('crm.ia_pausas', 'atendimento');
revoke insert, update, delete on crm.ia_pausas from authenticated;
revoke all on function crm.ia_despausar(text), crm.ia_escolher_atendente() from public, anon;
revoke all on function crm.ia_escolher_atendente() from authenticated;
grant execute on function crm.ia_despausar(text) to authenticated;
grant execute on function crm.ia_pode_processar(text) to service_role;
grant select on crm.ia_pausas to service_role;
