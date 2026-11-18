/* ===== Ajustes em abas + página de Usuários (só administrador) =====
   Usuários: tipo, nome/e-mail, filas, status de login, último acesso, visto por último, editar, excluir.
   Sem limite de usuários. Na versão conectada: Supabase Auth + crm.perfis + crm.acessos + crm.fila_membros. */
const US={edit:null,conf:false};
S.cfgAba=S.cfgAba||'usuarios';
{const agora=Date.now(),min=60000;
 const on={'Marina':true,'Lucas':true,'Natasha':true,'Ana Júlia':true};
 TEAM.forEach((p,i)=>{p.ativo=p.ativo!==false;p.online=!!on[p.k];p.ultimoAcesso=agora-(35+i*47)*min;p.visto=p.online?agora-(1+i)*min:p.ultimoAcesso+(18+i*9)*min})}
const usAtivos=()=>TEAM.filter(p=>p.ativo!==false);
const usTipo=p=>p.perfil==='Administrador'?['adm','ADMIN']:p.perfil==='Líder de setor'?['lid','LÍDER']:['nor','NORMAL'];
const usAdmins=()=>TEAM.filter(p=>p.perfil==='Administrador');
const usAbertos=k=>convos.filter(c=>c.owner===k&&c.status!=='Resolvido').length;
const usData=(ts,seg)=>{if(!ts)return '—';const d=new Date(ts),z=n=>String(n).padStart(2,'0');return `${z(d.getDate())}/${z(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)} ${z(d.getHours())}h${z(d.getMinutes())}m${seg?z(d.getSeconds())+'s':''}`};
const emailOk=e=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const naDemo=k=>!SB.ligado()&&Object.values(ME).includes(k);

