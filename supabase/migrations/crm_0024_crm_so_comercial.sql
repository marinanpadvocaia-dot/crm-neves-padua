-- crm_0024_crm_so_comercial.sql
-- Pedido de 16/11/2026: o CRM é só do setor comercial, sem divisão por dono e com UM funil só
-- (saem os funis Gestão de Passivos PJ, Superendividamento PF e Acordos como divisões do CRM).
-- As filas do ATENDIMENTO com esses nomes continuam como estão: isto vale só para o CRM.
--
--   * Um funil: o antigo 'pj' vira "Comercial" (o código interno 'pj' fica, porque fluxos e importações
--     já gravados apontam para ele). Os funis 'se' e 'ac' são desligados; negócios que estiverem neles
--     passam para o funil Comercial, na etapa de mesma posição (Ganho e Perdido continuam Ganho e Perdido),
--     sem disparar fluxos.
--   * Só o setor comercial: a área 'comercial' (RLS de funis, negócios, atividades, campos, formulários,
--     importação) passa a exigir, além do acesso, participar da fila Comercial ou ser o líder dela.
--     Administrador continua vendo tudo. A fila vem de crm.config 'crm' {"fila": "comercial"}.
--   * Sem dono: a coluna responsavel_id dos negócios continua (histórico e fluxos antigos), mas a tela não usa.
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.

-- ---- quem é do setor comercial -------------------------------------------------------------------------
insert into crm.config (chave, valor) values ('crm', '{"fila":"comercial"}') on conflict (chave) do nothing;

create or replace function crm.fila_comercial() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.valor->>'fila' from crm.config c where c.chave = 'crm'), 'comercial')
$$;

create or replace function crm.do_comercial(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from crm.fila_membros m where m.user_id = p_user and m.fila_ref = crm.fila_comercial())
      or exists (select 1 from crm.filas_config f where f.lider_id = p_user and f.fila_ref = crm.fila_comercial())
$$;

-- Mesma regra da crm_0015 (sessão válida; administrador pode tudo), com o setor comercial na área 'comercial'.
create or replace function crm.pode(p_area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select crm.sessao_valida() and exists (
    select 1 from crm.acessos a
    where a.user_id = auth.uid()
      and (a.area = 'admin' or a.papel = 'admin'
           or (a.area = p_area and (p_area <> 'comercial' or crm.do_comercial(auth.uid())))))
$$;

-- ---- um funil só ---------------------------------------------------------------------------------------
do $$
declare v_pj uuid := (select id from crm.funis where slug = 'pj'); r record; v_et uuid;
begin
  if v_pj is null then return; end if;
  update crm.funis set nome = 'Comercial', ordem = 1, ativo = true where id = v_pj and nome <> 'Comercial';
  perform set_config('crm.importando', '1', true);   -- mover não é "mudou de etapa": não dispara fluxos
  for r in select n.id, e.ordem, e.tipo from crm.negocios n join crm.funil_etapas e on e.id = n.etapa_id
           where n.funil_id <> v_pj loop
    select id into v_et from crm.funil_etapas
     where funil_id = v_pj and (case when r.tipo = 'aberta' then tipo = 'aberta' and ordem = least(r.ordem, 6) else tipo = r.tipo end)
     order by ordem limit 1;
    update crm.negocios set funil_id = v_pj, etapa_id = v_et where id = r.id;
  end loop;
  perform set_config('crm.importando', '0', true);
  update crm.funis set ativo = false where slug <> 'pj' and ativo;
end $$;

-- ---- líderes de outros setores montam fluxos: leem só a ESTRUTURA do CRM (não os negócios) ----------------
-- Funil, etapas, origens, motivos de perda e campos aparecem nas opções dos acionadores e condições dos fluxos.
do $$
declare t text;
begin
  foreach t in array array['crm.funis','crm.funil_etapas','crm.origens','crm.motivos_perda','crm.campos_personalizados'] loop
    execute format('drop policy if exists p_crm_gestao_sel on %s', t);
    execute format('create policy p_crm_gestao_sel on %s for select to authenticated using ((select crm.pode(%L)))', t, 'gestao');
  end loop;
end $$;

revoke all on function crm.fila_comercial(), crm.do_comercial(uuid) from public, anon;
grant execute on function crm.fila_comercial(), crm.do_comercial(uuid) to authenticated, service_role;
