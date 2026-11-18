// Agentes de IA editáveis (crm_0026): criar, editar, arquivar/restaurar, um ligado por tipo de mensagem e regras com versões.
// A = admin, B = atendente, L = líder com acesso à gestão.
export default async function({db,q,qs,t,err,A,B}){
  console.log('\n— Agentes de IA editáveis (crm_0026)');
  const one=async(s,u)=>(await (u?q(s,u):db.query(s))).rows[0];
  const L=(await db.query(`insert into auth.users(email) values ('lider-agentes@x') returning id`)).rows[0].id;
  await db.exec(`insert into crm.acessos values ('${L}','gestao','lider'),('${L}','atendimento','lider') on conflict do nothing`);
  const IG=(await one(`select id from crm.agentes where slug='instagram'`)).id;
  const ini=await one(`select ativo, tipos from crm.agentes where id='${IG}'`);
  const set=a=>JSON.stringify([...a].sort());
  t('agentes semeados recebem os tipos do canal',set(ini.tipos)==='["comentario","mensagem"]'&&set((await one(`select tipos from crm.agentes where slug='google'`)).tipos)==='["avaliacao"]',JSON.stringify(ini.tipos));
  if(!ini.ativo)await q(`select crm.agente_ativar('${IG}',true)`,A);

  const dados=(o={})=>JSON.stringify(Object.assign({nome:'Agente de comentários',canal:'instagram',tipos:['comentario'],instrucoes:'Responda comentários em até 2 frases.',
    responde_sozinho:'Agradecimentos\nPerguntas gerais',transfere_quando:'Caso concreto',modelo:'claude-sonnet-5-5',limite_diario:50},o)).replace(/'/g,"''");
  const salvar=(id,o,u=A)=>q(`select crm.agente_salvar(${id?`'${id}'`:'null'},'${dados(o)}'::jsonb) id`,u).then(r=>r.rows[0].id);

  // permissões e validação
  t('líder não cria agente',/só o administrador cria/.test(await err(()=>salvar(null,{},L))));
  t('atendente não cria agente',/só o administrador cria/.test(await err(()=>salvar(null,{},B))));
  t('nome curto recusado',/de 3 a 80/.test(await err(()=>salvar(null,{nome:'Ag'}))));
  t('WhatsApp continua sem agente',/só o Instagram e o Google/.test(await err(()=>salvar(null,{canal:'whatsapp',tipos:['mensagem']}))));
  t('tipo que não existe no canal recusado',/não existe neste canal/.test(await err(()=>salvar(null,{tipos:['avaliacao']}))));
  t('sem tipo de mensagem recusado',/ao menos um tipo/.test(await err(()=>salvar(null,{tipos:[]}))));
  t('modelo fora da lista recusado',/modelo de IA não permitido/.test(await err(()=>salvar(null,{modelo:'gpt-5'}))));
  t('limite diário fora de 1 a 2000 recusado',/1 a 2000/.test(await err(()=>salvar(null,{limite_diario:0})))&&/1 a 2000/.test(await err(()=>salvar(null,{limite_diario:'abc'}))));
  t('sem o que pode responder recusado',/ao menos um assunto/.test(await err(()=>salvar(null,{responde_sozinho:'  '}))));
  t('sem caso de transferência recusado',/passa para uma pessoa/.test(await err(()=>salvar(null,{transfere_quando:''}))));
  t('nome repetido recusado',/já existe um agente com esse nome/.test(await err(()=>salvar(null,{nome:'agente INSTAGRAM'}))));

  // criar
  const N=await salvar(null,{});
  let a=await one(`select ativo,modo,slug,tipos,modelo,limite_diario,criado_por,provedor from crm.agentes where id='${N}'`);
  t('agente novo nasce desligado, em rascunho, com o modelo e o limite escolhidos',!a.ativo&&a.modo==='rascunho'&&/^ag-/.test(a.slug)&&set(a.tipos)==='["comentario"]'&&a.modelo==='claude-sonnet-5-5'&&a.limite_diario===50&&a.criado_por===A&&a.provedor==='anthropic',JSON.stringify(a));
  t('criação fica no histórico',(await one(`select count(*)::int n from crm.agentes_historico where agente_id='${N}' and campo='criado' and user_id='${A}'`)).n===1);

  // um ligado por tipo
  t('não liga dois agentes para os comentários do Instagram',/já responde comentários deste canal: desligue-o antes/.test(await err(()=>q(`select crm.agente_ativar('${N}',true)`,L))));
  await salvar(IG,{nome:'Agente Instagram',tipos:['mensagem'],instrucoes:(await one(`select instrucoes from crm.agentes where id='${IG}'`)).instrucoes,
    responde_sozinho:(await one(`select responde_sozinho from crm.agentes where id='${IG}'`)).responde_sozinho,
    transfere_quando:(await one(`select transfere_quando from crm.agentes where id='${IG}'`)).transfere_quando,
    captacao:(await one(`select captacao from crm.agentes where id='${IG}'`)).captacao,base_conhecimento:(await one(`select base_conhecimento from crm.agentes where id='${IG}'`)).base_conhecimento,
    destino_registro:(await one(`select destino_registro from crm.agentes where id='${IG}'`)).destino_registro,modelo:'claude-opus-5-5',limite_diario:200});
  const h=await one(`select para, antes from crm.agentes_historico where agente_id='${IG}' and campo='configuracao' order by id desc limit 1`);
  t('editar registra o que mudou e o valor anterior',h&&h.para==='tipos de mensagem'&&set(h.antes.tipos)==='["comentario","mensagem"]',JSON.stringify(h));
  await q(`select crm.agente_ativar('${N}',true)`,L);
  t('com o Instagram só nos directs, o agente de comentários liga',(await one(`select ativo from crm.agentes where id='${N}'`)).ativo===true);

  const CIG=(await one(`select id from crm.canais where tipo='instagram' and principal`)).id;
  const reg=async(id,tipo,payload)=>(await qs(`select * from crm.webhook_registrar('${CIG}','${id}','${tipo}',$$${JSON.stringify(payload)}$$::jsonb,now())`)).rows[0].evento_id;
  const ed=await reg('ed-dm-1','mensagem',{sender:{id:'7001'},message:{mid:'ed-dm-1',text:'Oi, atendem empresas?'}});
  const ec=await reg('ed-cm-1','comentario',{id:'ed-cm-1',from:{id:'7002',username:'joana'},text:'Vocês atendem em Franca?'});
  const fila=async()=>Object.fromEntries((await qs(`select evento_id, agente_id from crm.ia_eventos_para_processar(100)`)).rows.map(r=>[String(r.evento_id),r.agente_id]));
  let f=await fila();
  t('cada mensagem vai para o agente ligado do seu tipo',f[ed]===IG&&f[ec]===N,JSON.stringify({ed:f[ed],ec:f[ec]}));

  t('editar um agente ligado para invadir o tipo do outro é recusado',/já responde comentários/.test(await err(()=>salvar(IG,{nome:'Agente Instagram',tipos:['mensagem','comentario']}))));
  t('trocar o canal de um agente ligado é recusado',/desligue o agente antes de trocar o canal/.test(await err(()=>salvar(N,{canal:'google',tipos:['avaliacao']}))));
  const nh=(await one(`select count(*)::int n from crm.agentes_historico where agente_id='${N}'`)).n;
  await salvar(N,{});
  t('salvar sem mudança não grava histórico',(await one(`select count(*)::int n from crm.agentes_historico where agente_id='${N}'`)).n===nh);
  t('nem o administrador altera o agente direto na tabela',/permission denied/.test(await err(()=>q(`update crm.agentes set nome='x' where id='${N}'`,A))));

  // arquivar e restaurar
  t('líder não exclui agente',/só o administrador exclui/.test(await err(()=>q(`select crm.agente_arquivar('${N}')`,L))));
  await q(`select crm.agente_arquivar('${N}','não vamos mais responder comentários')`,A);
  a=await one(`select ativo, arquivado_em, arquivado_por from crm.agentes where id='${N}'`);
  t('excluir arquiva e desliga o agente',a.ativo===false&&a.arquivado_em&&a.arquivado_por===A);
  t('histórico guarda o desligar e o excluir, com o motivo',(await db.query(`select campo from crm.agentes_historico where agente_id='${N}' order by id`)).rows.map(x=>x.campo).join()==='criado,ativo,ativo,arquivado');
  f=await fila();
  t('comentário fica sem agente depois de excluir o de comentários',f[ec]===undefined&&f[ed]===IG);
  t('agente excluído não liga',/arquivado: restaure antes de ligar/.test(await err(()=>q(`select crm.agente_ativar('${N}',true)`,A))));
  t('agente excluído não é editado',/arquivado: restaure antes de editar/.test(await err(()=>salvar(N,{}))));
  t('excluir de novo é recusado',/já está excluído/.test(await err(()=>q(`select crm.agente_arquivar('${N}')`,A))));
  const N2=await salvar(null,{});   // mesmo nome é permitido enquanto o outro está excluído
  t('restaurar com nome já usado é recusado',/renomeie o outro antes de restaurar/.test(await err(()=>q(`select crm.agente_restaurar('${N}')`,A))));
  await q(`select crm.agente_arquivar('${N2}')`,A);
  await q(`select crm.agente_restaurar('${N}')`,A);
  a=await one(`select ativo, arquivado_em from crm.agentes where id='${N}'`);
  t('restaurar traz o agente de volta desligado',a.ativo===false&&a.arquivado_em===null);
  t('revisões antigas continuam ligadas ao agente',(await one(`select count(*)::int n from crm.agentes where id='${N}'`)).n===1);

  // regras
  const regra=(id,tipo,txt,fonte=null,ag=null,u=A)=>q(`select crm.regra_salvar(${id?`'${id}'`:'null'},'${tipo}','${txt}',${fonte?`'${fonte}'`:'null'},${ag?`'${ag}'`:'null'}) id`,u).then(r=>r.rows[0].id);
  const validadas=async()=>(await one(`select count(*)::int n from crm.regras_ia where ativa and validada_em is not null`)).n;
  t('líder não cria regra',/só o administrador cria e edita regras/.test(await err(()=>regra(null,'obrigatorio','Sempre se identificar como assistente virtual.',null,null,L))));
  t('regra curta recusada',/de 10 a 600/.test(await err(()=>regra(null,'proibido','Curta.'))));
  t('tipo de regra inválido recusado',/tipo de regra inválido/.test(await err(()=>regra(null,'talvez','Uma regra qualquer de teste.'))));
  const v0=await validadas();
  const R1=await regra(null,'obrigatorio','Sempre convidar para o direct quando o assunto for pessoal.','Provimento 205/2021');
  t('regra nova entra sem valer (aguarda validação)',(await validadas())===v0&&(await one(`select validada_em from crm.regras_ia where id='${R1}'`)).validada_em===null);
  t('texto repetido recusado',/já existe uma regra com esse texto/.test(await err(()=>regra(null,'obrigatorio','sempre convidar para o direct quando o assunto for pessoal.'))));
  t('líder não valida',/só o administrador valida/.test(await err(()=>q(`select crm.regra_validar('${R1}')`,L))));
  await q(`select crm.regra_validar('${R1}')`,A);
  t('validar registra quem e quando e a regra passa a valer',(await validadas())===v0+1&&(await one(`select validada_por from crm.regras_ia where id='${R1}'`)).validada_por===A);
  t('validar duas vezes é recusado',/já está validada/.test(await err(()=>q(`select crm.regra_validar('${R1}')`,A))));
  const R2=await regra(R1,'obrigatorio','Sempre convidar para o direct quando o assunto for pessoal ou de caso concreto.','Provimento 205/2021');
  let r=await one(`select substitui_id, validada_em from crm.regras_ia where id='${R2}'`);
  t('editar regra validada cria nova versão aguardando validação',R2!==R1&&r.substitui_id===R1&&r.validada_em===null);
  t('a versão antiga continua valendo até validar a nova',(await one(`select ativa, validada_em is not null v from crm.regras_ia where id='${R1}'`)).v===true&&(await validadas())===v0+1);
  const R2b=await regra(R1,'obrigatorio','Sempre convidar para o direct quando o assunto for pessoal, de caso concreto ou de valores.');
  t('editar de novo corrige a mesma nova versão (sem acumular)',R2b===R2&&(await one(`select count(*)::int n from crm.regras_ia where substitui_id='${R1}'`)).n===1);
  await q(`select crm.regra_validar('${R2}')`,A);
  r=await one(`select ativa, motivo_desativacao m from crm.regras_ia where id='${R1}'`);
  t('validar a nova versão desativa a antiga no mesmo instante',r.ativa===false&&/substituída/.test(r.m)&&(await validadas())===v0+1);
  const R3=await regra(null,'cuidado','Ao falar de prazos, dizer que dependem da análise do caso.',null,IG);
  t('regra só de um agente',(await one(`select agente_id from crm.regras_ia where id='${R3}'`)).agente_id===IG);
  await q(`select crm.regra_desativar('${R3}')`,A);
  t('regra ainda não validada é descartada sem motivo',(await one(`select ativa from crm.regras_ia where id='${R3}'`)).ativa===false);
  t('desativar regra validada exige motivo',/escreva o motivo/.test(await err(()=>q(`select crm.regra_desativar('${R2}')`,A))));
  await q(`select crm.regra_desativar('${R2}','regra coberta pela de transferência')`,A);
  t('regra validada desativada com motivo',(await one(`select ativa, desativada_por from crm.regras_ia where id='${R2}'`)).desativada_por===A&&(await validadas())===v0);
  // não deixa um agente ligado sem nenhuma regra validada
  const outras=(await db.query(`select id from crm.regras_ia where ativa and validada_em is not null order by created_at`)).rows.map(x=>x.id);
  const ultima=outras.pop();
  if(outras.length)await db.exec(`update crm.regras_ia set ativa=false where id in (${outras.map(x=>`'${x}'`).join()})`);
  t('não desativa a última regra validada com agente ligado',/ficaria sem nenhuma regra validada: desligue-o antes/.test(await err(()=>q(`select crm.regra_desativar('${ultima}','teste da última regra')`,A))));
  t('a regra continua valendo depois da recusa',(await one(`select ativa from crm.regras_ia where id='${ultima}'`)).ativa===true);
  if(outras.length)await db.exec(`update crm.regras_ia set ativa=true where id in (${outras.map(x=>`'${x}'`).join()})`);

  // volta ao estado anterior
  await db.exec(`update crm.agentes set tipos='{mensagem,comentario}' where id='${IG}'`);
  if(!ini.ativo)await q(`select crm.agente_ativar('${IG}',false)`,A);
}
