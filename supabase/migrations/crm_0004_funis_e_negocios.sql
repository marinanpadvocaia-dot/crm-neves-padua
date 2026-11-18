-- crm_0004_funis_e_negocios.sql
-- CRM: múltiplos funis por área, etapas, negócios (leads), atividades, campos personalizados.
-- O CRM é dono destes dados. Os leads do sistema atual entram por importação (crm_0007) usando legado_ref.

create table if not exists crm.funis (
  id     uuid primary key default gen_random_uuid(),
  slug   text not null unique,
  nome   text not null,
  ativo  boolean not null default true,
  ordem  int not null default 0
);
comment on table crm.funis is 'Um funil por área do escritório (PJ, Superendividamento, Acordos...).';

create table if not exists crm.funil_etapas (
  id            uuid primary key default gen_random_uuid(),
  funil_id      uuid not null references crm.funis(id) on delete cascade,
  nome          text not null,
  ordem         int not null,
  probabilidade int not null default 0 check (probabilidade between 0 and 100),
  tipo          text not null default 'aberta' check (tipo in ('aberta','ganho','perdido')),
  unique (funil_id, ordem),
  unique (funil_id, nome),
  unique (id, funil_id)
);
comment on table crm.funil_etapas is 'Etapas de cada funil. tipo ganho/perdido encerram o negócio.';

create table if not exists crm.origens (id uuid primary key default gen_random_uuid(), nome text not null unique, ativa boolean not null default true);
create table if not exists crm.motivos_perda (id uuid primary key default gen_random_uuid(), nome text not null unique, ativo boolean not null default true);

create table if not exists crm.negocios (
  id              uuid primary key default gen_random_uuid(),
  funil_id        uuid not null references crm.funis(id),
  etapa_id        uuid not null,
  nome            text not null,
  empresa         text,
  telefone        text,
  telefone_norm   text generated always as (crm.normalizar_telefone(telefone)) stored,
  email           text,
  valor           numeric(14,2) not null default 0 check (valor >= 0),
  probabilidade   int check (probabilidade between 0 and 100),
  responsavel_id  uuid references auth.users(id) on delete set null,
  origem_id       uuid references crm.origens(id),
  previsao_fechamento date,
  motivo_perda_id uuid references crm.motivos_perda(id),
  etapa_max_ordem int not null default 0,                  -- até onde chegou (relatório de conversão)
  conversa_ref    text,                                    -- conversa em atd_conversas
  legado_ref      text,                                    -- id do lead no sistema atual
  cliente_ref     text,                                    -- preenchido ao "Fechar contrato"
  externo_id      text,                                    -- id na ferramenta de origem (ex.: GCV)
  campos          jsonb not null default '{}'::jsonb,      -- campos personalizados
  importacao_id   uuid,
  fechado_em      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (etapa_id, funil_id) references crm.funil_etapas (id, funil_id),
  check (motivo_perda_id is null or fechado_em is not null)
);
comment on table crm.negocios is 'Lead/negócio no funil. A etapa precisa pertencer ao funil (FK composta).';
create index if not exists ix_negocios_funil_etapa on crm.negocios (funil_id, etapa_id);
create index if not exists ix_negocios_resp on crm.negocios (responsavel_id);
create index if not exists ix_negocios_tel on crm.negocios (telefone_norm) where telefone_norm is not null;
create unique index if not exists ux_negocios_externo on crm.negocios (externo_id) where externo_id is not null;
create unique index if not exists ux_negocios_legado on crm.negocios (legado_ref) where legado_ref is not null;
create or replace trigger trg_negocios_upd before update on crm.negocios for each row execute function crm.set_updated_at();

create table if not exists crm.negocio_historico (
  id          bigint generated always as identity primary key,
  negocio_id  uuid not null references crm.negocios(id) on delete cascade,
  de_etapa_id uuid references crm.funil_etapas(id),
  para_etapa_id uuid not null references crm.funil_etapas(id),
  user_id     uuid,
  criado_em   timestamptz not null default now()
);
create index if not exists ix_neg_hist on crm.negocio_historico (negocio_id, criado_em);

