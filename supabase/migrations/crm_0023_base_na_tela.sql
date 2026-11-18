-- crm_0023_base_na_tela.sql
-- Troca da demonstração pelo banco, parte 6: Base de conhecimento na tela.
-- A base já existia (crm_0013: procedimentos por fila, permissões, histórico). Aqui entram só:
--   * restaurar um procedimento excluído por engano (só administrador; volta como nova versão, com histórico);
--   * limites de tamanho que a tela já respeitava (título até 120, até 30 passos de até 500 letras cada).
-- Idempotente. NÃO altera nenhuma tabela do sistema jurídico.

alter table crm.base_artigo_historico drop constraint if exists base_artigo_historico_acao_check;
alter table crm.base_artigo_historico add constraint base_artigo_historico_acao_check
  check (acao in ('criado','alterado','excluido','restaurado'));

-- Limites conferidos na gravação (a crm_0013 aceitava qualquer tamanho).
create or replace function crm.base_validar() returns trigger
language plpgsql as $$
begin
  if length(btrim(new.titulo)) > 120 then raise exception 'o título pode ter até 120 letras' using errcode = '22023'; end if;
  if jsonb_array_length(new.passos) > 30 then raise exception 'use até 30 passos' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements_text(new.passos) x where length(x) > 500) then
    raise exception 'cada passo pode ter até 500 letras' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists trg_base_validar on crm.base_artigos;
create trigger trg_base_validar before insert or update of titulo, passos on crm.base_artigos
  for each row execute function crm.base_validar();

-- Restaurar (só administrador). O procedimento volta com as mesmas filas.
create or replace function crm.restaurar_artigo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_admin() then raise exception 'só o administrador restaura procedimentos' using errcode = '42501'; end if;
  update crm.base_artigos set ativo = true, versao = versao + 1, atualizado_por = auth.uid() where id = p_id and not ativo;
  if not found then raise exception 'procedimento não encontrado ou já ativo' using errcode = 'P0002'; end if;
  insert into crm.base_artigo_historico (artigo_id, versao, acao, dados, user_id)
  select a.id, a.versao, 'restaurado',
         to_jsonb(a) || jsonb_build_object('filas', to_jsonb(coalesce((select array_agg(af.fila_ref) from crm.base_artigo_filas af where af.artigo_id = a.id), '{}'))),
         auth.uid()
    from crm.base_artigos a where a.id = p_id;
end $$;

revoke all on function crm.restaurar_artigo(uuid) from public, anon;
grant execute on function crm.restaurar_artigo(uuid) to authenticated;
