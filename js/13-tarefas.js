/* ===== Tarefas sobre o contato (crm_0017) =====
   Criadas na conversa (menu ⋯ → "Criar tarefa sobre o contato") por qualquer pessoa da equipe.
   Cada tarefa tem um responsável, que é o ÚNICO que a vê, na aba Tarefas (nem o administrador vê as dos outros).
   Recebem tarefas e veem a aba: administradores e quem participa da fila Comercial.
   Na demonstração, as tarefas ficam em memória; conectado, no banco (crm.tarefas, só por funções). */
const FILA_TAREFAS='comercial';   // conectado, o banco usa crm.config 'tarefas' (na produção, o código da fila Comercial)
const podeTarefas=k=>{const p=TEAM.find(x=>x.k===k);return !!p&&(p.perfil==='Administrador'||(p.filas||[]).includes(FILA_TAREFAS))};
const veTarefas=()=>S.auth&&podeTarefas(me());
const TK={carregado:false,erro:'',aba:'pend'};
const TAREFAS=[   // demonstração
 {id:'k1',tit:'Enviar a proposta revisada',desc:'O cliente pediu para ver o parcelamento em 12 vezes.',quando:'2026-11-04 17:00',dono:'Ana Júlia',por:'Ana Luiza',contato:'Marcos Tavares',tel:'+55 16 98800-0101',conv:'c1',done:false},
 {id:'k2',tit:'Ligar para apresentar o escritório',desc:'',quando:'2026-11-05 15:00',dono:'Ana Júlia',por:'Lucas',contato:'Renata Souza',tel:'+55 16 99100-0202',conv:'c2',done:false},
 {id:'k3',tit:'Confirmar reunião de diagnóstico',desc:'',quando:'2026-11-07 10:00',dono:'Gabriel',por:'Ana Luiza',contato:'Renata Moura',tel:'@renata.moura',conv:'c10',done:false}];
const minhasTarefas=()=>TAREFAS.filter(t=>SB.ligado()||t.dono===me());
const tkHoje=()=>TODAY;
const tarefasUrgentes=()=>veTarefas()?minhasTarefas().filter(t=>!t.done&&t.quando.slice(0,10)<=tkHoje()).length:0;
const tkLocalISO=v=>v?new Date(v).toISOString():null;   // datetime-local (hora de Brasília no navegador) -> ISO
const tkAmanha=()=>{const d=new Date(tkHoje()+'T12:00:00');d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)+'T09:00'};

DB.tarefas={
  async carregar(){
    if(!SB.ligado())return;
    try{const L=await SB.todos('tarefas','select=id,titulo,descricao,quando,criado_por,conversa_ref,contato_nome,contato_telefone,concluida&order=concluida,quando,id');
      TAREFAS.splice(0,TAREFAS.length,...L.map(t=>({id:t.id,tit:t.titulo,desc:t.descricao||'',quando:dataLocal(t.quando),dono:me(),por:nomeDoId(t.criado_por)||'—',
        contato:t.contato_nome||'',tel:t.contato_telefone||'',conv:t.conversa_ref,done:t.concluida})));TK.carregado=true;TK.erro=''}
    catch(e){TK.erro=e.message}},
  async criar(c,d){
    if(SB.ligado()){await SB.rpc('tarefa_criar',{p_titulo:d.tit,p_quando:tkLocalISO(d.quando),p_responsavel:idDe(d.dono),p_descricao:d.desc||null,
      p_conversa_ref:c.id,p_contato_nome:c.name,p_contato_telefone:c.phone});if(d.dono===me())await DB.tarefas.carregar();return}
    if(!d.tit)throw new Error('Escreva o que precisa ser feito.');if(!d.quando)throw new Error('Escolha o prazo da tarefa.');
    if(!podeTarefas(d.dono))throw new Error('A tarefa só pode ir para um administrador ou para quem está na fila Comercial.');
    TAREFAS.push({id:uid('k'),tit:d.tit,desc:d.desc,quando:d.quando.replace('T',' '),dono:d.dono,por:me(),contato:c.name,tel:c.phone,conv:c.id,done:false})},
  async concluir(id,feita){if(SB.ligado()){await SB.rpc('tarefa_concluir',{p_id:id,p_feita:!!feita});return DB.tarefas.carregar()}
    const t=TAREFAS.find(x=>x.id===id&&x.dono===me());if(!t)throw new Error('Tarefa não encontrada.');t.done=!!feita},
  async adiar(id,quando){if(!quando)throw new Error('Escolha o novo prazo.');
    if(SB.ligado()){await SB.rpc('tarefa_adiar',{p_id:id,p_quando:tkLocalISO(quando)});return DB.tarefas.carregar()}
    const t=TAREFAS.find(x=>x.id===id&&x.dono===me());if(!t)throw new Error('Tarefa não encontrada.');t.quando=quando.replace('T',' ')},
  async excluir(id){if(SB.ligado()){await SB.rpc('tarefa_excluir',{p_id:id});return DB.tarefas.carregar()}
    const i=TAREFAS.findIndex(x=>x.id===id&&x.dono===me());if(i<0)throw new Error('Tarefa não encontrada.');TAREFAS.splice(i,1)}
};
function tkAcao(p,msg){Promise.resolve(p).then(()=>{renderAll();if(msg)toast(msg)},e=>{toast(e&&e.message||String(e));DB.tarefas.carregar().then(renderAll)})}

