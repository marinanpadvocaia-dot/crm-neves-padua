-- crm_0016_crm_conexao.sql
-- Parte 2 da troca da demonstração pelo banco: a aba CRM (funis, negócios, atividades, campos, relatórios).
-- As tabelas são as do crm_0004. Aqui: escrita da configuração só pelo administrador, histórico que ninguém forja,
-- criação de negócio, conclusão de atividade com data, campos personalizados e tempo médio real por etapa.
-- Idempotente. NÃO altera tabelas do sistema jurídico.

-- ---- histórico de etapas: gravado pelo próprio banco (antes, quem editava negócio podia inserir histórico à mão) ----
create or replace function crm.negocios_mudou_etapa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ord int; v_prob int; v_tipo text;
begin
  select e.ordem, e.probabilidade, e.tipo into v_ord, v_prob, v_tipo from crm.funil_etapas e where e.id = new.etapa_id;
  if tg_op = 'INSERT' then
    new.probabilidade := coalesce(new.probabilidade, v_prob);
    if v_tipo = 'aberta' then new.etapa_max_ordem := greatest(new.etapa_max_ordem, v_ord); end if;
    if v_tipo <> 'aberta' and new.fechado_em is null then new.fechado_em := now(); end if;
    return new;
  end if;
  if new.etapa_id is distinct from old.etapa_id then
    new.probabilidade := v_prob;
    if v_tipo = 'aberta' then new.etapa_max_ordem := greatest(new.etapa_max_ordem, v_ord); new.fechado_em := null; new.motivo_perda_id := null;
    else new.fechado_em := coalesce(new.fechado_em, now()); end if;
    if v_tipo = 'perdido' and new.motivo_perda_id is null then raise exception 'escolha o motivo da perda'; end if;
    insert into crm.negocio_historico (negocio_id, de_etapa_id, para_etapa_id, user_id) values (new.id, old.etapa_id, new.etapa_id, auth.uid());
  end if;
  return new;
end $$;

-- ---- atividades: data de conclusão preenchida pelo banco ------------------------------------------------------
create or replace function crm.atividades_concluir() returns trigger language plpgsql as $$
begin
  if new.concluida and (tg_op = 'INSERT' or not old.concluida) then new.concluida_em := now(); end if;
  if not new.concluida then new.concluida_em := null; end if;
  return new;
end $$;
drop trigger if exists trg_atividades_concluir on crm.atividades;
create trigger trg_atividades_concluir before insert or update on crm.atividades for each row execute function crm.atividades_concluir();
alter table crm.atividades alter column responsavel_id set default auth.uid();
alter table crm.atividades add column if not exists criado_por uuid default auth.uid() references auth.users(id) on delete set null;

