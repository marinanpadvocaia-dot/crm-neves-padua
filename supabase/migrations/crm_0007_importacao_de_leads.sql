-- crm_0007_importacao_de_leads.sql
-- Importação em massa de leads (migração do GCV e do sistema atual): lotes, linhas e deduplicação.
-- Regra: importação NÃO dispara cadência, fluxo nem automação (os gatilhos devem checar negocios.importacao_id).

create table if not exists crm.importacoes (
  id                   uuid primary key default gen_random_uuid(),
  lote                 text not null,
  arquivo              text,
  funil_id             uuid references crm.funis(id),
  origem_padrao_id     uuid references crm.origens(id),
  atualizar_existentes boolean not null default true,
  iniciar_cadencia     boolean not null default false,
  status               text not null default 'simulada' check (status in ('simulada','concluida','falhou')),
  total                int not null default 0,
  criados              int not null default 0,
  atualizados          int not null default 0,
  ignorados            int not null default 0,
  user_id              uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);
comment on table crm.importacoes is 'Um registro por lote importado.';

create table if not exists crm.importacao_linhas (
  id            bigint generated always as identity primary key,
  importacao_id uuid not null references crm.importacoes(id) on delete cascade,
  linha         int not null,
  acao          text not null check (acao in ('criar','atualizar','ignorar')),
  negocio_id    uuid references crm.negocios(id) on delete set null,
  avisos        text[] not null default '{}',
  erros         text[] not null default '{}',
  dados         jsonb not null default '{}'::jsonb
);
create index if not exists ix_imp_linhas on crm.importacao_linhas (importacao_id, linha);

alter table crm.negocios drop constraint if exists negocios_importacao_fk;
alter table crm.negocios add constraint negocios_importacao_fk
  foreign key (importacao_id) references crm.importacoes(id) on delete set null;

-- Dedupe: telefone normalizado → ID externo → e-mail. Devolve o negócio existente (ou null).
create or replace function crm.achar_negocio_existente(p_telefone text, p_externo text, p_email text)
returns uuid language sql stable as $$
  select id from (
    select id, 1 as prio from crm.negocios where crm.normalizar_telefone(p_telefone) is not null and telefone_norm = crm.normalizar_telefone(p_telefone)
    union all
    select id, 2 from crm.negocios where nullif(p_externo,'') is not null and externo_id = p_externo
    union all
    select id, 3 from crm.negocios where nullif(p_email,'') is not null and lower(email) = lower(p_email)
  ) x order by prio limit 1
$$;
grant execute on function crm.achar_negocio_existente(text,text,text) to authenticated;

select crm.proteger('crm.importacoes','comercial');
select crm.proteger('crm.importacao_linhas','comercial');
