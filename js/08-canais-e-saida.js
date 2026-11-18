/* ===== Passo 1 do plano de robustez: canais, fila de saída e saúde =====
   Demonstração: simulação no navegador do que as migrações crm_0009–0012 e as Edge Functions fazem de verdade.
   Conectado (parte 5, crm_0022): canais, histórico, fila de saída, eventos dos canais, alertas e relatório vêm do banco,
   atualizados a cada minuto; "Reconectar (QR Code)" e "Verificar agora" passam pela Edge Function canais-conectar
   (líder ou administrador); cadastro de canais e plano B (trocar o principal) só pelo administrador.
   As conversas continuam de demonstração até o passo 2: a bolha de uma conversa de demonstração usa a fila local,
   mas com o estado REAL do canal.
   - faixa com o estado de cada canal (sempre com texto, não só cor) e histórico ao clicar;
   - toda mensagem enviada entra na FILA DE SAÍDA; a bolha mostra relógio (na fila), ✓✓ (enviada) ou alerta (falhou);
   - com o canal fora, nada se perde: a fila espera e esvazia sozinha ao reconectar, sem duplicar;
   - repetição com espera crescente (30 s, 2 min, 10 min, 1 h; na demonstração acelerada 30×) e, na 5ª falha, Reenviar/Cancelar;
   - painel de saúde do admin (canais, fila, eventos dos canais, alertas, relatório do dia). */
const CN_ROT={conectado:['ok','🟢','Conectado'],instavel:['warn','🟡','Instável'],desconectado:['bad','🔴','Desconectado'],aguardando_qr:['bad','🔴','Aguardando QR Code'],bloqueado:['pause','⚫','Bloqueado']};
const CN_TIPO={whatsapp:'WhatsApp',instagram:'Instagram',google:'Google Meu Negócio'};
const CN_PROV={whatsapp:[['evolution','Evolution (QR Code)'],['simulado','Simulado (teste, nada é enviado)']],instagram:[['meta','Meta (Graph API)'],['simulado','Simulado (teste, nada é enviado)']],google:[['google','Google (Perfil da Empresa)'],['simulado','Simulado (teste, nada é enviado)']]};
const CHN=SB.ligado()?[]:[
 {id:'wa',tipo:'whatsapp',nome:'WhatsApp do escritório',numero:'+55 16 9XXXX-0001',estado:'conectado',ativo:true,principal:true,ult:Date.now()-3*60000,sil:120,verif:Date.now()},
 {id:'wa2',tipo:'whatsapp',nome:'WhatsApp reserva (plano B)',numero:'+55 16 9XXXX-0002',estado:'desconectado',ativo:false,reserva:true,ult:null,sil:120,verif:null},
 {id:'ig',tipo:'instagram',nome:'Instagram',numero:'@nevespadua',estado:'conectado',ativo:true,principal:true,ult:Date.now()-25*60000,sil:240,verif:Date.now()},
 {id:'gmn',tipo:'google',nome:'Google Meu Negócio',numero:'Perfil do escritório',estado:'conectado',ativo:true,principal:true,ult:Date.now()-140*60000,sil:720,verif:Date.now()}];
const CHEV=SB.ligado()?[]:[{c:'wa',de:'aguardando_qr',para:'conectado',h:'08:02',det:'QR Code lido no celular oficial'},{c:'ig',de:'desconectado',para:'conectado',h:'08:00',det:'verificação de saúde'},{c:'gmn',de:'desconectado',para:'conectado',h:'08:00',det:'verificação de saúde'}];
const SAIDA=[];   // fila local das conversas de demonstração
const SAIDA_SIM={falhar:false,acel:30,max:5};
const WHK=SB.ligado()?[]:[
 {id:1,canal:'wa',ext:'3EB0C4F1',tipo:'mensagem',h:'09:14',cli:'Marcos Tavares',st:'ok',rep:1},
 {id:2,canal:'wa',ext:'3EB0D912',tipo:'mensagem',h:'09:55',cli:'Renata Souza',st:'ok',rep:0},
 {id:3,canal:'wa',ext:'3EB0E077',tipo:'status:read',h:'09:56',cli:'Renata Souza',st:'ok',rep:2},
 {id:4,canal:'wa',ext:'3EB0F310',tipo:'mensagem',h:'10:00',cli:'+55 16 99xxx-0142',st:'erro',erro:'conversa ainda não vinculada (passo 2)',rep:0}];
const ALERTAS_ENVIADOS=[];
const CNUI={pop:null,qr:null,aberto:false,edit:null,troca:null};
/* conectado: o que veio do banco */
const CN={carregado:false,erro:'',em:null,fila:[],saude:null,saudeErro:'',saudeEm:null,carregandoSaude:false,qr:null};
/* fecha o histórico do canal ao clicar fora */
document.addEventListener('click',e=>{if((CNUI.pop||CNUI.aberto)&&!e.target.closest('#canais,#cnresumo,.modal')){CNUI.pop=null;CNUI.aberto=false;renderCanais()}});
const canal=id=>CHN.find(x=>x.id===id);
const canalDoTipo=t=>CHN.find(x=>x.tipo===t&&x.principal&&x.ativo);
const minDesde=ts=>ts==null?null:Math.max(0,Math.floor((Date.now()-ts)/60000));
const relMin=ts=>{const m=minDesde(ts);return m==null?'nunca':m<1?'agora':m<60?'há '+m+' min':'há '+fmt(m)};
const msDe=s=>s?Date.parse(s):null;
const cnHora=s=>{if(!s)return '—';const d=new Date(s);if(isNaN(d))return '—';const h=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  return d.toDateString()===new Date().toDateString()?h:d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+h};
function emHorario(d=new Date()){const s=new Date(d.toLocaleString('en-US',{timeZone:'America/Sao_Paulo'})),w=s.getDay(),h=s.getHours();return w>=1&&w<=5&&h>=8&&h<18}
/* conectado: o banco calcula o "instável" (crm.canais_status, horário em crm.config 'horario_canais') */
function estadoExibido(ch){if(SB.ligado())return ch.exib||ch.estado;return ch.estado==='conectado'&&emHorario()&&minDesde(ch.ult)>ch.sil?'instavel':ch.estado}
const podeCanal=()=>S.role==='admin'||S.role==='lider';
const temQr=ch=>ch&&ch.tipo==='whatsapp'&&(!SB.ligado()||ch.provedor==='evolution'||ch.provedor==='simulado');
function waDown(){const w=canalDoTipo('whatsapp');return !w||w.estado!=='conectado'}
/* fila de saída exibida: a do banco (conectado) ou a local (demonstração) */
const filaAtual=()=>SB.ligado()?CN.fila:SAIDA;
const filaDe=(k,canalId)=>filaAtual().filter(s=>s.estado===k&&(!canalId||s.canal===canalId));

