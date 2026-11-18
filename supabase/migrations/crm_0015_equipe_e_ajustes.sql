-- crm_0015_equipe_e_ajustes.sql
-- Parte 1 da troca da demonstração pelo banco: equipe (perfis e tipo de acesso, sem limite de usuários), sessões (logado / encerrar sessão),
-- setores e filas, tags, respostas rápidas e mensagem de ausência.
-- Idempotente. NÃO altera tabelas do sistema jurídico.
-- Os usuários do Supabase Auth são compartilhados com o sistema jurídico: o CRM NUNCA apaga usuário do Auth.
-- "Excluir" no CRM = tirar o acesso ao CRM (as linhas de crm.acessos) e desativar o perfil.

-- ---- sessão atual: claim session_id do JWT do Supabase (o PostgREST preenche request.jwt.claims) ------------
create or replace function crm.sessao_atual() returns text
language sql stable set search_path = '' as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'session_id', '')
$$;

-- ---- perfis da equipe ------------------------------------------------------------------------------------
create table if not exists crm.perfis (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  nome          text not null check (length(btrim(nome)) between 2 and 80),
  email         text not null check (position('@' in email) > 1),
  funcao        text check (funcao is null or length(funcao) <= 60),
  ve_todos      boolean not null default false,      -- atendente que também vê a fila "Todos os clientes"
  ativo         boolean not null default true,
  ultimo_acesso timestamptz,                         -- último login
  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table crm.perfis is 'Nome, e-mail, função e opções de cada pessoa da equipe. O tipo de acesso fica em crm.acessos; as filas em crm.fila_membros.';
create unique index if not exists ux_perfis_nome on crm.perfis (lower(btrim(nome))) where ativo;
create unique index if not exists ux_perfis_email on crm.perfis (lower(email));
create or replace trigger trg_perfis_upd before update on crm.perfis for each row execute function crm.set_updated_at();

-- ---- sessões: quem está logado e "encerrar sessão" pelo administrador ---------------------------------------
create table if not exists crm.sessoes (
  sessao_id     text primary key,                    -- session_id do JWT do Supabase Auth
  user_id       uuid not null references auth.users(id) on delete cascade,
  inicio        timestamptz not null default now(),
  visto_em      timestamptz not null default now(),
  encerrada_em  timestamptz,
  encerrada_por uuid references auth.users(id) on delete set null
);
comment on table crm.sessoes is 'Sessões do app (atualizadas a cada minuto). Sessão encerrada pelo administrador perde o acesso ao banco na hora.';
create index if not exists ix_sessoes_user on crm.sessoes (user_id, visto_em desc);

create or replace function crm.sessao_valida() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from crm.sessoes s where s.sessao_id = crm.sessao_atual() and s.encerrada_em is not null)
$$;

