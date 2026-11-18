-- crm_0018_fluxos_de_trabalho.sql
-- Parte 3a: "Fluxos e automações" viram uma coisa só: FLUXOS DE TRABALHO (como no GCV).
-- Cada fluxo tem acionadores (gatilhos) e uma sequência de ações com caminhos (se/senão, menu, horário, aguardar resposta).
-- Lista com pastas, rascunho/publicado, versões publicadas (o que roda é a versão publicada; editar não mexe nela)
-- e lixeira (Apagado). A definição é o JSON do construtor: {"gatilhos":[...],"passos":[...]} (catálogo em
-- supabase/functions/_shared/fluxos-catalogo.json). O motor que executa os fluxos no servidor é a parte 3b.
-- crm.automacoes (crm_0005) fica obsoleta: as regras "quando… então…" agora são fluxos de um passo.
-- Idempotente. NÃO altera tabelas do sistema jurídico.

create table if not exists crm.fluxo_pastas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (length(btrim(nome)) between 1 and 60),
  criada_em timestamptz not null default now()
);
create unique index if not exists ux_fluxo_pastas_nome on crm.fluxo_pastas (lower(nome));

alter table crm.fluxos add column if not exists pasta_id          uuid references crm.fluxo_pastas(id) on delete set null;
alter table crm.fluxos add column if not exists status            text not null default 'rascunho';
alter table crm.fluxos add column if not exists configuracoes     jsonb not null default '{}'::jsonb;
alter table crm.fluxos add column if not exists criado_por        uuid default auth.uid() references auth.users(id) on delete set null;
alter table crm.fluxos add column if not exists atualizado_por    uuid references auth.users(id) on delete set null;
alter table crm.fluxos add column if not exists publicado_em      timestamptz;
alter table crm.fluxos add column if not exists publicado_por     uuid references auth.users(id) on delete set null;
alter table crm.fluxos add column if not exists versao_publicada  int;
alter table crm.fluxos add column if not exists excluido_em       timestamptz;
alter table crm.fluxos alter column definicao set default '{"gatilhos":[],"passos":[]}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fluxos_status_check') then
    alter table crm.fluxos add constraint fluxos_status_check check (status in ('rascunho','publicado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fluxos_definicao_check') then
    alter table crm.fluxos add constraint fluxos_definicao_check check (
      jsonb_typeof(definicao) = 'object' and pg_column_size(definicao) < 300000);
  end if;
end $$;
comment on table crm.fluxos is 'Fluxos de trabalho (construtor visual). definicao = rascunho em edição; o que roda é a versão publicada (crm.fluxo_versoes).';
comment on table crm.automacoes is 'OBSOLETA desde crm_0018: as automações agora são fluxos de trabalho (crm.fluxos).';

create table if not exists crm.fluxo_versoes (
  fluxo_id      uuid not null references crm.fluxos(id) on delete cascade,
  versao        int not null,
  definicao     jsonb not null,
  configuracoes jsonb not null default '{}'::jsonb,
  publicado_por uuid references auth.users(id) on delete set null,
  publicado_em  timestamptz not null default now(),
  primary key (fluxo_id, versao)
);
comment on table crm.fluxo_versoes is 'Cada publicação guarda uma cópia. O motor (parte 3b) executa a versão publicada mais recente.';

-- ---- funções (líder ou administrador) ----------------------------------------------------------------------
create or replace function crm.fluxo_conferir_definicao(p jsonb) returns void language plpgsql immutable as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' or coalesce(jsonb_typeof(p->'gatilhos'), '') <> 'array' or coalesce(jsonb_typeof(p->'passos'), '') <> 'array' then
    raise exception 'definição do fluxo inválida'; end if;
  if pg_column_size(p) >= 300000 then raise exception 'fluxo grande demais'; end if;
end $$;

create or replace function crm.fluxo_salvar(p_id uuid, p_nome text, p_definicao jsonb, p_configuracoes jsonb default '{}'::jsonb,
                                            p_descricao text default null, p_pasta uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores editam fluxos'; end if;
  p_nome := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  if p_nome = '' or length(p_nome) > 80 then raise exception 'dê um nome ao fluxo (até 80 letras)'; end if;
  perform crm.fluxo_conferir_definicao(p_definicao);
  if p_pasta is not null and not exists (select 1 from crm.fluxo_pastas where id = p_pasta) then raise exception 'pasta não encontrada'; end if;
  if p_id is null then
    insert into crm.fluxos (nome, descricao, definicao, configuracoes, pasta_id, status, ativo, atualizado_por)
    values (p_nome, nullif(btrim(coalesce(p_descricao, '')), ''), p_definicao, coalesce(p_configuracoes, '{}'), p_pasta, 'rascunho', false, auth.uid())
    returning id into v_id;
  else
    update crm.fluxos set nome = p_nome, descricao = nullif(btrim(coalesce(p_descricao, '')), ''), definicao = p_definicao,
           configuracoes = coalesce(p_configuracoes, '{}'), pasta_id = p_pasta, versao = versao + 1, atualizado_por = auth.uid()
     where id = p_id and excluido_em is null returning id into v_id;
    if v_id is null then raise exception 'fluxo não encontrado (ou está na lixeira)'; end if;
  end if;
  return v_id;
end $$;

-- Publicar copia o rascunho para uma versão nova; despublicar para de inscrever contatos (quem já está segue até o fim na 3b).
create or replace function crm.fluxo_publicar(p_id uuid, p_publicar boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare f crm.fluxos%rowtype; v int;
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores publicam fluxos'; end if;
  select * into f from crm.fluxos where id = p_id and excluido_em is null for update;
  if not found then raise exception 'fluxo não encontrado'; end if;
  if not coalesce(p_publicar, false) then
    update crm.fluxos set status = 'rascunho', ativo = false where id = p_id; return f.versao_publicada; end if;
  if jsonb_array_length(f.definicao->'gatilhos') = 0 then raise exception 'adicione um acionador antes de publicar'; end if;
  if jsonb_array_length(f.definicao->'passos') = 0 then raise exception 'adicione ao menos uma ação antes de publicar'; end if;
  v := coalesce(f.versao_publicada, 0) + 1;
  insert into crm.fluxo_versoes (fluxo_id, versao, definicao, configuracoes, publicado_por) values (p_id, v, f.definicao, f.configuracoes, auth.uid());
  update crm.fluxos set status = 'publicado', ativo = true, versao_publicada = v, publicado_em = now(), publicado_por = auth.uid() where id = p_id;
  return v;
end $$;

create or replace function crm.fluxo_excluir(p_id uuid, p_excluir boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores apagam fluxos'; end if;
  if coalesce(p_excluir, true) then
    update crm.fluxos set excluido_em = now(), status = 'rascunho', ativo = false where id = p_id and excluido_em is null;
  else
    update crm.fluxos set excluido_em = null where id = p_id and excluido_em is not null;
  end if;
  if not found then raise exception 'fluxo não encontrado'; end if;
end $$;

create or replace function crm.fluxo_duplicar(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores duplicam fluxos'; end if;
  insert into crm.fluxos (nome, descricao, definicao, configuracoes, pasta_id, status, ativo, atualizado_por)
  select left(nome || ' (cópia)', 80), descricao, definicao, configuracoes, pasta_id, 'rascunho', false, auth.uid() from crm.fluxos where id = p_id
  returning id into v;
  if v is null then raise exception 'fluxo não encontrado'; end if;
  return v;
end $$;

create or replace function crm.fluxo_pasta_criar(p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores criam pastas'; end if;
  p_nome := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  if p_nome = '' or length(p_nome) > 60 then raise exception 'dê um nome à pasta (até 60 letras)'; end if;
  if exists (select 1 from crm.fluxo_pastas where lower(nome) = lower(p_nome)) then raise exception 'já existe uma pasta com esse nome'; end if;
  insert into crm.fluxo_pastas (nome) values (p_nome) returning id into v;
  return v;
end $$;

create or replace function crm.fluxo_mover(p_id uuid, p_pasta uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores organizam fluxos'; end if;
  if p_pasta is not null and not exists (select 1 from crm.fluxo_pastas where id = p_pasta) then raise exception 'pasta não encontrada'; end if;
  update crm.fluxos set pasta_id = p_pasta where id = p_id;
  if not found then raise exception 'fluxo não encontrado'; end if;
end $$;

-- ---- permissões -----------------------------------------------------------------------------------------------
select crm.proteger('crm.fluxo_pastas', 'gestao');
select crm.proteger('crm.fluxo_versoes', 'gestao');
revoke insert, update, delete on crm.fluxos, crm.fluxo_versoes, crm.fluxo_pastas, crm.automacoes from authenticated;
revoke all on function crm.fluxo_salvar(uuid,text,jsonb,jsonb,text,uuid), crm.fluxo_publicar(uuid,boolean), crm.fluxo_excluir(uuid,boolean),
  crm.fluxo_duplicar(uuid), crm.fluxo_pasta_criar(text), crm.fluxo_mover(uuid,uuid) from public, anon;
grant execute on function crm.fluxo_salvar(uuid,text,jsonb,jsonb,text,uuid), crm.fluxo_publicar(uuid,boolean), crm.fluxo_excluir(uuid,boolean),
  crm.fluxo_duplicar(uuid), crm.fluxo_pasta_criar(text), crm.fluxo_mover(uuid,uuid), crm.fluxo_conferir_definicao(jsonb) to authenticated;
