/* ---- Configurações: ausência e webhooks ---- */
const HOOKS={url:'',ev:{Qualificado:true,Ganho:true},hist:[{h:'05/11 09:40',e:'Qualificado',lead:'Oficina Santos ME',r:'200 OK'},{h:'02/11 16:05',e:'Ganho',lead:'Padaria Estrela',r:'Falhou (timeout)'}],
 ent:[{h:'05/11 10:20',o:'Meta Ads',lead:'Lead do anúncio',r:'Criado'},{h:'05/11 08:12',o:'Google Ads',lead:'Oficina Santos ME',r:'Criado'}]};
const _rs=renderSettings;
renderSettings=function(){
  _rs();if(S.role!=='admin')return;const el=$('#settings .cfg');if(!el||!el.lastElementChild)return;
  el.lastElementChild.insertAdjacentHTML('beforebegin',`<div class="tbl"><h3>Mensagem de ausência</h3><div style="padding:0 14px 14px;display:grid;gap:8px"><label class="src"><input type="checkbox" data-fld="awayon"${CFG.away.on?' checked':''}> Responder automaticamente fora do horário do setor</label><textarea rows="3" data-fld="awaytx" style="width:100%;border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:6px 8px">${esc(CFG.away.text)}</textarea><span class="src">Usada pelo bloco “Dentro do horário?” dos fluxos e como resposta automática.</span></div></div>
  <div class="tbl"><h3>Webhooks e API (integração com o gestor de tráfego)</h3><div style="padding:0 14px 14px;display:grid;gap:12px">
   <div><b>Entrada de leads</b><p class="src" style="margin:2px 0 6px">Modelo do endereço que receberá leads e respostas de formulário por HTTP. Nesta etapa nada é recebido.</p><code>POST https://crm.nevespaduaadvocacia.com.br/api/leads</code><br><span class="src">Chave de acesso: npk_••••••••3f9a (a chave real fica guardada no cofre do Supabase, nunca no navegador)</span>
   <table><thead><tr><th>Quando</th><th>Origem</th><th>Lead</th><th>Resultado</th></tr></thead><tbody>${HOOKS.ent.map(x=>`<tr><td>${esc(x.h)}</td><td>${esc(x.o)}</td><td>${esc(x.lead)}</td><td>${esc(x.r)}</td></tr>`).join('')}</tbody></table></div>
   <div><b>Saída (webhook)</b><p class="src" style="margin:2px 0 6px">Dispara quando o lead chega às etapas marcadas, enviando: id e nome da etapa, telefone, nome e valor da venda.</p>
   <div class="row"><input data-fld="hookurl" placeholder="https://endereço do webhook do gestor de tráfego" value="${esc(HOOKS.url)}" style="flex:1;min-width:240px;border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:5px 8px">${Object.keys(HOOKS.ev).map(k=>`<label class="src"><input type="checkbox" data-fld="hookev" data-k="${k}"${HOOKS.ev[k]?' checked':''}> ${k}</label>`).join('')}</div>
   <table><thead><tr><th>Quando</th><th>Etapa</th><th>Lead</th><th>Resultado</th><th></th></tr></thead><tbody>${HOOKS.hist.map((x,i)=>`<tr><td>${esc(x.h)}</td><td>${esc(x.e)}</td><td>${esc(x.lead)}</td><td>${esc(x.r)}</td><td>${x.r.startsWith('Falhou')?`<button type="button" class="btn" data-x="hookretry" data-i="${i}">Tentar de novo</button>`:''}</td></tr>`).join('')}</tbody></table></div></div></div>`);
};

