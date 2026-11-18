// Gera docs/modelo-de-dados.html a partir das migrações reais (aplicadas num Postgres local).
// Uso: node scripts/gerar-modelo.mjs
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),dir=join(root,'supabase','migrations');
const files=readdirSync(dir).filter(f=>/^crm_\d{4}.*\.sql$/.test(f)&&!f.startsWith('crm_0001')).sort();
const db=new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), email text);
 create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
for(const f of files.filter(f=>!f.startsWith('crm_0000')))await db.exec(readFileSync(join(dir,f),'utf8'));
const cols=(await db.query(`select c.table_name t,c.column_name n,c.data_type||coalesce('('||c.character_maximum_length||')','') ty,c.is_nullable='YES' nul,c.column_default d,c.is_generated g
 from information_schema.columns c join information_schema.tables t using(table_schema,table_name) where c.table_schema='crm' and t.table_type='BASE TABLE' order by c.table_name,c.ordinal_position`)).rows;
const fks=(await db.query(`select cl.relname t, cf.relname rt, a.attname col from pg_constraint k join pg_class cl on cl.oid=k.conrelid join pg_class cf on cf.oid=k.confrelid join pg_namespace n on n.oid=cl.relnamespace
 join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1] where k.contype='f' and n.nspname='crm' and cf.relname<>'users'`)).rows;
const pks=(await db.query(`select cl.relname t,a.attname c from pg_constraint k join pg_class cl on cl.oid=k.conrelid join pg_namespace n on n.oid=cl.relnamespace join pg_attribute a on a.attrelid=k.conrelid and a.attnum=any(k.conkey) where k.contype='p' and n.nspname='crm'`)).rows;
const desc=Object.fromEntries((await db.query(`select c.relname t,d.description x from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_description d on d.objoid=c.oid and d.objsubid=0 where n.nspname='crm'`)).rows.map(r=>[r.t,r.x]));
const MOD=[['Acesso','Quem entra, o que vê e sessões',['acessos','perfis','sessoes']],['Atendimento','Atendimentos, filas, rodízio, agendadas, tags, respostas rápidas',['filas_config','fila_membros','atendimentos','atendimento_historico','mensagens_agendadas','config','tags','respostas_rapidas']],['CRM','Funis, negócios, atividades, tarefas',['funis','funil_etapas','origens','motivos_perda','negocios','negocio_historico','atividades','campos_personalizados','respostas_formulario','tarefas']],['Fluxos de trabalho','Construtor, versões publicadas, pastas (automacoes: obsoleta)',['fluxos','fluxo_versoes','fluxo_pastas','fluxo_eventos','fluxo_inscricoes','fluxo_registros','fluxo_webhooks','contato_atividade','avisos','fluxo_execucoes','automacoes','automacao_execucoes']],['Agentes de IA','Agentes, regras, revisão, resumos',['agentes','agentes_historico','regras_ia','revisoes_ia','ia_exemplos','ia_pausas','consentimentos','resumos_semanais']],['Importação','Lotes e linhas',['importacoes','importacao_linhas']],['Canal e envio','Estado dos canais, fila de saída, webhook',['canais','canal_eventos','saida_mensagens','webhook_eventos']],['Saúde','Alertas operacionais',['alertas']],['Base de conhecimento','Procedimentos por fila',['base_artigos','base_artigo_filas','base_artigo_historico']]];
const tabelas=[...new Set(cols.map(c=>c.t))];
const model={mods:MOD.map(([n,s,ts])=>({n,s,tabelas:ts.filter(t=>tabelas.includes(t)).map(t=>({t,desc:desc[t]||'',pk:pks.filter(p=>p.t===t).map(p=>p.c),cols:cols.filter(c=>c.t===t).map(c=>({n:c.n,ty:c.ty,nul:c.nul,d:c.d,g:c.g==='ALWAYS',fk:(fks.find(f=>f.t===t&&f.col===c.n)||{}).rt||null}))}))})),
 sql:files.map(f=>({f,c:readFileSync(join(dir,f),'utf8')})),
 er:['erDiagram',...[...new Set(fks.map(f=>`  ${f.rt} ||--o{ ${f.t} : ""`))]].join('\n')};
const naoMapeadas=tabelas.filter(t=>!MOD.some(m=>m[2].includes(t)));if(naoMapeadas.length)console.warn('tabelas fora dos módulos:',naoMapeadas);
const tpl=readFileSync(join(root,'scripts','modelo.tpl.html'),'utf8');
mkdirSync(join(root,'docs'),{recursive:true});
writeFileSync(join(root,'docs','modelo-de-dados.html'),tpl.replace('<!--ER-->','<pre class="mermaid">'+model.er+'</pre>').replace('/*__DADOS__*/null',()=>JSON.stringify(model).replace(/</g,'\\u003c')));
console.log('docs/modelo-de-dados.html gerado:',tabelas.length,'tabelas');
