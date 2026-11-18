// Motor dos fluxos de trabalho (crm_0019). A = admin, B = atendente, L = líder (publica). O motor roda como service_role.
export default async function({db,q,qs,t,err,A,B}){
  console.log('\n— Motor dos fluxos (crm_0019)');
  const L=(await db.query(`insert into auth.users(email) values ('lider-motor@x') returning id`)).rows[0].id;
  await db.exec(`insert into crm.acessos values ('${L}','gestao','lider'),('${L}','atendimento','lider'),('${L}','comercial','lider');
    insert into crm.perfis(user_id,nome,email) values ('${A}','Admin','admin@x') on conflict do nothing`);
  let canal=(await db.query(`select id from crm.canais where tipo='whatsapp' and principal and ativo limit 1`)).rows[0]?.id;
  if(!canal)canal=(await db.query(`insert into crm.canais(tipo,nome,numero,provedor,instancia,principal,estado,ativo) values ('whatsapp','WA motor','+55 16 90000-9999','simulado','motor-wa',true,'conectado',true) returning id`)).rows[0].id;
  const ciclo=async()=>(await qs(`select crm.fluxo_ciclo() r`)).rows[0].r;
  // nos testes: envio automático liberado a qualquer hora e sem limite (as regras são testadas no fim)
  const regras=async o=>db.exec(`update crm.config set valor='${JSON.stringify(o)}' where chave='whatsapp_automacao'`);
  await regras({por_minuto:1000,por_hora:10000,por_dia:100000,dias:'Todos os dias',inicio:'00:00',fim:'00:00'});
  const J=o=>JSON.stringify(o).replace(/'/g,"''");
  let seq=0;const pid=()=>'p'+(++seq),rid=()=>'r'+(++seq);
  const P=(tipo,cfg,ramos)=>({id:pid(),tipo,cfg,...(ramos?{ramos:ramos.map(([nome,passos])=>({id:rid(),nome,passos}))}:{})});
  const publicar=async(nome,gatilhos,passos,cfg={})=>{const id=(await q(`select crm.fluxo_salvar(null,'${nome}','${J({gatilhos:gatilhos.map((g,i)=>({id:'g'+i,...g})),passos})}'::jsonb,'${J(cfg)}'::jsonb) id`,L)).rows[0].id;
    await q(`select crm.fluxo_publicar('${id}',true)`,L);return id};
  let evn=0;const msg=async(numero,nome,texto,minAtras=0)=>{const e=(await db.query(`insert into crm.webhook_eventos(canal_id,id_externo,tipo,payload) values ('${canal}','m${++evn}-${Date.now()}','mensagem','{}') returning id`)).rows[0].id;
    return (await qs(`select crm.fluxo_registrar_mensagem(${e},'${canal}','whatsapp:${numero}','${nome}','${texto.replace(/'/g,"''")}','${numero}',now()-interval '${minAtras} minutes',false) r`)).rows[0].r};
  const etapa=async(slug,nome)=>(await db.query(`select e.id from crm.funil_etapas e join crm.funis f on f.id=e.funil_id where f.slug='${slug}' and e.nome='${nome}'`)).rows[0].id;
  const insc=async f=>(await db.query(`select * from crm.fluxo_inscricoes where fluxo_id='${f}' order by criado_em`)).rows;
  const saida=async d=>(await db.query(`select conteudo,origem,destino from crm.saida_mensagens where destino like '%${d}' order by created_at`)).rows;

  // 1) CRM: mudou de etapa → atividade → aguardar 1 dia → mensagem
  const F1=await publicar('Reunião agendada',[{tipo:'etapa_mudou',cfg:{funil:'pj',etapa:'Reunião agendada'}}],
    [P('criar_atividade',{tipo_atividade:'reuniao',titulo:'Preparar reunião com {nome}',em_dias:1}),P('aguardar',{quantidade:1,unidade:'dias'}),P('mensagem',{texto:'Olá, {nome}! Confirmamos nossa reunião.'})]);
  const pj=(await db.query(`select id from crm.funis where slug='pj'`)).rows[0].id;
  const N=(await db.query(`insert into crm.negocios(funil_id,etapa_id,nome,telefone) values ('${pj}','${await etapa('pj','Novo lead')}','Carla Mendes','+55 (16) 98888-0001') returning id`)).rows[0].id;
  await db.exec(`update crm.negocios set etapa_id='${await etapa('pj','Reunião agendada')}' where id='${N}'`);
  let r=await ciclo();t('ciclo inscreve o negócio que entrou na etapa',r.inscricoes>=1,JSON.stringify(r));
  let I=await insc(F1);t('uma inscrição, aguardando 1 dia',I.length===1&&I[0].estado==='aguardando'&&new Date(I[0].proximo_em)>new Date(Date.now()+23*3600e3),JSON.stringify(I[0]&&{e:I[0].estado,p:I[0].proximo_em}));
  r=await db.query(`select titulo,tipo,origem from crm.atividades where negocio_id='${N}'`);t('atividade criada com {nome} preenchido',r.rows[0]&&r.rows[0].titulo==='Preparar reunião com Carla'&&r.rows[0].origem==='automacao',JSON.stringify(r.rows));
  await db.exec(`update crm.fluxo_inscricoes set proximo_em=now()-interval '1 second' where fluxo_id='${F1}'`);await ciclo();
  r=await saida('988880001');t('depois da espera, mensagem na fila de saída para o telefone do negócio',r.length===1&&r[0].conteudo==='Olá, Carla! Confirmamos nossa reunião.'&&r[0].origem==='automacao',JSON.stringify(r));
  I=await insc(F1);t('inscrição concluída',I[0].estado==='concluida');
  r=await db.query(`select string_agg(resultado,',' order by id) s from crm.fluxo_registros where fluxo_id='${F1}'`);t('registros de cada passo',r.rows[0].s==='executado,aguardando,executado',r.rows[0].s);
  await db.exec(`update crm.negocios set etapa_id='${await etapa('pj','Qualificado')}' where id='${N}'; update crm.negocios set etapa_id='${await etapa('pj','Reunião agendada')}' where id='${N}'`);await ciclo();
  t('sem reinscrição, o mesmo negócio não entra de novo',(await insc(F1)).length===1);

  // 2) conversa: nova conversa → mensagem → aguardar resposta (respondeu / não respondeu)
  const F2=await publicar('Boas-vindas',[{tipo:'nova_conversa',cfg:{canal:'whatsapp'}}],
    [P('mensagem',{texto:'Olá, {nome}! Recebemos sua mensagem.'}),
     P('aguardar_resposta',{horas:2},[['Respondeu',[P('criar_tarefa',{titulo:'Retornar {nome}',responsavel:A,em_horas:2})]],['Não respondeu',[P('mensagem',{texto:'Seguimos à disposição, {nome}.'})]]])]);
  t('mensagem nova registrada',await msg('5516977770001','Joana Lima','Oi, preciso de ajuda')===true);
  t('a mesma mensagem não é registrada duas vezes',(await qs(`select crm.fluxo_registrar_mensagem((select max(id) from crm.webhook_eventos),'${canal}','x','x','x','5516977770001') r`)).rows[0].r===false);
  await ciclo();
  r=await saida('977770001');t('boas-vindas enviadas com {nome}',r.length===1&&r[0].conteudo==='Olá, Joana! Recebemos sua mensagem.',JSON.stringify(r));
  I=await insc(F2);t('esperando a resposta do cliente',I[0].estado==='esperando_resposta'&&I[0].contato==='whatsapp:16977770001');
  await msg('5516977770001','Joana Lima','pode ser amanhã?');
  r=await db.query(`select count(*)::int n from crm.fluxo_eventos where contato='whatsapp:16977770001' and tipo='nova_conversa'`);t('segunda mensagem não é "nova conversa"',r.rows[0].n===1);
  await ciclo();
  r=await db.query(`select titulo,responsavel_id=('${A}')::uuid a from crm.tarefas where titulo='Retornar Joana'`);t('respondeu → caminho "Respondeu": tarefa para o admin',r.rows.length===1&&r.rows[0].a,JSON.stringify(r.rows));
  t('inscrição concluída depois do caminho',(await insc(F2))[0].estado==='concluida');
  await msg('5516955550001','Rui','bom dia');await ciclo();
  await db.exec(`update crm.fluxo_inscricoes set proximo_em=now()-interval '1 second' where contato='whatsapp:16955550001'`);await ciclo();
  r=await saida('955550001');t('sem resposta no prazo → caminho "Não respondeu"',r.length===2&&r[1].conteudo==='Seguimos à disposição, Rui.',JSON.stringify(r));

  // 3) o exemplo pedido: cliente sem responder 60 min + Se (várias condições)
  const F3=await publicar('Sem resposta + tag',[{tipo:'cliente_sem_responder',cfg:{minutos:60}}],
    [P('se',{modo:'todas',condicoes:[{sujeito:'canal',operador:'e',valor:'whatsapp'},{sujeito:'tag',operador:'e',valor:'Aguardando documentos'}]},[['Sim',[P('mensagem',{texto:'Lembrete A'})]],['Não',[]]])]);
  const F3b=await publicar('Sem resposta (qualquer)',[{tipo:'cliente_sem_responder',cfg:{minutos:60}}],
    [P('se',{modo:'qualquer',condicoes:[{sujeito:'tag',operador:'e',valor:'X'},{sujeito:'canal',operador:'e',valor:'whatsapp'}]},[['Sim',[P('mensagem',{texto:'Lembrete B, {nome}'})]],['Não',[]]])]);
  const F3c=await publicar('Se no formato antigo',[{tipo:'cliente_sem_responder',cfg:{minutos:60}}],[P('se',{sujeito:'canal',operador:'e',valor:'whatsapp'},[['Sim',[P('mensagem',{texto:'Lembrete C'})]],['Não',[]]])]);
  await msg('5516966660001','Paula Reis','Pode me mandar a proposta?',120);
  await db.exec(`insert into crm.saida_mensagens(canal_id,destino,conteudo,origem,chave_idempotencia) values ('${canal}','5516966660001','Segue a proposta','automacao','teste-semcli');
    update crm.saida_mensagens set estado='enviada', enviada_em=now()-interval '61 minutes' where chave_idempotencia='teste-semcli'`);
  r=await db.query(`select ultima_saida_em is not null s from crm.contato_atividade where contato='whatsapp:16966660001'`);t('mensagem enviada marca a última saída do contato',r.rows[0].s===true);
  await ciclo();await ciclo();
  r=await saida('966660001');const tx=r.map(x=>x.conteudo);
  t('"todas": tag (passo 2) conta como não → nada enviado',!tx.includes('Lembrete A'));
  t('"qualquer": basta o canal → lembrete enviado com {nome}',tx.includes('Lembrete B, Paula'),JSON.stringify(tx));
  t('"Se" no formato antigo continua funcionando',tx.includes('Lembrete C'));
  r=await db.query(`select detalhe from crm.fluxo_registros where fluxo_id='${F3}' and resultado='caminho'`);t('registro explica a tag do passo 2',/passo 2/.test(r.rows[0]?.detalhe||''),r.rows[0]?.detalhe);
  r=await db.query(`select count(*)::int n from crm.fluxo_eventos where tipo='cliente_sem_responder' and contato='whatsapp:16966660001'`);t('evento de tempo não se repete entre ciclos',r.rows[0].n===1);
  await msg('5516966660001','Paula Reis','obrigada');await db.exec(`update crm.saida_mensagens set estado='enviada', enviada_em=now()-interval '30 minutes' where chave_idempotencia like 'fluxo:%' and destino='5516966660001'`);
  await ciclo();t('cliente respondeu e o escritório falou há 30 min: ainda não dispara de novo',(await insc(F3b)).length===1);

  // 4) palavras-chave e "tirar do fluxo quando o cliente responder"
  const F4=await publicar('Boleto',[{tipo:'cliente_respondeu',cfg:{palavras:'boleto, segunda via'}}],[P('aguardar',{quantidade:1,unidade:'dias'}),P('mensagem',{texto:'Conseguiu pagar?'})],{parar_resposta:true});
  await msg('5516944440001','Lia','preciso da segunda via do boleto');await msg('5516933330001','Téo','bom dia');await ciclo();
  I=await insc(F4);t('só entra quem escreveu a palavra-chave',I.length===1&&I[0].contato==='whatsapp:16944440001');
  await msg('5516944440001','Lia','já paguei');await ciclo();
  I=await insc(F4);t('cliente respondeu → sai do fluxo (configuração)',I.length===1&&I[0].estado==='saiu'&&I[0].erro==='o cliente respondeu',JSON.stringify(I.map(x=>x.estado)));

  // 5) aguardar resposta: sem resposta no prazo → caminho "Não respondeu"
  const F5=await publicar('Acordo sem resposta',[{tipo:'negocio_criado',cfg:{funil:'pj'}}],
    [P('aguardar_resposta',{horas:24},[['Respondeu',[P('fim',{})]],['Não respondeu',[P('criar_atividade',{tipo_atividade:'ligacao',titulo:'Ligar: sem resposta',em_dias:0})]]])]);
  const ac=(await db.query(`select id from crm.funis where slug='pj'`)).rows[0].id;   // um funil só (crm_0024)
  const N5=(await db.query(`insert into crm.negocios(funil_id,etapa_id,nome,telefone) values ('${ac}','${await etapa('pj','Novo lead')}','Bar Teste','16922220001') returning id`)).rows[0].id;
  await ciclo();t('esperando resposta por 24 h',(await insc(F5))[0].estado==='esperando_resposta');
  await db.exec(`update crm.fluxo_inscricoes set proximo_em=now()-interval '1 second' where fluxo_id='${F5}'`);await ciclo();
  r=await db.query(`select count(*)::int n from crm.atividades where negocio_id='${N5}' and titulo='Ligar: sem resposta'`);t('prazo vencido → caminho "Não respondeu"',r.rows[0].n===1);

  // 6) avisar, webhook, fora do horário
  await db.exec(`insert into crm.filas_config(fila_ref,nome,dias,abre,fecha) values ('fechada','Sempre fechada','Seg–Sex','00:00','00:01') on conflict do nothing`);
  const F6=await publicar('Aviso e webhook',[{tipo:'negocio_ganho',cfg:{funil:'pj'}}],[P('avisar_equipe',{pessoa:A,texto:'Negócio ganho!'}),P('webhook',{url:'https://exemplo.com/gancho'}),P('mensagem',{texto:'Bem-vindo!'})],{so_horario:true,fila_horario:'fechada'});
  await db.exec(`update crm.negocios set etapa_id='${await etapa('pj','Ganho')}' where id='${N}'`);await ciclo();
  r=await q(`select texto from crm.avisos where fluxo_id is not null`,A);t('aviso para a pessoa escolhida (só ela vê)',r.rows.length===1&&/Negócio ganho! · Carla Mendes/.test(r.rows[0].texto),JSON.stringify(r.rows));
  r=await q(`select count(*)::int n from crm.avisos`,B);t('outra pessoa não vê o aviso',r.rows[0].n===0);
  await q(`select crm.aviso_lido(null)`,A);r=await db.query(`select bool_and(lido_em is not null) l from crm.avisos where user_id='${A}'`);t('marcar avisos como lidos',r.rows[0].l===true);
  r=await qs(`select url,corpo->'negocio'->>'nome' n from crm.fluxo_webhooks_pendentes(10)`);t('webhook na fila com os dados do negócio',r.rows.length===1&&r.rows[0].n==='Carla Mendes');
  I=await insc(F6);t('fora do horário do setor: a mensagem espera a abertura',I[0].estado==='aguardando'&&new Date(I[0].proximo_em)>new Date(),JSON.stringify(I[0]&&I[0].estado));

  // 7) regras do WhatsApp para mensagens automáticas
  const F7=await publicar('Teste de regras',[{tipo:'cliente_respondeu',cfg:{palavras:'regra'}}],[P('mensagem',{texto:'Resposta automática'})],{reinscricao:true});
  await regras({por_minuto:0,por_hora:10000,por_dia:100000,dias:'Todos os dias',inicio:'00:00',fim:'00:00'});
  await msg('5516911110001','Caio','teste de regra');await ciclo();
  r=await db.query(`select estado from crm.fluxo_inscricoes where fluxo_id='${F7}' and contato='whatsapp:16911110001'`);
  let rg=await db.query(`select detalhe from crm.fluxo_registros where fluxo_id='${F7}' order by id desc limit 1`);
  t('limite por minuto: a mensagem espera em vez de sair',r.rows[0].estado==='aguardando'&&/limite por minuto/.test(rg.rows[0].detalhe),rg.rows[0]?.detalhe);
  t('nada foi para a fila de envio',(await saida('911110001')).length===0);
  await regras({por_minuto:1000,por_hora:10000,por_dia:100000,dias:'Todos os dias',inicio:'00:00',fim:'00:01'});
  await msg('5516911110002','Davi','outra regra');await ciclo();
  rg=await db.query(`select detalhe from crm.fluxo_registros where fluxo_id='${F7}' and contato_nome='Davi' order by id desc limit 1`);
  t('fora do horário de envio automático: espera a abertura',/fora do horário de envio automático: envia em/.test(rg.rows[0]?.detalhe||''),rg.rows[0]?.detalhe);
  r=await db.query(`select crm.janela_aberta('Seg–Sex','08:00','20:00','2026-11-14 12:00-03') sab, crm.janela_aberta('Seg–Sex','08:00','20:00','2026-11-13 12:00-03') sex,
    to_char(crm.janela_proxima('Seg–Sex','08:00','20:00','2026-11-13 21:00-03') at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') prox`);
  t('janela de envio: dia útil, fim de semana e próxima abertura',r.rows[0].sab===false&&r.rows[0].sex===true&&String(r.rows[0].prox).startsWith('2026-11-16 08:00'),JSON.stringify(r.rows[0]));
  await regras({por_minuto:1000,por_hora:10000,por_dia:100000,dias:'Todos os dias',inicio:'00:00',fim:'00:00'});
  await msg('5516911110003','Bia','sobre a regra do boleto');await ciclo();
  await msg('5516911110003','Bia','PARAR');
  r=await db.query(`select finalidade,revogado_em is not null r from crm.consentimentos where contato_ref='whatsapp:16911110003'`);t('"PARAR" registra a recusa de mensagens automáticas',r.rows.length===1&&r.rows[0].finalidade==='automacao'&&r.rows[0].r);
  r=await db.query(`select count(*)::int n from crm.fluxo_inscricoes where contato='whatsapp:16911110003' and estado in ('ativa','aguardando','esperando_resposta')`);t('quem pediu para parar sai de todos os fluxos',r.rows[0].n===0);
  const antes=(await saida('911110003')).length;
  await msg('5516911110003','Bia','mais uma regra');await ciclo();
  rg=await db.query(`select detalhe from crm.fluxo_registros where contato_nome='Bia' order by id desc limit 1`);
  t('depois do "PARAR", nenhuma mensagem automática sai',(await saida('911110003')).length===antes&&/pediu para não receber/.test(rg.rows[0]?.detalhe||''),rg.rows[0]?.detalhe);
  r=await db.query(`select crm.pediu_para_parar('Sair.') a, crm.pediu_para_parar('não quero mais receber!') b, crm.pediu_para_parar('quero parar de pagar juros') c`);
  t('reconhece "Sair." e "não quero mais receber", mas não frases comuns',r.rows[0].a&&r.rows[0].b&&!r.rows[0].c);
  const ig=(await db.query(`insert into crm.canais(tipo,nome,provedor,instancia,principal,estado,ativo) values ('instagram','IG motor','simulado','ig-motor',false,'conectado',true) returning id`)).rows[0].id;
  const F8=await publicar('Instagram',[{tipo:'cliente_respondeu',cfg:{canal:'instagram'}}],[P('mensagem',{texto:'Oi pelo Instagram'})]);
  const evIg=(await db.query(`insert into crm.webhook_eventos(canal_id,id_externo,tipo,payload) values ('${ig}','ig-1','mensagem','{}') returning id`)).rows[0].id;
  await qs(`select crm.fluxo_registrar_mensagem(${evIg},'${ig}','instagram:777','Insta','olá','dm:777',now()-interval '30 hours')`);await ciclo();
  rg=await db.query(`select resultado,detalhe from crm.fluxo_registros where fluxo_id='${F8}'`);
  t('Instagram: mais de 24 h depois da mensagem do cliente, não envia',rg.rows[0]?.resultado==='pulado'&&/24 h/.test(rg.rows[0].detalhe),JSON.stringify(rg.rows));

  // 8) permissões, tela e lixeira
  t('a equipe não roda o motor',/permission denied/.test(await err(()=>q(`select crm.fluxo_ciclo()`,L))));
  r=await q(`select passo_tipo,estado from crm.fluxo_inscricoes_de('${F2}')`,L);t('líder vê as inscrições do fluxo (toda nova conversa entra nas boas-vindas)',r.rows.length>=5&&r.rows.some(x=>x.estado==='concluida')&&r.rows.every(x=>x.estado!=='esperando_resposta'||x.passo_tipo==='aguardar_resposta'),JSON.stringify(r.rows));
  r=await q(`select passo_tipo from crm.fluxo_inscricoes_de('${F6}')`,L);t('passo atual de quem está no fluxo',r.rows[0].passo_tipo==='mensagem',JSON.stringify(r.rows));
  r=await q(`select count(*)::int n from crm.fluxo_inscricoes`,B);t('atendente não vê inscrições',r.rows[0].n===0);
  r=await q(`select inscritos,ativos from crm.fluxo_contagens() where fluxo_id='${F6}'`,L);t('contagem de inscritos e ativos',r.rows[0].inscritos===1&&r.rows[0].ativos===1);
  await q(`select crm.fluxo_excluir('${F6}',true)`,L);
  t('apagar o fluxo tira quem estava nele',(await insc(F6))[0].estado==='saiu');
}
