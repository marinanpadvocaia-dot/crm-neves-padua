// Valida as migrações em um Postgres local (PGlite), simulando o básico do Supabase (auth.users, auth.uid, roles).
// Uso: node tests/sql/run.mjs   (não toca em nenhum banco real)
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
process.on('unhandledRejection',e=>{console.log('ERRO:',e&&e.message||e);process.exit(1)});
const dir=join(dirname(fileURLToPath(import.meta.url)),'..','..','supabase','migrations');
// todas as crm_NNNN, menos a 0000 (só leitura, roda no Supabase real) e a 0001 (guardada, não executar)
const files=readdirSync(dir).filter(f=>/^crm_\d{4}.*\.sql$/.test(f)&&!/^crm_000[01]/.test(f)).sort();
const db=new PGlite();
let ok=0,fail=0;const t=(n,c,x)=>{if(c){ok++;console.log('  ok  ',n)}else{fail++;console.log('  FALHA',n,x??'')}};
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
for(const rodada of [1,2]){ // 2ª rodada prova que as migrações são idempotentes
  for(const f of files){try{await db.exec(readFileSync(join(dir,f),'utf8'));if(rodada===1)console.log('aplicada',f)}catch(e){fail++;console.log('FALHA ao aplicar',f,'(rodada',rodada+')',e.message);process.exit(1)}}
}
t('migrações aplicam e reaplicam sem erro',true);
const q=async(sql,uid)=>{await db.exec(uid?`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`:`set role anon;`);try{return await db.query(sql)}finally{await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`)}};
const qs=async sql=>{await db.exec('set role service_role;');try{return await db.query(sql)}finally{await db.exec('reset role;')}};
const err=async f=>{try{await f();return ''}catch(e){return e.message}};
const [A,B,C]=(await db.query(`insert into auth.users(email) values ('admin@x'),('atend@x'),('sem@x') returning id`)).rows.map(r=>r.id);
await db.exec(`insert into crm.acessos values ('${A}','admin','admin'),('${B}','atendimento','atendente')`);
// RLS
let r=await q(`select count(*)::int n from crm.funis`,C);t('sem acesso: não enxerga funis (RLS falha fechada)',r.rows[0].n===0);
r=await q(`select count(*)::int n from crm.funis`,A);t('admin enxerga os 3 funis semeados',r.rows[0].n===3);
r=await q(`select count(*)::int n from crm.funil_etapas`,A);t('24 etapas semeadas (8 por funil)',r.rows[0].n===24);
try{await q(`select count(*) from crm.funis`);t('anon bloqueado',false)}catch(e){t('anon sem permissão',/permission denied/.test(e.message),e.message)}
r=await q(`select count(*)::int n from crm.funis`,B);t('atendimento não acessa a área comercial',r.rows[0].n===0);
try{await q(`insert into crm.acessos values ('${C}','admin','admin')`,B);t('atendente não se promove a admin',false)}catch(e){t('atendente não se promove a admin',/row-level security/.test(e.message),e.message)}
// atendimentos + rodízio + auditoria
await db.exec(`insert into crm.filas_config(fila_ref,nome,rodizio_ativo) values ('passivos','Gestão de Passivos PJ',true);
 insert into crm.fila_membros values ('passivos','${A}',1),('passivos','${B}',2)`);
const seq=[];for(let i=0;i<3;i++)seq.push((await q(`select crm.atribuir_rodizio('passivos') u`,B)).rows[0].u);
t('rodízio alterna A→B→A (ordem da fila)',seq[0]===A&&seq[1]===B&&seq[2]===A,JSON.stringify(seq));
await q(`insert into crm.atendimentos(conversa_ref,fila_ref,responsavel_id) values ('c1','passivos','${B}')`,B);
await q(`update crm.atendimentos set responsavel_id='${A}', status='resolvido'`,B);
r=await q(`select string_agg(campo,',' order by id) c from crm.atendimento_historico`,B);t('auditoria registra status e responsável',r.rows[0].c==='status,responsavel',r.rows[0].c);
r=await q(`select resolvido_em is not null ok from crm.atendimentos`,B);t('resolvido_em preenchido ao resolver',r.rows[0].ok===true);
r=await db.query(`select count(*)::int n from information_schema.columns where table_schema='crm' and table_name='atendimentos' and column_name in ('numero','prioridade','categoria')`);t('sem sistema de ticket: sem número, prioridade ou categoria',r.rows[0].n===0);
// negócios
const et=async(slug,nome)=>(await db.query(`select e.id from crm.funil_etapas e join crm.funis f on f.id=e.funil_id where f.slug='${slug}' and e.nome='${nome}'`)).rows[0].id;
const fid=async s=>(await db.query(`select id from crm.funis where slug='${s}'`)).rows[0].id;
const pj=await fid('pj'),se=await fid('se');
await q(`insert into crm.negocios(funil_id,etapa_id,nome,telefone,valor,externo_id) values ('${pj}','${await et('pj','Novo lead')}','Carlos','+55 (16) 99123-4455',45000,'1001')`,A);
r=await q(`select probabilidade p, telefone_norm tn from crm.negocios`,A);t('probabilidade vem da etapa e telefone é normalizado',r.rows[0].p===10&&r.rows[0].tn==='16991234455',JSON.stringify(r.rows[0]));
try{await q(`update crm.negocios set etapa_id='${await et('se','Audiência')}'`,A);t('etapa de outro funil rejeitada',false)}catch(e){t('etapa de outro funil rejeitada (FK composta)',/foreign key/.test(e.message),e.message)}
await q(`update crm.negocios set etapa_id='${await et('pj','Negociação')}'`,A);
r=await q(`select probabilidade p, etapa_max_ordem m from crm.negocios`,A);t('mover etapa atualiza probabilidade e etapa máxima',r.rows[0].p===80&&r.rows[0].m===6,JSON.stringify(r.rows[0]));
await q(`update crm.negocios set etapa_id='${await et('pj','Perdido')}', motivo_perda_id=(select id from crm.motivos_perda limit 1)`,A);
r=await q(`select fechado_em is not null f from crm.negocios`,A);t('Perdido fecha o negócio',r.rows[0].f===true);
r=await q(`select count(*)::int n from crm.negocio_historico`,A);t('histórico de etapas gravado (2 mudanças)',r.rows[0].n===2);
r=await q(`select crm.achar_negocio_existente('16 99123-4455',null,null) id`,A);t('dedupe por telefone encontra o negócio',!!r.rows[0].id);
r=await q(`select crm.achar_negocio_existente('11 90000-0000','1001',null) id`,A);t('dedupe por ID externo encontra o negócio',!!r.rows[0].id);
r=await q(`select crm.achar_negocio_existente('11 90000-0000','999','x@y') id`,A);t('dedupe não inventa correspondência',r.rows[0].id===null);
try{await db.exec(`insert into crm.automacoes(gatilho,acao) values ('nova_conversa','mensagem')`);t('ação mensagem exige texto',false)}catch(e){t('ação mensagem exige texto',/check constraint/.test(e.message))}
await db.exec(`insert into crm.automacoes(gatilho,acao,mensagem_texto,atraso_min) values ('nova_conversa','mensagem','Olá, {nome}!',5)`);
r=await q(`select count(*)::int n from crm.automacoes`,A);t('automação com mensagem e atraso gravada',r.rows[0].n===1);
await import('./passo1.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./base.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./ia.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./equipe.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./crm.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./tarefas.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./fluxos.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./motor.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./importacao.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./canais.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./basetela.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./crmcomercial.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./painel.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
await import('./agentesedit.mjs').then(m=>m.default({db,q,qs,t,err,A,B,C}));
// estrutura
r=await db.query(`select count(*)::int n from information_schema.tables where table_schema='crm' and table_type='BASE TABLE'`);console.log('\ntabelas no schema crm:',r.rows[0].n);
r=await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='crm' and c.relkind='r' and not c.relrowsecurity`);t('todas as tabelas com RLS ligado',r.rows.length===0,r.rows.map(x=>x.relname).join(','));
console.log(`\n${ok} ok, ${fail} falhas`);process.exit(fail?1:0);
