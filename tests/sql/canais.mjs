// Canais na tela (crm_0022): cadastro pelo administrador, ligar/desligar, plano B (trocar o principal) e alerta visto.
// A = admin, B = atendente. Usa os canais que o passo 1 já cadastrou (WhatsApp principal 'homolog').
export default async function({db,q,qs,t,err,A,B}){
  console.log('\n— Canais na tela (crm_0022)');
  const L=(await db.query(`insert into auth.users(email) values ('lider-cn@x') returning id`)).rows[0].id;
  await db.exec(`insert into crm.acessos values ('${L}','atendimento','lider');
    insert into crm.perfis(user_id,nome,email) values ('${A}','Admin','admin@x') on conflict (user_id) do update set nome=excluded.nome`);
  const one=async s=>(await db.query(s)).rows[0];
  const salvar=(u,o={})=>q(`select crm.canal_salvar(${o.id?`'${o.id}'`:'null'},'${o.tipo||'whatsapp'}','${o.nome??'Reserva nova'}','+55 16 90000-0009',${o.inst===null?'null':`'${o.inst||'reserva-nova'}'`},'${o.prov||'evolution'}',${o.sil??120},${o.res??true}) id`,u).then(r=>r.rows[0].id);

  t('atendente não cadastra canal',/só o administrador/.test(await err(()=>salvar(B))));
  t('líder não cadastra canal',/só o administrador/.test(await err(()=>salvar(L))));
  t('WhatsApp pela Evolution exige a instância',/instância na Evolution/.test(await err(()=>salvar(A,{inst:null}))));
  t('provedor tem que servir ao tipo',/não serve para/.test(await err(()=>salvar(A,{prov:'meta'}))));
  t('silêncio fora de 10 min a 7 dias é recusado',/entre 10 min e 7 dias/.test(await err(()=>salvar(A,{sil:5}))));
  t('instância repetida é recusada',/já existe um canal com a instância homolog/.test(await err(()=>salvar(A,{inst:'homolog'}))));
  const N=await salvar(A,{nome:'  Reserva   nova '});
  let c=await one(`select * from crm.canais where id='${N}'`);
  t('canal novo nasce desligado e não principal, nome limpo',c.ativo===false&&c.principal===false&&c.reserva===true&&c.nome==='Reserva nova',JSON.stringify({a:c.ativo,p:c.principal,n:c.nome}));
  t('cadastro anotado no histórico com o nome de quem fez',/Canal cadastrado por Admin/.test((await one(`select detalhe from crm.canal_eventos where canal_id='${N}' order by id desc limit 1`)).detalhe));
  await salvar(A,{id:N,nome:'Reserva B',sil:240,tipo:'instagram'});
  c=await one(`select * from crm.canais where id='${N}'`);t('editar muda nome e silêncio, sem trocar o tipo',c.nome==='Reserva B'&&c.silencio_max_min===240&&c.tipo==='whatsapp');

  const W=(await one(`select id from crm.canais where tipo='whatsapp' and principal and ativo`)).id;
  t('principal não pode ser desligado',/torne outro canal principal/.test(await err(()=>q(`select crm.canal_ativar('${W}',false)`,A))));
  t('atendente não liga canal',/só o administrador/.test(await err(()=>q(`select crm.canal_ativar('${N}',true)`,B))));
  await q(`select crm.canal_ativar('${N}',true)`,A);
  t('ligar a verificação deixa o canal ativo (sem virar principal)',(await one(`select ativo and not principal ok from crm.canais where id='${N}'`)).ok===true);
  await q(`select crm.canal_ativar('${N}',false)`,A);

  // plano B: fila pendente e com falha vai junto; enviada fica no antigo
  await db.exec(`delete from crm.saida_mensagens`);
  for(const [k,st] of [['pb1','pendente'],['pb2','falhou'],['pb3','enviada']])
    await db.exec(`insert into crm.saida_mensagens(conversa_ref,canal_id,destino,conteudo,origem,chave_idempotencia,estado) values ('c-pb','${W}','+55 16 98800-0101','msg ${k}','automacao','${k}','${st}')`);
  t('atendente não troca o principal',/só o administrador/.test(await err(()=>q(`select crm.canal_tornar_principal('${N}')`,B))));
  let n=(await q(`select crm.canal_tornar_principal('${N}') n`,A)).rows[0].n;
  t('plano B leva 2 mensagens (pendente e com falha) para o novo principal',n===2,n);
  const ant=await one(`select ativo,principal from crm.canais where id='${W}'`),nov=await one(`select ativo,principal from crm.canais where id='${N}'`);
  t('o antigo é desligado e o novo vira principal ativo',!ant.ativo&&!ant.principal&&nov.ativo&&nov.principal);
  t('a mensagem já enviada continua no canal antigo',(await one(`select canal_id from crm.saida_mensagens where chave_idempotencia='pb3'`)).canal_id===W);
  t('histórico dos dois canais registra a troca',/Passou a ser o principal no lugar de/.test((await one(`select detalhe from crm.canal_eventos where canal_id='${N}' order by id desc limit 1`)).detalhe)
    &&/Deixou de ser o principal/.test((await one(`select detalhe from crm.canal_eventos where canal_id='${W}' order by id desc limit 1`)).detalhe));
  let r=await q(`select crm.enfileirar_mensagem('Depois da troca','pb4',null,'c-pb') id`,A);
  t('mensagem nova já sai pelo novo principal',(await one(`select canal_id from crm.saida_mensagens where id='${r.rows[0].id}'`)).canal_id===N);
  t('tornar principal de novo não faz nada',(await q(`select crm.canal_tornar_principal('${N}') n`,A)).rows[0].n===0);
  n=(await q(`select crm.canal_tornar_principal('${W}') n`,A)).rows[0].n;
  t('voltar ao número do escritório traz a fila de volta',n===3&&(await one(`select count(*)::int n from crm.canais where tipo='whatsapp' and principal and ativo`)).n===1,n);
  await db.exec(`delete from crm.saida_mensagens`);

  // alerta "automação com erro" é o único que se marca como visto
  await qs(`select crm.alertar('automacao_falhou','geral','aviso','Automação com erro')`);
  await qs(`select crm.alertar('webhook_erro','geral','aviso','Webhook com erro')`);
  const au=(await one(`select id from crm.alertas where tipo='automacao_falhou' and resolvido_em is null`)).id,wh=(await one(`select id from crm.alertas where tipo='webhook_erro' and resolvido_em is null`)).id;
  t('atendente não marca alerta como visto',/só líderes/.test(await err(()=>q(`select crm.alerta_visto(${au})`,B))));
  t('alerta que se resolve sozinho não é marcado como visto',/se resolve sozinho/.test(await err(()=>q(`select crm.alerta_visto(${wh})`,L))));
  await q(`select crm.alerta_visto(${au})`,L);
  t('líder marca a automação com erro como vista',(await one(`select resolvido_em is not null ok from crm.alertas where id=${au}`)).ok===true);
  r=await q(`select crm.saude_resumo() r`,L);
  t('painel de saúde traz o id de cada alerta aberto',r.rows[0].r.alertas_abertos.every(a=>a.id>0)&&r.rows[0].r.alertas_abertos.some(a=>a.tipo==='webhook_erro'));
  await qs(`select crm.resolver_alertas('webhook_erro','{}')`);
  t('nome_logado devolve o próprio nome',(await q(`select crm.nome_logado() n`,A)).rows[0].n==='Admin');
  t('canal_anotar só pela Edge Function',/permission denied/.test(await err(()=>q(`select crm.canal_anotar('${N}','x')`,A))));
}
