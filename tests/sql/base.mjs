// Testes da Base de conhecimento por fila (crm_0013). A = admin, B = atendente da fila passivos, L = líder de passivos.
export default async function({db,q,t,err,A,B}){
  console.log('\n— Base de conhecimento por fila');
  const L=(await db.query(`insert into auth.users(email) values ('lider@x') returning id`)).rows[0].id;
  const D=(await db.query(`insert into auth.users(email) values ('outra@x') returning id`)).rows[0].id;
  await db.exec(`insert into crm.acessos values ('${L}','atendimento','lider'),('${D}','atendimento','atendente') on conflict do nothing;
    insert into crm.filas_config(fila_ref,nome) values ('financeiro','Financeiro'),('super','Superendividamento') on conflict do nothing;
    update crm.filas_config set lider_id='${L}' where fila_ref in ('passivos','super');
    insert into crm.fila_membros values ('financeiro','${D}',1) on conflict do nothing;`);
  const salvar=(uid,{id=null,titulo='Procedimento',todas=false,filas=[],passos=['Passo 1'],rr=null}={})=>
    q(`select crm.salvar_artigo(${id?`'${id}'`:'null'},'${titulo}',${todas},array[${filas.map(f=>`'${f}'`).join(',')}]::text[],'quando',$$${JSON.stringify(passos)}$$::jsonb,null,null,${rr?`'${rr}'`:'null'}) id`,uid).then(r=>r.rows[0].id);
  const ve=async(uid,id)=>(await q(`select count(*)::int n from crm.base_artigos where id='${id}'`,uid)).rows[0].n===1;

  const geral=await salvar(A,{titulo:'Cliente irritado',todas:true,rr:'/demora'});
  const fin=await salvar(A,{titulo:'Segunda via de boleto',filas:['financeiro']});
  const pas=await salvar(A,{titulo:'Andamento do caso',filas:['passivos','super']});
  t('admin cria procedimento geral e por fila',!!geral&&!!fin&&!!pas);
  t('geral aparece para qualquer atendente',await ve(B,geral)&&await ve(D,geral));
  t('procedimento do Financeiro não aparece para quem é só de Passivos',!(await ve(B,fin)));
  t('procedimento do Financeiro aparece para quem é do Financeiro',await ve(D,fin));
  t('procedimento de Passivos aparece para quem é de Passivos',await ve(B,pas)&&!(await ve(D,pas)));
  t('líder e admin veem a base inteira',await ve(L,fin)&&await ve(A,fin));
  t('quem não tem acesso não vê nada',(await q(`select count(*)::int n from crm.base_artigos`,'00000000-0000-0000-0000-000000000000')).rows[0].n===0);
  t('as filas do procedimento seguem a mesma visibilidade',(await q(`select count(*)::int n from crm.base_artigo_filas where artigo_id='${fin}'`,B)).rows[0].n===0);

  t('atendente não cria procedimento',/sem permissão/.test(await err(()=>salvar(B,{filas:['passivos']}))));
  t('atendente não grava direto na tabela',/permission denied/.test(await err(()=>q(`insert into crm.base_artigos(titulo,todas_filas) values ('x',true)`,B))));
  const meu=await salvar(L,{titulo:'Conferir extratos',filas:['passivos'],passos:[' Pedir extrato ','','Conferir saldo']});
  t('líder cria procedimento da fila que lidera',!!meu);
  t('passos vazios são descartados e espaços removidos',JSON.stringify((await db.query(`select passos from crm.base_artigos where id='${meu}'`)).rows[0].passos)==='["Pedir extrato","Conferir saldo"]');
  t('líder não cria procedimento de fila que não lidera',/sem permissão/.test(await err(()=>salvar(L,{filas:['financeiro']}))));
  t('líder não cria procedimento geral (só o administrador)',/sem permissão/.test(await err(()=>salvar(L,{todas:true}))));
  t('líder não altera procedimento de outro setor',/sem permissão/.test(await err(()=>salvar(L,{id:fin,filas:['passivos']}))));
  t('líder não altera procedimento geral',/sem permissão/.test(await err(()=>salvar(L,{id:geral,filas:['passivos']}))));
  t('líder não leva o seu procedimento para outro setor',/sem permissão/.test(await err(()=>salvar(L,{id:meu,filas:['financeiro']}))));
  await salvar(L,{id:meu,titulo:'Conferir extratos bancários',filas:['passivos','super']});
  let r=(await db.query(`select titulo,versao from crm.base_artigos where id='${meu}'`)).rows[0];
  t('líder altera o seu: nova versão',r.titulo==='Conferir extratos bancários'&&r.versao===2);
  t('procedimento por fila exige ao menos uma fila',/ao menos uma fila/.test(await err(()=>salvar(A,{filas:[]}))));
  t('atalho de resposta rápida inválido é recusado',/check constraint/.test(await err(()=>salvar(A,{todas:true,rr:'dados sem barra'}))));
  await q(`select crm.excluir_artigo('${meu}')`,L);
  t('excluir: some para o atendimento',!(await ve(B,meu)));
  t('excluir: administrador ainda enxerga (auditoria)',await ve(A,meu));
  t('não dá para excluir de novo',/não encontrado/.test(await err(()=>q(`select crm.excluir_artigo('${meu}')`,L))));
  t('atendente não exclui',/sem permissão/.test(await err(()=>q(`select crm.excluir_artigo('${pas}')`,B))));
  r=(await q(`select string_agg(acao,',' order by id) a, count(distinct user_id)::int u from crm.base_artigo_historico where artigo_id='${meu}'`,A)).rows[0];
  t('histórico: criado, alterado, excluído, com autor',r.a==='criado,alterado,excluido'&&r.u===1,JSON.stringify(r));
  t('histórico guarda as filas da versão',(await q(`select dados->'filas' f from crm.base_artigo_historico where artigo_id='${meu}' and acao='alterado'`,A)).rows[0].f.length===2);
  t('atendente não lê o histórico',(await q(`select count(*)::int n from crm.base_artigo_historico`,B)).rows[0].n===0);
}
