// Testes do Passo 1 do plano de robustez (crm_0009 a crm_0012): canais, fila de saída, webhook idempotente, alertas.
// Chamado por tests/sql/run.mjs, no mesmo banco (A = admin, B = atendente, C = sem acesso).
export default async function({db,q,qs,t,err,A,B}){
  const one=async(sql,fn=qs)=>(await fn(sql)).rows[0];
  console.log('\n— Passo 1: canais e estado');
  // horário comercial (padrão: seg–sex 8h–18h, America/Sao_Paulo)
  t('horario_comercial: terça 9h em SP é horário comercial',(await one(`select crm.em_horario_comercial('2026-11-10 12:00Z') v`)).v===true);
  t('horario_comercial: domingo não é',(await one(`select crm.em_horario_comercial('2026-11-08 12:00Z') v`)).v===false);
  t('horario_comercial: 19h não é',(await one(`select crm.em_horario_comercial('2026-11-10 22:00Z') v`)).v===false);

  await q(`insert into crm.canais(tipo,nome,numero,instancia,principal) values ('whatsapp','WhatsApp homologação','+55 16 90000-0001','homolog',true)`,A);
  await q(`insert into crm.canais(tipo,nome,numero,instancia,ativo,reserva) values ('whatsapp','Reserva','+55 16 90000-0002','reserva',false,true)`,A);
  const W=(await one(`select id from crm.canais where principal`)).id;
  let r=await one(`select count(*)::int n from crm.canal_eventos where canal_id='${W}'`);t('cadastro do canal gera o primeiro evento de estado',r.n===1);
  t('atendente enxerga os canais',(await q(`select count(*)::int n from crm.canais`,B)).rows[0].n===2);
  await q(`update crm.canais set estado='conectado' where id='${W}'`,B);
  t('atendente não muda estado do canal',(await one(`select estado from crm.canais where id='${W}'`)).estado==='desconectado');
  t('atendente não chama registrar_estado_canal',/permission denied/.test(await err(()=>q(`select crm.registrar_estado_canal('${W}','conectado')`,B))));
  t('registrar_estado_canal: mudança devolve true',(await one(`select crm.registrar_estado_canal('${W}','conectado','teste') m`)).m===true);
  t('registrar_estado_canal: mesmo estado devolve false',(await one(`select crm.registrar_estado_canal('${W}','conectado') m`)).m===false);
  r=await one(`select count(*)::int n, max(detalhe) d from crm.canal_eventos where canal_id='${W}'`);t('só mudanças viram evento, com detalhe',r.n===2&&r.d==='teste',JSON.stringify(r));
  t('estado inválido rejeitado',/check constraint/.test(await err(()=>qs(`select crm.registrar_estado_canal('${W}','ligado')`))));
  // silêncio suspeito: horário "sempre comercial" para o teste não depender do relógio
  await db.exec(`insert into crm.config(chave,valor) values ('horario_canais','{"dias":[1,2,3,4,5,6,7],"abre":"00:00","fecha":"23:59:59","fuso":"America/Sao_Paulo"}') on conflict (chave) do update set valor=excluded.valor;
    update crm.canais set ultima_mensagem_recebida_em=now()-interval '3 hours' where id='${W}'`);
  t('conectado sem receber há 3 h aparece como instável',(await one(`select estado_exibido e from crm.canais_status where id='${W}'`,s=>q(s,B))).e==='instavel');
  await db.exec(`update crm.canais set ultima_mensagem_recebida_em=now() where id='${W}'`);
  t('voltou a receber: conectado',(await one(`select estado_exibido e from crm.canais_status where id='${W}'`,s=>q(s,B))).e==='conectado');

  console.log('\n— Passo 1: fila de saída');
  const T=(await one(`select id from crm.atendimentos limit 1`)).id;
  const id1=(await q(`select crm.enfileirar_mensagem('Olá, tudo bem?','k1','${T}') id`,B)).rows[0].id;
  const id1b=(await q(`select crm.enfileirar_mensagem('Olá, tudo bem?','k1','${T}') id`,B)).rows[0].id;
  t('mesma chave de idempotência não duplica',id1===id1b&&(await one(`select count(*)::int n from crm.saida_mensagens`)).n===1);
  t('mesma mensagem para o mesmo atendimento em < 60 s é recusada',/mensagem_repetida/.test(await err(()=>q(`select crm.enfileirar_mensagem('Olá, tudo bem?','k1-outra','${T}')`,B))));
  t('atendente não altera a fila direto',/permission denied/.test(await err(()=>q(`update crm.saida_mensagens set estado='enviada'`,B))));
  t('atendente não insere mensagem já "enviada"',/row-level security/.test(await err(()=>q(`insert into crm.saida_mensagens(atendimento_id,canal_id,conteudo,estado,chave_idempotencia) values ('${T}','${W}','x','enviada','k-x')`,B))));
  t('envio manual exige conversa ou atendimento',/check constraint/.test(await err(()=>q(`select crm.enfileirar_mensagem('Oi','k-sem-atendimento')`,B))));
  t('atendente não pega lote (só o processo)',/permission denied/.test(await err(()=>q(`select * from crm.saida_pegar_lote()`,B))));
  await qs(`select crm.registrar_estado_canal('${W}','desconectado','queda simulada')`);
  t('canal desconectado: nada sai, mensagem continua pendente',(await qs(`select * from crm.saida_pegar_lote()`)).rows.length===0&&(await one(`select estado from crm.saida_mensagens where id='${id1}'`)).estado==='pendente');
  await qs(`select crm.registrar_estado_canal('${W}','conectado','reconectado')`);
  r=await qs(`select * from crm.saida_pegar_lote()`);t('reconectou: lote pega a pendente e marca "enviando"',r.rows.length===1&&r.rows[0].estado==='enviando'&&r.rows[0].tentativas===1);
  t('mensagem em envio não é pega de novo',(await qs(`select * from crm.saida_pegar_lote()`)).rows.length===0);
  t('falha 1: volta para pendente',(await one(`select crm.saida_concluir('${id1}',false,null,'timeout') e`)).e==='pendente');
  r=await one(`select extract(epoch from proxima_tentativa_em-now())::int s from crm.saida_mensagens where id='${id1}'`);t('falha 1: próxima tentativa em ~30 s',r.s>=25&&r.s<=31,r.s);
  r=await one(`select crm.saida_espera(1)::text a, crm.saida_espera(2)::text b, crm.saida_espera(3)::text c, crm.saida_espera(4)::text d, crm.saida_espera(9)::text e`);
  t('espera crescente: 30 s, 2 min, 10 min, 1 h, 1 h',r.a==='00:00:30'&&r.b==='00:02:00'&&r.c==='00:10:00'&&r.d==='01:00:00'&&r.e==='01:00:00',JSON.stringify(r));
  let ult='';for(let i=2;i<=5;i++){await db.exec(`update crm.saida_mensagens set proxima_tentativa_em=now() where id='${id1}'`);await qs(`select * from crm.saida_pegar_lote()`);ult=(await one(`select crm.saida_concluir('${id1}',false,null,'erro ${i}') e`)).e}
  t('5ª falha: vira "falhou"',ult==='falhou'&&(await one(`select tentativas n from crm.saida_mensagens where id='${id1}'`)).n===5);
  await q(`select crm.saida_reenviar('${id1}')`,B);
  r=await one(`select estado,tentativas from crm.saida_mensagens where id='${id1}'`);t('Reenviar: volta para pendente, tentativas zeradas',r.estado==='pendente'&&r.tentativas===0);
  await q(`select crm.saida_cancelar('${id1}')`,B);t('Cancelar: cancelada',(await one(`select estado from crm.saida_mensagens where id='${id1}'`)).estado==='cancelada');
  t('sem acesso não reenvia',/sem permissão/.test(await err(()=>q(`select crm.saida_reenviar('${id1}')`,'00000000-0000-0000-0000-000000000000'))));
  const id2=(await q(`select crm.enfileirar_mensagem('Recebemos seus documentos.','k2','${T}') id`,B)).rows[0].id;
  await qs(`select * from crm.saida_pegar_lote()`);
  t('sucesso: enviada, com id do provedor',(await one(`select crm.saida_concluir('${id2}',true,'EXT-1') e`)).e==='enviada'&&(await one(`select externo_id x from crm.saida_mensagens where id='${id2}'`)).x==='EXT-1');
  t('resultado repetido não muda nada (idempotente)',(await one(`select crm.saida_concluir('${id2}',false,null,'atrasado') e`)).e==='enviada');
  t('enviada não pode ser cancelada',/não pode ser cancelada/.test(await err(()=>q(`select crm.saida_cancelar('${id2}')`,B))));
  const id3=(await q(`select crm.enfileirar_mensagem('Mensagem presa','k3','${T}') id`,B)).rows[0].id;
  await qs(`select * from crm.saida_pegar_lote()`);await db.exec(`update crm.saida_mensagens set enviando_desde=now()-interval '10 minutes' where id='${id3}'`);
  t('processo caiu no meio: mensagem presa volta para a fila',(await one(`select crm.saida_recuperar_travadas(5) n`)).n===1&&(await one(`select estado from crm.saida_mensagens where id='${id3}'`)).estado==='pendente');
  await db.exec(`update crm.saida_mensagens set estado='cancelada' where id='${id3}'`);
  await q(`insert into crm.mensagens_agendadas(atendimento_id,texto,enviar_em,criada_por) values ('${T}','Bom dia! Conseguiu o extrato?',now()-interval '1 minute','${B}')`,B);
  const n1=(await one(`select crm.agendadas_para_fila() n`)).n,n2=(await one(`select crm.agendadas_para_fila() n`)).n;
  t('agendada vencida entra na fila uma vez só',n1===1&&n2===0&&(await one(`select count(*)::int n from crm.saida_mensagens where origem='agendada'`)).n===1);
  const ida=(await one(`select id from crm.saida_mensagens where origem='agendada'`)).id;await qs(`select * from crm.saida_pegar_lote()`);await qs(`select crm.saida_concluir('${ida}',true,'EXT-2')`);
  t('agendada enviada pela fila fica "enviada"',(await one(`select status from crm.mensagens_agendadas`)).status==='enviada');

  console.log('\n— Passo 1: webhook idempotente');
  const reg=async(idx,tipo,quando)=>(await one(`select * from crm.webhook_registrar('${W}','${idx}','${tipo}','{"texto":"oi"}','${quando}')`));
  r=await reg('MSG-1','mensagem','2026-11-10 13:00Z');t('evento novo é gravado',r.novo===true);
  const r2=await reg('MSG-1','mensagem','2026-11-10 13:00Z');t('evento repetido é ignorado (mesmo id)',r2.novo===false&&r2.evento_id===r.evento_id&&(await one(`select count(*)::int n from crm.webhook_eventos`)).n===1);
  t('mesmo id com outro tipo (status) é outro evento',(await reg('MSG-1','status','2026-11-10 13:00Z')).novo===true);
  await reg('MSG-3','mensagem','2026-11-10 13:05Z');await reg('MSG-2','mensagem','2026-11-10 13:02Z');
  r=(await qs(`select id_externo||':'||tipo k from crm.webhook_para_processar()`)).rows.map(x=>x.k).join(',');
  t('fora de ordem: processa pela data do provedor',r==='MSG-1:mensagem,MSG-1:status,MSG-2:mensagem,MSG-3:mensagem',r);
  t('mensagem recebida atualiza "última mensagem" do canal',(await one(`select ultima_mensagem_recebida_em>='2026-11-10 13:05Z' v from crm.canais where id='${W}'`)).v===true);
  const ev=r2.evento_id;await qs(`select crm.webhook_marcar(${ev},'falha ao gravar')`);
  r=await one(`select tentativas,erro from crm.webhook_eventos where id=${ev}`);t('erro de processamento fica registrado',r.tentativas===1&&r.erro==='falha ao gravar');
  await qs(`select crm.webhook_marcar(${ev})`);t('processado com sucesso sai da fila',(await one(`select processado_em is not null v from crm.webhook_eventos where id=${ev}`)).v===true);
  const ev3=(await one(`select id from crm.webhook_eventos where id_externo='MSG-3'`)).id;for(let i=0;i<5;i++)await qs(`select crm.webhook_marcar(${ev3},'erro')`);
  t('5 erros: sai do processamento automático',!(await qs(`select id from crm.webhook_para_processar()`)).rows.some(x=>x.id===ev3));
  t('atendente não reprocessa',/administrador/.test(await err(()=>q(`select crm.webhook_reprocessar(${ev3})`,B))));
  await q(`select crm.webhook_reprocessar(${ev3})`,A);t('admin reprocessa: volta para a fila',(await qs(`select id from crm.webhook_para_processar()`)).rows.some(x=>x.id===ev3));
  t('atendente não lê eventos brutos (dados pessoais)',(await q(`select count(*)::int n from crm.webhook_eventos`,B)).rows[0].n===0);
  t('admin lê eventos brutos',(await q(`select count(*)::int n from crm.webhook_eventos`,A)).rows[0].n===4);
  t('atendente não grava evento de webhook',/permission denied/.test(await err(()=>q(`select * from crm.webhook_registrar('${W}','X','mensagem','{}')`,B))));

  console.log('\n— Passo 1: alertas e saúde');
  const abertos=async tipo=>(await one(`select count(*)::int n from crm.alertas where tipo='${tipo}' and resolvido_em is null`)).n;
  await qs(`select crm.registrar_estado_canal('${W}','desconectado','queda')`);
  await qs(`select crm.verificar_alertas()`);t('canal caiu: alerta crítico aberto',await abertos('canal_caiu')===1);
  await qs(`select crm.verificar_alertas()`);t('rodar de novo não repete o alerta',(await one(`select count(*)::int n from crm.alertas where tipo='canal_caiu'`)).n===1);
  await qs(`select crm.registrar_estado_canal('${W}','conectado','volta')`);await qs(`select crm.verificar_alertas()`);
  t('canal voltou: alerta resolvido sozinho',await abertos('canal_caiu')===0);
  const id4=(await q(`select crm.enfileirar_mensagem('Pendente antiga','k4','${T}') id`,B)).rows[0].id;await db.exec(`update crm.saida_mensagens set created_at=now()-interval '10 minutes' where id='${id4}'`);
  await qs(`select crm.verificar_alertas()`);t('mensagem pendente há > 5 min: alerta',await abertos('fila_atrasada')===1);
  await db.exec(`update crm.saida_mensagens set estado='cancelada' where id='${id4}'`);await qs(`select crm.verificar_alertas()`);t('fila em dia: alerta resolvido',await abertos('fila_atrasada')===0);
  await db.exec(`insert into crm.atendimentos(conversa_ref,fila_ref,created_at) values ('c-sem-dono','passivos',now()-interval '1 hour')`);
  await qs(`select crm.verificar_alertas()`);t('atendimento sem responsável há > 30 min: alerta',await abertos('atendimento_sem_responsavel')===1);
  await db.exec(`update crm.atendimentos set responsavel_id='${B}' where conversa_ref='c-sem-dono'`);await qs(`select crm.verificar_alertas()`);t('atendimento assumido: alerta resolvido',await abertos('atendimento_sem_responsavel')===0);
  t('sem evento com erro: nenhum alerta de webhook',await abertos('webhook_erro')===0);
  await qs(`select crm.webhook_marcar(${ev3},'erro de teste')`);await qs(`select crm.verificar_alertas()`);
  t('evento de webhook com erro: alerta aberto',await abertos('webhook_erro')===1);
  r=(await qs(`select count(*)::int n from crm.alertas where notificado_em is null`)).rows[0].n;t('alertas novos ficam marcados para notificar',r>=1);
  r=(await q(`select crm.saude_resumo() s`,A)).rows[0].s;t('painel de saúde (admin) traz canais, fila, webhook e alertas',Array.isArray(r.canais)&&r.fila&&r.webhook&&Array.isArray(r.alertas_abertos),JSON.stringify(r).slice(0,200));
  t('painel de saúde bloqueado para atendente',/líderes/.test(await err(()=>q(`select crm.saude_resumo()`,B))));
  r=(await q(`select crm.relatorio_diario('2026-11-10') r`,A)).rows[0].r;t('relatório diário conta as mensagens recebidas no dia',r.recebidas===3,JSON.stringify(r));
}
