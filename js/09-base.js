/* ===== Base de conhecimento: procedimentos por fila =====
   - Procedimento "Todas as filas" aparece em qualquer conversa; os demais, só nas filas marcadas.
   - Sem conversa aberta: aparecem os gerais e os das filas da pessoa.
   - Quem edita: administrador (tudo) e líder de setor (só procedimentos das filas que lidera; os gerais são do administrador).
   - A Base é para procedimentos; o texto pronto fica nas respostas rápidas (/) e o procedimento só aponta qual usar.
   Conectado (parte 6): crm.base_artigos / base_artigo_filas / base_artigo_historico (crm_0013) e crm.restaurar_artigo (crm_0023).
   Quem vê o quê é o RLS do banco; gravar, excluir e restaurar passam pelas funções do banco, que conferem a permissão de novo.
   Líder e administrador veem o histórico de versões; o administrador vê os excluídos e restaura. */
const KB={edit:null,conf:false,todas:false};
const KBC={carregado:false,erro:'',excl:[],hist:{},verExcl:false,histDe:null,versao:null,salvando:false};
if(SB.ligado())ARTICLES.length=0;   // nada de procedimento de demonstração no banco
const artDoBanco=r=>({id:r.id,t:r.titulo,sec:r.todas_filas?['todos']:(r.base_artigo_filas||[]).map(x=>x.fila_ref),when:r.quando_usar||'',
  steps:Array.isArray(r.passos)?r.passos:[],care:r.cuidados||'',esc:r.quando_escalar||'',quick:r.resposta_rapida||'',
  por:nomeDoId(r.atualizado_por)||'—',em:r.updated_at?new Date(r.updated_at).toLocaleDateString('pt-BR'):'—',versao:r.versao,ativo:r.ativo!==false});
DB.base={
  async carregar(){if(!SB.ligado()||!SB.sessao)return;
    try{const L=await SB.todos('base_artigos','select=id,titulo,todas_filas,quando_usar,passos,cuidados,quando_escalar,resposta_rapida,versao,ativo,atualizado_por,updated_at,base_artigo_filas(fila_ref)&order=titulo');
      const A=(L||[]).map(artDoBanco);ARTICLES.splice(0,ARTICLES.length,...A.filter(a=>a.ativo));KBC.excl=A.filter(a=>!a.ativo);KBC.carregado=true;KBC.erro=''}
    catch(e){KBC.erro=e.message}},
  async salvar(a,n){const id=await SB.rpc('salvar_artigo',{p_id:a?a.id:null,p_titulo:n.t,p_todas_filas:kbGeral(n),p_filas:kbGeral(n)?[]:n.sec,
      p_quando_usar:n.when||null,p_passos:n.steps,p_cuidados:n.care||null,p_quando_escalar:n.esc||null,p_resposta_rapida:n.quick||null});
    delete KBC.hist[id];await DB.base.carregar();return id},
  async excluir(id){await SB.rpc('excluir_artigo',{p_id:id});delete KBC.hist[id];return DB.base.carregar()},
  async restaurar(id){await SB.rpc('restaurar_artigo',{p_id:id});delete KBC.hist[id];return DB.base.carregar()},
  async historico(id){KBC.hist[id]=await SB.sel('base_artigo_historico','select=id,versao,acao,dados,user_id,criado_em&artigo_id=eq.'+encodeURIComponent(id)+'&order=criado_em.desc,id.desc&limit=30')||[]}
};
const kbGestor=()=>S.role==='admin'||S.role==='lider';
const KB_ACAO={criado:'Criado',alterado:'Alterado',excluido:'Excluído',restaurado:'Restaurado'};
const filasBase=()=>QUEUES.filter(q=>!['minha','mencoes','todos'].includes(q.id));
const filasQueLidera=k=>CFG.sectors.filter(s=>s.leader===k).map(s=>s.id);
const kbGeral=a=>a.sec.includes('todos');
const kbFilasTxt=a=>kbGeral(a)?'Todas as filas':a.sec.map(qName).join(', ');
function kbPodeEditar(a){
  if(S.role==='admin')return true;
  if(S.role!=='lider')return false;
  const minhas=filasQueLidera(me());
  if(!a)return minhas.length>0;
  return !kbGeral(a)&&a.sec.length>0&&a.sec.every(q=>minhas.includes(q));
}
const kbPodeCriar=()=>kbPodeEditar(null);
function kbVisiveis(c){
  if(KB.todas&&(S.role==='admin'||S.role==='lider'))return ARTICLES.slice();
  if(c)return ARTICLES.filter(a=>kbGeral(a)||a.sec.includes(c.queue));
  const minhas=ACCESS[S.role]||[];
  return ARTICLES.filter(a=>kbGeral(a)||a.sec.some(q=>minhas.includes(q)));
}
DB.salvarArtigo=a=>{const i=ARTICLES.findIndex(x=>x.id===a.id);if(i>=0)ARTICLES[i]=a;else ARTICLES.push(a);return a};
DB.excluirArtigo=id=>{const i=ARTICLES.findIndex(x=>x.id===id);if(i>=0)ARTICLES.splice(i,1);return i>=0};

