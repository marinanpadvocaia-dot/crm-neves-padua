-- crm_0025_painel_gestor.sql
-- Parte 7 da troca da demonstração pelo banco: o Painel do gestor passa a ler os números do banco.
--
--   * crm.painel_gestor(de, ate): uma chamada devolve tudo o que a tela mostra (agora, no período,
--     por fila, por pessoa, por canal e, para quem usa o CRM, o resumo do comercial).
--   * Quem vê: líder e administrador. O líder vê só as filas que lidera; o administrador vê todas.
--     O resumo do comercial só aparece para quem tem a área comercial (crm.pode('comercial'), crm_0024).
--   * Prazo (SLA) da 1ª resposta contado em minutos ÚTEIS de cada fila (dias, abertura e fechamento de
--     crm.filas_config, fuso America/Sao_Paulo). Mensagem que chega às 22h não aparece atrasada na manhã seguinte.
--     Feriados não entram na conta. "Aguardando o cliente" pausa o prazo.
--   * Os atendimentos só passam a existir quando as conversas forem ligadas ao banco (passo 2);
--     até lá o painel mostra zero nessas partes e o resumo do comercial já com dados reais.
-- Idempotente. Só leitura: não altera nenhuma tabela do sistema jurídico.

create index if not exists ix_atendimentos_criado on crm.atendimentos (created_at);
create index if not exists ix_atendimentos_resolvido on crm.atendimentos (resolvido_em) where resolvido_em is not null;
create index if not exists ix_negocios_criado on crm.negocios (created_at);
create index if not exists ix_negocios_fechado on crm.negocios (fechado_em) where fechado_em is not null;

-- Minutos dentro do horário de atendimento entre dois instantes.
create or replace function crm.minutos_uteis(p_de timestamptz, p_ate timestamptz, p_dias text, p_abre time, p_fecha time)
returns int language sql stable set search_path = '' as $$
  select case when p_de is null or p_ate is null or p_ate <= p_de then 0 else coalesce((
    select round(sum(greatest(0, extract(epoch from
             least(p_ate, (g.d::date + p_fecha) at time zone 'America/Sao_Paulo')
           - greatest(p_de, (g.d::date + p_abre) at time zone 'America/Sao_Paulo')))) / 60)::int
      from generate_series((p_de at time zone 'America/Sao_Paulo')::date::timestamp,
                           (p_ate at time zone 'America/Sao_Paulo')::date::timestamp, interval '1 day') g(d)
     where case coalesce(p_dias, 'Seg–Sex')
             when 'Todos os dias' then true
             when 'Seg–Sáb' then extract(isodow from g.d) < 7
             else extract(isodow from g.d) < 6 end), 0) end
$$;

