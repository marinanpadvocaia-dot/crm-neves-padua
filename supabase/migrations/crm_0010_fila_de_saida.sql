-- crm_0010_fila_de_saida.sql
-- Passo 1.3 do plano de robustez: fila de saída com repetição.
-- O app NUNCA envia direto: só insere aqui (crm.enfileirar_mensagem). A Edge Function `whatsapp-saida`
-- (service_role, agendada) pega as pendentes, envia pelo adaptador e registra o resultado.
-- Repetição com espera crescente: 30 s, 2 min, 10 min, 1 h; na 5ª falha vira "falhou" e o atendente decide.
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.

create table if not exists crm.saida_mensagens (
  id                   uuid primary key default gen_random_uuid(),
  atendimento_id            uuid references crm.atendimentos(id) on delete set null,
  conversa_ref         text,                               -- conversa em atd_conversas (vínculo real no crm_0008)
  canal_id             uuid not null references crm.canais(id),
  destino              text,                               -- número/identificador; se nulo, o processo resolve pela conversa
  conteudo             text not null check (length(btrim(conteudo)) > 0),
  tipo                 text not null default 'texto' check (tipo in ('texto','midia','modelo')),
  origem               text not null default 'manual' check (origem in ('manual','agendada','automacao','cadencia','ia')),
  estado               text not null default 'pendente' check (estado in ('pendente','enviando','enviada','falhou','cancelada')),
  tentativas           int not null default 0 check (tentativas >= 0),
  proxima_tentativa_em timestamptz not null default now(),
  enviando_desde       timestamptz,
  erro                 text,
  chave_idempotencia   text not null unique,               -- a mesma chave nunca gera dois envios
  externo_id           text,                               -- id da mensagem devolvido pelo provedor
  enviada_em           timestamptz,
  criado_por           uuid default auth.uid() references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- envio fora de uma conversa existente só por regra explícita (automação, cadência, agendamento)
  check (origem <> 'manual' or atendimento_id is not null or conversa_ref is not null)
);
comment on table crm.saida_mensagens is 'Fila de saída. Estado na bolha: pendente (relógio), enviada (check), falhou (alerta + Reenviar/Cancelar).';
create index if not exists ix_saida_pendentes on crm.saida_mensagens (proxima_tentativa_em) where estado = 'pendente';
create index if not exists ix_saida_atendimento on crm.saida_mensagens (atendimento_id, created_at);
create index if not exists ix_saida_estado on crm.saida_mensagens (estado, created_at);
create or replace trigger trg_saida_upd before update on crm.saida_mensagens for each row execute function crm.set_updated_at();

-- Mensagens agendadas passam a alimentar a fila (novo estado 'na_fila').
alter table crm.mensagens_agendadas drop constraint if exists mensagens_agendadas_status_check;
alter table crm.mensagens_agendadas add constraint mensagens_agendadas_status_check
  check (status in ('agendada','na_fila','enviada','cancelada','falhou'));

-- Regras da fila (crm.config, chave 'saida'); valores padrão se não houver linha.
create or replace function crm.saida_cfg(p_chave text, p_padrao int) returns int
language sql stable as $$
  select coalesce((select (valor->>p_chave)::int from crm.config where chave = 'saida'), p_padrao)
$$;

-- Espera antes da próxima tentativa, a partir do número de tentativas já feitas.
create or replace function crm.saida_espera(p_tentativas int) returns interval
language sql immutable parallel safe as $$
  select case greatest(p_tentativas, 1)
    when 1 then interval '30 seconds'
    when 2 then interval '2 minutes'
    when 3 then interval '10 minutes'
    else interval '1 hour' end
$$;

