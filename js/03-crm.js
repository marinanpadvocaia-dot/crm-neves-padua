/* ---- CRM (Pipedrive) ---- */
/* Só do setor comercial (fila Comercial e administrador), sem divisão por dono e com um funil só (pedido de 16/11/2026, crm_0024).
   O código interno do funil continua 'pj' (fluxos e importações já gravados apontam para ele). As duas últimas etapas são Ganho e Perdido. */
const PIPES=[
 {id:'pj',nome:'Comercial',etapas:['Novo lead','Em contato','Qualificado','Reunião agendada','Proposta enviada','Negociação','Ganho','Perdido']}];
const FILA_COMERCIAL='comercial';
/* quem usa o CRM: administrador, quem está na fila Comercial ou quem lidera essa fila (o banco confere a mesma regra) */
const veCRM=()=>{if(!S.auth)return false;if(S.role==='admin')return true;const p=TEAM.find(x=>x.k===me());
  return !!p&&((p.filas||[]).includes(FILA_COMERCIAL)||CFG.sectors.some(s=>s.id===FILA_COMERCIAL&&s.leader===me()))};
const ST=p=>(PIPES.find(x=>x.id===(p||M.pipe))||PIPES[0]).etapas;
const STAGES=[...new Set(PIPES.flatMap(p=>p.etapas))];
const PROB={'Novo lead':10,'Em contato':20,'Qualificado':35,'Reunião agendada':50,'Proposta enviada':65,'Negociação':80,'Ganho':100,'Perdido':0,'Análise das dívidas':20,'Plano de pagamento':40,'Documentação':55,'Ajuizamento':70,'Audiência':85,'Levantamento':20,'Proposta ao banco':40,'Contraproposta':60,'Minuta do acordo':80,'Assinatura':90};
const ORIGENS=['Meta Ads','Google Ads','Indicação','Instagram','Orgânico'];
const PERDAS=['Sem resposta','Foi para outro escritório','Sem condições financeiras','Resolveu sozinho','Fora do perfil'];
const TIPOS=['Ligação','Reunião','Follow-up','Tarefa'];
const CAMPOS=[{id:'banco',nome:'Banco principal',tipo:'texto'},{id:'divida',nome:'Dívida total estimada (R$)',tipo:'número'},{id:'urg',nome:'Urgência',tipo:'lista',opts:['Baixa','Média','Alta']}];
const DIAS_ETAPA={'Novo lead':1,'Em contato':2,'Qualificado':3,'Reunião agendada':4,'Proposta enviada':5,'Negociação':6};
const mk=(id,name,org,phone,valor,etapa,dono,origem,prev,extra)=>Object.assign({id,name,org,phone,valor,etapa,prob:PROB[etapa],dono,origem,prev,conv:null,form:[],tasks:[],custom:{},perda:'',pipe:(extra&&extra.pipe)||'pj',max:0,closed:false},extra||{},{max:Math.min(5,Math.max(0,ST((extra&&extra.pipe)||'pj').indexOf(etapa)))});
const LEADS=[
 mk('l1','Lead do anúncio (conversa c2)','Tavares & Filhos','+55 16 98800-0202',18000,'Em contato','Gabriel','Meta Ads','2026-11-30',{conv:'c2',form:[{p:'Qual o tamanho da empresa?',r:'11 a 50 funcionários'},{p:'Qual o valor aproximado das dívidas?',r:'R$ 300 mil a R$ 1 milhão'},{p:'Quantos bancos?',r:'3'}],tasks:[{id:'t1',tipo:'Ligação',tit:'Ligar e entender a dívida',quando:'2026-11-05 11:00',done:false,dono:'Gabriel'}],custom:{banco:'Banco A',urg:'Alta'}}),
 mk('l2','Renata Moura','Instagram direct','@renata.moura',9000,'Novo lead','Gabriel','Instagram','2026-12-10',{conv:'c10',tasks:[]}),
 mk('l3','Oficina Santos ME','Santos Mecânica','+55 16 99700-0303',24000,'Qualificado','Gabriel','Google Ads','2026-11-20',{form:[{p:'Qual o valor aproximado das dívidas?',r:'Acima de R$ 1 milhão'}],tasks:[{id:'t2',tipo:'Reunião',tit:'Reunião de diagnóstico',quando:'2026-11-04 15:00',done:false,dono:'Gabriel'}],custom:{divida:'1200000',urg:'Média'}}),
 mk('l4','Mercado Bom Preço','Bom Preço Ltda','+55 16 99600-0404',30000,'Reunião agendada','Gabriel','Indicação','2026-11-18',{tasks:[{id:'t3',tipo:'Reunião',tit:'Apresentar proposta',quando:'2026-11-07 10:00',done:false,dono:'Gabriel'}]}),
 mk('l5','Transportes Rápido','TR Logística','+55 16 99500-0505',42000,'Proposta enviada','Gabriel','Meta Ads','2026-11-15',{tasks:[{id:'t4',tipo:'Follow-up',tit:'Cobrar retorno da proposta',quando:'2026-11-06 09:00',done:false,dono:'Gabriel'}]}),
 mk('l6','Confecções Aurora','Aurora ME','+55 16 99400-0606',15000,'Negociação','Mario','Orgânico','2026-11-12',{tasks:[]}),
 mk('l7','Padaria Estrela','Estrela & Cia','+55 16 99300-0707',12000,'Ganho','Gabriel','Indicação','2026-11-02',{}),
 mk('l8','Auto Elétrica Norte','Norte Peças','+55 16 99200-0808',20000,'Perdido','Gabriel','Meta Ads','2026-10-28',{perda:'Foi para outro escritório',max:2})
];
LEADS.push(
 mk('s1','Ricardo Fonseca','','+55 16 99811-2001',6000,'Em contato','','Meta Ads','2026-12-05',{tasks:[]}),
 mk('s2','Dona Neide Barros','','+55 16 99811-2002',4500,'Qualificado','','Indicação','2026-12-12',{tasks:[]}),
 mk('a1','Tavares Auto Peças','Tavares Auto Peças LTDA','+55 16 98800-0101',80000,'Reunião agendada','','Indicação','2026-11-25',{tasks:[]}),
 mk('a2','Bar da Careta','Bar da Careta ME','+55 16 99811-3002',45000,'Proposta enviada','','Indicação','2026-11-20',{tasks:[]}));