/* ---- banco (conectado) ---- */
const cnDoBanco=r=>({id:r.id,tipo:r.tipo,nome:r.nome,numero:r.numero||'',estado:r.estado,exib:r.estado_exibido,ativo:!!r.ativo,principal:!!r.principal,reserva:!!r.reserva,
  provedor:r.provedor,instancia:r.instancia||'',sil:r.silencio_max_min,ult:msDe(r.ultima_mensagem_recebida_em),verif:msDe(r.ultima_verificacao_em)});
const filaDoBanco=s=>({id:s.id,canal:s.canal_id,estado:s.estado==='enviando'?'pendente':s.estado,enviando:s.estado==='enviando',cli:s.destino||s.conversa_ref||'—',x:s.conteudo||'',
  tent:s.tentativas||0,erro:s.erro||'',origem:s.origem,criado:msDe(s.created_at),prox:msDe(s.proxima_tentativa_em),banco:true});
DB.canais={
  async carregar(){if(!SB.ligado()||!SB.sessao)return;
    try{const [L,F]=await Promise.all([
        SB.sel('canais_status','select=id,tipo,nome,numero,provedor,instancia,estado,estado_exibido,ativo,principal,reserva,silencio_max_min,ultima_mensagem_recebida_em,ultima_verificacao_em&order=tipo,nome'),
        SB.sel('saida_mensagens','select=id,canal_id,estado,conteudo,destino,conversa_ref,tentativas,erro,origem,created_at,proxima_tentativa_em&estado=in.(pendente,enviando,falhou)&order=created_at&limit=200')]);
      const antes=cnAssinatura();CHN.splice(0,CHN.length,...(L||[]).map(cnDoBanco));CN.fila=(F||[]).map(filaDoBanco);CN.carregado=true;CN.erro='';CN.em=Date.now();
      return antes!==cnAssinatura()}   // true quando algum canal mudou (a caixa de mensagem precisa redesenhar)
    catch(e){CN.erro=e.message;return false}},
  async eventos(id){const L=await SB.sel('canal_eventos','select=de,para,detalhe,criado_em&canal_id=eq.'+encodeURIComponent(id)+'&order=criado_em.desc&limit=8');
    CHEV.splice(0,CHEV.length,...CHEV.filter(x=>x.c!==id),...(L||[]).map(x=>({c:id,de:x.de,para:x.para,h:cnHora(x.criado_em),det:x.detalhe||''})))},
  async saude(){if(!SB.ligado()||!SB.sessao)return;CN.carregandoSaude=true;
    try{const [r,w,a,d]=await Promise.all([SB.rpc('saude_resumo'),
        SB.sel('webhook_eventos','select=id,canal_id,id_externo,tipo,recebido_em,processado_em,tentativas,erro&order=recebido_em.desc&limit=20'),
        SB.sel('alertas','select=id,tipo,nivel,mensagem,aberto_em,resolvido_em,notificado_em&order=aberto_em.desc&limit=10'),
        SB.rpc('relatorio_diario',{})]);
      CN.saude={r:r||{},whk:w||[],alertas:a||[],dia:d||{}};CN.saudeErro='';CN.saudeEm=Date.now()}
    catch(e){CN.saudeErro=e.message}
    finally{CN.carregandoSaude=false}},
  conectar:(id,acao)=>SB.funcao('canais-conectar',{canal_id:id,acao}),
  async salvar(d){const id=await SB.rpc('canal_salvar',{p_id:d.id||null,p_tipo:d.tipo,p_nome:d.nome,p_numero:d.numero||null,p_instancia:d.instancia||null,
      p_provedor:d.provedor,p_silencio_max_min:+d.sil,p_reserva:!!d.reserva});await DB.canais.carregar();return id},
  async ativar(id,on){await SB.rpc('canal_ativar',{p_id:id,p_ativo:!!on});return DB.canais.carregar()},
  async tornarPrincipal(id){const n=await SB.rpc('canal_tornar_principal',{p_id:id});await DB.canais.carregar();return n},
  async reenviar(id){await SB.rpc('saida_reenviar',{p_id:id});return DB.canais.carregar()},
  async cancelar(id){await SB.rpc('saida_cancelar',{p_id:id});return DB.canais.carregar()},
  async reprocessar(id){await SB.rpc('webhook_reprocessar',{p_id:+id});return DB.canais.saude()},
  async alertaVisto(id){await SB.rpc('alerta_visto',{p_id:+id});return DB.canais.saude()}
};
/* ação da tela: grava, recarrega e redesenha; no erro, recarrega para desfazer o que a tela mudou */
function cnAcao(p,msg){return Promise.resolve(p).then(r=>{redesenharCanais();if(msg)toast(typeof msg==='function'?msg(r):msg);return r},
  e=>{const m=e&&e.message||String(e);DB.canais.carregar().catch(()=>{}).then(()=>{redesenharCanais();toast(m)})})}
function redesenharCanais(){renderAll()}
const cnAssinatura=()=>CHN.map(c=>c.id+c.estado+c.exib+c.ativo+c.principal).join('|');

/* ---- mudança de estado na demonstração (o mesmo que crm.registrar_estado_canal + gatilho de eventos) ---- */
function mudarCanal(id,para,det){const ch=canal(id);if(!ch||ch.estado===para)return;CHEV.unshift({c:id,de:ch.estado,para,h:nowT(),det:det||''});ch.estado=para;ch.verif=Date.now();
  if(para!=='conectado'&&ch.principal)avisarGestao(`🔴 ${ch.nome} está ${CN_ROT[para][2].toLowerCase()}. As mensagens ficam na fila até reconectar.`);
  if(para==='conectado'&&ch.principal)avisarGestao(`🟢 ${ch.nome} voltou. A fila de saída está sendo esvaziada.`);
  renderAll()}
function avisarGestao(t){ALERTAS_ENVIADOS.unshift({h:nowT(),t})}

/* ---- fila de saída local (o mesmo que crm.enfileirar_mensagem / saida_*) ---- */
DB.enfileirar=item=>{SAIDA.push(item);return item};
DB.reenviar=id=>{const s=SAIDA.find(x=>x.id===id);if(s&&s.estado==='falhou'){s.estado='pendente';s.tent=0;s.prox=Date.now();s.erro='';s.m.st='pendente';return true}return false};
DB.cancelarEnvio=id=>{const s=SAIDA.find(x=>x.id===id);if(s&&(s.estado==='pendente'||s.estado==='falhou')){s.estado='cancelada';s.m.st='cancelada';return true}return false};
function enfileirarSaida(c,m,origem){
  const ch=canalDoTipo(c.canal);if(!ch){toast('Nenhum canal ativo para '+CANAIS[c.canal][0]+'. Fale com o administrador.');return false}
  if(m.x&&SAIDA.some(s=>s.c===c.id&&s.x===m.x&&s.estado!=='cancelada'&&Date.now()-s.criado<60000)){toast('A mesma mensagem foi enviada a este cliente há menos de 1 minuto. Aguarde para repetir.');return false}
  const id=uid('out');m.sid=id;m.st='pendente';
  DB.enfileirar({id,c:c.id,cli:c.name,m,x:m.x||(m.media?'['+(MK[m.media.k]||'Arquivo')+'] '+m.media.n:''),canal:ch.id,estado:'pendente',tent:0,prox:Date.now(),erro:'',origem:origem||'manual',criado:Date.now(),chave:c.id+':'+id});
  if(ch.estado!=='conectado')toast(`${ch.nome} está ${CN_ROT[ch.estado][2].toLowerCase()}: a mensagem ficou na fila e sai sozinha quando reconectar.`);
  return true}