function kbListaHtml(c){
  const q=nz(S.kbq).trim();
  const txt=a=>nz([a.t,a.when,(a.steps||[]).join(' '),a.care,a.esc].join(' '));
  let list=kbVisiveis(c).filter(a=>!q||txt(a).includes(q));
  const daFila=a=>c&&!kbGeral(a)&&a.sec.includes(c.queue);
  list=list.sort((a,b)=>daFila(b)-daFila(a)||a.t.localeCompare(b.t,'pt-BR'));
  const gestor=S.role==='admin'||S.role==='lider';
  const ctx=KB.todas?'Mostrando a base inteira (todas as filas).':c?`Procedimentos gerais e da fila <b>${esc(qName(c.queue))}</b>.`:'Procedimentos gerais e das suas filas.';
  if(SB.ligado()&&!KBC.carregado)return `<div class="sd">${KBC.erro?`<span class="src">Não foi possível carregar a Base: ${esc(KBC.erro)}</span><button type="button" class="btn" data-kb="recarregar">Tentar de novo</button>`:'<span class="src">Carregando a Base…</span>'}</div>`;
  const excl=SB.ligado()&&S.role==='admin'&&KBC.excl.length?`<label class="src kb-todas"><input type="checkbox" data-kb="excl"${KBC.verExcl?' checked':''}> Ver excluídos (${KBC.excl.length})</label>`:'';
  const exclLista=excl&&KBC.verExcl?`<span class="src"><b>Excluídos</b> · só o administrador vê; abra para restaurar.</span>${KBC.excl.filter(a=>!q||txt(a).includes(q)).map(a=>`<button type="button" class="art kb-excl" data-act="kb" data-id="${a.id}"><span class="sug-b">Excluído</span>${esc(a.t)}<small>${esc(kbFilasTxt(a))}</small></button>`).join('')}`:'';
  const vazio=q?'Nenhum procedimento encontrado.':SB.ligado()&&!ARTICLES.length?(kbPodeCriar()?'A Base ainda está vazia. Crie o primeiro procedimento.':'A Base ainda está vazia. Os procedimentos são escritos pelo administrador e pelos líderes.'):'Nenhum procedimento para esta fila ainda.';
  return `<div class="sd"><input id="kbq" class="kb-s" type="search" placeholder="Buscar procedimento" aria-label="Buscar na base" value="${esc(S.kbq)}">
    <div class="kb-ctx"><span class="src">${ctx}</span>${gestor?`<label class="src kb-todas"><input type="checkbox" data-kb="todas"${KB.todas?' checked':''}> Ver todas as filas</label>`:''}</div>
    ${excl}${kbPodeCriar()?'<button type="button" class="btn" data-kb="novo">+ Novo procedimento</button>':''}
    ${list.length?list.map(a=>`<button type="button" class="art" data-act="kb" data-id="${a.id}">${daFila(a)&&!q?`<span class="sug-b">Desta fila</span>`:''}${esc(a.t)}<small>${esc(kbFilasTxt(a))}</small></button>`).join('')
      :`<span class="src">${vazio}</span>`}${exclLista}</div>`;
}

