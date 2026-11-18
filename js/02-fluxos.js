/* ===== Utilitários dos módulos (usados por CRM, IA, tarefas…) ===== */
/* data de hoje: na demonstração é fixa (os exemplos foram escritos para 05/11/2026); conectado, é a data real */
const TODAY=SB.ligado()?new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10):'2026-11-05';
const M={pipe:'pj',crmTab:'funil',crmSel:null,crmSide:'resumo',needPerda:false,closeFor:null,fOwner:'todos',fOrigem:'todas',iaTab:'agentes',iaSel:'i1',iaFil:'revisar',resEdit:null,newDeal:false};
const optH=(list,val)=>list.map(o=>{const v=Array.isArray(o)?o[0]:o,l=Array.isArray(o)?o[1]:o;return `<option value="${esc(v)}"${String(v)===String(val)?' selected':''}>${esc(l)}</option>`}).join('');
const filaOpts=()=>QUEUES.filter(q=>!['minha','mencoes','todos'].includes(q.id)).map(q=>[q.id,q.name]);
const peopleOpts=()=>TEAM.map(p=>[p.k,p.name]);
const brl=n=>'R$ '+Number(n||0).toLocaleString('pt-BR');
const pageHead=(t,sub)=>`<div class="ph" style="padding-left:0;border:0"><h2 style="font-family:var(--serif);font-size:20px;margin:0">${t}</h2>${sub?`<span class="src">${sub}</span>`:''}</div>`;
const subTabs=(cu,list,act)=>`<div class="seg" role="group">${list.map(([k,l])=>`<button type="button" data-x="${act}" data-v="${k}" class="${cu===k?'on':''}">${l}</button>`).join('')}</div>`;
const uid=p=>p+Date.now().toString(36)+Math.floor(Math.random()*99);
function fillVars(t,l){return String(t||'').replace(/\{nome\}/g,(l&&l.name||'').split(' ')[0]).replace(/\{empresa\}/g,(l&&l.org)||'')}
/* mensagens agendadas (botão do relógio na conversa) e registro geral */
const SCHED=[{id:'s1',c:'c4',when:'2026-11-06T09:00',x:'Helena, bom dia! Conseguiu separar o extrato atualizado?'}];
const LOGS=[];

/* ===== Fluxos de trabalho (como no GCV): lista com pastas + construtor visual =====
   Um fluxo = acionadores (gatilhos; basta um acontecer) + passos em sequência, com caminhos (se/senão, horário,
   aguardar resposta). Depois de um passo que ramifica, cada caminho segue sozinho até o FIM.
   Catálogo de gatilhos e ações: FLX_CAT (supabase/functions/_shared/fluxos-catalogo.json, injetado pelo build).
   Conectado: lista e rascunhos no banco (crm_0018), "Publicar" grava uma versão, IA pela Edge Function fluxos-ia.
   A execução real no servidor é a parte 3b; na demonstração, os fluxos de CRM rodam aqui mesmo (mudar etapa). */
const FXG=new Map(FLX_CAT.gatilhos.map(x=>[x.tipo,x])),FXA=new Map(FLX_CAT.acoes.map(x=>[x.tipo,x]));
const FX={tela:'lista',id:null,aba:'construtor',lista:'todos',pasta:null,busca:'',sel:null,picker:null,pickBusca:'',ia:false,iaModo:'construir',iaTxt:'',iaBusy:false,iaRes:null,
  iaLista:false,zoom:1,salvo:'ok',carregado:false,erro:'',teste:null,menu:null,novaPasta:false,agendadas:false,desfazer:null};
const FX_FILA=new WeakMap();
const FX_PASTAS=[{id:'pa1',nome:'Atendimento'},{id:'pa2',nome:'Comercial'}];
let _fxn=0;const fxId=p=>p+(++_fxn)+Date.now().toString(36).slice(-3);
const fxClone=v=>v===undefined?'':JSON.parse(JSON.stringify(v));
/* "Se / senão": o formato antigo (uma condição solta no passo) vira lista de condições */
function fxNorm(tipo,cfg){if(tipo==='se'&&(cfg.sujeito||!Array.isArray(cfg.condicoes))){cfg.condicoes=cfg.sujeito||!Array.isArray(cfg.condicoes)?[{sujeito:cfg.sujeito||'tag',operador:cfg.operador||'e',valor:cfg.valor??''}]:cfg.condicoes;
  cfg.modo=cfg.modo||'todas';delete cfg.sujeito;delete cfg.operador;delete cfg.valor}return cfg}
function fxNormDef(def){const w=L=>(L||[]).forEach(p=>{p.cfg=fxNorm(p.tipo,p.cfg||{});(p.ramos||[]).forEach(r=>w(r.passos))});w(def.passos);return def}
const fxNoSel=f=>f.def.gatilhos.find(x=>x.id===FX.sel)||(fxAchar(f.def,FX.sel)||{}).p;
const fxP=(tipo,cfg,ramos)=>{const it=FXA.get(tipo),c={};(it.campos||[]).forEach(f=>c[f.k]=fxClone(f.padrao));Object.assign(c,cfg||{});fxNorm(tipo,c);
  const p={id:fxId('p'),tipo,cfg:c};const nm=fxRamosNomes(it,c);if(nm)p.ramos=nm.map((n,i)=>({id:fxId('r'),nome:n,passos:(ramos&&ramos[i])||[]}));return p};
const fxG=(tipo,cfg)=>{const it=FXG.get(tipo),c={};(it.campos||[]).forEach(f=>c[f.k]=fxClone(f.padrao));return {id:fxId('g'),tipo,cfg:Object.assign(c,cfg||{})}};
function fxRamosNomes(it,cfg){return it&&it.ramos||null}
const FLUXOS=[   // demonstração (os antigos fluxos de conversa e automações, agora no formato novo)
 {id:'w1',nome:'Boas-vindas e triagem no WhatsApp',pasta:'pa1',status:'publicado',inscritos:412,ativos:3,atualizado:'2026-11-03T15:20',criado:'2026-09-10T10:00',cfg:{reinscricao:true,parar_resposta:false},
  def:{gatilhos:[fxG('nova_conversa',{canal:'whatsapp'})],passos:[
   fxP('mensagem',{texto:'Olá, {nome}! Aqui é do escritório Neves Pádua. Recebemos sua mensagem e já vamos te atender.'}),
   fxP('horario',{fila:'triagem'},[[fxP('criar_tarefa',{titulo:'Responder {nome} (nova conversa)',responsavel:'Ana Júlia',em_horas:1}),fxP('transferir',{fila:'triagem'})],
    [fxP('mensagem',{texto:'Recebemos sua mensagem fora do nosso horário. Retornamos no próximo dia útil a partir das 8h.'}),fxP('fim')]])]}},
 {id:'w2',nome:'Lead qualificado → ligar em 1 dia',pasta:'pa2',status:'publicado',inscritos:58,ativos:0,atualizado:'2026-10-28T09:00',criado:'2026-08-02T14:00',cfg:{},
  def:{gatilhos:[fxG('etapa_mudou',{funil:'pj',etapa:'Qualificado'})],passos:[fxP('criar_atividade',{tipo_atividade:'ligacao',titulo:'Ligar para o lead',em_dias:1})]}},
 {id:'w3',nome:'Follow-up da proposta',pasta:'pa2',status:'publicado',inscritos:41,ativos:6,atualizado:'2026-11-01T11:47',criado:'2026-08-02T14:10',cfg:{parar_resposta:true},
  def:{gatilhos:[fxG('etapa_mudou',{funil:'pj',etapa:'Proposta enviada'})],passos:[
   fxP('criar_atividade',{tipo_atividade:'followup',titulo:'Follow-up da proposta',em_dias:2}),fxP('aguardar',{quantidade:2,unidade:'dias'}),
   fxP('se',{sujeito:'etapa',operador:'e',valor:'Proposta enviada'},[[fxP('mensagem',{texto:'Olá, {nome}! Conseguiu analisar a proposta que enviamos? Fico à disposição para tirar dúvidas.'}),fxP('aguardar_resposta',{horas:72},[[],[fxP('mover_etapa',{funil:'pj',etapa:'Negociação'})]])],[]])]}},
 {id:'w4',nome:'Tag “Urgente” → avisar o líder',pasta:null,status:'publicado',inscritos:17,ativos:0,atualizado:'2026-10-15T16:05',criado:'2026-10-15T16:00',cfg:{},
  def:{gatilhos:[fxG('tag_adicionada',{tag:'Urgente'})],passos:[fxP('avisar_equipe',{pessoa:'Mario',texto:'Contato marcado como urgente: confira a conversa.'})]}},
 {id:'w6',nome:'Tag “Aguardando documentos” sem resposta do cliente → lembrete',pasta:'pa1',status:'rascunho',inscritos:0,ativos:0,atualizado:'2026-11-05T10:30',criado:'2026-11-05T10:30',cfg:{parar_resposta:true},
  desc:'SE o cliente tem a tag “Aguardando documentos” E ficou mais de 60 min sem responder, ENTÃO manda um lembrete.',
  def:{gatilhos:[fxG('cliente_sem_responder',{minutos:60})],passos:[
   fxP('se',{sujeito:'tag',operador:'e',valor:'Aguardando documentos'},[[fxP('mensagem',{texto:'Olá, {nome}! Passando para lembrar dos documentos que combinamos. Quando puder, envie por aqui mesmo. Qualquer dúvida, estamos à disposição.'})],[]])]}},
 {id:'w5',nome:'Retomar conversa parada',pasta:'pa1',status:'rascunho',inscritos:0,ativos:0,atualizado:'2026-11-04T18:02',criado:'2026-11-04T17:40',cfg:{},
  def:{gatilhos:[fxG('sem_resposta',{minutos:1440})],passos:[fxP('resposta_rapida',{atalho:''})]}}];
