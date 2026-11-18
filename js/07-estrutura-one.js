/* ===== Distribuição e painel ao vivo =====
   Rodízio de atendentes por fila e o quadro "ao vivo" do painel do gestor.
   (Sem sistema de ticket: o atendimento é a própria conversa. Funis por área estão em 03-crm.js.) */
/* rodízio */
CFG.rod=CFG.rod||{passivos:{on:true,i:0},super:{on:true,i:0},acordos:{on:false,i:0},comercial:{on:true,i:0},financeiro:{on:false,i:0}};
const pessoasDa=q=>SB.ligado()?(EQ_ORDEM.get(q)||[]).map(id=>TEAM.find(p=>p.id===id)).filter(Boolean)
  :TEAM.filter(p=>p.ativo!==false&&(p.filas||[]).includes(q));
function atribuir(q){const r=CFG.rod[q]||{on:false,i:0},L=pessoasDa(q);if(!r.on||!L.length)return null;const p=L[r.i%L.length];r.i=(r.i+1)%L.length;CFG.rod[q]=r;return p.k}
let _nc=0;
function novaConversaSim(q){
  const base=JSON.parse(JSON.stringify(convos.find(x=>x.id==='c2')||convos[0]));_nc++;
  const nomes=['Paulo Nogueira','Sandra Lopes','Eduardo Ramos','Patrícia Melo','Rogério Alves'],n=nomes[(_nc-1)%nomes.length],o=atribuir(q);
  Object.assign(base,{id:'cs'+_nc,name:n,org:'Contato novo',phone:'+55 16 9'+(9100+_nc)+'-'+String(3000+_nc),queue:q,owner:o,status:'Aguardando',waiting:0,answered:false,unread:true,pausa:false,proto:'2026110'+(6000+_nc),
    msgs:[{f:'c',x:'Olá, preciso de ajuda com uma dívida no banco.',t:nowT()}]});
  if(base.ct){base.ct.resp=o||'—';base.ct.setor=qName(q)}
  convos.unshift(base);
  const regra=(CFG.rod[q]||{}).on;
  toast(o?`Nova conversa em “${qName(q)}” → ${o} (rodízio)`:`Nova conversa em “${qName(q)}”: ${regra?'sem atendentes na fila':'sem responsável (distribuição manual)'}`);
  renderAll()}
/* Configurações: distribuição */
const _rs2=renderSettings;
renderSettings=function(){
  _rs2();if(S.role!=='admin')return;const el=$('#settings .cfg');if(!el||!el.lastElementChild)return;
  const qs=QUEUES.filter(q=>OPQ().includes(q.id)||q.id==='comercial');
  el.lastElementChild.insertAdjacentHTML('beforebegin',`<div class="tbl"><h3>Distribuição de novas conversas</h3><p class="src note">Com <b>rodízio</b>, cada conversa nova da fila vai para o próximo atendente da lista, em sequência. Sem rodízio, ela entra “sem responsável” e alguém assume.</p>
   <table><thead><tr><th>Fila</th><th>Rodízio</th><th>Atendentes na fila</th><th>Próximo</th></tr></thead><tbody>${[...new Set(qs.map(q=>q.id))].map(id=>{const L=pessoasDa(id),r=CFG.rod[id]||{on:false,i:0};return `<tr><td><b>${esc(qName(id))}</b></td><td><label class="chk"><input type="checkbox" data-rod="${id}"${r.on?' checked':''}> ${r.on?'Ligado':'Desligado'}</label></td><td>${L.length?L.map(p=>esc(p.name)).join(', '):'<span class="src">ninguém — defina as filas de cada pessoa em Usuários</span>'}</td><td>${r.on&&L.length?esc(L[r.i%L.length].name):'—'}</td></tr>`}).join('')}</tbody></table></div>`)};
/* eventos */
document.addEventListener('change',e=>{const el=e.target,id=el.dataset&&el.dataset.rod;if(!id)return;
  if(SB.ligado()){eqAcao(DB.equipe.rodizio(id,el.checked),`Rodízio de ${qName(id)} ${el.checked?'ligado':'desligado'}.`);return}
  (CFG.rod[id]=CFG.rod[id]||{i:0}).on=el.checked;renderSettings()});
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-rodsim]');if(!b)return;novaConversaSim($('#simq').value)});