const esperaSeg=t=>[30,120,600,3600][Math.min(Math.max(t,1),4)-1];
let _ultEnvio=0;
function processarSaida(){
  const agora=Date.now();if(agora-_ultEnvio<1500)return; // intervalo mínimo entre envios do mesmo número
  const s=SAIDA.filter(x=>x.estado==='pendente'&&x.prox<=agora&&(canal(x.canal)||{}).estado==='conectado').sort((a,b)=>a.prox-b.prox)[0];
  if(!s)return;_ultEnvio=agora;s.tent++;
  if(SAIDA_SIM.falhar){s.erro='provedor não respondeu (simulado)';
    if(s.tent>=SAIDA_SIM.max){s.estado='falhou';s.m.st='falhou';avisarGestao(`🟡 Mensagem para ${s.cli} não foi enviada após ${SAIDA_SIM.max} tentativas.`)}
    else{s.prox=agora+esperaSeg(s.tent)*1000/SAIDA_SIM.acel}}
  else{s.estado='enviada';s.m.st='enviada';s.enviada=agora;s.erro=''}
  atualizarBolha(s);renderCanais();if(S.view==='cfg'&&!SB.ligado())renderSettings()}
setInterval(processarSaida,500);
setInterval(()=>{if(!S.auth)return;
  if(!SB.ligado()){renderCanais();return}
  DB.canais.carregar().then(mudou=>{if(mudou&&!CNUI.edit)renderAll();else{renderCanais();if(S.view==='rel')renderReports()}});
  if(S.view==='cfg'&&S.role==='admin'&&S.cfgAba==='saude')DB.canais.saude().then(()=>{if(S.view==='cfg'&&!CNUI.edit)renderSettings()})},SB.ligado()?60000:30000);

/* ---- bolha: estado do envio ---- */
const IC_REL='<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.3 1.4" stroke-linecap="round"/></svg>';
const IC_ERR='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.3v4.6M8 11.2v.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
function saidaTick(m){
  const st=m.st||'enviada',d=m.sid?` data-tk="${m.sid}"`:'';
  if(st==='pendente')return `<span class="tk pend" title="Na fila de saída: sai quando o canal estiver conectado"${d}>${IC_REL}</span>`;
  if(st==='falhou')return `<span class="tk fail" title="Não enviada"${d}>${IC_ERR}</span>`;
  if(st==='cancelada')return `<span class="tk canc" title="Envio cancelado"${d}>cancelada</span>`;
  return `<span class="tk" title="Enviada"${d}>✓✓</span>`}
function saidaAcoes(m){
  if(!m.sid)return '';const s=SAIDA.find(x=>x.id===m.sid);
  const inner=s&&s.estado==='falhou'?`<span class="sa-err">Não enviada: ${esc(s.erro||'erro')}</span><button type="button" class="btn" data-cn="re" data-id="${s.id}">Reenviar</button><button type="button" class="btn" data-cn="cancel" data-id="${s.id}">Cancelar</button>`
    :s&&s.estado==='pendente'&&s.tent>0?`<span class="sa-wait">Tentativa ${s.tent} falhou · nova tentativa em instantes</span>`:'';
  return `<div class="sacts" data-sa="${m.sid}">${inner}</div>`}
function atualizarBolha(s){
  const box=$('#msgs'),noFim=box&&box.scrollHeight-box.scrollTop-box.clientHeight<140;
  const t=document.querySelector(`[data-tk="${s.id}"]`);if(t)t.outerHTML=saidaTick(s.m);
  const a=document.querySelector(`[data-sa="${s.id}"]`);if(a)a.outerHTML=saidaAcoes(s.m);
  if(noFim)box.scrollTop=box.scrollHeight}
function avisoCanalComposer(c){const ch=canalDoTipo(c.canal);if(!ch||ch.estado==='conectado')return '';
  const n=filaDe('pendente',ch.id).length;
  return `<div class="cn-aviso" role="status">${CN_ROT[ch.estado][1]} <b>${esc(ch.nome)} ${esc(CN_ROT[ch.estado][2].toLowerCase())}.</b> O que você enviar fica na fila${n?` (${n} aguardando)`:''} e sai sozinho quando a conexão voltar.</div>`}

