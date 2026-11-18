/* ===== Menções vindas dos fluxos e da IA =====
   Não há aba nem sino separado: aparecem no topo da fila "Menções" do atendimento, junto das menções em notas internas.
   Origem: passo "Avisar alguém da equipe" dos fluxos e contato do Instagram/Google que pediu uma pessoa (crm_0020:
   o atendimento é delegado a um atendente do Comercial pelo rodízio, que recebe a menção).
   Cada pessoa vê só as suas. Conectado: crm.avisos (crm_0019/0020), atualizado a cada minuto. Demonstração: em memória. */
const AVISOS=[{id:'av1',k:'Ana Júlia',tipo:'fluxo',texto:'Contato marcado como urgente: confira a conversa. · Marcos Tavares (fluxo “Tag “Urgente” → avisar o líder”)',em:'2026-11-05T09:40:00',lido:false}];
const AV={erro:''};
const meusAvisos=()=>AVISOS.filter(a=>SB.ligado()||a.k===me());
const avisosPend=()=>meusAvisos().filter(a=>!a.lido);
DB.avisos={
  async carregar(){if(!SB.ligado()||!SB.sessao)return;
    try{const L=await SB.sel('avisos','select=id,texto,criado_em,lido_em,revisao_id,fluxo_id&lido_em=is.null&order=criado_em.desc&limit=50');
      AVISOS.splice(0,AVISOS.length,...(L||[]).map(a=>({id:a.id,k:me(),tipo:a.revisao_id?'ia':'fluxo',texto:a.texto,em:a.criado_em,lido:!!a.lido_em})));AV.erro=''}
    catch(e){AV.erro=e.message}},
  async lido(id){if(SB.ligado()){await SB.rpc('aviso_lido',{p_id:id==null?null:+id});return DB.avisos.carregar()}
    meusAvisos().filter(a=>id==null||String(a.id)===String(id)).forEach(a=>a.lido=true)}
};
function avisosHtml(){
  const L=avisosPend();
  return (AV.erro?`<p class="fx-aviso" style="margin:8px">${esc(AV.erro)}</p>`:'')+L.map(a=>`<div class="men-av" data-men="${esc(String(a.id))}">
    <span class="av" aria-hidden="true">${a.tipo==='ia'?'🙋':'@'}</span>
    <span class="r1"><b>${a.tipo==='ia'?'Pedido de atendimento humano':'Fluxo de trabalho'}</b><time>${fxData(a.em)}</time></span>
    <span>${esc(a.texto)}</span>
    <span class="hb"><button type="button" class="btn" data-av="lido" data-id="${esc(String(a.id))}">Marcar como resolvida</button></span></div>`).join('')
   +(L.length>1?`<div class="hb" style="padding:6px 12px"><button type="button" class="btn" data-av="todos">Marcar todas como resolvidas</button></div>`:'');
}
document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('[data-av]');if(!b)return;
  const a=b.dataset.av;
  if(a==='lido'||a==='todos')DB.avisos.lido(a==='lido'?b.dataset.id:null).then(()=>{renderList();toast(a==='lido'?'Menção resolvida.':'Menções resolvidas.')},err=>toast(err.message));
});
/* conectado: novas menções a cada minuto */
setInterval(()=>{if(SB.ligado()&&S.auth)DB.avisos.carregar().then(()=>{if(S.view==='atend')renderList()})},60000);
