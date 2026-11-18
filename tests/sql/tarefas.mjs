// Tarefas sobre o contato (crm_0017). A = admin, B = atendente fora do comercial, C = sem acesso, K = da fila Comercial.
export default async function({db,q,t,err,A,B,C}){
  console.log('\n— Tarefas (crm_0017)');
  const K=(await db.query(`insert into auth.users(email) values ('comercial-tk@x') returning id`)).rows[0].id;
  await db.exec(`insert into crm.acessos values ('${K}','atendimento','atendente'),('${K}','comercial','atendente');
    insert into crm.perfis(user_id,nome,email) values ('${K}','Comercial Tarefas','comercial-tk@x');
    insert into crm.filas_config(fila_ref,nome) values ('comercial','Comercial') on conflict do nothing;
    insert into crm.fila_membros(fila_ref,user_id) values ('comercial','${K}') on conflict do nothing;
    insert into crm.perfis(user_id,nome,email) values ('${A}','Admin','admin@x'),('${B}','Atend','atend@x') on conflict do nothing`);
  const criar=(uid,resp,tit="'Ligar para o cliente'")=>q(`select crm.tarefa_criar(${tit},'2026-11-20 10:00-03',${resp?`'${resp}'`:'null'},'Detalhe','c1','Marcos Tavares','+55 16 98800-0101') id`,uid);

  const T1=(await criar(B,K)).rows[0].id;
  t('atendente cria tarefa para alguém do comercial',!!T1);
  t('atendente fora do comercial não recebe tarefa',/administrador ou para quem está na fila Comercial/.test(await err(()=>criar(B,null))));
  t('sem acesso ao CRM não cria tarefa',/sem acesso para criar/.test(await err(()=>criar(C,K))));
  t('tarefa sem texto é recusada',/escreva o que precisa/.test(await err(()=>criar(B,K,"'  '"))));
  let r=await db.query(`select criado_por=('${B}')::uuid c, contato_nome n, conversa_ref cv from crm.tarefas where id='${T1}'`);
  t('tarefa guarda quem criou, o contato e a conversa',r.rows[0].c&&r.rows[0].n==='Marcos Tavares'&&r.rows[0].cv==='c1');

  // individual: só o responsável vê
  r=await q(`select count(*)::int n from crm.tarefas`,K);t('responsável vê a tarefa',r.rows[0].n===1);
  r=await q(`select count(*)::int n from crm.tarefas`,B);t('quem criou (fora do comercial) não vê',r.rows[0].n===0);
  r=await q(`select count(*)::int n from crm.tarefas`,A);t('administrador não vê a tarefa dos outros',r.rows[0].n===0);
  await criar(A,null,"'Revisar contrato'");
  r=await q(`select titulo from crm.tarefas`,A);t('administrador vê só a própria',r.rows.length===1&&r.rows[0].titulo==='Revisar contrato');
  t('ninguém grava direto na tabela',/permission denied/.test(await err(()=>q(`update crm.tarefas set titulo='x'`,K))));

  // concluir, adiar, excluir: só o responsável
  t('admin não conclui a tarefa de outra pessoa',/não encontrada/.test(await err(()=>q(`select crm.tarefa_concluir('${T1}',true)`,A))));
  t('fora do comercial não mexe em tarefas',/sem acesso às tarefas/.test(await err(()=>q(`select crm.tarefa_concluir('${T1}',true)`,B))));
  await q(`select crm.tarefa_concluir('${T1}',true)`,K);
  r=await db.query(`select concluida c, concluida_em is not null d from crm.tarefas where id='${T1}'`);t('responsável conclui (com data)',r.rows[0].c&&r.rows[0].d);
  await q(`select crm.tarefa_concluir('${T1}',false)`,K);
  r=await db.query(`select concluida c, concluida_em is null d from crm.tarefas where id='${T1}'`);t('reabrir limpa a data',!r.rows[0].c&&r.rows[0].d);
  await q(`select crm.tarefa_adiar('${T1}','2026-11-25 14:00-03')`,K);
  r=await db.query(`select to_char(quando at time zone 'America/Sao_Paulo','DD/MM HH24:MI') q from crm.tarefas where id='${T1}'`);t('responsável muda o prazo',r.rows[0].q==='25/11 14:00',r.rows[0].q);

  // saiu da fila Comercial: deixa de ver
  await db.exec(`delete from crm.fila_membros where user_id='${K}' and fila_ref='comercial'`);
  r=await q(`select count(*)::int n from crm.tarefas`,K);t('quem sai da fila Comercial deixa de ver as tarefas',r.rows[0].n===0);
  await db.exec(`insert into crm.fila_membros(fila_ref,user_id) values ('comercial','${K}')`);
  await q(`select crm.tarefa_excluir('${T1}')`,K);
  r=await db.query(`select count(*)::int n from crm.tarefas where id='${T1}'`);t('responsável exclui a tarefa',r.rows[0].n===0);
}
