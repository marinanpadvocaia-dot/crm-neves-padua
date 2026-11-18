// Integração dos agentes de IA: o código real das Edge Functions (processos-ia.ts) contra as migrações reais (PGlite),
// com IA, Instagram e Google simulados. Nada sai para a rede.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {bancoLocal,bancoServico,bancoIALocal} from '../banco-local.mjs';
import {processarIA,receberInstagram,buscarAvaliacoesGoogle} from '../../supabase/functions/_shared/processos-ia.ts';
import {processarFila} from '../../supabase/functions/_shared/processos.ts';
import {criarSimulado} from '../../supabase/functions/_shared/adaptador.ts';

const silenciar=()=>{const l=console.log,e=console.error;console.log=console.error=()=>{};return()=>{console.log=l;console.error=e}};
/** IA simulada: responde conforme a mensagem e guarda o que recebeu (para conferir o mascaramento). */
function iaSimulada(){
  const pedidos=[];
  const responder=u=>/valor|custa/i.test(u)?{acao:'transferir',resposta:'Vou passar para a equipe.',motivo:'pedido de valores'}
    :/garantia/i.test(u)?{acao:'responder',resposta:'Garantimos o resultado!',motivo:'x'}
    :{acao:'responder',resposta:'Olá! Sou o assistente virtual do escritório. Pode me dizer seu nome e cidade?',motivo:'triagem'};
  return {pedidos,gerar:async p=>{pedidos.push(p);if(/recuse/.test(p.usuario))return {texto:'',recusou:true};return {texto:JSON.stringify(responder(p.usuario))}}};
}

