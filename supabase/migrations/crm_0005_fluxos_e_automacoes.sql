-- crm_0005_fluxos_e_automacoes.sql
-- Fluxos de conversa (construtor em blocos) e automações "quando … então …".

create table if not exists crm.fluxos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  descricao  text,
  ativo      boolean not null default false,
  definicao  jsonb not null default '{"blocos":[]}'::jsonb,   -- blocos: mensagem, menu, pergunta, horário, coleta, transferir, encerrar
  versao     int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table crm.fluxos is 'Fluxos do construtor. A definição em JSON é validada pelo app; ativar só após o teste simulado.';
create or replace trigger trg_fluxos_upd before update on crm.fluxos for each row execute function crm.set_updated_at();

create table if not exists crm.fluxo_execucoes (
  id           uuid primary key default gen_random_uuid(),
  fluxo_id     uuid references crm.fluxos(id) on delete set null,
  conversa_ref text,
  resultado    text not null check (resultado in ('concluido','transferido','abandonado','erro')),
  passos       jsonb not null default '[]'::jsonb,
  criado_em    timestamptz not null default now()
);
create index if not exists ix_fluxo_exec on crm.fluxo_execucoes (fluxo_id, criado_em desc);

create table if not exists crm.automacoes (
  id             uuid primary key default gen_random_uuid(),
  nome           text,
  ativa          boolean not null default true,
  gatilho        text not null check (gatilho in ('nova_conversa','etiqueta','etapa','sem_resposta')),
  gatilho_valor  text,                                   -- etiqueta, nome da etapa ou minutos sem resposta
  funil_id       uuid references crm.funis(id) on delete cascade,  -- null = vale para todos os funis
  acao           text not null check (acao in ('etiqueta','transferir','resposta_rapida','mensagem','tarefa','dono','avisar')),
  acao_valor     text,
  mensagem_texto text,                                   -- usado quando acao = 'mensagem'; variáveis {nome} {empresa}
  atraso_min     int not null default 0 check (atraso_min >= 0),
  ordem          int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (acao <> 'mensagem' or length(btrim(coalesce(mensagem_texto,''))) > 0)
);
comment on table crm.automacoes is 'Regras "quando … então …". Ação mensagem: texto cadastrado, enviado na hora ou após atraso_min.';
create index if not exists ix_automacoes_gatilho on crm.automacoes (gatilho) where ativa;
create or replace trigger trg_automacoes_upd before update on crm.automacoes for each row execute function crm.set_updated_at();

create table if not exists crm.automacao_execucoes (
  id           uuid primary key default gen_random_uuid(),
  automacao_id uuid references crm.automacoes(id) on delete set null,
  alvo_tipo    text not null check (alvo_tipo in ('conversa','negocio')),
  alvo_ref     text not null,
  resultado    text not null check (resultado in ('executada','agendada','ignorada','erro')),
  detalhe      text,
  criado_em    timestamptz not null default now()
);
comment on table crm.automacao_execucoes is 'Registro de execuções (aba "Registro" em Fluxos e automações).';
create index if not exists ix_auto_exec on crm.automacao_execucoes (criado_em desc);

select crm.proteger('crm.fluxos','gestao');
select crm.proteger('crm.fluxo_execucoes','gestao');
select crm.proteger('crm.automacoes','gestao');
select crm.proteger('crm.automacao_execucoes','gestao');