const FX_INSC=[{f:'w1',c:'Renata Moura',em:'2026-11-05T10:20',st:'Concluído',passo:'Transferir para fila'},{f:'w1',c:'Marcos Tavares',em:'2026-11-05T09:14',st:'Concluído',passo:'Transferir para fila'},
 {f:'w3',c:'Transportes Rápido',em:'2026-11-03T09:00',st:'Ativo',passo:'Aguardar (2 dias)'},{f:'w2',c:'Oficina Santos ME',em:'2026-11-02T15:00',st:'Concluído',passo:'Criar atividade no negócio'}];
const FX_REG=[{f:'w1',h:'2026-11-05T10:20',c:'Renata Moura',p:'Enviar mensagem',r:'Executado'},{f:'w1',h:'2026-11-05T10:20',c:'Renata Moura',p:'Dentro do horário? → Dentro do horário',r:'Executado'},
 {f:'w4',h:'2026-11-05T09:40',c:'Marcos Tavares',p:'Avisar alguém da equipe',r:'Executado'},{f:'w2',h:'2026-11-02T15:00',c:'Oficina Santos ME',p:'Criar atividade no negócio',r:'Executado'}];
const fxAtual=()=>FLUXOS.find(f=>f.id===FX.id);
const FX_EST={ativa:'Ativo',aguardando:'Aguardando',esperando_resposta:'Esperando resposta',concluida:'Concluído',saiu:'Saiu',erro:'Erro'};
const FX_RES={executado:'Executado',pulado:'Pulado',aguardando:'Aguardando',caminho:'Caminho',erro:'Erro',saiu:'Saiu do fluxo'};
let FX_DADOS=null;   // {chave, linhas, erro} da aba aberta (inscrições ou registros)
function fxDados(f,tipo){const ch=tipo+':'+f.id;
  if(!FX_DADOS||FX_DADOS.chave!==ch){FX_DADOS={chave:ch,linhas:null,erro:''};
    (tipo==='insc'?DB.fluxos.inscricoes(f):DB.fluxos.registros(f)).then(L=>{if(FX_DADOS&&FX_DADOS.chave===ch){FX_DADOS.linhas=L;renderFluxos()}},e=>{if(FX_DADOS&&FX_DADOS.chave===ch){FX_DADOS.erro=e.message;renderFluxos()}})}
  return FX_DADOS}
const fxData=s=>{if(!s)return '—';const d=new Date(s);return isNaN(d)?'—':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})+', '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})};

/* ---- opções dos campos (as mesmas listas que a IA recebe) ---- */
function fxOpcoes(lista,cfg){
  if(FLX_CAT.estaticas[lista])return FLX_CAT.estaticas[lista];
  switch(lista){
   case 'filas':return filaOpts();case 'tags':return TAGS.map(t=>[t,t]);case 'funis':return PIPES.map(p=>[p.id,p.nome]);
   case 'etapas':{const p=PIPES.find(x=>x.id===(cfg&&cfg.funil));return p?p.etapas.map(e=>[e,e]):[]}
   case 'pessoas':return TEAM.map(p=>[p.id||p.k,p.name]);case 'respostas':return Object.keys(QUICK).map(k=>[k,k]);
   case 'origens':return ORIGENS.map(o=>[o,o]);case 'perdas':return PERDAS.map(o=>[o,o]);case 'campos':return CAMPOS.map(c=>[c.id,c.nome]);
   case 'fluxos':return FLUXOS.filter(f=>!f.excluido&&f.id!==FX.id).map(f=>[f.id,f.nome]);}
  return []}
function fxOpcoesCampo(c,cfg){
  if(c.tipo==='valor_do_sujeito'){const s=cfg.sujeito;if(s==='etapa')return [...new Set(PIPES.flatMap(p=>p.etapas))].map(e=>[e,e]);
    const L={tag:'tags',funil:'funis',canal:'canais',origem:'origens'}[s];return L?fxOpcoes(L,cfg):null}
  return c.tipo==='select'&&c.opcoes?fxOpcoes(c.opcoes,cfg):null}
const fxRot=(c,cfg,v)=>{const o=fxOpcoesCampo(c,cfg);if(!o)return String(v);const x=o.find(y=>String(y[0])===String(v));return x?x[1]:String(v)};
function fxPend(it,cfg){const p=[];(it.campos||[]).forEach(c=>{const v=cfg[c.k];
  if(c.tipo==='condicoes'){const L=Array.isArray(v)?v:[];if(!L.length)p.push('falta ao menos uma condição');
    L.forEach(q=>{const o2=fxOpcoesCampo({tipo:'valor_do_sujeito'},q);if(q.valor===''||q.valor==null)p.push('falta o valor de uma condição');else if(o2&&!o2.some(x=>String(x[0])===String(q.valor)))p.push('“'+q.valor+'” não existe mais')});return}
  const o=fxOpcoesCampo(c,cfg);
  if(c.obrig&&(v===''||v==null))p.push('falta '+c.rotulo.toLowerCase());else if(o&&v!==''&&v!=null&&!o.some(x=>String(x[0])===String(v)))p.push(c.rotulo+': “'+v+'” não existe mais')});return p}
function fxResumo(it,cfg){
  const t=it.tipo,v=k=>cfg[k],r=k=>fxRot(it.campos.find(c=>c.k===k)||{},cfg,v(k));
  if(t==='mensagem'||t==='avisar_equipe'){const x=String(v('texto')||'').replace(/\s+/g,' ');return (t==='avisar_equipe'&&v('pessoa')?r('pessoa')+': ':'')+(x.length>60?x.slice(0,60)+'…':x)}
  if(t==='aguardar')return v('quantidade')+' '+r('unidade');if(t==='aguardar_resposta')return 'até '+v('horas')+' h';
  if(t==='se'){const L=Array.isArray(cfg.condicoes)?cfg.condicoes:[],lb=(A,x)=>(A.find(y=>y[0]===x)||[,x])[1];
    return L.map(q=>lb(FLX_CAT.estaticas.sujeitos,q.sujeito)+' '+lb(FLX_CAT.estaticas.operadores,q.operador)+' '+(q.valor===''||q.valor==null?'…':fxRot({tipo:'valor_do_sujeito'},q,q.valor))).join(cfg.modo==='qualquer'?' ou ':' e ')}
  if(t==='criar_atividade')return r('tipo_atividade')+': '+(v('titulo')||'…');if(t==='criar_tarefa')return (v('titulo')||'…')+(v('responsavel')?' · '+r('responsavel'):'');
  const un={minutos:' min',dias:' dias',horas:' h',dias_antes:' dias antes',em_horas:' h',em_dias:' dias'};
  return (it.campos||[]).filter(c=>v(c.k)!==''&&v(c.k)!=null).map(c=>r(c.k)+(un[c.k]||'')).join(' · ')}
/* procurar na árvore */
function fxLista(def,lid){if(lid==='root')return def.passos;let a=null;const w=L=>L.forEach(p=>(p.ramos||[]).forEach(r=>{if(r.id===lid)a=r.passos;else w(r.passos)}));w(def.passos);return a}
function fxAchar(def,id){let a=null;const w=L=>L.forEach((p,i)=>{if(p.id===id)a={p,L,i};(p.ramos||[]).forEach(r=>w(r.passos))});w(def.passos);return a}
function fxContar(def){let n=0;const w=L=>L.forEach(p=>{n++;(p.ramos||[]).forEach(r=>w(r.passos))});w(def.passos);return n}