/* ---- faixa de estado dos canais ---- */
/* Com tudo em ordem, a faixa some e fica só o resumo no cabeçalho ("Canais ok"); ela volta sozinha quando algo cai. */
function problemasCanais(){return CHN.filter(c=>c.ativo&&estadoExibido(c)!=='conectado')}
function renderCanais(){
  const el=$('#canais');if(!el)return;
  const probs=problemasCanais(),pend=filaDe('pendente').length,fal=filaDe('falhou').length;
  const semCanais=SB.ligado()&&CN.carregado&&!CHN.some(c=>c.ativo);
  const rs=$('#cnresumo');
  if(rs){const pior=probs.find(c=>CN_ROT[estadoExibido(c)][0]==='bad')||probs[0];
    rs.className='chip cn-resumo'+(pior?' '+CN_ROT[estadoExibido(pior)][0]:semCanais||CN.erro?' warn':'')+(CNUI.aberto?' on':'');
    rs.setAttribute('aria-expanded',String(!!CNUI.aberto||!!probs.length));
    rs.innerHTML=pior?`${CN_ROT[estadoExibido(pior)][1]} ${probs.length===1?esc(pior.nome)+' · '+CN_ROT[estadoExibido(pior)][2].toLowerCase():probs.length+' canais com problema'}`
      :SB.ligado()&&!CN.carregado?(CN.erro?'Canais: sem leitura':'<span class="d"></span>Canais…')
      :semCanais?'Nenhum canal ativo'
      :`<span class="d"></span>Canais ok${pend?` · ${pend} na fila`:''}${fal?` · ${fal} com falha`:''}`;
    rs.title='Estado dos canais e da fila de saída'}
  el.hidden=!probs.length&&!CNUI.aberto&&!CNUI.pop;
  const chips=CHN.filter(c=>c.ativo).map(c=>{const e=estadoExibido(c),[k,ic,rot]=CN_ROT[e];
    return `<button type="button" class="cn-chip ${k}${CNUI.pop===c.id?' on':''}" data-cn="pop" data-id="${c.id}" aria-expanded="${CNUI.pop===c.id}">${ic} <b>${esc(c.nome)}</b> · ${rot}<span class="cn-ult"> · última mensagem ${relMin(c.ult)}</span></button>`}).join('');
  const fila=pend||fal?`<span class="cn-fila">Fila de saída: ${pend} aguardando${fal?` · <b>${fal} com falha</b>`:''}</span>`:'';
  const vazio=SB.ligado()&&CN.erro?`<span class="cn-fila">Não foi possível ler os canais: ${esc(CN.erro)}</span>`
    :semCanais?`<span class="cn-fila">Nenhum canal ativo cadastrado.${S.role==='admin'?' Cadastre em Configurações → Saúde.':' Fale com o administrador.'}</span>`:'';
  let pop='';const ch=CNUI.pop&&canal(CNUI.pop);
  if(ch){const e=estadoExibido(ch),ev=CHEV.filter(x=>x.c===ch.id).slice(0,6);
    const acoes=SB.ligado()
      ?`${temQr(ch)&&ch.estado!=='conectado'?`<button type="button" class="btn pri" data-cn="qr" data-id="${ch.id}">Reconectar (QR Code)</button>`:''}<button type="button" class="btn" data-cn="verificar" data-id="${ch.id}">Verificar agora</button>`
      :`${ch.estado!=='conectado'?`<button type="button" class="btn pri" data-cn="qr" data-id="${ch.id}">Reconectar (QR Code)</button>`:''}
        <span class="src" style="align-self:center">Simular:</span>${ch.estado==='conectado'?`<button type="button" class="btn" data-cn="cair" data-id="${ch.id}">queda da sessão</button><button type="button" class="btn" data-cn="bloq" data-id="${ch.id}">número bloqueado</button><button type="button" class="btn" data-cn="sil" data-id="${ch.id}">silêncio de 3 h</button>`:''}`;
    pop=`<div class="cn-pop" role="region" aria-label="Histórico do canal"><div class="row"><b>${esc(ch.nome)}</b><span class="src">${esc(ch.numero)} · verificado ${relMin(ch.verif)}</span><span style="flex:1"></span><button type="button" class="xbtn" data-cn="pop" data-id="${ch.id}" aria-label="Fechar">×</button></div>
      ${e==='instavel'?`<p class="src" style="margin:0">Conectado, mas sem receber nada ${relMin(ch.ult)} em horário comercial (o normal é até ${fmt(ch.sil)}). Confira o celular oficial.</p>`:''}
      <table><thead><tr><th>Hora</th><th>De</th><th>Para</th><th>Detalhe</th></tr></thead><tbody>${ev.map(evLinha).join('')||`<tr><td colspan="4" class="src">${SB.ligado()&&!CN.ev?.[ch.id]?'Carregando…':'Sem mudanças registradas.'}</td></tr>`}</tbody></table>
      ${podeCanal()?`<div class="hb">${acoes}</div>`:'<p class="src" style="margin:0">Para reconectar, chame o líder ou o administrador.</p>'}</div>`}
  el.innerHTML=`<div class="cn-row">${chips}${fila}${vazio}</div>${pop}`;
}
CN.ev={};
const evLinha=x=>x.de===x.para?`<tr><td>${esc(x.h)}</td><td colspan="2" class="src">${CN_ROT[x.para]?CN_ROT[x.para][1]+' '+esc(CN_ROT[x.para][2]):''} · sem mudança de estado</td><td class="src">${esc(x.det)}</td></tr>`
  :`<tr><td>${esc(x.h)}</td><td>${esc(x.de&&CN_ROT[x.de]?CN_ROT[x.de][2]:'—')}</td><td>${CN_ROT[x.para]?CN_ROT[x.para][1]+' '+esc(CN_ROT[x.para][2]):esc(x.para)}</td><td class="src">${esc(x.det)}</td></tr>`;

/* ---- modais (QR Code, cadastro de canal, plano B): ficam fora das seções e valem em qualquer tela ---- */
function qrIlustrativo(){
  // QR ilustrativo: três quadrados de canto + padrão fixo (não é um QR válido)
  let cells='';for(let i=0;i<441;i++){const x=i%21,y=Math.floor(i/21),cx=x<7?x:x>13?x-14:-1,cy=y<7?y:y>13?y-14:-1;
    const canto=cx>=0&&cy>=0&&!(x>13&&y>13),on=canto?(cx===0||cx===6||cy===0||cy===6||(cx>=2&&cx<=4&&cy>=2&&cy<=4)):(x*7+y*13+x*y)%5<2;
    cells+=`<i${on?' class="on"':''}></i>`}
  return `<div class="qr" aria-hidden="true">${cells}</div>`}
function qrModal(){const ch=CNUI.qr&&canal(CNUI.qr);if(!ch)return '';
  const instr='No celular do número: WhatsApp → Aparelhos conectados → Conectar aparelho, e aponte para o código.';
  if(!SB.ligado())return `<div class="modal" role="dialog" aria-modal="true" aria-label="Reconectar ${esc(ch.nome)}"><div class="box" style="max-width:420px"><h3>Reconectar · ${esc(ch.nome)}</h3>
   <p class="src" style="margin:0">${instr} (Simulação: o QR real vem da Evolution.)</p>${qrIlustrativo()}
   <div class="hb"><button type="button" class="btn pri" data-cn="qrok" data-id="${ch.id}">Simular leitura do QR Code</button><button type="button" class="btn" data-cn="qrno">Cancelar</button></div></div></div>`;
  const q=CN.qr||{};
  const corpo=q.carregando?'<p class="src" style="margin:0">Pedindo o QR Code à Evolution…</p>'
    :q.erro?`<p class="fx-aviso" style="margin:0">${esc(q.erro)}</p>`
    :q.qr?`<img class="qr-img" src="${esc(q.qr)}" alt="QR Code para conectar ${esc(ch.nome)}">`
    :q.codigo==='SIMULADO'?'<p class="src" style="margin:0">Canal de teste (simulado): não há QR Code. A próxima verificação já encontra o canal conectado.</p>':'';
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Reconectar ${esc(ch.nome)}"><div class="box" style="max-width:440px"><h3>Reconectar · ${esc(ch.nome)}</h3>
   <p class="src" style="margin:0">${instr} O código vale por cerca de 40 segundos; se vencer, gere outro.</p>${corpo}
   ${q.codigo&&q.codigo!=='SIMULADO'?`<p class="src" style="margin:0">Ou conecte pelo código de pareamento: <b class="qr-cod">${esc(q.codigo)}</b> (WhatsApp → Aparelhos conectados → Conectar com número de telefone).</p>`:''}
   <p class="src" role="status" style="margin:0">${q.carregando?'':'Esperando a leitura… esta janela fecha sozinha quando o canal conectar.'}</p>
   <div class="hb"><button type="button" class="btn" data-cn="qrnovo" data-id="${ch.id}"${q.carregando?' disabled':''}>Gerar novo código</button><button type="button" class="btn" data-cn="qrno">Fechar</button></div></div></div>`}
function canalForm(){const d=CNUI.edit;if(!d)return '';const novo=!d.id,provs=CN_PROV[d.tipo]||[];
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="${novo?'Novo canal':'Editar canal'}"><div class="box" style="max-width:520px"><h3>${novo?'Novo canal':'Editar · '+esc(d.nome)}</h3>
   ${novo?`<label>Tipo<select id="cnf-tipo" data-cnf="tipo">${Object.keys(CN_TIPO).map(t=>`<option value="${t}"${d.tipo===t?' selected':''}>${CN_TIPO[t]}</option>`).join('')}</select></label>`:`<p class="src" style="margin:0">${CN_TIPO[d.tipo]}</p>`}
   <label>Nome na tela<input id="cnf-nome" maxlength="60" value="${esc(d.nome)}" placeholder="Ex.: WhatsApp do escritório"></label>
   <label>${d.tipo==='whatsapp'?'Número':d.tipo==='instagram'?'Perfil':'Perfil da empresa'} <span class="src">(só para exibir)</span><input id="cnf-num" maxlength="40" value="${esc(d.numero)}" placeholder="${d.tipo==='whatsapp'?'+55 16 9XXXX-XXXX':d.tipo==='instagram'?'@perfil':'Nome do perfil'}"></label>
   <label>Provedor<select id="cnf-prov" data-cnf="prov">${provs.map(([v,l])=>`<option value="${v}"${d.provedor===v?' selected':''}>${l}</option>`).join('')}</select></label>
   ${d.provedor==='evolution'?`<label>Instância na Evolution <span class="src">(o nome exato, sem a apikey)</span><input id="cnf-inst" maxlength="60" value="${esc(d.instancia)}" placeholder="escritorio"></label>`
     :`<label>Identificador <span class="src">(opcional)</span><input id="cnf-inst" maxlength="60" value="${esc(d.instancia)}"></label>`}
   <label>Avisar quando ficar sem receber mensagens por (min) <span class="src">· em horário comercial; Google: use 10080 (7 dias)</span><input id="cnf-sil" type="number" min="10" max="10080" value="${esc(String(d.sil))}"></label>
   <label class="src"><input type="checkbox" id="cnf-res"${d.reserva?' checked':''}> Número reserva (plano B)</label>
   ${novo?'<p class="src" style="margin:0">O canal nasce desligado. Depois de salvar: conecte (QR Code), ligue a verificação e, se for o caso, torne-o principal.</p>':''}
   <div class="hb"><button type="button" class="btn pri" data-cn="cnsalvar">Salvar</button><button type="button" class="btn" data-cn="cnfechar">Cancelar</button></div></div></div>`}