-- Ao mudar de etapa: registra histórico, ajusta probabilidade, "etapa máxima" e data de fechamento.
create or replace function crm.negocios_mudou_etapa() returns trigger language plpgsql as $$
declare v_ord int; v_prob int; v_tipo text;
begin
  select ordem, probabilidade, tipo into v_ord, v_prob, v_tipo from crm.funil_etapas where id = new.etapa_id;
  if tg_op = 'INSERT' then
    new.probabilidade := coalesce(new.probabilidade, v_prob);
    if v_tipo = 'aberta' then new.etapa_max_ordem := greatest(new.etapa_max_ordem, v_ord); end if;
    if v_tipo <> 'aberta' and new.fechado_em is null then new.fechado_em := now(); end if;
    return new;
  end if;
  if new.etapa_id is distinct from old.etapa_id then
    new.probabilidade := v_prob;
    if v_tipo = 'aberta' then new.etapa_max_ordem := greatest(new.etapa_max_ordem, v_ord); new.fechado_em := null; new.motivo_perda_id := null;
    else new.fechado_em := coalesce(new.fechado_em, now()); end if;
    insert into crm.negocio_historico(negocio_id, de_etapa_id, para_etapa_id, user_id) values (new.id, old.etapa_id, new.etapa_id, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_negocios_etapa on crm.negocios;
create or replace trigger trg_negocios_etapa before insert or update on crm.negocios for each row execute function crm.negocios_mudou_etapa();

create table if not exists crm.atividades (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     uuid not null references crm.negocios(id) on delete cascade,
  tipo           text not null check (tipo in ('ligacao','reuniao','followup','tarefa')),
  titulo         text not null,
  quando         timestamptz not null,
  concluida      boolean not null default false,
  concluida_em   timestamptz,
  responsavel_id uuid references auth.users(id) on delete set null,
  origem         text not null default 'manual' check (origem in ('manual','automacao','cadencia')),
  created_at     timestamptz not null default now()
);
comment on table crm.atividades is 'Ligações, reuniões, follow-ups e tarefas do negócio, com lembrete por data/hora.';
create index if not exists ix_atividades_abertas on crm.atividades (responsavel_id, quando) where not concluida;

create table if not exists crm.campos_personalizados (
  id     uuid primary key default gen_random_uuid(),
  chave  text not null unique check (chave ~ '^[a-z][a-z0-9_]*$'),
  nome   text not null,
  tipo   text not null check (tipo in ('texto','numero','data','lista')),
  opcoes text[],
  ordem  int not null default 0,
  check (tipo <> 'lista' or coalesce(array_length(opcoes,1),0) > 0)
);

create table if not exists crm.respostas_formulario (
  id         uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references crm.negocios(id) on delete cascade,
  pergunta   text not null,
  resposta   text,
  fonte      text,
  created_at timestamptz not null default now()
);
create index if not exists ix_resp_form on crm.respostas_formulario (negocio_id);

-- dados iniciais (idempotentes)
insert into crm.funis (slug, nome, ordem) values
  ('pj','Gestão de Passivos PJ',1), ('se','Superendividamento (PF)',2), ('ac','Acordos',3)
on conflict (slug) do nothing;

insert into crm.funil_etapas (funil_id, nome, ordem, probabilidade, tipo)
select f.id, e.nome, e.ordem, e.prob, e.tipo
from crm.funis f
join (values
 ('pj',1,'Novo lead',10,'aberta'),('pj',2,'Em contato',20,'aberta'),('pj',3,'Qualificado',35,'aberta'),('pj',4,'Reunião agendada',50,'aberta'),('pj',5,'Proposta enviada',65,'aberta'),('pj',6,'Negociação',80,'aberta'),('pj',7,'Ganho',100,'ganho'),('pj',8,'Perdido',0,'perdido'),
 ('se',1,'Novo lead',10,'aberta'),('se',2,'Análise das dívidas',20,'aberta'),('se',3,'Plano de pagamento',40,'aberta'),('se',4,'Documentação',55,'aberta'),('se',5,'Ajuizamento',70,'aberta'),('se',6,'Audiência',85,'aberta'),('se',7,'Ganho',100,'ganho'),('se',8,'Perdido',0,'perdido'),
 ('ac',1,'Novo lead',10,'aberta'),('ac',2,'Levantamento',20,'aberta'),('ac',3,'Proposta ao banco',40,'aberta'),('ac',4,'Contraproposta',60,'aberta'),('ac',5,'Minuta do acordo',80,'aberta'),('ac',6,'Assinatura',90,'aberta'),('ac',7,'Ganho',100,'ganho'),('ac',8,'Perdido',0,'perdido')
) as e(slug,ordem,nome,prob,tipo) on e.slug = f.slug
on conflict do nothing;

insert into crm.origens (nome) values ('Meta Ads'),('Google Ads'),('Indicação'),('Instagram'),('Orgânico'),('Formulário do site'),('GCV (importado)') on conflict do nothing;
insert into crm.motivos_perda (nome) values ('Sem resposta'),('Foi para outro escritório'),('Sem condições financeiras'),('Resolveu sozinho'),('Fora do perfil') on conflict do nothing;
insert into crm.campos_personalizados (chave, nome, tipo, opcoes, ordem) values
  ('banco','Banco principal','texto',null,1),('divida','Dívida total estimada (R$)','numero',null,2),('urg','Urgência','lista',array['Baixa','Média','Alta'],3)
on conflict (chave) do nothing;

select crm.proteger('crm.funis','comercial');
select crm.proteger('crm.funil_etapas','comercial');
select crm.proteger('crm.origens','comercial');
select crm.proteger('crm.motivos_perda','comercial');
select crm.proteger('crm.negocios','comercial');
select crm.proteger('crm.negocio_historico','comercial');
select crm.proteger('crm.atividades','comercial');
select crm.proteger('crm.campos_personalizados','comercial');
select crm.proteger('crm.respostas_formulario','comercial');