/* ---- dados: memória (demonstração) ou banco (crm_0018) ---- */
DB.fluxos={
  async carregar(){if(!SB.ligado())return;
    try{const [fl,pa,ct]=await Promise.all([SB.sel('fluxos','select=id,nome,descricao,status,definicao,configuracoes,pasta_id,versao_publicada,updated_at,created_at,excluido_em&order=nome'),
        SB.sel('fluxo_pastas','select=id,nome&order=nome'),SB.rpc('fluxo_contagens').catch(()=>[])]);
      const cnt=id=>(ct||[]).find(x=>x.fluxo_id===id)||{inscritos:0,ativos:0};
      FX_PASTAS.splice(0,FX_PASTAS.length,...pa);
      FLUXOS.splice(0,FLUXOS.length,...fl.map(f=>({id:f.id,nome:f.nome,desc:f.descricao||'',pasta:f.pasta_id,status:f.status,versao:f.versao_publicada,
        def:fxNormDef({gatilhos:(f.definicao&&f.definicao.gatilhos)||[],passos:(f.definicao&&f.definicao.passos)||[]}),cfg:f.configuracoes||{},
        inscritos:cnt(f.id).inscritos,ativos:cnt(f.id).ativos,atualizado:f.updated_at,criado:f.created_at,excluido:!!f.excluido_em})));
      FX_INSC.length=0;FX_REG.length=0;FX.carregado=true;FX.erro=''}
    catch(e){FX.erro=e.message}},
  /* um salvamento por vez para cada fluxo (o primeiro cria o fluxo no banco; os seguintes atualizam) */
  salvar(f){f.atualizado=new Date().toISOString();if(!SB.ligado())return Promise.resolve();
    const ant=FX_FILA.get(f)||Promise.resolve(),p=ant.catch(()=>{}).then(async()=>{
      const id=await SB.rpc('fluxo_salvar',{p_id:f.novo?null:f.id,p_nome:f.nome,p_definicao:f.def,p_configuracoes:f.cfg||{},p_descricao:f.desc||null,p_pasta:f.pasta||null});
      if(f.novo){if(FX.id===f.id)FX.id=id;f.id=id;delete f.novo}});
    FX_FILA.set(f,p);return p},
  async publicar(f,on){
    if(!SB.ligado()){if(on){if(!f.def.gatilhos.length)throw new Error('Adicione um acionador antes de publicar.');if(!f.def.passos.length)throw new Error('Adicione ao menos uma ação antes de publicar.')}
      f.status=on?'publicado':'rascunho';return}
    await DB.fluxos.salvar(f);f.versao=await SB.rpc('fluxo_publicar',{p_id:f.id,p_publicar:!!on});f.status=on?'publicado':'rascunho'},
  async excluir(f,sim){if(SB.ligado())await SB.rpc('fluxo_excluir',{p_id:f.id,p_excluir:!!sim});f.excluido=!!sim;if(sim)f.status='rascunho'},
  async duplicar(f){if(SB.ligado()){await SB.rpc('fluxo_duplicar',{p_id:f.id});return DB.fluxos.carregar()}
    FLUXOS.push({...JSON.parse(JSON.stringify(f)),id:uid('w'),nome:(f.nome+' (cópia)').slice(0,80),status:'rascunho',inscritos:0,ativos:0,criado:new Date().toISOString(),atualizado:new Date().toISOString()})},
  async criarPasta(nome){if(SB.ligado()){await SB.rpc('fluxo_pasta_criar',{p_nome:nome});return DB.fluxos.carregar()}
    if(FX_PASTAS.some(p=>nz(p.nome)===nz(nome)))throw new Error('Já existe uma pasta com esse nome.');FX_PASTAS.push({id:uid('pa'),nome})},
  async mover(f,pasta){if(SB.ligado())await SB.rpc('fluxo_mover',{p_id:f.id,p_pasta:pasta||null});f.pasta=pasta||null},
  /* histórico de inscrições e registros de execução (motor no servidor, crm_0019) */
  async inscricoes(f){if(!SB.ligado())return FX_INSC.filter(x=>x.f===f.id).map(x=>({nome:x.c,em:x.em,estado:x.st,passo:x.passo,prox:null,erro:'',id:null}));
    return (await SB.rpc('fluxo_inscricoes_de',{p_fluxo:f.id,p_limite:200})||[]).map(x=>({id:x.id,nome:x.contato_nome||'—',em:x.criado_em,estado:FX_EST[x.estado]||x.estado,ativo:['ativa','aguardando','esperando_resposta'].includes(x.estado),
      passo:x.passo_tipo?(FXA.get(x.passo_tipo)||{nome:x.passo_tipo}).nome:'—',prox:['aguardando','esperando_resposta'].includes(x.estado)?x.proximo_em:null,erro:x.erro||''}))},
  async registros(f){if(!SB.ligado())return FX_REG.filter(x=>x.f===f.id).map(x=>({h:x.h,c:x.c,p:x.p,r:x.r,det:''}));
    return (await SB.sel('fluxo_registros','select=criado_em,contato_nome,passo_tipo,resultado,detalhe&fluxo_id=eq.'+f.id+'&order=id.desc&limit=200')||[])
      .map(x=>({h:x.criado_em,c:x.contato_nome||'—',p:(FXA.get(x.passo_tipo)||{nome:x.passo_tipo||'—'}).nome,r:FX_RES[x.resultado]||x.resultado,det:x.detalhe||''}))},
  async remover(id){await SB.rpc('fluxo_inscricao_remover',{p_id:id})},
  async ia(pedido,def){if(!SB.ligado())throw new Error('Na demonstração a IA não é chamada. Na versão conectada, ela monta o fluxo a partir da sua descrição (com a chave da API do escritório).');
    return SB.funcao('fluxos-ia',{pedido,definicao:def||null})}
};
function fxAcao(p,msg){Promise.resolve(p).then(()=>{renderFluxos();if(msg)toast(msg)},e=>{toast(e&&e.message||String(e));renderFluxos()})}
/* salvamento automático do rascunho (como o "Salvo(a)" do GCV) */
let _fxT=null;
function fxMudou(redesenhar){const f=fxAtual();if(!f)return;FX.salvo='pend';clearTimeout(_fxT);
  _fxT=setTimeout(()=>{FX.salvo='salvando';fxStatus();DB.fluxos.salvar(f).then(()=>{FX.salvo='ok';fxStatus()},e=>{FX.salvo='erro';fxStatus();toast(e.message)})},SB.ligado()?900:200);
  if(redesenhar)queueMicrotask(renderFluxos);else fxStatus()}   // depois do evento: redesenhar no meio de um "change" quebra o DOM
function fxStatus(){const e=$('#fxsalvo');if(e)e.textContent={ok:'✓ Salvo',pend:'Alterações não salvas…',salvando:'Salvando…',erro:'⚠ Não foi salvo'}[FX.salvo]}