LEADS.forEach(l=>{const c=convos.find(x=>x.id===l.conv);if(c&&/conversa c/.test(l.name)){l.name=c.name;l.phone=c.phone}});
const idx=(e,l)=>ST(l&&l.pipe).indexOf(e);
function moveLead(l,et){
  if(l.etapa===et)return;
  if(et==='Perdido'){M.crmSel=l.id;M.needPerda=true;renderCrm();return}
  // conectado: grava no banco (histórico e probabilidade pelo próprio banco). Automações entram na parte 3.
  if(SB.ligado()){crmAcao(DB.crm.mover(l,et),`${l.name} → ${et}`);return}
  l.etapa=et;l.prob=PROB[et];l.perda='';if(idx(et,l)<=5)l.max=Math.max(l.max,idx(et,l));
  const n=fire('etapa',et,l);toast(`${l.name} → ${et}`+(n?` · ${n} automação${n>1?'ões':''} executada${n>1?'s':''}`:''));renderCrm();
}
/* Kanban: cada etapa tem a sua cor (paleta própria do CRM, em harmonia com o bordô; ver --st-* no CSS) e pode ser recolhida.
   As recolhidas ficam guardadas neste navegador; na primeira vez, Ganho e Perdido começam recolhidas. */
const CRM_REC=(()=>{try{const v=JSON.parse(localStorage.getItem('np-crm-recolhidas')||'null');return new Set(Array.isArray(v)?v:['Ganho','Perdido'])}catch(e){return new Set(['Ganho','Perdido'])}})();
function crmRecolher(et){CRM_REC.has(et)?CRM_REC.delete(et):CRM_REC.add(et);try{localStorage.setItem('np-crm-recolhidas',JSON.stringify([...CRM_REC]))}catch(e){}renderCrm()}
const corEtapa=(i,n)=>i===n-2?'var(--st-ganho)':i===n-1?'var(--st-perdido)':`var(--st-${i%6+1})`;
const IC_COL='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>';
function crmColuna(e,i,n,L){
  const c=corEtapa(i,n),tot=brl(L.reduce((a,l)=>a+l.valor,0));
  if(CRM_REC.has(e))return `<div class="col rec" data-stage="${esc(e)}" style="--c:${c}"><button type="button" class="col-hv" data-x="colrec" data-v="${esc(e)}" aria-expanded="false" aria-label="Expandir a etapa ${esc(e)} (${L.length} negócio${L.length===1?'':'s'})" title="Expandir ${esc(e)}"><b class="col-q">${L.length}</b><span class="col-n">${esc(e)}</span><span class="col-ic">${IC_COL}</span></button></div>`;
  return `<div class="col" data-stage="${esc(e)}" style="--c:${c}"><div class="col-h"><span class="col-n" title="${esc(e)}">${esc(e)}</span><b class="col-q">${L.length}</b>
    <button type="button" class="col-t" data-x="colrec" data-v="${esc(e)}" aria-expanded="true" aria-label="Recolher a etapa ${esc(e)}" title="Recolher">${IC_COL}</button></div>
    <div class="col-s"><span>${tot}</span>${L.length?`<span class="src">${Math.round(L.reduce((a,l)=>a+l.prob,0)/L.length)}% em média</span>`:''}</div>
    <div class="cards">${L.map(dealCard).join('')||'<p class="col-vz">Nenhum negócio nesta etapa.</p>'}</div></div>`}
