-- crm_0022_canais_conexao.sql
-- Troca da demonstração pelo banco, parte 5: canais, fila de saída e saúde na tela.
-- O que o passo 1 (crm_0009–0012) já fazia continua igual; aqui entram só as ações da tela:
--   * cadastro dos canais pelo administrador (antes era só pelo SQL Editor);
--   * plano B em um clique: o número reserva passa a ser o principal e a fila pendente vai junto
--     (o mesmo que o docs/plano-b-numero-reserva.md fazia em SQL);
--   * ligar/desligar a verificação de um canal que não é o principal;
--   * "marcar como visto" do alerta de automação (o único que não se resolve sozinho);
--   * histórico de quem pediu QR Code ou verificação (a Edge Function canais-conectar grava o nome).
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.

-- nome de quem está logado (para o histórico do canal)
create or replace function crm.nome_logado() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nome from crm.perfis where user_id = auth.uid()), 'administrador')
$$;

-- Evento manual no histórico do canal (troca de principal, ligar/desligar), sem mudar o estado.
create or replace function crm.canal_anotar(p_canal uuid, p_detalhe text) returns void
language sql security definer set search_path = '' as $$
  insert into crm.canal_eventos (canal_id, de, para, detalhe)
  select id, estado, estado, left(p_detalhe, 300) from crm.canais where id = p_canal
$$;

