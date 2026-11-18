/* ---- Importação de leads ----
   O arquivo é lido e conferido no navegador (prévia). Na demonstração, a importação fica em memória.
   Conectado (crm_0021): as linhas vão para o banco em partes de 500; o banco confere de novo (contato existente, etapa,
   motivo, origem, responsável), registra cada linha e NÃO dispara fluxos (a não ser que o lote peça, só para os novos). */
const IMP_F=[['name','Nome *',['nome','name','contato','lead']],['org','Empresa',['empresa','razao','razão','org','cnpj']],['phone','WhatsApp / telefone *',['whatsapp','telefone','celular','fone','phone']],['email','E-mail',['email','e-mail','mail']],['etapa','Etapa do funil',['etapa','fase','estagio','estágio']],['status','Status (aberto/ganho/perdido)',['status','situacao','situação']],['perda','Motivo de perda',['motivo','perda']],['valor','Valor (R$)',['valor','receita']],['entrada','Data de entrada',['data','entrada','criado','criacao','criação']],['origem','Origem',['origem','fonte','source']],['tags','Etiquetas',['tag','etiqueta']],['obs','Observação',['obs','nota','anotac','anotaç']],['ext','ID externo (GCV)',['id','externo','codigo','código']]];
const IMP_SAMPLE={name:'planilha_gcv_exemplo.csv',cols:['Nome','Empresa','WhatsApp','E-mail','Fase','Status','Motivo','Responsável','Valor','Data','Origem','Tags','Obs','ID'],rows:[
 ['Carlos Almeida','Almeida Transportes','(16) 99123-4455','carlos@almeidatransp.com.br','Qualificado','Aberto','','Gabriel','45000','2026-10-02','Meta Ads','PJ;dívida alta','Ligou 2x, quer reunião','1001'],
 ['Fernanda Rocha','Rocha Confecções','+55 16 98100-7788','','Em contato','Aberto','','Mario','12000','2026-10-15','Google Ads','PJ','','1002'],
 ['Oficina Santos ME','Santos Mecânica','16 99700-0303','','Proposta enviada','Aberto','','Gabriel','30000','2026-09-20','Google Ads','','Atualizar valor','1003'],
 ['Pedro Lima','','(11) 97777-1212','pedro@lima.com','Negociação','Aberto','','Ana Paula','8000','2026-10-20','Indicação','PF','','1004'],
 ['Joana Prado','Prado Móveis','(16) 98888-5566','','Perdido','Perdido','Sem resposta','Gabriel','15000','2026-08-11','Instagram','','Parou de responder','1005'],
 ['Marcos Dias','Dias Peças','(16) 3721-0000','','Reunião agendada','Aberto','','Fulano Inexistente','22000','2026-10-28','Orgânico','','','1006'],
 ['','','','','Novo lead','Aberto','','Gabriel','','2026-11-01','Meta Ads','','Linha sem nome e sem telefone','1007']]};