-- As três funções de acesso passam a recusar sessão encerrada (vale para todas as políticas de RLS do CRM).
create or replace function crm.pode(p_area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select crm.sessao_valida() and exists (
    select 1 from crm.acessos a
    where a.user_id = auth.uid()
      and (a.area = p_area or a.area = 'admin' or a.papel = 'admin'))
$$;
create or replace function crm.eh_lider() returns boolean
language sql stable security definer set search_path = '' as $$
  select crm.sessao_valida() and exists (select 1 from crm.acessos a where a.user_id = auth.uid() and a.papel in ('lider','admin'))
$$;
create or replace function crm.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select crm.sessao_valida() and exists (select 1 from crm.acessos a where a.user_id = auth.uid() and a.papel = 'admin')
$$;
drop policy if exists p_acessos_sel on crm.acessos;
create policy p_acessos_sel on crm.acessos for select to authenticated using ((user_id = auth.uid() and crm.sessao_valida()) or crm.eh_admin());

-- tipo de acesso a partir de crm.acessos (mesma regra do app)
create or replace function crm.tipo_acesso(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from crm.acessos a where a.user_id = p_user and (a.papel = 'admin' or a.area = 'admin')) then 'admin'
    when exists (select 1 from crm.acessos a where a.user_id = p_user and a.papel = 'lider') then 'lider'
    when exists (select 1 from crm.acessos a where a.user_id = p_user) then 'atendente'
  end
$$;

-- ---- presença (chamada pelo app no login e a cada minuto) ----------------------------------------------------
-- Devolve false quando a sessão foi encerrada ou a pessoa perdeu o acesso: o app sai na hora.
create or replace function crm.registrar_presenca(p_login boolean default false) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_u uuid := auth.uid(); v_s text := crm.sessao_atual();
begin
  if v_u is null or not crm.sessao_valida() or not exists (select 1 from crm.acessos where user_id = v_u) then return false; end if;
  if v_s is not null then
    insert into crm.sessoes (sessao_id, user_id) values (v_s, v_u)
    on conflict (sessao_id) do update set visto_em = now() where crm.sessoes.user_id = v_u;
  end if;
  -- quem recebeu acesso pelo SQL Editor (ex.: primeiro administrador) ganha um perfil com o início do e-mail
  insert into crm.perfis (user_id, nome, email)
  select u.id, initcap(replace(split_part(u.email, '@', 1), '.', ' ')), lower(u.email) from auth.users u where u.id = v_u
  on conflict do nothing;
  if p_login then update crm.perfis set ultimo_acesso = now() where user_id = v_u; end if;
  return true;
end $$;

-- ---- equipe (para a lista de transferência, as menções @ e a página Usuários) --------------------------------
-- Todos com acesso ao CRM veem nome, e-mail, função, tipo e filas. Presença e último acesso: só o administrador.
create or replace function crm.equipe()
returns table (user_id uuid, nome text, email text, funcao text, tipo text, ve_todos boolean, filas text[],
               online boolean, ultimo_acesso timestamptz, visto_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.nome, p.email, p.funcao, crm.tipo_acesso(p.user_id), p.ve_todos,
         coalesce((select array_agg(m.fila_ref order by m.fila_ref) from crm.fila_membros m where m.user_id = p.user_id), '{}'),
         case when crm.eh_admin() then exists (select 1 from crm.sessoes s where s.user_id = p.user_id and s.encerrada_em is null and s.visto_em > now() - interval '5 minutes') end,
         case when crm.eh_admin() then p.ultimo_acesso end,
         case when crm.eh_admin() then (select max(s.visto_em) from crm.sessoes s where s.user_id = p.user_id) end
  from crm.perfis p
  where p.ativo and exists (select 1 from crm.acessos a where a.user_id = p.user_id)
    and crm.sessao_valida() and exists (select 1 from crm.acessos a where a.user_id = auth.uid())
  order by lower(p.nome)
$$;

-- ---- administração de usuários (só administrador) --------------------------------------------------------------
-- Usado pela Edge Function usuarios-convite (service_role) para não convidar de novo quem já tem login.
create or replace function crm.usuario_id_por_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1
$$;

create or replace function crm.usuario_salvar(p_user uuid, p_nome text, p_email text, p_funcao text, p_tipo text,
                                              p_filas text[] default null, p_ve_todos boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_era text;
begin
  if not crm.eh_admin() then raise exception 'só o administrador gerencia usuários'; end if;
  if p_tipo is null or p_tipo not in ('atendente','lider','admin') then raise exception 'tipo de acesso inválido'; end if;
  p_nome := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  if length(p_nome) < 2 then raise exception 'escreva o nome'; end if;
  p_email := lower(btrim(coalesce(p_email, '')));
  if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then raise exception 'informe um e-mail válido'; end if;  -- e precisa ser o do login (abaixo)
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'usuário não encontrado no login (Supabase Auth)'; end if;
  if exists (select 1 from auth.users u where u.id = p_user and lower(u.email) <> p_email) then
    raise exception 'o e-mail não confere com o cadastro de login; para trocar o e-mail, crie um usuário novo'; end if;
  if exists (select 1 from crm.perfis x where x.ativo and x.user_id <> p_user and lower(btrim(x.nome)) = lower(p_nome)) then
    raise exception 'já existe um usuário com este nome'; end if;
  v_era := crm.tipo_acesso(p_user);   -- sem limite de usuários (decisão de 12/11/2026)
  if v_era = 'admin' and p_tipo <> 'admin' then
    if p_user = auth.uid() then raise exception 'você não pode tirar o seu próprio acesso de administrador'; end if;
    if (select count(distinct a.user_id) from crm.acessos a where a.papel = 'admin' or a.area = 'admin') <= 1 then
      raise exception 'o escritório precisa ter ao menos um administrador'; end if;
  end if;
  if p_filas is not null and exists (select 1 from unnest(p_filas) f where f not in (select c.fila_ref from crm.filas_config c)) then
    raise exception 'fila inexistente'; end if;

  insert into crm.perfis (user_id, nome, email, funcao, ve_todos, ativo)
  values (p_user, p_nome, p_email, nullif(btrim(coalesce(p_funcao, '')), ''), coalesce(p_ve_todos, false) and p_tipo = 'atendente', true)
  on conflict (user_id) do update set nome = excluded.nome, email = excluded.email, funcao = excluded.funcao,
                                      ve_todos = excluded.ve_todos, ativo = true;
  -- tipo de acesso -> áreas (mesma regra da tela: líder vê atendimento, CRM e gestão; atendente, atendimento e CRM)
  if v_era is distinct from p_tipo then
    delete from crm.acessos where user_id = p_user;
    insert into crm.acessos (user_id, area, papel)
    select p_user, x.area, x.papel from (values
      ('admin','admin','admin'),
      ('lider','atendimento','lider'),('lider','comercial','lider'),('lider','gestao','lider'),
      ('atendente','atendimento','atendente'),('atendente','comercial','atendente')) as x(tipo, area, papel)
    where x.tipo = p_tipo;
  end if;
  if p_filas is not null then
    delete from crm.fila_membros m where m.user_id = p_user and m.fila_ref <> all (p_filas);
    insert into crm.fila_membros (fila_ref, user_id, ordem)
    select f, p_user, coalesce((select max(m.ordem) + 1 from crm.fila_membros m where m.fila_ref = f), 1)
    from unnest(p_filas) f on conflict do nothing;
  end if;
end $$;

-- Tira o acesso ao CRM (não apaga o login, que é do Supabase Auth e serve também ao sistema jurídico).
create or replace function crm.usuario_desativar(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_at int; v_ng int;
begin
  if not crm.eh_admin() then raise exception 'só o administrador gerencia usuários'; end if;
  if p_user = auth.uid() then raise exception 'você não pode excluir o seu próprio usuário'; end if;
  if crm.tipo_acesso(p_user) = 'admin'
     and (select count(distinct a.user_id) from crm.acessos a where a.papel = 'admin' or a.area = 'admin') <= 1 then
    raise exception 'o escritório precisa ter ao menos um administrador'; end if;
  update crm.atendimentos set responsavel_id = null, status = 'aguardando' where responsavel_id = p_user and status <> 'resolvido';
  get diagnostics v_at = row_count;
  update crm.negocios set responsavel_id = null where responsavel_id = p_user and fechado_em is null;
  get diagnostics v_ng = row_count;
  update crm.filas_config set lider_id = null where lider_id = p_user;
  delete from crm.fila_membros where user_id = p_user;
  delete from crm.acessos where user_id = p_user;
  update crm.perfis set ativo = false where user_id = p_user;
  update crm.sessoes set encerrada_em = now(), encerrada_por = auth.uid() where user_id = p_user and encerrada_em is null;
  return jsonb_build_object('atendimentos', v_at, 'negocios', v_ng);
end $$;

create or replace function crm.usuario_encerrar_sessao(p_user uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if not crm.eh_admin() then raise exception 'só o administrador encerra sessões'; end if;
  if p_user = auth.uid() then raise exception 'esta é a sua sessão: use Sair'; end if;
  update crm.sessoes set encerrada_em = now(), encerrada_por = auth.uid() where user_id = p_user and encerrada_em is null;
  get diagnostics v = row_count;
  return v;
end $$;

-- ---- setores e filas -------------------------------------------------------------------------------------------
-- Escrita só pelas funções abaixo (antes qualquer atendente podia mudar horário e prazo direto na tabela).
-- O rodízio passa a rodar com os direitos do dono (avança o ponteiro sem dar escrita na tabela).
create or replace function crm.atribuir_rodizio(p_fila text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_cfg crm.filas_config%rowtype; v_n int; v_user uuid;
begin
  if auth.uid() is not null and not crm.pode('atendimento') then raise exception 'sem acesso ao atendimento'; end if;
  select * into v_cfg from crm.filas_config where fila_ref = p_fila for update;
  if not found or not v_cfg.rodizio_ativo then return null; end if;
  select count(*) into v_n from crm.fila_membros where fila_ref = p_fila;
  if v_n = 0 then return null; end if;
  select user_id into v_user from crm.fila_membros where fila_ref = p_fila
    order by ordem, user_id offset (v_cfg.rodizio_proximo % v_n) limit 1;
  update crm.filas_config set rodizio_proximo = (v_cfg.rodizio_proximo + 1) % v_n where fila_ref = p_fila;
  return v_user;
end $$;

create or replace function crm.fila_criar(p_nome text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_base text; v_ref text; v_i int := 1;
begin
  if not crm.eh_admin() then raise exception 'só o administrador cria filas'; end if;
  p_nome := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  if length(p_nome) < 2 or length(p_nome) > 40 then raise exception 'escreva o nome da fila (até 40 letras)'; end if;
  if exists (select 1 from crm.filas_config c where lower(c.nome) = lower(p_nome)) then raise exception 'já existe uma fila com esse nome'; end if;
  v_base := btrim(regexp_replace(lower(translate(p_nome,
              'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+', '-', 'g'), '-');
  if v_base = '' or v_base in ('minha','mencoes','todos') then v_base := 'fila'; end if;
  v_ref := v_base;
  while exists (select 1 from crm.filas_config c where c.fila_ref = v_ref) loop v_i := v_i + 1; v_ref := v_base || '-' || v_i; end loop;
  insert into crm.filas_config (fila_ref, nome, sla_primeira_min, sla_retorno_min) values (v_ref, p_nome, 15, 120);
  return v_ref;
end $$;

create or replace function crm.fila_salvar(p_ref text, p_dias text, p_abre time, p_fecha time, p_sla int, p_ret int, p_lider uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_admin() then raise exception 'só o administrador muda setores e prazos'; end if;
  if not exists (select 1 from crm.filas_config where fila_ref = p_ref) then raise exception 'fila não encontrada'; end if;
  if p_abre >= p_fecha then raise exception 'o horário de abertura precisa ser antes do fechamento'; end if;
  if p_sla is null or p_sla < 1 or p_ret is null or p_ret < 1 then raise exception 'prazos em minutos, a partir de 1'; end if;
  if p_lider is not null and crm.tipo_acesso(p_lider) is null then raise exception 'o líder precisa ter acesso ao CRM'; end if;
  update crm.filas_config set dias = p_dias, abre = p_abre, fecha = p_fecha, sla_primeira_min = p_sla, sla_retorno_min = p_ret, lider_id = p_lider
   where fila_ref = p_ref;
end $$;

create or replace function crm.fila_rodizio(p_ref text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_admin() then raise exception 'só o administrador liga ou desliga o rodízio'; end if;
  update crm.filas_config set rodizio_ativo = coalesce(p_on, false) where fila_ref = p_ref;
  if not found then raise exception 'fila não encontrada'; end if;
end $$;

-- ---- tags do escritório ----------------------------------------------------------------------------------------
create table if not exists crm.tags (
  nome       text primary key check (length(btrim(nome)) between 1 and 30),
  cor        int not null default 0 check (cor between 0 and 7),   -- índice da paleta do app (Azul … Dourado)
  criada_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table crm.tags is 'Tags que a equipe aplica aos contatos. Só o administrador cria e muda a cor.';
create unique index if not exists ux_tags_nome on crm.tags (lower(nome));
insert into crm.tags (nome, cor) values
  ('PJ',0),('Negociação ativa',1),('Lead novo',3),('Anúncio',6),('Servidor público',5),('Boleto dia 10',7),('Boleto dia 20',7),
  ('Urgente',2),('Aguardando documentos',3),('Inadimplente',2),('Possível reclamação',4),('Cliente VIP',7)
on conflict do nothing;

create or replace function crm.tag_salvar(p_nome text, p_cor int) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if not crm.eh_admin() then raise exception 'só o administrador cria tags e muda a cor'; end if;
  p_nome := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  if p_nome = '' or length(p_nome) > 30 then raise exception 'escreva o nome da tag (até 30 letras)'; end if;
  if p_cor is null or p_cor < 0 or p_cor > 7 then raise exception 'cor inválida'; end if;
  select t.nome into v from crm.tags t where lower(t.nome) = lower(p_nome);
  if v is null then insert into crm.tags (nome, cor) values (p_nome, p_cor) returning nome into v;
  else update crm.tags set cor = p_cor where nome = v; end if;
  return v;
end $$;

-- ---- respostas rápidas -----------------------------------------------------------------------------------------
create table if not exists crm.respostas_rapidas (
  atalho     text primary key check (atalho ~ '^/[a-z0-9]{1,20}$'),
  texto      text not null check (length(btrim(texto)) between 1 and 2000),
  criada_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table crm.respostas_rapidas is 'Textos prontos (digite / na mensagem). Todos criam; só o administrador exclui.';
insert into crm.respostas_rapidas (atalho, texto) values
  ('/dados', E'Esses são os dados necessários para elaboração da documentação inicial:\n\nNOME:\nCPF:\nRG:\nESTADO CIVIL:\nENDEREÇO:\nCEP:\nPROFISSÃO:\nE-mail:\nData de Nascimento:\nTelefone:\n\nO melhor dia para vencimento dos boletos seria dia 01, 05, 10 ou 20?'),
  ('/segundavia', 'Olá, [Nome]! Segue a segunda via do boleto com vencimento em [data]. Qualquer dúvida, é só chamar por aqui.')
on conflict do nothing;

create or replace function crm.resposta_criar(p_atalho text, p_texto text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.pode('atendimento') then raise exception 'sem acesso ao atendimento'; end if;
  p_atalho := lower(btrim(coalesce(p_atalho, '')));
  if left(p_atalho, 1) <> '/' then p_atalho := '/' || p_atalho; end if;
  if p_atalho !~ '^/[a-z0-9]{1,20}$' then raise exception 'atalho só com letras e números (até 20)'; end if;
  if length(btrim(coalesce(p_texto, ''))) = 0 then raise exception 'escreva o texto da resposta'; end if;
  if exists (select 1 from crm.respostas_rapidas where atalho = p_atalho) then raise exception 'já existe o atalho %', p_atalho; end if;
  insert into crm.respostas_rapidas (atalho, texto) values (p_atalho, btrim(p_texto));
  return p_atalho;
end $$;

create or replace function crm.resposta_excluir(p_atalho text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_admin() then raise exception 'só o administrador exclui respostas rápidas'; end if;
  delete from crm.respostas_rapidas where atalho = p_atalho;
  if not found then raise exception 'resposta rápida não encontrada'; end if;
end $$;

-- ---- mensagem de ausência ---------------------------------------------------------------------------------------
insert into crm.config (chave, valor) values
  ('ausencia', jsonb_build_object('on', true, 'text', 'Olá! Recebemos sua mensagem fora do nosso horário de atendimento. Retornamos no próximo dia útil a partir das 8h. Se for urgente, informe o assunto aqui.'))
on conflict (chave) do nothing;

create or replace function crm.ausencia_salvar(p_on boolean, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not crm.eh_admin() then raise exception 'só o administrador muda a mensagem de ausência'; end if;
  p_texto := btrim(coalesce(p_texto, ''));
  if p_on and p_texto = '' then raise exception 'escreva a mensagem de ausência ou desligue a resposta automática'; end if;
  if length(p_texto) > 1000 then raise exception 'mensagem de ausência com até 1000 letras'; end if;
  insert into crm.config (chave, valor) values ('ausencia', jsonb_build_object('on', coalesce(p_on, false), 'text', p_texto))
  on conflict (chave) do update set valor = excluded.valor;
end $$;

-- ---- proteção e permissões -------------------------------------------------------------------------------------
select crm.proteger('crm.perfis', 'atendimento');
select crm.proteger('crm.sessoes', 'admin');
select crm.proteger('crm.tags', 'atendimento');
select crm.proteger('crm.respostas_rapidas', 'atendimento');
-- perfis: cada um lê o próprio; a lista da equipe vem de crm.equipe()
drop policy if exists p_crm_sel on crm.perfis;
create policy p_crm_sel on crm.perfis for select to authenticated using ((user_id = auth.uid() and crm.sessao_valida()) or crm.eh_admin());
-- escrita só pelas funções (security definer)
revoke insert, update, delete on crm.perfis, crm.sessoes, crm.tags, crm.respostas_rapidas,
                                 crm.filas_config, crm.fila_membros, crm.config from authenticated;

revoke all on function crm.usuario_id_por_email(text) from public, anon, authenticated;
grant execute on function crm.usuario_id_por_email(text) to service_role;
revoke all on function crm.registrar_presenca(boolean), crm.equipe(), crm.tipo_acesso(uuid),
  crm.usuario_salvar(uuid,text,text,text,text,text[],boolean), crm.usuario_desativar(uuid), crm.usuario_encerrar_sessao(uuid),
  crm.fila_criar(text), crm.fila_salvar(text,text,time,time,int,int,uuid), crm.fila_rodizio(text,boolean), crm.tag_salvar(text,int),
  crm.resposta_criar(text,text), crm.resposta_excluir(text), crm.ausencia_salvar(boolean,text) from public, anon;
grant execute on function crm.sessao_atual(), crm.sessao_valida(), crm.registrar_presenca(boolean), crm.equipe(), crm.tipo_acesso(uuid),
  crm.usuario_salvar(uuid,text,text,text,text,text[],boolean), crm.usuario_desativar(uuid), crm.usuario_encerrar_sessao(uuid),
  crm.atribuir_rodizio(text), crm.fila_criar(text), crm.fila_salvar(text,text,time,time,int,int,uuid), crm.fila_rodizio(text,boolean), crm.tag_salvar(text,int),
  crm.resposta_criar(text,text), crm.resposta_excluir(text), crm.ausencia_salvar(boolean,text) to authenticated;