function usuariosHtml(){
  const rows=TEAM.map(p=>{const [tc,tt]=usTipo(p),eu=p.k===me();
    const filas=p.perfil==='Administrador'||p.perfil==='Líder de setor'?'<span class="src">Todas (pelo perfil)</span>':(p.filas||[]).length?p.filas.map(q=>`<span class="us-fila">${esc(qName(q))}</span>`).join(''):'<span class="src">Nenhuma · só Triagem</span>';
    return `<tr><td><span class="us-tipo ${tc}">${tt}</span></td>
     <td><button type="button" class="us-nome" data-us="editar" data-k="${esc(p.k)}">${esc(p.name)}${eu?' <span class="src">(você)</span>':''}</button><br>${p.email?`<span class="src">${esc(p.email)}</span>`:'<span class="us-sememail" title="Sem e-mail a pessoa não consegue entrar nem ser marcada com @">sem e-mail cadastrado</span>'}</td>
     <td class="us-filas">${filas}${p.todos&&p.perfil!=='Administrador'?'<br><span class="src">+ vê Todos os clientes</span>':''}</td>
     <td>${p.online?`<button type="button" class="us-st on" data-us="sair" data-k="${esc(p.k)}" title="${eu?'Esta é a sua sessão':'Clique para encerrar a sessão desta pessoa'}"${eu?' disabled':''}>LOGADO</button>`:'<span class="us-st off">DESLOGADO</span>'}</td>
     <td class="us-dt">${usData(p.ultimoAcesso)}</td><td class="us-dt">${p.online&&eu?'agora':usData(p.visto,true)}</td>
     <td class="us-acoes"><button type="button" class="btn us-ed" data-us="editar" data-k="${esc(p.k)}" aria-label="Editar ${esc(p.name)}" title="Editar">${US_IC.ed}</button><button type="button" class="btn us-del" data-us="excluir" data-k="${esc(p.k)}" aria-label="Excluir ${esc(p.name)}" title="Excluir"${eu?' disabled':''}>${US_IC.del}</button></td></tr>`}).join('');
  return `<div class="tbl" data-aba="usuarios">   <div style="overflow-x:auto"><table class="us-tab"><thead><tr><th>Tipo</th><th>Nome</th><th>Filas</th><th>Status login</th><th>Último acesso</th><th>Visto última vez</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
   <div class="row" style="padding:12px 14px"><button type="button" class="btn pri" data-us="novo">${US_IC.novo} Novo usuário</button>
   <span class="src">Tipo: ADMIN vê e configura tudo · LÍDER vê todas as filas e edita a Base do seu setor · NORMAL vê as filas marcadas e a Triagem.</span></div></div>`;
}
const US_IC={
 ed:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>',
 del:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
 novo:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="vertical-align:-3px"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M19 8v6M16 11h6"/></svg>'};

function usModal(){
  const p=US.edit==='novo'?null:TEAM.find(x=>x.k===US.edit);if(US.edit!=='novo'&&!p)return '';
  if(US.conf){const ab=usAbertos(p.k);
    return `<div class="modal" role="dialog" aria-modal="true" aria-label="Excluir usuário"><div class="box"><h3>Excluir ${esc(p.name)}?</h3>
     <p style="margin:0">A pessoa perde o acesso na hora e libera 1 usuário do plano.</p>
     <ul class="ul">${ab?`<li>${ab} atendimento(s) em aberto voltam para a fila, sem responsável.</li>`:''}<li>O histórico (mensagens, notas, registros) continua com o nome dela.</li></ul>
     <div class="hb"><span style="flex:1"></span><button type="button" class="btn" data-us="fechar">Cancelar</button><button type="button" class="btn us-delok" data-us="excluirok">Excluir usuário</button></div></div></div>`}
  const perf=p?p.perfil:'Atendente',fl=p?p.filas:[];
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="${p?'Editar':'Novo'} usuário"><div class="box us-box"><h3>${p?'Editar usuário':'Novo usuário'}</h3>
   <label>Nome completo<input id="usn" maxlength="80" value="${esc(p?p.name:'')}" placeholder="Ex.: Ana Júlia Neves de Pádua"></label>
   <label>E-mail <span class="src">(login e marcações @ nas notas)</span><input id="use" type="email" maxlength="120" value="${esc(p?p.email:'')}" placeholder="nome@nevespaduaadvocacia.com.br"${p&&SB.ligado()?' disabled title="O e-mail é o login da pessoa. Para trocar, crie um usuário novo."':''}></label>
   <label>Função no escritório <span class="src">(aparece na lista de transferência)</span><input id="usr" maxlength="60" value="${esc(p?p.role:'')}" placeholder="Ex.: Gestão de Passivos PJ"></label>
   <label>Tipo de acesso<select id="usp">${PERFIS.map(x=>`<option${x===perf?' selected':''}>${x}</option>`).join('')}</select></label>
   <fieldset class="kb-onde" id="usfl"><legend>Filas que atende</legend>
     <div class="kb-fl">${OPQ().map(q=>`<label class="chk"><input type="checkbox" data-usfila="${q}"${fl.includes(q)?' checked':''}> ${esc(qName(q))}</label>`).join('')}</div>
     <label class="chk"><input type="checkbox" id="ust"${p&&p.todos?' checked':''}> Também vê a fila “Todos os clientes”</label>
     <span class="src">Todos veem a Triagem. Líder e administrador veem todas as filas pelo próprio perfil.</span></fieldset>
   ${p?'':`<p class="src" style="margin:0">${SB.ligado()?'A pessoa recebe um e-mail com o link para criar a senha. Se ela já tem login no sistema jurídico, usa o mesmo e não recebe e-mail.':'Na versão conectada, a pessoa recebe um e-mail para criar a senha.'}</p>`}
   <div class="hb"><span style="flex:1"></span><button type="button" class="btn" data-us="fechar">Cancelar</button><button type="button" class="btn pri" data-us="salvar">Salvar</button></div></div></div>`;
}
function usAbrir(){let h=$('#ushost');if(!h){h=document.createElement('div');h.id='ushost';document.body.appendChild(h)}h.innerHTML=usModal();usPerfilMudou();const n=$('#usn');if(n&&!n.value)n.focus()}
function usFechar(){US.edit=null;US.conf=false;const h=$('#ushost');if(h)h.innerHTML=''}
function usPerfilMudou(){const s=$('#usp'),f=$('#usfl');if(!s||!f)return;const todasPeloPerfil=s.value!=='Atendente';f.querySelectorAll('input').forEach(i=>i.disabled=todasPeloPerfil);f.classList.toggle('us-off',todasPeloPerfil)}
function usSalvar(){
  const p=US.edit==='novo'?null:TEAM.find(x=>x.k===US.edit);
  const nome=$('#usn').value.trim().replace(/\s+/g,' '),email=$('#use').value.trim().toLowerCase(),perfil=$('#usp').value;
  if(!nome){toast('Escreva o nome.');return}
  if(!emailOk(email)){toast('Informe um e-mail válido: é ele que a pessoa usa para entrar.');return}
  if(TEAM.some(x=>x!==p&&nz(x.email)===nz(email))){toast('Já existe um usuário com este e-mail.');return}
  if(TEAM.some(x=>x!==p&&nz(x.name)===nz(nome))){toast('Já existe um usuário com este nome.');return}
  if(p&&p.perfil==='Administrador'&&perfil!=='Administrador'){
    if(p.k===me()){toast('Você não pode tirar o seu próprio acesso de administrador.');return}
    if(usAdmins().length<=1){toast('O escritório precisa ter ao menos um administrador.');return}}
  const filas=perfil==='Atendente'?[...document.querySelectorAll('[data-usfila]:checked')].map(x=>x.dataset.usfila):(p?p.filas:[]);
  const dados={name:nome,email,perfil,role:$('#usr').value.trim()||perfil,filas,todos:perfil==='Atendente'&&$('#ust').checked};
  if(SB.ligado()){const bt=document.querySelector('[data-us=salvar]');if(bt)bt.disabled=true;
    DB.equipe.salvarUsuario(p,{...dados,role:$('#usr').value.trim()}).then(conv=>{usFechar();renderAll();
      toast(p?'Usuário atualizado.':conv?`Usuário criado. ${nome.split(' ')[0]} recebe agora o e-mail para criar a senha.`:`Usuário criado com o login que ${nome.split(' ')[0]} já usa no sistema jurídico.`)},
      e=>{if(bt)bt.disabled=false;toast(e.message)});return}
  if(p)Object.assign(p,dados);
  else{let k=nome.split(' ')[0];if(TEAM.some(x=>x.k===k))k=nome;TEAM.push({k,...dados,ativo:true,online:false,ultimoAcesso:null,visto:null})}
  recompute();usFechar();renderAll();toast(p?'Usuário atualizado.':`Usuário criado. ${nome.split(' ')[0]} receberia o convite por e-mail (simulado).`);
}
function usExcluir(){
  const p=TEAM.find(x=>x.k===US.edit);if(!p)return;
  if(SB.ligado()){DB.equipe.desativarUsuario(p).then(r=>{usFechar();renderAll();
    toast(`Acesso de ${p.name} ao CRM removido`+(r&&r.atendimentos?` (${r.atendimentos} atendimento(s) voltaram para a fila)`:'')+'. O login no sistema jurídico não muda.')},e=>toast(e.message));return}
  convos.forEach(c=>{if(c.owner===p.k&&c.status!=='Resolvido'){c.owner=null;c.status='Aguardando';c.msgs.push({f:'s',x:`${p.name} saiu da equipe; o atendimento voltou para a fila`,t:nowT()})}});
  LEADS.forEach(l=>{if(l.dono===p.k)l.dono=''});
  CFG.sectors.forEach(s=>{if(s.leader===p.k)s.leader=''});
  TEAM.splice(TEAM.indexOf(p),1);recompute();usFechar();renderAll();toast(`Usuário ${p.name} excluído.`)}

/* Ajustes em abas */
const CFG_ABAS=[['usuarios','Usuários'],['setores','Setores e filas'],['respostas','Tags e respostas rápidas'],['integracoes','Integrações'],['saude','Saúde']];
const abaDaSecao=t=>/Saúde/i.test(t)?'saude':/Webhooks|Número do WhatsApp/i.test(t)?'integracoes':/Tags|Respostas rápidas/i.test(t)?'respostas':'setores';
const _rs4=renderSettings;
renderSettings=function(){
  _rs4();if(S.role!=='admin')return;const cfg=$('#settings .cfg');if(!cfg)return;
  const ph=cfg.querySelector(':scope > .ph');
  [...cfg.querySelectorAll(':scope > .tbl')].forEach(s=>{const h=s.querySelector('h3');s.dataset.aba=s.dataset.aba||abaDaSecao(h?h.textContent:'')});
  ph.insertAdjacentHTML('afterend',`<div class="seg cfg-abas" role="tablist" aria-label="Seções de Ajustes">${CFG_ABAS.map(([k,l])=>`<button type="button" role="tab" data-cfgaba="${k}" aria-selected="${S.cfgAba===k}" class="${S.cfgAba===k?'on':''}">${l}</button>`).join('')}</div>${usuariosHtml()}`);
  cfg.querySelectorAll(':scope > .tbl').forEach(s=>s.hidden=s.dataset.aba!==S.cfgAba);
};

/* eventos */
document.addEventListener('click',e=>{
  const t=e.target.closest&&e.target.closest('[data-cfgaba]');if(t){S.cfgAba=t.dataset.cfgaba;renderSettings();return}
  const b=e.target.closest&&e.target.closest('[data-us]');if(!b||b.disabled||S.role!=='admin')return;const a=b.dataset.us,p=TEAM.find(x=>x.k===b.dataset.k);
  if(a==='novo'){US.edit='novo';US.conf=false;usAbrir()}
  else if(a==='editar'&&p){US.edit=p.k;US.conf=false;usAbrir()}
  else if(a==='excluir'&&p){
    if(p.k===me()){toast('Você não pode excluir o seu próprio usuário.');return}
    if(p.perfil==='Administrador'&&usAdmins().length<=1){toast('O escritório precisa ter ao menos um administrador.');return}
    if(naDemo(p.k)){toast(`${p.name} é usado no seletor “Ver como” da demonstração; não dá para excluir aqui.`);return}
    US.edit=p.k;US.conf=true;usAbrir()}
  else if(a==='excluirok')usExcluir();
  else if(a==='salvar')usSalvar();
  else if(a==='fechar')usFechar();
  else if(a==='sair'&&p&&p.k!==me()&&SB.ligado()){eqAcao(DB.equipe.encerrarSessao(p),`Sessão de ${p.name} encerrada. Para entrar de novo, a pessoa faz login.`)}
  else if(a==='sair'&&p&&p.k!==me()){p.online=false;p.visto=Date.now();renderSettings();toast(`Sessão de ${p.name} encerrada. Para entrar de novo, a pessoa faz login.`)}
});
document.addEventListener('change',e=>{if(e.target.id==='usp')usPerfilMudou();
  if(e.target.id==='role'){const p=person(ME[e.target.value]);if(p){p.online=true;p.ultimoAcesso=Date.now();p.visto=Date.now()}}});
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-act=logout]')){const p=person(me());p.online=false;p.visto=Date.now()}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&US.edit)usFechar()});
let _visto=0;document.addEventListener('click',()=>{if(!S.auth||Date.now()-_visto<5000)return;_visto=Date.now();const p=TEAM.find(x=>x.k===me());if(p){p.visto=_visto;p.online=true}});
