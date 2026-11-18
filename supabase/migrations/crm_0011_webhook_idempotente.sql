-- crm_0011_webhook_idempotente.sql
-- Passo 1.4 do plano de robustez: idempotência no webhook do provedor (Evolution).
-- Fluxo: a Edge Function `whatsapp-webhook` grava o evento bruto (crm.webhook_registrar) e responde rápido.
-- Evento repetido (mesmo canal + id externo + tipo) é ignorado. O processamento é separado e pode ser refeito.
-- Ordem: processar pela data do provedor (ocorrido_em), não pela chegada.
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.
-- Pendência do passo 2: índice único de externo_id nas mensagens (atd_mensagens) depende do crm_0000/crm_0008.

create table if not exists crm.webhook_eventos (
  id            bigint generated always as identity primary key,
  canal_id      uuid not null references crm.canais(id) on delete cascade,
  id_externo    text not null,                 -- id da mensagem/evento no provedor
  tipo          text not null,                 -- mensagem, status, conexao, ...
  payload       jsonb not null default '{}'::jsonb,
  ocorrido_em   timestamptz,                   -- data informada pelo provedor
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz,
  tentativas    int not null default 0,
  erro          text,
  unique (canal_id, id_externo, tipo)
);
comment on table crm.webhook_eventos is 'Eventos brutos do provedor. Chave única impede processar o mesmo evento duas vezes. Contém dados pessoais: só líder/admin leem.';
create index if not exists ix_webhook_pendentes on crm.webhook_eventos (coalesce(ocorrido_em, recebido_em), id) where processado_em is null;
create index if not exists ix_webhook_recebido on crm.webhook_eventos (recebido_em desc);

-- Grava o evento bruto. novo = false quando é repetido (e nada mais acontece).
create or replace function crm.webhook_registrar(p_canal uuid, p_id_externo text, p_tipo text, p_payload jsonb, p_ocorrido_em timestamptz default null)
returns table (evento_id bigint, novo boolean) language plpgsql as $$
declare v_id bigint;
begin
  insert into crm.webhook_eventos (canal_id, id_externo, tipo, payload, ocorrido_em)
  values (p_canal, p_id_externo, p_tipo, coalesce(p_payload, '{}'::jsonb), p_ocorrido_em)
  on conflict (canal_id, id_externo, tipo) do nothing
  returning id into v_id;
  if v_id is null then
    return query select w.id, false from crm.webhook_eventos w where w.canal_id = p_canal and w.id_externo = p_id_externo and w.tipo = p_tipo;
    return;
  end if;
  update crm.canais set ultimo_evento_em = now(),
         ultima_mensagem_recebida_em = case when p_tipo = 'mensagem'
           then greatest(ultima_mensagem_recebida_em, coalesce(p_ocorrido_em, now())) else ultima_mensagem_recebida_em end
   where id = p_canal;
  return query select v_id, true;
end $$;

-- Próximos eventos a processar, na ordem do provedor. Eventos com 5 erros saem da fila automática (reprocessar manualmente).
create or replace function crm.webhook_para_processar(p_limite int default 50) returns setof crm.webhook_eventos
language sql stable as $$
  select * from crm.webhook_eventos
   where processado_em is null and tentativas < 5
   order by coalesce(ocorrido_em, recebido_em), id
   limit p_limite
$$;

-- Resultado do processamento: sem erro marca processado; com erro soma tentativa e guarda o motivo.
create or replace function crm.webhook_marcar(p_id bigint, p_erro text default null) returns void
language plpgsql as $$
begin
  if p_erro is null then
    update crm.webhook_eventos set processado_em = now(), erro = null where id = p_id and processado_em is null;
  else
    update crm.webhook_eventos set tentativas = tentativas + 1, erro = p_erro where id = p_id and processado_em is null;
  end if;
end $$;

-- Botão "Reprocessar" do painel de saúde (só admin).
create or replace function crm.webhook_reprocessar(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_admin() then raise exception 'só o administrador reprocessa eventos' using errcode = '42501'; end if;
  update crm.webhook_eventos set tentativas = 0, erro = null where id = p_id and processado_em is null;
end $$;

alter table crm.webhook_eventos enable row level security;
revoke all on crm.webhook_eventos from anon;
grant select on crm.webhook_eventos to authenticated;
drop policy if exists p_webhook_sel on crm.webhook_eventos;
create policy p_webhook_sel on crm.webhook_eventos for select to authenticated using ((select crm.eh_lider()));

grant select, insert, update on crm.webhook_eventos to service_role;
revoke all on function crm.webhook_registrar(uuid, text, text, jsonb, timestamptz), crm.webhook_para_processar(int),
  crm.webhook_marcar(bigint, text) from public, anon, authenticated;
grant execute on function crm.webhook_registrar(uuid, text, text, jsonb, timestamptz), crm.webhook_para_processar(int),
  crm.webhook_marcar(bigint, text) to service_role;
revoke all on function crm.webhook_reprocessar(bigint) from public, anon;
grant execute on function crm.webhook_reprocessar(bigint) to authenticated;
