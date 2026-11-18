-- crm_0002_base_e_acesso.sql
-- Base do CRM: schema, controle de acesso por área, utilitários e a função que protege cada tabela.
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.
-- Obs.: crm_0001_integracao_leads_api_webhooks.sql (já existente) cobre webhooks/API e NÃO é repetido aqui.

create schema if not exists crm;
comment on schema crm is 'CRM + Atendimento Neves Pádua. Nunca altera tabelas do sistema jurídico.';

-- ---- utilitários -------------------------------------------------------------
create or replace function crm.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- últimos 11 dígitos do telefone (sem +55, parênteses, traços): chave de deduplicação
create or replace function crm.normalizar_telefone(p text) returns text
language sql immutable parallel safe as $$
  select nullif(right(regexp_replace(coalesce(p,''), '\D', '', 'g'), 11), '')
$$;

-- ---- acesso por área -----------------------------------------------------------
-- areas: atendimento | comercial | gestao | admin. papel: atendente | lider | admin.
create table if not exists crm.acessos (
  user_id   uuid not null references auth.users(id) on delete cascade,
  area      text not null check (area in ('atendimento','comercial','gestao','admin')),
  papel     text not null default 'atendente' check (papel in ('atendente','lider','admin')),
  criado_em timestamptz not null default now(),
  primary key (user_id, area)
);
comment on table crm.acessos is 'Quem acessa cada área do CRM e com qual papel. Sem linha = sem acesso (falha fechada).';

create or replace function crm.pode(p_area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from crm.acessos a
    where a.user_id = auth.uid()
      and (a.area = p_area or a.area = 'admin' or a.papel = 'admin'))
$$;

create or replace function crm.eh_lider() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from crm.acessos a where a.user_id = auth.uid() and a.papel in ('lider','admin'))
$$;

create or replace function crm.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from crm.acessos a where a.user_id = auth.uid() and a.papel = 'admin')
$$;

-- ---- proteção padrão de tabela ---------------------------------------------------
-- RLS ligado; anon sem nada; leitura/escrita para quem tem a área; exclusão só para líder/admin.
create or replace function crm.proteger(p_tab regclass, p_area text) returns void
language plpgsql as $$
declare t text := p_tab::text;
begin
  execute format('alter table %s enable row level security', t);
  execute format('revoke all on %s from anon', t);
  execute format('grant select, insert, update, delete on %s to authenticated', t);
  execute format('drop policy if exists p_crm_sel on %s', t);
  execute format('drop policy if exists p_crm_ins on %s', t);
  execute format('drop policy if exists p_crm_upd on %s', t);
  execute format('drop policy if exists p_crm_del on %s', t);
  execute format('create policy p_crm_sel on %s for select to authenticated using (crm.pode(%L))', t, p_area);
  execute format('create policy p_crm_ins on %s for insert to authenticated with check (crm.pode(%L))', t, p_area);
  execute format('create policy p_crm_upd on %s for update to authenticated using (crm.pode(%L)) with check (crm.pode(%L))', t, p_area, p_area);
  execute format('create policy p_crm_del on %s for delete to authenticated using (crm.pode(%L) and crm.eh_lider())', t, p_area);
end $$;
revoke all on function crm.proteger(regclass, text) from public, anon, authenticated;

-- acessos: cada pessoa vê as próprias linhas; só admin gerencia
alter table crm.acessos enable row level security;
revoke all on crm.acessos from anon;
grant select, insert, update, delete on crm.acessos to authenticated;
drop policy if exists p_acessos_sel on crm.acessos;
drop policy if exists p_acessos_all on crm.acessos;
create policy p_acessos_sel on crm.acessos for select to authenticated using (user_id = auth.uid() or crm.eh_admin());
create policy p_acessos_all on crm.acessos for all to authenticated using (crm.eh_admin()) with check (crm.eh_admin());

grant usage on schema crm to authenticated;
revoke all on schema crm from anon;
grant execute on function crm.pode(text), crm.eh_lider(), crm.eh_admin(), crm.normalizar_telefone(text) to authenticated;

-- PRIMEIRO ADMIN (rodar uma vez no SQL Editor, com o e-mail de quem administra):
-- insert into crm.acessos (user_id, area, papel)
-- select id, 'admin', 'admin' from auth.users where email = 'EMAIL_DO_ADMIN';