-- ---- criar negócio (com as permissões de quem chama: o RLS da área comercial vale) ----------------------------
create or replace function crm.negocio_criar(p_funil text, p_nome text, p_valor numeric default 0, p_origem text default null,
                                             p_empresa text default null, p_telefone text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_f uuid; v_e uuid; v_id uuid;
begin
  if not crm.pode('comercial') then raise exception 'sem acesso à área comercial'; end if;
  p_nome := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  if p_nome = '' then raise exception 'escreva o nome do contato ou da empresa'; end if;
  select f.id into v_f from crm.funis f where f.slug = p_funil and f.ativo;
  if v_f is null then raise exception 'funil não encontrado'; end if;
  select e.id into v_e from crm.funil_etapas e where e.funil_id = v_f and e.tipo = 'aberta' order by e.ordem limit 1;
  insert into crm.negocios (funil_id, etapa_id, nome, empresa, telefone, valor, responsavel_id, origem_id)
  values (v_f, v_e, p_nome, nullif(btrim(coalesce(p_empresa, '')), ''), nullif(btrim(coalesce(p_telefone, '')), ''), greatest(coalesce(p_valor, 0), 0),
          auth.uid(), (select o.id from crm.origens o where o.nome = p_origem and o.ativa))
  returning id into v_id;
  return v_id;
end $$;

-- ---- campos personalizados (só administrador) ------------------------------------------------------------------
create or replace function crm.campo_criar(p_nome text, p_tipo text, p_opcoes text[] default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_base text; v_chave text; v_i int := 1; v_ops text[];
begin
  if not crm.eh_admin() then raise exception 'só o administrador cria campos'; end if;
  p_nome := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  if length(p_nome) < 2 or length(p_nome) > 60 then raise exception 'dê um nome ao campo (até 60 letras)'; end if;
  if p_tipo not in ('texto','numero','data','lista') then raise exception 'tipo de campo inválido'; end if;
  if exists (select 1 from crm.campos_personalizados c where lower(c.nome) = lower(p_nome)) then raise exception 'já existe um campo com esse nome'; end if;
  select array_agg(distinct btrim(o)) into v_ops from unnest(coalesce(p_opcoes, '{}')) o where btrim(o) <> '';
  if p_tipo = 'lista' and coalesce(array_length(v_ops, 1), 0) = 0 then raise exception 'informe as opções da lista, separadas por vírgula'; end if;
  v_base := btrim(regexp_replace(lower(translate(p_nome,
              'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+', '_', 'g'), '_');
  if v_base !~ '^[a-z]' then v_base := 'c_' || v_base; end if;
  v_chave := left(v_base, 40);
  while exists (select 1 from crm.campos_personalizados c where c.chave = v_chave) loop v_i := v_i + 1; v_chave := left(v_base, 36) || '_' || v_i; end loop;
  insert into crm.campos_personalizados (chave, nome, tipo, opcoes, ordem)
  values (v_chave, p_nome, p_tipo, case when p_tipo = 'lista' then v_ops end, coalesce((select max(c.ordem) + 1 from crm.campos_personalizados c), 1));
  return v_chave;
end $$;

-- Excluir o campo não apaga o que já foi preenchido nos negócios (fica guardado em negocios.campos).
create or replace function crm.campo_excluir(p_chave text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_admin() then raise exception 'só o administrador exclui campos'; end if;
  delete from crm.campos_personalizados where chave = p_chave;
  if not found then raise exception 'campo não encontrado'; end if;
end $$;

-- ---- relatório: tempo médio (dias) que os negócios ficam em cada etapa, a partir do histórico real -------------
create or replace function crm.crm_tempo_etapas(p_funil uuid)
returns table (etapa_id uuid, dias numeric, negocios int)
language sql stable security invoker set search_path = '' as $$
  with h as (
    select h.de_etapa_id as etapa, h.criado_em as fim,
           coalesce(lag(h.criado_em) over (partition by h.negocio_id order by h.criado_em, h.id), n.created_at) as inicio, h.negocio_id
    from crm.negocio_historico h join crm.negocios n on n.id = h.negocio_id
    where n.funil_id = p_funil and h.de_etapa_id is not null)
  select etapa, round((avg(extract(epoch from (fim - inicio))) / 86400.0)::numeric, 1), count(distinct negocio_id)::int
  from h group by etapa
$$;

-- ---- permissões ----------------------------------------------------------------------------------------------
-- Configuração do funil e trilhas: só leitura para a equipe (funis/etapas/origens/motivos mudam pelo SQL Editor;
-- campos pelas funções acima; histórico pelo gatilho; respostas de formulário pela integração).
revoke insert, update, delete on crm.funis, crm.funil_etapas, crm.origens, crm.motivos_perda, crm.campos_personalizados,
                                 crm.negocio_historico, crm.respostas_formulario from authenticated;
revoke all on function crm.negocio_criar(text,text,numeric,text,text,text), crm.campo_criar(text,text,text[]),
  crm.campo_excluir(text), crm.crm_tempo_etapas(uuid) from public, anon;
grant execute on function crm.negocio_criar(text,text,numeric,text,text,text), crm.campo_criar(text,text,text[]),
  crm.campo_excluir(text), crm.crm_tempo_etapas(uuid) to authenticated;
