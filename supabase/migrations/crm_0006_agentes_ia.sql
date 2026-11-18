-- crm_0006_agentes_ia.sql
-- Agentes de IA (Instagram, Google Meu Negócio, clientes jurídicos PF): configuração, regras, revisão humana, resumos.
-- NUNCA guardar chave de API aqui: chaves ficam no Vault do Supabase.

create table if not exists crm.agentes (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  nome              text not null,
  canal             text not null check (canal in ('whatsapp','instagram','google')),
  ativo             boolean not null default false,
  modo              text not null default 'rascunho' check (modo in ('rascunho','automatico')),
  responde_sozinho  text,
  transfere_quando  text,
  base_conhecimento text,
  destino_registro  text,
  provedor          text check (provedor in ('openai','anthropic','xai')),
  updated_at        timestamptz not null default now()
);
comment on table crm.agentes is 'Modo rascunho = a pessoa revisa e envia (padrão na v1, inclusive Google Meu Negócio).';
create or replace trigger trg_agentes_upd before update on crm.agentes for each row execute function crm.set_updated_at();

create table if not exists crm.regras_ia (
  id           uuid primary key default gen_random_uuid(),
  agente_id    uuid references crm.agentes(id) on delete cascade,   -- null = vale para todos
  tipo         text not null check (tipo in ('proibido','cuidado','obrigatorio')),
  regra        text not null,
  fonte        text,                                                -- ex.: Provimento 205/2021, Código de Ética da OAB
  ativa        boolean not null default true,
  validada_por uuid references auth.users(id) on delete set null,   -- rascunho até a advogada validar
  validada_em  timestamptz,
  created_at   timestamptz not null default now(),
  check ((validada_por is null) = (validada_em is null))
);
comment on table crm.regras_ia is 'Regras do que a IA não pode dizer. Só valem em produção depois de validadas pela advogada.';

create table if not exists crm.revisoes_ia (
  id            uuid primary key default gen_random_uuid(),
  agente_id     uuid references crm.agentes(id) on delete set null,
  conversa_ref  text,
  rascunho      text not null,
  status        text not null default 'pendente' check (status in ('pendente','aprovada','editada','rejeitada')),
  texto_final   text,
  revisada_por  uuid references auth.users(id) on delete set null,
  revisada_em   timestamptz,
  created_at    timestamptz not null default now()
);
comment on table crm.revisoes_ia is 'Fila de revisão humana: nada da IA sai ao cliente sem passar por aqui (modo rascunho).';
create index if not exists ix_revisoes_pend on crm.revisoes_ia (created_at) where status = 'pendente';

create table if not exists crm.resumos_semanais (
  id             uuid primary key default gen_random_uuid(),
  cliente_ref    text not null,                           -- cliente no sistema jurídico
  semana_inicio  date not null,
  resumo         text not null,
  pendencias     jsonb not null default '[]'::jsonb,
  conversas_ref  text[] not null default '{}',
  status         text not null default 'rascunho' check (status in ('rascunho','publicado')),
  publicado_em   timestamptz,
  created_at     timestamptz not null default now(),
  unique (cliente_ref, semana_inicio)
);
comment on table crm.resumos_semanais is 'Resumo semanal por IA que vira andamento no dossiê (só equipe, fonte "atendimento").';

select crm.proteger('crm.agentes','gestao');
select crm.proteger('crm.regras_ia','gestao');
select crm.proteger('crm.revisoes_ia','atendimento');
select crm.proteger('crm.resumos_semanais','atendimento');
