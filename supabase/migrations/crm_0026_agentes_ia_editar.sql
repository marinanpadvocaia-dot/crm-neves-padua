-- crm_0026_agentes_ia_editar.sql
-- Agentes de IA editáveis pela tela (pedido de 18/11/2026). Tudo só pelo ADMINISTRADOR:
--   * criar e editar agentes (nome, canal, tipos de mensagem, instruções, o que responde, quando transfere,
--     captação, base, registro, modelo de IA e limite diário). Agente novo nasce desligado e em rascunho.
--   * "excluir" = ARQUIVAR: desliga, some da lista e guarda o histórico; o administrador restaura.
--   * um agente LIGADO por tipo de mensagem (Instagram directs, Instagram comentários, Google avaliações).
--   * regras: criar, editar, validar e desativar. Regra nova ou editada só vale depois de validada.
--     Editar uma regra validada cria uma nova versão; a antiga continua valendo até a nova ser validada
--     (nunca fica um intervalo sem a regra). O próprio administrador valida (decisão de 18/11/2026).
--   * cada mudança fica em crm.agentes_historico (quem, quando, o que mudou e os valores anteriores).
-- Ligar/desligar continua com líder ou administrador (crm.agente_ativar); o modo continua só pelo administrador.
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.

-- ---- agentes: tipos de mensagem, arquivamento, autoria ------------------------------------------
create or replace function crm.agente_tipos_do_canal(p_canal text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_canal when 'instagram' then array['mensagem','comentario'] when 'google' then array['avaliacao'] else array['mensagem'] end
$$;
create or replace function crm.agente_tipos_rotulo(p_tipos text[]) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(case t when 'mensagem' then 'directs' when 'comentario' then 'comentários' when 'avaliacao' then 'avaliações' else t end,
                             ' e ' order by array_position(array['mensagem','comentario','avaliacao'], t)), '')
    from unnest(p_tipos) t
$$;

alter table crm.agentes add column if not exists tipos         text[];
alter table crm.agentes add column if not exists arquivado_em  timestamptz;
alter table crm.agentes add column if not exists arquivado_por uuid references auth.users(id) on delete set null;
alter table crm.agentes add column if not exists criado_por    uuid references auth.users(id) on delete set null;
alter table crm.agentes add column if not exists created_at    timestamptz not null default now();
update crm.agentes set tipos = crm.agente_tipos_do_canal(canal) where tipos is null or cardinality(tipos) = 0;
alter table crm.agentes alter column tipos set not null;
comment on column crm.agentes.tipos is 'Tipos de mensagem que o agente responde (mensagem = direct, comentario, avaliacao). Só um agente ligado por tipo e canal.';

-- Quem insere sem dizer os tipos (as sementes da crm_0014, ao reaplicar) recebe os tipos do canal.
create or replace function crm.agentes_tipos_padrao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tipos is null or cardinality(new.tipos) = 0 then new.tipos := crm.agente_tipos_do_canal(new.canal); end if;
  return new;
end $$;
drop trigger if exists trg_agentes_tipos on crm.agentes;
create trigger trg_agentes_tipos before insert on crm.agentes for each row execute function crm.agentes_tipos_padrao();

alter table crm.agentes drop constraint if exists agentes_tipos_check;
alter table crm.agentes add constraint agentes_tipos_check check (cardinality(tipos) > 0 and tipos <@ crm.agente_tipos_do_canal(canal));
alter table crm.agentes drop constraint if exists agentes_arquivado_desligado;
alter table crm.agentes add constraint agentes_arquivado_desligado check (arquivado_em is null or not ativo);

alter table crm.agentes_historico drop constraint if exists agentes_historico_campo_check;
alter table crm.agentes_historico add constraint agentes_historico_campo_check
  check (campo in ('ativo','modo','configuracao','criado','arquivado','restaurado'));
alter table crm.agentes_historico add column if not exists antes jsonb;   -- valores anteriores do que mudou

