-- crm_0014_agentes_ia_conexao.sql
-- Deixa os agentes de IA prontos para ligar (passo 5.3 do plano: IA sempre em rascunho).
--   - agentes semeados (Instagram, Google, clientes PF), todos DESLIGADOS e em modo rascunho;
--   - regras do que a IA não pode dizer (texto validado pela advogada; a validação é registrada por comando);
--   - fila de revisão humana ligada aos eventos recebidos dos canais (um rascunho por evento, nunca dois);
--   - aprovar = enviar pela fila de saída, com a pessoa que aprovou como autora;
--   - correção vira exemplo aprovado; recusa do contato desliga a IA só para ele;
--   - mudar para resposta automática: só administrador, com motivo, e só depois de 30 dias com 90% sem edição;
--   - canais Instagram (Meta) e Google (Perfil da Empresa) aceitos como provedores.
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico. Chaves de API NUNCA ficam aqui (Secrets das Edge Functions).

-- ---- canais: provedor Google -------------------------------------------------------------
alter table crm.canais drop constraint if exists canais_provedor_check;
alter table crm.canais add constraint canais_provedor_check check (provedor in ('evolution','meta','google','simulado'));

-- ---- agentes -------------------------------------------------------------------------------
alter table crm.agentes add column if not exists captacao       text;
alter table crm.agentes add column if not exists instrucoes     text;                 -- orientação do agente (vai no prompt)
alter table crm.agentes add column if not exists modelo         text not null default 'claude-opus-5-5';
alter table crm.agentes add column if not exists limite_diario  int  not null default 200 check (limite_diario > 0);
alter table crm.agentes add column if not exists requer_vinculo boolean not null default false; -- precisa do sistema jurídico (passo 2)
alter table crm.agentes alter column provedor set default 'anthropic';
comment on column crm.agentes.requer_vinculo is 'Agente que consulta dados de cliente/processo. Só liga depois do vínculo com o sistema jurídico (crm.config chave vinculo_juridico).';

insert into crm.agentes (slug, nome, canal, ativo, modo, provedor, requer_vinculo, responde_sozinho, transfere_quando, captacao, base_conhecimento, destino_registro, instrucoes)
values
 ('instagram', 'Agente Instagram', 'instagram', false, 'rascunho', 'anthropic', false,
  E'Dúvidas frequentes aprovadas (o que o escritório faz, horários, como agendar)\nTriagem inicial: entende o assunto e pede nome, telefone e cidade',
  E'Pedido de proposta ou valores\nCaso específico, reclamação ou menção a banco determinado\nPessoa pede para falar com humano',
  'Pede nome, telefone e cidade; quem aprova a resposta registra o lead no funil (origem Instagram).',
  'Artigos e perguntas frequentes aprovados', 'Revisão humana, canal Instagram',
  'Responda directs e comentários do Instagram do escritório. Seja breve e cordial. Para comentários públicos, nunca trate de caso concreto: convide para o direct.'),
 ('google', 'Agente Google (avaliações)', 'google', false, 'rascunho', 'anthropic', false,
  E'Escreve a resposta de avaliações positivas em tom institucional',
  E'Avaliação com 3 estrelas ou menos (vai direto a uma pessoa, sem rascunho)\nQualquer menção a cliente, caso ou processo',
  'Não capta; convida a entrar em contato pelos canais oficiais.',
  'Modelos de resposta institucional', 'Revisão humana, canal Google',
  'Responda avaliações públicas do Perfil da Empresa no Google em tom institucional, em até 3 frases, sem citar nenhum detalhe de caso, mesmo que a pessoa cite.')
on conflict (slug) do nothing;
-- (Agentes só no Instagram e no Google, onde o atendimento não é contínuo. No WhatsApp, quem atende é a equipe.)

