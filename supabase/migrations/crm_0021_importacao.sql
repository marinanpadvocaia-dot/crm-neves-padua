-- crm_0021_importacao.sql
-- Parte 4: importação de leads no banco (planilha CSV do GCV ou de outra ferramenta).
-- A tela lê o arquivo e mostra a prévia; ao confirmar, as linhas chegam aqui em partes (até 500 por vez).
-- O banco confere de novo: contato já existe (telefone → ID externo → e-mail), etapa do funil, motivo de perda,
-- origem e responsável. Cada linha fica registrada (crm.importacao_linhas) com o que foi feito e por quê.
-- Importação NÃO dispara fluxos de trabalho (a não ser que o lote peça, e só para os leads novos).
-- O administrador pode desfazer um lote em até 7 dias (apaga os negócios CRIADOS por ele; atualizações ficam).
-- Idempotente. NÃO altera tabelas do sistema jurídico.

alter table crm.importacoes add column if not exists disparar_fluxos boolean not null default false;
alter table crm.importacoes add column if not exists concluida_em timestamptz;
alter table crm.importacoes add column if not exists desfeita_em timestamptz;
alter table crm.importacoes add column if not exists desfeita_por uuid references auth.users(id) on delete set null;
alter table crm.importacoes drop constraint if exists importacoes_status_check;
alter table crm.importacoes add constraint importacoes_status_check check (status in ('simulada','em_andamento','concluida','falhou','desfeita'));
alter table crm.importacoes alter column user_id set default auth.uid();

create or replace function crm.importacao_iniciar(p_lote text, p_arquivo text, p_funil text, p_origem text,
  p_atualizar boolean default true, p_disparar boolean default false, p_total int default 0) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_f uuid;
