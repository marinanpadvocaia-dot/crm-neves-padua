-- crm_0012_alertas_e_saude.sql
-- Passo 1.5 do plano de robustez: alertas, painel de saúde e relatório diário.
-- crm.verificar_alertas() roda a cada 1 minuto (Edge Function `whatsapp-saude`); a função envia os alertas
-- novos ao canal interno de gestão (URL do Discord/WhatsApp interno no Vault) e marca como notificados.
-- Um alerta fica aberto enquanto o problema existir e é resolvido sozinho quando o problema some
-- (não repete aviso a cada minuto).
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.

create table if not exists crm.alertas (
  id            bigint generated always as identity primary key,
  tipo          text not null check (tipo in ('canal_caiu','canal_silencioso','fila_acumulada','fila_atrasada',
                                              'envio_falhou','webhook_erro','atendimento_sem_responsavel','automacao_falhou')),
  chave         text not null default 'geral',   -- o que está com problema (id do canal, do atendimento...)
  nivel         text not null default 'aviso' check (nivel in ('aviso','critico')),
  mensagem      text not null,
  aberto_em     timestamptz not null default now(),
  resolvido_em  timestamptz,
  notificado_em timestamptz
);
comment on table crm.alertas is 'Alertas operacionais. Um aberto por (tipo, chave); resolve sozinho quando o problema some.';
create unique index if not exists ux_alertas_abertos on crm.alertas (tipo, chave) where resolvido_em is null;
create index if not exists ix_alertas_notificar on crm.alertas (aberto_em) where notificado_em is null;

create or replace function crm.alertar(p_tipo text, p_chave text, p_nivel text, p_mensagem text) returns boolean
language plpgsql as $$
declare v bigint;
begin
  insert into crm.alertas (tipo, chave, nivel, mensagem) values (p_tipo, p_chave, p_nivel, p_mensagem)
  on conflict (tipo, chave) where resolvido_em is null do nothing returning id into v;
  return v is not null;
end $$;

-- Resolve os alertas abertos do tipo cuja chave não está mais na lista de problemas atuais.
create or replace function crm.resolver_alertas(p_tipo text, p_chaves_ativas text[]) returns void
language sql as $$
  update crm.alertas set resolvido_em = now()
   where tipo = p_tipo and resolvido_em is null and not (chave = any (coalesce(p_chaves_ativas, '{}')))
$$;

-- Limites em crm.config, chave 'alertas'; padrões abaixo.
create or replace function crm.alerta_cfg(p_chave text, p_padrao int) returns int
language sql stable as $$
  select coalesce((select (valor->>p_chave)::int from crm.config where chave = 'alertas'), p_padrao)
$$;

-- Verifica tudo e devolve quantos alertas NOVOS foram abertos.
create or replace function crm.verificar_alertas() returns int
language plpgsql as $$
declare n int := 0; r record; v_chaves text[]; v_pend int; v_mais_antiga timestamptz;
begin
  -- canal caiu (desconectado, aguardando QR ou bloqueado)
  v_chaves := '{}';
  for r in select * from crm.canais_status where ativo and estado in ('desconectado','aguardando_qr','bloqueado') loop
    v_chaves := v_chaves || r.id::text;
    if crm.alertar('canal_caiu', r.id::text, 'critico', format('%s (%s) está %s. Mensagens ficam na fila até reconectar.', r.nome, coalesce(r.numero,'—'), replace(r.estado,'_',' '))) then n := n + 1; end if;
  end loop;
  perform crm.resolver_alertas('canal_caiu', v_chaves);

  -- silêncio suspeito
  v_chaves := '{}';
  for r in select * from crm.canais_status where ativo and estado_exibido = 'instavel' loop
    v_chaves := v_chaves || r.id::text;
    if crm.alertar('canal_silencioso', r.id::text, 'aviso', format('%s está conectado, mas não recebe mensagens há %s min.', r.nome, coalesce(r.minutos_sem_receber::text, '?'))) then n := n + 1; end if;
  end loop;
  perform crm.resolver_alertas('canal_silencioso', v_chaves);

  -- fila de saída acumulada ou atrasada
  select count(*), min(created_at) into v_pend, v_mais_antiga from crm.saida_mensagens where estado in ('pendente','enviando');
  if v_pend > crm.alerta_cfg('fila_max_pendentes', 20) then
    if crm.alertar('fila_acumulada', 'geral', 'critico', format('%s mensagens aguardando envio na fila de saída.', v_pend)) then n := n + 1; end if;
    perform crm.resolver_alertas('fila_acumulada', '{geral}');
  else perform crm.resolver_alertas('fila_acumulada', '{}'); end if;
  if v_mais_antiga < now() - make_interval(mins => crm.alerta_cfg('fila_max_min', 5)) then
    if crm.alertar('fila_atrasada', 'geral', 'critico', format('Há mensagem esperando envio há %s min.', floor(extract(epoch from now() - v_mais_antiga)/60)::int)) then n := n + 1; end if;
    perform crm.resolver_alertas('fila_atrasada', '{geral}');
  else perform crm.resolver_alertas('fila_atrasada', '{}'); end if;

  -- envios que falharam de vez (até alguém reenviar ou cancelar)
  select coalesce(array_agg(id::text), '{}') into v_chaves from crm.saida_mensagens where estado = 'falhou';
  for r in select id, erro from crm.saida_mensagens where estado = 'falhou' loop
    if crm.alertar('envio_falhou', r.id::text, 'aviso', 'Mensagem não enviada após 5 tentativas: ' || coalesce(r.erro, 'sem detalhe')) then n := n + 1; end if;
  end loop;
  perform crm.resolver_alertas('envio_falhou', v_chaves);

  -- webhook com erro de processamento
  select count(*) into v_pend from crm.webhook_eventos where processado_em is null and erro is not null;
  if v_pend > 0 then
    if crm.alertar('webhook_erro', 'geral', 'aviso', format('%s evento(s) do WhatsApp com erro de processamento. Ver painel de saúde.', v_pend)) then n := n + 1; end if;
    perform crm.resolver_alertas('webhook_erro', '{geral}');
  else perform crm.resolver_alertas('webhook_erro', '{}'); end if;

  -- atendimento sem responsável há mais de X min
  select coalesce(array_agg(id::text), '{}') into v_chaves from crm.atendimentos
   where status = 'aguardando' and responsavel_id is null and created_at < now() - make_interval(mins => crm.alerta_cfg('sem_resp_min', 30));
  for r in select id, conversa_ref, fila_ref from crm.atendimentos where id::text = any (v_chaves) loop
    if crm.alertar('atendimento_sem_responsavel', r.id::text, 'aviso', format('Atendimento %s (fila %s) sem responsável há mais de %s min.', coalesce(r.conversa_ref, r.id::text), coalesce(r.fila_ref, 'sem fila'), crm.alerta_cfg('sem_resp_min', 30))) then n := n + 1; end if;
  end loop;
  perform crm.resolver_alertas('atendimento_sem_responsavel', v_chaves);

  -- automação com erro na última hora (não resolve sozinho: some quando o líder marca como visto)
  if exists (select 1 from crm.automacao_execucoes where resultado = 'erro' and criado_em > now() - interval '1 hour') then
    if crm.alertar('automacao_falhou', 'geral', 'aviso', 'Automação com erro na última hora. Ver registro de execuções.') then n := n + 1; end if;
  end if;
  return n;