create or replace function crm.painel_gestor(p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin boolean := crm.eh_admin();
  v_filas text[];
  i timestamptz; f timestamptz;
  v_atd jsonb; v_com jsonb := null;
begin
  if not crm.eh_lider() then raise exception 'sem permissão para ver o painel do gestor'; end if;
  if p_de is null or p_ate is null or p_de > p_ate or p_ate - p_de > 366 then
    raise exception 'período inválido: escolha até um ano'; end if;
  i := p_de::timestamp at time zone 'America/Sao_Paulo';
  f := (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo';
  select coalesce(array_agg(fila_ref order by nome), '{}') into v_filas
    from crm.filas_config where v_admin or lider_id = auth.uid();

  with a as (
    select t.id, t.fila_ref, t.canal, t.responsavel_id, t.status, t.aguardando_cliente, t.created_at, t.resolvido_em,
           t.status <> 'resolvido' as aberto,
           t.created_at >= i and t.created_at < f as novo,
           t.resolvido_em >= i and t.resolvido_em < f as resolvido_periodo,
           c.sla_primeira_min as sla,
           case when t.status <> 'resolvido' and t.primeira_resposta_em is null and not t.aguardando_cliente and c.fila_ref is not null
                then crm.minutos_uteis(t.created_at, now(), c.dias, c.abre, c.fecha) end as espera,
           case when t.primeira_resposta_em is not null and t.created_at >= i and t.created_at < f and c.fila_ref is not null
                then crm.minutos_uteis(t.created_at, t.primeira_resposta_em, c.dias, c.abre, c.fecha) end as resp
      from crm.atendimentos t left join crm.filas_config c on c.fila_ref = t.fila_ref
     where t.fila_ref = any (v_filas) or (v_admin and t.fila_ref is null)),
  b as (select a.*, coalesce(espera > sla, false) as atrasado,
               coalesce(espera >= sla * 0.75 and espera <= sla, false) as perto,
               resp is not null and resp <= sla as no_prazo from a),
  pessoas as (
    select m.user_id from crm.fila_membros m where m.fila_ref = any (v_filas)
    union select responsavel_id from b where responsavel_id is not null and (aberto or novo or resolvido_periodo))
  select jsonb_build_object(
    'agora', (select jsonb_build_object(
        'abertos', count(*) filter (where aberto),
        'sem_responsavel', count(*) filter (where aberto and responsavel_id is null),
        'atrasados', count(*) filter (where aberto and atrasado),
        'perto_do_prazo', count(*) filter (where aberto and perto),
        'aguardando_cliente', count(*) filter (where aberto and aguardando_cliente)) from b),
    'periodo', (select jsonb_build_object(
        'novos', count(*) filter (where novo),
        'resolvidos', count(*) filter (where resolvido_periodo),
        'respondidos', count(*) filter (where resp is not null),
        'primeira_resposta_media_min', round(avg(resp))::int,
        'no_prazo_pct', case when count(resp) > 0 then round(100.0 * count(*) filter (where no_prazo) / count(resp))::int end) from b),
    'por_fila', (select coalesce(jsonb_agg(x order by x->>'nome'), '[]') from (
        select jsonb_build_object('fila', c.fila_ref, 'nome', c.nome, 'sla_min', c.sla_primeira_min,
          'abertos', count(b.id) filter (where b.aberto),
          'sem_responsavel', count(b.id) filter (where b.aberto and b.responsavel_id is null),
          'atrasados', count(b.id) filter (where b.aberto and b.atrasado),
          'novos', count(b.id) filter (where b.novo),
          'resolvidos', count(b.id) filter (where b.resolvido_periodo),
          'primeira_resposta_media_min', round(avg(b.resp))::int,
          'no_prazo_pct', case when count(b.resp) > 0 then round(100.0 * count(b.id) filter (where b.no_prazo) / count(b.resp))::int end) x
          from crm.filas_config c left join b on b.fila_ref = c.fila_ref
         where c.fila_ref = any (v_filas) group by c.fila_ref, c.nome, c.sla_primeira_min) s),
    'por_pessoa', (select coalesce(jsonb_agg(x order by (x->>'abertos')::int desc, x->>'nome'), '[]') from (
        select jsonb_build_object('user_id', p.user_id, 'nome', coalesce(pf.nome, 'Sem nome'),
          'online', exists (select 1 from crm.sessoes s where s.user_id = p.user_id and s.encerrada_em is null and s.visto_em > now() - interval '5 minutes'),
          'abertos', count(b.id) filter (where b.aberto),
          'atrasados', count(b.id) filter (where b.aberto and b.atrasado),
          'resolvidos', count(b.id) filter (where b.resolvido_periodo),
          'primeira_resposta_media_min', round(avg(b.resp))::int) x
          from pessoas p left join crm.perfis pf on pf.user_id = p.user_id left join b on b.responsavel_id = p.user_id
         where pf.ativo is distinct from false
         group by p.user_id, pf.nome) s),
    'por_canal', (select coalesce(jsonb_agg(jsonb_build_object('canal', k.canal,
          'abertos', (select count(*) from b where b.canal = k.canal and b.aberto),
          'atrasados', (select count(*) from b where b.canal = k.canal and b.aberto and b.atrasado),
          'novos', (select count(*) from b where b.canal = k.canal and b.novo),
          'resolvidos', (select count(*) from b where b.canal = k.canal and b.resolvido_periodo)) order by k.o), '[]')
          from (values ('whatsapp', 1), ('instagram', 2), ('google', 3)) k(canal, o))
  ) into v_atd;

  if crm.pode('comercial') then
    with n as (
      select n.id, n.valor, n.probabilidade, n.created_at, n.fechado_em, n.origem_id, n.motivo_perda_id, e.tipo, e.nome etapa, e.ordem,
             n.created_at >= i and n.created_at < f as novo,
             n.fechado_em >= i and n.fechado_em < f as fechado_periodo
        from crm.negocios n join crm.funil_etapas e on e.id = n.etapa_id join crm.funis fu on fu.id = n.funil_id
       where fu.ativo)
    select jsonb_build_object(
      'novos', count(*) filter (where novo),
      'novos_valor', coalesce(sum(valor) filter (where novo), 0),
      'ganhos', count(*) filter (where tipo = 'ganho' and fechado_periodo),
      'ganhos_valor', coalesce(sum(valor) filter (where tipo = 'ganho' and fechado_periodo), 0),
      'perdidos', count(*) filter (where tipo = 'perdido' and fechado_periodo),
      'conversao_pct', case when count(*) filter (where tipo <> 'aberta' and fechado_periodo) > 0
           then round(100.0 * count(*) filter (where tipo = 'ganho' and fechado_periodo) / count(*) filter (where tipo <> 'aberta' and fechado_periodo))::int end,
      'abertos', count(*) filter (where tipo = 'aberta'),
      'abertos_valor', coalesce(sum(valor) filter (where tipo = 'aberta'), 0),
      'previsto_valor', coalesce(round(sum(valor * coalesce(probabilidade, 0) / 100.0) filter (where tipo = 'aberta'), 2), 0),
      'por_etapa', (select coalesce(jsonb_agg(jsonb_build_object('etapa', e.nome, 'qtd',
            (select count(*) from n where n.etapa = e.nome and n.tipo = 'aberta'),
            'valor', (select coalesce(sum(valor), 0) from n where n.etapa = e.nome and n.tipo = 'aberta')) order by e.ordem), '[]')
          from crm.funil_etapas e join crm.funis fu on fu.id = e.funil_id where fu.ativo and e.tipo = 'aberta'),
      'motivos_perda', (select coalesce(jsonb_agg(jsonb_build_object('motivo', m.nome, 'qtd', m.q) order by m.q desc, m.nome), '[]') from (
          select mp.nome, count(*) q from n join crm.motivos_perda mp on mp.id = n.motivo_perda_id
           where n.tipo = 'perdido' and n.fechado_periodo group by mp.nome order by count(*) desc, mp.nome limit 5) m),
      'por_origem', (select coalesce(jsonb_agg(jsonb_build_object('origem', o.nome, 'novos', o.novos, 'ganhos', o.ganhos, 'perdidos', o.perdidos,
            'ganhos_valor', o.gv) order by o.novos desc, o.nome), '[]') from (
          select coalesce(og.nome, 'Sem origem') nome,
                 count(*) filter (where n.novo) novos,
                 count(*) filter (where n.tipo = 'ganho' and n.fechado_periodo) ganhos,
                 count(*) filter (where n.tipo = 'perdido' and n.fechado_periodo) perdidos,
                 coalesce(sum(n.valor) filter (where n.tipo = 'ganho' and n.fechado_periodo), 0) gv
            from n left join crm.origens og on og.id = n.origem_id
           where n.novo or n.fechado_periodo group by coalesce(og.nome, 'Sem origem')) o))
      into v_com from n;
  end if;

  return v_atd || jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'gerado_em', now(), 'todas_filas', v_admin,
    'filas', (select coalesce(jsonb_agg(jsonb_build_object('fila', fila_ref, 'nome', nome) order by nome), '[]') from crm.filas_config where fila_ref = any (v_filas)),
    'comercial', v_com);
end $$;

revoke all on function crm.minutos_uteis(timestamptz, timestamptz, text, time, time), crm.painel_gestor(date, date) from public, anon;
grant execute on function crm.minutos_uteis(timestamptz, timestamptz, text, time, time), crm.painel_gestor(date, date) to authenticated, service_role;
