-- crm_0009_canais_e_estado.sql
-- Passo 1.1 / 1.2 do plano de robustez: cadastro dos canais (WhatsApp, Instagram, Google),
-- estado de cada um, histórico de mudanças de estado e a regra de "silêncio suspeito".
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.
-- Quem grava o estado é a Edge Function `whatsapp-saude` (service_role) a cada 1 minuto.

-- service_role (usada só pelas Edge Functions, nunca no front) precisa enxergar o schema crm.
grant usage on schema crm to service_role;

create table if not exists crm.canais (
  id                          uuid primary key default gen_random_uuid(),
  tipo                        text not null check (tipo in ('whatsapp','instagram','google')),
  nome                        text not null,
  numero                      text,                       -- número ou @perfil exibido
  provedor                    text not null default 'evolution' check (provedor in ('evolution','meta','simulado')),
  instancia                   text,                       -- nome da instância na Evolution (sem segredo)
  estado                      text not null default 'desconectado'
                              check (estado in ('conectado','desconectado','aguardando_qr','bloqueado')),
  ativo                       boolean not null default true,
  principal                   boolean not null default false,  -- canal usado para enviar por padrão
  reserva                     boolean not null default false,  -- plano B (número reserva, normalmente inativo)
  silencio_max_min            int not null default 120 check (silencio_max_min > 0),
  ultimo_evento_em            timestamptz,
  ultima_mensagem_recebida_em timestamptz,
  ultima_verificacao_em       timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
comment on table crm.canais is 'Canais de atendimento e o estado de cada um. Segredos (apikey da Evolution) ficam no Vault, nunca aqui.';
create unique index if not exists ux_canais_principal on crm.canais (tipo) where principal and ativo;
create or replace trigger trg_canais_upd before update on crm.canais for each row execute function crm.set_updated_at();

create table if not exists crm.canal_eventos (
  id        bigint generated always as identity primary key,
  canal_id  uuid not null references crm.canais(id) on delete cascade,
  de        text,
  para      text not null,
  detalhe   text,
  criado_em timestamptz not null default now()
);
comment on table crm.canal_eventos is 'Histórico de mudanças de estado de cada canal (aparece ao clicar na faixa de estado).';
create index if not exists ix_canal_eventos on crm.canal_eventos (canal_id, criado_em desc);

-- Toda mudança de estado vira evento (security definer: o evento é gravado mesmo quando quem mudou não pode inserir eventos).
-- BEFORE marca a hora do evento; AFTER grava o evento (a linha do canal já existe, por causa da FK).
create or replace function crm.canais_registrar_mudanca() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    if tg_when = 'BEFORE' then
      new.ultimo_evento_em := now();
    else
      insert into crm.canal_eventos (canal_id, de, para, detalhe)
      values (new.id, case when tg_op = 'UPDATE' then old.estado end, new.estado,
              nullif(current_setting('crm.detalhe_estado', true), ''));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_canais_mudanca on crm.canais;
create or replace trigger trg_canais_mudanca before insert or update on crm.canais for each row execute function crm.canais_registrar_mudanca();
create or replace trigger trg_canais_mudanca_ev after insert or update on crm.canais for each row execute function crm.canais_registrar_mudanca();

-- Chamada pela verificação de saúde. Devolve true quando o estado mudou.
create or replace function crm.registrar_estado_canal(p_canal uuid, p_estado text, p_detalhe text default null) returns boolean
language plpgsql as $$
declare v_antes text;
begin
  select estado into v_antes from crm.canais where id = p_canal for update;
  if not found then raise exception 'canal % não existe', p_canal; end if;
  perform set_config('crm.detalhe_estado', coalesce(p_detalhe, ''), true);
  update crm.canais set estado = p_estado, ultima_verificacao_em = now() where id = p_canal;
  return v_antes is distinct from p_estado;
end $$;

-- Horário em que o silêncio do canal é suspeito (configurável em crm.config, chave 'horario_canais').
create or replace function crm.em_horario_comercial(p_quando timestamptz default now()) returns boolean
language plpgsql stable as $$
declare
  c jsonb := coalesce((select valor from crm.config where chave = 'horario_canais'),
                      '{"dias":[1,2,3,4,5],"abre":"08:00","fecha":"18:00","fuso":"America/Sao_Paulo"}'::jsonb);
  l timestamp := p_quando at time zone (c->>'fuso');
begin
  return (extract(isodow from l)::int) in (select jsonb_array_elements_text(c->'dias')::int)
     and l::time >= (c->>'abre')::time and l::time < (c->>'fecha')::time;
end $$;

-- Estado exibido na tela: "instavel" = conectado, mas sem receber nada há mais que o normal, em horário comercial.
create or replace view crm.canais_status with (security_invoker = true) as
select c.*,
  case
    when c.estado = 'conectado' and crm.em_horario_comercial()
         and coalesce(c.ultima_mensagem_recebida_em, c.created_at) < now() - make_interval(mins => c.silencio_max_min)
      then 'instavel'
    else c.estado
  end as estado_exibido,
  floor(extract(epoch from now() - c.ultima_mensagem_recebida_em) / 60)::int as minutos_sem_receber
from crm.canais c;
comment on view crm.canais_status is 'Canais com o estado exibido (inclui "instavel" por silêncio suspeito). Base da faixa de estado e do painel.';

-- Acesso: quem atende vê os canais; só admin cadastra/altera; Edge Functions usam service_role.
alter table crm.canais enable row level security;
alter table crm.canal_eventos enable row level security;
revoke all on crm.canais, crm.canal_eventos from anon;
grant select, insert, update, delete on crm.canais to authenticated;
grant select on crm.canal_eventos to authenticated;
grant select on crm.canais_status to authenticated;
drop policy if exists p_canais_sel on crm.canais;
drop policy if exists p_canais_adm on crm.canais;
drop policy if exists p_canal_eventos_sel on crm.canal_eventos;
create policy p_canais_sel on crm.canais for select to authenticated using ((select crm.pode('atendimento')));
create policy p_canais_adm on crm.canais for all to authenticated using ((select crm.eh_admin())) with check ((select crm.eh_admin()));
create policy p_canal_eventos_sel on crm.canal_eventos for select to authenticated using ((select crm.pode('atendimento')));

grant select, insert, update on crm.canais, crm.canal_eventos to service_role;
grant select on crm.canais_status, crm.config to service_role;
revoke all on function crm.registrar_estado_canal(uuid, text, text) from public, anon, authenticated;
grant execute on function crm.registrar_estado_canal(uuid, text, text) to service_role;
grant execute on function crm.em_horario_comercial(timestamptz) to authenticated, service_role;

-- CADASTRO (rodar uma vez, por ambiente, no SQL Editor; o seed de homologação já faz isso):
-- insert into crm.canais (tipo, nome, numero, instancia, principal) values ('whatsapp','Número do escritório','+55 16 9XXXX-XXXX','escritorio',true);
-- insert into crm.canais (tipo, nome, numero, instancia, ativo, reserva) values ('whatsapp','Número reserva (plano B)','+55 16 9YYYY-YYYY','reserva',false,true);
