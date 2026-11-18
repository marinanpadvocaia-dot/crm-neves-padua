/* ---- Painel do gestor (parte 7 da troca da demonstração; banco: crm_0025, crm.painel_gestor) ----
   Uma chamada traz tudo: agora (ao vivo), no período, por fila, por pessoa, por canal e o resumo do comercial.
   Líder vê só as filas que lidera; administrador vê todas; o comercial só aparece para quem usa o CRM.
   Na demonstração os mesmos números são calculados sobre as conversas e os negócios de exemplo. */
const PNL={per:'hoje',dados:null,carregando:false,erro:'',em:null,chave:''};
const PNL_PER=[['hoje','Hoje'],['7d','7 dias'],['30d','30 dias'],['mes','Este mês']];
const pnlIso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function pnlDatas(per){const h=new Date(),de=new Date(h);
  if(per==='7d')de.setDate(h.getDate()-6);else if(per==='30d')de.setDate(h.getDate()-29);else if(per==='mes')de.setDate(1);
  return{de:pnlIso(de),ate:pnlIso(h)}}
const pnlRot=per=>{const {de,ate}=pnlDatas(per),f=s=>s.slice(8,10)+'/'+s.slice(5,7);return per==='hoje'?'hoje, '+f(ate):f(de)+' a '+f(ate)};
DB.painel={
  async carregar(){const {de,ate}=pnlDatas(PNL.per),k=PNL.per+de+ate;PNL.carregando=true;
    try{PNL.dados=await SB.rpc('painel_gestor',{p_de:de,p_ate:ate});PNL.chave=k;PNL.erro='';PNL.em=Date.now()}
    catch(e){PNL.erro=e.message||'Não foi possível carregar o painel.'}finally{PNL.carregando=false}}};
function pnlRecarregar(){if(!SB.ligado()||PNL.carregando)return;DB.painel.carregar().then(()=>{if(S.view==='rel')renderReports()});if(S.view==='rel')renderReports()}

