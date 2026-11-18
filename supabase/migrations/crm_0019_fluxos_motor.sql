-- crm_0019_fluxos_motor.sql
-- Parte 3b: o MOTOR dos fluxos de trabalho. Roda no servidor (Edge Function fluxos-motor, a cada 1 min).
--   1. Eventos: o banco anota o que acontece (negócio criado, mudou de etapa, ganho/perdido, campo alterado, atendimento
--      resolvido) e o motor anota as mensagens dos canais (cliente respondeu, nova conversa, fora do horário).
--      Eventos de tempo (cliente sem responder, equipe sem responder, negócio parado, data de campo, tarefa atrasada)
--      são procurados a cada ciclo. Cada evento tem uma chave única: nunca dispara duas vezes.
--   2. Inscrição: cada evento é comparado com os acionadores dos fluxos PUBLICADOS (versão publicada, não o rascunho).
--   3. Execução: cada inscrição anda passo a passo; para em "Aguardar", em "Aguardar resposta" e fora do horário.
--      Tudo fica registrado (crm.fluxo_registros). Mensagens saem pela fila de saída do passo 1 (origem automacao).
--   4. Regras do WhatsApp para mensagens automáticas: limites por minuto/hora/dia, horário de envio, quem respondeu
--      "PARAR"/"SAIR" não recebe mais, e no Instagram só dentro de 24 h da última mensagem do cliente.
-- Dependem do passo 2 (vínculo com o sistema jurídico): tags do contato, transferir/atribuir atendimento.
-- Idempotente. NÃO altera tabelas do sistema jurídico.

