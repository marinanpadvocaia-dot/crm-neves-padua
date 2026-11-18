// Integração do motor dos fluxos: o código real da Edge Function fluxos-motor (processos-fluxos.ts) contra as migrações
// reais (PGlite), com mensagens no formato da Evolution e webhook simulado. Nada sai para a rede.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {bancoLocal,bancoServico} from '../banco-local.mjs';
import {rodarMotorFluxos,urlSegura} from '../../supabase/functions/_shared/processos-fluxos.ts';

const J=o=>JSON.stringify(o).replace(/'/g,"''");
async function publicar(db,nome,def,cfg={}){
  const id=(await db.query(`insert into crm.fluxos(nome,definicao,configuracoes,status,ativo,versao_publicada) values ('${nome}','${J(def)}','${J(cfg)}','publicado',true,1) returning id`)).rows[0].id;
  await db.exec(`insert into crm.fluxo_versoes(fluxo_id,versao,definicao,configuracoes) values ('${id}',1,'${J(def)}','${J(cfg)}')`);return id}
const evolution=(numero,texto,{deMim=false,id}={})=>({key:{remoteJid:numero+'@s.whatsapp.net',fromMe:deMim,id},pushName:deMim?undefined:'Marta Silva',message:{conversation:texto}});

test('motor dos fluxos: mensagem real da Evolution → fluxo publicado → mensagem na fila e webhook enviado, sem repetir',async()=>{
  const db=await bancoLocal(),banco=bancoServico(db);
  const canal=(await db.query(`insert into crm.canais(tipo,nome,provedor,instancia,principal,estado) values ('whatsapp','WA','simulado','motor',true,'conectado') returning id`)).rows[0].id;
  await db.exec(`update crm.config set valor=valor||'{"dias":"Todos os dias","inicio":"00:00","fim":"00:00"}' where chave='whatsapp_automacao'`);   // teste roda a qualquer hora
  const F=await publicar(db,'Pedido de boleto',{gatilhos:[{id:'g1',tipo:'cliente_respondeu',cfg:{palavras:'boleto, segunda via'}}],passos:[
    {id:'p1',tipo:'mensagem',cfg:{texto:'Olá, {nome}! Já vamos te enviar a segunda via.'}},
    {id:'p2',tipo:'webhook',cfg:{url:'https://hooks.exemplo.com.br/crm'}}]});
  await banco.rpc('webhook_registrar',{p_canal:canal,p_id_externo:'ABC',p_tipo:'mensagem',p_payload:evolution('5516911112222','Preciso da segunda via do boleto',{id:'ABC'})});
  await banco.rpc('webhook_registrar',{p_canal:canal,p_id_externo:'DEF',p_tipo:'mensagem',p_payload:evolution('5516933334444','Bom dia, tudo certo?',{deMim:true,id:'DEF'})});
  await banco.rpc('webhook_registrar',{p_canal:canal,p_id_externo:'GHI',p_tipo:'mensagem',p_payload:{key:{remoteJid:'1203@g.us',id:'GHI'},message:{conversation:'boleto no grupo'}}});
  const chamadas=[];const fetch=async(url,init)=>{chamadas.push({url,corpo:JSON.parse(init.body)});return new Response('ok',{status:200})};

  const r=await rodarMotorFluxos({banco,fetch});
  assert.equal(r.mensagens,2,'cliente + mensagem do escritório pelo celular');assert.equal(r.ignoradas,1,'grupo é ignorado');
  assert.equal(r.ciclo.inscricoes,1);assert.equal(r.webhooks,1);assert.equal(r.webhooks_falhos,0);
  const s=(await db.query(`select conteudo,destino,origem from crm.saida_mensagens`)).rows;
  assert.deepEqual(s,[{conteudo:'Olá, Marta! Já vamos te enviar a segunda via.',destino:'5516911112222',origem:'automacao'}]);
  assert.equal(chamadas[0].url,'https://hooks.exemplo.com.br/crm');assert.equal(chamadas[0].corpo.contato,'Marta Silva');
  const a=(await db.query(`select contato,ultima_saida_em is not null s,ultima_entrada_em is not null e from crm.contato_atividade order by contato`)).rows;
  assert.deepEqual(a,[{contato:'whatsapp:16911112222',s:false,e:true},{contato:'whatsapp:16933334444',s:true,e:false}],'escritório respondeu pelo celular conta como saída');
  const reg=(await db.query(`select string_agg(resultado,',' order by id) x from crm.fluxo_registros where fluxo_id='${F}'`)).rows[0].x;
  assert.equal(reg,'executado,executado');

  const r2=await rodarMotorFluxos({banco,fetch});
  assert.equal(r2.mensagens+r2.ignoradas,0,'nada é lido duas vezes');assert.equal(r2.webhooks,0);
  assert.equal((await db.query(`select count(*)::int n from crm.saida_mensagens`)).rows[0].n,1,'nada é enviado duas vezes');
});

test('webhook só para https público; falha conta tentativa',async()=>{
  assert.ok(urlSegura('https://hooks.exemplo.com.br/x'));
  for(const u of ['http://exemplo.com','https://localhost/x','https://127.0.0.1/x','https://10.0.0.5','https://[::1]/','https://servico.internal/x','https://user:senha@exemplo.com','ftp://x.com'])assert.equal(urlSegura(u),false,u);
  const db=await bancoLocal(),banco=bancoServico(db);
  await db.exec(`insert into crm.fluxo_webhooks(url,corpo) values ('https://127.0.0.1/x','{}'),('https://fora.exemplo.com/x','{}')`);
  const r=await rodarMotorFluxos({banco,fetch:async()=>{throw new Error('timeout')}});
  assert.equal(r.webhooks,2);assert.equal(r.webhooks_falhos,2);
  const w=(await db.query(`select estado,tentativas,resposta from crm.fluxo_webhooks order by id`)).rows;
  assert.equal(w[0].estado,'pendente');assert.match(w[0].resposta,/recusado/);assert.equal(w[1].tentativas,1);assert.match(w[1].resposta,/timeout/);
});