-- Usada pelo app (atendente). Devolve o id da mensagem na fila; chamar duas vezes com a mesma chave não duplica.
-- Protege o número: a mesma mensagem para o mesmo destino/conversa em menos de N s (padrão 60) é recusada.
create or replace function crm.enfileirar_mensagem(
  p_conteudo text, p_chave text, p_atendimento uuid default null, p_conversa_ref text default null,
  p_destino text default null, p_canal uuid default null, p_origem text default 'manual'
) returns uuid language plpgsql as $$
declare v_id uuid; v_canal uuid := p_canal; v_tipo text;
begin
  select id into v_id from crm.saida_mensagens where chave_idempotencia = p_chave;
  if found then return v_id; end if;
  if v_canal is null then
    select coalesce((select canal from crm.atendimentos where id = p_atendimento), 'whatsapp') into v_tipo;
    select id into v_canal from crm.canais where tipo = v_tipo and principal and ativo;
    if v_canal is null then raise exception 'nenhum canal principal ativo para %', v_tipo; end if;
  end if;
  if exists (select 1 from crm.saida_mensagens s
             where s.estado <> 'cancelada' and s.conteudo = p_conteudo
               and s.created_at > now() - make_interval(secs => crm.saida_cfg('intervalo_iguais_seg', 60))
               and (s.atendimento_id = p_atendimento or s.conversa_ref = p_conversa_ref or s.destino = p_destino)) then
    raise exception 'mensagem_repetida: a mesma mensagem foi enviada há menos de % s', crm.saida_cfg('intervalo_iguais_seg', 60)
      using errcode = 'P0001';
  end if;
  insert into crm.saida_mensagens (atendimento_id, conversa_ref, canal_id, destino, conteudo, origem, chave_idempotencia)
  values (p_atendimento, p_conversa_ref, v_canal, p_destino, p_conteudo, p_origem, p_chave)
  on conflict (chave_idempotencia) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from crm.saida_mensagens where chave_idempotencia = p_chave; end if;
  return v_id;
end $$;

-- ---- funções do processo de envio (só service_role) --------------------------------------

-- Pega até p_limite pendentes vencidas de canais conectados e marca como "enviando" (seguro com processos em paralelo).
create or replace function crm.saida_pegar_lote(p_limite int default 20) returns setof crm.saida_mensagens
language sql as $$
  with lote as (
    select s.id from crm.saida_mensagens s join crm.canais c on c.id = s.canal_id
    where s.estado = 'pendente' and s.proxima_tentativa_em <= now() and c.estado = 'conectado' and c.ativo
    order by s.proxima_tentativa_em, s.created_at
    for update of s skip locked
    limit p_limite)
  update crm.saida_mensagens s
     set estado = 'enviando', tentativas = s.tentativas + 1, enviando_desde = now()
    from lote where s.id = lote.id
  returning s.*
$$;

-- Resultado de um envio. Só age sobre mensagens "enviando" (repetir a chamada não muda nada). Devolve o novo estado.
create or replace function crm.saida_concluir(p_id uuid, p_ok boolean, p_externo_id text default null, p_erro text default null) returns text
language plpgsql as $$
declare v crm.saida_mensagens%rowtype; v_max int := crm.saida_cfg('max_tentativas', 5);
begin
  select * into v from crm.saida_mensagens where id = p_id for update;
  if not found then raise exception 'mensagem % não está na fila', p_id; end if;
  if v.estado <> 'enviando' then return v.estado; end if;
  if p_ok then
    update crm.saida_mensagens set estado = 'enviada', externo_id = p_externo_id, enviada_em = now(), erro = null, enviando_desde = null where id = p_id;
    update crm.mensagens_agendadas set status = 'enviada', enviada_em = now()
     where status = 'na_fila' and v.chave_idempotencia = 'agendada:' || id::text;
    return 'enviada';
  elsif v.tentativas >= v_max then
    update crm.saida_mensagens set estado = 'falhou', erro = p_erro, enviando_desde = null where id = p_id;
    update crm.mensagens_agendadas set status = 'falhou', erro = p_erro, tentativas = v.tentativas
     where status = 'na_fila' and v.chave_idempotencia = 'agendada:' || id::text;
    return 'falhou';
  else
    update crm.saida_mensagens set estado = 'pendente', erro = p_erro, enviando_desde = null,
           proxima_tentativa_em = now() + crm.saida_espera(v.tentativas) where id = p_id;
    return 'pendente';
  end if;
end $$;