-- ---- contato: chave única por canal (WhatsApp: últimos 11 dígitos, igual ao telefone dos negócios) ----------------
create or replace function crm.contato_chave(p_canal_tipo text, p_destino text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_destino is null or btrim(p_destino) = '' then null
    when p_canal_tipo = 'whatsapp' and length(regexp_replace(p_destino, '\D', '', 'g')) >= 10 then 'whatsapp:' || right(regexp_replace(p_destino, '\D', '', 'g'), 11)
    when p_canal_tipo = 'instagram' and p_destino like 'dm:%' then 'instagram:' || substr(p_destino, 4)
  end
$$;

create table if not exists crm.contato_atividade (
  contato             text primary key,
  canal_id            uuid references crm.canais(id) on delete set null,
  destino             text,
  nome                text,
  primeira_entrada_em timestamptz,
  ultima_entrada_em   timestamptz,          -- última mensagem do cliente
  ultima_saida_em     timestamptz,          -- última mensagem do escritório (enviada)
  ultima_mensagem     text                  -- último texto do cliente (condição "última resposta")
);
comment on table crm.contato_atividade is 'Quando cada contato escreveu e quando o escritório respondeu. Base dos acionadores de tempo sem resposta.';

create table if not exists crm.fluxo_eventos (
  id                bigint generated always as identity primary key,
  tipo              text not null,
  chave             text not null unique,
  negocio_id        uuid references crm.negocios(id) on delete cascade,
  atendimento_id    uuid references crm.atendimentos(id) on delete cascade,
  tarefa_id         uuid references crm.tarefas(id) on delete cascade,
  webhook_evento_id bigint references crm.webhook_eventos(id) on delete set null,
  contato           text,
  contato_nome      text,
  canal_id          uuid references crm.canais(id) on delete set null,
  destino           text,
  dados             jsonb not null default '{}'::jsonb,
  criado_em         timestamptz not null default now(),
  processado_em     timestamptz
);
create index if not exists ix_fluxo_eventos_pend on crm.fluxo_eventos (id) where processado_em is null;
create index if not exists ix_fluxo_eventos_webhook on crm.fluxo_eventos (webhook_evento_id) where webhook_evento_id is not null;

create table if not exists crm.fluxo_inscricoes (
  id             uuid primary key default gen_random_uuid(),
  fluxo_id       uuid not null references crm.fluxos(id) on delete cascade,
  versao         int not null,
  evento_id      bigint references crm.fluxo_eventos(id) on delete set null,
  negocio_id     uuid references crm.negocios(id) on delete set null,
  atendimento_id uuid references crm.atendimentos(id) on delete set null,
  tarefa_id      uuid references crm.tarefas(id) on delete set null,
  contato        text,
  contato_nome   text,
  canal_id       uuid references crm.canais(id) on delete set null,
  destino        text,
  pos            text[] not null default '{passos,0}',      -- caminho do passo atual dentro da definição
  estado         text not null default 'ativa' check (estado in ('ativa','aguardando','esperando_resposta','concluida','saiu','erro')),
  proximo_em     timestamptz not null default now(),
  espera         jsonb,                                       -- o que está esperando (resposta do cliente em "Aguardar resposta")
  vars           jsonb not null default '{}'::jsonb,
  erro           text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  concluida_em   timestamptz
);
comment on table crm.fluxo_inscricoes is 'Cada contato/negócio que entrou num fluxo publicado, onde está e o que espera ("Histórico de inscrições").';
create index if not exists ix_fluxo_insc_fila on crm.fluxo_inscricoes (proximo_em) where estado in ('ativa','aguardando','esperando_resposta');
create index if not exists ix_fluxo_insc_contato on crm.fluxo_inscricoes (contato) where estado in ('ativa','aguardando','esperando_resposta');
create index if not exists ix_fluxo_insc_fluxo on crm.fluxo_inscricoes (fluxo_id, criado_em desc);

create table if not exists crm.fluxo_registros (
  id           bigint generated always as identity primary key,
  inscricao_id uuid not null references crm.fluxo_inscricoes(id) on delete cascade,
  fluxo_id     uuid not null references crm.fluxos(id) on delete cascade,
  contato_nome text,
  passo_id     text,
  passo_tipo   text,
  resultado    text not null check (resultado in ('executado','pulado','aguardando','caminho','erro','saiu')),
  detalhe      text,
  criado_em    timestamptz not null default now()
);
comment on table crm.fluxo_registros is 'O que cada passo fez ("Registros de execução").';
create index if not exists ix_fluxo_reg on crm.fluxo_registros (fluxo_id, criado_em desc);

create table if not exists crm.fluxo_webhooks (
  id           bigint generated always as identity primary key,
  inscricao_id uuid references crm.fluxo_inscricoes(id) on delete set null,
  url          text not null check (url ~ '^https://'),
  corpo        jsonb not null,
  estado       text not null default 'pendente' check (estado in ('pendente','enviado','falhou')),
  tentativas   int not null default 0,
  proximo_em   timestamptz not null default now(),
  resposta     text,
  criado_em    timestamptz not null default now(),
  enviado_em   timestamptz
);

create table if not exists crm.avisos (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  texto        text not null,
  fluxo_id     uuid references crm.fluxos(id) on delete set null,
  inscricao_id uuid references crm.fluxo_inscricoes(id) on delete set null,
  lido_em      timestamptz,
  criado_em    timestamptz not null default now()
);
comment on table crm.avisos is 'Avisos internos para uma pessoa da equipe (passo "Avisar alguém da equipe"). Cada um vê só os seus.';
create index if not exists ix_avisos_user on crm.avisos (user_id, criado_em desc);

-- ---- janelas de horário (setores e envio automático), sempre no horário de Brasília -------------------------------
create or replace function crm.janela_aberta(p_dias text, p_abre time, p_fecha time, p_quando timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select (case p_dias when 'Todos os dias' then true when 'Seg–Sáb' then extract(isodow from x.l) <= 6 else extract(isodow from x.l) <= 5 end)
         and x.l::time >= p_abre and (x.l::time < p_fecha or p_fecha = '00:00'::time and p_abre = '00:00'::time)
  from (select p_quando at time zone 'America/Sao_Paulo' as l) x
$$;
create or replace function crm.janela_proxima(p_dias text, p_abre time, p_fecha time, p_quando timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare d int; dia date; cand timestamptz; dow int;
begin
  if crm.janela_aberta(p_dias, p_abre, p_fecha, p_quando) then return p_quando; end if;
  for d in 0..8 loop
    dia := (p_quando at time zone 'America/Sao_Paulo')::date + d; dow := extract(isodow from dia);
    if p_dias = 'Todos os dias' or (p_dias = 'Seg–Sáb' and dow <= 6) or (p_dias not in ('Todos os dias','Seg–Sáb') and dow <= 5) then
      cand := (dia + p_abre) at time zone 'America/Sao_Paulo';
      if cand > p_quando then return cand; end if;
    end if;
  end loop;
  return p_quando + interval '1 day';
end $$;
create or replace function crm.fila_aberta(p_fila text, p_quando timestamptz default now()) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select crm.janela_aberta(c.dias, c.abre, c.fecha, p_quando) from crm.filas_config c where c.fila_ref = p_fila), true)
$$;
create or replace function crm.fila_proxima_abertura(p_fila text, p_quando timestamptz default now()) returns timestamptz
language sql stable set search_path = '' as $$
  select coalesce((select crm.janela_proxima(c.dias, c.abre, c.fecha, p_quando) from crm.filas_config c where c.fila_ref = p_fila), p_quando)
$$;

-- ---- regras do WhatsApp para mensagens automáticas -----------------------------------------------------------------
-- Número comum (Evolution) é bloqueado pelo WhatsApp quando manda muito, rápido, fora de hora ou para quem não quer.
-- Limites por número (canal) e horário de envio; mudar só pelo SQL Editor:
--   update crm.config set valor = valor || '{"por_hora": 80}' where chave = 'whatsapp_automacao';
insert into crm.config (chave, valor) values ('whatsapp_automacao',
  '{"por_minuto": 8, "por_hora": 100, "por_dia": 500, "dias": "Seg–Sáb", "inicio": "08:00", "fim": "20:00"}')
on conflict (chave) do nothing;
create or replace function crm.automacao_cfg() returns jsonb
language sql stable set search_path = '' as $$
  select '{"por_minuto": 8, "por_hora": 100, "por_dia": 500, "dias": "Seg–Sáb", "inicio": "08:00", "fim": "20:00"}'::jsonb
         || coalesce((select valor from crm.config where chave = 'whatsapp_automacao'), '{}')
$$;
-- quem respondeu "PARAR"/"SAIR" (ou foi marcado pela equipe) não recebe mais mensagens automáticas
alter table crm.consentimentos drop constraint if exists consentimentos_finalidade_check;
alter table crm.consentimentos add constraint consentimentos_finalidade_check check (finalidade in ('atendimento','ia','marketing','automacao'));
create or replace function crm.automacao_permitida(p_contato text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_contato is null or coalesce((
    select c.revogado_em is null or (c.concedido_em is not null and c.concedido_em > c.revogado_em)
    from crm.consentimentos c where c.contato_ref = p_contato and c.finalidade = 'automacao'
    order by greatest(coalesce(c.concedido_em, '-infinity'), coalesce(c.revogado_em, '-infinity')) desc, c.created_at desc limit 1), true)
$$;
create or replace function crm.pediu_para_parar(p_texto text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(coalesce(p_texto, ''), '[.!]+\s*$', ''))) in
    ('parar','pare','sair','stop','cancelar','descadastrar','remover','não quero mais receber','nao quero mais receber',
     'não quero receber mensagens','nao quero receber mensagens','não me mande mais mensagens','nao me mande mais mensagens')
$$;

-- ---- eventos ------------------------------------------------------------------------------------------------------
create or replace function crm.fluxo_evento(p_tipo text, p_chave text, p_dados jsonb, p_negocio uuid default null, p_atendimento uuid default null,
  p_tarefa uuid default null, p_contato text default null, p_nome text default null, p_canal uuid default null, p_destino text default null,
  p_webhook bigint default null) returns void
language sql security definer set search_path = '' as $$
  insert into crm.fluxo_eventos (tipo, chave, dados, negocio_id, atendimento_id, tarefa_id, contato, contato_nome, canal_id, destino, webhook_evento_id)
  values (p_tipo, p_chave, coalesce(p_dados, '{}'), p_negocio, p_atendimento, p_tarefa, p_contato, p_nome, p_canal, p_destino, p_webhook)
  on conflict (chave) do nothing
$$;

-- negócios: criado, mudou de etapa, ganho, perdido, campo alterado
create or replace function crm.fluxo_evento_negocio() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_f text; v_e text; v_t text; v_c text; v_k text; v_ts text := (extract(epoch from clock_timestamp()) * 1000000)::bigint::text;
begin
  -- importação de leads não dispara fluxos (a não ser que o lote peça, só para os novos): crm.importacao_processar liga esta marca
  if current_setting('crm.importando', true) = '1' then return null; end if;
  select f.slug into v_f from crm.funis f where f.id = new.funil_id;
  select e.nome, e.tipo into v_e, v_t from crm.funil_etapas e where e.id = new.etapa_id;
  v_c := case when new.telefone_norm is not null then 'whatsapp:' || new.telefone_norm end;
  if tg_op = 'INSERT' then
    perform crm.fluxo_evento('negocio_criado', 'negocio_criado:' || new.id,
      jsonb_build_object('funil', v_f, 'etapa', v_e, 'origem', (select o.nome from crm.origens o where o.id = new.origem_id)), new.id, null, null, v_c, new.nome, null, new.telefone_norm);
    perform crm.fluxo_evento('etapa_mudou', 'etapa:' || new.id || ':' || new.etapa_id || ':' || v_ts, jsonb_build_object('funil', v_f, 'etapa', v_e), new.id, null, null, v_c, new.nome, null, new.telefone_norm);
    return null;
  end if;
  if new.etapa_id is distinct from old.etapa_id then
    perform crm.fluxo_evento('etapa_mudou', 'etapa:' || new.id || ':' || new.etapa_id || ':' || v_ts, jsonb_build_object('funil', v_f, 'etapa', v_e), new.id, null, null, v_c, new.nome, null, new.telefone_norm);
    if v_t = 'ganho' then perform crm.fluxo_evento('negocio_ganho', 'ganho:' || new.id || ':' || v_ts, jsonb_build_object('funil', v_f), new.id, null, null, v_c, new.nome, null, new.telefone_norm); end if;
    if v_t = 'perdido' then perform crm.fluxo_evento('negocio_perdido', 'perdido:' || new.id || ':' || v_ts,
      jsonb_build_object('funil', v_f, 'motivo', (select m.nome from crm.motivos_perda m where m.id = new.motivo_perda_id)), new.id, null, null, v_c, new.nome, null, new.telefone_norm); end if;
  end if;
  if new.campos is distinct from old.campos then
    for v_k in select k.key from jsonb_each(new.campos) k where (new.campos -> k.key) is distinct from (old.campos -> k.key) loop
      perform crm.fluxo_evento('campo_alterado', 'campo:' || new.id || ':' || v_k || ':' || v_ts, jsonb_build_object('campo', v_k), new.id, null, null, v_c, new.nome, null, new.telefone_norm);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists trg_fluxo_evento_negocio on crm.negocios;
create trigger trg_fluxo_evento_negocio after insert or update on crm.negocios for each row execute function crm.fluxo_evento_negocio();

create or replace function crm.fluxo_evento_atendimento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'resolvido' and old.status is distinct from 'resolvido' then
    perform crm.fluxo_evento('atendimento_resolvido', 'resolvido:' || new.id || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint,
      jsonb_build_object('fila', new.fila_ref, 'canal', new.canal), null, new.id, null, null, null, null, null);
  end if;
  return null;
end $$;
drop trigger if exists trg_fluxo_evento_atendimento on crm.atendimentos;
create trigger trg_fluxo_evento_atendimento after update on crm.atendimentos for each row execute function crm.fluxo_evento_atendimento();

-- mensagem enviada pelo escritório: marca a última saída do contato
create or replace function crm.fluxo_saida_enviada() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_c text;
begin
  if new.estado = 'enviada' and old.estado is distinct from 'enviada' then
    v_c := crm.contato_chave((select c.tipo from crm.canais c where c.id = new.canal_id), new.destino);
    if v_c is not null then
      insert into crm.contato_atividade (contato, canal_id, destino, ultima_saida_em) values (v_c, new.canal_id, new.destino, coalesce(new.enviada_em, now()))
      on conflict (contato) do update set ultima_saida_em = greatest(crm.contato_atividade.ultima_saida_em, excluded.ultima_saida_em);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_fluxo_saida_enviada on crm.saida_mensagens;
create trigger trg_fluxo_saida_enviada after update on crm.saida_mensagens for each row execute function crm.fluxo_saida_enviada();

-- mensagens dos canais (lidas e identificadas pelo motor, com o mesmo leitor dos agentes de IA)
create or replace function crm.fluxo_mensagens_pendentes(p_limite int default 200)
returns table (evento_id bigint, canal_id uuid, canal_tipo text, tipo text, payload jsonb, ocorrido_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.id, c.id, c.tipo, e.tipo, e.payload, coalesce(e.ocorrido_em, e.recebido_em)
  from crm.webhook_eventos e join crm.canais c on c.id = e.canal_id
  where e.tipo in ('mensagem','comentario') and e.recebido_em > now() - interval '24 hours'
    and not exists (select 1 from crm.fluxo_eventos x where x.webhook_evento_id = e.id)
  order by coalesce(e.ocorrido_em, e.recebido_em), e.id
  limit p_limite
$$;

create or replace function crm.fluxo_registrar_mensagem(p_evento bigint, p_canal uuid, p_contato text, p_nome text, p_texto text, p_destino text,
  p_quando timestamptz default now(), p_de_mim boolean default false) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_tipo text; v_c text; v_ult timestamptz; v_f text; v_q timestamptz := coalesce(p_quando, now());
begin
  if exists (select 1 from crm.fluxo_eventos where webhook_evento_id = p_evento) then return false; end if;
  select tipo into v_tipo from crm.canais where id = p_canal;
  v_c := coalesce(crm.contato_chave(v_tipo, p_destino), p_contato);
  if v_c is null or (p_texto is null and not p_de_mim) then          -- nada a fazer: só marca como lido
    perform crm.fluxo_evento('mensagem_ignorada', 'msg:' || p_evento, '{}', null, null, null, null, null, p_canal, null, p_evento);
    update crm.fluxo_eventos set processado_em = now() where chave = 'msg:' || p_evento;
    return false;
  end if;
  if p_de_mim then                                                   -- mensagem do escritório pelo celular
    insert into crm.contato_atividade (contato, canal_id, destino, ultima_saida_em) values (v_c, p_canal, p_destino, v_q)
    on conflict (contato) do update set ultima_saida_em = greatest(crm.contato_atividade.ultima_saida_em, excluded.ultima_saida_em);
    perform crm.fluxo_evento('mensagem_enviada', 'msg:' || p_evento, '{}', null, null, null, v_c, null, p_canal, p_destino, p_evento);
    update crm.fluxo_eventos set processado_em = now() where chave = 'msg:' || p_evento;
    return true;
  end if;
  select ultima_entrada_em into v_ult from crm.contato_atividade where contato = v_c;
  insert into crm.contato_atividade (contato, canal_id, destino, nome, primeira_entrada_em, ultima_entrada_em, ultima_mensagem)
  values (v_c, p_canal, p_destino, p_nome, v_q, v_q, left(p_texto, 2000))
  on conflict (contato) do update set canal_id = excluded.canal_id, destino = coalesce(excluded.destino, crm.contato_atividade.destino),
    nome = coalesce(excluded.nome, crm.contato_atividade.nome), ultima_entrada_em = greatest(crm.contato_atividade.ultima_entrada_em, excluded.ultima_entrada_em),
    ultima_mensagem = excluded.ultima_mensagem;
  perform crm.fluxo_evento('cliente_respondeu', 'msg:' || p_evento, jsonb_build_object('canal', v_tipo, 'texto', left(p_texto, 2000)), null, null, null, v_c, p_nome, p_canal, p_destino, p_evento);
  if v_ult is null or v_ult < v_q - interval '7 days' then
    perform crm.fluxo_evento('nova_conversa', 'nova:' || p_evento, jsonb_build_object('canal', v_tipo), null, null, null, v_c, p_nome, p_canal, p_destino, p_evento);
  end if;
  for v_f in select distinct g->'cfg'->>'fila' from crm.fluxos f join crm.fluxo_versoes v on v.fluxo_id = f.id and v.versao = f.versao_publicada
             cross join jsonb_array_elements(v.definicao->'gatilhos') g
             where f.status = 'publicado' and f.excluido_em is null and g->>'tipo' = 'fora_horario' and coalesce(g->'cfg'->>'fila', '') <> '' loop
    if not crm.fila_aberta(v_f, v_q) then
      perform crm.fluxo_evento('fora_horario', 'fora:' || p_evento || ':' || v_f, jsonb_build_object('fila', v_f, 'canal', v_tipo), null, null, null, v_c, p_nome, p_canal, p_destino, p_evento);
    end if;
  end loop;
  -- pediu para parar: registra a recusa e tira o contato de todos os fluxos
  if crm.pediu_para_parar(p_texto) then
    insert into crm.consentimentos (contato_ref, finalidade, revogado_em, origem) values (v_c, 'automacao', v_q, 'cliente respondeu “' || left(btrim(p_texto), 40) || '”');
    update crm.fluxo_inscricoes set estado = 'saiu', erro = 'o cliente pediu para não receber mensagens automáticas', concluida_em = now(), atualizado_em = now()
     where contato = v_c and estado in ('ativa','aguardando','esperando_resposta');
  end if;
  -- quem respondeu sai dos fluxos com "tirar o contato quando ele responder" (menos de quem estava esperando esta resposta)
  update crm.fluxo_inscricoes i set estado = 'saiu', erro = 'o cliente respondeu', concluida_em = now(), atualizado_em = now()
    from crm.fluxos f where f.id = i.fluxo_id and coalesce((f.configuracoes->>'parar_resposta')::boolean, false)
     and i.contato = v_c and i.estado in ('ativa','aguardando');
  -- quem estava esperando a resposta segue
  update crm.fluxo_inscricoes set espera = coalesce(espera, '{}') || jsonb_build_object('resposta', left(p_texto, 2000)), estado = 'ativa', proximo_em = now(), atualizado_em = now()
   where contato = v_c and estado = 'esperando_resposta';
  return true;
end $$;

-- eventos de tempo: só para os acionadores usados em fluxos publicados
create or replace function crm.fluxo_varrer() returns int
language plpgsql security definer set search_path = '' as $$
declare g record; v_m int; v_d int; n int := 0; k int;
begin
  for g in select distinct x->>'tipo' as tipo, x->'cfg' as cfg
           from crm.fluxos f join crm.fluxo_versoes v on v.fluxo_id = f.id and v.versao = f.versao_publicada
           cross join jsonb_array_elements(v.definicao->'gatilhos') x
           where f.status = 'publicado' and f.excluido_em is null
             and x->>'tipo' in ('cliente_sem_responder','sem_resposta','tarefa_atrasada','negocio_parado','data_campo') loop
    if g.tipo in ('cliente_sem_responder','sem_resposta') then
      v_m := nullif(g.cfg->>'minutos', '')::int; continue when v_m is null or v_m < 1;
      if g.tipo = 'cliente_sem_responder' then
        insert into crm.fluxo_eventos (tipo, chave, contato, contato_nome, canal_id, destino, dados)
        select 'cliente_sem_responder', 'semcli:' || a.contato || ':' || (extract(epoch from a.ultima_saida_em))::bigint || ':' || v_m,
               a.contato, a.nome, a.canal_id, a.destino, jsonb_build_object('minutos', v_m)
        from crm.contato_atividade a
        where a.ultima_saida_em <= now() - make_interval(mins => v_m) and a.ultima_saida_em > now() - interval '7 days'
          and (a.ultima_entrada_em is null or a.ultima_entrada_em < a.ultima_saida_em)
        on conflict (chave) do nothing;
      else
        insert into crm.fluxo_eventos (tipo, chave, contato, contato_nome, canal_id, destino, dados)
        select 'sem_resposta', 'semeq:' || a.contato || ':' || (extract(epoch from a.ultima_entrada_em))::bigint || ':' || v_m,
               a.contato, a.nome, a.canal_id, a.destino, jsonb_build_object('minutos', v_m)
        from crm.contato_atividade a
        where a.ultima_entrada_em <= now() - make_interval(mins => v_m) and a.ultima_entrada_em > now() - interval '7 days'
          and (a.ultima_saida_em is null or a.ultima_saida_em < a.ultima_entrada_em)
        on conflict (chave) do nothing;
      end if;
    elsif g.tipo = 'tarefa_atrasada' then
      insert into crm.fluxo_eventos (tipo, chave, tarefa_id, negocio_id, contato, contato_nome, destino, dados)
      select 'tarefa_atrasada', 'tarefa:' || t.id || ':' || (extract(epoch from t.quando))::bigint, t.id, t.negocio_id,
             crm.contato_chave('whatsapp', t.contato_telefone), t.contato_nome,
             case when crm.contato_chave('whatsapp', t.contato_telefone) is not null then right(regexp_replace(t.contato_telefone, '\D', '', 'g'), 11) end, '{}'
      from crm.tarefas t where not t.concluida and t.quando < now() and t.quando > now() - interval '7 days'
      on conflict (chave) do nothing;
    elsif g.tipo = 'negocio_parado' then
      v_d := nullif(g.cfg->>'dias', '')::int; continue when v_d is null;
      insert into crm.fluxo_eventos (tipo, chave, negocio_id, contato, contato_nome, destino, dados)
      select 'negocio_parado', 'parado:' || n.id || ':' || e.id || ':' || (extract(epoch from x.entrada))::bigint || ':' || v_d, n.id,
             case when n.telefone_norm is not null then 'whatsapp:' || n.telefone_norm end, n.nome, n.telefone_norm,
             jsonb_build_object('funil', f.slug, 'etapa', e.nome, 'dias', v_d)
      from crm.negocios n join crm.funil_etapas e on e.id = n.etapa_id join crm.funis f on f.id = n.funil_id
      cross join lateral (select coalesce((select max(h.criado_em) from crm.negocio_historico h where h.negocio_id = n.id and h.para_etapa_id = n.etapa_id), n.created_at) as entrada) x
      where f.slug = g.cfg->>'funil' and e.nome = g.cfg->>'etapa' and n.fechado_em is null and x.entrada <= now() - make_interval(days => v_d)
      on conflict (chave) do nothing;
    elsif g.tipo = 'data_campo' then
      v_d := coalesce(nullif(g.cfg->>'dias_antes', '')::int, 0); continue when coalesce(g.cfg->>'campo', '') = '';
      insert into crm.fluxo_eventos (tipo, chave, negocio_id, contato, contato_nome, destino, dados)
      select 'data_campo', 'data:' || n.id || ':' || (g.cfg->>'campo') || ':' || left(n.campos->>(g.cfg->>'campo'), 10) || ':' || v_d, n.id,
             case when n.telefone_norm is not null then 'whatsapp:' || n.telefone_norm end, n.nome, n.telefone_norm,
             jsonb_build_object('campo', g.cfg->>'campo', 'dias_antes', v_d)
      from crm.negocios n
      where n.campos->>(g.cfg->>'campo') ~ '^\d{4}-\d{2}-\d{2}'
        and left(n.campos->>(g.cfg->>'campo'), 10)::date - v_d = (now() at time zone 'America/Sao_Paulo')::date
      on conflict (chave) do nothing;
    end if;
    get diagnostics k = row_count; n := n + k;
  end loop;
  return n;
end $$;

-- ---- inscrição ----------------------------------------------------------------------------------------------------
create or replace function crm.fluxo_gatilho_casa(p_cfg jsonb, p_dados jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(case
    when kv.key = 'palavras' then coalesce(btrim(kv.value #>> '{}'), '') = ''
      or exists (select 1 from unnest(string_to_array(lower(kv.value #>> '{}'), ',')) w
                 where btrim(w) <> '' and position(btrim(w) in lower(coalesce(p_dados->>'texto', ''))) > 0)
    when kv.key = 'canal' then coalesce(kv.value #>> '{}', '') in ('', 'qualquer') or kv.value #>> '{}' = p_dados->>'canal'
    when coalesce(kv.value #>> '{}', '') = '' then true
    else kv.value #>> '{}' = p_dados->>kv.key end), true)
  from jsonb_each(coalesce(p_cfg, '{}')) kv
$$;

create or replace function crm.fluxo_inscrever_um(p_fluxo uuid, p_ev crm.fluxo_eventos) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f crm.fluxos%rowtype; v_id uuid; v_re boolean; v_c text := p_ev.contato; v_dest text := p_ev.destino; v_nome text := p_ev.contato_nome;
begin
  select * into f from crm.fluxos where id = p_fluxo and status = 'publicado' and excluido_em is null and versao_publicada is not null;
  if not found then return null; end if;
  if p_ev.negocio_id is not null and v_c is null then
    select case when n.telefone_norm is not null then 'whatsapp:' || n.telefone_norm end, n.telefone_norm, coalesce(v_nome, n.nome)
      into v_c, v_dest, v_nome from crm.negocios n where n.id = p_ev.negocio_id;
  end if;
  v_re := coalesce((f.configuracoes->>'reinscricao')::boolean, false);
  if exists (select 1 from crm.fluxo_inscricoes x where x.fluxo_id = p_fluxo
             and (v_re = false or x.estado in ('ativa','aguardando','esperando_resposta'))
             and ((p_ev.negocio_id is not null and x.negocio_id = p_ev.negocio_id)
               or (p_ev.negocio_id is null and v_c is not null and x.contato = v_c)
               or (p_ev.atendimento_id is not null and x.atendimento_id = p_ev.atendimento_id)
               or (p_ev.tarefa_id is not null and x.tarefa_id = p_ev.tarefa_id))) then
    return null;
  end if;
  insert into crm.fluxo_inscricoes (fluxo_id, versao, evento_id, negocio_id, atendimento_id, tarefa_id, contato, contato_nome, canal_id, destino)
  values (p_fluxo, f.versao_publicada, p_ev.id, p_ev.negocio_id, p_ev.atendimento_id, p_ev.tarefa_id, v_c, v_nome, p_ev.canal_id, v_dest)
  returning id into v_id;
  return v_id;
end $$;

create or replace function crm.fluxo_processar_eventos(p_limite int default 500) returns int
language plpgsql security definer set search_path = '' as $$
declare e crm.fluxo_eventos%rowtype; f record; n int := 0;
begin
  for e in select * from crm.fluxo_eventos where processado_em is null order by id limit p_limite for update skip locked loop
    for f in select x.id, v.definicao from crm.fluxos x join crm.fluxo_versoes v on v.fluxo_id = x.id and v.versao = x.versao_publicada
             where x.status = 'publicado' and x.excluido_em is null loop
      if exists (select 1 from jsonb_array_elements(f.definicao->'gatilhos') g where g->>'tipo' = e.tipo and crm.fluxo_gatilho_casa(g->'cfg', e.dados)) then
        if crm.fluxo_inscrever_um(f.id, e) is not null then n := n + 1; end if;
      end if;
    end loop;
    update crm.fluxo_eventos set processado_em = now() where id = e.id;
  end loop;
  return n;
end $$;

-- ---- execução ------------------------------------------------------------------------------------------------------
create or replace function crm.fluxo_reg(i crm.fluxo_inscricoes, p jsonb, p_res text, p_det text) returns void
language sql security definer set search_path = '' as $$
  insert into crm.fluxo_registros (inscricao_id, fluxo_id, contato_nome, passo_id, passo_tipo, resultado, detalhe)
  values (i.id, i.fluxo_id, i.contato_nome, p->>'id', p->>'tipo', p_res, left(p_det, 500))
$$;

create or replace function crm.fluxo_preencher(p_texto text, i crm.fluxo_inscricoes) returns text
language sql stable set search_path = '' as $$
  select replace(replace(replace(coalesce(p_texto, ''),
    '{nome}', split_part(btrim(coalesce(i.contato_nome, (select n.nome from crm.negocios n where n.id = i.negocio_id), '')), ' ', 1)),
    '[Nome]', split_part(btrim(coalesce(i.contato_nome, (select n.nome from crm.negocios n where n.id = i.negocio_id), '')), ' ', 1)),
    '{empresa}', coalesce((select n.empresa from crm.negocios n where n.id = i.negocio_id), ''))
$$;

-- manda uma mensagem ao contato pela fila de saída, respeitando as regras do WhatsApp.
-- Devolve: enviada | sem_destino | recusou | fora_24h | repetida… | adiar|<quando>|<motivo>
create or replace function crm.fluxo_mandar(i crm.fluxo_inscricoes, p_cfg jsonb, p_texto text, p_chave text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_canal uuid := i.canal_id; v_dest text := i.destino; v_fila text := coalesce(nullif(p_cfg->>'fila_horario', ''), 'triagem');
  v_tipo text; v_contato text; w jsonb; n_min int; n_hora int; n_dia int; v_amanha timestamptz;
begin
  if btrim(coalesce(p_texto, '')) = '' then return 'sem_destino'; end if;
  if coalesce((p_cfg->>'so_horario')::boolean, false) and not crm.fila_aberta(v_fila) then
    return 'adiar|' || crm.fila_proxima_abertura(v_fila) || '|fora do horário do setor'; end if;
  if v_dest is null and i.negocio_id is not null then select n.telefone_norm into v_dest from crm.negocios n where n.id = i.negocio_id; end if;
  if v_canal is null then select c.id into v_canal from crm.canais c where c.tipo = 'whatsapp' and c.principal and c.ativo limit 1; end if;
  if v_canal is null or v_dest is null then return 'sem_destino'; end if;
  select c.tipo into v_tipo from crm.canais c where c.id = v_canal;
  v_contato := coalesce(i.contato, crm.contato_chave(v_tipo, v_dest));
  if not crm.automacao_permitida(v_contato) then return 'recusou'; end if;
  if v_tipo = 'instagram' and coalesce((select a.ultima_entrada_em from crm.contato_atividade a where a.contato = v_contato), '-infinity') < now() - interval '24 hours' then
    return 'fora_24h'; end if;
  if v_tipo = 'whatsapp' then
    w := crm.automacao_cfg();
    if not crm.janela_aberta(w->>'dias', (w->>'inicio')::time, (w->>'fim')::time, now()) then
      return 'adiar|' || crm.janela_proxima(w->>'dias', (w->>'inicio')::time, (w->>'fim')::time, now()) || '|fora do horário de envio automático'; end if;
    select count(*) filter (where s.created_at > now() - interval '1 minute'), count(*) filter (where s.created_at > now() - interval '1 hour'), count(*)
      into n_min, n_hora, n_dia
      from crm.saida_mensagens s where s.canal_id = v_canal and s.origem = 'automacao' and s.created_at > now() - interval '24 hours';
    if n_dia >= (w->>'por_dia')::int then
      v_amanha := (((now() at time zone 'America/Sao_Paulo')::date + 1)::timestamp) at time zone 'America/Sao_Paulo';
      return 'adiar|' || crm.janela_proxima(w->>'dias', (w->>'inicio')::time, (w->>'fim')::time, v_amanha) || '|limite diário de mensagens automáticas'; end if;
    if n_hora >= (w->>'por_hora')::int then return 'adiar|' || (now() + interval '15 minutes') || '|limite por hora de mensagens automáticas'; end if;
    if n_min >= (w->>'por_minuto')::int then return 'adiar|' || (now() + interval '1 minute') || '|limite por minuto de mensagens automáticas'; end if;
  end if;
  begin
    perform crm.enfileirar_mensagem(p_texto, p_chave, null, null, v_dest, v_canal, 'automacao');
  exception when others then return 'repetida: ' || sqlerrm;
  end;
  return 'enviada';
end $$;

create or replace function crm.fluxo_condicao(c jsonb, i crm.fluxo_inscricoes) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare s text := c->>'sujeito'; op text := coalesce(c->>'operador', 'e'); v text := lower(btrim(coalesce(c->>'valor', ''))); a text;
begin
  case s
    when 'etapa'  then select e.nome into a from crm.negocios n join crm.funil_etapas e on e.id = n.etapa_id where n.id = i.negocio_id;
    when 'funil'  then select f.slug into a from crm.negocios n join crm.funis f on f.id = n.funil_id where n.id = i.negocio_id;
    when 'origem' then select o.nome into a from crm.negocios n join crm.origens o on o.id = n.origem_id where n.id = i.negocio_id;
    when 'valor'  then select n.valor::text into a from crm.negocios n where n.id = i.negocio_id;
    when 'canal'  then a := coalesce((select c2.tipo from crm.canais c2 where c2.id = i.canal_id), split_part(i.contato, ':', 1));
    when 'resposta' then a := coalesce(i.espera->>'resposta', (select x.ultima_mensagem from crm.contato_atividade x where x.contato = i.contato));
    when 'tag' then return null;                                  -- tags do contato: passo 2
    else return false;
  end case;
  a := lower(btrim(a));
  if a is null or a = '' then return op = 'nao_e'; end if;
  return case op
    when 'e' then a = v when 'nao_e' then a <> v when 'contem' then position(v in a) > 0
    when 'maior' then case when a ~ '^-?[0-9]+([.][0-9]+)?$' and v ~ '^-?[0-9]+([.,][0-9]+)?$' then a::numeric > replace(v, ',', '.')::numeric else false end
    when 'menor' then case when a ~ '^-?[0-9]+([.][0-9]+)?$' and v ~ '^-?[0-9]+([.,][0-9]+)?$' then a::numeric < replace(v, ',', '.')::numeric else false end
    else false end;
end $$;

create or replace function crm.fluxo_pos_prox(p text[]) returns text[] language sql immutable as $$
  select p[1:array_length(p, 1) - 1] || (p[array_length(p, 1)]::int + 1)::text
$$;

-- anda com uma inscrição até ela esperar ou terminar (no máximo 40 passos por vez)
create or replace function crm.fluxo_rodar(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  i crm.fluxo_inscricoes%rowtype; def jsonb; fcfg jsonb; fnome text; p jsonb; c jsonb; t text; n int := 0; acao text; k int;
  r text; txt text; idx int; conds jsonb; modo text; ok boolean; res boolean; nota text;
  neg crm.negocios%rowtype; v_et uuid; v_id uuid; v_resp uuid; delta interval;
begin
  select * into i from crm.fluxo_inscricoes where id = p_id for update skip locked;
  if not found or i.estado not in ('ativa','aguardando','esperando_resposta') then return 'ignorada'; end if;
  select v.definicao into def from crm.fluxo_versoes v where v.fluxo_id = i.fluxo_id and v.versao = i.versao;
  select f.configuracoes, f.nome into fcfg, fnome from crm.fluxos f where f.id = i.fluxo_id;
  fcfg := coalesce(fcfg, '{}');
  loop
    n := n + 1; exit when n > 40;
    p := def #> i.pos;
    if p is null then i.estado := 'concluida'; i.concluida_em := now(); exit; end if;
    t := p->>'tipo'; c := coalesce(p->'cfg', '{}'); acao := 'seguir'; k := null;
    begin
      if i.negocio_id is not null then select * into neg from crm.negocios where id = i.negocio_id; else neg := null; end if;
      case t
      when 'mensagem', 'resposta_rapida' then
        txt := case when t = 'mensagem' then c->>'texto' else (select x.texto from crm.respostas_rapidas x where x.atalho = c->>'atalho') end;
        r := crm.fluxo_mandar(i, fcfg, crm.fluxo_preencher(txt, i), 'fluxo:' || i.id || ':' || (p->>'id'));
        if r like 'adiar|%' then
          i.estado := 'aguardando'; i.proximo_em := split_part(r, '|', 2)::timestamptz; acao := 'parar';
          perform crm.fluxo_reg(i, p, 'aguardando', split_part(r, '|', 3) || ': envia em ' || to_char(i.proximo_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'));
        else
          perform crm.fluxo_reg(i, p, case when r = 'enviada' then 'executado' else 'pulado' end,
            case r when 'enviada' then 'mensagem na fila de envio' when 'sem_destino' then 'contato sem telefone/canal ou texto vazio'
                   when 'recusou' then 'o contato pediu para não receber mensagens automáticas'
                   when 'fora_24h' then 'Instagram: só dá para responder até 24 h depois da última mensagem do cliente' else r end);
        end if;
      when 'avisar_equipe' then
        if coalesce(c->>'pessoa', '') ~ '^[0-9a-f-]{36}$' and exists (select 1 from crm.perfis x where x.user_id = (c->>'pessoa')::uuid and x.ativo) then
          insert into crm.avisos (user_id, texto, fluxo_id, inscricao_id)
          values ((c->>'pessoa')::uuid, left(crm.fluxo_preencher(c->>'texto', i) || ' · ' || coalesce(i.contato_nome, 'contato') || ' (fluxo “' || fnome || '”)', 1000), i.fluxo_id, i.id);
          perform crm.fluxo_reg(i, p, 'executado', 'aviso criado');
        else perform crm.fluxo_reg(i, p, 'pulado', 'pessoa não encontrada'); end if;
      when 'tag_adicionar', 'tag_remover' then
        perform crm.fluxo_reg(i, p, 'pulado', 'tags do contato dependem do vínculo com o sistema jurídico (passo 2)');
      when 'transferir' then
        if i.atendimento_id is not null then
          update crm.atendimentos set fila_ref = c->>'fila', responsavel_id = null, status = 'aguardando' where id = i.atendimento_id;
          perform crm.fluxo_reg(i, p, 'executado', 'transferido para ' || (c->>'fila'));
        else perform crm.fluxo_reg(i, p, 'pulado', 'sem atendimento vinculado (passo 2)'); end if;
      when 'atribuir' then
        v_resp := case when coalesce(c->>'pessoa', '') ~ '^[0-9a-f-]{36}$' then (c->>'pessoa')::uuid end;
        if v_resp is null and i.atendimento_id is not null then
          v_resp := crm.atribuir_rodizio((select a.fila_ref from crm.atendimentos a where a.id = i.atendimento_id));
        end if;
        if v_resp is null or (i.negocio_id is null and i.atendimento_id is null) then perform crm.fluxo_reg(i, p, 'pulado', 'sem responsável ou sem negócio/atendimento');
        else
          if i.negocio_id is not null then update crm.negocios set responsavel_id = v_resp where id = i.negocio_id; end if;
          if i.atendimento_id is not null then update crm.atendimentos set responsavel_id = v_resp where id = i.atendimento_id; end if;
          perform crm.fluxo_reg(i, p, 'executado', 'responsável: ' || coalesce((select x.nome from crm.perfis x where x.user_id = v_resp), v_resp::text));
        end if;
      when 'atualizar_campo' then
        if i.negocio_id is null then perform crm.fluxo_reg(i, p, 'pulado', 'sem negócio');
        else update crm.negocios set campos = campos || jsonb_build_object(c->>'campo', crm.fluxo_preencher(c->>'valor', i)) where id = i.negocio_id;
             perform crm.fluxo_reg(i, p, 'executado', (c->>'campo') || ' atualizado'); end if;
      when 'criar_negocio' then
        if i.negocio_id is not null then perform crm.fluxo_reg(i, p, 'pulado', 'o contato já tem negócio neste fluxo');
        else
          select n2.id into v_id from crm.negocios n2 join crm.funis f on f.id = n2.funil_id
           where f.slug = c->>'funil' and n2.fechado_em is null and i.destino is not null and n2.telefone_norm = right(regexp_replace(i.destino, '\D', '', 'g'), 11) limit 1;
          if v_id is null then
            insert into crm.negocios (funil_id, etapa_id, nome, telefone, origem_id)
            select f.id, (select e.id from crm.funil_etapas e where e.funil_id = f.id and e.tipo = 'aberta' order by e.ordem limit 1),
                   coalesce(nullif(btrim(i.contato_nome), ''), i.destino, 'Contato'), case when i.contato like 'whatsapp:%' then i.destino end,
                   (select o.id from crm.origens o where o.nome = c->>'origem')
            from crm.funis f where f.slug = c->>'funil' returning id into v_id;
            perform crm.fluxo_reg(i, p, 'executado', 'negócio criado');
          else perform crm.fluxo_reg(i, p, 'executado', 'negócio existente vinculado'); end if;
          i.negocio_id := v_id;
        end if;
      when 'mover_etapa', 'marcar_ganho', 'marcar_perdido' then
        if neg.id is null then perform crm.fluxo_reg(i, p, 'pulado', 'sem negócio');
        else
          if t = 'mover_etapa' then
            select e.id into v_et from crm.funil_etapas e join crm.funis f on f.id = e.funil_id
             where f.slug = c->>'funil' and e.nome = c->>'etapa' and e.funil_id = neg.funil_id and e.tipo <> 'perdido';
          else
            select e.id into v_et from crm.funil_etapas e where e.funil_id = neg.funil_id and e.tipo = case when t = 'marcar_ganho' then 'ganho' else 'perdido' end order by e.ordem limit 1;
          end if;
          if v_et is null then perform crm.fluxo_reg(i, p, 'pulado', 'etapa não encontrada no funil deste negócio (para perder, use "Marcar como perdido")');
          elsif v_et = neg.etapa_id then perform crm.fluxo_reg(i, p, 'pulado', 'o negócio já está nesta etapa');
          else
            update crm.negocios set etapa_id = v_et,
                   motivo_perda_id = case when t = 'marcar_perdido' then coalesce((select m.id from crm.motivos_perda m where m.nome = c->>'motivo'), (select m.id from crm.motivos_perda m order by m.nome limit 1)) else motivo_perda_id end
             where id = neg.id;
            perform crm.fluxo_reg(i, p, 'executado', 'etapa: ' || (select e.nome from crm.funil_etapas e where e.id = v_et));
          end if;
        end if;
      when 'criar_atividade' then
        if neg.id is null then perform crm.fluxo_reg(i, p, 'pulado', 'sem negócio');
        else
          insert into crm.atividades (negocio_id, tipo, titulo, quando, responsavel_id, origem)
          values (neg.id, coalesce(nullif(c->>'tipo_atividade', ''), 'tarefa'), left(crm.fluxo_preencher(c->>'titulo', i), 200),
                  now() + make_interval(days => coalesce(nullif(c->>'em_dias', '')::int, 0)), neg.responsavel_id, 'automacao');
          perform crm.fluxo_reg(i, p, 'executado', 'atividade criada');
        end if;
      when 'criar_tarefa' then
        v_resp := case when coalesce(c->>'responsavel', '') ~ '^[0-9a-f-]{36}$' then (c->>'responsavel')::uuid end;
        if v_resp is null or not crm.pode_receber_tarefa(v_resp) then perform crm.fluxo_reg(i, p, 'pulado', 'responsável não pode receber tarefas');
        else
          insert into crm.tarefas (titulo, descricao, quando, responsavel_id, criado_por, contato_nome, contato_telefone, negocio_id)
          values (left(crm.fluxo_preencher(c->>'titulo', i), 200), 'Criada pelo fluxo “' || fnome || '”',
                  now() + make_interval(hours => coalesce(nullif(c->>'em_horas', '')::int, 24)), v_resp, null, i.contato_nome, i.destino, i.negocio_id);
          perform crm.fluxo_reg(i, p, 'executado', 'tarefa criada');
        end if;
      when 'aguardar' then
        delta := case c->>'unidade' when 'minutos' then make_interval(mins => coalesce(nullif(c->>'quantidade', '')::int, 1))
                                   when 'horas' then make_interval(hours => coalesce(nullif(c->>'quantidade', '')::int, 1))
                                   else make_interval(days => coalesce(nullif(c->>'quantidade', '')::int, 1)) end;
        i.pos := crm.fluxo_pos_prox(i.pos); i.estado := 'aguardando'; i.proximo_em := now() + delta; acao := 'parar';
        perform crm.fluxo_reg(i, p, 'aguardando', 'segue em ' || to_char(i.proximo_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'));
      when 'aguardar_resposta' then
        if i.espera is null or i.espera->>'passo' is distinct from p->>'id' then
          i.espera := jsonb_build_object('passo', p->>'id'); i.estado := 'esperando_resposta';
          i.proximo_em := now() + make_interval(hours => coalesce(nullif(c->>'horas', '')::int, 24)); acao := 'parar';
          perform crm.fluxo_reg(i, p, 'aguardando', 'esperando resposta até ' || to_char(i.proximo_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'));
        else
          k := case when i.espera ? 'resposta' then 0 else 1 end; acao := 'ramo'; i.espera := null;
          perform crm.fluxo_reg(i, p, 'caminho', p->'ramos'->k->>'nome');
        end if;
      when 'se' then
        conds := case when jsonb_typeof(c->'condicoes') = 'array' then c->'condicoes' else jsonb_build_array(c) end;
        modo := coalesce(nullif(c->>'modo', ''), 'todas'); ok := modo = 'todas'; nota := '';
        for idx in 0 .. jsonb_array_length(conds) - 1 loop
          res := crm.fluxo_condicao(conds->idx, i);
          if res is null then nota := ' (tag do contato só depois do passo 2: conta como “não”)'; res := false; end if;
          if modo = 'todas' then ok := ok and res; else ok := ok or res; end if;
        end loop;
        k := case when ok then 0 else 1 end; acao := 'ramo';
        perform crm.fluxo_reg(i, p, 'caminho', (p->'ramos'->k->>'nome') || nota);
      when 'horario' then
        k := case when crm.fila_aberta(c->>'fila') then 0 else 1 end; acao := 'ramo';
        perform crm.fluxo_reg(i, p, 'caminho', p->'ramos'->k->>'nome');
      when 'ir_para' then
        if coalesce(c->>'fluxo', '') ~ '^[0-9a-f-]{36}$' then
          v_id := crm.fluxo_inscrever_um((c->>'fluxo')::uuid, row(null, 'ir_para', 'ir:' || i.id, i.negocio_id, i.atendimento_id, i.tarefa_id, null,
                     i.contato, i.contato_nome, i.canal_id, i.destino, '{}'::jsonb, now(), now())::crm.fluxo_eventos);
          perform crm.fluxo_reg(i, p, case when v_id is null then 'pulado' else 'executado' end,
            case when v_id is null then 'o outro fluxo não está publicado ou o contato já passou por ele' else 'inscrito no outro fluxo' end);
        else perform crm.fluxo_reg(i, p, 'pulado', 'fluxo não escolhido'); end if;
        acao := 'fim';
      when 'fim' then
        perform crm.fluxo_reg(i, p, 'executado', 'fluxo encerrado'); acao := 'fim';
      when 'webhook' then
        if coalesce(c->>'url', '') ~ '^https://' then
          insert into crm.fluxo_webhooks (inscricao_id, url, corpo) values (i.id, c->>'url', jsonb_build_object(
            'fluxo', fnome, 'contato', i.contato_nome, 'telefone', i.destino, 'quando', now(),
            'negocio', case when neg.id is null then null else jsonb_build_object('id', neg.id, 'nome', neg.nome, 'empresa', neg.empresa, 'valor', neg.valor,
              'etapa', (select e.nome from crm.funil_etapas e where e.id = neg.etapa_id), 'funil', (select f.slug from crm.funis f where f.id = neg.funil_id)) end));
          perform crm.fluxo_reg(i, p, 'executado', 'webhook na fila de envio');
        else perform crm.fluxo_reg(i, p, 'pulado', 'endereço do webhook inválido'); end if;
      else
        perform crm.fluxo_reg(i, p, 'pulado', 'passo desconhecido');
      end case;
    exception when others then
      i.estado := 'erro'; i.erro := left(sqlerrm, 500); acao := 'parar';
      perform crm.fluxo_reg(i, p, 'erro', sqlerrm);
    end;
    if acao = 'seguir' then i.pos := crm.fluxo_pos_prox(i.pos);
    elsif acao = 'ramo' then i.pos := i.pos || array['ramos', k::text, 'passos', '0'];
    elsif acao = 'fim' then i.estado := 'concluida'; i.concluida_em := now(); exit;
    else exit; end if;
  end loop;
  if i.estado in ('ativa') and n > 40 then i.proximo_em := now(); end if;   -- continua no próximo ciclo
  update crm.fluxo_inscricoes set pos = i.pos, estado = i.estado, proximo_em = i.proximo_em, espera = i.espera, vars = i.vars, erro = i.erro,
         concluida_em = i.concluida_em, negocio_id = i.negocio_id, atualizado_em = now() where id = i.id;
  return i.estado;
end $$;

-- ciclo completo (chamado pela Edge Function fluxos-motor a cada minuto)
create or replace function crm.fluxo_ciclo(p_limite int default 100) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ev int; v_in int; v_ex int := 0; v_id uuid;
begin
  v_ev := crm.fluxo_varrer();
  v_in := crm.fluxo_processar_eventos(500);
  for v_id in select id from crm.fluxo_inscricoes
              where estado in ('ativa','aguardando','esperando_resposta') and proximo_em <= now()
              order by proximo_em limit p_limite loop
    perform crm.fluxo_rodar(v_id); v_ex := v_ex + 1;
  end loop;
  delete from crm.fluxo_eventos where processado_em < now() - interval '30 days';
  return jsonb_build_object('eventos_de_tempo', v_ev, 'inscricoes', v_in, 'executadas', v_ex);
end $$;

-- webhooks (o envio HTTP é feito pela Edge Function)
create or replace function crm.fluxo_webhooks_pendentes(p_limite int default 20) returns setof crm.fluxo_webhooks
language sql security definer set search_path = '' as $$
  update crm.fluxo_webhooks set proximo_em = now() + interval '5 minutes'
   where id in (select id from crm.fluxo_webhooks where estado = 'pendente' and proximo_em <= now() order by id limit p_limite for update skip locked)
  returning *
$$;
create or replace function crm.fluxo_webhook_marcar(p_id bigint, p_ok boolean, p_resposta text default null) returns void
language sql security definer set search_path = '' as $$
  update crm.fluxo_webhooks set tentativas = tentativas + 1, resposta = left(p_resposta, 300),
         estado = case when p_ok then 'enviado' when tentativas + 1 >= 3 then 'falhou' else 'pendente' end,
         enviado_em = case when p_ok then now() end,
         proximo_em = now() + make_interval(mins => case tentativas when 0 then 2 else 10 end)
   where id = p_id
$$;

-- ---- tela -------------------------------------------------------------------------------------------------------
create or replace function crm.fluxo_contagens() returns table (fluxo_id uuid, inscritos int, ativos int)
language sql stable security invoker set search_path = '' as $$
  select i.fluxo_id, count(*)::int, count(*) filter (where i.estado in ('ativa','aguardando','esperando_resposta'))::int
  from crm.fluxo_inscricoes i group by i.fluxo_id
$$;
create or replace function crm.fluxo_inscricoes_de(p_fluxo uuid, p_limite int default 200)
returns table (id uuid, contato_nome text, contato text, estado text, passo_tipo text, proximo_em timestamptz, erro text, criado_em timestamptz)
language sql stable security invoker set search_path = '' as $$
  select i.id, coalesce(i.contato_nome, i.contato), i.contato, i.estado, (v.definicao #> i.pos)->>'tipo', i.proximo_em, i.erro, i.criado_em
  from crm.fluxo_inscricoes i left join crm.fluxo_versoes v on v.fluxo_id = i.fluxo_id and v.versao = i.versao
  where i.fluxo_id = p_fluxo order by i.criado_em desc limit p_limite
$$;
create or replace function crm.fluxo_inscricao_remover(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores tiram contatos dos fluxos'; end if;
  update crm.fluxo_inscricoes set estado = 'saiu', erro = 'removido por ' || coalesce((select nome from crm.perfis where user_id = auth.uid()), 'líder'),
         concluida_em = now(), atualizado_em = now() where id = p_id and estado in ('ativa','aguardando','esperando_resposta');
  if not found then raise exception 'inscrição não encontrada ou já terminada'; end if;
end $$;
create or replace function crm.aviso_lido(p_id bigint default null) returns void
language sql security definer set search_path = '' as $$
  update crm.avisos set lido_em = now() where user_id = auth.uid() and lido_em is null and (p_id is null or id = p_id)
$$;
-- apagar o fluxo tira quem estava nele
create or replace function crm.fluxo_excluir(p_id uuid, p_excluir boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores apagam fluxos'; end if;
  if coalesce(p_excluir, true) then
    update crm.fluxos set excluido_em = now(), status = 'rascunho', ativo = false where id = p_id and excluido_em is null;
    if not found then raise exception 'fluxo não encontrado'; end if;
    update crm.fluxo_inscricoes set estado = 'saiu', erro = 'fluxo apagado', concluida_em = now() where fluxo_id = p_id and estado in ('ativa','aguardando','esperando_resposta');
  else
    update crm.fluxos set excluido_em = null where id = p_id and excluido_em is not null;
    if not found then raise exception 'fluxo não encontrado'; end if;
  end if;
end $$;

-- ---- permissões -------------------------------------------------------------------------------------------------
select crm.proteger('crm.fluxo_inscricoes', 'gestao');
select crm.proteger('crm.fluxo_registros', 'gestao');
select crm.proteger('crm.fluxo_eventos', 'admin');
select crm.proteger('crm.fluxo_webhooks', 'admin');
select crm.proteger('crm.contato_atividade', 'admin');
alter table crm.avisos enable row level security;
revoke all on crm.avisos from anon, authenticated;
grant select on crm.avisos to authenticated;
drop policy if exists p_avisos_sel on crm.avisos;
create policy p_avisos_sel on crm.avisos for select to authenticated using (user_id = auth.uid() and crm.sessao_valida());
revoke insert, update, delete on crm.fluxo_inscricoes, crm.fluxo_registros, crm.fluxo_eventos, crm.fluxo_webhooks, crm.contato_atividade from authenticated;

revoke all on function crm.fluxo_evento(text,text,jsonb,uuid,uuid,uuid,text,text,uuid,text,bigint), crm.fluxo_mensagens_pendentes(int),
  crm.fluxo_registrar_mensagem(bigint,uuid,text,text,text,text,timestamptz,boolean), crm.fluxo_varrer(), crm.fluxo_inscrever_um(uuid,crm.fluxo_eventos),
  crm.fluxo_processar_eventos(int), crm.fluxo_reg(crm.fluxo_inscricoes,jsonb,text,text), crm.fluxo_mandar(crm.fluxo_inscricoes,jsonb,text,text),
  crm.fluxo_condicao(jsonb,crm.fluxo_inscricoes), crm.fluxo_rodar(uuid), crm.fluxo_ciclo(int), crm.fluxo_webhooks_pendentes(int),
  crm.fluxo_webhook_marcar(bigint,boolean,text) from public, anon, authenticated;
grant execute on function crm.fluxo_mensagens_pendentes(int), crm.fluxo_registrar_mensagem(bigint,uuid,text,text,text,text,timestamptz,boolean),
  crm.fluxo_ciclo(int), crm.fluxo_webhooks_pendentes(int), crm.fluxo_webhook_marcar(bigint,boolean,text), crm.fluxo_rodar(uuid) to service_role;
revoke all on function crm.fluxo_contagens(), crm.fluxo_inscricoes_de(uuid,int), crm.fluxo_inscricao_remover(uuid), crm.aviso_lido(bigint) from public, anon;
grant execute on function crm.fluxo_contagens(), crm.fluxo_inscricoes_de(uuid,int), crm.fluxo_inscricao_remover(uuid), crm.aviso_lido(bigint),
  crm.fila_aberta(text,timestamptz), crm.fila_proxima_abertura(text,timestamptz), crm.contato_chave(text,text),
  crm.janela_aberta(text,time,time,timestamptz), crm.janela_proxima(text,time,time,timestamptz), crm.automacao_cfg(), crm.automacao_permitida(text), crm.pediu_para_parar(text) to authenticated;