end $$;

-- Painel de saúde (só líder/admin).
create or replace function crm.saude_resumo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores' using errcode = '42501'; end if;
  return jsonb_build_object(
    'canais', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'tipo', tipo, 'estado', estado_exibido,
                 'minutos_sem_receber', minutos_sem_receber, 'ultima_verificacao_em', ultima_verificacao_em) order by tipo, nome), '[]')
               from crm.canais_status where ativo),
    'fila', (select jsonb_build_object(
               'pendentes', count(*) filter (where estado = 'pendente'),
               'enviando',  count(*) filter (where estado = 'enviando'),
               'falhou',    count(*) filter (where estado = 'falhou'),
               'mais_antiga_min', floor(extract(epoch from now() - min(created_at) filter (where estado in ('pendente','enviando'))) / 60)::int,
               'tempo_medio_envio_seg', round(avg(extract(epoch from enviada_em - created_at)) filter (where estado = 'enviada' and enviada_em > now() - interval '24 hours'))::int)
             from crm.saida_mensagens),
    'webhook', (select jsonb_build_object('nao_processados', count(*), 'com_erro', count(*) filter (where erro is not null))
                from crm.webhook_eventos where processado_em is null),
    'alertas_abertos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'nivel', nivel, 'mensagem', mensagem, 'aberto_em', aberto_em) order by aberto_em desc), '[]')
                        from crm.alertas where resolvido_em is null));
end $$;

-- Relatório diário curto (dia no fuso do escritório).
create or replace function crm.relatorio_diario(p_dia date default (now() at time zone 'America/Sao_Paulo')::date) returns jsonb
language plpgsql stable as $$
declare i timestamptz := p_dia::timestamp at time zone 'America/Sao_Paulo'; f timestamptz := (p_dia + 1)::timestamp at time zone 'America/Sao_Paulo';
begin
  return jsonb_build_object(
    'dia', p_dia,
    'recebidas', (select count(*) from crm.webhook_eventos where tipo = 'mensagem' and coalesce(ocorrido_em, recebido_em) >= i and coalesce(ocorrido_em, recebido_em) < f),
    'enviadas',  (select count(*) from crm.saida_mensagens where estado = 'enviada' and enviada_em >= i and enviada_em < f),
    'falhas',    (select count(*) from crm.saida_mensagens where estado = 'falhou' and updated_at >= i and updated_at < f),
    'primeira_resposta_media_min', (select round(avg(extract(epoch from primeira_resposta_em - created_at)) / 60)::int
                                    from crm.atendimentos where created_at >= i and created_at < f and primeira_resposta_em is not null));
end $$;

alter table crm.alertas enable row level security;
revoke all on crm.alertas from anon;
grant select, update on crm.alertas to authenticated;
drop policy if exists p_alertas_sel on crm.alertas;
drop policy if exists p_alertas_upd on crm.alertas;
create policy p_alertas_sel on crm.alertas for select to authenticated using ((select crm.eh_lider()));
create policy p_alertas_upd on crm.alertas for update to authenticated using ((select crm.eh_lider())) with check ((select crm.eh_lider()));

grant select, insert, update on crm.alertas to service_role;
grant select on crm.automacao_execucoes to service_role;
revoke all on function crm.alertar(text, text, text, text), crm.resolver_alertas(text, text[]), crm.verificar_alertas() from public, anon, authenticated;
grant execute on function crm.alertar(text, text, text, text), crm.resolver_alertas(text, text[]), crm.verificar_alertas(),
  crm.alerta_cfg(text, int), crm.relatorio_diario(date) to service_role;
revoke all on function crm.saude_resumo() from public, anon;
grant execute on function crm.saude_resumo() to authenticated;
revoke all on function crm.relatorio_diario(date) from public, anon;
grant execute on function crm.relatorio_diario(date) to authenticated;