-- Se o processo morrer no meio, mensagens presas em "enviando" voltam para a fila depois de p_min minutos.
-- Atenção: se o provedor chegou a enviar antes da queda, pode haver 1 envio repetido; por isso o erro registra o caso.
create or replace function crm.saida_recuperar_travadas(p_min int default 5) returns int
language plpgsql as $$
declare n int;
begin
  update crm.saida_mensagens set estado = 'pendente', erro = 'interrompida durante o envio; verificar se o cliente recebeu', enviando_desde = null
   where estado = 'enviando' and enviando_desde < now() - make_interval(mins => p_min);
  get diagnostics n = row_count;
  return n;
end $$;

-- Mensagens agendadas vencidas entram na fila (chave 'agendada:<id>' impede entrada dupla).
create or replace function crm.agendadas_para_fila() returns int
language plpgsql as $$
declare r record; n int := 0; v_canal uuid;
begin
  for r in select a.*, t.canal from crm.mensagens_agendadas a left join crm.atendimentos t on t.id = a.atendimento_id
           where a.status = 'agendada' and a.enviar_em <= now() for update of a skip locked loop
    select id into v_canal from crm.canais where tipo = coalesce(r.canal, 'whatsapp') and principal and ativo;
    if v_canal is null then continue; end if;
    insert into crm.saida_mensagens (atendimento_id, conversa_ref, canal_id, conteudo, origem, chave_idempotencia, criado_por)
    values (r.atendimento_id, r.conversa_ref, v_canal, r.texto, 'agendada', 'agendada:' || r.id::text, r.criada_por)
    on conflict (chave_idempotencia) do nothing;
    update crm.mensagens_agendadas set status = 'na_fila' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---- ações do atendente (Reenviar / Cancelar) ------------------------------------------
create or replace function crm.saida_reenviar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.pode('atendimento') then raise exception 'sem permissão' using errcode = '42501'; end if;
  update crm.saida_mensagens set estado = 'pendente', tentativas = 0, proxima_tentativa_em = now(), erro = null
   where id = p_id and estado = 'falhou';
  if not found then raise exception 'só mensagens com falha podem ser reenviadas'; end if;
end $$;

create or replace function crm.saida_cancelar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.pode('atendimento') then raise exception 'sem permissão' using errcode = '42501'; end if;
  update crm.saida_mensagens set estado = 'cancelada' where id = p_id and estado in ('pendente','falhou');
  if not found then raise exception 'mensagem já enviada ou em envio não pode ser cancelada'; end if;
end $$;

-- ---- acesso ---------------------------------------------------------------------------
-- Atendimento lê e insere (só como si mesmo e só "pendente"); mudanças de estado só pelas funções acima.
alter table crm.saida_mensagens enable row level security;
revoke all on crm.saida_mensagens from anon;
grant select, insert on crm.saida_mensagens to authenticated;
drop policy if exists p_saida_sel on crm.saida_mensagens;
drop policy if exists p_saida_ins on crm.saida_mensagens;
create policy p_saida_sel on crm.saida_mensagens for select to authenticated using ((select crm.pode('atendimento')));
create policy p_saida_ins on crm.saida_mensagens for insert to authenticated
  with check ((select crm.pode('atendimento')) and criado_por = (select auth.uid()) and estado = 'pendente' and tentativas = 0);

grant select, insert, update on crm.saida_mensagens, crm.mensagens_agendadas to service_role;
grant select on crm.atendimentos to service_role;
grant execute on function crm.enfileirar_mensagem(text, text, uuid, text, text, uuid, text) to authenticated, service_role;
grant execute on function crm.saida_espera(int), crm.saida_cfg(text, int) to authenticated, service_role;
revoke all on function crm.saida_pegar_lote(int), crm.saida_concluir(uuid, boolean, text, text),
  crm.saida_recuperar_travadas(int), crm.agendadas_para_fila() from public, anon, authenticated;
grant execute on function crm.saida_pegar_lote(int), crm.saida_concluir(uuid, boolean, text, text),
  crm.saida_recuperar_travadas(int), crm.agendadas_para_fila() to service_role;
revoke all on function crm.saida_reenviar(uuid), crm.saida_cancelar(uuid) from public, anon;
grant execute on function crm.saida_reenviar(uuid), crm.saida_cancelar(uuid) to authenticated;
