-- crm_0017_tarefas.sql
-- Tarefas sobre o contato, criadas na conversa. Cada tarefa tem UM responsável, que é o único que a vê
-- (nem o administrador vê as tarefas dos outros). Só recebem tarefas, e só veem a aba Tarefas,
-- os administradores e quem participa da fila Comercial (código da fila em crm.config 'tarefas').
-- Qualquer pessoa do atendimento ou do comercial pode criar uma tarefa para eles.
-- Idempotente. NÃO altera tabelas do sistema jurídico.

create table if not exists crm.tarefas (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null check (length(btrim(titulo)) between 1 and 200),
  descricao        text check (descricao is null or length(descricao) <= 2000),
  quando           timestamptz not null,                       -- prazo
  responsavel_id   uuid not null references auth.users(id) on delete cascade,
  criado_por       uuid default auth.uid() references auth.users(id) on delete set null,
  conversa_ref     text,                                        -- conversa de onde saiu (atd_conversas, passo 2)
  contato_nome     text,
  contato_telefone text,
  negocio_id       uuid references crm.negocios(id) on delete set null,
  concluida        boolean not null default false,
  concluida_em     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table crm.tarefas is 'Tarefas sobre o contato (criadas na conversa). Individuais: só o responsável vê.';
create index if not exists ix_tarefas_resp on crm.tarefas (responsavel_id, concluida, quando);
create or replace trigger trg_tarefas_upd before update on crm.tarefas for each row execute function crm.set_updated_at();

-- fila cujo time recebe tarefas (na produção, o código da fila Comercial do sistema jurídico)
insert into crm.config (chave, valor) values ('tarefas', '{"fila":"comercial"}') on conflict (chave) do nothing;

-- quem pode receber (e ver) tarefas: administrador ou quem participa da fila Comercial
create or replace function crm.pode_receber_tarefa(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from crm.perfis p where p.user_id = p_user and p.ativo)
     and (crm.tipo_acesso(p_user) = 'admin'
          or exists (select 1 from crm.fila_membros m where m.user_id = p_user
                     and m.fila_ref = coalesce((select c.valor->>'fila' from crm.config c where c.chave = 'tarefas'), 'comercial')))
$$;
create or replace function crm.ve_tarefas() returns boolean
language sql stable security definer set search_path = '' as $$
  select crm.sessao_valida() and crm.pode_receber_tarefa(auth.uid())
$$;

alter table crm.tarefas enable row level security;
revoke all on crm.tarefas from anon, authenticated;
grant select on crm.tarefas to authenticated;
drop policy if exists p_tarefas_sel on crm.tarefas;
create policy p_tarefas_sel on crm.tarefas for select to authenticated using (responsavel_id = auth.uid() and crm.ve_tarefas());

create or replace function crm.tarefa_criar(p_titulo text, p_quando timestamptz, p_responsavel uuid default null, p_descricao text default null,
                                            p_conversa_ref text default null, p_contato_nome text default null,
                                            p_contato_telefone text default null, p_negocio uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_resp uuid := coalesce(p_responsavel, auth.uid()); v_id uuid;
begin
  if not (crm.pode('atendimento') or crm.pode('comercial')) then raise exception 'sem acesso para criar tarefas'; end if;
  p_titulo := regexp_replace(btrim(coalesce(p_titulo, '')), '\s+', ' ', 'g');
  if p_titulo = '' then raise exception 'escreva o que precisa ser feito'; end if;
  if p_quando is null then raise exception 'escolha o prazo da tarefa'; end if;
  if not crm.pode_receber_tarefa(v_resp) then
    raise exception 'a tarefa só pode ir para um administrador ou para quem está na fila Comercial'; end if;
  insert into crm.tarefas (titulo, descricao, quando, responsavel_id, conversa_ref, contato_nome, contato_telefone, negocio_id)
  values (left(p_titulo, 200), nullif(btrim(coalesce(p_descricao, '')), ''), p_quando, v_resp, p_conversa_ref,
          nullif(btrim(coalesce(p_contato_nome, '')), ''), nullif(btrim(coalesce(p_contato_telefone, '')), ''), p_negocio)
  returning id into v_id;
  return v_id;
end $$;

-- concluir, reabrir, mudar o prazo e excluir: só o responsável
create or replace function crm.tarefa_concluir(p_id uuid, p_feita boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.ve_tarefas() then raise exception 'sem acesso às tarefas'; end if;
  update crm.tarefas set concluida = coalesce(p_feita, true), concluida_em = case when coalesce(p_feita, true) then now() end
   where id = p_id and responsavel_id = auth.uid();
  if not found then raise exception 'tarefa não encontrada'; end if;
end $$;

create or replace function crm.tarefa_adiar(p_id uuid, p_quando timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.ve_tarefas() then raise exception 'sem acesso às tarefas'; end if;
  if p_quando is null then raise exception 'escolha o novo prazo'; end if;
  update crm.tarefas set quando = p_quando where id = p_id and responsavel_id = auth.uid();
  if not found then raise exception 'tarefa não encontrada'; end if;
end $$;

create or replace function crm.tarefa_excluir(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.ve_tarefas() then raise exception 'sem acesso às tarefas'; end if;
  delete from crm.tarefas where id = p_id and responsavel_id = auth.uid();
  if not found then raise exception 'tarefa não encontrada'; end if;
end $$;

revoke all on function crm.pode_receber_tarefa(uuid), crm.ve_tarefas(),
  crm.tarefa_criar(text,timestamptz,uuid,text,text,text,text,uuid), crm.tarefa_concluir(uuid,boolean),
  crm.tarefa_adiar(uuid,timestamptz), crm.tarefa_excluir(uuid) from public, anon;
grant execute on function crm.pode_receber_tarefa(uuid), crm.ve_tarefas(),
  crm.tarefa_criar(text,timestamptz,uuid,text,text,text,text,uuid), crm.tarefa_concluir(uuid,boolean),
  crm.tarefa_adiar(uuid,timestamptz), crm.tarefa_excluir(uuid) to authenticated;