-- ---- regras: versões e desativação --------------------------------------------------------------
alter table crm.regras_ia add column if not exists substitui_id       uuid references crm.regras_ia(id) on delete set null;
alter table crm.regras_ia add column if not exists criada_por         uuid references auth.users(id) on delete set null;
alter table crm.regras_ia add column if not exists desativada_em      timestamptz;
alter table crm.regras_ia add column if not exists desativada_por     uuid references auth.users(id) on delete set null;
alter table crm.regras_ia add column if not exists motivo_desativacao text;
comment on column crm.regras_ia.substitui_id is 'Nova versão de uma regra validada. A antiga segue valendo até esta ser validada.';

-- ---- a função de IA pega o agente ligado do TIPO da mensagem -----------------------------------
create or replace function crm.ia_eventos_para_processar(p_limite int default 20)
returns table (evento_id bigint, canal_id uuid, canal_tipo text, tipo text, payload jsonb, ocorrido_em timestamptz, agente_id uuid)
language sql stable as $$
  select e.id, c.id, c.tipo, e.tipo, e.payload, coalesce(e.ocorrido_em, e.recebido_em), a.id
  from crm.webhook_eventos e
  join crm.canais c on c.id = e.canal_id and c.ativo
  join lateral (select ag.* from crm.agentes ag
                 where ag.canal = c.tipo and ag.ativo and ag.arquivado_em is null and e.tipo = any (ag.tipos)
                 order by ag.slug limit 1) a on true
  where e.tipo in ('mensagem','comentario','avaliacao')
    and coalesce(e.ocorrido_em, e.recebido_em) > now() - interval '24 hours'
    and not exists (select 1 from crm.revisoes_ia r where r.webhook_evento_id = e.id)
    and (select count(*) from crm.revisoes_ia r
          where r.agente_id = a.id and r.status <> 'ignorada'
            and r.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) < a.limite_diario
  order by coalesce(e.ocorrido_em, e.recebido_em), e.id
  limit p_limite
$$;

-- Outro agente ligado que já responde a algum dos tipos (null = nenhum).
create or replace function crm.agente_conflito(p_id uuid, p_canal text, p_tipos text[]) returns text
language sql stable set search_path = '' as $$
  select format('o agente “%s” já responde %s deste canal: desligue-o antes', x.nome,
                crm.agente_tipos_rotulo(array(select unnest(x.tipos) intersect select unnest(p_tipos))))
    from crm.agentes x
   where x.id is distinct from p_id and x.ativo and x.canal = p_canal and x.tipos && p_tipos
   order by x.nome limit 1
$$;

-- Ligar/desligar (líder ou administrador): agora recusa agente arquivado e dois agentes ligados no mesmo tipo.
create or replace function crm.agente_ativar(p_id uuid, p_ativo boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a crm.agentes%rowtype; v_conf text;
begin
  if not (crm.pode('gestao') and crm.eh_lider()) then raise exception 'só líder ou administrador liga e desliga agentes' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('crm.agentes.ligados'));
  select * into a from crm.agentes where id = p_id for update;
  if not found then raise exception 'agente não encontrado'; end if;
  if p_ativo then
    if a.arquivado_em is not null then raise exception 'agente arquivado: restaure antes de ligar'; end if;
    if not exists (select 1 from crm.regras_ia where ativa and validada_em is not null and (agente_id is null or agente_id = p_id)) then
      raise exception 'nenhuma regra validada: valide as regras antes de ligar o agente';
    end if;
    if not exists (select 1 from crm.canais where tipo = a.canal and ativo) then
      raise exception 'nenhum canal % ativo: conecte o canal antes de ligar o agente', a.canal;
    end if;
    if a.requer_vinculo and not exists (select 1 from crm.config where chave = 'vinculo_juridico') then
      raise exception 'este agente consulta dados de clientes e só liga depois do vínculo com o sistema jurídico (passo 2)';
    end if;
    v_conf := crm.agente_conflito(p_id, a.canal, a.tipos);
    if v_conf is not null then raise exception '%', v_conf; end if;
  end if;
  perform set_config('crm.motivo', coalesce(p_motivo, ''), true);
  update crm.agentes set ativo = p_ativo where id = p_id;