const impNorm=v=>{let d=String(v||'').replace(/\D/g,'');if(d.startsWith('55')&&d.length>11)d=d.slice(2);return d.length>=10?d:''};
const impData=v=>{const t=String(v||'').trim();let m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):''};
const impLow=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
function impParseCSV(txt){const first=txt.split(/\r?\n/)[0]||'',del=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';const rows=[];let r=[],c='',q=false;
  for(let i=0;i<txt.length;i++){const ch=txt[i];if(q){if(ch==='"'){if(txt[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}else if(ch==='"')q=true;else if(ch===del){r.push(c);c=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&txt[i+1]==='\n')i++;r.push(c);c='';if(r.some(x=>x.trim()))rows.push(r);r=[]}else c+=ch}
  if(c||r.length){r.push(c);if(r.some(x=>x.trim()))rows.push(r)}return rows}
function impAutoMap(cols){const m={};IMP_F.forEach(([k,,al])=>{const i=cols.findIndex(c=>al.some(a=>impLow(c)===a||impLow(c).includes(a)));m[k]=i>=0?String(i):''});return m}
const IMP_ST={novo:'Novo lead','novo lead':'Novo lead',contato:'Em contato','em contato':'Em contato',qualificado:'Qualificado',reuniao:'Reunião agendada','reuniao agendada':'Reunião agendada',proposta:'Proposta enviada','proposta enviada':'Proposta enviada',negociacao:'Negociação',ganho:'Ganho',fechado:'Ganho',perdido:'Perdido'};
function impAnalyze(){const I=M.imp,rows=I.rows,mp=I.map,out=[];const seenP=new Set();
  const g=(r,k)=>mp[k]===''||mp[k]==null?'':String(r[+mp[k]]||'').trim();
  rows.forEach((r,n)=>{const o={n:n+2,r:{},act:'criar',avisos:[],erros:[]};
    const name=g(r,'name'),ph=g(r,'phone'),pn=impNorm(ph),ext=g(r,'ext'),em=impLow(g(r,'email'));
    o.r.name=name;o.r.org=g(r,'org');o.r.phone=ph;
    if(!name&&!ph){o.act='ignorar';o.erros.push('Sem nome e sem telefone')}
    else if(!name){o.act='ignorar';o.erros.push('Sem nome')}
    else if(!ph&&!em&&!ext){o.avisos.push('Sem telefone nem e-mail')}
    else if(ph&&!pn&&!/^@/.test(ph)){o.avisos.push('Telefone inválido: “'+ph+'”')}
    if(o.act!=='ignorar'){
      let ex=pn&&LEADS.find(l=>impNorm(l.phone)===pn);if(!ex&&ext)ex=LEADS.find(l=>l.ext&&l.ext===ext);
      if(pn&&seenP.has(pn)){o.act='ignorar';o.erros.push('Duplicado dentro do arquivo')}else if(pn)seenP.add(pn);
      if(o.act!=='ignorar'&&ex){o.ex=ex;o.act=I.atualizar?'atualizar':'ignorar';if(!I.atualizar)o.erros.push('Já existe no CRM ('+ex.name+') e “atualizar existentes” está desligado')}}
    if(o.act!=='ignorar'){
      let et=IMP_ST[impLow(g(r,'etapa'))],st=impLow(g(r,'status'));
      if(et&&!ST(M.imp.pipe).includes(et)&&et!=='Ganho'&&et!=='Perdido'){o.avisos.push('Etapa “'+et+'” não existe no funil escolhido → Novo lead');et='Novo lead'}
      if(g(r,'etapa')&&!et){o.avisos.push('Etapa “'+g(r,'etapa')+'” não reconhecida → Novo lead');et='Novo lead'}
      if(st==='perdido'){et='Perdido'}else if(st==='ganho'){et='Ganho'}
      o.r.etapa=et||'Novo lead';
      if(o.r.etapa==='Perdido'){const mo=g(r,'perda'),f=PERDAS.find(p=>impLow(p)===impLow(mo));o.r.perda=f||(mo?'Fora do perfil':'Sem resposta');if(mo&&!f)o.avisos.push('Motivo “'+mo+'” não existe → Fora do perfil')}
      const dn=g(r,'dono');if(dn){const t=TEAM.find(p=>impLow(p.name)===impLow(dn)||impLow(p.k)===impLow(dn)||impLow(p.name).split(' ')[0]===impLow(dn));if(t)o.r.dono=t.k;else{o.avisos.push('Proprietário “'+dn+'” não encontrado → sem dono (distribuir depois)');o.r.dono=''}}else o.r.dono=o.ex?o.ex.dono:'';
      const v=g(r,'valor').replace(/[R$\s.]/g,'').replace(',','.');o.r.valor=v&&!isNaN(+v)?+v:(o.ex?o.ex.valor:0);if(g(r,'valor')&&isNaN(+v))o.avisos.push('Valor inválido');
      o.r.entrada=g(r,'entrada');o.r.origem=g(r,'origem')||I.origem;o.r.tags=g(r,'tags');o.r.obs=g(r,'obs');o.r.ext=ext;o.r.email=g(r,'email')}
    out.push(o)});return out}
function impRun(){const I=M.imp,A=impAnalyze();let c=0,u=0,i=0;
  A.forEach(o=>{if(o.act==='ignorar'){i++;return}
    const R=o.r;if(o.act==='atualizar'){const l=o.ex;l.etapa=R.etapa;l.prob=PROB[R.etapa];if(R.valor)l.valor=R.valor;if(R.dono)l.dono=R.dono;if(R.org&&!l.org)l.org=R.org;if(R.ext)l.ext=R.ext;if(R.etapa==='Perdido')l.perda=R.perda;u++}
    else{const l=mk(uid('l'),R.name,R.org||'—',R.phone||R.email||'—',R.valor||0,R.etapa,'',R.origem,'',{ext:R.ext,imp:I.lote||I.fname,perda:R.perda||'',pipe:I.pipe});
      if(R.obs)l.form.push({p:'Observação da importação',r:R.obs});if(R.tags)l.form.push({p:'Etiquetas',r:R.tags});l.tasks=[];DB.criarLead(l);c++}});
  M.impRes={c,u,i,lote:I.lote||I.fname,cad:I.cad,quando:nowT()};LOGS.unshift({h:nowT(),r:'Importação de leads “'+(I.lote||I.fname)+'”',alvo:c+' criados · '+u+' atualizados · '+i+' ignorados',res:'Executada'});M.imp=null}
/* conectado: grava no banco em partes e mostra o andamento */
async function impRunBanco(){const I=M.imp,A=impAnalyze();
  if(A.length>5000)throw new Error('Até 5000 linhas por importação: divida a planilha.');
  I.gravando=true;I.feitas=0;I.total=A.length;renderCrm();
  try{const id=await SB.rpc('importacao_iniciar',{p_lote:I.lote||I.fname,p_arquivo:I.fname,p_funil:I.pipe,p_origem:I.origem,p_atualizar:!!I.atualizar,p_disparar:!!I.cad,p_total:A.length});
    const L=A.map(o=>({n:o.n,act:o.act==='ignorar'?'ignorar':'',nome:o.r.name||'',empresa:o.r.org||'',telefone:o.r.phone||'',email:o.r.email||'',etapa:o.r.etapa||'',
      perda:o.r.perda||'',dono:idDe(o.r.dono)||'',valor:o.r.valor?String(o.r.valor):'',entrada:impData(o.r.entrada),origem:o.r.origem||'',tags:o.r.tags||'',obs:o.r.obs||'',ext:o.r.ext||'',avisos:o.avisos,erros:o.erros}));
    for(let i=0;i<L.length;i+=500){await SB.rpc('importacao_processar',{p_id:id,p_linhas:L.slice(i,i+500)});I.feitas=Math.min(L.length,i+500);renderCrm()}
    const r=await SB.rpc('importacao_concluir',{p_id:id});
    M.impRes={c:r.criados,u:r.atualizados,i:r.ignorados,lote:r.lote,cad:I.cad,quando:nowT(),id};M.imp=null;M.impHist=null;
    await DB.crm.carregar();return r}
  finally{if(M.imp)M.imp.gravando=false}}
function impHistHtml(){if(!SB.ligado())return '';
  if(!M.impHist){M.impHist={linhas:null};SB.sel('importacoes','select=id,lote,arquivo,status,criados,atualizados,ignorados,created_at&order=created_at.desc&limit=5')
    .then(L=>{M.impHist={linhas:L||[]};if(M.imp)renderCrm()},e=>{M.impHist={linhas:[],erro:e.message};if(M.imp)renderCrm()})}
  const L=M.impHist.linhas;if(!L||!L.length)return '';
  const st={concluida:'Concluída',em_andamento:'Interrompida',desfeita:'Desfeita',falhou:'Falhou',simulada:'Simulada'};
  return `<details class="src"${M.impDesfazer?' open':''}><summary>Importações anteriores (${L.length})</summary><table><thead><tr><th>Lote</th><th>Quando</th><th>Resultado</th><th></th></tr></thead><tbody>${L.map(x=>`<tr><td>${esc(x.lote)}</td><td>${fxData(x.created_at)}</td>
    <td>${st[x.status]||x.status} · ${x.criados} criados · ${x.atualizados} atualizados · ${x.ignorados} ignorados</td>
    <td>${S.role==='admin'&&x.status!=='desfeita'&&Date.now()-Date.parse(x.created_at)<7*864e5?(M.impDesfazer===x.id?`<button type="button" class="btn us-delok" data-imp="desfazer-ok" data-id="${esc(x.id)}">Apagar os ${x.criados} criados</button>`:`<button type="button" class="btn" data-imp="desfazer" data-id="${esc(x.id)}">Desfazer</button>`):''}</td></tr>`).join('')}</tbody></table>
    <p style="margin:4px 0 0">Desfazer apaga os negócios criados pelo lote (até 7 dias). Os que já existiam e foram atualizados continuam como estão.</p></details>`}
function impModal(){const I=M.imp;if(!I)return '';
  const steps=['Arquivo','Mapear colunas','Visualizar','Importar'];
  const head=`<div class="impst">${steps.map((s,k)=>`<span class="${I.step===k+1?'on':I.step>k+1?'ok':''}">${k+1}. ${s}</span>`).join('')}</div>`;
  let body='',foot='';
  if(I.step===1){
    body=`<p class="src" style="margin:0">Importe leads de uma planilha (.csv) exportada do GCV ou de outra ferramenta. ${SB.ligado()?'O arquivo é conferido no seu navegador; ao confirmar, as linhas vão para o banco.':'Aqui o arquivo é lido só no seu navegador; nada é enviado a lugar nenhum.'}</p>
    <div class="row"><input type="file" id="impfile" accept=".csv,text/csv,.txt"><span class="src">ou</span><button type="button" class="btn" data-imp="sample">Usar planilha de exemplo (GCV)</button></div>
    ${I.fname?`<div class="pill ok">Arquivo carregado: ${esc(I.fname)} · ${I.rows.length} linhas · ${I.cols.length} colunas</div>`:''}
    <details class="src"><summary>Colunas que o modelo aceita</summary><p style="margin:6px 0 0">${IMP_F.map(f=>esc(f[1])).join(' · ')}. Colunas com * são obrigatórias (nome e telefone, ou e-mail).</p></details>
    <label>Nome do lote<input data-imp-f="lote" value="${esc(I.lote)}" placeholder="Ex.: GCV nov/2026"></label>
    ${PIPES.length>1?`<label>Funil de destino<select data-imp-f="pipe">${optH(PIPES.map(p=>[p.id,p.nome]),I.pipe)}</select></label>`:''}
    <label>Origem padrão (quando a coluna estiver vazia)<select data-imp-f="origem">${optH(ORIGENS,I.origem)}</select></label>
    <label class="chk"><input type="checkbox" data-imp-f="atualizar"${I.atualizar?' checked':''}> Atualizar leads que já existem (mesmo WhatsApp, ID externo ou e-mail)</label>
    <label class="chk"><input type="checkbox" data-imp-f="cad"${I.cad?' checked':''}> Disparar os fluxos de trabalho para os leads novos (pode enviar mensagens)</label>
    <p class="src" style="margin:0">Por padrão a importação <b>não dispara</b> fluxos de trabalho, para ninguém receber mensagem por engano. Até 5000 linhas por vez.</p>${impHistHtml()}`;
    foot=`<button type="button" class="btn pri" data-imp="s2"${I.fname?'':' disabled'}>Continuar</button>`}
  if(I.step===2){
    body=`<p class="src" style="margin:0">Dizemos qual coluna da planilha vira cada campo do CRM. Já tentamos adivinhar pelo nome.</p><table><thead><tr><th>Campo do CRM</th><th>Coluna da planilha</th><th class="src">Exemplo</th></tr></thead><tbody>${IMP_F.map(([k,l])=>`<tr><td>${esc(l)}</td><td><select data-imp-m="${k}"><option value="">— não importar —</option>${I.cols.map((c,i)=>`<option value="${i}"${String(I.map[k])===String(i)?' selected':''}>${esc(c)}</option>`).join('')}</select></td><td class="src">${I.map[k]!==''&&I.map[k]!=null?esc((I.rows[0]||[])[+I.map[k]]||'—'):''}</td></tr>`).join('')}</tbody></table>`;
    foot=`<button type="button" class="btn" data-imp="s1">Voltar</button><button type="button" class="btn pri" data-imp="s3">Visualizar</button>`}
  if(I.step===3){const A=impAnalyze(),n=k=>A.filter(o=>o.act===k).length;
    body=`<div class="impsum"><div><b>${n('criar')}</b><span class="src">criar</span></div><div><b>${n('atualizar')}</b><span class="src">atualizar</span></div><div><b>${n('ignorar')}</b><span class="src">ignorar</span></div><div><b>${A.filter(o=>o.avisos.length).length}</b><span class="src">com avisos</span></div></div>
    <p class="src" style="margin:0">Prévia: nada foi gravado ainda.${SB.ligado()?' Ao gravar, o banco confere de novo quem já existe.':''}</p>
    <div style="overflow:auto"><table><thead><tr><th>Linha</th><th>Contato</th><th>Etapa</th><th>Ação</th><th>Avisos</th></tr></thead><tbody>${A.map(o=>`<tr><td>${o.n}</td><td><b>${esc(o.r.name||'—')}</b><br><span class="src">${esc(o.r.org||'')} ${esc(o.r.phone||'')}</span></td><td>${esc(o.r.etapa||'—')}</td><td><span class="pill ${o.act==='ignorar'?'bad':o.act==='atualizar'?'warn':'ok'}">${o.act==='criar'?'Criar':o.act==='atualizar'?'Atualizar':'Ignorar'}</span></td><td class="src">${esc(o.erros.concat(o.avisos).join(' · ')||'—')}</td></tr>`).join('')}</tbody></table></div>`;
    foot=`<button type="button" class="btn" data-imp="s2">Voltar</button><button type="button" class="btn pri" data-imp="s4"${n('criar')+n('atualizar')?'':' disabled'}>Importar ${n('criar')+n('atualizar')} leads</button>`}
  if(I.step===4){body=I.gravando?`<p>Gravando no banco… ${I.feitas||0} de ${I.total||0} linhas.</p><div class="bar"><i style="width:${I.total?Math.round((I.feitas||0)/I.total*100):0}%"></i></div>`
      :`<p>Pronto para importar. Os leads novos entram no funil e os existentes são atualizados.</p><p class="src" style="margin:0">Fluxos de trabalho: ${I.cad?'disparam para os leads novos':'não disparam'}. Atualizações nunca disparam fluxos.</p>`;
    foot=`<button type="button" class="btn" data-imp="s3"${I.gravando?' disabled':''}>Voltar</button><button type="button" class="btn pri" data-imp="go"${I.gravando?' disabled':''}>${SB.ligado()?'Confirmar importação':'Confirmar importação (simulada)'}</button>`}
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Importar leads"><div class="box" style="max-width:860px"><h3>⬆ Importar leads</h3>${head}${body}<div class="hb">${foot}<button type="button" class="btn" data-imp="close">Cancelar</button></div></div></div>`}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-imp]');if(!b||b.disabled)return;const I=M.imp,a=b.dataset.imp;
  if(a==='open'){M.imp={step:1,fname:'',cols:[],rows:[],map:{},lote:'',origem:ORIGENS.includes('Orgânico')?'Orgânico':(ORIGENS[0]||''),pipe:M.pipe||'pj',atualizar:true,cad:false};M.impRes=null;M.impHist=null;M.impDesfazer=null}
  else if(a==='close')M.imp=null;
  else if(a==='sample'){I.fname=IMP_SAMPLE.name;I.cols=IMP_SAMPLE.cols;I.rows=IMP_SAMPLE.rows;I.map=impAutoMap(I.cols);if(!I.lote)I.lote='GCV nov/2026'}
  else if(a==='s1')I.step=1;else if(a==='s2')I.step=2;else if(a==='s3')I.step=3;else if(a==='s4')I.step=4;
  else if(a==='go'){if(SB.ligado()){impRunBanco().then(r=>{renderCrm();toast(`Importação concluída: ${r.criados} criados, ${r.atualizados} atualizados, ${r.ignorados} ignorados.`)},e=>{renderCrm();toast(e.message)});return}
    impRun();toast('Importação simulada concluída.')}
  else if(a==='desfazer'){M.impDesfazer=b.dataset.id}
  else if(a==='desfazer-ok'){M.impDesfazer=null;SB.rpc('importacao_desfazer',{p_id:b.dataset.id}).then(n=>{M.impHist=null;return DB.crm.carregar().then(()=>{renderCrm();toast(n+' negócio(s) da importação apagado(s).')})},e=>toast(e.message));return}
  else if(a==='clr')M.impRes=null;
  renderCrm()});
document.addEventListener('change',e=>{const el=e.target;if(!M.imp)return;
  if(el.id==='impfile'&&el.files[0]){const f=el.files[0],fr=new FileReader();fr.onload=()=>{const R=impParseCSV(String(fr.result||''));if(R.length<2){toast('Arquivo vazio ou sem linhas de dados.');return}M.imp.fname=f.name;M.imp.cols=R[0].map(x=>x.trim());M.imp.rows=R.slice(1);M.imp.map=impAutoMap(M.imp.cols);renderCrm()};fr.readAsText(f);return}
  if(el.dataset.impM!==undefined){M.imp.map[el.dataset.impM]=el.value;renderCrm();return}
  if(el.dataset.impF){const k=el.dataset.impF;M.imp[k]=el.type==='checkbox'?el.checked:el.value}});
document.addEventListener('input',e=>{const el=e.target;if(M.imp&&el.dataset&&el.dataset.impF==='lote')M.imp.lote=el.value});