test('agentes de IA: rascunho uma vez só, travas, recusa do contato, aprovação envia pela fila',async()=>{
  const db=await bancoLocal(),banco=bancoServico(db),bia=bancoIALocal(db),ia=iaSimulada();
  const [U]=(await db.query(`insert into auth.users(email) values ('atend@x') returning id`)).rows.map(r=>r.id);
  await db.exec(`insert into crm.acessos values ('${U}','atendimento','atendente');
    update crm.regras_ia set validada_por='${U}', validada_em=now();
    insert into crm.canais(tipo,nome,provedor,instancia,principal,estado) values
      ('instagram','Instagram','simulado','1784',true,'conectado'),('google','Google','simulado','accounts/1/locations/2',true,'conectado');
    update crm.agentes set ativo=true where slug in ('instagram','google')`);
  const volta=silenciar();
  try{
    // 1) chegam directs e um comentário pelo webhook (um repetido)
    const corpo={object:'instagram',entry:[{id:'1784',time:1794312000,messaging:[
      {sender:{id:'901'},timestamp:Date.now(),message:{mid:'M1',text:'Oi! Vi o reel. Meu número é 16 99999-0000'}},
      {sender:{id:'902'},timestamp:Date.now(),message:{mid:'M2',text:'Quanto custa?'}},
      {sender:{id:'903'},timestamp:Date.now(),message:{mid:'M3',text:'Tem garantia?'}},
      {sender:{id:'904'},timestamp:Date.now(),message:{mid:'M4',text:'Oi de novo'}},
      {sender:{id:'905'},timestamp:Date.now(),message:{mid:'M5',text:'recuse isto'}},
      {sender:{id:'1784'},timestamp:Date.now(),message:{mid:'M6',text:'eco',is_echo:true}}]}]};
    assert.deepEqual(await receberInstagram({banco},corpo),{novos:6,repetidos:0,desconhecidos:0});
    assert.deepEqual(await receberInstagram({banco},corpo),{novos:0,repetidos:6,desconhecidos:0},'webhook repetido é ignorado');
    // o contato 904 recusou o uso de IA
    await db.exec(`insert into crm.consentimentos(contato_ref,finalidade,revogado_em) values ('instagram:904','ia',now())`);
    // 2) avaliações do Google chegam pela busca agendada (5 e 2 estrelas; uma já respondida)
    const google={...criarSimulado(),listarAvaliacoes:async()=>[
      {name:'accounts/1/locations/2/reviews/R1',reviewId:'R1',reviewer:{displayName:'Fernando'},starRating:'FIVE',comment:'Muito atenciosos.'},
      {name:'accounts/1/locations/2/reviews/R2',reviewId:'R2',starRating:'TWO',comment:'Demoraram.'},
      {name:'accounts/1/locations/2/reviews/R3',reviewId:'R3',starRating:'FIVE',reviewReply:{comment:'Obrigado'}}]};
    assert.deepEqual(await buscarAvaliacoesGoogle({banco,adaptador:c=>c.tipo==='google'?google:criarSimulado()}),{canais:1,novas:2});
    assert.equal((await buscarAvaliacoesGoogle({banco,adaptador:()=>google})).novas,0,'busca repetida não duplica');

    // 3) a IA processa: cada evento uma vez
    const r=await processarIA({banco:bia,provedor:()=>ia});
    assert.deepEqual([r.rascunhos,r.transferidas,r.bloqueadas,r.ignoradas,r.erros],[2,4,1,0,0],JSON.stringify(r));
    const rv=Object.fromEntries((await db.query(`select contato,status,motivo,rascunho from crm.revisoes_ia where status<>'ignorada' or contato is not null`)).rows.map(x=>[x.contato,x]));
    assert.equal(rv['instagram:901'].status,'pendente');
    assert.equal(rv['instagram:902'].status,'transferida');
    assert.equal(rv['instagram:903'].status,'bloqueada');assert.match(rv['instagram:903'].motivo,/promete/);
    assert.equal(rv['instagram:904'].status,'transferida','recusou a IA: vai direto para a equipe');assert.match(rv['instagram:904'].motivo,/vai direto para a equipe/);
    assert.equal(rv['instagram:905'].status,'transferida');assert.match(rv['instagram:905'].motivo,/recusou a responder/);
    assert.equal(rv['google:R1'].status,'pendente');
    assert.equal(rv['google:R2'].status,'transferida');assert.match(rv['google:R2'].motivo,/2 estrela/);
    assert.equal(ia.pedidos.length,5,'IA não é chamada para recusa do contato, eco e avaliação negativa');
    assert.ok(ia.pedidos.every(p=>!/99999-0000/.test(p.usuario)),'telefone não vai para a IA');
    assert.ok(ia.pedidos[0].system.includes('Fingir ser humano'),'regras validadas vão no pedido');
    assert.equal(ia.pedidos[0].modelo,'claude-opus-5-5');
    const r2=await processarIA({banco:bia,provedor:()=>ia});
    assert.equal(r2.eventos,0,'segunda rodada não reprocessa');assert.equal(ia.pedidos.length,5);
    assert.equal((await db.query(`select count(*)::int n from crm.saida_mensagens`)).rows[0].n,0,'modo rascunho: nada enviado sem aprovação');

    // 4) a pessoa aprova o direct (com correção) e a avaliação; a fila de saída envia pelo canal certo
    const id=async c=>(await db.query(`select id from crm.revisoes_ia where contato='${c}'`)).rows[0].id;
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U}',false);`);
    await db.query(`select crm.ia_aprovar($1,'Olá, Renata! Sou o assistente virtual do escritório. Em que cidade você está?')`,[await id('instagram:901')]);
    await db.query(`select crm.ia_aprovar($1)`,[await id('google:R1')]);
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
    const canalSim=criarSimulado();
    const f=await processarFila({banco,adaptador:()=>canalSim,esperar:async()=>{}});
    assert.equal(f.enviadas,2);
    assert.deepEqual(canalSim.enviadas.map(x=>x.destino).sort(),['avaliacao:accounts/1/locations/2/reviews/R1','dm:901']);
    assert.ok(canalSim.enviadas.some(x=>/Renata/.test(x.texto)),'vai o texto corrigido');
    // 5) a correção entra como exemplo no próximo pedido do agente
    await receberInstagram({banco},{object:'instagram',entry:[{id:'1784',messaging:[{sender:{id:'906'},timestamp:Date.now(),message:{mid:'M7',text:'Bom dia'}}]}]});
    await processarIA({banco:bia,provedor:()=>ia});
    assert.match(ia.pedidos.at(-1).system,/Em que cidade você está\?/);
    // 6) agente desligado: nada é processado
    await db.exec(`update crm.agentes set ativo=false`);
    await receberInstagram({banco},{object:'instagram',entry:[{id:'1784',messaging:[{sender:{id:'907'},timestamp:Date.now(),message:{mid:'M8',text:'Oi'}}]}]});
    assert.equal((await processarIA({banco:bia,provedor:()=>ia})).eventos,0);
  }finally{volta()}
});
