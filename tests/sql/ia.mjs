// Testes dos agentes de IA (crm_0014). A = admin, B = atendente, G = líder com acesso à gestão.
export default async function({db,q,qs,t,err,A,B}){
  console.log('\n— Agentes de IA (crm_0014)');
  const G=(await db.query(`insert into auth.users(email) values ('gestor-ia@x') returning id`)).rows[0].id;
  await db.exec(`insert into crm.acessos values ('${G}','gestao','lider'),('${G}','atendimento','lider') on conflict do nothing`);
  let r=await db.query(`select slug,ativo,modo from crm.agentes order by slug`);
  t('2 agentes semeados (Instagram e Google), desligados e em rascunho',r.rows.length===2&&r.rows.map(x=>x.slug).join()==='google,instagram'&&r.rows.every(x=>!x.ativo&&x.modo==='rascunho'),JSON.stringify(r.rows));
  r=await db.query(`select count(*)::int n from crm.regras_ia where agente_id is null and validada_em is null`);
  t('6 regras semeadas, aguardando o registro da validação',r.rows[0].n===6);
  const ag=async s=>(await db.query(`select id from crm.agentes where slug='${s}'`)).rows[0].id;
  const IG=await ag('instagram'),GO=await ag('google');

  // ligar
  t('atendente não liga agente',/só líder/.test(await err(()=>q(`select crm.agente_ativar('${IG}',true)`,B))));
  t('sem regra validada, agente não liga',/nenhuma regra validada/.test(await err(()=>q(`select crm.agente_ativar('${IG}',true)`,G))));
  await db.exec(`update crm.regras_ia set validada_por='${A}', validada_em=now() where agente_id is null and validada_em is null`);
  t('sem canal do Instagram, agente não liga',/nenhum canal instagram/.test(await err(()=>q(`select crm.agente_ativar('${IG}',true)`,G))));
  await q(`insert into crm.canais(tipo,nome,numero,provedor,instancia,principal,estado) values
    ('instagram','Instagram teste','@np.teste','meta','17840000000000001',true,'conectado'),
    ('google','Google teste','Perfil de teste','google','accounts/1/locations/2',true,'conectado')`,A);
  t('canal com provedor google aceito',(await db.query(`select count(*)::int n from crm.canais where provedor='google'`)).rows[0].n===1);
  await q(`select crm.agente_ativar('${IG}',true,'canal ligado na homologação')`,G);await q(`select crm.agente_ativar('${GO}',true)`,G);
  t('líder liga agente com regra validada e canal ativo',(await db.query(`select count(*)::int n from crm.agentes where ativo`)).rows[0].n===2);
  t('nenhum agente no WhatsApp (lá quem atende é a equipe)',(await db.query(`select count(*)::int n from crm.agentes where canal='whatsapp'`)).rows[0].n===0);
  r=(await db.query(`select campo,de,para,motivo,user_id from crm.agentes_historico where agente_id='${IG}'`)).rows;
  t('ligar fica no histórico, com autor e motivo',r.length===1&&r[0].para==='true'&&r[0].user_id===G&&r[0].motivo==='canal ligado na homologação',JSON.stringify(r));
  t('atendente não altera agente direto na tabela',/permission denied/.test(await err(()=>q(`update crm.agentes set ativo=false where id='${IG}'`,B))));
  t('nem o banco aceita mudar o modo fora da função',/só muda pela função/.test(await err(()=>db.query(`update crm.agentes set modo='automatico' where id='${IG}'`))));

  // modo
  t('líder não muda o modo',/só o administrador/.test(await err(()=>q(`select crm.agente_mudar_modo('${IG}','automatico','decisão por escrito da Dra.')`,G))));
  t('mudar modo exige motivo',/registre o motivo/.test(await err(()=>q(`select crm.agente_mudar_modo('${IG}','automatico','ok')`,A))));
  t('automático exige 30 dias de histórico',/30 dias/.test(await err(()=>q(`select crm.agente_mudar_modo('${IG}','automatico','decisão por escrito da Dra.')`,A))));

  // eventos → revisão
  const canal=async tp=>(await db.query(`select id from crm.canais where tipo='${tp}' and principal`)).rows[0].id;
  const CIG=await canal('instagram');
  const reg=async(id,tipo,payload)=>(await qs(`select * from crm.webhook_registrar('${CIG}','${id}','${tipo}',$$${JSON.stringify(payload)}$$::jsonb,now())`)).rows[0].evento_id;
  const e1=await reg('mid-1','mensagem',{sender:{id:'991'},message:{mid:'mid-1',text:'Oi, como funciona?'}});
  await reg('mid-2','mensagem_enviada',{message:{mid:'mid-2',is_echo:true}});
  let ev=(await qs(`select * from crm.ia_eventos_para_processar(10)`)).rows;
  t('só mensagens de canal com agente ligado entram na fila da IA',ev.length===1&&ev[0].evento_id==e1&&ev[0].agente_id===IG,JSON.stringify(ev));
  t('atendente não chama as funções da IA',/permission denied/.test(await err(()=>q(`select * from crm.ia_eventos_para_processar(10)`,B))));
  const reg2=args=>qs(`select crm.ia_registrar(${e1},'${IG}',${args}) id`).then(x=>x.rows[0].id);
  const R1=await reg2(`'pendente','instagram:991','Instagram …0991','dm:991','Oi, como funciona?','Olá! Sou o assistente virtual...','dúvida frequente'`);
  const R1b=await reg2(`'pendente','instagram:991','x','dm:991','x','outro texto',null`);
  t('um evento gera um rascunho só (repetir devolve o mesmo)',R1===R1b&&(await db.query(`select count(*)::int n from crm.revisoes_ia`)).rows[0].n===1);
  t('evento já tratado sai da fila da IA',(await qs(`select * from crm.ia_eventos_para_processar(10)`)).rows.length===0);
  t('rascunho não vira envio automático em modo rascunho',/só sai com aprovação humana/.test(await err(async()=>{const e=await reg('mid-3','mensagem',{});await qs(`select crm.ia_registrar(${e},'${IG}','aprovada','instagram:1','a','dm:1','x','resposta')`)})));
  t('atendente não muda o status direto na tabela',/permission denied/.test(await err(()=>q(`update crm.revisoes_ia set status='aprovada'`,B))));

  // aprovar = enviar
  const S1=(await q(`select crm.ia_aprovar('${R1}') s`,B)).rows[0].s;
  r=(await db.query(`select origem,estado,destino,criado_por,conteudo from crm.saida_mensagens where id='${S1}'`)).rows[0];
  t('aprovar coloca na fila de saída com a pessoa como autora',r&&r.origem==='ia'&&r.estado==='pendente'&&r.destino==='dm:991'&&r.criado_por===B,JSON.stringify(r));
  r=(await db.query(`select status,editada,revisada_por from crm.revisoes_ia where id='${R1}'`)).rows[0];
  t('revisão fica aprovada, sem edição, com quem aprovou',r.status==='aprovada'&&r.editada===false&&r.revisada_por===B);
  t('não dá para aprovar duas vezes',/já foi tratada/.test(await err(()=>q(`select crm.ia_aprovar('${R1}')`,B))));
  const e4=await reg('mid-4','mensagem',{});
  const R4=(await qs(`select crm.ia_registrar(${e4},'${IG}','pendente','instagram:992','@ana','dm:992','Vocês atendem em Franca?','Sim, atendemos.',null) id`)).rows[0].id;
  await q(`select crm.ia_aprovar('${R4}','Sim! Atendemos Franca e região, presencial ou online.')`,B);
  r=(await db.query(`select status,editada,texto_final from crm.revisoes_ia where id='${R4}'`)).rows[0];
  t('aprovar com correção vira "editada" e envia o texto corrigido',r.status==='editada'&&r.editada===true&&/Franca e região/.test(r.texto_final));
  r=(await db.query(`select pergunta,resposta from crm.ia_exemplos where revisao_id='${R4}'`)).rows[0];
  t('a correção vira exemplo aprovado do agente',r&&r.pergunta==='Vocês atendem em Franca?'&&/Franca e região/.test(r.resposta));

  // bloqueada, assumir, rejeitar
  const e5=await reg('mid-5','mensagem',{});
  const R5=(await qs(`select crm.ia_registrar(${e5},'${IG}','bloqueada','instagram:993','@x','dm:993','Quanto custa?','Custa R$ 2.000.','trava') id`)).rows[0].id;
  t('rascunho bloqueado: atendente não libera',/só o líder/.test(await err(()=>q(`select crm.ia_aprovar('${R5}')`,B))));
  await q(`select crm.ia_assumir('${R5}','vou responder pela conversa')`,G);
  t('assumir transfere e não envia nada',(await db.query(`select status from crm.revisoes_ia where id='${R5}'`)).rows[0].status==='transferida'&&(await db.query(`select count(*)::int n from crm.saida_mensagens where chave_idempotencia='ia:${R5}'`)).rows[0].n===0);
  const e6=await reg('mid-6','mensagem',{});
  const R6=(await qs(`select crm.ia_registrar(${e6},'${IG}','pendente','instagram:994','@y','dm:994','oi','oi',null) id`)).rows[0].id;
  t('descartar exige motivo',/diga por que/.test(await err(()=>q(`select crm.ia_rejeitar('${R6}','')`,B))));
  await q(`select crm.ia_rejeitar('${R6}','resposta genérica demais')`,B);
  t('descartar marca como rejeitada',(await db.query(`select status from crm.revisoes_ia where id='${R6}'`)).rows[0].status==='rejeitada');

  // recusa do contato
  t('sem registro, a IA pode processar o contato',(await qs(`select crm.ia_pode_processar('instagram:995') ok`)).rows[0].ok===true);
  await q(`insert into crm.consentimentos(contato_ref,finalidade,revogado_em,origem) values ('instagram:995','ia',now(),'respondeu NÃO')`,B);
  t('com recusa registrada, a IA não processa o contato',(await qs(`select crm.ia_pode_processar('instagram:995') ok`)).rows[0].ok===false);
  t('recusa não pode ser apagada pelo atendimento',/permission denied/.test(await err(()=>q(`delete from crm.consentimentos`,B))));

  // limite diário e indicadores
  await db.exec(`update crm.agentes set limite_diario=4 where id='${IG}'`);   // já há 4 revisões hoje (R1, R4, R5, R6)
  await reg('mid-7','mensagem',{});
  t('agente no limite diário não recebe mais eventos',(await qs(`select * from crm.ia_eventos_para_processar(10)`)).rows.length===0);
  await db.exec(`update crm.agentes set limite_diario=200 where id='${IG}'`);
  r=(await q(`select * from crm.ia_indicadores('${IG}')`,A)).rows[0];
  t('indicadores contam revisadas e as sem edição',r.revisadas===2&&r.sem_edicao===1&&Number(r.pct_sem_edicao)===50,JSON.stringify(r));
  t('atendente não vê indicadores da gestão',(await q(`select * from crm.ia_indicadores('${IG}')`,B)).rows[0].revisadas===0);
  // 30 dias de histórico, mas só 50% sem edição: continua recusado
  await db.exec(`update crm.revisoes_ia set created_at=now()-interval '31 days' where id='${R6}'`);
  t('automático exige 90% sem edição',/90 por cento/.test(await err(()=>q(`select crm.agente_mudar_modo('${IG}','automatico','decisão por escrito da Dra.')`,A))));
  await q(`select crm.agente_mudar_modo('${IG}','rascunho','confirmação do modo rascunho')`,A);
  t('voltar/confirmar rascunho é sempre permitido ao administrador',(await db.query(`select modo from crm.agentes where id='${IG}'`)).rows[0].modo==='rascunho');

  // resumos
  await db.exec(`insert into crm.resumos_semanais(cliente_ref,semana_inicio,resumo) values ('cli-1','2026-11-02','Pedidos: ...')`);
  const RS=(await db.query(`select id from crm.resumos_semanais`)).rows[0].id;
  t('atendente não edita resumo direto na tabela',/permission denied/.test(await err(()=>q(`update crm.resumos_semanais set status='publicado'`,B))));
  await q(`select crm.resumo_salvar('${RS}','Pedidos: extrato. Pendências: nenhuma.',true)`,B);
  r=(await db.query(`select status,resumo,publicado_em from crm.resumos_semanais where id='${RS}'`)).rows[0];
  t('resumo editado e publicado pela função',r.status==='publicado'&&/extrato/.test(r.resumo)&&!!r.publicado_em);
  t('resumo publicado não muda mais',/já publicado/.test(await err(()=>q(`select crm.resumo_salvar('${RS}','x',false)`,B))));

  // pedido de humano (crm_0020): a IA para para o contato e delega a um atendente do Comercial (menção)
  console.log('\n— IA: pedido de atendimento humano (crm_0020)');
  await db.exec(`insert into crm.perfis(user_id,nome,email) values ('${A}','Admin','admin@x'),('${G}','Gestor IA','gestor-ia@x') on conflict do nothing`);
  const C1=(await db.query(`insert into auth.users(email) values ('com1-ia@x') returning id`)).rows[0].id,C2=(await db.query(`insert into auth.users(email) values ('com2-ia@x') returning id`)).rows[0].id;
  await db.exec(`insert into crm.acessos values ('${C1}','atendimento','atendente'),('${C2}','atendimento','atendente') on conflict do nothing;
    insert into crm.perfis(user_id,nome,email) values ('${C1}','Com Um','com1-ia@x'),('${C2}','Com Dois','com2-ia@x') on conflict do nothing;
    insert into crm.filas_config(fila_ref,nome) values ('comercial','Comercial') on conflict do nothing;
    update crm.filas_config set rodizio_ativo=true, rodizio_proximo=0 where fila_ref='comercial';
    delete from crm.fila_membros where fila_ref='comercial';
    insert into crm.fila_membros values ('comercial','${C1}',0),('comercial','${C2}',1);`);
  const deleg=async c=>(await db.query(`select delegado_id d from crm.revisoes_ia where contato='${c}' and status='transferida' order by created_at desc limit 1`)).rows[0].d;
  const e8=await reg('mid-8','mensagem',{}),e9=await reg('mid-9','mensagem',{});
  const R8=(await qs(`select crm.ia_registrar(${e8},'${IG}','pendente','instagram:996','@lia','dm:996','Como funciona?','Olá! ...',null) id`)).rows[0].id;
  await qs(`select crm.ia_registrar(${e9},'${IG}','transferida','instagram:996','@lia','dm:996','Quero falar com uma pessoa','','O cliente pediu para falar com uma pessoa.')`);
  t('IA pausada para o contato',(await qs(`select crm.ia_pode_processar('instagram:996') ok`)).rows[0].ok===false);
  t('rascunho pendente do mesmo contato não pode mais ser aprovado',(await db.query(`select status from crm.revisoes_ia where id='${R8}'`)).rows[0].status==='transferida');
  t('atendimento delegado ao primeiro do rodízio do Comercial',(await deleg('instagram:996'))===C1);
  r=await q(`select texto from crm.avisos where revisao_id is not null`,C1);
  t('menção para o atendente do Comercial',r.rows.length===1&&/@lia pediu para falar com uma pessoa no Instagram: “Quero falar com uma pessoa”.*O atendimento é seu/.test(r.rows[0].texto),JSON.stringify(r.rows));
  t('líderes e administradores não recebem essa menção',(await q(`select count(*)::int n from crm.avisos where revisao_id is not null`,A)).rows[0].n===0);
  const e10=await reg('mid-10','mensagem',{});
  await qs(`select crm.ia_registrar(${e10},'${IG}','transferida','instagram:997','@rui','dm:997','Quanto custa?','','Pedido de valores.')`);
  t('o próximo pedido vai para o próximo do rodízio',(await deleg('instagram:997'))===C2);
  await db.exec(`update crm.perfis set ativo=false where user_id='${C1}'`);
  const e12=await reg('mid-12','mensagem',{});
  await qs(`select crm.ia_registrar(${e12},'${IG}','transferida','instagram:995','@ze','dm:995','Tem alguém aí?','','O cliente pediu para falar com uma pessoa.')`);
  t('quem está inativo é pulado',(await deleg('instagram:995'))===C2);
  await db.exec(`delete from crm.fila_membros where fila_ref='comercial'`);
  const e13=await reg('mid-13','mensagem',{});
  await qs(`select crm.ia_registrar(${e13},'${IG}','transferida','instagram:994','@ana','dm:994','Quero falar com alguém','','O cliente pediu para falar com uma pessoa.')`);
  r=await db.query(`select count(distinct user_id)::int n, bool_and(texto like '%escolha quem atende%') e from crm.avisos where texto like '%@ana%'`);
  t('sem ninguém no Comercial, a menção vai para líderes e administradores',r.rows[0].n===2&&r.rows[0].e===true&&(await deleg('instagram:994'))===null,JSON.stringify(r.rows[0]));
  const e11=await reg('mid-11','mensagem',{});
  const R11=(await qs(`select crm.ia_registrar(${e11},'${IG}','pendente','instagram:998','@bia','dm:998','oi','oi',null) id`)).rows[0].id;
  const antes=(await db.query(`select count(*)::int n from crm.avisos`)).rows[0].n;
  await q(`select crm.ia_assumir('${R11}')`,G);
  t('pessoa assumiu: IA pausada, fica com ela, sem menção',(await qs(`select crm.ia_pode_processar('instagram:998') ok`)).rows[0].ok===false&&(await db.query(`select count(*)::int n from crm.avisos`)).rows[0].n===antes&&(await deleg('instagram:998'))===G);
  t('ninguém chama a escolha do atendente direto',/permission denied/.test(await err(()=>q(`select crm.ia_escolher_atendente()`,G))));
  await q(`select crm.ia_despausar('instagram:996')`,B);
  t('equipe devolve o contato para a IA',(await qs(`select crm.ia_pode_processar('instagram:996') ok`)).rows[0].ok===true);
  t('atendente não mexe na pausa direto na tabela',/permission denied/.test(await err(()=>q(`delete from crm.ia_pausas`,B))));
}
