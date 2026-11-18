-- crm_0003_atendimento.sql
-- Atendimento: registro por conversa (fila, responsável, status), configuração das filas, rodízio, mensagens agendadas.
-- Sem sistema de ticket (sem número, prioridade ou categoria): o atendimento é a própria conversa.
-- As conversas e mensagens continuam nas tabelas atd_* (migração 0079). Aqui ficam só referências
-- frouxas (*_ref, tipo text, sem FK) até o crm_0000 confirmar os tipos de id das tabelas existentes.

create table if not exists crm.filas_config (
  fila_ref        text primary key,                       -- id da fila em atd_filas
  nome            text not null,
  dias            text not null default 'Seg–Sex' check (dias in ('Seg–Sex','Seg–Sáb','Todos os dias')),
  abre            time not null default '08:00',
  fecha           time not null default '18:00',
  sla_primeira_min int not null default 60 check (sla_primeira_min > 0),
  sla_retorno_min  int not null default 120 check (sla_retorno_min > 0),
  lider_id        uuid references auth.users(id) on delete set null,
  rodizio_ativo   boolean not null default false,
  rodizio_proximo int not null default 0,
  updated_at      timestamptz not null default now()
);
comment on table crm.filas_config is 'Horário, prazos (SLA), líder e rodízio de cada fila/setor.';
create or replace trigger trg_filas_config_upd before update on crm.filas_config for each row execute function crm.set_updated_at();

create table if not exists crm.fila_membros (
  fila_ref text not null references crm.filas_config(fila_ref) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  ordem    int not null default 0,
  primary key (fila_ref, user_id)
);
comment on table crm.fila_membros is 'Quem participa de cada fila; a ordem define a sequência do rodízio.';

create table if not exists crm.atendimentos (
  id                 uuid primary key default gen_random_uuid(),
  conversa_ref       text unique,                         -- id em atd_conversas
  canal              text not null default 'whatsapp' check (canal in ('whatsapp','instagram','google')),
  protocolo          text,
  fila_ref           text references crm.filas_config(fila_ref) on delete set null,
  responsavel_id     uuid references auth.users(id) on delete set null,
  status             text not null default 'aguardando' check (status in ('aguardando','em_atendimento','resolvido')),
  aguardando_cliente boolean not null default false,       -- pausa o SLA
  primeira_resposta_em timestamptz,
  resolvido_em       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table crm.atendimentos is 'Um registro por conversa: fila, responsável, status e prazos. Sem número de ticket, prioridade ou categoria.';
create index if not exists ix_atendimentos_fila_status on crm.atendimentos (fila_ref, status);
create index if not exists ix_atendimentos_resp on crm.atendimentos (responsavel_id) where status <> 'resolvido';
create or replace trigger trg_atendimentos_upd before update on crm.atendimentos for each row execute function crm.set_updated_at();

create table if not exists crm.atendimento_historico (
  id             bigint generated always as identity primary key,
  atendimento_id uuid not null references crm.atendimentos(id) on delete cascade,
  campo          text not null,
  de             text,
  para           text,
  user_id        uuid,
  criado_em      timestamptz not null default now()
);
comment on table crm.atendimento_historico is 'Trilha de mudanças do atendimento (status, fila, responsável).';
create index if not exists ix_atendimento_hist on crm.atendimento_historico (atendimento_id, criado_em);

create or replace function crm.atendimentos_auditar() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
     insert into crm.atendimento_historico(atendimento_id,campo,de,para,user_id) values (new.id,'status',old.status,new.status,auth.uid());
     if new.status = 'resolvido' and new.resolvido_em is null then new.resolvido_em := now(); end if;
     if new.status <> 'resolvido' then new.resolvido_em := null; end if; end if;
  if new.fila_ref is distinct from old.fila_ref then insert into crm.atendimento_historico(atendimento_id,campo,de,para,user_id) values (new.id,'fila',old.fila_ref,new.fila_ref,auth.uid()); end if;
  if new.responsavel_id is distinct from old.responsavel_id then insert into crm.atendimento_historico(atendimento_id,campo,de,para,user_id) values (new.id,'responsavel',old.responsavel_id::text,new.responsavel_id::text,auth.uid()); end if;
  return new;
end $$;
drop trigger if exists trg_atendimentos_auditar on crm.atendimentos;
create or replace trigger trg_atendimentos_auditar before update on crm.atendimentos for each row execute function crm.atendimentos_auditar();

-- Rodízio: devolve o próximo atendente da fila (ou null) e avança o ponteiro, de forma atômica.
create or replace function crm.atribuir_rodizio(p_fila text) returns uuid
language plpgsql as $$
declare v_cfg crm.filas_config%rowtype; v_n int; v_user uuid;
begin
  select * into v_cfg from crm.filas_config where fila_ref = p_fila for update;
  if not found or not v_cfg.rodizio_ativo then return null; end if;
  select count(*) into v_n from crm.fila_membros where fila_ref = p_fila;
  if v_n = 0 then return null; end if;
  select user_id into v_user from crm.fila_membros where fila_ref = p_fila
    order by ordem, user_id offset (v_cfg.rodizio_proximo % v_n) limit 1;
  update crm.filas_config set rodizio_proximo = (v_cfg.rodizio_proximo + 1) % v_n where fila_ref = p_fila;
  return v_user;
end $$;
grant execute on function crm.atribuir_rodizio(text) to authenticated;

create table if not exists crm.mensagens_agendadas (
  id           uuid primary key default gen_random_uuid(),
  atendimento_id uuid references crm.atendimentos(id) on delete cascade,
  conversa_ref text,
  texto        text not null check (length(btrim(texto)) > 0),
  enviar_em    timestamptz not null,
  status       text not null default 'agendada' check (status in ('agendada','enviada','cancelada','falhou')),
  origem       text not null default 'manual' check (origem in ('manual','automacao')),
  criada_por   uuid references auth.users(id) on delete set null,
  tentativas   int not null default 0,
  erro         text,
  enviada_em   timestamptz,
  created_at   timestamptz not null default now(),
  check (atendimento_id is not null or conversa_ref is not null)
);
comment on table crm.mensagens_agendadas is 'Mensagens agendadas na própria conversa (botão do relógio) ou criadas por automação com atraso.';
create index if not exists ix_msg_agendadas_fila on crm.mensagens_agendadas (enviar_em) where status = 'agendada';

create table if not exists crm.config (
  chave      text primary key,
  valor      jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table crm.config is 'Configurações pequenas (ex.: mensagem de ausência {on,text}). Sem segredos: segredos ficam no Vault.';
create or replace trigger trg_config_upd before update on crm.config for each row execute function crm.set_updated_at();

select crm.proteger('crm.filas_config','atendimento');
select crm.proteger('crm.fila_membros','atendimento');
select crm.proteger('crm.atendimentos','atendimento');
select crm.proteger('crm.atendimento_historico','atendimento');
select crm.proteger('crm.mensagens_agendadas','atendimento');
select crm.proteger('crm.config','atendimento');
