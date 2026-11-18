// Testes de unidade das regras puras das Edge Functions (sem banco, sem rede).
import {test} from 'node:test';import assert from 'node:assert/strict';
import {mascararTelefone,mascararTexto,estadoDaEvolution,numeroParaEnvio,normalizarEventoEvolution,iguaisSeguro} from '../../supabase/functions/_shared/regras.ts';

test('mascarar_telefone_mantem_so_4_ultimos',()=>{
  assert.equal(mascararTelefone('+55 16 98800-0101'),'*********0101');
  assert.equal(mascararTelefone('123'),'****');
  assert.equal(mascararTelefone(null),'');
});
test('mascarar_texto_remove_cpf_cnpj_email_e_contas',()=>{
  const s=mascararTexto('CPF 123.456.789-09, CNPJ 12.345.678/0001-90, joao@x.com.br, conta 12345678');
  assert.ok(!/123\.456|12\.345\.678|joao@|12345678/.test(s),s);
  assert.match(s,/\[cpf\].*\[cnpj\].*\[email\].*\*{6}78/);
});
test('estado_da_evolution',()=>{
  assert.equal(estadoDaEvolution('open'),'conectado');
  assert.equal(estadoDaEvolution('connecting'),'aguardando_qr');
  assert.equal(estadoDaEvolution('close'),'desconectado');
  assert.equal(estadoDaEvolution('refused'),'bloqueado');
  assert.equal(estadoDaEvolution(undefined),'desconectado');
});
test('numero_para_envio_poe_ddi_55',()=>{
  assert.equal(numeroParaEnvio('(16) 98800-0101'),'5516988000101');
  assert.equal(numeroParaEnvio('+55 16 98800-0101'),'5516988000101');
  assert.throws(()=>numeroParaEnvio(''));
});
test('webhook_messages_upsert_vira_mensagem_com_data_do_provedor',()=>{
  const ev=normalizarEventoEvolution({event:'messages.upsert',instance:'homolog',data:{key:{id:'ABC',fromMe:false,remoteJid:'5516@s.whatsapp.net'},message:{conversation:'oi'},messageTimestamp:1794312000}});
  assert.equal(ev.length,1);assert.equal(ev[0].idExterno,'ABC');assert.equal(ev[0].tipo,'mensagem');
  assert.equal(ev[0].ocorridoEm,new Date(1794312000*1000).toISOString());
});
test('webhook_mensagem_do_proprio_numero_e_status_tem_tipos_proprios',()=>{
  assert.equal(normalizarEventoEvolution({event:'MESSAGES_UPSERT',data:{key:{id:'X',fromMe:true}}})[0].tipo,'mensagem_enviada');
  const st=normalizarEventoEvolution({event:'messages.update',data:[{keyId:'X',status:'READ'},{keyId:'X',status:'DELIVERY_ACK'}]});
  assert.deepEqual(st.map(e=>e.tipo),['status:read','status:delivery_ack']);
});
test('webhook_conexao_traz_estado',()=>{
  const [e]=normalizarEventoEvolution({event:'connection.update',data:{state:'close'},date_time:'2026-11-10T10:00:00.000Z'});
  assert.equal(e.tipo,'conexao');assert.equal(e.estado,'desconectado');
});
test('webhook_evento_desconhecido_e_ignorado',()=>{
  assert.deepEqual(normalizarEventoEvolution({event:'presence.update',data:{}}),[]);
  assert.deepEqual(normalizarEventoEvolution(null),[]);
});
test('comparacao_de_segredo',()=>{
  assert.equal(iguaisSeguro('abc123','abc123'),true);
  assert.equal(iguaisSeguro('abc123','abc124'),false);
  assert.equal(iguaisSeguro('',''),false);
});