/* mesmos números, calculados sobre os exemplos da demonstração */
function painelDemo(){
  const lider=S.role==='lider',filas=[...new Set(['triagem','comercial',...OPQ()])].filter(id=>!lider||CFG.sectors.some(s=>s.id===id&&s.leader===me()));
  const L=convos.filter(c=>filas.includes(c.queue)),ab=L.filter(c=>c.status!=='Resolvido');
  const prazo=c=>(CFG.sectors.find(s=>s.id===c.queue)||{}).sla||c.target||30;
  const R=L.map((c,i)=>({c,sla:prazo(c),r:c.answered||c.status==='Resolvido'?Math.round(prazo(c)*(.4+((i*37)%100)/100)):null}));
  const conta=X=>{const rs=X.filter(x=>x.r!=null);return{
    abertos:X.filter(x=>x.c.status!=='Resolvido').length,sem_responsavel:X.filter(x=>x.c.status!=='Resolvido'&&!x.c.owner).length,
    atrasados:X.filter(x=>x.c.status!=='Resolvido'&&sla(x.c).s==='bad').length,novos:X.length,resolvidos:X.filter(x=>x.c.status==='Resolvido').length,
    primeira_resposta_media_min:rs.length?Math.round(rs.reduce((a,x)=>a+x.r,0)/rs.length):null,
    no_prazo_pct:rs.length?Math.round(100*rs.filter(x=>x.r<=x.sla).length/rs.length):null,respondidos:rs.length}};
  const tot=conta(R),pessoas=[...new Set([...TEAM.filter(p=>(p.filas||[]).some(f=>filas.includes(f))).map(p=>p.k),...L.map(c=>c.owner).filter(Boolean)])];
  const d={de:pnlDatas(PNL.per).de,ate:pnlDatas(PNL.per).ate,todas_filas:!lider,filas:filas.map(f=>({fila:f,nome:qName(f)})),
    agora:{abertos:ab.length,sem_responsavel:tot.sem_responsavel,atrasados:tot.atrasados,perto_do_prazo:ab.filter(c=>sla(c).s==='warn').length,aguardando_cliente:ab.filter(c=>c.pausa).length},
    periodo:{novos:tot.novos,resolvidos:tot.resolvidos,respondidos:tot.respondidos,primeira_resposta_media_min:tot.primeira_resposta_media_min,no_prazo_pct:tot.no_prazo_pct},
    por_fila:filas.map(f=>Object.assign({fila:f,nome:qName(f),sla_min:(CFG.sectors.find(s=>s.id===f)||{}).sla||null},conta(R.filter(x=>x.c.queue===f)))),
    por_pessoa:pessoas.map(k=>Object.assign({user_id:k,nome:person(k).name,online:k===me()||['Ana Luiza','Gabriel','Lucas'].includes(k)},conta(R.filter(x=>x.c.owner===k)))).sort((a,b)=>b.abertos-a.abertos||a.nome.localeCompare(b.nome)),
    por_canal:Object.keys(CANAIS).map(k=>Object.assign({canal:k},conta(R.filter(x=>(x.c.canal||'whatsapp')===k)))),comercial:null};
  if(veCRM()){const N=LEADS.filter(l=>PIPES.some(p=>p.id===l.pipe)),ets=ST('pj'),abt=ets.slice(0,-2),g=N.filter(l=>l.etapa==='Ganho'),p=N.filter(l=>l.etapa==='Perdido'),a=N.filter(l=>abt.includes(l.etapa));
    const mot={};p.forEach(l=>{const k=l.perda||'Sem motivo';mot[k]=(mot[k]||0)+1});
    const org={};N.forEach(l=>{const o=org[l.origem||'Sem origem']=org[l.origem||'Sem origem']||{origem:l.origem||'Sem origem',novos:0,ganhos:0,perdidos:0,ganhos_valor:0};o.novos++;if(l.etapa==='Ganho'){o.ganhos++;o.ganhos_valor+=l.valor}if(l.etapa==='Perdido')o.perdidos++});
    d.comercial={novos:N.length,novos_valor:N.reduce((s,l)=>s+l.valor,0),ganhos:g.length,ganhos_valor:g.reduce((s,l)=>s+l.valor,0),perdidos:p.length,
      conversao_pct:g.length+p.length?Math.round(100*g.length/(g.length+p.length)):null,abertos:a.length,abertos_valor:a.reduce((s,l)=>s+l.valor,0),
      previsto_valor:Math.round(a.reduce((s,l)=>s+l.valor*(l.prob||0)/100,0)),por_etapa:abt.map(e=>({etapa:e,qtd:a.filter(l=>l.etapa===e).length,valor:a.filter(l=>l.etapa===e).reduce((s,l)=>s+l.valor,0)})),
      motivos_perda:Object.entries(mot).map(([motivo,qtd])=>({motivo,qtd})).sort((x,y)=>y.qtd-x.qtd).slice(0,5),por_origem:Object.values(org).sort((x,y)=>y.novos-x.novos)}}
  return d}

/* ---- desenho ---- */
const pnlMin=m=>m==null?'—':fmt(m);
const pnlPct=v=>v==null?'—':v+'%';
const pnlTile=(v,rot,cls='',dica='')=>`<div class="tile${cls?' '+cls:''}"${dica?` title="${esc(dica)}"`:''}><b>${v}</b><span>${rot}</span></div>`;
function pnlCanais(){if(typeof CHN==='undefined')return'';const at=CHN.filter(c=>c.ativo),pend=filaDe('pendente').length,fal=filaDe('falhou').length;
  return `<section class="tbl pnl-sec" aria-label="Canais"><h3>Canais</h3><div class="tiles pnl-t">${at.map(c=>{const e=estadoExibido(c),k=CN_ROT[e][0];return `<div class="tile${k==='bad'?' bad':k==='warn'?' warn':''}"><b class="pnl-cn">${CN_ROT[e][1]} ${CN_ROT[e][2]}</b><span>${esc(c.nome)} · última mensagem ${relMin(c.ult)}</span></div>`}).join('')||'<p class="src" style="margin:0">Nenhum canal ligado.</p>'}${pnlTile(pend,'na fila de saída'+(fal?' · '+fal+' com falha':''),fal?'bad':'')}</div></section>`}