end $$;

-- ---- criar e editar agente (só administrador) ---------------------------------------------------
-- p_id null = novo. p_dados: {nome, canal, tipos[], instrucoes, responde_sozinho, transfere_quando, captacao,
-- base_conhecimento, destino_registro, modelo, limite_diario}. Devolve o id.
create or replace function crm.agente_salvar(p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a crm.agentes%rowtype; v_id uuid := p_id; v_conf text; k text;
  v_nome  text := btrim(coalesce(p_dados->>'nome', ''));
  v_canal text := btrim(coalesce(p_dados->>'canal', ''));
  v_tipos text[];
  v_mod   text := coalesce(nullif(btrim(p_dados->>'modelo'), ''), 'claude-opus-5-5');
  v_lim   text := btrim(coalesce(p_dados->>'limite_diario', '200'));
  v_novo jsonb; v_velho jsonb; v_antes jsonb := '{}'; v_mud text[] := '{}';
  v_txt text;
begin
  if not crm.eh_admin() then raise exception 'só o administrador cria e edita agentes' using errcode = '42501'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'dados do agente inválidos'; end if;
  if length(v_nome) < 3 or length(v_nome) > 80 then raise exception 'o nome do agente precisa ter de 3 a 80 caracteres'; end if;
  if v_canal not in ('instagram','google') then raise exception 'canal inválido: os agentes atendem só o Instagram e o Google'; end if;
  if jsonb_typeof(p_dados->'tipos') = 'array' then
    select coalesce(array_agg(distinct x order by x), '{}') into v_tipos from jsonb_array_elements_text(p_dados->'tipos') x;
  else v_tipos := '{}'; end if;
  if cardinality(v_tipos) = 0 then raise exception 'escolha ao menos um tipo de mensagem para o agente responder'; end if;
  if not v_tipos <@ crm.agente_tipos_do_canal(v_canal) then raise exception 'tipo de mensagem que não existe neste canal'; end if;
  if v_mod not in ('claude-opus-5-5','claude-sonnet-5-5','claude-haiku-5-5') then raise exception 'modelo de IA não permitido'; end if;
  if v_lim !~ '^\d{1,5}$' or v_lim::int < 1 or v_lim::int > 2000 then raise exception 'o limite diário precisa ser de 1 a 2000 mensagens'; end if;
  if length(btrim(coalesce(p_dados->>'responde_sozinho', ''))) = 0 then raise exception 'liste ao menos um assunto que a IA pode responder'; end if;
  if length(btrim(coalesce(p_dados->>'transfere_quando', ''))) = 0 then raise exception 'liste ao menos um caso em que a IA passa para uma pessoa'; end if;
  foreach k in array array['instrucoes','responde_sozinho','transfere_quando'] loop
    if length(coalesce(p_dados->>k, '')) > 4000 then raise exception 'texto longo demais (máximo de 4000 caracteres por campo)'; end if;
  end loop;
  foreach k in array array['captacao','base_conhecimento','destino_registro'] loop
    if length(coalesce(p_dados->>k, '')) > 500 then raise exception 'texto longo demais (máximo de 500 caracteres por campo)'; end if;
  end loop;
  if exists (select 1 from crm.agentes x where x.arquivado_em is null and lower(x.nome) = lower(v_nome) and x.id is distinct from p_id) then
    raise exception 'já existe um agente com esse nome';
  end if;

  v_novo := jsonb_build_object('nome', v_nome, 'canal', v_canal, 'tipos', to_jsonb(v_tipos),
    'instrucoes', nullif(btrim(coalesce(p_dados->>'instrucoes', '')), ''),
    'responde_sozinho', btrim(p_dados->>'responde_sozinho'), 'transfere_quando', btrim(p_dados->>'transfere_quando'),
    'captacao', nullif(btrim(coalesce(p_dados->>'captacao', '')), ''),
    'base_conhecimento', nullif(btrim(coalesce(p_dados->>'base_conhecimento', '')), ''),
    'destino_registro', nullif(btrim(coalesce(p_dados->>'destino_registro', '')), ''),
    'modelo', v_mod, 'limite_diario', v_lim::int);

  perform pg_advisory_xact_lock(hashtext('crm.agentes.ligados'));
  if p_id is null then
    insert into crm.agentes (slug, nome, canal, tipos, ativo, modo, provedor, requer_vinculo, instrucoes, responde_sozinho, transfere_quando,
                             captacao, base_conhecimento, destino_registro, modelo, limite_diario, criado_por)
    values ('ag-' || substr(md5(gen_random_uuid()::text), 1, 10), v_nome, v_canal, v_tipos, false, 'rascunho', 'anthropic', false,
            v_novo->>'instrucoes', v_novo->>'responde_sozinho', v_novo->>'transfere_quando', v_novo->>'captacao',
            v_novo->>'base_conhecimento', v_novo->>'destino_registro', v_mod, v_lim::int, auth.uid())
    returning id into v_id;
    insert into crm.agentes_historico (agente_id, campo, de, para) values (v_id, 'criado', null, v_nome);
    return v_id;
  end if;

  select * into a from crm.agentes where id = p_id for update;
  if not found then raise exception 'agente não encontrado'; end if;
  if a.arquivado_em is not null then raise exception 'agente arquivado: restaure antes de editar'; end if;
  if a.ativo and a.canal <> v_canal then raise exception 'desligue o agente antes de trocar o canal'; end if;
  if a.ativo then
    v_conf := crm.agente_conflito(p_id, v_canal, v_tipos);
    if v_conf is not null then raise exception '%', v_conf; end if;
  end if;
  v_velho := jsonb_build_object('nome', a.nome, 'canal', a.canal, 'tipos', to_jsonb(a.tipos), 'instrucoes', a.instrucoes,
    'responde_sozinho', a.responde_sozinho, 'transfere_quando', a.transfere_quando, 'captacao', a.captacao,
    'base_conhecimento', a.base_conhecimento, 'destino_registro', a.destino_registro, 'modelo', a.modelo, 'limite_diario', a.limite_diario);
  for k in select jsonb_object_keys(v_novo) loop
    if v_novo->k is distinct from v_velho->k then
      v_antes := v_antes || jsonb_build_object(k, v_velho->k);
      v_mud := v_mud || case k when 'nome' then 'nome' when 'canal' then 'canal' when 'tipos' then 'tipos de mensagem'
        when 'instrucoes' then 'instruções' when 'responde_sozinho' then 'o que pode responder' when 'transfere_quando' then 'quando transfere'
        when 'captacao' then 'captação' when 'base_conhecimento' then 'base de conhecimento' when 'destino_registro' then 'onde fica registrado'
        when 'modelo' then 'modelo de IA' when 'limite_diario' then 'limite diário' else k end;
    end if;
  end loop;
  if cardinality(v_mud) = 0 then return p_id; end if;
  update crm.agentes set nome = v_nome, canal = v_canal, tipos = v_tipos, instrucoes = v_novo->>'instrucoes',
         responde_sozinho = v_novo->>'responde_sozinho', transfere_quando = v_novo->>'transfere_quando', captacao = v_novo->>'captacao',
         base_conhecimento = v_novo->>'base_conhecimento', destino_registro = v_novo->>'destino_registro', modelo = v_mod, limite_diario = v_lim::int
   where id = p_id;
  v_txt := array_to_string(v_mud, ', ');
  insert into crm.agentes_historico (agente_id, campo, de, para, antes) values (p_id, 'configuracao', null, v_txt, v_antes);
  return p_id;
end $$;

-- ---- arquivar ("excluir") e restaurar (só administrador) ----------------------------------------
create or replace function crm.agente_arquivar(p_id uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a crm.agentes%rowtype;
begin
  if not crm.eh_admin() then raise exception 'só o administrador exclui agentes' using errcode = '42501'; end if;
  select * into a from crm.agentes where id = p_id for update;
  if not found then raise exception 'agente não encontrado'; end if;
  if a.arquivado_em is not null then raise exception 'este agente já está excluído'; end if;
  perform set_config('crm.motivo', coalesce(nullif(btrim(p_motivo), ''), 'agente excluído'), true);
  update crm.agentes set ativo = false, arquivado_em = now(), arquivado_por = auth.uid() where id = p_id;
  insert into crm.agentes_historico (agente_id, campo, de, para, motivo) values (p_id, 'arquivado', null, a.nome, nullif(btrim(p_motivo), ''));
end $$;

create or replace function crm.agente_restaurar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a crm.agentes%rowtype;
begin
  if not crm.eh_admin() then raise exception 'só o administrador restaura agentes' using errcode = '42501'; end if;
  select * into a from crm.agentes where id = p_id for update;
  if not found then raise exception 'agente não encontrado'; end if;
  if a.arquivado_em is null then raise exception 'este agente não está excluído'; end if;
  if exists (select 1 from crm.agentes x where x.arquivado_em is null and lower(x.nome) = lower(a.nome) and x.id <> p_id) then
    raise exception 'já existe um agente com o nome “%”: renomeie o outro antes de restaurar', a.nome;
  end if;
  update crm.agentes set arquivado_em = null, arquivado_por = null where id = p_id;   -- volta desligado
  insert into crm.agentes_historico (agente_id, campo, de, para) values (p_id, 'restaurado', null, a.nome);
end $$;

-- ---- regras (só administrador) -------------------------------------------------------------------
-- Algum agente ligado ficaria sem nenhuma regra validada? Devolve o nome dele (null = nenhum).
create or replace function crm.agente_sem_regra() returns text
language sql stable set search_path = '' as $$
  select a.nome from crm.agentes a
   where a.ativo and not exists (select 1 from crm.regras_ia r where r.ativa and r.validada_em is not null and (r.agente_id is null or r.agente_id = a.id))
   order by a.nome limit 1
$$;

-- Criar (p_id null) ou editar. Regra validada editada = nova versão aguardando validação (a antiga segue valendo).
-- Regra ainda não validada é corrigida no lugar. Devolve o id da versão gravada.
create or replace function crm.regra_salvar(p_id uuid, p_tipo text, p_regra text, p_fonte text default null, p_agente uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r crm.regras_ia%rowtype; v_id uuid; v_txt text := btrim(coalesce(p_regra, '')); v_fonte text := nullif(btrim(coalesce(p_fonte, '')), '');
begin
  if not crm.eh_admin() then raise exception 'só o administrador cria e edita regras' using errcode = '42501'; end if;
  if p_tipo is null or p_tipo not in ('proibido','obrigatorio','cuidado') then raise exception 'tipo de regra inválido'; end if;
  if length(v_txt) < 10 or length(v_txt) > 600 then raise exception 'a regra precisa ter de 10 a 600 caracteres'; end if;
  if length(coalesce(v_fonte, '')) > 200 then raise exception 'a fonte pode ter até 200 caracteres'; end if;
  if p_agente is not null and not exists (select 1 from crm.agentes where id = p_agente and arquivado_em is null) then
    raise exception 'agente não encontrado';
  end if;
  if exists (select 1 from crm.regras_ia x where x.ativa and x.agente_id is not distinct from p_agente and lower(x.regra) = lower(v_txt)
               and (p_id is null or (x.id <> p_id and x.substitui_id is distinct from p_id
                                     and x.id is distinct from (select y.substitui_id from crm.regras_ia y where y.id = p_id)))) then
    raise exception 'já existe uma regra com esse texto';
  end if;
  if p_id is null then
    insert into crm.regras_ia (agente_id, tipo, regra, fonte, criada_por) values (p_agente, p_tipo, v_txt, v_fonte, auth.uid()) returning id into v_id;
    return v_id;
  end if;
  select * into r from crm.regras_ia where id = p_id for update;
  if not found or not r.ativa then raise exception 'regra não encontrada ou desativada'; end if;
  if r.validada_em is null then   -- ainda não vale: corrige no lugar
    update crm.regras_ia set tipo = p_tipo, regra = v_txt, fonte = v_fonte, agente_id = p_agente where id = p_id;
    return p_id;
  end if;
  if r.tipo = p_tipo and r.regra = v_txt and r.fonte is not distinct from v_fonte and r.agente_id is not distinct from p_agente then return p_id; end if;
  select id into v_id from crm.regras_ia where substitui_id = p_id and ativa and validada_em is null for update;
  if found then   -- já há uma nova versão esperando: atualiza ela
    update crm.regras_ia set tipo = p_tipo, regra = v_txt, fonte = v_fonte, agente_id = p_agente where id = v_id;
    return v_id;
  end if;
  insert into crm.regras_ia (agente_id, tipo, regra, fonte, criada_por, substitui_id) values (p_agente, p_tipo, v_txt, v_fonte, auth.uid(), p_id)
  returning id into v_id;
  return v_id;
end $$;

-- Validar: a regra passa a valer; se for nova versão, a antiga sai no mesmo instante.
create or replace function crm.regra_validar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r crm.regras_ia%rowtype;
begin
  if not crm.eh_admin() then raise exception 'só o administrador valida regras' using errcode = '42501'; end if;
  select * into r from crm.regras_ia where id = p_id for update;
  if not found or not r.ativa then raise exception 'regra não encontrada ou desativada'; end if;
  if r.validada_em is not null then raise exception 'esta regra já está validada'; end if;
  update crm.regras_ia set validada_por = auth.uid(), validada_em = now() where id = p_id;
  if r.substitui_id is not null then
    update crm.regras_ia set ativa = false, desativada_em = now(), desativada_por = auth.uid(), motivo_desativacao = 'substituída pela nova versão'
     where id = r.substitui_id and ativa;
  end if;
end $$;

-- Desativar uma regra validada (com motivo) ou descartar uma que ainda aguarda validação.
create or replace function crm.regra_desativar(p_id uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r crm.regras_ia%rowtype; v_ag text; v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not crm.eh_admin() then raise exception 'só o administrador desativa regras' using errcode = '42501'; end if;
  select * into r from crm.regras_ia where id = p_id for update;
  if not found or not r.ativa then raise exception 'regra não encontrada ou já desativada'; end if;
  if r.validada_em is not null and length(coalesce(v_mot, '')) < 5 then raise exception 'escreva o motivo para desativar uma regra validada'; end if;
  update crm.regras_ia set ativa = false, desativada_em = now(), desativada_por = auth.uid(),
         motivo_desativacao = coalesce(v_mot, 'descartada antes da validação')
   where id = p_id or (substitui_id = p_id and ativa and validada_em is null);
  v_ag := crm.agente_sem_regra();
  if v_ag is not null then
    raise exception 'o agente “%” ficaria sem nenhuma regra validada: desligue-o antes', v_ag;
  end if;
end $$;

-- ---- acesso --------------------------------------------------------------------------------------
revoke all on function crm.agente_salvar(uuid, jsonb), crm.agente_arquivar(uuid, text), crm.agente_restaurar(uuid),
  crm.regra_salvar(uuid, text, text, text, uuid), crm.regra_validar(uuid), crm.regra_desativar(uuid, text),
  crm.agente_conflito(uuid, text, text[]), crm.agente_sem_regra() from public, anon;
grant execute on function crm.agente_salvar(uuid, jsonb), crm.agente_arquivar(uuid, text), crm.agente_restaurar(uuid),
  crm.regra_salvar(uuid, text, text, text, uuid), crm.regra_validar(uuid), crm.regra_desativar(uuid, text) to authenticated;
grant execute on function crm.agente_tipos_do_canal(text), crm.agente_tipos_rotulo(text[]) to authenticated, service_role;