/* ---- telas ---- */
const FX_IC={Conversa:'<path d="M4 5h16v11H9l-5 4z"/>',Contato:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/>',CRM:'<path d="M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z"/>',
  Tarefas:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',Integrações:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  Pasta:'<path d="M3 7h6l2 2h10v10H3z"/>',Comunicação:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',Controle:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'};
const fxIc=g=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FX_IC[g]||FX_IC.Controle}</svg>`;
const SPARK='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/></svg>';

let _fxDesenhando=false;
function renderFluxos(){
  const el=$('#fluxos');if(!el||_fxDesenhando)return;_fxDesenhando=true;
  try{_renderFluxos(el)}finally{_fxDesenhando=false}}
function _renderFluxos(el){
  if(SB.ligado()&&!FX.carregado&&!FX.erro){DB.fluxos.carregar().then(renderFluxos)}
  if(FX.tela==='editor'&&!fxAtual())FX.tela='lista';
  el.innerHTML=(SB.ligado()&&!FX.carregado?`<div class="mod">${FX.erro?`<div class="empty"><b>Não foi possível carregar</b>${esc(FX.erro)}</div>`:'<div class="empty"><b>Carregando…</b></div>'}</div>`
    :FX.tela==='lista'?fxListaHtml():fxEditorHtml())+fxModais()}

function fxListaHtml(){
  const b=nz(FX.busca).trim();
  let L=FLUXOS.filter(f=>FX.lista==='apagados'?f.excluido:!f.excluido&&(FX.lista!=='rascunhos'||f.status==='rascunho'));
  if(b)L=L.filter(f=>nz(f.nome).includes(b));else if(FX.lista==='todos')L=L.filter(f=>(f.pasta||null)===FX.pasta);
  const pastas=!b&&FX.lista==='todos'&&!FX.pasta?FX_PASTAS:[],pasta=FX_PASTAS.find(p=>p.id===FX.pasta);
  const num=n=>n==null?'<span class="src">—</span>':n;
  const linhas=pastas.map(p=>`<tr><td colspan="6"><button type="button" class="fxw-pasta" data-fw="pasta" data-id="${esc(p.id)}">${fxIc('Pasta')} ${esc(p.nome)} <span class="src">(${FLUXOS.filter(f=>f.pasta===p.id&&!f.excluido).length})</span></button></td></tr>`).join('')
   +L.map(f=>`<tr><td><button type="button" class="fxw-nome" data-fw="abrir" data-id="${esc(f.id)}">${esc(f.nome)}</button>${b&&f.pasta?` <span class="src">· ${esc((FX_PASTAS.find(p=>p.id===f.pasta)||{}).nome||'')}</span>`:''}</td>
     <td><span class="fxw-st ${f.status==='publicado'?'pub':''}">${f.excluido?'Apagado':f.status==='publicado'?'Publicado':'Rascunho'}</span></td><td>${num(f.inscritos)}</td><td>${num(f.ativos)}</td><td class="src">${fxData(f.atualizado)}</td>
     <td class="fxw-acoes">${f.excluido?`<button type="button" class="btn" data-fw="restaurar" data-id="${esc(f.id)}">Restaurar</button>`
       :`<button type="button" class="btn ic-sm" data-fw="menu" data-id="${esc(f.id)}" aria-label="Mais opções de ${esc(f.nome)}" aria-expanded="${FX.menu===f.id}">⋯</button>${FX.menu===f.id?`<div class="chmenu fxw-menu" role="menu"><button type="button" class="btn" data-fw="abrir" data-id="${esc(f.id)}">Editar</button><button type="button" class="btn" data-fw="duplicar" data-id="${esc(f.id)}">Duplicar</button>
         <label>Mover para a pasta<select data-fw-mover="${esc(f.id)}">${optH([['','Página inicial'],...FX_PASTAS.map(p=>[p.id,p.nome])],f.pasta||'')}</select></label><button type="button" class="btn us-delok" data-fw="apagar" data-id="${esc(f.id)}">Apagar</button></div>`:''}`}</td></tr>`).join('');
  return `<div class="mod fxw"><div class="fxw-top"><h2>Lista de fluxos de trabalho</h2><span style="flex:1"></span>
    <button type="button" class="btn" data-fw="agendadas">⏰ Mensagens agendadas</button><button type="button" class="btn" data-fw="pasta-nova">Criar pasta</button>
    <button type="button" class="btn fx-iab" data-fw="ia-lista">${SPARK} Construa usando IA</button><button type="button" class="btn pri" data-fw="novo">+ Criar fluxo de trabalho</button></div>
   <div class="fxw-tabs" role="tablist">${[['todos','Todos os fluxos'],['rascunhos','Rascunhos'],['apagados','Apagado(a)']].map(([k,l])=>`<button type="button" role="tab" aria-selected="${FX.lista===k}" class="${FX.lista===k?'on':''}" data-fw="aba-lista" data-v="${k}">${l}</button>`).join('')}</div>
   <div class="fxw-bar"><span class="fxw-bc">${FX.pasta&&!b?`<button type="button" class="back" data-fw="pasta" data-id="">Página inicial</button> › <b>${esc(pasta?pasta.nome:'')}</b>`:'<b>Página inicial</b>'}</span><span style="flex:1"></span>
    <input type="search" id="fxbusca" placeholder="Pesquisar" aria-label="Pesquisar fluxos" value="${esc(FX.busca)}"></div>
   <div class="tbl"><table class="fxw-tab"><thead><tr><th>Nome</th><th>Status</th><th>Inscritos</th><th>Ativos agora</th><th>Atualizado em</th><th></th></tr></thead>
    <tbody>${linhas||`<tr><td colspan="6" class="src" style="padding:18px">${FX.lista==='apagados'?'Nada na lixeira.':'Nenhum fluxo aqui. Use “+ Criar fluxo de trabalho” ou “Construa usando IA”.'}</td></tr>`}</tbody></table></div>
   <p class="src">${SB.ligado()?`Conectado ao banco (${esc(AMBIENTE.rotulo)}). O motor roda no servidor a cada minuto: fluxos publicados recebem contatos e negócios.`:'Demonstração: os fluxos de CRM (mudar etapa, criar negócio) rodam aqui mesmo; mensagens não são enviadas.'}</p></div>`}

function fxEditorHtml(){
  const f=fxAtual(),abas=[['construtor','Construtor'],['config','Configurações'],['insc','Histórico de inscrições'],['reg','Registros de execução'],['teste','Testar fluxo de trabalho']];
  const corpo=FX.aba==='construtor'?fxConstrutor(f):FX.aba==='config'?fxConfig(f):FX.aba==='insc'?fxInsc(f):FX.aba==='reg'?fxReg(f):fxTeste(f);
  return `<div class="fxe"><div class="fxe-bar"><button type="button" class="back" data-fw="voltar">← Lista de fluxos de trabalho</button>
    <span class="fxe-nome"><input id="fxnome" value="${esc(f.nome)}" maxlength="80" size="${Math.max(18,Math.min(60,f.nome.length+2))}" aria-label="Nome do fluxo"> <span aria-hidden="true">✎</span></span><span style="flex:1"></span>
    <span id="fxsalvo" class="src"></span>
    <label class="fxe-pub"><span>Rascunho</span><input type="checkbox" role="switch" id="fxpub"${f.status==='publicado'?' checked':''}><i aria-hidden="true"></i><span>Publicar</span></label></div>
   <div class="fxe-tabs" role="tablist">${abas.map(([k,l])=>`<button type="button" role="tab" aria-selected="${FX.aba===k}" class="${FX.aba===k?'on':''}${k==='teste'?' tst':''}" data-fw="aba" data-v="${k}">${l}</button>`).join('')}</div>
   ${corpo}</div>`}

function fxConstrutor(f){
  const d=f.def;
  const gat=d.gatilhos.map(g=>{const it=FXG.get(g.tipo)||{nome:g.tipo,grupo:'Controle',campos:[]},pd=it.campos?fxPend(it,g.cfg):[];
    return `<button type="button" class="fx-card gat${FX.sel===g.id?' on':''}${pd.length?' pend':''}" data-fw="sel" data-id="${esc(g.id)}"><span class="fx-ic">${fxIc(it.grupo)}</span><span class="fx-tx"><small class="fx-k">Acionador</small><b>${esc(it.nome)}</b><small>${esc(fxResumo(it,g.cfg))}</small>${pd.length?'<em>Configure este acionador</em>':''}</span></button>`}).join('');
  const canvas=`<div class="fx-gat">${gat}<button type="button" class="fx-card novo" data-fw="add-gat"><span class="fx-mais">+</span><b>Adicionar novo acionador</b></button></div>${fxPassosHtml(d.passos,'root')}`;
  return `<div class="fxc${FX.ia?' com-ia':''}${FX.sel?' com-gaveta':''}">
    <div class="fxc-tools"><button type="button" class="btn ic${FX.ia?' on':''}" data-fw="ia" title="Construir com IA" aria-label="Construir com IA" aria-pressed="${FX.ia}">${SPARK}</button>
     <span style="height:10px"></span><button type="button" class="btn ic" data-fw="zoom" data-v="1" aria-label="Aproximar">+</button><span class="src">${Math.round(FX.zoom*100)}%</span><button type="button" class="btn ic" data-fw="zoom" data-v="-1" aria-label="Afastar">−</button><button type="button" class="btn ic" data-fw="zoom" data-v="0" aria-label="Tamanho normal">⤢</button></div>
    ${FX.ia?fxIAPainel(f):''}
    <div class="fxc-canvas"><div class="fxc-in" style="transform:scale(${FX.zoom})">${canvas}</div></div>
    ${FX.sel?fxGaveta(f):''}</div>`}

function fxPassosHtml(L,lid){
  let h=`<div class="fx-seq">`,fim=false;
  const add=i=>`<div class="fx-lig"></div><button type="button" class="fx-add" data-fw="add" data-lista="${esc(lid)}" data-pos="${i}" aria-label="Adicionar ação aqui" title="Adicionar ação">+</button>`;
  h+=add(0);
  for(let i=0;i<L.length;i++){const p=L[i],it=FXA.get(p.tipo)||{nome:p.tipo,grupo:'Controle',campos:[]},pd=it.campos?fxPend(it,p.cfg):[];
    h+=`<div class="fx-lig"></div><button type="button" class="fx-card${FX.sel===p.id?' on':''}${pd.length?' pend':''}" data-fw="sel" data-id="${esc(p.id)}"><span class="fx-ic g-${esc(it.grupo)}">${fxIc(it.grupo)}</span><span class="fx-tx"><b>${esc(it.nome)}</b><small>${esc(fxResumo(it,p.cfg))}</small>${pd.length?'<em>Configure este passo</em>':''}</span></button>`;
    if(p.ramos){h+=`<div class="fx-lig"></div><div class="fx-ramos">${p.ramos.map(r=>`<div class="fx-ramo"><span class="fx-rnome">${esc(r.nome)}</span>${fxPassosHtml(r.passos,r.id)}</div>`).join('')}</div>`;fim=true;break}
    if(it.fim){fim=true;h+=`<div class="fx-lig"></div><span class="fx-fim">FIM</span>`;break}
    h+=add(i+1)}
  if(!fim)h+=`<div class="fx-lig"></div><span class="fx-fim">FIM</span>`;
  return h+'</div>'}

function fxCondHtml(c,cfg){
  const L=Array.isArray(cfg[c.k])?cfg[c.k]:[],uni=cfg.modo==='qualquer'?'ou':'e';
  return `<span class="fx-lab">${esc(c.rotulo)} *</span><div class="fx-conds">${L.map((q,i)=>{const o2=fxOpcoesCampo({tipo:'valor_do_sujeito'},q);
    return `${i?`<span class="fx-uni">${uni}</span>`:''}<div class="fx-cond"><select data-fw-cond="${i}" data-k="sujeito" aria-label="Condição ${i+1}: sobre o quê">${optH(FLX_CAT.estaticas.sujeitos,q.sujeito)}</select>
      <select data-fw-cond="${i}" data-k="operador" aria-label="Condição ${i+1}: comparação">${optH(FLX_CAT.estaticas.operadores,q.operador)}</select>
      ${o2?`<select data-fw-cond="${i}" data-k="valor" aria-label="Condição ${i+1}: valor">${optH([['','Escolha…'],...o2],q.valor)}</select>`:`<input data-fw-cond="${i}" data-k="valor" value="${esc(q.valor??'')}" aria-label="Condição ${i+1}: valor" placeholder="Valor">`}
      ${L.length>1?`<button type="button" class="xbtn" data-fw="cond-del" data-i="${i}" aria-label="Tirar a condição ${i+1}" title="Tirar a condição">×</button>`:''}</div>`}).join('')}
    <div><button type="button" class="btn" data-fw="cond-add">+ Condição</button></div>
    ${L.some(q=>q.sujeito==='tag')?'<span class="src">Tag do contato funciona depois do passo 2. Até lá, conta como “não”.</span>':''}</div>`}
function fxCampoHtml(c,cfg){
  if(c.tipo==='condicoes')return fxCondHtml(c,cfg);
  const v=cfg[c.k]??'',id='fxc-'+c.k,o=fxOpcoesCampo(c,cfg);
  const lab=`<label for="${id}">${esc(c.rotulo)}${c.obrig?' *':''}</label>`;
  if(o)return lab+`<select id="${id}" data-fw-cfg="${esc(c.k)}">${optH([['',c.obrig?'Escolha…':'—'],...o],v)}</select>`;
  if(c.tipo==='textarea'||c.tipo==='lista')return lab+`<textarea id="${id}" rows="${c.tipo==='lista'?4:4}" data-fw-cfg="${esc(c.k)}">${esc(v)}</textarea>${c.dica?`<span class="src">${esc(c.dica)}</span>`:''}`;
  return lab+`<input id="${id}" data-fw-cfg="${esc(c.k)}" type="${c.tipo==='numero'?'number':'text'}"${c.tipo==='numero'?' min="0"':''} value="${esc(v)}">${c.dica?`<span class="src">${esc(c.dica)}</span>`:''}`}
function fxGaveta(f){
  const g=f.def.gatilhos.find(x=>x.id===FX.sel),a=g?null:fxAchar(f.def,FX.sel);if(!g&&!a){FX.sel=null;return ''}
  const n=g||a.p,it=(g?FXG:FXA).get(n.tipo);if(!it)return '';const pd=fxPend(it,n.cfg);
  return `<aside class="fx-gaveta" aria-label="Editar ${esc(it.nome)}"><div class="ph"><h3>${g?'Acionador':'Ação'} · ${esc(it.nome)}</h3><button type="button" class="xbtn" data-fw="fechar" aria-label="Fechar">×</button></div>
   <div class="body"><p class="src" style="margin:0">${esc(it.descricao)}</p>${it.aviso?`<p class="fx-p2">${esc(it.aviso)}</p>`:''}
    ${(it.campos||[]).map(c=>fxCampoHtml(c,n.cfg)).join('')||'<p class="src">Nada para configurar.</p>'}
    ${it.ramos?`<p class="src" style="margin:0">Caminhos: ${esc((n.ramos||[]).map(r=>r.nome).join(' · ')||'—')}</p>`:''}
    ${pd.length?`<p class="fx-aviso">${esc(pd.join(' · '))}</p>`:''}
    <div class="hb"><button type="button" class="btn us-delok" data-fw="del" data-id="${esc(n.id)}">Excluir ${g?'acionador':'passo'}</button><span style="flex:1"></span><button type="button" class="btn pri" data-fw="fechar">Pronto</button></div></div></aside>`}

function fxConfig(f){const c=f.cfg||{};
  const ck=(k,l,d)=>`<label class="chk"><input type="checkbox" data-fw-conf="${k}"${c[k]?' checked':''}> ${l}</label>${d?`<span class="src" style="margin:-4px 0 0 24px">${d}</span>`:''}`;
  return `<div class="fxe-pg"><div class="tbl"><h3>Configurações do fluxo</h3><div class="fxe-form">
   <label>Nome<input data-fw-campo="nome" value="${esc(f.nome)}" maxlength="80"></label>
   <label>Descrição<textarea data-fw-campo="desc" rows="2" maxlength="500" placeholder="Para que serve este fluxo">${esc(f.desc||'')}</textarea></label>
   <label>Pasta<select data-fw-campo="pasta">${optH([['','Página inicial'],...FX_PASTAS.map(p=>[p.id,p.nome])],f.pasta||'')}</select></label>
   ${ck('reinscricao','Permitir que o mesmo contato entre de novo','Sem isso, quem já passou pelo fluxo não entra outra vez.')}
   ${ck('parar_resposta','Tirar o contato do fluxo quando ele responder','Útil em follow-ups: se o cliente respondeu, a equipe assume.')}
   ${ck('so_horario','Enviar mensagens só dentro do horário do setor','Fora do horário, a mensagem espera a abertura do setor.')}
   ${c.so_horario?`<label>Horário de qual setor<select data-fw-conf="fila_horario">${optH(filaOpts(),c.fila_horario||'triagem')}</select></label>`:''}
   <p class="src" style="margin:0">Fuso horário: Brasília. Mudanças valem para a próxima publicação.</p></div></div></div>`}
const fxTopoDados=t=>`<h3 style="display:flex;gap:8px;align-items:center">${t}<span style="flex:1"></span><button type="button" class="btn" data-fw="dados-atualizar">Atualizar</button></h3>`;
function fxInsc(f){const D=fxDados(f,'insc'),L=D.linhas;
  const corpo=D.erro?`<p class="fx-aviso" style="margin:0 14px 14px">${esc(D.erro)}</p>`:!L?'<p class="src" style="padding:0 14px 14px;margin:0">Carregando…</p>'
   :`<table><thead><tr><th>Contato</th><th>Entrou em</th><th>Situação</th><th>Passo atual</th><th>Segue em</th><th></th></tr></thead><tbody>${L.map(x=>`<tr><td>${esc(x.nome)}</td><td class="src">${fxData(x.em)}</td>
     <td>${esc(x.estado)}${x.erro?`<br><span class="src">${esc(x.erro)}</span>`:''}</td><td>${esc(x.passo)}</td><td class="src">${x.prox?fxData(x.prox):'—'}</td>
     <td>${x.ativo&&x.id?`<button type="button" class="btn" data-fw="tirar" data-id="${esc(x.id)}">Tirar do fluxo</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="src">Ninguém entrou neste fluxo ainda.'+(f.status==='publicado'?'':' Publique o fluxo para que contatos entrem nele.')+'</td></tr>'}</tbody></table>`;
  return `<div class="fxe-pg fxe-larga"><div class="tbl">${fxTopoDados('Histórico de inscrições')}${corpo}</div></div>`}
function fxReg(f){const D=fxDados(f,'reg'),L=D.linhas;
  const corpo=D.erro?`<p class="fx-aviso" style="margin:0 14px 14px">${esc(D.erro)}</p>`:!L?'<p class="src" style="padding:0 14px 14px;margin:0">Carregando…</p>'
   :`<table><thead><tr><th>Quando</th><th>Contato</th><th>Passo</th><th>Resultado</th><th>Detalhe</th></tr></thead><tbody>${L.map(x=>`<tr><td class="src">${fxData(x.h)}</td><td>${esc(x.c)}</td><td>${esc(x.p)}</td><td>${esc(x.r)}</td><td class="src">${esc(x.det)}</td></tr>`).join('')||'<tr><td colspan="5" class="src">Nenhuma execução registrada.</td></tr>'}</tbody></table>`;
  return `<div class="fxe-pg fxe-larga"><div class="tbl">${fxTopoDados('Registros de execução')}${corpo}</div></div>`}

/* ---- testar (simulação, nada é enviado) ---- */
function fxTeste(f){const t=FX.teste;
  if(!t||t.f!==f.id)return `<div class="fxe-pg"><div class="tbl"><h3>Testar fluxo de trabalho</h3><div class="fxe-form">
    <p class="src" style="margin:0">Percorre o fluxo com um contato de teste. Nada é enviado nem gravado; as esperas passam na hora e você escolhe os caminhos (se/senão, horário, respondeu ou não).</p>
    <label>Nome do contato de teste<input id="fxtnome" value="Contato de teste" maxlength="60"></label>
    ${f.def.gatilhos.length>1?`<label>Acionador<select id="fxtgat">${optH(f.def.gatilhos.map(g=>[g.id,(FXG.get(g.tipo)||{}).nome]),f.def.gatilhos[0].id)}</select></label>`:''}
    <div><button type="button" class="btn pri" data-fw="t-ini"${f.def.passos.length?'':' disabled'}>Iniciar teste</button></div></div></div></div>`;
  const p=t.espera&&t.espera.p;let ctl='';
  if(t.espera)ctl=`<span class="src">${t.espera.tit}</span><div class="opts">${p.ramos.map((r,k)=>`<button type="button" class="btn" data-fw="t-ramo" data-k="${k}">${esc(r.nome)}</button>`).join('')}</div>`;
  else ctl=`<div class="opts"><button type="button" class="btn" data-fw="t-ini">Recomeçar</button><button type="button" class="btn" data-fw="t-fim">Fechar teste</button></div>`;
  return `<div class="fxe-pg"><div class="sim fx-sim"><div class="sh">Teste · ${esc(f.nome)} · ${esc(t.nome)}</div><div class="log" id="simlog">${t.log.map(m=>`<div class="bub ${m.k==='me'?'me':m.k==='sy'?'sy':''}">${esc(m.x)}</div>`).join('')}</div>${ctl}</div></div>`}
function fxTesteRodar(t){
  const lead={name:t.nome,org:''};let g=0;
  while(!t.fim&&!t.espera&&g++<200){
    const p=t.L[t.i];if(!p){t.fim=true;t.log.push({k:'sy',x:'Fim do fluxo'});break}
    const it=FXA.get(p.tipo),c=p.cfg,res=fxResumo(it,c);
    switch(p.tipo){
     case 'mensagem':t.log.push({k:'bot',x:fillVars(c.texto,lead)});t.i++;break;
     case 'resposta_rapida':t.log.push({k:'bot',x:fillText(QUICK[c.atalho]||'(resposta rápida não encontrada)',{name:t.nome})});t.i++;break;
     case 'aguardar':t.log.push({k:'sy',x:`Esperaria ${res} (no teste, segue na hora)`});t.i++;break;
     case 'se':case 'horario':case 'aguardar_resposta':t.log.push({k:'sy',x:`${it.nome} ${res}`});t.espera={tipo:'ramo',p,tit:'No teste, escolha o caminho:'};break;
     case 'ir_para':t.log.push({k:'sy',x:'Iria para o fluxo “'+((FLUXOS.find(x=>x.id===c.fluxo)||{}).nome||'—')+'”'});t.fim=true;break;
     case 'fim':t.log.push({k:'sy',x:'Fluxo encerrado'});t.fim=true;break;
     default:t.log.push({k:'sy',x:`${it?it.nome:p.tipo}: ${res||'—'} (no teste, não é feito)`});t.i++}
  }}

/* ---- IA: painel do construtor e janela da lista ---- */
const FX_EXEMPLOS=[['Nutrição de leads','Quando um negócio entrar em Novo lead no funil PJ, mandar boas-vindas, esperar 1 dia e, se não responder, criar uma tarefa de ligação para o comercial.'],
 ['Follow-up de proposta','Depois que o negócio for para Proposta enviada, esperar 2 dias, mandar um follow-up, esperar mais 3 dias e, se o cliente não responder, criar tarefa de ligação e mover para Negociação.'],
 ['Boas-vindas no WhatsApp','Na primeira mensagem pelo WhatsApp, dar boas-vindas. Dentro do horário da triagem, criar uma tarefa para a Ana Júlia responder em 1 hora. Fora do horário, avisar que retornamos no próximo dia útil.'],
 ['Lead parado','Se um negócio ficar 5 dias parado em Qualificado, avisar o responsável e criar uma atividade de follow-up para o dia seguinte.']];
function fxDescrever(f){
  const d=f.def,nome=t=>(FXG.get(t)||FXA.get(t)||{}).nome||t;
  if(!d.gatilhos.length&&!d.passos.length)return 'O fluxo está vazio.';
  const lin=['Começa quando: '+(d.gatilhos.map(g=>nome(g.tipo)+(fxResumo(FXG.get(g.tipo),g.cfg)?' ('+fxResumo(FXG.get(g.tipo),g.cfg)+')':'')).join(' ou ')||'— (falta o acionador)')+'.'];
  const w=(L,pre)=>L.forEach((p,i)=>{const it=FXA.get(p.tipo);lin.push(pre+(i+1)+'. '+it.nome+(fxResumo(it,p.cfg)?': '+fxResumo(it,p.cfg):''));(p.ramos||[]).forEach(r=>{lin.push(pre+'   Caminho “'+r.nome+'”:'+(r.passos.length?'':' termina.'));w(r.passos,pre+'      ')})});
  w(d.passos,'');return lin.join('\n')}
function fxIAPainel(f){
  const r=FX.iaRes;
  const corpo=FX.iaModo==='descrever'?`<pre class="fx-desc">${esc(fxDescrever(f))}</pre>`
   :`<p class="fx-iah">O que você quer mudar?</p><textarea id="fxiatxt" rows="4" placeholder="Descreva as alterações no seu fluxo de trabalho…">${esc(FX.iaTxt)}</textarea>
     <div class="hb"><span style="flex:1"></span><button type="button" class="btn pri" data-fw="ia-enviar"${FX.iaBusy?' disabled':''}>${FX.iaBusy?'Montando…':'Enviar'}</button></div>
     ${r?`<div class="fx-iares"><b>${esc(r.nome||'Proposta da IA')}</b><p>${esc(r.resumo||'')}</p>${(r.avisos||[]).length?`<ul class="ul">${r.avisos.map(a=>`<li>${esc(a)}</li>`).join('')}</ul>`:''}
       <div class="hb"><button type="button" class="btn pri" data-fw="ia-aplicar">Aplicar ao fluxo</button><button type="button" class="btn" data-fw="ia-descartar">Descartar</button></div></div>`:''}
     ${FX.desfazer?'<div><button type="button" class="btn" data-fw="ia-desfazer">Desfazer a mudança da IA</button></div>':''}
     <p class="src">A IA só recebe o desenho do fluxo e as opções do escritório (filas, tags, funis, nomes da equipe). Nenhum dado de cliente. Confira antes de publicar.</p>`;
  return `<aside class="fx-ia"><div class="ph"><div class="seg">${[['construir','Construir'],['descrever','Descrever']].map(([k,l])=>`<button type="button" class="${FX.iaModo===k?'on':''}" data-fw="ia-modo" data-v="${k}">${l}</button>`).join('')}</div><button type="button" class="xbtn" data-fw="ia" aria-label="Fechar">×</button></div><div class="body">${corpo}</div></aside>`}

function fxModais(){
  let h='';
  if(FX.picker){const ehG=FX.picker.tipo==='gatilho',L=ehG?FLX_CAT.gatilhos:FLX_CAT.acoes,b=nz(FX.pickBusca).trim();
    const vis=L.filter(x=>!b||nz(x.nome+' '+x.descricao).includes(b)),grupos=[...new Set(vis.map(x=>x.grupo))];
    h+=`<div class="modal" role="dialog" aria-modal="true" aria-label="${ehG?'Adicionar acionador':'Adicionar ação'}"><div class="box fx-pick"><div class="ph" style="padding:0;border:0"><h3 style="margin:0">${ehG?'Adicionar novo acionador':'Adicionar ação'}</h3><button type="button" class="xbtn" data-fw="pick-fechar" aria-label="Fechar">×</button></div>
      <input type="search" id="fxpickbusca" placeholder="Pesquisar ${ehG?'acionadores':'ações'}" value="${esc(FX.pickBusca)}" aria-label="Pesquisar">
      <div class="fx-pick-l">${grupos.map(g=>`<h4>${esc(g)}</h4><div class="fx-pick-g">${vis.filter(x=>x.grupo===g).map(x=>`<button type="button" class="fx-pick-i" data-fw="pick" data-v="${esc(x.tipo)}"><span class="fx-ic">${fxIc(x.grupo)}</span><span><b>${esc(x.nome)}</b><small>${esc(x.descricao)}</small>${x.aviso?`<em class="fx-p2">${esc(x.aviso)}</em>`:''}</span></button>`).join('')}</div>`).join('')||'<p class="src">Nada encontrado.</p>'}</div></div></div>`}
  if(FX.novaPasta)h+=`<div class="modal" role="dialog" aria-modal="true" aria-label="Criar pasta"><div class="box"><h3>Criar pasta</h3><label>Nome da pasta<input id="fxpastanome" maxlength="60"></label>
      <div class="hb"><span style="flex:1"></span><button type="button" class="btn" data-fw="pasta-cancelar">Cancelar</button><button type="button" class="btn pri" data-fw="pasta-criar">Criar</button></div></div></div>`;
  if(FX.iaLista)h+=`<div class="modal" role="dialog" aria-modal="true" aria-label="Construir fluxo com IA"><div class="box fx-ialista"><button type="button" class="xbtn fx-x" data-fw="ia-lista-fechar" aria-label="Fechar">×</button>
      <h3>${SPARK} O que você deseja automatizar?</h3><p class="src" style="margin:0">Descreva o fluxo; a IA monta um rascunho no construtor para você conferir.</p>
      <textarea id="fxialtxt" rows="5" placeholder="Ex.: Depois de enviar uma proposta, esperar 2 dias e mandar um follow-up…">${esc(FX.iaTxt)}</textarea>
      <div class="fx-chips">${FX_EXEMPLOS.map(([l],i)=>`<button type="button" class="btn" data-fw="ia-ex" data-i="${i}">${esc(l)}</button>`).join('')}</div>
      <div class="hb"><span style="flex:1"></span><button type="button" class="btn pri" data-fw="ia-lista-enviar"${FX.iaBusy?' disabled':''}>${FX.iaBusy?'Montando…':'Construir'}</button></div></div></div>`;
  if(FX.agendadas){const L=SCHED.slice().sort((a,b)=>a.when<b.when?-1:1);
    h+=`<div class="modal" role="dialog" aria-modal="true" aria-label="Mensagens agendadas"><div class="box"><h3>Mensagens agendadas</h3><table><thead><tr><th>Quando</th><th>Cliente</th><th>Mensagem</th><th></th></tr></thead><tbody>${L.map(s=>`<tr><td>${esc(s.when.replace('T',' '))}</td><td>${esc((convos.find(c=>c.id===s.c)||{}).name||'—')}</td><td class="src">${esc(s.x)}</td><td><button type="button" class="xbtn" data-fw="ag-del" data-id="${s.id}" aria-label="Cancelar">×</button></td></tr>`).join('')||'<tr><td colspan="4" class="src">Nenhuma mensagem agendada.</td></tr>'}</tbody></table>
      <p class="src">Para agendar, abra a conversa do cliente e use o relógio ⏰ ao lado de enviar.</p><div class="hb"><span style="flex:1"></span><button type="button" class="btn" data-fw="ag-fechar">Fechar</button></div></div></div>`}
  return h}

/* ---- ações ---- */
function fxNovo(nome,def){const f={id:uid('w'),novo:SB.ligado(),nome:nome||'Novo fluxo de trabalho',desc:'',pasta:FX.pasta,status:'rascunho',inscritos:SB.ligado()?null:0,ativos:SB.ligado()?null:0,
  atualizado:new Date().toISOString(),criado:new Date().toISOString(),cfg:{},def:def||{gatilhos:[],passos:[]}};FLUXOS.push(f);
  Object.assign(FX,{tela:'editor',id:f.id,aba:'construtor',sel:null,teste:null,desfazer:null,iaRes:null});return f}
async function fxIAEnviar(txt,naLista){
  if(txt.trim().length<5){toast('Descreva o que o fluxo deve fazer.');return}
  FX.iaBusy=true;FX.iaTxt=txt;renderFluxos();
  try{const f=naLista?null:fxAtual(),r=await DB.fluxos.ia(txt,f?f.def:null);
    if(naLista){const n=fxNovo(r.nome,r.definicao);FX.iaLista=false;FX.ia=true;FX.iaModo='construir';FX.iaRes={...r,aplicado:true};FX.iaTxt='';fxMudou(false);toast('Rascunho montado pela IA. Confira cada passo antes de publicar.');n.desc=r.resumo||''}
    else FX.iaRes=r}
  catch(e){toast(e.message)}finally{FX.iaBusy=false;renderFluxos()}}
document.addEventListener('click',e=>{
  if(FX.menu&&!e.target.closest('.fxw-acoes')){FX.menu=null;if(S.view==='fluxos')renderFluxos()}
  const b=e.target.closest&&e.target.closest('[data-fw]');if(!b||b.disabled)return;const a=b.dataset.fw,f=fxAtual();
  switch(a){
   case 'aba-lista':FX.lista=b.dataset.v;FX.pasta=null;renderFluxos();break;
   case 'pasta':FX.pasta=b.dataset.id||null;FX.busca='';renderFluxos();break;
   case 'novo':FX.busca='';fxNovo();fxMudou(true);break;
   case 'abrir':Object.assign(FX,{tela:'editor',id:b.dataset.id,aba:'construtor',sel:null,teste:null,menu:null,desfazer:null,iaRes:null,salvo:'ok'});renderFluxos();break;
   case 'menu':FX.menu=FX.menu===b.dataset.id?null:b.dataset.id;renderFluxos();break;
   case 'duplicar':{const x=FLUXOS.find(y=>y.id===b.dataset.id);FX.menu=null;fxAcao(DB.fluxos.duplicar(x),'Fluxo duplicado como rascunho.');break}
   case 'apagar':{const x=FLUXOS.find(y=>y.id===b.dataset.id);FX.menu=null;fxAcao(DB.fluxos.excluir(x,true),'Fluxo apagado. Ele fica em “Apagado(a)” e pode ser restaurado.');break}
   case 'restaurar':{const x=FLUXOS.find(y=>y.id===b.dataset.id);fxAcao(DB.fluxos.excluir(x,false),'Fluxo restaurado como rascunho.');break}
   case 'pasta-nova':FX.novaPasta=true;renderFluxos();setTimeout(()=>{const i=$('#fxpastanome');if(i)i.focus()});break;
   case 'pasta-cancelar':FX.novaPasta=false;renderFluxos();break;
   case 'pasta-criar':{const n=($('#fxpastanome')||{}).value||'';if(!n.trim()){toast('Dê um nome à pasta.');break}FX.novaPasta=false;fxAcao(DB.fluxos.criarPasta(n.trim()),'Pasta criada.');break}
   case 'agendadas':FX.agendadas=true;renderFluxos();break;case 'ag-fechar':FX.agendadas=false;renderFluxos();break;
   case 'ag-del':DB.cancelarAgendada(b.dataset.id);renderFluxos();break;
   case 'ia-lista':FX.iaLista=true;FX.iaTxt='';renderFluxos();setTimeout(()=>{const i=$('#fxialtxt');if(i)i.focus()});break;
   case 'ia-lista-fechar':FX.iaLista=false;renderFluxos();break;
   case 'ia-ex':{const t=$('#fxialtxt');if(t){t.value=FX_EXEMPLOS[+b.dataset.i][1];t.focus()}break}
   case 'ia-lista-enviar':fxIAEnviar(($('#fxialtxt')||{}).value||'',true);break;
   case 'voltar':FX.tela='lista';FX.sel=null;FX.teste=null;renderFluxos();break;
   case 'aba':FX.aba=b.dataset.v;FX.sel=null;FX_DADOS=null;renderFluxos();break;
   case 'dados-atualizar':FX_DADOS=null;renderFluxos();break;
   case 'tirar':fxAcao(DB.fluxos.remover(b.dataset.id).then(()=>{FX_DADOS=null}),'Contato tirado do fluxo.');break;
   case 'cond-add':{const n=fxNoSel(f);if(n){n.cfg.condicoes=Array.isArray(n.cfg.condicoes)?n.cfg.condicoes:[];n.cfg.condicoes.push({sujeito:'etapa',operador:'e',valor:''});fxMudou(true)}break}
   case 'cond-del':{const n=fxNoSel(f);if(n&&Array.isArray(n.cfg.condicoes)){n.cfg.condicoes.splice(+b.dataset.i,1);fxMudou(true)}break}
   case 'zoom':FX.zoom=+b.dataset.v===0?1:Math.min(1.5,Math.max(.5,Math.round((FX.zoom+(+b.dataset.v)*.1)*10)/10));renderFluxos();break;
   case 'sel':FX.sel=b.dataset.id;renderFluxos();break;
   case 'fechar':FX.sel=null;renderFluxos();break;
   case 'add-gat':FX.picker={tipo:'gatilho'};FX.pickBusca='';renderFluxos();setTimeout(()=>{const i=$('#fxpickbusca');if(i)i.focus()});break;
   case 'add':FX.picker={tipo:'acao',lista:b.dataset.lista,pos:+b.dataset.pos};FX.pickBusca='';renderFluxos();setTimeout(()=>{const i=$('#fxpickbusca');if(i)i.focus()});break;
   case 'pick-fechar':FX.picker=null;renderFluxos();break;
   case 'pick':{const t=b.dataset.v,P=FX.picker;FX.picker=null;
     if(P.tipo==='gatilho'){const g=fxG(t);f.def.gatilhos.push(g);FX.sel=g.id}
     else{const L=fxLista(f.def,P.lista);if(!L)break;const p=fxP(t);
       if((p.ramos||FXA.get(t).fim)&&P.pos<L.length){const resto=L.splice(P.pos);if(p.ramos)p.ramos[0].passos.push(...resto);else toast('Os passos que vinham depois foram removidos: “'+FXA.get(t).nome+'” encerra o fluxo.')}
       L.splice(P.pos,0,p);FX.sel=p.id}
     fxMudou(true);break}
   case 'del':{const id=b.dataset.id,gi=f.def.gatilhos.findIndex(x=>x.id===id);
     if(gi>=0)f.def.gatilhos.splice(gi,1);else{const x=fxAchar(f.def,id);if(x){if(x.p.ramos&&x.p.ramos.some(r=>r.passos.length)&&!confirm('Excluir este passo apaga também os passos dentro dos caminhos dele. Continuar?'))break;x.L.splice(x.i,1)}}
     FX.sel=null;fxMudou(true);break}
   case 'ia':FX.ia=!FX.ia;renderFluxos();break;
   case 'ia-modo':FX.iaModo=b.dataset.v;renderFluxos();break;
   case 'ia-enviar':fxIAEnviar(($('#fxiatxt')||{}).value||'',false);break;
   case 'ia-aplicar':if(FX.iaRes&&f){FX.desfazer=JSON.parse(JSON.stringify(f.def));f.def=FX.iaRes.definicao;if(f.nome==='Novo fluxo de trabalho'&&FX.iaRes.nome)f.nome=FX.iaRes.nome;FX.iaRes=null;FX.iaTxt='';FX.sel=null;fxMudou(true);toast('Mudanças da IA aplicadas. Confira antes de publicar.')}break;
   case 'ia-descartar':FX.iaRes=null;renderFluxos();break;
   case 'ia-desfazer':if(FX.desfazer&&f){f.def=FX.desfazer;FX.desfazer=null;fxMudou(true)}break;
   case 't-ini':{const g=$('#fxtgat');FX.teste={f:f.id,nome:(($('#fxtnome')||{}).value||(FX.teste&&FX.teste.nome)||'Contato de teste').trim(),L:f.def.passos,i:0,log:[],vars:{},espera:null,fim:false};
     const gt=f.def.gatilhos.find(x=>x.id===(g&&g.value))||f.def.gatilhos[0];
     FX.teste.log.push({k:'sy',x:'Acionador: '+(gt?FXG.get(gt.tipo).nome+(fxResumo(FXG.get(gt.tipo),gt.cfg)?' ('+fxResumo(FXG.get(gt.tipo),gt.cfg)+')':''):'nenhum')});
     fxTesteRodar(FX.teste);renderFluxos();break}
   case 't-fim':FX.teste=null;renderFluxos();break;
   case 't-ramo':{const t=FX.teste,p=t.espera.p,k=+b.dataset.k;t.log.push({k:'sy',x:'Caminho: '+p.ramos[k].nome});
     t.L=p.ramos[k].passos;t.i=0;t.espera=null;fxTesteRodar(t);renderFluxos();const lg=$('#simlog');if(lg)lg.scrollTop=lg.scrollHeight;break}
  }
});
document.addEventListener('input',e=>{const el=e.target;
  if(el.id==='fxbusca'){FX.busca=el.value;renderFluxos();const i=$('#fxbusca');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}return}
  if(el.id==='fxpickbusca'){FX.pickBusca=el.value;renderFluxos();const i=$('#fxpickbusca');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}return}
  if(el.id==='fxiatxt')FX.iaTxt=el.value;
  const f=fxAtual();if(!f)return;
  if(el.dataset&&el.dataset.fwCond!==undefined&&el.tagName==='INPUT'){const n=fxNoSel(f),q=n&&n.cfg.condicoes&&n.cfg.condicoes[+el.dataset.fwCond];if(q){q.valor=el.value;fxMudou(false)}return}
  if(el.dataset&&el.dataset.fwCfg&&el.tagName!=='SELECT'){const n=f.def.gatilhos.find(x=>x.id===FX.sel)||(fxAchar(f.def,FX.sel)||{}).p;if(n){n.cfg[el.dataset.fwCfg]=el.type==='number'?(el.value===''?'':+el.value):el.value;fxMudou(false)}}
  if(el.id==='fxnome'||(el.dataset&&el.dataset.fwCampo&&el.tagName!=='SELECT')){const k=el.id==='fxnome'?'nome':el.dataset.fwCampo;f[k]=el.value;fxMudou(false)}});
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset&&el.dataset.fwMover){const x=FLUXOS.find(y=>y.id===el.dataset.fwMover);FX.menu=null;fxAcao(DB.fluxos.mover(x,el.value),'Fluxo movido.');return}
  const f=fxAtual();if(!f)return;
  if(el.id==='fxpub'){const on=el.checked;fxAcao(DB.fluxos.publicar(f,on),on?'Fluxo publicado. A partir de agora, novos contatos entram nele.':'Fluxo voltou para rascunho: ninguém novo entra nele.');return}
  if(el.dataset&&el.dataset.fwCond!==undefined){const n=fxNoSel(f),q=n&&n.cfg.condicoes&&n.cfg.condicoes[+el.dataset.fwCond];if(!q)return;
    q[el.dataset.k]=el.value;if(el.dataset.k==='sujeito')q.valor='';fxMudou(true);return}
  if(el.dataset&&el.dataset.fwCfg){const n=f.def.gatilhos.find(x=>x.id===FX.sel)||(fxAchar(f.def,FX.sel)||{}).p;if(!n)return;
    n.cfg[el.dataset.fwCfg]=el.type==='number'?(el.value===''?'':+el.value):el.value;
    if(el.dataset.fwCfg==='funil'&&'etapa' in n.cfg)n.cfg.etapa='';
    if(el.dataset.fwCfg==='sujeito')n.cfg.valor='';
    fxMudou(true);return}
  if(el.dataset&&el.dataset.fwConf){f.cfg=f.cfg||{};f.cfg[el.dataset.fwConf]=el.type==='checkbox'?el.checked:el.value;fxMudou(el.dataset.fwConf==='so_horario');return}
  if(el.dataset&&el.dataset.fwCampo){f[el.dataset.fwCampo==='pasta'?'pasta':el.dataset.fwCampo]=el.value||(el.dataset.fwCampo==='pasta'?null:'');fxMudou(false)}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||S.view!=='fluxos')return;
  if(FX.picker||FX.novaPasta||FX.iaLista||FX.agendadas){FX.picker=null;FX.novaPasta=false;FX.iaLista=false;FX.agendadas=false;renderFluxos()}else if(FX.sel){FX.sel=null;renderFluxos()}});