/* bandeja na conversa */
function tarefaTray(c){
  const resp=TEAM.filter(p=>podeTarefas(p.k)),pad=podeTarefas(me())?me():(resp[0]||{}).k;
  return `<div class="tray"><b>Nova tarefa sobre ${esc(c.name)}</b>
    <label>O que fazer<input id="tk-tit" maxlength="200" placeholder="Ex.: Ligar para apresentar a proposta"></label>
    <label>Detalhes (opcional)<textarea id="tk-desc" rows="2" maxlength="2000" placeholder="O que a pessoa precisa saber para fazer a tarefa"></textarea></label>
    <div class="row"><label>Prazo<input id="tk-quando" type="datetime-local" value="${tkAmanha()}"></label>
    <label>Responsável<select id="tk-resp">${resp.length?optH(resp.map(p=>[p.k,p.name]),pad):'<option value="">Ninguém pode receber tarefas</option>'}</select></label></div>
    <span class="src">Só o responsável vê a tarefa, na aba Tarefas. Recebem tarefas os administradores e quem está na fila Comercial.</span>
    <div class="row"><button class="btn" type="button" data-act="tray" data-v="">Cancelar</button><button class="btn pri" type="button" data-tk="criar">Criar tarefa</button></div></div>`}

/* aba Tarefas */
function renderTarefas(){
  const el=$('#tarefas');if(!el)return;
  if(!veTarefas()){el.innerHTML='';return}
  if(SB.ligado()&&!TK.carregado&&!TK.erro){DB.tarefas.carregar().then(renderTarefas)}
  const L=minhasTarefas(),pend=L.filter(t=>!t.done),feitas=L.filter(t=>t.done),hoje=tkHoje();
  const g={Atrasadas:pend.filter(t=>t.quando.slice(0,10)<hoje),'Para hoje':pend.filter(t=>t.quando.slice(0,10)===hoje),'Próximas':pend.filter(t=>t.quando.slice(0,10)>hoje)};
  const linha=t=>{const late=!t.done&&t.quando.slice(0,10)<hoje,cv=convos.find(x=>x.id===t.conv&&canSee(x));
    return `<div class="tk-row${late?' late':''}${t.done?' dn':''}"><input type="checkbox" data-tk="feita" data-id="${esc(t.id)}"${t.done?' checked':''} aria-label="Concluída: ${esc(t.tit)}">
      <div><b class="tk-t">${esc(t.tit)}</b>${t.desc?`<br><span>${esc(t.desc)}</span>`:''}<br><span class="src">${esc(t.contato||'—')}${t.tel?' · '+esc(t.tel):''} · <span class="tk-q">prazo ${esc(fmtTk(t.quando))}</span> · criada por ${esc(t.por)}</span></div>
      <div class="tk-acoes">${cv?`<button type="button" class="btn" data-tk="conv" data-id="${esc(t.id)}">Abrir conversa</button>`:''}
        ${t.done?'':`<label class="src">Novo prazo <input type="datetime-local" data-tk="adiar" data-id="${esc(t.id)}" value="${esc(t.quando.replace(' ','T'))}"></label>`}
        <button type="button" class="xbtn" data-tk="excluir" data-id="${esc(t.id)}" aria-label="Excluir tarefa" title="Excluir">×</button></div></div>`};
  const corpo=SB.ligado()&&!TK.carregado?(TK.erro?`<div class="empty"><b>Não foi possível carregar</b>${esc(TK.erro)}</div>`:'<div class="empty"><b>Carregando…</b></div>')
    :TK.aba==='pend'?Object.entries(g).map(([n,X])=>`<div class="tbl"><h3>${n} (${X.length})</h3>${X.map(linha).join('')||'<p class="src" style="padding:0 14px 12px;margin:0">Nada aqui.</p>'}</div>`).join('')
    :`<div class="tbl"><h3>Concluídas (${feitas.length})</h3>${feitas.map(linha).join('')||'<p class="src" style="padding:0 14px 12px;margin:0">Nenhuma tarefa concluída.</p>'}</div>`;
  el.innerHTML=`<div class="mod">${pageHead('Minhas tarefas','Só você vê as suas tarefas. Para criar uma, abra a conversa do contato → ⋯ → Criar tarefa.'+(SB.ligado()?' · Conectado ao banco ('+esc(AMBIENTE.rotulo)+')':''))}
    ${subTabs(TK.aba,[['pend','Pendentes ('+pend.length+')'],['feitas','Concluídas']],'tkaba')}${corpo}</div>`}