const lateT=t=>!t.done&&t.quando.slice(0,16)<TODAY+' 00:00'?true:(!t.done&&t.quando.slice(0,10)<TODAY);
function renderCrm(){
  if(!veCRM()){$('#crm').innerHTML='';if(S.view==='crm'){S.view='atend';renderAll()}return}
  const tabs=[['funil','Funil'],['ativ','Atividades'],['rel','Relatórios']];if(S.role==='admin')tabs.push(['campos','Campos personalizados']);
  if(!tabs.some(t=>t[0]===M.crmTab))M.crmTab='funil';
  if(SB.ligado()&&!CRM.carregado&&!CRM.carregando&&!CRM.erro)DB.crm.carregar().then(renderCrm);
  const sub=SB.ligado()?`Conectado ao banco (${esc(AMBIENTE.rotulo)})`:'Referência: Pipedrive · dados fictícios';
  const body=SB.ligado()&&!CRM.carregado?(CRM.erro?`<div class="empty"><b>Não foi possível carregar</b>${esc(CRM.erro)}<div class="hb" style="justify-content:center"><button type="button" class="btn" data-x="crmrefresh">Tentar de novo</button></div></div>`:'<div class="empty"><b>Carregando…</b>Buscando funis e negócios no banco.</div>')
    :M.crmTab==='funil'?crmFunil():M.crmTab==='ativ'?crmAtiv():M.crmTab==='rel'?crmRel():crmCampos();
  $('#crm').innerHTML=`<div class="mod crm-mod${M.crmTab==='funil'&&!(SB.ligado()&&!CRM.carregado)?' crm-funil':''}">${pageHead('CRM · funil comercial',sub)}${subTabs(M.crmTab,tabs,'crmtab')}${body}</div>${M.closeFor?closeModal():''}${impModal()}`;
}
function dealCard(l){
  const late=l.tasks.some(lateT);
  return `<div class="deal${M.crmSel===l.id?' on':''}" role="listitem" draggable="true" data-deal="${l.id}" tabindex="0" role="button" data-x="deal" data-id="${l.id}"><b>${esc(l.name)}</b><span class="src">${esc(l.org)}</span><span class="v">${brl(l.valor)} <span class="src">· ${l.prob}%</span></span><span class="r3"><span class="cn">${esc(l.origem)}</span>${late?'<span class="pill bad">tarefa atrasada</span>':''}${l.closed?'<span class="pill ok">contrato fechado</span>':''}</span></div>`;
}
function crmFunil(){
  const f=LEADS.filter(l=>l.pipe===M.pipe&&(M.fOrigem==='todas'||l.origem===M.fOrigem));
  const ets=ST(M.pipe),cols=ets.map((e,i)=>crmColuna(e,i,ets.length,f.filter(l=>l.etapa===e))).join('');
  const pipes=PIPES.length<2?'':`<div class="pipes" role="tablist" aria-label="Funis">${PIPES.map(p=>`<button type="button" role="tab" class="${M.pipe===p.id?'on':''}" data-x="pipe" data-v="${p.id}">${esc(p.nome)} <b>${LEADS.filter(l=>l.pipe===p.id&&l.etapa!=='Ganho'&&l.etapa!=='Perdido').length}</b></button>`).join('')}</div>`;
  const bar=pipes+`<div class="row"><label class="src">Origem <select id="fori">${optH([['todas','Todas'],...ORIGENS],M.fOrigem)}</select></label><span style="flex:1"></span>
    ${S.role==="atendente"?'':'<button type="button" class="btn" data-imp="open">⬆ Importar leads</button>'}${M.newDeal?`<input id="ndn" placeholder="Nome do contato ou empresa" style="width:220px"><input id="ndv" type="number" min="0" placeholder="Valor (R$)" style="width:110px"><select id="ndo">${optH(ORIGENS,'Meta Ads')}</select><button type="button" class="btn pri" data-x="dealcreate">Criar</button><button type="button" class="btn" data-x="dealnew">Cancelar</button>`:`<button type="button" class="btn pri" data-x="dealnew">+ Novo negócio</button>`}</div>`;
  const sel=LEADS.find(l=>l.id===M.crmSel);
  const rs=M.impRes?`<div class="pill ok" style="display:flex;gap:8px;align-items:center;padding:6px 10px">Importação “${esc(M.impRes.lote)}”: ${M.impRes.c} criados · ${M.impRes.u} atualizados · ${M.impRes.i} ignorados <button type="button" class="xbtn" data-imp="clr" aria-label="Fechar aviso">×</button></div>`:'';
  const rec=ets.filter(e=>CRM_REC.has(e)).length;
  return `${bar}${rs}<div class="crm${sel?' sel':''}"><div class="kan" role="list" aria-label="Etapas do funil">${cols}</div>${sel?drawer(sel):''}</div><p class="src crm-dica">Arraste os cartões entre as colunas ou mude a etapa no painel do negócio. Clique na seta do título para recolher uma etapa.${rec?` <button type="button" class="lnk" data-x="colabrir">Expandir todas (${rec} recolhida${rec>1?'s':''})</button>`:''}${SB.ligado()?'':' “Qualificado” e “Ganho” são as etapas que avisam o gestor de tráfego (tela de Webhooks, em Configurações).'}</p>`;
}
function drawer(l){
  const tabs=[['resumo','Resumo'],['ativ','Atividades ('+l.tasks.filter(t=>!t.done).length+')'],['form','Formulário'],['conv','Conversa']];
  let b='';
  const F=(f,lab,type,val,ex)=>`<label>${lab}<input data-fld="lead" data-id="${l.id}" data-f="${f}" type="${type||'text'}" value="${esc(val)}"${ex||''}></label>`;
  if(M.crmSide==='resumo'){
    b=`${F('name','Nome','text',l.name)}${F('org','Empresa','text',l.org)}${F('phone','Telefone','text',l.phone)}<div class="row">${F('valor','Valor (R$)','number',l.valor,' min="0"')}${F('prob','Probabilidade (%)','number',l.prob,' min="0" max="100"')}</div>
    ${F('prev','Fechamento previsto','date',l.prev)}
    <label>Origem<select data-fld="lead" data-id="${l.id}" data-f="origem">${optH([['','—'],...ORIGENS],l.origem)}</select></label>
    <label>Etapa<select data-x-sel="stage" data-id="${l.id}">${optH(ST(l.pipe),l.etapa)}</select></label>
    ${CAMPOS.map(c=>c.tipo==='lista'?`<label>${esc(c.nome)}<select data-fld="leadc" data-id="${l.id}" data-f="${c.id}"><option value="">—</option>${optH(c.opts,l.custom[c.id])}</select></label>`:`<label>${esc(c.nome)}<input data-fld="leadc" data-id="${l.id}" data-f="${c.id}" type="${c.tipo==='número'?'number':c.tipo==='data'?'date':'text'}" value="${esc(l.custom[c.id]||'')}"></label>`).join('')}
    ${l.etapa==='Perdido'||M.needPerda?`<label>Motivo da perda<select id="perdasel">${optH([['','Escolha…'],...PERDAS],l.perda)}</select></label>${M.needPerda?`<div class="row"><button type="button" class="btn pri" data-x="perdaok" data-id="${l.id}">Confirmar perda</button><button type="button" class="btn" data-x="perdano">Cancelar</button></div>`:''}`:''}
    <div class="hb">${l.etapa==='Ganho'?(l.closed?`<span class="pill ok">Contrato fechado${SB.ligado()?'':' (simulado)'}</span>`:`<button type="button" class="btn pri" data-x="closedeal" data-id="${l.id}">Fechar contrato</button>`):`<button type="button" class="btn pri" data-x="win" data-id="${l.id}">Marcar como ganho</button>`}${l.etapa!=='Perdido'?`<button type="button" class="btn" data-x="lose" data-id="${l.id}">Marcar como perdido</button>`:''}</div>`;
  }else if(M.crmSide==='ativ'){
    b=`${l.tasks.map(t=>`<div class="trow${lateT(t)?' late':''}${t.done?' dn':''}"><input type="checkbox" data-x-chk="${t.id}" data-id="${l.id}"${t.done?' checked':''} aria-label="Concluída"><span style="flex:1"><b>${esc(t.tipo)}</b> · ${esc(t.tit)}<br><span class="src">${esc(t.quando.replace('T',' '))} · lembrete 30 min antes${t.auto?' · criada por automação':''}</span></span><button type="button" class="xbtn" data-x="taskdel" data-id="${l.id}" data-t="${t.id}" aria-label="Excluir">×</button></div>`).join('')||'<span class="src">Nenhuma atividade.</span>'}
    <div class="row"><select id="tkt">${optH(TIPOS,'Ligação')}</select><input id="tkd" type="datetime-local" value="2026-11-06T10:00"></div><input id="tkn" placeholder="O que fazer" ><div><button type="button" class="btn" data-x="taskadd" data-id="${l.id}">+ Atividade</button></div>`;
  }else if(M.crmSide==='form'){
    b=l.form.length?`<p class="src" style="margin:0">Respostas do formulário da campanha (chegam por HTTP do gestor de tráfego).</p>${l.form.map(x=>`<div class="mrow"><span><b>${esc(x.p)}</b><br>${esc(x.r)}</span></div>`).join('')}`:'<span class="src">Este lead não veio de formulário.</span>';
  }else{
    const c=SB.ligado()?null:convos.find(x=>x.id===l.conv);
    b=SB.ligado()?'<span class="src">A conversa do negócio aparece aqui quando o atendimento for ligado ao banco (passo 2, vínculo com o sistema jurídico).</span>':c?`${c.msgs.filter(m=>m.f==='c'||m.f==='a').slice(-6).map(m=>`<div class="bub ${m.f==='a'?'me':''}">${esc(m.x||'['+(MK[m.media&&m.media.k]||'arquivo')+']')}<small>${esc(m.t)}</small></div>`).join('')}<div><button type="button" class="btn" data-x="openconv" data-id="${c.id}">Abrir no Atendimento</button></div>`:'<span class="src">Nenhuma conversa vinculada a este negócio.</span>';
  }
  return `<aside class="drawer" aria-label="Negócio"><div class="ph"><h2 style="font-size:16px">${esc(l.name)}</h2><button type="button" class="xbtn" data-x="dealclose" aria-label="Fechar painel">×</button></div><div class="sd-tabs">${tabs.map(([k,t])=>`<button type="button" data-x="crmside" data-v="${k}" class="${M.crmSide===k?'on':''}">${t}</button>`).join('')}</div><div class="body">${b}</div></aside>`;
}
function closeModal(){
  const l=LEADS.find(x=>x.id===M.closeFor);if(!l)return '';
  if(SB.ligado())return `<div class="modal" role="dialog" aria-modal="true" aria-label="Fechar contrato"><div class="box"><h3>Fechar contrato · ${esc(l.name)}</h3>
   <p style="margin:0">Fechar o contrato chama a função <b>fechar_cliente</b> do sistema jurídico, que cria a ficha do cliente, os contratos, a pasta no Drive, as boas-vindas, o onboarding e a tarefa do Financeiro.</p>
   <p class="src" style="margin:0">Essa ligação depende do passo 2 (vínculo com o sistema jurídico), que aguarda o resultado do <b>crm_0000</b>. Até lá, feche o contrato pelo sistema jurídico, como hoje. O negócio já está registrado como ganho no CRM.</p>
   <div class="hb"><button type="button" class="btn" data-x="closeno">Entendi</button></div></div></div>`;
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Fechar contrato"><div class="box"><h3>Fechar contrato · ${esc(l.name)}</h3>
   <p class="src" style="margin:0">Na versão conectada, este botão chama a função <b>fechar_cliente</b> do sistema jurídico. O CRM não refaz nada disso; o sistema jurídico faz sozinho:</p>
   <ol class="ul" style="list-style:decimal"><li>Cria a ficha do cliente e os contratos</li><li>Cria a pasta no Drive</li><li>Envia as boas-vindas por WhatsApp</li><li>Cria as tarefas de onboarding</li><li>Cria a tarefa do Financeiro para lançar cliente e cobranças no Asaas</li></ol>
   <p class="src" style="margin:0">Aqui é só uma simulação: nada é enviado.</p><div class="hb"><button type="button" class="btn pri" data-x="closeok" data-id="${l.id}">Simular fechamento</button><button type="button" class="btn" data-x="closeno">Cancelar</button></div></div></div>`;
}
function crmAtiv(){
  const all=[];LEADS.forEach(l=>l.tasks.forEach(t=>{if(!t.done)all.push({l,t})}));
  const g={Atrasadas:[],Hoje:[],Próximas:[]};all.forEach(x=>{const d=x.t.quando.slice(0,10);(d<TODAY?g.Atrasadas:d===TODAY?g.Hoje:g.Próximas).push(x)});
  return Object.entries(g).map(([n,L])=>`<div class="tbl"><h3>${n} (${L.length})</h3><table><tbody>${L.sort((a,b)=>a.t.quando<b.t.quando?-1:1).map(({l,t})=>`<tr><td style="white-space:nowrap">${esc(t.quando.slice(5,16).replace('T',' '))}</td><td><b>${esc(t.tipo)}</b> · ${esc(t.tit)}</td><td>${esc(l.name)}</td><td><button type="button" class="btn" data-x="taskdone" data-id="${l.id}" data-t="${t.id}">Concluir</button></td></tr>`).join('')||'<tr><td class="src">Nada aqui.</td></tr>'}</tbody></table></div>`).join('');
}
function crmRel(){
  const LP=LEADS.filter(l=>l.pipe===M.pipe),reached=ST(M.pipe).slice(0,6).map((e,i)=>({e,n:LP.filter(l=>l.max>=i||l.etapa==='Ganho').length}));
  const orig=ORIGENS.map(o=>{const L=LEADS.filter(l=>l.origem===o),g=L.filter(l=>l.etapa==='Ganho');return{o,n:L.length,g:g.length,v:g.reduce((a,l)=>a+l.valor,0)}});
  const pd={};LEADS.filter(l=>l.etapa==='Perdido').forEach(l=>{pd[l.perda||'Sem motivo']=(pd[l.perda||'Sem motivo']||0)+1});
  const mx=(reached[0]&&reached[0].n)||1;
  // tempo médio: conectado, vem do histórico real de cada negócio; na demonstração, números de exemplo
  let tm=e=>(DIAS_ETAPA[e]||3)+' d';
  if(SB.ligado()){const T=CRM.tempo[M.pipe];if(!T){DB.crm.tempo(M.pipe).then(()=>{if(M.crmTab==='rel')renderCrm()},e=>toast(e.message))}
    tm=e=>T&&T[e]!=null?String(T[e]).replace('.',',')+' d':'—'}
  return `<div class="tbl"><h3>Conversão por etapa</h3><table><thead><tr><th>Etapa</th><th>Chegaram</th><th>Passaram para a próxima</th><th style="width:30%"></th><th>${SB.ligado()?'Tempo médio na etapa':'Tempo médio (exemplo)'}</th></tr></thead><tbody>${reached.map((r,i)=>`<tr><td>${esc(r.e)}</td><td>${r.n}</td><td>${i<reached.length-1?Math.round((reached[i+1].n/(r.n||1))*100)+'%':'—'}</td><td><div class="bar"><i style="width:${r.n/mx*100}%"></i></div></td><td>${tm(r.e)}</td></tr>`).join('')}</tbody></table></div>
  <div class="tbl"><h3>Por origem</h3><table><thead><tr><th>Origem</th><th>Negócios</th><th>Ganhos</th><th>Taxa</th><th>Valor ganho</th></tr></thead><tbody>${orig.map(o=>`<tr><td>${esc(o.o)}</td><td>${o.n}</td><td>${o.g}</td><td>${o.n?Math.round(o.g/o.n*100):0}%</td><td>${brl(o.v)}</td></tr>`).join('')}</tbody></table></div>
  <div class="tbl"><h3>Motivos de perda</h3><table><tbody>${Object.entries(pd).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')||'<tr><td class="src">Nenhuma perda registrada.</td></tr>'}</tbody></table></div>`;
}
function crmCampos(){
  return `<div class="tbl"><h3>Campos personalizados do negócio</h3><table><thead><tr><th>Campo</th><th>Tipo</th><th></th></tr></thead><tbody>${CAMPOS.map(c=>`<tr><td>${esc(c.nome)}</td><td>${esc(c.tipo)}${c.opts?' · '+esc(c.opts.join(', ')):''}</td><td><button type="button" class="xbtn" data-x="campodel" data-id="${c.id}" aria-label="Excluir campo">×</button></td></tr>`).join('')}</tbody></table>
  <div class="row" style="padding:10px 14px"><input id="cpn" placeholder="Nome do campo"><select id="cpt">${optH(['texto','número','data','lista'],'texto')}</select><input id="cpo" placeholder="Opções (se lista), separadas por vírgula"><button type="button" class="btn pri" data-x="campoadd">Criar campo</button></div></div>`;
}