/* ---- demonstração: fluxos de CRM rodam na hora (mudar etapa, criar negócio); conectado, quem executa é o servidor (3b) ---- */
function fire(trig,val,lead){
  if(SB.ligado()||!lead)return 0;let n=0;
  const casa=g=>(g.tipo==='etapa_mudou'&&g.cfg.funil===lead.pipe&&g.cfg.etapa===val)||(g.tipo==='negocio_ganho'&&val==='Ganho'&&g.cfg.funil===lead.pipe)
    ||(g.tipo==='negocio_criado'&&val==='Novo lead'&&g.cfg.funil===lead.pipe&&(!g.cfg.origem||g.cfg.origem===lead.origem));
  FLUXOS.filter(f=>f.status==='publicado'&&!f.excluido&&f.def.gatilhos.some(casa)).forEach(f=>{n++;f.inscritos=(f.inscritos||0)+1;
    let L=f.def.passos,ult='—',st='Concluído';const em=new Date().toISOString(),reg=x=>FX_REG.unshift({f:f.id,h:em,c:lead.name,p:x,r:'Executado'});
    for(const p of L){const it=FXA.get(p.tipo),c=p.cfg;ult=it.nome;
      if(p.tipo==='criar_atividade'){const d=new Date(TODAY+'T12:00:00');d.setDate(d.getDate()+(+c.em_dias||0));lead.tasks.push({id:uid('t'),tipo:(FLX_CAT.estaticas.tipos_atividade.find(x=>x[0]===c.tipo_atividade)||[,'Tarefa'])[1],tit:c.titulo,quando:d.toISOString().slice(0,10)+' 09:00',done:false,dono:lead.dono,auto:true})}
      else if(p.tipo==='avisar_equipe'){const pz=TEAM.find(x=>(x.id||x.k)===c.pessoa);if(pz)AVISOS.unshift({id:uid('av'),k:pz.k,tipo:'fluxo',texto:fillVars(c.texto,lead)+' · '+lead.name+' (fluxo “'+f.nome+'”)',em:new Date().toISOString(),lido:false})}
      else if(p.tipo==='atribuir'&&c.pessoa)lead.dono=(TEAM.find(x=>(x.id||x.k)===c.pessoa)||{}).k||lead.dono;
      else if(p.tipo==='criar_tarefa'){const r=TEAM.find(x=>(x.id||x.k)===c.responsavel);if(r&&podeTarefas(r.k))TAREFAS.push({id:uid('k'),tit:c.titulo,desc:'Criada pelo fluxo “'+f.nome+'”',quando:TODAY+' 18:00',dono:r.k,por:'Automação',contato:lead.name,tel:lead.phone,conv:lead.conv,done:false})}
      else if(p.tipo==='mensagem'){const cv=lead.conv&&convos.find(x=>x.id===lead.conv);if(cv){const am={f:'a',au:'Automação',x:fillVars(c.texto,lead),t:nowT()};cv.msgs.push(am);enfileirarSaida(cv,am,'automacao');cv.answered=true}}
      else if(p.tipo==='aguardar'||p.ramos||it.fim){st=it.fim?'Concluído':'Ativo';if(!it.fim)f.ativos=(f.ativos||0)+1;break}
      reg(it.nome)}
    FX_INSC.unshift({f:f.id,c:lead.name,em,st,passo:ult})});
  return n}
