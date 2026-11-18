-- crm_0013_base_de_conhecimento.sql
-- Base de conhecimento = PROCEDIMENTOS por fila (o texto pronto fica nas respostas rápidas "/").
-- Regras:
--   * "todas_filas" aparece para todo o atendimento; os demais só para quem participa de uma das filas
--     (líderes e administradores veem tudo).
--   * Administrador cria/edita/exclui qualquer procedimento.
--   * Líder de setor (filas_config.lider_id) só os das filas que lidera; procedimento geral é só do administrador.
--   * Gravação só pelas funções crm.salvar_artigo / crm.excluir_artigo (checam permissão e guardam histórico).
--   * Excluir = desativar (fica no histórico para auditoria; só o administrador ainda enxerga).
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.

create table if not exists crm.base_artigos (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null check (length(btrim(titulo)) > 0),
  todas_filas     boolean not null default false,
  quando_usar     text,
  passos          jsonb not null default '[]'::jsonb check (jsonb_typeof(passos) = 'array'),
  cuidados        text,
  quando_escalar  text,
  resposta_rapida text check (resposta_rapida is null or resposta_rapida ~ '^/[a-z0-9]{1,20}$'),  -- atalho, ex.: /dados
  ativo           boolean not null default true,
  versao          int not null default 1,
  criado_por      uuid default auth.uid() references auth.users(id) on delete set null,
  atualizado_por  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table crm.base_artigos is 'Procedimentos da aba Base. Texto pronto fica nas respostas rápidas; aqui só o atalho relacionado.';
create or replace trigger trg_base_artigos_upd before update on crm.base_artigos for each row execute function crm.set_updated_at();

create table if not exists crm.base_artigo_filas (
  artigo_id uuid not null references crm.base_artigos(id) on delete cascade,
  fila_ref  text not null references crm.filas_config(fila_ref) on delete cascade,
  primary key (artigo_id, fila_ref)
);
comment on table crm.base_artigo_filas is 'Em quais filas o procedimento aparece (vazio só quando todas_filas = true).';
create index if not exists ix_base_artigo_filas_fila on crm.base_artigo_filas (fila_ref);

create table if not exists crm.base_artigo_historico (
  id        bigint generated always as identity primary key,
  artigo_id uuid not null references crm.base_artigos(id) on delete cascade,
  versao    int not null,
  acao      text not null check (acao in ('criado','alterado','excluido')),
  dados     jsonb not null,           -- fotografia do procedimento nesta versão (título, filas, passos…)
  user_id   uuid,
  criado_em timestamptz not null default now()
);
comment on table crm.base_artigo_historico is 'Quem criou, alterou ou excluiu cada procedimento, e como ele estava.';
create index if not exists ix_base_hist on crm.base_artigo_historico (artigo_id, criado_em);

-- Pode gravar um procedimento com este alcance?
create or replace function crm.pode_editar_base(p_todas boolean, p_filas text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select crm.eh_admin() or (
    crm.eh_lider() and not coalesce(p_todas, false) and coalesce(cardinality(p_filas), 0) > 0
    and not exists (select 1 from unnest(p_filas) f(fila)
                    where f.fila not in (select c.fila_ref from crm.filas_config c where c.lider_id = auth.uid())))
$$;

-- O procedimento aparece para o usuário atual?
create or replace function crm.artigo_visivel(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from crm.base_artigos a
    where a.id = p_id and crm.pode('atendimento')
      and (crm.eh_admin()
           or (a.ativo and (a.todas_filas or crm.eh_lider()
               or exists (select 1 from crm.base_artigo_filas af join crm.fila_membros m on m.fila_ref = af.fila_ref
                          where af.artigo_id = a.id and m.user_id = auth.uid())))))
$$;

-- Cria (p_id nulo) ou altera. Devolve o id.
create or replace function crm.salvar_artigo(
  p_id uuid, p_titulo text, p_todas_filas boolean, p_filas text[],
  p_quando_usar text default null, p_passos jsonb default '[]'::jsonb, p_cuidados text default null,
  p_quando_escalar text default null, p_resposta_rapida text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id; v_versao int; v_antes_todas boolean; v_antes_filas text[];
  v_filas text[] := case when p_todas_filas then '{}'::text[] else (select coalesce(array_agg(distinct f), '{}') from unnest(p_filas) f where f is not null) end;
  v_passos jsonb := (select coalesce(jsonb_agg(btrim(x)), '[]'::jsonb) from jsonb_array_elements_text(coalesce(p_passos, '[]'::jsonb)) x where btrim(x) <> '');
begin
  if not p_todas_filas and cardinality(v_filas) = 0 then
    raise exception 'escolha ao menos uma fila ou marque "todas as filas"' using errcode = '22023';
  end if;
  if not crm.pode_editar_base(p_todas_filas, v_filas) then
    raise exception 'sem permissão para gravar procedimento nestas filas' using errcode = '42501';
  end if;
  if v_id is null then
    insert into crm.base_artigos (titulo, todas_filas, quando_usar, passos, cuidados, quando_escalar, resposta_rapida)
    values (btrim(p_titulo), p_todas_filas, nullif(btrim(p_quando_usar), ''), v_passos, nullif(btrim(p_cuidados), ''),
            nullif(btrim(p_quando_escalar), ''), nullif(btrim(p_resposta_rapida), ''))
    returning id, versao into v_id, v_versao;
  else
    select a.todas_filas, coalesce((select array_agg(af.fila_ref) from crm.base_artigo_filas af where af.artigo_id = a.id), '{}')
      into v_antes_todas, v_antes_filas from crm.base_artigos a where a.id = v_id and a.ativo for update;
    if not found then raise exception 'procedimento não encontrado' using errcode = 'P0002'; end if;
    -- líder não pode "tomar" um procedimento de outro setor nem um geral
    if not crm.pode_editar_base(v_antes_todas, v_antes_filas) then
      raise exception 'sem permissão para alterar este procedimento' using errcode = '42501';
    end if;
    update crm.base_artigos set titulo = btrim(p_titulo), todas_filas = p_todas_filas, quando_usar = nullif(btrim(p_quando_usar), ''),
           passos = v_passos, cuidados = nullif(btrim(p_cuidados), ''), quando_escalar = nullif(btrim(p_quando_escalar), ''),
           resposta_rapida = nullif(btrim(p_resposta_rapida), ''), versao = versao + 1, atualizado_por = auth.uid()
     where id = v_id returning versao into v_versao;
    delete from crm.base_artigo_filas where artigo_id = v_id;
  end if;
  insert into crm.base_artigo_filas (artigo_id, fila_ref) select v_id, f from unnest(v_filas) f;
  insert into crm.base_artigo_historico (artigo_id, versao, acao, dados, user_id)
  select v_id, v_versao, case when p_id is null then 'criado' else 'alterado' end,
         to_jsonb(a) || jsonb_build_object('filas', to_jsonb(v_filas)), auth.uid()
    from crm.base_artigos a where a.id = v_id;
  return v_id;
end $$;

create or replace function crm.excluir_artigo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_todas boolean; v_filas text[];
begin
  select a.todas_filas, coalesce((select array_agg(af.fila_ref) from crm.base_artigo_filas af where af.artigo_id = a.id), '{}')
    into v_todas, v_filas from crm.base_artigos a where a.id = p_id and a.ativo for update;
  if not found then raise exception 'procedimento não encontrado' using errcode = 'P0002'; end if;
  if not crm.pode_editar_base(v_todas, v_filas) then
    raise exception 'sem permissão para excluir este procedimento' using errcode = '42501';
  end if;
  update crm.base_artigos set ativo = false, versao = versao + 1, atualizado_por = auth.uid() where id = p_id;
  insert into crm.base_artigo_historico (artigo_id, versao, acao, dados, user_id)
  select p_id, a.versao, 'excluido', to_jsonb(a) || jsonb_build_object('filas', to_jsonb(v_filas)), auth.uid()
    from crm.base_artigos a where a.id = p_id;
end $$;

-- Acesso: leitura conforme a fila; gravação só pelas funções acima.
alter table crm.base_artigos enable row level security;
alter table crm.base_artigo_filas enable row level security;
alter table crm.base_artigo_historico enable row level security;
revoke all on crm.base_artigos, crm.base_artigo_filas, crm.base_artigo_historico from anon, authenticated;
grant select on crm.base_artigos, crm.base_artigo_filas, crm.base_artigo_historico to authenticated;
drop policy if exists p_base_sel on crm.base_artigos;
drop policy if exists p_base_filas_sel on crm.base_artigo_filas;
drop policy if exists p_base_hist_sel on crm.base_artigo_historico;
create policy p_base_sel on crm.base_artigos for select to authenticated using (crm.artigo_visivel(id));
create policy p_base_filas_sel on crm.base_artigo_filas for select to authenticated using (crm.artigo_visivel(artigo_id));
create policy p_base_hist_sel on crm.base_artigo_historico for select to authenticated using ((select crm.eh_lider()));

revoke all on function crm.pode_editar_base(boolean, text[]), crm.artigo_visivel(uuid),
  crm.salvar_artigo(uuid, text, boolean, text[], text, jsonb, text, text, text), crm.excluir_artigo(uuid) from public, anon;
grant execute on function crm.pode_editar_base(boolean, text[]), crm.artigo_visivel(uuid),
  crm.salvar_artigo(uuid, text, boolean, text[], text, jsonb, text, text, text), crm.excluir_artigo(uuid) to authenticated;