function pnlFunil(c){const mx=Math.max(1,...c.por_etapa.map(e=>e.qtd));
  return `<ol class="pnl-fun">${c.por_etapa.map((e,i)=>`<li style="--c:${corEtapa(i,c.por_etapa.length+2)}"><span class="pnl-fn">${esc(e.etapa)}</span><span class="pnl-fb" aria-hidden="true"><i style="width:${Math.max(e.qtd?4:0,e.qtd/mx*100)}%"></i></span><b>${e.qtd}</b><span class="src">${brl(e.valor)}</span></li>`).join('')}</ol>`}
function painelHtml(d){
  const ag=d.agora,pe=d.periodo,lig=SB.ligado(),vazio=lig&&!ag.abertos&&!pe.novos&&!pe.resolvidos;
  const escopo=d.todas_filas?'Todas as filas':d.filas.length?'Filas que você lidera: '+d.filas.map(f=>f.nome).join(', '):'Você ainda não lidera nenhuma fila. Peça ao administrador para definir o líder em Configurações → Usuários.';
  const atualiz=lig?(PNL.carregando&&!PNL.em?'carregando…':PNL.em?`<span id="pnlts">atualizado ${relMin(PNL.em)}</span>`:''):'números dos exemplos';
  const pf=d.por_fila,pp=d.por_pessoa,mx=Math.max(1,...pp.map(p=>p.abertos));
  const c=d.comercial;
  return `<div class="rep pnl">
  <div class="pnl-h"><div><h2>Painel do gestor</h2><p class="src">${esc(escopo)} · ${atualiz}</p></div>
    <div class="pnl-ctl"><div class="seg" role="group" aria-label="Período">${PNL_PER.map(([k,l])=>`<button type="button" data-pnl="per" data-v="${k}" class="${PNL.per===k?'on':''}" aria-pressed="${PNL.per===k}">${l}</button>`).join('')}</div>
    ${lig?`<button type="button" class="btn" data-pnl="atualizar"${PNL.carregando?' disabled':''}>${PNL.carregando?'Atualizando…':'Atualizar'}</button>`:''}</div></div>
  ${PNL.erro?`<p class="err" role="alert">${esc(PNL.erro)} <button type="button" class="lnk" data-pnl="atualizar">Tentar de novo</button></p>`:''}
  ${pnlCanais()}
  <section class="tbl pnl-sec" aria-label="Agora"><h3>Agora <span class="live" aria-hidden="true"></span> <small class="src">atendimentos em aberto neste momento</small></h3>
    <div class="tiles pnl-t">${pnlTile(ag.abertos,'em aberto')}${pnlTile(ag.sem_responsavel,'sem responsável',ag.sem_responsavel?'warn':'')}${pnlTile(ag.atrasados,'com o prazo da 1ª resposta estourado',ag.atrasados?'bad':'')}${pnlTile(ag.perto_do_prazo,'perto do prazo (75% ou mais)',ag.perto_do_prazo?'warn':'')}${pnlTile(ag.aguardando_cliente,'aguardando o cliente (prazo pausado)')}</div>
    ${vazio?'<p class="src pnl-nota">Ainda não há atendimentos no banco. Eles passam a contar aqui quando as conversas do WhatsApp forem ligadas ao banco (passo 2 do plano).</p>':''}</section>
  <section class="tbl pnl-sec" aria-label="No período"><h3>No período <small class="src">${esc(pnlRot(PNL.per))}</small></h3>
    <div class="tiles pnl-t">${pnlTile(pe.novos,'atendimentos novos')}${pnlTile(pe.resolvidos,'resolvidos')}${pnlTile(pnlMin(pe.primeira_resposta_media_min),'1ª resposta média (horário de atendimento)','', 'Conta só os minutos dentro do horário de cada fila.')}${pnlTile(pnlPct(pe.no_prazo_pct),'respondidos dentro do prazo'+(pe.respondidos?` (${pe.respondidos})`:''),pe.no_prazo_pct!=null&&pe.no_prazo_pct<80?'warn':'')}</div></section>
  <div class="pnl-g2">
  <section class="tbl" aria-label="Por fila"><h3>Por fila</h3><table><thead><tr><th>Fila</th><th>Em aberto</th><th>Atrasados</th><th>Resolvidos</th><th>1ª resposta</th><th>No prazo</th></tr></thead><tbody>${pf.map(r=>`<tr><td><b>${esc(r.nome)}</b>${r.sla_min?`<br><span class="src">prazo ${fmt(r.sla_min)}</span>`:''}</td><td>${r.abertos}${r.sem_responsavel?` <span class="pill warn">${r.sem_responsavel} sem resp.</span>`:''}</td><td${r.atrasados?' class="pnl-bad"':''}>${r.atrasados}</td><td>${r.resolvidos}</td><td>${pnlMin(r.primeira_resposta_media_min)}</td><td>${pnlPct(r.no_prazo_pct)}</td></tr>`).join('')||'<tr><td colspan="6" class="src">Nenhuma fila.</td></tr>'}</tbody></table></section>
  <section class="tbl" aria-label="Por canal"><h3>Por canal</h3><table><thead><tr><th>Canal</th><th>Em aberto</th><th>Atrasados</th><th>Novos</th><th>Resolvidos</th></tr></thead><tbody>${d.por_canal.map(r=>`<tr><td>${esc((CANAIS[r.canal]||[r.canal])[0])}</td><td>${r.abertos}</td><td${r.atrasados?' class="pnl-bad"':''}>${r.atrasados}</td><td>${r.novos}</td><td>${r.resolvidos}</td></tr>`).join('')}</tbody></table></section>
  </div>
  <section class="tbl" aria-label="Por pessoa"><h3>Por pessoa</h3><table><thead><tr><th>Pessoa</th><th>Em aberto</th><th style="width:30%">Carga</th><th>Resolvidos</th><th>1ª resposta</th></tr></thead><tbody>${pp.map(p=>`<tr><td><span class="pnl-on${p.online?' on':''}" aria-hidden="true"></span>${esc(p.nome)}<br><span class="src">${p.online?'conectado agora':'desconectado'}</span></td><td>${p.abertos}${p.atrasados?` <span class="pill bad">${p.atrasados} atrasado${p.atrasados>1?'s':''}</span>`:''}</td><td><div class="bar" role="img" aria-label="${p.abertos} em aberto, ${p.atrasados} atrasados"><i style="width:${(p.abertos-p.atrasados)/mx*100}%"></i><i class="l" style="width:${p.atrasados/mx*100}%"></i></div></td><td>${p.resolvidos}</td><td>${pnlMin(p.primeira_resposta_media_min)}</td></tr>`).join('')||'<tr><td colspan="5" class="src">Ninguém nas suas filas ainda. Defina as filas de cada pessoa em Configurações → Usuários.</td></tr>'}</tbody></table></section>
  ${c?`<section class="tbl pnl-sec" aria-label="Comercial"><h3>Comercial <small class="src">funil do CRM · ${esc(pnlRot(PNL.per))}</small></h3>
    <div class="tiles pnl-t">${pnlTile(c.novos,'negócios novos · '+brl(c.novos_valor))}${pnlTile(c.ganhos,'ganhos · '+brl(c.ganhos_valor),c.ganhos?'ok':'')}${pnlTile(c.perdidos,'perdidos')}${pnlTile(pnlPct(c.conversao_pct),'conversão (ganhos ÷ encerrados)')}${pnlTile(c.abertos,'em andamento · '+brl(c.abertos_valor),'','Valor previsto (pela probabilidade de cada etapa): '+brl(c.previsto_valor))}</div>
    <div class="pnl-g2 pnl-in"><div><b class="pnl-st">Em andamento por etapa</b>${pnlFunil(c)}<p class="src" style="margin:6px 0 0">Previsto pela probabilidade de cada etapa: <b>${brl(c.previsto_valor)}</b></p></div>
    <div><b class="pnl-st">Por origem</b><table class="pnl-mini"><thead><tr><th>Origem</th><th>Novos</th><th>Ganhos</th><th>Perdidos</th></tr></thead><tbody>${c.por_origem.map(o=>`<tr><td>${esc(o.origem)}</td><td>${o.novos}</td><td>${o.ganhos}${o.ganhos_valor?`<br><span class="src">${brl(o.ganhos_valor)}</span>`:''}</td><td>${o.perdidos}</td></tr>`).join('')||'<tr><td colspan="4" class="src">Nenhum negócio novo ou encerrado no período.</td></tr>'}</tbody></table>
      <b class="pnl-st" style="margin-top:12px">Por que perdemos</b>${c.motivos_perda.length?`<ul class="pnl-mot">${c.motivos_perda.map(m=>`<li><span>${esc(m.motivo)}</span><b>${m.qtd}</b></li>`).join('')}</ul>`:'<p class="src" style="margin:4px 0 0">Nenhuma perda no período.</p>'}</div></div></section>`:''}
  ${lig?'':`<section class="tbl pnl-sec" aria-label="Testar o rodízio"><h3>Testar o rodízio <small class="src">só na demonstração</small></h3><div class="row" style="padding:0 14px 12px"><select id="simq" aria-label="Fila">${optH(QUEUES.filter(q=>OPQ().includes(q.id)||q.id==='comercial').map(q=>[q.id,q.name]),'passivos')}</select><button type="button" class="btn" data-rodsim="1">Simular nova conversa</button></div></section>`}
  <p class="src">${lig?'Prazo da 1ª resposta contado só dentro do horário de cada fila (feriados não descontados). Atualiza sozinho a cada minuto enquanto o painel estiver aberto.':'Números calculados sobre as conversas e os negócios de exemplo. Com o banco ligado, vêm de crm.painel_gestor.'}</p></div>`}