begin
  if not (crm.eh_lider() and crm.pode('comercial')) then raise exception 'só líderes e administradores importam leads'; end if;
  select id into v_f from crm.funis where slug = p_funil and ativo;
  if v_f is null then raise exception 'funil não encontrado'; end if;
  if coalesce(p_total, 0) > 5000 then raise exception 'até 5000 linhas por importação: divida a planilha'; end if;
  insert into crm.importacoes (lote, arquivo, funil_id, origem_padrao_id, atualizar_existentes, iniciar_cadencia, disparar_fluxos, status, total, user_id)
  values (coalesce(nullif(btrim(p_lote), ''), coalesce(p_arquivo, 'Importação')), p_arquivo, v_f, (select id from crm.origens where nome = p_origem),
          coalesce(p_atualizar, true), false, coalesce(p_disparar, false), 'em_andamento', coalesce(p_total, 0), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Processa uma parte das linhas. Cada linha (jsonb): {n, act, nome, empresa, telefone, email, etapa, perda, dono, valor,
-- entrada (AAAA-MM-DD), origem, tags, obs, ext, avisos[], erros[]}. act = "ignorar" vem da prévia (erro já visto na tela).
create or replace function crm.importacao_processar(p_id uuid, p_linhas jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare imp crm.importacoes%rowtype; x jsonb; v_neg uuid; v_ex crm.negocios%rowtype; v_et uuid; v_tipo text; v_perda uuid; v_origem uuid; v_dono uuid;
  v_avisos text[]; v_erros text[]; v_acao text; v_valor numeric; v_ent timestamptz; c int := 0; u int := 0; ig int := 0; v_nome text; v_tel text;
begin
  if not (crm.eh_lider() and crm.pode('comercial')) then raise exception 'só líderes e administradores importam leads'; end if;
  select * into imp from crm.importacoes where id = p_id for update;
  if not found or imp.status <> 'em_andamento' then raise exception 'importação não encontrada ou já concluída'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 500 then raise exception 'mande no máximo 500 linhas por vez'; end if;
  for x in select * from jsonb_array_elements(p_linhas) loop
    v_avisos := array(select jsonb_array_elements_text(coalesce(x->'avisos', '[]')));
    v_erros := array(select jsonb_array_elements_text(coalesce(x->'erros', '[]')));
    v_neg := null; v_acao := 'ignorar';
    v_nome := regexp_replace(btrim(coalesce(x->>'nome', '')), '\s+', ' ', 'g'); v_tel := nullif(btrim(coalesce(x->>'telefone', '')), '');
    begin
      if x->>'act' = 'ignorar' then null;
      elsif v_nome = '' then v_erros := v_erros || 'Sem nome'::text;
      else
        -- etapa (só deste funil), motivo de perda, origem, responsável, valor e data de entrada
        select e.id, e.tipo into v_et, v_tipo from crm.funil_etapas e where e.funil_id = imp.funil_id and e.nome = x->>'etapa';
        if v_et is null then
          select e.id, e.tipo into v_et, v_tipo from crm.funil_etapas e where e.funil_id = imp.funil_id and e.tipo = 'aberta' order by e.ordem limit 1;
          if coalesce(x->>'etapa', '') <> '' then v_avisos := v_avisos || ('Etapa “' || (x->>'etapa') || '” não existe neste funil → ' || (select nome from crm.funil_etapas where id = v_et)); end if;
        end if;
        v_perda := null;
        if v_tipo = 'perdido' then
          select id into v_perda from crm.motivos_perda where nome = x->>'perda' and ativo;
          if v_perda is null then select id into v_perda from crm.motivos_perda where nome = 'Fora do perfil'; end if;
          if v_perda is null then select id into v_perda from crm.motivos_perda order by nome limit 1; end if;
        end if;
        v_origem := coalesce((select id from crm.origens where nome = x->>'origem' and ativa), imp.origem_padrao_id);
        if coalesce(x->>'origem', '') <> '' and not exists (select 1 from crm.origens where nome = x->>'origem' and ativa) then
          v_avisos := v_avisos || ('Origem “' || (x->>'origem') || '” não cadastrada → origem padrão'); end if;
        v_dono := case when coalesce(x->>'dono', '') ~ '^[0-9a-f-]{36}$' and crm.tipo_acesso((x->>'dono')::uuid) is not null then (x->>'dono')::uuid end;
        v_valor := case when coalesce(x->>'valor', '') ~ '^[0-9]+([.][0-9]+)?$' then (x->>'valor')::numeric end;
        v_ent := case when coalesce(x->>'entrada', '') ~ '^\d{4}-\d{2}-\d{2}$' then ((x->>'entrada')::date + time '12:00') at time zone 'America/Sao_Paulo' end;
        select * into v_ex from crm.negocios where id = crm.achar_negocio_existente(v_tel, nullif(x->>'ext', ''), nullif(x->>'email', ''));
        perform set_config('crm.importando', '1', true);                       -- atualizações nunca disparam fluxos
        if v_ex.id is not null then
          if not imp.atualizar_existentes then
            v_erros := v_erros || ('Já existe no CRM (' || v_ex.nome || ') e “atualizar existentes” está desligado');
          else
            if v_ex.funil_id <> imp.funil_id then
              v_avisos := v_avisos || 'Já existe em outro funil: etapa mantida'::text;
              update crm.negocios set valor = coalesce(v_valor, valor), responsavel_id = coalesce(v_dono, responsavel_id),
                     empresa = coalesce(empresa, nullif(btrim(x->>'empresa'), '')), externo_id = coalesce(externo_id, nullif(x->>'ext', '')),
                     email = coalesce(email, nullif(btrim(x->>'email'), '')) where id = v_ex.id;
            else
              update crm.negocios set etapa_id = v_et, motivo_perda_id = case when v_tipo = 'perdido' then v_perda else motivo_perda_id end,
                     valor = coalesce(v_valor, valor), responsavel_id = coalesce(v_dono, responsavel_id),
                     empresa = coalesce(empresa, nullif(btrim(x->>'empresa'), '')), externo_id = coalesce(externo_id, nullif(x->>'ext', '')),
                     email = coalesce(email, nullif(btrim(x->>'email'), '')) where id = v_ex.id;
            end if;
            v_neg := v_ex.id; v_acao := 'atualizar';
          end if;
        else
          perform set_config('crm.importando', case when imp.disparar_fluxos then '0' else '1' end, true);
          insert into crm.negocios (funil_id, etapa_id, nome, empresa, telefone, email, valor, responsavel_id, origem_id, externo_id, importacao_id,
                                    motivo_perda_id, created_at)
          values (imp.funil_id, v_et, left(v_nome, 200), nullif(btrim(x->>'empresa'), ''), v_tel, nullif(btrim(x->>'email'), ''), coalesce(v_valor, 0),
                  v_dono, v_origem, nullif(x->>'ext', ''), imp.id, v_perda, coalesce(v_ent, now()))
          returning id into v_neg;
          v_acao := 'criar';
        end if;
        perform set_config('crm.importando', '0', true);
        if v_neg is not null then
          if coalesce(btrim(x->>'obs'), '') <> '' then
            insert into crm.respostas_formulario (negocio_id, pergunta, resposta, fonte) values (v_neg, 'Observação da importação', left(x->>'obs', 2000), 'importação: ' || imp.lote); end if;
          if coalesce(btrim(x->>'tags'), '') <> '' then
            insert into crm.respostas_formulario (negocio_id, pergunta, resposta, fonte) values (v_neg, 'Etiquetas', left(x->>'tags', 500), 'importação: ' || imp.lote); end if;
        end if;
      end if;
    exception when others then
      perform set_config('crm.importando', '0', true);
      v_acao := 'ignorar'; v_neg := null; v_erros := v_erros || ('Erro ao gravar: ' || sqlerrm);
    end;
    insert into crm.importacao_linhas (importacao_id, linha, acao, negocio_id, avisos, erros, dados)
    values (imp.id, coalesce((x->>'n')::int, 0), v_acao, v_neg, v_avisos, v_erros,
            jsonb_build_object('nome', v_nome, 'empresa', x->>'empresa', 'telefone', v_tel, 'etapa', x->>'etapa', 'ext', x->>'ext'));
    if v_acao = 'criar' then c := c + 1; elsif v_acao = 'atualizar' then u := u + 1; else ig := ig + 1; end if;
  end loop;
  update crm.importacoes set criados = criados + c, atualizados = atualizados + u, ignorados = ignorados + ig where id = imp.id;
  return jsonb_build_object('criados', c, 'atualizados', u, 'ignorados', ig);
end $$;

create or replace function crm.importacao_concluir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not (crm.eh_lider() and crm.pode('comercial')) then raise exception 'só líderes e administradores importam leads'; end if;
  update crm.importacoes set status = 'concluida', concluida_em = now() where id = p_id and status = 'em_andamento'
  returning jsonb_build_object('criados', criados, 'atualizados', atualizados, 'ignorados', ignorados, 'lote', lote) into r;
  if r is null then raise exception 'importação não encontrada ou já concluída'; end if;
  return r;
end $$;

-- Desfazer: apaga os negócios CRIADOS pelo lote (as atualizações de negócios que já existiam ficam).
create or replace function crm.importacao_desfazer(p_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare imp crm.importacoes%rowtype; n int;
begin
  if not crm.eh_admin() then raise exception 'só o administrador desfaz uma importação'; end if;
  select * into imp from crm.importacoes where id = p_id for update;
  if not found or imp.status not in ('concluida','em_andamento') then raise exception 'importação não encontrada ou já desfeita'; end if;
  if imp.created_at < now() - interval '7 days' then raise exception 'só dá para desfazer em até 7 dias'; end if;
  delete from crm.negocios n where n.importacao_id = p_id and n.id in (select l.negocio_id from crm.importacao_linhas l where l.importacao_id = p_id and l.acao = 'criar');
  get diagnostics n = row_count;
  update crm.importacoes set status = 'desfeita', desfeita_em = now(), desfeita_por = auth.uid() where id = p_id;
  return n;
end $$;

revoke insert, update, delete on crm.importacoes, crm.importacao_linhas from authenticated;
revoke all on function crm.importacao_iniciar(text,text,text,text,boolean,boolean,int), crm.importacao_processar(uuid,jsonb),
  crm.importacao_concluir(uuid), crm.importacao_desfazer(uuid) from public, anon;
grant execute on function crm.importacao_iniciar(text,text,text,text,boolean,boolean,int), crm.importacao_processar(uuid,jsonb),
  crm.importacao_concluir(uuid), crm.importacao_desfazer(uuid) to authenticated;
