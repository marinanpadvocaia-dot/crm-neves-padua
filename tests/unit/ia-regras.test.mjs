// Testes de unidade dos agentes de IA e dos adaptadores Instagram/Google (sem banco, sem rede).
import {test} from 'node:test';import assert from 'node:assert/strict';
import {entradaDoEvento,decidirAntesDaIA,mascararParaIA,montarPedido,interpretarSaida,verificarResposta} from '../../supabase/functions/_shared/ia-regras.ts';
import {normalizarEventoInstagram,assinaturaMetaValida,criarInstagram,criarGoogle,partesDestino} from '../../supabase/functions/_shared/canais-meta-google.ts';
import {createHmac} from 'node:crypto';

const AG={id:'a1',slug:'instagram',nome:'Agente Instagram',canal:'instagram',modo:'rascunho',modelo:'claude-opus-5-5',provedor:'anthropic',requer_vinculo:false,
  instrucoes:'Seja breve.',responde_sozinho:'Dúvidas frequentes\nTriagem inicial',transfere_quando:'Pedido de valores\nPede humano'};

test('entrada_whatsapp_ignora_eco_grupo_e_vazio',()=>{
  const e=entradaDoEvento('whatsapp','mensagem',{key:{remoteJid:'5516988000101@s.whatsapp.net',fromMe:false},pushName:'Renata',message:{conversation:' Oi! '}});
  assert.deepEqual(e,{contato:'whatsapp:5516988000101',nome:'Renata',texto:'Oi!',destino:'5516988000101'});
  assert.equal(entradaDoEvento('whatsapp','mensagem',{key:{remoteJid:'x@s.whatsapp.net',fromMe:true},message:{conversation:'a'}}),null);
  assert.equal(entradaDoEvento('whatsapp','mensagem',{key:{remoteJid:'123@g.us'},message:{conversation:'a'}}),null);
  assert.equal(entradaDoEvento('whatsapp','mensagem',{key:{remoteJid:'55@s.whatsapp.net'},message:{imageMessage:{}}}),null);
  assert.equal(entradaDoEvento('whatsapp','mensagem',{key:{remoteJid:'5516988000101@s.whatsapp.net'},message:{extendedTextMessage:{text:'link'}}}).texto,'link');
});
test('entrada_instagram_direct_e_comentario',()=>{
  assert.deepEqual(entradaDoEvento('instagram','mensagem',{sender:{id:'99123'},message:{mid:'m1',text:'Olá'}}),{contato:'instagram:99123',nome:'Instagram …9123',texto:'Olá',destino:'dm:99123'});
  assert.equal(entradaDoEvento('instagram','mensagem',{sender:{id:'1'},message:{mid:'m',text:'x',is_echo:true}}),null);
  const c=entradaDoEvento('instagram','comentario',{id:'c77',text:'Atendem em Franca?',from:{id:'55',username:'renata'}});
  assert.equal(c.destino,'comentario:c77');assert.equal(c.nome,'@renata');assert.equal(c.contato,'instagram:55');
});
test('entrada_google_avaliacao_com_estrelas_e_ja_respondida',()=>{
  const r={name:'accounts/1/locations/2/reviews/R9',reviewId:'R9',reviewer:{displayName:'Fernando'},starRating:'FIVE',comment:'Recomendo.'};
  assert.deepEqual(entradaDoEvento('google','avaliacao',r),{contato:'google:R9',nome:'Fernando',texto:'Recomendo.',destino:'avaliacao:accounts/1/locations/2/reviews/R9',estrelas:5});
  assert.equal(entradaDoEvento('google','avaliacao',{...r,reviewReply:{comment:'ok'}}),null);
  assert.equal(entradaDoEvento('google','avaliacao',{...r,comment:''}).texto,'(avaliação sem comentário)');
});
test('avaliacao_de_3_estrelas_ou_menos_e_agente_com_vinculo_vao_a_uma_pessoa',()=>{
  const g={...AG,canal:'google'};
  assert.equal(decidirAntesDaIA(g,{estrelas:2}).status,'transferida');
  assert.equal(decidirAntesDaIA(g,{estrelas:3}).status,'transferida');
  assert.equal(decidirAntesDaIA(g,{estrelas:4}),null);
  assert.match(decidirAntesDaIA({...AG,requer_vinculo:true},{}).motivo,/passo 2/);
  assert.equal(decidirAntesDaIA(AG,{}),null);
});
test('mascarar_para_ia_tira_telefone_cpf_e_email',()=>{
  const s=mascararParaIA('Renata, Franca, 16 99999-0000, CPF 123.456.789-09, renata@x.com, (16) 3333-4444');
  assert.ok(!/99999|123\.456|renata@|3333/.test(s),s);
  assert.match(s,/\[telefone\].*\[cpf\].*\[email\].*\[telefone\]/);
});
test('pedido_leva_regras_validadas_exemplos_e_texto_mascarado',()=>{
  const p=montarPedido(AG,['Prometer resultado.','Divulgar honorários.'],[{pergunta:'Atendem Franca? 16 98800-0101',resposta:'Sim.'}],{nome:'Renata',texto:'Meu CPF é 123.456.789-09',contato:'',destino:''});
  assert.match(p.system,/Prometer resultado\./);assert.match(p.system,/Divulgar honorários\./);
  assert.match(p.system,/assistente virtual/);assert.match(p.system,/Pedido de valores/);
  assert.match(p.system,/<exemplos_aprovados>/);assert.ok(!/98800/.test(p.system),'exemplo mascarado');
  assert.ok(!/123\.456/.test(p.usuario));assert.match(p.usuario,/<mensagem_do_contato>/);
  assert.throws(()=>montarPedido(AG,[],[],{nome:'',texto:'',contato:'',destino:''}),/sem regras validadas/);
});
test('regras_vao_agrupadas_por_tipo_nunca_sempre_com_cuidado',()=>{
  const p=montarPedido(AG,[{tipo:'obrigatorio',regra:'Se identificar como assistente virtual.'},{tipo:'proibido',regra:'Prometer resultado.'},
    {tipo:'cuidado',regra:'Falar de prazos.'},'Divulgar honorários.'],[],{nome:'Renata',texto:'Oi',contato:'',destino:''});
  const b=p.system.split('<regras_obrigatorias>')[1].split('</regras_obrigatorias>')[0];
  assert.match(b,/Nunca:\n- Prometer resultado\.\n- Divulgar honorários\.\nSempre:\n- Se identificar como assistente virtual\.\nCom cuidado:\n- Falar de prazos\./,b);
  const so=montarPedido(AG,[{tipo:'proibido',regra:'Prometer resultado.'}],[],{nome:'',texto:'Oi',contato:'',destino:''}).system;
  assert.ok(!/Sempre:|Com cuidado:/.test(so),'grupo vazio não aparece');
});
test('saida_da_ia_fora_do_formato_vira_transferencia',()=>{
  assert.deepEqual(interpretarSaida('{"acao":"responder","resposta":" Olá! ","motivo":"faq"}'),{acao:'responder',resposta:'Olá!',motivo:'faq'});
  assert.equal(interpretarSaida('não é json').acao,'transferir');
  assert.equal(interpretarSaida('{"acao":"enviar","resposta":"x","motivo":"y"}').acao,'transferir');
});
test('trava_bloqueia_valor_promessa_chance_e_se_passar_por_pessoa',()=>{
  for(const s of ['Custa R$ 2.000.','Os honorários ficam em 10% do valor.','Garantimos a redução da dívida.','Você tem 80% de chance.','Há boa chance de ganhar.','Sou a advogada responsável.','Somos melhores que outros escritórios.'])
    assert.ok(verificarResposta(s),s);
  for(const s of ['Olá! Sou o assistente virtual do escritório. Pode me dizer seu nome e cidade?','Os valores dependem da análise do caso e são apresentados pela equipe.','Agradecemos a confiança, Fernando.'])
    assert.equal(verificarResposta(s),null,s);
});
test('instagram_webhook_normaliza_direct_eco_e_comentario',()=>{
  const ev=normalizarEventoInstagram({object:'instagram',entry:[{id:'1784',time:1794312000,
    messaging:[{sender:{id:'9'},recipient:{id:'1784'},timestamp:1794312000123,message:{mid:'M1',text:'oi'}},{message:{mid:'M2',text:'eco',is_echo:true}}],
    changes:[{field:'comments',value:{id:'C1',text:'Quanto custa?',from:{id:'9',username:'ana'}}},{field:'comments',value:{id:'C2',text:'Obrigado!',from:{id:'1784'}}},{field:'mentions',value:{}}]}]});
  assert.deepEqual(ev.map(x=>[x.conta,x.ev.idExterno,x.ev.tipo]),[['1784','M1','mensagem'],['1784','M2','mensagem_enviada'],['1784','C1','comentario'],['1784','C2','comentario_proprio']]);
  assert.equal(ev[0].ev.ocorridoEm,new Date(1794312000123).toISOString());
  assert.deepEqual(normalizarEventoInstagram({object:'page',entry:[]}),[]);
});
test('assinatura_da_meta_confere_hmac_do_corpo_bruto',async()=>{
  const corpo='{"object":"instagram"}',seg='segredo-do-app',sig='sha256='+createHmac('sha256',seg).update(corpo).digest('hex');
  assert.equal(await assinaturaMetaValida(corpo,sig,seg),true);
  assert.equal(await assinaturaMetaValida(corpo+' ',sig,seg),false);
  assert.equal(await assinaturaMetaValida(corpo,null,seg),false);
  assert.equal(await assinaturaMetaValida(corpo,sig,''),false);
});
const falso=(resps)=>{const chamadas=[];const f=async(url,o={})=>{chamadas.push({url:String(url),...o});const r=resps.shift()??{status:200,json:{}};return new Response(JSON.stringify(r.json??{}),{status:r.status??200})};f.chamadas=chamadas;return f};
test('instagram_envia_direct_e_resposta_de_comentario',async()=>{
  const f=falso([{json:{message_id:'MX'}},{json:{id:'RX'}}]);const ig=criarInstagram({token:'T',versao:'v23.0',fetch:f});
  const canal={id:'c',tipo:'instagram',nome:'IG',provedor:'meta',instancia:'1784',estado:'conectado'};
  assert.equal((await ig.enviarTexto(canal,'dm:9','Olá')).idExterno,'MX');
  assert.equal(f.chamadas[0].url,'https://graph.instagram.com/v23.0/1784/messages');
  assert.deepEqual(JSON.parse(f.chamadas[0].body),{recipient:{id:'9'},message:{text:'Olá'}});
  assert.equal(f.chamadas[0].headers.authorization,'Bearer T');
  await ig.enviarTexto(canal,'comentario:C1','Te chamamos no direct!');
  assert.equal(f.chamadas[1].url,'https://graph.instagram.com/v23.0/C1/replies');
  await assert.rejects(ig.enviarTexto(canal,'avaliacao:x','a'),/não é do Instagram/);
});
test('instagram_token_expirado_vira_desconectado',async()=>{
  const ig=criarInstagram({token:'T',fetch:falso([{status:400,json:{error:{code:190}}}])});
  assert.equal((await ig.estado()).estado,'desconectado');
});
test('google_renova_token_lista_e_responde_avaliacao',async()=>{
  const f=falso([{json:{access_token:'A1',expires_in:3600}},{json:{reviews:[{reviewId:'R1'}]}},{json:{}}]);
  const g=criarGoogle({clientId:'id',clientSecret:'s',refreshToken:'rt',fetch:f});
  const canal={id:'c',tipo:'google',nome:'G',provedor:'google',instancia:'accounts/1/locations/2',estado:'conectado'};
  assert.deepEqual(await g.listarAvaliacoes(canal),[{reviewId:'R1'}]);
  assert.match(f.chamadas[0].body,/grant_type=refresh_token/);
  assert.equal(f.chamadas[1].url,'https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews?pageSize=50&orderBy=updateTime%20desc');
  await g.enviarTexto(canal,'avaliacao:accounts/1/locations/2/reviews/R1','Obrigado!');
  assert.equal(f.chamadas[2].url,'https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews/R1/reply');
  assert.equal(f.chamadas[2].method,'PUT');assert.equal(f.chamadas.length,3,'token reaproveitado');
  await assert.rejects(g.enviarTexto(canal,'avaliacao:accounts/9/locations/9/reviews/R1','x'),/não pertence/);
});
test('google_autorizacao_revogada_vira_desconectado',async()=>{
  const g=criarGoogle({clientId:'id',clientSecret:'s',refreshToken:'rt',fetch:falso([{status:400,json:{error:'invalid_grant'}}])});
  assert.equal((await g.estado()).estado,'desconectado');
});
test('destino_precisa_de_tipo_e_id',()=>{
  assert.deepEqual(partesDestino('dm:9'),{tipo:'dm',id:'9'});
  assert.deepEqual(partesDestino('avaliacao:accounts/1/locations/2/reviews/R'),{tipo:'avaliacao',id:'accounts/1/locations/2/reviews/R'});
  assert.throws(()=>partesDestino('9'));assert.throws(()=>partesDestino('dm:'));
});

test('pedido_de_humano_vai_direto_para_a_equipe_sem_ia',async()=>{
  const {pediuHumano}=await import('../../supabase/functions/_shared/ia-regras.ts');
  for(const t of ['Quero falar com um atendente','posso falar com uma pessoa?','me passa pra um humano','não quero falar com robô','quero falar com a Dra. Maria','Isso é um bot?','quero falar com alguém do escritório'])assert.equal(pediuHumano(t),true,t);
  for(const t of ['Qual o horário de atendimento?','Como funciona a análise da dívida?','Vocês atendem em Franca?','Obrigado pela ajuda'])assert.equal(pediuHumano(t),false,t);
  const d=decidirAntesDaIA(AG,{texto:'Prefiro conversar com uma pessoa'});assert.equal(d.status,'transferida');assert.match(d.motivo,/pediu para falar com uma pessoa/);
});
