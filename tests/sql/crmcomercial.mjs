// CRM só do setor comercial, sem dono e com um funil só (crm_0024). A = admin, B = atendente.
import {readFileSync} from 'node:fs';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
export default async function({db,q,t,err,A,B}){
  console.log('\n— CRM só do comercial, um funil (crm_0024)');
  const novo=async e=>(await db.query(`insert into auth.users(email) values ('${e}') returning id`)).rows[0].id;
  const X=await novo('fora-comercial@x'),Y=await novo('lider-comercial@x');
  await db.exec(`insert into crm.acessos values ('${X}','atendimento','atendente'),('${X}','comercial','atendente'),('${Y}','comercial','lider'),('${Y}','atendimento','lider');
    insert into crm.filas_config(fila_ref,nome) values ('comercial','Comercial') on conflict do nothing;
    delete from crm.fila_membros where user_id in ('${X}','${Y}')`);
  let r=await q(`select slug,nome from crm.funis where ativo order by ordem`,A);
  t('um funil ativo só, chamado Comercial',r.rows.length===1&&r.rows[0].nome==='Comercial'&&r.rows[0].slug==='pj',JSON.stringify(r.rows));
  t('funis antigos não recebem negócio',/funil não encontrado/.test(await err(()=>q(`select crm.negocio_criar('se','X')`,A)))&&/funil não encontrado/.test(await err(()=>q(`select crm.negocio_criar('ac','X')`,A))));
  t('fora da fila Comercial: não cria negócio',/sem acesso à área comercial/.test(await err(()=>q(`select crm.negocio_criar('pj','Fora')`,X))));
  t('fora da fila Comercial: não enxerga funis nem negócios',(await q(`select count(*)::int n from crm.funis`,X)).rows[0].n===0&&(await q(`select count(*)::int n from crm.negocios`,X)).rows[0].n===0);
  await db.exec(`insert into crm.fila_membros(fila_ref,user_id) values ('comercial','${X}')`);
  const N=(await q(`select crm.negocio_criar('pj','Dentro do comercial') id`,X)).rows[0].id;
  t('entrou na fila Comercial: usa o CRM',!!N&&(await q(`select count(*)::int n from crm.negocios where id='${N}'`,X)).rows[0].n===1);
  await db.exec(`insert into crm.acessos values ('${Y}','gestao','lider') on conflict do nothing`);
  t('líder de outra área lê a estrutura do funil (para montar fluxos), mas não os negócios',(await q(`select count(*)::int n from crm.funil_etapas`,Y)).rows[0].n>0&&(await q(`select count(*)::int n from crm.negocios`,Y)).rows[0].n===0);
  await err(()=>q(`update crm.origens set nome='Mudado pelo líder' where nome='Indicação'`,Y));
  t('líder de outra área não muda a estrutura do funil',(await db.query(`select count(*)::int n from crm.origens where nome='Mudado pelo líder'`)).rows[0].n===0);
  t('líder de outra área não usa o CRM',/sem acesso à área comercial/.test(await err(()=>q(`select crm.negocio_criar('pj','Y')`,Y))));
  await db.exec(`update crm.filas_config set lider_id='${Y}' where fila_ref='comercial'`);
  t('líder da fila Comercial usa o CRM',!!(await q(`select crm.negocio_criar('pj','Do líder') id`,Y)).rows[0].id);
  t('atendimento continua sem o CRM',(await q(`select count(*)::int n from crm.negocios`,B)).rows[0].n===0);
  t('administrador continua vendo o CRM',(await q(`select count(*)::int n from crm.negocios where id='${N}'`,A)).rows[0].n===1);
  t('o resto do atendimento não muda (pode atendimento)',(await q(`select crm.pode('atendimento') p`,B)).rows[0].p===true);
  // negócio que ficou num funil antigo é levado para o Comercial ao reaplicar a migração, sem disparar fluxos
  const fid=async s=>(await db.query(`select id from crm.funis where slug='${s}'`)).rows[0].id,et=async(s,n)=>(await db.query(`select e.id from crm.funil_etapas e join crm.funis f on f.id=e.funil_id where f.slug='${s}' and e.nome='${n}'`)).rows[0].id;
  await db.exec(`insert into crm.negocios(funil_id,etapa_id,nome) values ('${await fid('ac')}','${await et('ac','Contraproposta')}','Antigo Acordos'),('${await fid('se')}','${await et('se','Ganho')}','Antigo Ganho')`);
  const ev0=(await db.query(`select count(*)::int n from crm.fluxo_eventos`)).rows[0].n;
  await db.exec(readFileSync(join(dirname(fileURLToPath(import.meta.url)),'..','..','supabase','migrations','crm_0024_crm_so_comercial.sql'),'utf8'));
  r=await db.query(`select n.nome, f.slug, e.nome etapa from crm.negocios n join crm.funis f on f.id=n.funil_id join crm.funil_etapas e on e.id=n.etapa_id where n.nome like 'Antigo%' order by n.nome`);
  t('negócios dos funis antigos vão para o Comercial na etapa de mesma posição',r.rows.map(x=>x.slug+':'+x.etapa).join(',')==='pj:Reunião agendada,pj:Ganho',JSON.stringify(r.rows));
  t('a mudança não dispara fluxos',(await db.query(`select count(*)::int n from crm.fluxo_eventos`)).rows[0].n===ev0);
  await db.exec(`update crm.filas_config set lider_id=null where fila_ref='comercial'; delete from crm.fila_membros where user_id='${X}'`);
}