function renderReports(){const el=$('#reports');if(!el)return;
  if(SB.ligado()){const {de,ate}=pnlDatas(PNL.per);
    if(PNL.chave!==PNL.per+de+ate&&!PNL.carregando&&!PNL.erro){DB.painel.carregar().then(()=>{if(S.view==='rel')renderReports()})}
    if(!PNL.dados){el.innerHTML=`<div class="rep pnl"><div class="pnl-h"><div><h2>Painel do gestor</h2><p class="src">${PNL.erro?'':'Carregando os números…'}</p></div></div>${PNL.erro?`<p class="err" role="alert">${esc(PNL.erro)} <button type="button" class="lnk" data-pnl="atualizar">Tentar de novo</button></p>`:'<div class="tiles">'+'<div class="tile pnl-sk"><b>&nbsp;</b><span>&nbsp;</span></div>'.repeat(5)+'</div>'}</div>`;return}
    el.innerHTML=painelHtml(PNL.dados);return}
  el.innerHTML=painelHtml(painelDemo())}

/* atualiza sozinho a cada minuto com o painel aberto e a aba visível */
setInterval(()=>{if(S.view==='rel'&&SB.ligado()&&!document.hidden)pnlRecarregar()},60000);
setInterval(()=>{const e=document.getElementById('pnlts');if(e&&PNL.em)e.textContent='atualizado '+relMin(PNL.em)},15000);
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-pnl]');if(!b||b.disabled)return;
  if(b.dataset.pnl==='per'){PNL.per=b.dataset.v;PNL.erro='';if(SB.ligado()){PNL.chave='';pnlRecarregar()}else renderReports();return}
  if(b.dataset.pnl==='atualizar'){PNL.erro='';PNL.chave='';pnlRecarregar()}});