/* histórico de versões (líder e administrador, conectado) */
function kbHistHtml(a){
  if(!SB.ligado()||!kbGestor())return '';
  if(KBC.histDe!==a.id)return `<button type="button" class="btn" data-kb="hist" data-id="${a.id}">Histórico${a.versao?` (versão ${a.versao})`:''}</button>`;
  const L=KBC.hist[a.id];if(!L)return '<span class="src">Carregando o histórico…</span>';
  const ver=L.find(h=>h.id===KBC.versao),d=ver&&ver.dados||{};
  const foto=ver?`<div class="kb-foto"><b>Versão ${ver.versao} · ${esc(d.titulo||'')}</b><span class="src">${d.todas_filas?'Todas as filas':(d.filas||[]).map(qName).join(', ')}</span>
    ${d.quando_usar?`<div><h3>Quando usar</h3>${esc(d.quando_usar)}</div>`:''}${(d.passos||[]).length?`<div><h3>Passo a passo</h3><ol class="ul kb-passos">${d.passos.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>`:''}
    ${d.cuidados?`<div><h3>Cuidados</h3>${esc(d.cuidados)}</div>`:''}${d.quando_escalar?`<div><h3>Quando escalar</h3>${esc(d.quando_escalar)}</div>`:''}${d.resposta_rapida?`<div><h3>Resposta rápida</h3>${esc(d.resposta_rapida)}</div>`:''}</div>`:'';
  return `<div class="kb-hist"><div class="row"><b>Histórico</b><button type="button" class="xbtn" data-kb="hist" data-id="${a.id}" aria-label="Fechar o histórico">×</button></div>
    <ol class="kb-hl">${L.map(h=>`<li><span>v${h.versao} · <b>${KB_ACAO[h.acao]||esc(h.acao)}</b> por ${esc(nomeDoId(h.user_id)||'ex-usuário')} · ${esc(fxData(h.criado_em))}</span>${h.acao==='excluido'?'':`<button type="button" class="btn" data-kb="versao" data-id="${h.id}" aria-pressed="${KBC.versao===h.id}">${KBC.versao===h.id?'Esconder':'Ver'}</button>`}</li>`).join('')||'<li class="src">Sem registros.</li>'}</ol>${foto}</div>`}
function kbDetalheHtml(c){
  const exc=SB.ligado()&&S.role==='admin'?KBC.excl.find(x=>x.id===S.kb):null;
  if(exc)return `<div class="sd"><button type="button" class="back" data-act="kb" data-id="">← Todos os procedimentos</button>
    <div><h3 class="kb-t">${esc(exc.t)}</h3><span class="pill bad">Excluído</span> <span class="src">${esc(kbFilasTxt(exc))}</span></div>
    <p class="src" style="margin:0">Excluído por ${esc(exc.por)} em ${esc(exc.em)}. Ninguém mais vê este procedimento. Restaurar traz de volta com as mesmas filas.</p>
    <div class="hb"><button type="button" class="btn pri" data-kb="restaurar" data-id="${exc.id}">Restaurar</button></div>${kbHistHtml(exc)}</div>`;
  const a=ARTICLES.find(x=>x.id===S.kb);
  if(!a)return `<div class="sd"><button type="button" class="back" data-act="kb" data-id="">← Todos os procedimentos</button><span class="src">Este procedimento foi excluído.</span></div>`;
  const sec=(t,v)=>v?`<div><h3>${t}</h3>${esc(v)}</div>`:'';
  const qk=a.quick&&QUICK[a.quick];
  return `<div class="sd"><button type="button" class="back" data-act="kb" data-id="">← Todos os procedimentos</button>
    <div><h3 class="kb-t">${esc(a.t)}</h3><span class="kb-filas">${kbGeral(a)?'<span class="pill pause">Todas as filas</span>':a.sec.map(q=>`<span class="pill info">${esc(qName(q))}</span>`).join(' ')}</span></div>
    ${sec('Quando usar',a.when)}
    ${(a.steps||[]).length?`<div><h3>Passo a passo</h3><ol class="ul kb-passos">${a.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>`:''}
    ${sec('Cuidados',a.care)}${sec('Quando escalar',a.esc)}
    ${a.quick?`<div><h3>Resposta rápida</h3>${qk?`<button type="button" class="btn" data-kb="usarq" data-k="${esc(a.quick)}"${c&&c.status!=='Resolvido'?'':' disabled'} title="${esc(QUICK[a.quick].slice(0,140))}">Usar ${esc(a.quick)} na conversa</button>`:`<span class="src">${esc(a.quick)} não existe mais nas respostas rápidas.</span>`}</div>`:''}
    <div class="kb-rod"><span class="src">Atualizado por ${esc(a.por||'—')} em ${esc(a.em||'—')}</span><span class="hb">${kbPodeEditar(a)?`<button type="button" class="btn" data-kb="editar" data-id="${a.id}">Editar</button>`:''}</span></div>
    ${kbHistHtml(a)}</div>`;
}

function kbModal(){
  const a=KB.edit==='novo'?null:ARTICLES.find(x=>x.id===KB.edit);if(KB.edit!=='novo'&&!a)return '';
  const adm=S.role==='admin',minhas=adm?filasBase().map(q=>q.id):filasQueLidera(me());
  const sec=a?a.sec:(adm?['todos']:[minhas[0]].filter(Boolean)),geral=sec.includes('todos');
  const fl=filasBase().filter(q=>adm||minhas.includes(q.id));
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="${a?'Editar':'Novo'} procedimento"><div class="box kb-box"><h3>${a?'Editar procedimento':'Novo procedimento'}</h3>
   <label>Título<input id="kbt" maxlength="120" value="${esc(a?a.t:'')}" placeholder="Ex.: Cliente pede para mudar a data do boleto"></label>
   <fieldset class="kb-onde"><legend>Onde aparece</legend>
     <label class="chk"><input type="radio" name="kbonde" value="todas"${geral?' checked':''}${adm?'':' disabled'}> Todas as filas${adm?'':' <span class="src">(só o administrador)</span>'}</label>
     <label class="chk"><input type="radio" name="kbonde" value="filas"${geral?'':' checked'}> Só nestas filas:</label>
     <div class="kb-fl">${fl.map(q=>`<label class="chk"><input type="checkbox" data-kbfila="${q.id}"${!geral&&sec.includes(q.id)?' checked':''}${geral?' disabled':''}> ${esc(q.name)}</label>`).join('')}</div>
     ${adm?'':'<span class="src">Como líder, você edita os procedimentos das filas que lidera.</span>'}</fieldset>
   <label>Quando usar<textarea id="kbw" rows="2" placeholder="Em que situação a equipe deve seguir este procedimento">${esc(a?a.when:'')}</textarea></label>
   <label>Passo a passo <span class="src">(um passo por linha)</span><textarea id="kbs" rows="5" placeholder="Conferir…&#10;Enviar…&#10;Registrar…">${esc(a?(a.steps||[]).join('\n'):'')}</textarea></label>
   <label>Cuidados<textarea id="kbc" rows="2" placeholder="O que não fazer, sigilo, limites">${esc(a?a.care:'')}</textarea></label>
   <label>Quando escalar<textarea id="kbe" rows="2" placeholder="Quando passar ao líder ou ao advogado responsável">${esc(a?a.esc:'')}</textarea></label>
   <label>Resposta rápida relacionada <span class="src">(opcional; o texto pronto fica no /)</span><select id="kbq2"><option value="">Nenhuma</option>${Object.keys(QUICK).map(k=>`<option value="${esc(k)}"${a&&a.quick===k?' selected':''}>${esc(k)}</option>`).join('')}</select></label>
   <div class="hb">${a&&!KB.conf?'<button type="button" class="btn kb-del" data-kb="excluir">Excluir</button>':''}
     ${KB.conf?`<span class="kb-confirma">Excluir “${esc(a.t)}” para todas as filas?</span><button type="button" class="btn kb-del" data-kb="excluirok">Sim, excluir</button><button type="button" class="btn" data-kb="excluirno">Não</button>`
       :`<span style="flex:1"></span><button type="button" class="btn" data-kb="cancelar">Cancelar</button><button type="button" class="btn pri" data-kb="salvar">Salvar</button>`}</div></div></div>`;
}
function kbAbrirModal(){let h=$('#kbhost');if(!h){h=document.createElement('div');h.id='kbhost';document.body.appendChild(h)}h.innerHTML=kbModal();const t=$('#kbt');if(t&&!t.value)t.focus()}
function kbFechar(){KB.edit=null;KB.conf=false;const h=$('#kbhost');if(h)h.innerHTML=''}
function kbSalvar(){
  const a=KB.edit==='novo'?null:ARTICLES.find(x=>x.id===KB.edit);
  const t=$('#kbt').value.trim();if(!t){toast('Dê um título ao procedimento.');$('#kbt').focus();return}
  const todas=(document.querySelector('input[name=kbonde]:checked')||{}).value==='todas';
  const fl=[...document.querySelectorAll('[data-kbfila]:checked')].map(x=>x.dataset.kbfila);
  if(!todas&&!fl.length){toast('Marque ao menos uma fila, ou “Todas as filas”.');return}
  const steps=$('#kbs').value.split('\n').map(x=>x.replace(/^\s*(\d+[.)]|[-•*])\s*/,'').trim()).filter(Boolean);
  if(!steps.length&&!$('#kbw').value.trim()){toast('Escreva ao menos “Quando usar” ou um passo.');return}
  const novo={id:a?a.id:uid('a'),t,sec:todas?['todos']:fl,when:$('#kbw').value.trim(),steps,care:$('#kbc').value.trim(),esc:$('#kbe').value.trim(),quick:$('#kbq2').value||'',por:me(),em:new Date().toLocaleDateString('pt-BR')};
  if(!kbPodeEditar(novo)||(a&&!kbPodeEditar(a))){toast('Você só pode salvar procedimentos das filas que lidera.');return}
  const c=cur(),fora=c&&!kbGeral(novo)&&!novo.sec.includes(c.queue);
  const msg=(a?'Procedimento atualizado.':'Procedimento criado.')+(fora?' Ele não aparece na lista desta conversa porque é de outra fila.':'');
  if(SB.ligado()){if(KBC.salvando)return;KBC.salvando=true;const bt=document.querySelector('[data-kb=salvar]');if(bt)bt.disabled=true;
    DB.base.salvar(a,novo).then(id=>{S.kb=id;kbFechar();renderSide();toast(msg)},e=>{if(bt)bt.disabled=false;toast(e.message)}).finally(()=>{KBC.salvando=false});return}
  DB.salvarArtigo(novo);S.kb=novo.id;kbFechar();renderSide();toast(msg);
}

document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-kb]');if(!b||b.type==='checkbox')return;const a=b.dataset.kb;
  if(a==='novo'){if(!kbPodeCriar())return;KB.edit='novo';KB.conf=false;kbAbrirModal()}
  else if(a==='editar'){const x=ARTICLES.find(y=>y.id===b.dataset.id);if(!x||!kbPodeEditar(x))return;KB.edit=x.id;KB.conf=false;kbAbrirModal()}
  else if(a==='cancelar')kbFechar();
  else if(a==='salvar')kbSalvar();
  else if(a==='excluir'){KB.conf=true;kbAbrirModal()}
  else if(a==='excluirno'){KB.conf=false;kbAbrirModal()}
  else if(a==='excluirok'){const x=ARTICLES.find(y=>y.id===KB.edit);if(!x||!kbPodeEditar(x))return;
    if(SB.ligado()){b.disabled=true;DB.base.excluir(x.id).then(()=>{S.kb=null;kbFechar();renderSide();toast('Procedimento excluído. O administrador ainda pode restaurá-lo.')},e=>{b.disabled=false;toast(e.message)});return}
    DB.excluirArtigo(x.id);S.kb=null;kbFechar();renderSide();toast('Procedimento excluído.')}
  else if(a==='restaurar'&&SB.ligado()&&S.role==='admin'){b.disabled=true;DB.base.restaurar(b.dataset.id).then(()=>{renderSide();toast('Procedimento restaurado.')},e=>{b.disabled=false;toast(e.message)})}
  else if(a==='hist'&&SB.ligado()){const id=b.dataset.id;KBC.versao=null;if(KBC.histDe===id){KBC.histDe=null;renderSide();return}KBC.histDe=id;renderSide();
    DB.base.historico(id).then(()=>{if(KBC.histDe===id)renderSide()},e=>{KBC.histDe=null;renderSide();toast(e.message)})}
  else if(a==='versao'){const id=+b.dataset.id;KBC.versao=KBC.versao===id?null:id;renderSide()}
  else if(a==='recarregar'){KBC.erro='';renderSide();DB.base.carregar().then(renderSide)}
  else if(a==='usarq'){const c=cur();if(c&&QUICK[b.dataset.k]){setDraft(c,fillText(QUICK[b.dataset.k],c));toast('Resposta inserida. Preencha o que está entre colchetes antes de enviar.')}}
});
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset&&el.dataset.kb==='todas'){KB.todas=el.checked;renderSide();return}
  if(el.dataset&&el.dataset.kb==='excl'){KBC.verExcl=el.checked;renderSide();return}
  if(el.name==='kbonde'){document.querySelectorAll('[data-kbfila]').forEach(x=>x.disabled=el.value==='todas'&&el.checked)}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&KB.edit)kbFechar()});
/* conectado: procedimentos mudam pouco; recarrega a cada 5 minutos (e depois de cada gravação) */
setInterval(()=>{if(SB.ligado()&&S.auth&&!KB.edit)DB.base.carregar().then(()=>{if(S.tab==='base')renderSide()})},300000);
document.addEventListener('click',e=>{if(SB.ligado()&&e.target.closest&&e.target.closest('[data-act=logout]')){ARTICLES.length=0;KBC.carregado=false;KBC.excl=[];KBC.hist={};KBC.histDe=null;KBC.verExcl=false}},true);
