// Integração do Passo 1: o código real das Edge Functions (processos.ts) contra as migrações reais (PGlite),
// com um WhatsApp simulado. Reproduz o "Pronto quando" do passo 1 do plano.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {bancoLocal,bancoServico} from '../banco-local.mjs';
import {processarFila,verificarSaude,receberWebhook} from '../../supabase/functions/_shared/processos.ts';
import {criarSimulado} from '../../supabase/functions/_shared/adaptador.ts';

const silenciar=()=>{const l=console.log,e=console.error;console.log=console.error=()=>{};return()=>{console.log=l;console.error=e}};

test('passo 1: canal cai, nada se perde, reconecta sem duplicar, webhook repetido é ignorado',async()=>{
  const db=await bancoLocal(),banco=bancoServico(db);
  await db.exec(`insert into crm.canais(tipo,nome,numero,provedor,instancia,principal,estado) values ('whatsapp','WhatsApp homologação','+55 16 90000-0001','simulado','homolog',true,'conectado');
    insert into crm.atendimentos(conversa_ref,fila_ref) values ('c1',null)`);
  const T=(await db.query(`select id from crm.atendimentos`)).rows[0].id;
  const zap=criarSimulado({estado:'desconectado'});const avisos=[];let esperas=0;
  const deps={banco,adaptador:()=>zap,esperar:async()=>{esperas++}};
  const volta=silenciar();
  try{
    // 1) canal derrubado: estado gravado, alerta crítico e aviso à gestão
    let s=await verificarSaude({...deps,notificar:async t=>{avisos.push(t)}});
    assert.equal(s.mudancas.length,1);assert.ok(avisos[0]?.includes('🔴'),'gestão avisada');
    // 2) atendente envia 3 mensagens com o canal fora: ficam na fila
    for(const [i,x] of ['Bom dia!','Recebi o contrato.','Retorno até 15h.'].entries())
      await db.query(`select crm.enfileirar_mensagem($1,$2,$3,null,'+55 16 98800-0101')`,[x,'k'+i,T]);
    let f=await processarFila(deps);
    assert.equal(f.enviadas,0);assert.equal(zap.enviadas.length,0);
    assert.equal((await db.query(`select count(*)::int n from crm.saida_mensagens where estado='pendente'`)).rows[0].n,3,'nenhuma mensagem perdida');
    // 3) reconecta: fila esvaziada, em ordem, com intervalo entre envios, sem duplicar
    zap.estado=async()=>({estado:'conectado'});
    s=await verificarSaude(deps);assert.equal(s.mudancas.length,1);
    assert.equal((await db.query(`select count(*)::int n from crm.alertas where tipo='canal_caiu' and resolvido_em is null`)).rows[0].n,0,'alerta resolvido');
    f=await processarFila(deps);
    assert.equal(f.enviadas,3);assert.deepEqual(zap.enviadas.map(e=>e.texto),['Bom dia!','Recebi o contrato.','Retorno até 15h.']);
    assert.equal(esperas,2,'intervalo entre envios');
    f=await processarFila(deps);assert.equal(f.lote,0);assert.equal(zap.enviadas.length,3,'segunda rodada não reenvia');
    // 4) provedor falhando: tentativa registrada, mensagem continua na fila
    const ruim=criarSimulado({falhar:true});
    await db.query(`select crm.enfileirar_mensagem('Tudo certo?','k9',$1,null,'+55 16 98800-0101')`,[T]);
    f=await processarFila({...deps,adaptador:()=>ruim});assert.equal(f.falhas,1);
    let m=(await db.query(`select estado,tentativas,erro from crm.saida_mensagens where chave_idempotencia='k9'`)).rows[0];
    assert.equal(m.estado,'pendente');assert.equal(m.tentativas,1);assert.match(m.erro,/falha simulada/);
    // 5) sem número de destino e sem vínculo com a conversa: falha explicada (depende do passo 2)
    await db.query(`select crm.enfileirar_mensagem('Sem destino','k10',$1)`,[T]);
    await processarFila(deps);
    m=(await db.query(`select erro from crm.saida_mensagens where chave_idempotencia='k10'`)).rows[0];assert.match(m.erro,/crm_0008/);
    // 6) webhook: mesmo evento duas vezes → gravado uma vez; conexão muda o estado na hora
    const msg={event:'messages.upsert',instance:'homolog',data:{key:{id:'WA-1',fromMe:false},message:{conversation:'oi'},messageTimestamp:1794312000}};
    assert.deepEqual(await receberWebhook(deps,msg).then(r=>[r.novos,r.repetidos]),[1,0]);
    assert.deepEqual(await receberWebhook(deps,msg).then(r=>[r.novos,r.repetidos]),[0,1]);
    assert.equal((await db.query(`select count(*)::int n from crm.webhook_eventos where tipo='mensagem'`)).rows[0].n,1);
    await receberWebhook(deps,{event:'connection.update',instance:'homolog',data:{state:'close'},date_time:'2026-11-10T13:00:00Z'});
    assert.equal((await db.query(`select estado from crm.canais`)).rows[0].estado,'desconectado');
    assert.equal((await receberWebhook(deps,{event:'messages.upsert',instance:'outra',data:{}})).canal,null,'instância desconhecida ignorada');
  }finally{volta()}
});

test('parte 5: reconectar pela tela com o banco real (QR pedido → verificar → conectado, com histórico)',async()=>{
  const {conectarCanal}=await import('../../supabase/functions/_shared/canais.ts');
  const db=await bancoLocal(),banco=bancoServico(db);
  const id=(await db.query(`insert into crm.canais(tipo,nome,provedor,instancia,principal,estado) values ('whatsapp','WhatsApp teste','simulado','t1',true,'desconectado') returning id`)).rows[0].id;
  const zap=criarSimulado({estado:'desconectado'});
  const deps={ehLider:async()=>true,nome:async()=>'Ana',rpc:banco.rpc,adaptador:()=>zap,
    canal:async i=>(await db.query(`select id,tipo,nome,provedor,instancia,estado,ativo from crm.canais where id=$1`,[i])).rows[0]??null};
  let r=await conectarCanal(deps,'Bearer TK',{canal_id:id,acao:'qr'});
  assert.equal(r.corpo.codigo,'SIMULADO');
  assert.equal((await db.query(`select estado from crm.canais where id=$1`,[id])).rows[0].estado,'aguardando_qr');
  r=await conectarCanal(deps,'Bearer TK',{canal_id:id,acao:'verificar'});
  assert.deepEqual([r.corpo.estado,r.corpo.mudou],['conectado',true]);
  const ev=(await db.query(`select para,detalhe from crm.canal_eventos where canal_id=$1 order by id`,[id])).rows;
  assert.deepEqual(ev.slice(-2),[{para:'aguardando_qr',detalhe:'QR Code pedido por Ana'},{para:'conectado',detalhe:'verificação pedida por Ana · simulado'}]);
});