const fmtTk=q=>{const [d,h]=String(q).split(' '),p=d.split('-');return p[2]+'/'+p[1]+(h?' '+h:'')};

document.addEventListener('click',e=>{
  const a=e.target.closest&&e.target.closest('[data-x=tkaba]');if(a){TK.aba=a.dataset.v;renderTarefas();return}
  const b=e.target.closest&&e.target.closest('[data-tk]');if(!b||b.tagName==='INPUT')return;const id=b.dataset.id;
  if(b.dataset.tk==='criar'){const c=cur();if(!c)return;const d={tit:$('#tk-tit').value.trim(),desc:$('#tk-desc').value.trim(),quando:$('#tk-quando').value,dono:$('#tk-resp').value};
    if(!d.tit){toast('Escreva o que precisa ser feito.');return}if(!d.quando){toast('Escolha o prazo da tarefa.');return}if(!d.dono){toast('Escolha o responsável.');return}
    b.disabled=true;const p=person(d.dono);
    tkAcao(DB.tarefas.criar(c,d).then(()=>{S.tray=null;c.msgs.push({f:'s',x:`${me()} criou uma tarefa para ${p.name}: “${d.tit}”`,t:nowT()})}),
      d.dono===me()?'Tarefa criada. Ela está na sua aba Tarefas.':`Tarefa criada para ${p.name}. Só ${p.name.split(' ')[0]} vê a tarefa.`)}
  else if(b.dataset.tk==='excluir')tkAcao(DB.tarefas.excluir(id),'Tarefa excluída.');
  else if(b.dataset.tk==='conv'){const t=TAREFAS.find(x=>x.id===id),c=t&&convos.find(x=>x.id===t.conv);
    if(c&&canSee(c)){S.view='atend';S.sel=c.id;S.queue=ACCESS[S.role].includes('todos')?'todos':'minha';S.pane='chat';renderAll()}else toast('Você não tem acesso à fila dessa conversa.')}
});
document.addEventListener('change',e=>{const el=e.target;if(!el.dataset||!el.dataset.tk)return;
  if(el.dataset.tk==='feita')tkAcao(DB.tarefas.concluir(el.dataset.id,el.checked),el.checked?'Tarefa concluída.':'Tarefa reaberta.');
  else if(el.dataset.tk==='adiar')tkAcao(DB.tarefas.adiar(el.dataset.id,el.value),'Prazo atualizado.')});
/* conectado: recarrega a cada minuto (tarefas criadas por colegas aparecem sem recarregar a página) */
setInterval(()=>{if(!SB.ligado()||!S.auth||!veTarefas())return;const f=document.activeElement;if(f&&f.closest&&f.closest('#tarefas')&&f.tagName==='INPUT')return;
  DB.tarefas.carregar().then(()=>{renderTop();if(S.view==='tarefas')renderTarefas()})},60000);
