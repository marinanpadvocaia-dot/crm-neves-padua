// Reconectar/verificar canal pela tela (Edge Function canais-conectar) e o pedido de QR Code à Evolution.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {conectarCanal} from '../../supabase/functions/_shared/canais.ts';
import {criarEvolution,criarSimulado} from '../../supabase/functions/_shared/adaptador.ts';

const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const canalWa={id:ID,tipo:'whatsapp',nome:'WhatsApp',provedor:'evolution',instancia:'escritorio',estado:'desconectado',ativo:true};
const deps=(o={})=>{const rpcs=[];return {rpcs,
  ehLider:async()=>o.lider??true,nome:async()=>'Líder Teste',
  canal:async id=>id===ID?(o.canal??canalWa):null,
  rpc:async(fn,a)=>{rpcs.push([fn,a]);return fn==='registrar_estado_canal'?(o.mudou??true):null},
  adaptador:()=>o.ad??criarSimulado({estado:'desconectado'})}};

test('canal_exige_token_e_lider',async()=>{
  assert.equal((await conectarCanal(deps(),null,{canal_id:ID,acao:'qr'})).status,401);
  const d=deps({lider:false});const r=await conectarCanal(d,'Bearer TK',{canal_id:ID,acao:'qr'});
  assert.equal(r.status,403);assert.equal(d.rpcs.length,0,'nada gravado');
});
test('canal_valida_id_e_acao',async()=>{
  assert.equal((await conectarCanal(deps(),'Bearer TK',{canal_id:'1; drop',acao:'qr'})).status,400);
  assert.equal((await conectarCanal(deps(),'Bearer TK',{canal_id:ID,acao:'apagar'})).status,400);
  assert.equal((await conectarCanal(deps(),'Bearer TK',{canal_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',acao:'qr'})).status,404);
});
test('qr_marca_aguardando_e_anota_quem_pediu',async()=>{
  const ad={...criarSimulado(),conectar:async()=>({conectado:false,qr:'data:image/png;base64,AAA',codigo:'ABCD-1234'})};
  let d=deps({ad});let r=await conectarCanal(d,'Bearer TK',{canal_id:ID,acao:'qr'});
  assert.deepEqual(r,{status:200,corpo:{conectado:false,qr:'data:image/png;base64,AAA',codigo:'ABCD-1234'}});
  assert.deepEqual(d.rpcs,[['registrar_estado_canal',{p_canal:ID,p_estado:'aguardando_qr',p_detalhe:'QR Code pedido por Líder Teste'}]]);
  d=deps({ad,mudou:false});await conectarCanal(d,'Bearer TK',{canal_id:ID,acao:'qr'});
  assert.deepEqual(d.rpcs.at(-1),['canal_anotar',{p_canal:ID,p_detalhe:'QR Code pedido por Líder Teste'}],'sem mudança de estado, o pedido fica anotado assim mesmo');
});
test('qr_de_canal_ja_conectado_so_confirma',async()=>{
  const d=deps({ad:{...criarSimulado(),conectar:async()=>({conectado:true})}});
  const r=await conectarCanal(d,'Bearer TK',{canal_id:ID,acao:'qr'});
  assert.deepEqual(r.corpo,{conectado:true});assert.equal(d.rpcs[0][1].p_estado,'conectado');
});
test('instagram_e_google_nao_usam_qr',async()=>{
  const ig={...canalWa,tipo:'instagram',provedor:'meta'};const ad={estado:async()=>({estado:'conectado'}),enviarTexto:async()=>({idExterno:null})};
  const r=await conectarCanal(deps({canal:ig,ad}),'Bearer TK',{canal_id:ID,acao:'qr'});
  assert.equal(r.status,400);assert.match(r.corpo.erro,/renovando o acesso/);
});
test('erro_da_evolution_vira_mensagem_legivel',async()=>{
  const ad={...criarSimulado(),conectar:async()=>{throw new Error('a instância x não existe na Evolution')}};
  const r=await conectarCanal(deps({ad}),'Bearer TK',{canal_id:ID,acao:'qr'});
  assert.equal(r.status,502);assert.match(r.corpo.erro,/não existe na Evolution/);
});
test('verificar_grava_o_estado_atual',async()=>{
  let d=deps({ad:criarSimulado({estado:'conectado'})});let r=await conectarCanal(d,'Bearer TK',{canal_id:ID,acao:'verificar'});
  assert.deepEqual(r.corpo,{estado:'conectado',mudou:true,detalhe:'simulado'});
  assert.equal(d.rpcs[0][1].p_detalhe,'verificação pedida por Líder Teste · simulado');
  d=deps({ad:{estado:async()=>{throw new Error('timeout')},enviarTexto:async()=>({idExterno:null})}});
  r=await conectarCanal(d,'Bearer TK',{canal_id:ID,acao:'verificar'});
  assert.equal(r.corpo.estado,'desconectado');assert.match(d.rpcs[0][1].p_detalhe,/sem resposta do provedor: timeout/);
});
test('evolution_connect_devolve_qr_ou_conectado',async()=>{
  const chamadas=[];const fake=resp=>async(url,init)=>{chamadas.push([url,init.headers.apikey]);return {ok:resp.status===200,status:resp.status,json:async()=>resp.body}};
  let evo=criarEvolution({url:'https://evo.test/',apikey:'K',fetch:fake({status:200,body:{pairingCode:'WZYEH1YY',code:'2@x',base64:'data:image/png;base64,QQ==',count:1}})});
  assert.deepEqual(await evo.conectar(canalWa),{conectado:false,qr:'data:image/png;base64,QQ==',codigo:'WZYEH1YY'});
  assert.deepEqual(chamadas[0],['https://evo.test/instance/connect/escritorio','K']);
  evo=criarEvolution({url:'https://evo.test',apikey:'K',fetch:fake({status:200,body:{base64:'QQ=='}})});
  assert.equal((await evo.conectar(canalWa)).qr,'data:image/png;base64,QQ==','base64 sem prefixo vira data URL');
  evo=criarEvolution({url:'https://evo.test',apikey:'K',fetch:fake({status:200,body:{instance:{instanceName:'escritorio',state:'open'}}})});
  assert.deepEqual(await evo.conectar(canalWa),{conectado:true});
  evo=criarEvolution({url:'https://evo.test',apikey:'K',fetch:fake({status:404,body:{}})});
  await assert.rejects(evo.conectar(canalWa),/não existe na Evolution/);
  evo=criarEvolution({url:'https://evo.test',apikey:'K',fetch:fake({status:200,body:{count:0}})});
  await assert.rejects(evo.conectar(canalWa),/não devolveu o QR Code/);
});
test('simulado_conecta_na_proxima_verificacao',async()=>{
  const s=criarSimulado({estado:'desconectado'});
  assert.deepEqual(await s.conectar(),{conectado:false,qr:null,codigo:'SIMULADO'});
  assert.equal((await s.estado()).estado,'conectado');assert.deepEqual(await s.conectar(),{conectado:true});
});