-- Cadastrar ou editar um canal (só administrador). Canal novo nasce DESLIGADO e não principal:
-- ligar a verificação e virar principal são ações separadas, para não trocar o número de envio sem querer.
create or replace function crm.canal_salvar(
  p_id uuid, p_tipo text, p_nome text, p_numero text, p_instancia text, p_provedor text,
  p_silencio_max_min int, p_reserva boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
        v_inst text := nullif(btrim(coalesce(p_instancia, '')), ''); v_tipo text; v_prov text;
begin
  if not crm.eh_admin() then raise exception 'só o administrador cadastra canais' using errcode = '42501'; end if;
  if length(v_nome) < 2 or length(v_nome) > 60 then raise exception 'escreva o nome do canal (até 60 letras)'; end if;
  if p_silencio_max_min is null or p_silencio_max_min < 10 or p_silencio_max_min > 10080 then
    raise exception 'o tempo sem mensagens antes do aviso precisa ficar entre 10 min e 7 dias'; end if;
  if v_id is null then
    v_tipo := p_tipo; v_prov := p_provedor;
  else
    select tipo, provedor into v_tipo, v_prov from crm.canais where id = v_id;
    if not found then raise exception 'canal não encontrado'; end if;
    v_prov := coalesce(p_provedor, v_prov);
  end if;
  if v_tipo not in ('whatsapp','instagram','google') then raise exception 'tipo de canal inválido'; end if;
  if not (v_prov = 'simulado' or (v_tipo, v_prov) in (('whatsapp','evolution'),('instagram','meta'),('google','google'))) then
    raise exception 'provedor % não serve para %', v_prov, v_tipo; end if;
  if v_prov = 'evolution' and v_inst is null then raise exception 'informe o nome da instância na Evolution'; end if;
  if v_inst is not null and exists (select 1 from crm.canais where instancia = v_inst and id is distinct from v_id) then
    raise exception 'já existe um canal com a instância %', v_inst; end if;
  if v_id is null then
    insert into crm.canais (tipo, nome, numero, instancia, provedor, silencio_max_min, reserva, ativo, principal)
    values (v_tipo, v_nome, nullif(btrim(coalesce(p_numero, '')), ''), v_inst, v_prov, p_silencio_max_min, coalesce(p_reserva, false), false, false)
    returning id into v_id;
    perform crm.canal_anotar(v_id, 'Canal cadastrado por ' || crm.nome_logado());
  else
    update crm.canais set nome = v_nome, numero = nullif(btrim(coalesce(p_numero, '')), ''), instancia = v_inst, provedor = v_prov,
           silencio_max_min = p_silencio_max_min, reserva = coalesce(p_reserva, reserva)
     where id = v_id;
  end if;
  return v_id;
end $$;

-- Ligar/desligar a verificação de saúde de um canal. O principal não desliga (use o plano B para trocar).
create or replace function crm.canal_ativar(p_id uuid, p_ativo boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c crm.canais%rowtype;
begin
  if not crm.eh_admin() then raise exception 'só o administrador liga ou desliga canais' using errcode = '42501'; end if;
  select * into c from crm.canais where id = p_id for update;
  if not found then raise exception 'canal não encontrado'; end if;
  if c.principal and not p_ativo then
    raise exception 'o canal principal não pode ser desligado: torne outro canal principal antes (plano B)'; end if;
  if c.ativo = p_ativo then return; end if;
  update crm.canais set ativo = p_ativo where id = p_id;
  perform crm.canal_anotar(p_id, case when p_ativo then 'Verificação ligada' else 'Canal desligado' end || ' por ' || crm.nome_logado());
end $$;

-- Plano B: o canal escolhido passa a ser o principal do seu tipo. O principal anterior é desligado e as mensagens
-- pendentes ou com falha dele passam para o novo (saem pelo novo número). Devolve quantas mensagens foram movidas.
create or replace function crm.canal_tornar_principal(p_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare c crm.canais%rowtype; v_antigo crm.canais%rowtype; n int := 0;
begin
  if not crm.eh_admin() then raise exception 'só o administrador troca o canal principal' using errcode = '42501'; end if;
  select * into c from crm.canais where id = p_id for update;
  if not found then raise exception 'canal não encontrado'; end if;
  if c.principal and c.ativo then return 0; end if;
  select * into v_antigo from crm.canais where tipo = c.tipo and principal and ativo for update;
  if found then
    update crm.canais set principal = false, ativo = false where id = v_antigo.id;
    update crm.saida_mensagens set canal_id = c.id, proxima_tentativa_em = least(proxima_tentativa_em, now())
     where canal_id = v_antigo.id and estado in ('pendente','falhou');
    get diagnostics n = row_count;
    perform crm.canal_anotar(v_antigo.id, format('Deixou de ser o principal: %s passou a enviar (por %s)', c.nome, crm.nome_logado()));
  end if;
  update crm.canais set principal = true, ativo = true where id = c.id;
  perform crm.canal_anotar(c.id, format('Passou a ser o principal%s (por %s)%s',
    case when v_antigo.id is not null then ' no lugar de ' || v_antigo.nome else '' end, crm.nome_logado(),
    case when n > 0 then format('; %s mensagem(ns) da fila vieram junto', n) else '' end));
  return n;
end $$;

-- Alerta "automação com erro" não se resolve sozinho: o líder marca como visto.
create or replace function crm.alerta_visto(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_lider() then raise exception 'só líderes e administradores' using errcode = '42501'; end if;
  update crm.alertas set resolvido_em = now() where id = p_id and resolvido_em is null and tipo = 'automacao_falhou';
  if not found then raise exception 'este alerta se resolve sozinho quando o problema some'; end if;
end $$;

-- A tela lê o painel de saúde também com o id de cada alerta (para "marcar como visto").
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
    'alertas_abertos', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'tipo', tipo, 'nivel', nivel, 'mensagem', mensagem, 'aberto_em', aberto_em) order by aberto_em desc), '[]')
                        from crm.alertas where resolvido_em is null));
end $$;

-- A Edge Function canais-conectar (service_role) anota no histórico quem pediu QR Code ou verificação.
-- nome_logado: a função chama com o JWT de quem pediu (cada um só lê o próprio nome).
revoke all on function crm.nome_logado() from public, anon;
grant execute on function crm.nome_logado() to authenticated;
revoke all on function crm.canal_anotar(uuid, text) from public, anon, authenticated;
grant execute on function crm.canal_anotar(uuid, text) to service_role;
revoke all on function crm.canal_salvar(uuid, text, text, text, text, text, int, boolean), crm.canal_ativar(uuid, boolean),
  crm.canal_tornar_principal(uuid), crm.alerta_visto(bigint) from public, anon;
grant execute on function crm.canal_salvar(uuid, text, text, text, text, text, int, boolean), crm.canal_ativar(uuid, boolean),
  crm.canal_tornar_principal(uuid), crm.alerta_visto(bigint) to authenticated;