create table if not exists crm.agentes_historico (
  id        bigint generated always as identity primary key,
  agente_id uuid not null references crm.agentes(id) on delete cascade,
  campo     text not null check (campo in ('ativo','modo')),
  de        text,
  para      text not null,
  motivo    text,
  user_id   uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
comment on table crm.agentes_historico is 'Quem ligou/desligou cada agente e quem mudou o modo (rascunho/automático), quando e por quê.';

-- O modo só muda pela função crm.agente_mudar_modo (que exige administrador e motivo). Ligar/desligar fica registrado.
create or replace function crm.agentes_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.modo is distinct from old.modo then
    if coalesce(current_setting('crm.mudar_modo_ok', true), '') <> '1' then
      raise exception 'o modo do agente só muda pela função crm.agente_mudar_modo' using errcode = '42501';
    end if;
    insert into crm.agentes_historico (agente_id, campo, de, para, motivo)
    values (new.id, 'modo', old.modo, new.modo, nullif(current_setting('crm.motivo', true), ''));
  end if;
  if new.ativo is distinct from old.ativo then
    insert into crm.agentes_historico (agente_id, campo, de, para, motivo)
    values (new.id, 'ativo', old.ativo::text, new.ativo::text, nullif(current_setting('crm.motivo', true), ''));
  end if;
  return new;
end $$;
drop trigger if exists trg_agentes_auditar on crm.agentes;
create trigger trg_agentes_auditar before update on crm.agentes for each row execute function crm.agentes_auditar();

-- ---- regras (o que nenhum agente pode dizer ou fazer) --------------------------------------
-- Entram ativas e sem validação. A validação já feita pela advogada é registrada uma vez por ambiente
-- (comando em docs/ativar-agentes-ia.md). Sem regra validada, nenhum agente liga e a função de IA não roda.
insert into crm.regras_ia (agente_id, tipo, regra, fonte)
select null, 'proibido', r.regra, r.fonte
from (values
 ('Opinar sobre chance de êxito, prever prazo de decisão ou estimar valor de condenação, acordo ou economia.', 'Código de Ética e Disciplina da OAB; Provimento 205/2021'),
 ('Prometer ou sugerir resultado, garantir benefício ou comparar com outros escritórios.', 'Código de Ética e Disciplina da OAB; Provimento 205/2021'),
 ('Dar orientação jurídica ou aconselhar sobre o caso concreto de quem não é cliente: a conversa vira atendimento humano.', 'Estatuto da Advocacia (Lei 8.906/94); Código de Ética e Disciplina da OAB'),
 ('Revelar dados de processo ou de outras pessoas; antes de informar andamento, confirmar a identidade.', 'Sigilo profissional (Estatuto e Código de Ética da OAB); LGPD'),
 ('Divulgar valores de honorários ou fazer captação ativa por mensagem não solicitada.', 'Provimento 205/2021; Código de Ética e Disciplina da OAB'),
 ('Fingir ser humano ou falar em nome de uma pessoa: o agente se identifica como assistente virtual.', 'Provimento 205/2021; dever de transparência')
) as r(regra, fonte)
where not exists (select 1 from crm.regras_ia x where x.agente_id is null and x.regra = r.regra);

-- ---- revisão humana ligada aos eventos dos canais -------------------------------------------
alter table crm.revisoes_ia add column if not exists webhook_evento_id bigint references crm.webhook_eventos(id) on delete set null;
alter table crm.revisoes_ia add column if not exists canal_id          uuid references crm.canais(id) on delete set null;
alter table crm.revisoes_ia add column if not exists contato           text;   -- ex.: whatsapp:5516..., instagram:1784..., google:<avaliação>
alter table crm.revisoes_ia add column if not exists contato_nome      text;
alter table crm.revisoes_ia add column if not exists destino           text;   -- para onde a resposta vai (formato do adaptador do canal)
alter table crm.revisoes_ia add column if not exists mensagem_cliente  text;
alter table crm.revisoes_ia add column if not exists motivo            text;   -- por que transferiu, bloqueou ou ignorou
alter table crm.revisoes_ia add column if not exists editada           boolean;
alter table crm.revisoes_ia add column if not exists saida_id          uuid references crm.saida_mensagens(id) on delete set null;
alter table crm.revisoes_ia drop constraint if exists revisoes_ia_status_check;
alter table crm.revisoes_ia add constraint revisoes_ia_status_check
  check (status in ('pendente','aprovada','editada','rejeitada','transferida','bloqueada','ignorada'));
create unique index if not exists ux_revisoes_evento on crm.revisoes_ia (webhook_evento_id) where webhook_evento_id is not null;
create index if not exists ix_revisoes_agente_dia on crm.revisoes_ia (agente_id, created_at);
comment on column crm.revisoes_ia.status is 'pendente = aguarda pessoa; bloqueada = violou regra (só líder libera); transferida = foi para atendimento humano; ignorada = não processada (recusa do contato, evento sem texto).';

create table if not exists crm.ia_exemplos (
  id         uuid primary key default gen_random_uuid(),
  agente_id  uuid not null references crm.agentes(id) on delete cascade,
  pergunta   text not null,
  resposta   text not null,
  revisao_id uuid unique references crm.revisoes_ia(id) on delete set null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table crm.ia_exemplos is 'Correções aprovadas por pessoas. Os mais recentes entram no prompt do agente como exemplos.';

-- ---- recusa do contato (trava do passo 5.2) -------------------------------------------------
create table if not exists crm.consentimentos (
  id           uuid primary key default gen_random_uuid(),
  contato_ref  text not null,                -- mesmo formato de revisoes_ia.contato
  finalidade   text not null check (finalidade in ('atendimento','ia','marketing')),
  base_legal   text,
  concedido_em timestamptz,
  revogado_em  timestamptz,
  origem       text,
  versao_termo text,
  criado_por   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (concedido_em is not null or revogado_em is not null)
);
create index if not exists ix_consentimentos on crm.consentimentos (contato_ref, finalidade, created_at desc);
comment on table crm.consentimentos is 'Concessões e recusas por contato. Recusa de IA = a IA não lê nem responde aquele contato.';

create or replace function crm.ia_pode_processar(p_contato text) returns boolean
language sql stable as $$
  select coalesce((
    select c.revogado_em is null or (c.concedido_em is not null and c.concedido_em > c.revogado_em)
    from crm.consentimentos c
    where c.contato_ref = p_contato and c.finalidade = 'ia'
    order by greatest(coalesce(c.concedido_em, '-infinity'), coalesce(c.revogado_em, '-infinity')) desc, c.created_at desc
    limit 1), true)
$$;

-- ---- funções do processo de IA (só service_role) ---------------------------------------------
-- Eventos recebidos nas últimas 24 h, de canais com agente ligado, ainda sem revisão e dentro do limite diário do agente.
create or replace function crm.ia_eventos_para_processar(p_limite int default 20)
returns table (evento_id bigint, canal_id uuid, canal_tipo text, tipo text, payload jsonb, ocorrido_em timestamptz, agente_id uuid)
language sql stable as $$
  select e.id, c.id, c.tipo, e.tipo, e.payload, coalesce(e.ocorrido_em, e.recebido_em), a.id
  from crm.webhook_eventos e
  join crm.canais c on c.id = e.canal_id and c.ativo
  join lateral (select ag.* from crm.agentes ag where ag.canal = c.tipo and ag.ativo order by ag.slug limit 1) a on true
  where e.tipo in ('mensagem','comentario','avaliacao')
    and coalesce(e.ocorrido_em, e.recebido_em) > now() - interval '24 hours'
    and not exists (select 1 from crm.revisoes_ia r where r.webhook_evento_id = e.id)
    and (select count(*) from crm.revisoes_ia r
          where r.agente_id = a.id and r.status <> 'ignorada'
            and r.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) < a.limite_diario
  order by coalesce(e.ocorrido_em, e.recebido_em), e.id
  limit p_limite
$$;

-- Grava o resultado da IA para um evento (uma vez só). Em modo automático, resposta liberada já entra na fila de saída.
create or replace function crm.ia_registrar(
  p_evento bigint, p_agente uuid, p_status text, p_contato text, p_contato_nome text, p_destino text,
  p_mensagem text, p_rascunho text, p_motivo text default null
) returns uuid language plpgsql as $$
declare v_id uuid; v_canal uuid; v_modo text; v_saida uuid;
begin
  if p_status not in ('pendente','aprovada','transferida','bloqueada','ignorada') then
    raise exception 'status inválido para registro da IA: %', p_status;
  end if;
  select canal_id into v_canal from crm.webhook_eventos where id = p_evento;
  insert into crm.revisoes_ia (agente_id, webhook_evento_id, canal_id, contato, contato_nome, destino, mensagem_cliente, rascunho, status, motivo)
  values (p_agente, p_evento, v_canal, p_contato, p_contato_nome, p_destino, p_mensagem, coalesce(p_rascunho, ''), p_status, p_motivo)
  on conflict (webhook_evento_id) where webhook_evento_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from crm.revisoes_ia where webhook_evento_id = p_evento;
    return v_id;
  end if;
  if p_status = 'aprovada' then
    select modo into v_modo from crm.agentes where id = p_agente;
    if v_modo is distinct from 'automatico' then raise exception 'agente em rascunho: resposta da IA só sai com aprovação humana'; end if;
    if coalesce(btrim(p_rascunho), '') = '' or p_destino is null then raise exception 'resposta automática sem texto ou sem destino'; end if;
    insert into crm.saida_mensagens (canal_id, destino, conteudo, origem, chave_idempotencia, criado_por)
    values (v_canal, p_destino, p_rascunho, 'ia', 'ia:' || v_id::text, null)
    on conflict (chave_idempotencia) do nothing returning id into v_saida;
    update crm.revisoes_ia set texto_final = p_rascunho, editada = false, saida_id = v_saida, revisada_em = now() where id = v_id;
  end if;
  return v_id;
end $$;

-- ---- ações das pessoas (tela de revisão) ----------------------------------------------------
-- Aprovar = enviar. Com texto corrigido, vira "editada" e a correção entra nos exemplos do agente.
create or replace function crm.ia_aprovar(p_id uuid, p_texto text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v crm.revisoes_ia%rowtype; v_final text; v_saida uuid; v_editada boolean;
begin
  if not crm.pode('atendimento') then raise exception 'sem permissão' using errcode = '42501'; end if;
  select * into v from crm.revisoes_ia where id = p_id for update;
  if not found then raise exception 'revisão não encontrada'; end if;
  if v.status = 'bloqueada' and not crm.eh_lider() then raise exception 'rascunho bloqueado por regra: só o líder ou o administrador libera' using errcode = '42501'; end if;
  if v.status not in ('pendente','bloqueada') then raise exception 'esta revisão já foi tratada (%)', v.status; end if;
  v_final := coalesce(nullif(btrim(p_texto), ''), btrim(v.rascunho));
  if v_final = '' then raise exception 'escreva a resposta antes de enviar'; end if;
  if v.destino is null or v.canal_id is null then raise exception 'sem destino para a resposta: responda pela conversa'; end if;
  v_editada := v_final is distinct from btrim(v.rascunho);
  insert into crm.saida_mensagens (canal_id, destino, conteudo, origem, chave_idempotencia, criado_por)
  values (v.canal_id, v.destino, v_final, 'ia', 'ia:' || v.id::text, auth.uid())
  on conflict (chave_idempotencia) do nothing returning id into v_saida;
  update crm.revisoes_ia set status = case when v_editada then 'editada' else 'aprovada' end, texto_final = v_final,
         editada = v_editada, revisada_por = auth.uid(), revisada_em = now(), saida_id = v_saida
   where id = p_id;
  if v_editada and coalesce(btrim(v.mensagem_cliente), '') <> '' then
    insert into crm.ia_exemplos (agente_id, pergunta, resposta, revisao_id) values (v.agente_id, v.mensagem_cliente, v_final, v.id)
    on conflict (revisao_id) do nothing;
  end if;
  return v_saida;
end $$;

-- Assumir = a pessoa responde pela conversa; nada da IA é enviado.
create or replace function crm.ia_assumir(p_id uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.pode('atendimento') then raise exception 'sem permissão' using errcode = '42501'; end if;
  update crm.revisoes_ia set status = 'transferida', motivo = coalesce(nullif(btrim(p_motivo), ''), motivo, 'Assumida por uma pessoa.'),
         revisada_por = auth.uid(), revisada_em = now()
   where id = p_id and status in ('pendente','bloqueada');
  if not found then raise exception 'esta revisão já foi tratada'; end if;
end $$;

create or replace function crm.ia_rejeitar(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.pode('atendimento') then raise exception 'sem permissão' using errcode = '42501'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'diga por que o rascunho foi descartado'; end if;
  update crm.revisoes_ia set status = 'rejeitada', motivo = p_motivo, revisada_por = auth.uid(), revisada_em = now()
   where id = p_id and status in ('pendente','bloqueada');
  if not found then raise exception 'esta revisão já foi tratada'; end if;
end $$;

-- Indicadores para decidir sair do rascunho (últimos 30 dias).
create or replace function crm.ia_indicadores(p_agente uuid)
returns table (dias_de_historico int, revisadas int, sem_edicao int, pct_sem_edicao numeric)
language sql stable security definer set search_path = '' as $$
  select coalesce(floor(extract(epoch from now() - min(r.created_at)) / 86400)::int, 0),
         count(*) filter (where r.status in ('aprovada','editada') and r.created_at > now() - interval '30 days')::int,
         count(*) filter (where r.status = 'aprovada' and r.revisada_por is not null and r.created_at > now() - interval '30 days')::int,
         round(100.0 * count(*) filter (where r.status = 'aprovada' and r.revisada_por is not null and r.created_at > now() - interval '30 days')
               / nullif(count(*) filter (where r.status in ('aprovada','editada') and r.created_at > now() - interval '30 days'), 0), 1)
  from crm.revisoes_ia r
  where r.agente_id = p_agente and r.status not in ('ignorada') and crm.pode('gestao')
$$;

-- Ligar/desligar (líder ou administrador). Ligar exige regra validada, canal ativo e, se for o caso, o vínculo jurídico.
create or replace function crm.agente_ativar(p_id uuid, p_ativo boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a crm.agentes%rowtype;
begin
  if not (crm.pode('gestao') and crm.eh_lider()) then raise exception 'só líder ou administrador liga e desliga agentes' using errcode = '42501'; end if;
  select * into a from crm.agentes where id = p_id for update;
  if not found then raise exception 'agente não encontrado'; end if;
  if p_ativo then
    if not exists (select 1 from crm.regras_ia where ativa and validada_em is not null and (agente_id is null or agente_id = p_id)) then
      raise exception 'nenhuma regra validada pela advogada: registre a validação antes de ligar o agente';
    end if;
    if not exists (select 1 from crm.canais where tipo = a.canal and ativo) then
      raise exception 'nenhum canal % ativo: conecte o canal antes de ligar o agente', a.canal;
    end if;
    if a.requer_vinculo and not exists (select 1 from crm.config where chave = 'vinculo_juridico') then
      raise exception 'este agente consulta dados de clientes e só liga depois do vínculo com o sistema jurídico (passo 2)';
    end if;
  end if;
  perform set_config('crm.motivo', coalesce(p_motivo, ''), true);
  update crm.agentes set ativo = p_ativo where id = p_id;
end $$;

-- Mudar de modo: só administrador, com motivo. Para "automatico": 30 dias de histórico e 90% aprovados sem edição.
create or replace function crm.agente_mudar_modo(p_id uuid, p_modo text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if not crm.eh_admin() then raise exception 'só o administrador muda o modo do agente' using errcode = '42501'; end if;
  if p_modo not in ('rascunho','automatico') then raise exception 'modo inválido'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 10 then raise exception 'registre o motivo (decisão por escrito de quem autorizou)'; end if;
  if p_modo = 'automatico' then
    select * into i from crm.ia_indicadores(p_id);
    if i.dias_de_historico < 30 then raise exception 'resposta automática só depois de 30 dias de revisão (hoje: % dias)', i.dias_de_historico; end if;
    if coalesce(i.pct_sem_edicao, 0) < 90 then raise exception 'resposta automática exige 90 por cento aprovadas sem edição nos últimos 30 dias (hoje: % por cento)', coalesce(i.pct_sem_edicao, 0); end if;
  end if;
  perform set_config('crm.mudar_modo_ok', '1', true);
  perform set_config('crm.motivo', p_motivo, true);
  update crm.agentes set modo = p_modo where id = p_id;
  perform set_config('crm.mudar_modo_ok', '', true);
end $$;

-- Resumo semanal: editar e publicar. Gravar no dossiê do sistema jurídico depende do passo 2 (crm_0008).
create or replace function crm.resumo_salvar(p_id uuid, p_texto text, p_publicar boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.pode('atendimento') then raise exception 'sem permissão' using errcode = '42501'; end if;
  update crm.resumos_semanais set resumo = coalesce(nullif(btrim(p_texto), ''), resumo),
         status = case when p_publicar then 'publicado' else status end,
         publicado_em = case when p_publicar then now() else publicado_em end
   where id = p_id and status = 'rascunho';
  if not found then raise exception 'resumo não encontrado ou já publicado'; end if;
end $$;

-- ---- acesso --------------------------------------------------------------------------------
-- Leitura pela área; gravação só pelas funções acima (nada de update direto em status, modo ou regra).
select crm.proteger('crm.ia_exemplos', 'atendimento');
select crm.proteger('crm.consentimentos', 'atendimento');
select crm.proteger('crm.agentes_historico', 'gestao');
revoke insert, update, delete on crm.agentes, crm.regras_ia, crm.revisoes_ia, crm.resumos_semanais,
  crm.ia_exemplos, crm.agentes_historico from authenticated;
revoke update, delete on crm.consentimentos from authenticated;   -- recusa se registra; nunca se apaga

grant select on crm.agentes, crm.regras_ia, crm.ia_exemplos, crm.consentimentos, crm.webhook_eventos to service_role;
grant select, insert, update on crm.revisoes_ia, crm.resumos_semanais to service_role;
grant insert on crm.saida_mensagens to service_role;

revoke all on function crm.ia_eventos_para_processar(int),
  crm.ia_registrar(bigint, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function crm.ia_eventos_para_processar(int),
  crm.ia_registrar(bigint, uuid, text, text, text, text, text, text, text), crm.ia_pode_processar(text) to service_role;
revoke all on function crm.ia_aprovar(uuid, text), crm.ia_assumir(uuid, text), crm.ia_rejeitar(uuid, text),
  crm.ia_indicadores(uuid), crm.agente_ativar(uuid, boolean, text), crm.agente_mudar_modo(uuid, text, text),
  crm.resumo_salvar(uuid, text, boolean), crm.ia_pode_processar(text) from public, anon;
grant execute on function crm.ia_aprovar(uuid, text), crm.ia_assumir(uuid, text), crm.ia_rejeitar(uuid, text),
  crm.ia_indicadores(uuid), crm.agente_ativar(uuid, boolean, text), crm.agente_mudar_modo(uuid, text, text),
  crm.resumo_salvar(uuid, text, boolean), crm.ia_pode_processar(text) to authenticated;

-- VALIDAÇÃO DAS REGRAS (rodar uma vez por ambiente no SQL Editor, com o e-mail da advogada que validou):
-- update crm.regras_ia set validada_por = (select id from auth.users where email = 'EMAIL_DA_ADVOGADA'), validada_em = now()
--  where agente_id is null and validada_em is null and ativa;