/* ---- eventos dos módulos ---- */
const _ar=(a,i)=>a[+i];
function setFld(el){
  const d=el.dataset,v=el.type==='checkbox'?el.checked:el.value;
  switch(d.fld){
   case 'lead':{const l=LEADS.find(x=>x.id===d.id);if(!l)break;l[d.f]=(d.f==='valor'||d.f==='prob')?Math.max(0,+v||0):v;break}
   case 'leadc':{const l=LEADS.find(x=>x.id===d.id);if(l)l.custom[d.f]=v;break}
   case 'agon':iaAcao(DB.ia.ativar(d.id,v),v?'Agente ligado.':'Agente desligado.');break;
   case 'awayon':CFG.away.on=v;break;
   case 'awaytx':CFG.away.text=v;break;
   case 'hookurl':HOOKS.url=v;break;
   case 'hookev':HOOKS.ev[d.k]=v;break;
  }
}
document.addEventListener('input',e=>{const el=e.target;if(!el.dataset||!el.dataset.fld)return;if(el.type==='checkbox'||el.tagName==='SELECT')return;setFld(el)});
document.addEventListener('change',e=>{
  const el=e.target,d=el.dataset||{};
  if(d.fld){setFld(el);if(['lead','leadc'].includes(d.fld)){
      if(SB.ligado()){const l=LEADS.find(x=>x.id===d.id);if(l)crmAcao(DB.crm.atualizar(l,d.fld==='leadc'?'custom':d.f),'Salvo no CRM.');return}
      if(d.fld==='lead'&&['name','dono','origem','valor','prob'].includes(d.f))renderCrm();toast('Salvo no CRM (exemplo).')}return}
  if(d.xSel==='stage'){const l=LEADS.find(x=>x.id===d.id);if(l)moveLead(l,el.value);return}
  if(d.xChk){const l=LEADS.find(x=>x.id===d.id),t=l&&l.tasks.find(x=>x.id===d.xChk);if(t&&SB.ligado()){crmAcao(DB.crm.concluirAtividade(t.id,el.checked),el.checked?'Atividade concluída.':'Atividade reaberta.');return}if(t){t.done=el.checked;renderCrm()}return}
  if(el.id==='fown'){M.fOwner=el.value;renderCrm();return}
  if(el.id==='fori'){M.fOrigem=el.value;renderCrm();return}
});
function afterTask(l){renderCrm()}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-x]');if(!b)return;const a=b.dataset.x,d=b.dataset;
  if(a==='deal'&&e.target.closest('input,select,button:not([data-x="deal"])'))return;
  const l=LEADS.find(x=>x.id===d.id);
  switch(a){
   case 'crmtab':M.crmTab=d.v;renderCrm();break;
   case 'crmrefresh':CRM.erro='';crmAcao(DB.crm.carregar(),'');break;
   case 'deal':M.crmSel=d.id;M.crmSide='resumo';M.needPerda=false;renderCrm();break;
   case 'dealclose':M.crmSel=null;M.needPerda=false;renderCrm();break;
   case 'crmside':M.crmSide=d.v;renderCrm();break;
   case 'dealnew':M.newDeal=!M.newDeal;renderCrm();break;
   case 'dealcreate':{const n=$('#ndn').value.trim();if(!n){toast('Escreva o nome.');break}
     if(SB.ligado()){crmAcao(DB.crm.criar(M.pipe,n,$('#ndv').value,$('#ndo').value).then(id=>{M.newDeal=false;M.crmSel=id;M.crmSide='resumo'}),'Negócio criado.');break}const nl=mk(uid('l'),n,'','',+$('#ndv').value||0,'Novo lead',me(),$('#ndo').value,'',{pipe:M.pipe});LEADS.push(nl);M.newDeal=false;M.crmSel=nl.id;fire('etapa','Novo lead',nl);renderCrm();break}
   case 'pipe':M.pipe=d.v;M.crmSel=null;renderCrm();break;
   case 'colrec':crmRecolher(d.v);break;
   case 'colabrir':CRM_REC.clear();try{localStorage.setItem('np-crm-recolhidas','[]')}catch(x){}renderCrm();break;
   case 'win':if(l)moveLead(l,'Ganho');break;
   case 'lose':M.crmSel=d.id;M.needPerda=true;renderCrm();break;
   case 'perdaok':{const v=$('#perdasel').value;if(!v){toast('Escolha o motivo da perda.');break}
     if(l&&SB.ligado()){M.needPerda=false;crmAcao(DB.crm.mover(l,'Perdido',v),'Negócio perdido: '+v);break}if(l){l.etapa='Perdido';l.prob=0;l.perda=v;M.needPerda=false;toast('Negócio perdido: '+v);renderCrm()}break}
   case 'perdano':M.needPerda=false;renderCrm();break;
   case 'closedeal':M.closeFor=d.id;renderCrm();break;
   case 'closeno':M.closeFor=null;renderCrm();break;
   case 'closeok':if(l){l.closed=true;M.closeFor=null;toast('Simulado: o sistema jurídico criaria ficha, contratos, pasta no Drive, boas-vindas, onboarding e a tarefa do Financeiro. Nada foi enviado.');renderCrm()}break;
   case 'taskadd':{const n=$('#tkn').value.trim();if(!n){toast('Escreva o que fazer.');break}
     if(SB.ligado()){crmAcao(DB.crm.criarAtividade(l,$('#tkt').value,n,$('#tkd').value),'Atividade criada.');break}l.tasks.push({id:uid('t'),tipo:$('#tkt').value,tit:n,quando:$('#tkd').value.replace('T',' '),done:false,dono:l.dono});renderCrm();break}
   case 'taskdel':{if(SB.ligado()){crmAcao(DB.crm.excluirAtividade(d.t),'Atividade excluída.');break}const i=l.tasks.findIndex(x=>x.id===d.t);if(i>=0)l.tasks.splice(i,1);renderCrm();break}
   case 'taskdone':{if(SB.ligado()){crmAcao(DB.crm.concluirAtividade(d.t,true),'Atividade concluída.');break}const t=l.tasks.find(x=>x.id===d.t);if(t){t.done=true;renderCrm()}break}
   case 'openconv':{const c=convos.find(x=>x.id===d.id);if(c&&canSee(c)){S.view='atend';S.sel=c.id;S.queue=ACCESS[S.role].includes('todos')?'todos':'minha';S.pane='chat';renderAll()}else toast('Você não tem acesso à fila dessa conversa.');break}
   case 'campoadd':{const n=$('#cpn').value.trim();if(!n){toast('Dê um nome ao campo.');break}const t=$('#cpt').value,c={id:uid('c'),nome:n,tipo:t};
     if(SB.ligado()){crmAcao(DB.crm.criarCampo(n,t,t==='lista'?($('#cpo').value||'').split(',').map(x=>x.trim()).filter(Boolean):null),'Campo “'+n+'” criado.');break}if(t==='lista')c.opts=($('#cpo').value||'').split(',').map(x=>x.trim()).filter(Boolean);CAMPOS.push(c);renderCrm();break}
   case 'campodel':{if(SB.ligado()){crmAcao(DB.crm.excluirCampo(d.id),'Campo excluído. O que já foi preenchido nos negócios continua guardado.');break}const i=CAMPOS.findIndex(x=>x.id===d.id);if(i>=0)CAMPOS.splice(i,1);renderCrm();break}
   case 'iatab':M.iaTab=d.v;renderIA();break;
   case 'iarev':M.iaTab='rev';M.iaFil='todas';const fv=CONVIA.find(x=>x.ag===d.id);if(fv)M.iaSel=fv.id;renderIA();break;
   case 'iafil':M.iaFil=d.v;M.iaSel=null;renderIA();break;
   case 'iasel':M.iaSel=d.id;renderIA();break;
   case 'iaok':iaAcao(DB.ia.aprovar(d.id,null),'Aprovada e colocada na fila de envio.');break;
   case 'iafix':{const t=$('#iacorr');iaAcao(DB.ia.aprovar(d.id,t?t.value:''),'Correção enviada e guardada como exemplo do agente.');break}
   case 'iatake':iaAcao(DB.ia.assumir(d.id),'A conversa está com você. Nada da IA foi enviado.');break;
   case 'iamodo':{const s=$('#iamodo-'+d.id),t=$('#iamot-'+d.id);if(s)iaAcao(DB.ia.mudarModo(d.id,s.value,t?t.value.trim():''),'Modo do agente atualizado e registrado no histórico.');break}
   case 'iarefresh':IA.erro='';iaAcao(DB.ia.carregar(),'');break;
   case 'resedit':M.resEdit=d.id;renderIA();break;
   case 'resave':{const t=$('#rested');M.resEdit=null;iaAcao(DB.ia.salvarResumo(d.id,t?t.value:'',false),'Texto do resumo salvo.');break}
   case 'resok':{const t=$('#rested'),tx=t&&M.resEdit===d.id?t.value:'';M.resEdit=null;iaAcao(DB.ia.salvarResumo(d.id,tx,true),'Resumo publicado. A gravação no dossiê do sistema jurídico entra com o passo 2.');break}
   case 'hookretry':{const x=HOOKS.hist[+d.i];if(x){x.r='200 OK (reenviado)';renderSettings()}break}
  }
});
/* arrastar e soltar no funil */
document.addEventListener('dragstart',e=>{const c=e.target.closest&&e.target.closest('[data-deal]');if(c){M.drag=c.dataset.deal;try{e.dataTransfer.setData('text/plain',M.drag)}catch(x){}}});
document.addEventListener('dragover',e=>{const c=e.target.closest&&e.target.closest('.col');if(c&&M.drag){e.preventDefault();c.classList.add('over')}});
document.addEventListener('dragleave',e=>{const c=e.target.closest&&e.target.closest('.col');if(c)c.classList.remove('over')});
document.addEventListener('drop',e=>{const c=e.target.closest&&e.target.closest('.col');if(!c||!M.drag)return;e.preventDefault();const l=LEADS.find(x=>x.id===M.drag);M.drag=null;if(l)moveLead(l,c.dataset.stage)});

