/* ===== CRM no banco (crm_0004 + crm_0016) =====
   Conectado: funis, etapas, origens, motivos de perda, campos, negócios, atividades e respostas de formulário vêm do banco.
   Cada alteração grava no banco e recarrega: a tela mostra sempre o que ficou salvo. Quem pode o quê é o RLS da área comercial.
   As listas da tela (PIPES, LEADS, ORIGENS…) continuam as mesmas da demonstração, só que preenchidas pelo banco. */
const CRM={carregado:false,carregando:false,erro:'',tempo:{}};
const TIPO_ATV={ligacao:'Ligação',reuniao:'Reunião',followup:'Follow-up',tarefa:'Tarefa'};
const ATV_TIPO=Object.fromEntries(Object.entries(TIPO_ATV).map(([k,v])=>[v,k]));
const CAMPO_TELA={texto:'texto',numero:'número',data:'data',lista:'lista'};
const CAMPO_BANCO=Object.fromEntries(Object.entries(CAMPO_TELA).map(([k,v])=>[v,k]));
const CRMX={funil:new Map(),etapa:new Map(),etapaNome:new Map(),origem:new Map(),perda:new Map()};  // nome/slug <-> id
const dataLocal=iso=>{if(!iso)return '';const d=new Date(iso),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`};
const nomes=m=>new Map([...m].map(([k,v])=>[v,k]));
const preencher=(lista,novos)=>lista.splice(0,lista.length,...novos);

DB.crm={
  async carregar(){
    if(!SB.ligado())return;CRM.carregando=true;
    try{
      const desde=new Date(Date.now()-90*864e5).toISOString();
      const [fu,et,orr,mp,cp,ng,at,fr]=await Promise.all([
        SB.sel('funis','select=id,slug,nome&ativo=eq.true&order=ordem'),
        SB.sel('funil_etapas','select=id,funil_id,nome,ordem,probabilidade,tipo&order=funil_id,ordem'),
        SB.sel('origens','select=id,nome&ativa=eq.true&order=nome'),
        SB.sel('motivos_perda','select=id,nome&ativo=eq.true&order=nome'),
        SB.sel('campos_personalizados','select=chave,nome,tipo,opcoes&order=ordem'),
        SB.todos('negocios','select=id,funil_id,etapa_id,nome,empresa,telefone,valor,probabilidade,responsavel_id,origem_id,previsao_fechamento,motivo_perda_id,etapa_max_ordem,conversa_ref,cliente_ref,externo_id,campos&order=created_at,id'),
        // atividades abertas e as concluídas nos últimos 90 dias
        SB.todos('atividades','select=id,negocio_id,tipo,titulo,quando,concluida,responsavel_id,origem&or='+encodeURIComponent('(concluida.eq.false,concluida_em.gte."'+desde+'")')+'&order=quando,id'),
        SB.todos('respostas_formulario','select=negocio_id,pergunta,resposta&order=created_at,id')]);
      Object.values(CRMX).forEach(m=>m.clear());
      fu.forEach(f=>CRMX.funil.set(f.slug,f.id));
      et.forEach(e=>{const f=fu.find(x=>x.id===e.funil_id);if(f){CRMX.etapa.set(f.slug+'|'+e.nome,e.id);CRMX.etapaNome.set(e.id,e.nome)}});
      orr.forEach(o=>CRMX.origem.set(o.nome,o.id));mp.forEach(m=>CRMX.perda.set(m.nome,m.id));
      preencher(PIPES,fu.map(f=>({id:f.slug,nome:f.nome,etapas:et.filter(e=>e.funil_id===f.id).map(e=>e.nome)})));
      if(!PIPES.some(p=>p.id===M.pipe)&&PIPES[0])M.pipe=PIPES[0].id;
      Object.keys(PROB).forEach(k=>delete PROB[k]);et.forEach(e=>PROB[e.nome]=e.probabilidade);
      preencher(STAGES,[...new Set(et.map(e=>e.nome))]);
      preencher(ORIGENS,orr.map(o=>o.nome));preencher(PERDAS,mp.map(m=>m.nome));
      preencher(CAMPOS,cp.map(c=>({id:c.chave,nome:c.nome,tipo:CAMPO_TELA[c.tipo]||c.tipo,...(c.opcoes?{opts:c.opcoes}:{})})));
      const origemNome=nomes(CRMX.origem),perdaNome=nomes(CRMX.perda),slug=nomes(CRMX.funil);
      preencher(LEADS,ng.filter(n=>slug.has(n.funil_id)).map(n=>({   // só o funil ativo (um funil só desde a crm_0024)
id:n.id,name:n.nome,org:n.empresa||'',phone:n.telefone||'',valor:+n.valor||0,
        etapa:CRMX.etapaNome.get(n.etapa_id)||'',prob:n.probabilidade==null?0:n.probabilidade,dono:nomeDoId(n.responsavel_id),
        origem:origemNome.get(n.origem_id)||'',prev:n.previsao_fechamento||'',conv:n.conversa_ref||null,
        form:fr.filter(x=>x.negocio_id===n.id).map(x=>({p:x.pergunta,r:x.resposta||''})),
        tasks:at.filter(a=>a.negocio_id===n.id).map(a=>({id:a.id,tipo:TIPO_ATV[a.tipo]||a.tipo,tit:a.titulo,quando:dataLocal(a.quando),done:a.concluida,dono:nomeDoId(a.responsavel_id),auto:a.origem!=='manual'})),
        custom:n.campos||{},perda:perdaNome.get(n.motivo_perda_id)||'',pipe:slug.get(n.funil_id)||'',
        max:Math.max(0,(n.etapa_max_ordem||1)-1),closed:!!n.cliente_ref,ext:n.externo_id||null})));
      CRM.tempo={};CRM.carregado=true;CRM.erro='';
    }catch(e){CRM.erro=e.message}finally{CRM.carregando=false}},
  /* um campo do painel do negócio */
  async atualizar(l,f){
    const v=l[f],corpo=f==='custom'?{campos:l.custom}:{
      name:{nome:String(v).trim()},org:{empresa:String(v).trim()||null},phone:{telefone:String(v).trim()||null},valor:{valor:Math.max(0,+v||0)},
      prob:{probabilidade:Math.min(100,Math.max(0,Math.round(+v||0)))},prev:{previsao_fechamento:v||null},
      dono:{responsavel_id:idDe(v)},origem:{origem_id:CRMX.origem.get(v)||null}}[f];
    if(!corpo)return;
    if(f==='name'&&!corpo.nome)throw new Error('O nome não pode ficar vazio.');
    await SB.mudar('PATCH','negocios','id=eq.'+l.id,corpo);return DB.crm.carregar()},
  async mover(l,etapa,perda){
    const id=CRMX.etapa.get(l.pipe+'|'+etapa);if(!id)throw new Error('Etapa não encontrada neste funil.');
    await SB.mudar('PATCH','negocios','id=eq.'+l.id,{etapa_id:id,motivo_perda_id:perda?CRMX.perda.get(perda)||null:null});return DB.crm.carregar()},
  async criar(pipe,nome,valor,origem){const id=await SB.rpc('negocio_criar',{p_funil:pipe,p_nome:nome,p_valor:+valor||0,p_origem:origem||null});await DB.crm.carregar();return id},
  async criarAtividade(l,tipo,titulo,quandoLocal){
    if(!quandoLocal)throw new Error('Escolha a data e a hora.');
    await SB.mudar('POST','atividades','',{negocio_id:l.id,tipo:ATV_TIPO[tipo]||'tarefa',titulo,quando:new Date(quandoLocal).toISOString(),responsavel_id:idDe(l.dono)||SB.sessao.user.id});
    return DB.crm.carregar()},
  async concluirAtividade(id,feita){await SB.mudar('PATCH','atividades','id=eq.'+id,{concluida:!!feita});return DB.crm.carregar()},
  async excluirAtividade(id){await SB.mudar('DELETE','atividades','id=eq.'+id,undefined,'Só líder ou administrador exclui atividades. Marque como concluída.');return DB.crm.carregar()},
  async criarCampo(nome,tipo,opcoes){await SB.rpc('campo_criar',{p_nome:nome,p_tipo:CAMPO_BANCO[tipo]||tipo,p_opcoes:opcoes||null});return DB.crm.carregar()},
  async excluirCampo(chave){await SB.rpc('campo_excluir',{p_chave:chave});return DB.crm.carregar()},
  /* relatório: dias médios em cada etapa (histórico real); carrega uma vez por funil */
  async tempo(pipe){const L=await SB.rpc('crm_tempo_etapas',{p_funil:CRMX.funil.get(pipe)})||[];
    CRM.tempo[pipe]=Object.fromEntries(L.map(x=>[CRMX.etapaNome.get(x.etapa_id),+x.dias]))}
};
/* ação da tela: grava, mostra o resultado e redesenha; no erro, recarrega do banco para desfazer o que a tela mudou */
function crmAcao(p,msg){Promise.resolve(p).then(()=>{renderCrm();if(msg)toast(msg)},
  e=>{const m=e&&e.message||String(e);DB.crm.carregar().catch(()=>{}).then(()=>{renderCrm();toast(m)})})}
/* conectado: atualiza a cada 30 s com a aba aberta, sem atrapalhar quem está digitando ou arrastando */
setInterval(()=>{if(!SB.ligado()||!S.auth||S.view!=='crm'||CRM.carregando||M.drag||M.newDeal||M.needPerda)return;const f=document.activeElement;
  if(f&&f.closest&&f.closest('#crm')&&/TEXTAREA|INPUT|SELECT/.test(f.tagName))return;DB.crm.carregar().then(renderCrm)},30000);
