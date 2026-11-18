-- crm_0000_verificar_ambiente.sql
-- SOMENTE LEITURA. Não altera nada. Rode no SQL Editor do Supabase e envie o resultado
-- (em texto) para fechar os vínculos entre o CRM e as tabelas do sistema atual.

-- 1) Colunas e tipos das tabelas que o CRM vai ler ou importar
select table_name, ordinal_position as pos, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('leads','fases','historico_fases','observacoes','tags','cadencias','cadências',
                     'atd_filas','atd_conversas','atd_mensagens','atd_eventos','atd_respostas_rapidas',
                     'atd_regras_roteamento','clientes','contatos','contratos','tarefas',
                     'entradas_timeline','perfis','fluxos_mensagens','fluxo_passos','fluxo_execucoes')
order by table_name, ordinal_position;

-- 2) Chaves primárias e estrangeiras dessas tabelas
select tc.table_name, tc.constraint_type, kcu.column_name,
       ccu.table_name as referencia_tabela, ccu.column_name as referencia_coluna
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
left join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
where tc.table_schema = 'public' and tc.constraint_type in ('PRIMARY KEY','FOREIGN KEY')
  and tc.table_name in ('leads','fases','atd_filas','atd_conversas','atd_mensagens','clientes','contatos','perfis')
order by tc.table_name, tc.constraint_type;

-- 3) Já existe algo no schema crm? (para não colidir)
select table_schema, table_name from information_schema.tables where table_schema = 'crm';