function trocaModal(){const ch=CNUI.troca&&canal(CNUI.troca);if(!ch)return '';const atual=canalDoTipo(ch.tipo),n=atual?filaAtual().filter(s=>s.canal===atual.id).length:0;
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Tornar principal"><div class="box" style="max-width:480px"><h3>Tornar principal · ${esc(ch.nome)}</h3>
   <p style="margin:0">${esc(ch.nome)} passa a enviar todas as mensagens de ${CN_TIPO[ch.tipo]}.${atual?` <b>${esc(atual.nome)}</b> é desligado${n?` e as ${n} mensagem(ns) da fila dele saem pelo novo canal`:''}.`:''}</p>
   ${ch.estado!=='conectado'?`<p class="fx-aviso" style="margin:0">${esc(ch.nome)} ainda não está conectado. Reconecte (QR Code) antes, senão a fila fica parada até ele conectar.</p>`:''}
   <p class="src" style="margin:0">Plano B (docs/plano-b-numero-reserva.md): troque só com a autorização combinada e avise os clientes com conversa aberta. Para voltar, torne o número do escritório principal de novo.</p>
   <div class="hb"><button type="button" class="btn pri" data-cn="trocaok" data-id="${ch.id}">Trocar o principal</button><button type="button" class="btn" data-cn="trocano">Cancelar</button></div></div></div>`}
let _hostUlt='';
function renderHost(){let m=$('#qrhost');if(!m){m=document.createElement('div');m.id='qrhost';document.body.appendChild(m)}
  const h=qrModal()+canalForm()+trocaModal();if(h!==_hostUlt){_hostUlt=h;m.innerHTML=h}}   // só redesenha se mudou (não apaga o que está sendo digitado)

/* QR Code real: pede o código e confere o estado a cada 4 s até conectar (no máximo 3 min) */
let _qrTimer=null;
function qrAbrir(id){CNUI.qr=id;CN.qr={carregando:true};renderHost();
  DB.canais.conectar(id,'qr').then(r=>{if(CNUI.qr!==id)return;
    if(r.conectado){qrFechar();DB.canais.carregar().then(redesenharCanais);toast('O canal já está conectado.');return}
    CN.qr={qr:r.qr,codigo:r.codigo,desde:Date.now()};renderHost();qrEsperar(id)},
  e=>{if(CNUI.qr===id){CN.qr={erro:e.message};renderHost()}})}
function qrEsperar(id){clearTimeout(_qrTimer);
  _qrTimer=setTimeout(()=>{if(CNUI.qr!==id||!CN.qr||CN.qr.erro)return;
    if(Date.now()-(CN.qr.desde||0)>180000){CN.qr={erro:'O código não foi lido a tempo. Clique em “Gerar novo código”.'};renderHost();return}
    DB.canais.conectar(id,'verificar').then(r=>{if(CNUI.qr!==id)return;
      if(r.estado==='conectado'){qrFechar();DB.canais.carregar().then(()=>{redesenharCanais();toast((canal(id)||{}).nome+' conectado. A fila de saída volta a andar.')})}
      else qrEsperar(id)},()=>{if(CNUI.qr===id)qrEsperar(id)})},4000)}
function qrFechar(){clearTimeout(_qrTimer);CNUI.qr=null;CN.qr=null;renderHost()}

/* ---- painel de saúde (admin, em Configurações → Saúde) e quadro no painel do gestor ---- */
function alertasAbertos(){
  if(SB.ligado())return ((CN.saude&&CN.saude.r.alertas_abertos)||[]).map(a=>[a.nivel,a.mensagem,a.tipo==='automacao_falhou'?a.id:null]);
  const a=[];
  CHN.filter(c=>c.ativo).forEach(c=>{const e=estadoExibido(c);if(['desconectado','aguardando_qr','bloqueado'].includes(e))a.push(['critico',`${c.nome} está ${CN_ROT[e][2].toLowerCase()}.`]);if(e==='instavel')a.push(['aviso',`${c.nome} sem receber mensagens ${relMin(c.ult)}.`])});
  const pend=SAIDA.filter(s=>s.estado==='pendente');if(pend.some(s=>Date.now()-s.criado>5*60000))a.push(['critico','Há mensagem esperando envio há mais de 5 min.']);
  SAIDA.filter(s=>s.estado==='falhou').forEach(s=>a.push(['aviso',`Mensagem para ${s.cli} não enviada após ${SAIDA_SIM.max} tentativas.`]));
  const we=WHK.filter(w=>w.st==='erro').length;if(we)a.push(['aviso',`${we} evento(s) do WhatsApp com erro de processamento.`]);
  convos.filter(c=>c.status==='Aguardando'&&!c.owner&&c.waiting>30).forEach(c=>a.push(['aviso',`Atendimento de ${c.name} (${qName(c.queue)}) sem responsável há ${fmt(c.waiting)}.`]));
  return a}
const alertasHtml=al=>al.length?`<div style="padding:0 14px 12px;display:grid;gap:6px">${al.map(([n,t,id])=>`<div class="pill ${n==='critico'?'bad':'warn'}" style="white-space:normal;padding:5px 10px">${n==='critico'?'🔴':'🟡'} ${esc(t)}${id?` <button type="button" class="btn" data-cn="visto" data-id="${id}">Marcar como visto</button>`:''}</div>`).join('')}</div>`:'';
const filaLinhas=L=>L.map(s=>`<tr><td>${esc(s.cli)}</td><td class="src">${esc(s.x.slice(0,60))}</td><td><span class="pill ${s.estado==='falhou'?'bad':'warn'}">${s.estado==='falhou'?'Falhou':s.enviando?'Enviando':'Na fila'}</span>${s.erro?`<br><span class="src">${esc(s.erro)}</span>`:''}</td><td>${s.tent}/${SAIDA_SIM.max}</td><td style="white-space:nowrap">${s.estado==='falhou'?`<button type="button" class="btn" data-cn="re" data-id="${s.id}">Reenviar</button> `:''}${s.enviando?'':`<button type="button" class="btn" data-cn="cancel" data-id="${s.id}">Cancelar</button>`}</td></tr>`).join('')||'<tr><td colspan="5" class="src">Nada aguardando. Tudo que foi enviado saiu.</td></tr>';
function saudeHtml(){
  if(SB.ligado())return saudeConHtml();
  const st=k=>SAIDA.filter(s=>s.estado===k),nao=SAIDA.filter(s=>s.estado==='pendente'||s.estado==='falhou'),env=st('enviada');
  const med=env.length?Math.round(env.reduce((a,s)=>a+(s.enviada-s.criado),0)/env.length/1000):null,al=alertasAbertos();
  return `<div class="tbl" id="saude"><h3>Saúde do atendimento <span class="live" aria-hidden="true"></span></h3><p class="src note">O que a verificação automática (a cada 1 minuto) enxerga. Na versão conectada, vem das tabelas canais, saida_mensagens, webhook_eventos e alertas.</p>
   <div class="tiles" style="padding:0 14px 12px"><div class="tile${al.some(x=>x[0]==='critico')?' bad':al.length?' warn':''}"><b>${al.length}</b><span>alertas abertos</span></div><div class="tile${st('pendente').length?' warn':''}"><b>${st('pendente').length}</b><span>na fila de saída</span></div><div class="tile${st('falhou').length?' bad':''}"><b>${st('falhou').length}</b><span>envios com falha</span></div><div class="tile"><b>${env.length}</b><span>enviadas hoje${med!=null?' · média '+med+' s':''}</span></div><div class="tile${WHK.some(w=>w.st==='erro')?' warn':''}"><b>${WHK.filter(w=>w.st!=='ok').length}</b><span>eventos não processados</span></div></div>
   ${alertasHtml(al)}
   <table><thead><tr><th>Canal</th><th>Estado</th><th>Última mensagem</th><th>Verificado</th></tr></thead><tbody>${CHN.map(c=>{const e=estadoExibido(c);return `<tr><td><b>${esc(c.nome)}</b><br><span class="src">${esc(c.numero)}${c.reserva?' · plano B (inativo até a troca)':''}</span></td><td>${c.ativo?`<span class="pill ${CN_ROT[e][0]}">${CN_ROT[e][1]} ${CN_ROT[e][2]}</span>`:'<span class="pill pause">Inativo</span>'}</td><td>${relMin(c.ult)}</td><td>${relMin(c.verif)}</td></tr>`}).join('')}</tbody></table>
   <div style="padding:12px 14px 0"><b>Fila de saída</b> <label class="src" style="margin-left:10px"><input type="checkbox" data-cn="falhar"${SAIDA_SIM.falhar?' checked':''}> Simular falha do provedor (repetição acelerada ${SAIDA_SIM.acel}×: 30 s → 2 min → 10 min → 1 h)</label></div>
   <table><thead><tr><th>Cliente</th><th>Mensagem</th><th>Estado</th><th>Tentativas</th><th></th></tr></thead><tbody>${filaLinhas(nao)}</tbody></table>
   <div style="padding:12px 14px 0"><b>Eventos recebidos do WhatsApp (webhook)</b> <span class="src">· eventos repetidos são ignorados pela chave única (canal + id + tipo)</span></div>
   <table><thead><tr><th>Hora</th><th>Evento</th><th>Contato</th><th>Repetições ignoradas</th><th>Resultado</th></tr></thead><tbody>${WHK.map(w=>`<tr><td>${esc(w.h)}</td><td><code>${esc(w.tipo)}</code><br><span class="src">${esc(w.ext)}</span></td><td>${esc(w.cli)}</td><td>${w.rep}</td><td>${w.st==='ok'?'<span class="pill ok">Processado</span>':w.st==='fila'?'<span class="pill warn">Na fila de processamento</span>':`<span class="pill bad">Erro</span><br><span class="src">${esc(w.erro)}</span> <button type="button" class="btn" data-cn="whk" data-id="${w.id}">Reprocessar</button>`}</td></tr>`).join('')}</tbody></table>
   <div style="padding:12px 14px 0"><b>Avisos enviados ao grupo de gestão</b> <span class="src">· canal interno (Discord/WhatsApp), simulado</span></div>
   <table><tbody>${ALERTAS_ENVIADOS.slice(0,8).map(x=>`<tr><td style="width:70px">${esc(x.h)}</td><td>${esc(x.t)}</td></tr>`).join('')||'<tr><td class="src">Nenhum aviso hoje.</td></tr>'}</tbody></table>
   <p class="src note" style="padding-top:10px">Relatório do dia (enviado às 18h ao grupo de gestão): ${convos.reduce((a,c)=>a+c.msgs.filter(m=>m.f==='c').length,0)} recebidas · ${env.length} enviadas · ${st('falhou').length} falhas.</p></div>`}
const WH_TIPO={mensagem:'Mensagem recebida',mensagem_enviada:'Mensagem enviada pelo celular',conexao:'Conexão'};
const whTipo=t=>WH_TIPO[t]||(/^status:/.test(t)?'Status de entrega ('+t.slice(7)+')':t);
function saudeConHtml(){
  const sd=CN.saude,cab=`<h3>Saúde do atendimento <span class="live" aria-hidden="true"></span> <small class="src">${CN.saudeEm?'atualizado '+relMin(CN.saudeEm):''}</small></h3>`;
  if(!sd)return `<div class="tbl" id="saude">${cab}<p class="src note">${CN.saudeErro?'Não foi possível ler o painel: '+esc(CN.saudeErro)+' <button type="button" class="btn" data-cn="saude">Tentar de novo</button>':'Carregando o painel de saúde…'}</p></div>`;
  const r=sd.r||{},f=r.fila||{},wh=r.webhook||{},dia=sd.dia||{},al=alertasAbertos(),nome=id=>(canal(id)||{}).nome||'canal';
  const nao=CN.fila;
  const linhaCanal=c=>{const e=estadoExibido(c),tags=[c.principal&&c.ativo?'principal':'',c.reserva?'reserva (plano B)':'',c.provedor==='simulado'?'simulado':''].filter(Boolean).join(' · ');
    return `<tr><td><b>${esc(c.nome)}</b><br><span class="src">${esc(CN_TIPO[c.tipo])}${c.numero?' · '+esc(c.numero):''}${tags?' · '+tags:''}</span></td>
     <td>${c.ativo?`<span class="pill ${CN_ROT[e][0]}">${CN_ROT[e][1]} ${CN_ROT[e][2]}</span>`:`<span class="pill pause">Desligado</span>${c.estado==='conectado'?'<br><span class="src">sessão conectada</span>':''}`}</td>
     <td>${relMin(c.ult)}</td><td>${relMin(c.verif)}</td>
     <td class="cn-acoes">${temQr(c)&&c.estado!=='conectado'?`<button type="button" class="btn" data-cn="qr" data-id="${c.id}">Reconectar</button>`:''}<button type="button" class="btn" data-cn="verificar" data-id="${c.id}">Verificar</button><button type="button" class="btn" data-cn="cneditar" data-id="${c.id}">Editar</button>${c.principal&&c.ativo?'':`<button type="button" class="btn" data-cn="troca" data-id="${c.id}">Tornar principal</button><button type="button" class="btn" data-cn="ativar" data-id="${c.id}" data-on="${c.ativo?0:1}">${c.ativo?'Desligar':'Ligar verificação'}</button>`}</td></tr>`};
  const stWh=w=>w.processado_em?'<span class="pill ok">Processado</span>':w.erro?`<span class="pill bad">Erro</span><br><span class="src">${esc(w.erro)}</span> <button type="button" class="btn" data-cn="whk" data-id="${w.id}">Reprocessar</button>`
    :/^mensagem/.test(w.tipo)||/^status:/.test(w.tipo)?'<span class="pill pause">Guardado</span><br><span class="src">entra na conversa com o passo 2</span>':'<span class="pill warn">Na fila de processamento</span>';
  const stAl=a=>a.notificado_em?'enviado ao grupo '+cnHora(a.notificado_em):Date.now()-msDe(a.aberto_em)>120000?'<span class="pill warn">não enviado</span> <span class="src">canal de gestão não configurado (ALERTA_WEBHOOK_URL)</span>':'enviando…';
  return `<div class="tbl" id="saude">${cab}<p class="src note">O que a verificação automática (a cada 1 minuto) enxerga, lido do banco (${esc(AMBIENTE.rotulo)}). <button type="button" class="btn" data-cn="saude">Atualizar</button></p>
   <div class="tiles" style="padding:0 14px 12px"><div class="tile${al.some(x=>x[0]==='critico')?' bad':al.length?' warn':''}"><b>${al.length}</b><span>alertas abertos</span></div>
    <div class="tile${(f.pendentes||0)+(f.enviando||0)?' warn':''}"><b>${(f.pendentes||0)+(f.enviando||0)}</b><span>na fila de saída${f.mais_antiga_min!=null?' · a mais antiga há '+fmt(f.mais_antiga_min):''}</span></div>
    <div class="tile${f.falhou?' bad':''}"><b>${f.falhou||0}</b><span>envios com falha</span></div>
    <div class="tile"><b>${dia.enviadas??0}</b><span>enviadas hoje${f.tempo_medio_envio_seg!=null?' · média '+f.tempo_medio_envio_seg+' s':''}</span></div>
    <div class="tile${wh.com_erro?' warn':''}"><b>${wh.com_erro||0}</b><span>eventos com erro${wh.nao_processados?' · '+wh.nao_processados+' guardados':''}</span></div></div>
   ${alertasHtml(al)}
   <div style="padding:0 14px 6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>Canais</b><span style="flex:1"></span><button type="button" class="btn" data-cn="cnnovo">+ Novo canal</button></div>
   <table><thead><tr><th>Canal</th><th>Estado</th><th>Última mensagem</th><th>Verificado</th><th></th></tr></thead><tbody>${CHN.map(linhaCanal).join('')||'<tr><td colspan="5" class="src">Nenhum canal cadastrado. Clique em “+ Novo canal”.</td></tr>'}</tbody></table>
   <p class="src note">Só o canal <b>principal</b> de cada tipo envia mensagens. “Tornar principal” é o plano B: troca o número de envio e leva a fila junto. Canal desligado não é verificado nem gera alerta.</p>
   <div style="padding:12px 14px 0"><b>Fila de saída</b> <span class="src">· repetição automática: 30 s → 2 min → 10 min → 1 h; na 5ª falha, alguém decide</span></div>
   <table><thead><tr><th>Destino</th><th>Mensagem</th><th>Estado</th><th>Tentativas</th><th></th></tr></thead><tbody>${filaLinhas(nao)}</tbody></table>
   <div style="padding:12px 14px 0"><b>Últimos eventos recebidos dos canais</b> <span class="src">· eventos repetidos são ignorados pela chave única (canal + id + tipo)</span></div>
   <table><thead><tr><th>Hora</th><th>Evento</th><th>Canal</th><th>Resultado</th></tr></thead><tbody>${sd.whk.map(w=>`<tr><td>${cnHora(w.recebido_em)}</td><td>${esc(whTipo(w.tipo))}<br><span class="src">${esc(String(w.id_externo).slice(0,24))}</span></td><td>${esc(nome(w.canal_id))}</td><td>${stWh(w)}</td></tr>`).join('')||'<tr><td colspan="4" class="src">Nenhum evento recebido ainda.</td></tr>'}</tbody></table>
   <div style="padding:12px 14px 0"><b>Avisos ao grupo de gestão</b> <span class="src">· os últimos alertas e se chegaram ao canal interno</span></div>
   <table><tbody>${sd.alertas.map(a=>`<tr><td style="width:96px">${cnHora(a.aberto_em)}</td><td>${a.nivel==='critico'?'🔴':'🟡'} ${esc(a.mensagem)}${a.resolvido_em?` <span class="src">· resolvido ${cnHora(a.resolvido_em)}</span>`:''}</td><td class="src">${stAl(a)}</td></tr>`).join('')||'<tr><td class="src">Nenhum alerta registrado.</td></tr>'}</tbody></table>
   <p class="src note" style="padding-top:10px">Relatório do dia (enviado às 18h ao grupo de gestão): ${dia.recebidas??0} recebidas · ${dia.enviadas??0} enviadas · ${dia.falhas??0} falhas · 1ª resposta média ${dia.primeira_resposta_media_min!=null?dia.primeira_resposta_media_min+' min':'—'}.</p></div>`}
const _rs3=renderSettings;
renderSettings=function(){_rs3();if(S.role!=='admin')return;
  if(SB.ligado()&&!CN.saude&&!CN.carregandoSaude&&!CN.saudeErro&&S.cfgAba==='saude')DB.canais.saude().then(()=>{if(S.view==='cfg')renderSettings()});
  const h=$('#settings .cfg > .ph');if(h)h.insertAdjacentHTML('afterend',saudeHtml())};

/* ---- eventos ---- */
function cnLerForm(){const d=CNUI.edit,v=id=>{const e=document.getElementById(id);return e?e.value:''};
  Object.assign(d,{nome:v('cnf-nome').trim(),numero:v('cnf-num').trim(),instancia:v('cnf-inst').trim(),sil:v('cnf-sil'),reserva:!!(document.getElementById('cnf-res')||{}).checked});
  const t=document.getElementById('cnf-tipo');if(t)d.tipo=t.value;const p=document.getElementById('cnf-prov');if(p)d.provedor=p.value}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-cn]');if(!b||b.type==='checkbox'||b.tagName==='SELECT'||b.disabled)return;const a=b.dataset.cn,id=b.dataset.id;
  if(a==='resumo'){CNUI.aberto=!CNUI.aberto;if(!CNUI.aberto)CNUI.pop=null;renderCanais();return}
  if(a==='pop'){CNUI.pop=CNUI.pop===id?null:id;renderCanais();
    if(CNUI.pop&&SB.ligado())DB.canais.eventos(CNUI.pop).then(()=>{CN.ev[id]=true;renderCanais()},err=>toast(err.message));return}
  if(a==='re'||a==='cancel'){const s=SAIDA.find(x=>x.id===id);
    if(!s&&SB.ligado()){cnAcao(a==='re'?DB.canais.reenviar(id):DB.canais.cancelar(id),a==='re'?'Mensagem de volta à fila.':'Envio cancelado. O cliente não vai receber esta mensagem.');return}
    if(!s)return;if(a==='re'?DB.reenviar(id):DB.cancelarEnvio(id)){atualizarBolha(s);renderCanais();if(S.view==='cfg')renderSettings();toast(a==='re'?'Mensagem de volta à fila.':'Envio cancelado. O cliente não vai receber esta mensagem.')}return}
  if(a==='whk'){if(SB.ligado()){cnAcao(DB.canais.reprocessar(id),'Evento de volta à fila de processamento.');return}
    const w=WHK.find(x=>x.id===+id);if(w){w.st='fila';w.erro='';renderSettings();toast('Evento de volta à fila de processamento (simulado).')}return}
  if(a==='saude'){CN.saudeErro='';DB.canais.saude().then(()=>{DB.canais.carregar().then(()=>{renderCanais();if(S.view==='cfg')renderSettings()})});renderSettings();return}
  if(a==='visto'){cnAcao(DB.canais.alertaVisto(id),'Alerta marcado como visto.');return}
  if(a==='qrno'){if(SB.ligado())qrFechar();else{CNUI.qr=null;renderAll()}return}
  if(!podeCanal())return;
  if(SB.ligado()){
    if(a==='qr'||a==='qrnovo'){qrAbrir(id);return}
    if(a==='verificar'){toast('Verificando…');cnAcao(DB.canais.conectar(id,'verificar').then(r=>DB.canais.carregar().then(()=>r)),r=>{const ch=canal(id)||{};return `${ch.nome||'Canal'}: ${CN_ROT[r.estado]?CN_ROT[r.estado][2].toLowerCase():r.estado}${r.mudou?' (mudou agora)':''}.`});
      if(CNUI.pop===id)DB.canais.eventos(id).then(renderCanais,()=>{});return}
    if(S.role!=='admin')return;
    if(a==='cnnovo'){CNUI.edit={tipo:'whatsapp',nome:'',numero:'',instancia:'',provedor:'evolution',sil:120,reserva:false};renderHost();return}
    if(a==='cneditar'){const c=canal(id);if(c){CNUI.edit={id:c.id,tipo:c.tipo,nome:c.nome,numero:c.numero,instancia:c.instancia,provedor:c.provedor,sil:c.sil,reserva:c.reserva};renderHost()}return}
    if(a==='cnfechar'){CNUI.edit=null;renderHost();return}
    if(a==='cnsalvar'){cnLerForm();const d=CNUI.edit;b.disabled=true;
      DB.canais.salvar(d).then(()=>{CNUI.edit=null;redesenharCanais();toast(d.id?'Canal atualizado.':'Canal cadastrado (desligado). Conecte e ligue a verificação quando estiver pronto.')},err=>{b.disabled=false;toast(err.message)});return}
    if(a==='ativar'){const on=b.dataset.on==='1';cnAcao(DB.canais.ativar(id,on),on?'Verificação ligada: o canal entra na faixa e nos alertas.':'Canal desligado.');return}
    if(a==='troca'){CNUI.troca=id;renderHost();return}
    if(a==='trocano'){CNUI.troca=null;renderHost();return}
    if(a==='trocaok'){CNUI.troca=null;renderHost();const ch=canal(id)||{};cnAcao(DB.canais.tornarPrincipal(id),n=>`${ch.nome} agora é o principal.${n?` ${n} mensagem(ns) da fila vão sair por ele.`:''}`);return}
    return}
  if(a==='cair')mudarCanal(id,'desconectado','sessão caiu (simulação)');
  else if(a==='bloq')mudarCanal(id,'bloqueado','número bloqueado pelo WhatsApp (simulação)');
  else if(a==='sil'){canal(id).ult=Date.now()-180*60000;renderAll()}
  else if(a==='qr'){CNUI.qr=id;renderAll()}
  else if(a==='qrok'){CNUI.qr=null;const ch=canal(id);ch.ult=Date.now();mudarCanal(id,'conectado','QR Code lido no celular oficial')}
});
document.addEventListener('change',e=>{const el=e.target;if(!el.dataset)return;
  if(el.dataset.cn==='falhar'){SAIDA_SIM.falhar=el.checked;toast(el.checked?'Provedor falhando (simulação): veja as tentativas na bolha.':'Provedor normal de novo.')}
  if(el.dataset.cnf==='tipo'&&CNUI.edit){cnLerForm();CNUI.edit.provedor=CN_PROV[CNUI.edit.tipo][0][0];if(CNUI.edit.tipo==='google'&&+CNUI.edit.sil===120)CNUI.edit.sil=10080;renderHost()}
  if(el.dataset.cnf==='prov'&&CNUI.edit){cnLerForm();renderHost()}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(CNUI.edit){CNUI.edit=null;renderHost()}else if(CNUI.troca){CNUI.troca=null;renderHost()}else if(CNUI.qr&&SB.ligado())qrFechar()});
/* conectado: ao sair, nada de canal ou fila fica na tela para o próximo login */
document.addEventListener('click',e=>{if(SB.ligado()&&e.target.closest&&e.target.closest('[data-act=logout]')){CHN.length=0;CHEV.length=0;CN.fila=[];CN.saude=null;CN.saudeErro='';CN.carregado=false;CN.ev={};CNUI.pop=null;CNUI.edit=null;CNUI.troca=null;if(CNUI.qr)qrFechar()}},true);
const _ra=renderAll;
renderAll=function(){_ra();renderHost()};
