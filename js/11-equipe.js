/* ===== Equipe, setores e filas, tags, respostas rápidas e ausência no banco (crm_0015) =====
   Conectado: tudo vem do banco no login e cada alteração passa por uma função do banco (só administrador,
   exceto criar resposta rápida). Depois de gravar, recarrega do banco: a tela mostra sempre o que ficou salvo.
   Na demonstração, as listas em memória continuam como estão.
   Identidade: na tela, cada pessoa é identificada pelo nome (k), como na demonstração; o id do login fica em p.id. */
const TIPO_PERFIL={admin:'Administrador',lider:'Líder de setor',atendente:'Atendente'};
const PERFIL_TIPO={'Administrador':'admin','Líder de setor':'lider','Atendente':'atendente'};
const FILAS_FIXAS=['minha','mencoes','todos','triagem'];
const idDe=k=>(TEAM.find(p=>p.k===k)||{}).id||null;
const nomeDoId=id=>(TEAM.find(p=>p.id===id)||{}).k||'';
const hhmm=t=>String(t||'').slice(0,5);
const EQ_ORDEM=new Map();   // fila -> ids na ordem do rodízio (crm.fila_membros.ordem)

DB.equipe={
  async carregar(){
    const [eq,fl,tg,rr,cf,mb]=await Promise.all([
      SB.rpc('equipe'),
      SB.sel('filas_config','select=fila_ref,nome,dias,abre,fecha,sla_primeira_min,sla_retorno_min,lider_id,rodizio_ativo,rodizio_proximo&order=nome'),
      SB.sel('tags','select=nome,cor&order=nome'),
      SB.sel('respostas_rapidas','select=atalho,texto,criada_por&order=atalho'),
      SB.sel('config','select=chave,valor&chave=eq.ausencia'),
      SB.sel('fila_membros','select=fila_ref,user_id&order=ordem,user_id')]);
    TEAM.splice(0,TEAM.length,...(eq||[]).map(p=>({k:p.nome,id:p.user_id,name:p.nome,email:p.email,role:p.funcao||TIPO_PERFIL[p.tipo],funcao:p.funcao||'',
      perfil:TIPO_PERFIL[p.tipo]||'Atendente',filas:p.filas||[],todos:!!p.ve_todos,ativo:true,online:!!p.online,
      ultimoAcesso:p.ultimo_acesso?Date.parse(p.ultimo_acesso):null,visto:p.visto_em?Date.parse(p.visto_em):null})));
    const tri=(fl||[]).find(f=>f.fila_ref==='triagem');
    QUEUES.splice(0,QUEUES.length,{id:'minha',name:'Minha fila'},{id:'mencoes',name:'Menções'},{id:'todos',name:'Todos os clientes'},{id:'triagem',name:tri?tri.nome:'Triagem'},
      ...(fl||[]).filter(f=>!FILAS_FIXAS.includes(f.fila_ref)).map(f=>({id:f.fila_ref,name:f.nome})));
    CFG.sectors.splice(0,CFG.sectors.length,...(fl||[]).map(f=>({id:f.fila_ref,days:f.dias,open:hhmm(f.abre),close:hhmm(f.fecha),sla:f.sla_primeira_min,ret:f.sla_retorno_min,leader:nomeDoId(f.lider_id)})));
    // rodízio: ligado/desligado e ponteiro vêm da fila; a ordem das pessoas é a do banco (crm.atribuir_rodizio)
    Object.keys(CFG.rod).forEach(k=>delete CFG.rod[k]);(fl||[]).forEach(f=>CFG.rod[f.fila_ref]={on:!!f.rodizio_ativo,i:+f.rodizio_proximo||0});
    EQ_ORDEM.clear();(mb||[]).forEach(m=>{const L=EQ_ORDEM.get(m.fila_ref)||[];L.push(m.user_id);EQ_ORDEM.set(m.fila_ref,L)});
    TAGS.splice(0,TAGS.length,...(tg||[]).map(t=>t.nome));Object.keys(TAGCOL).forEach(k=>delete TAGCOL[k]);(tg||[]).forEach(t=>TAGCOL[t.nome]=t.cor);
    Object.keys(QUICK).forEach(k=>delete QUICK[k]);Object.keys(QBY).forEach(k=>delete QBY[k]);
    (rr||[]).forEach(r=>{QUICK[r.atalho]=r.texto;const n=nomeDoId(r.criada_por);if(n)QBY[r.atalho]=n});
    const c=Object.fromEntries((cf||[]).map(x=>[x.chave,x.valor]));
    if(c.ausencia)CFG.away={on:!!c.ausencia.on,text:c.ausencia.text||''};
    recompute()},
  /* novo usuário: convite pela Edge Function (só quem ainda não tem login recebe e-mail); depois grava perfil, tipo e filas */
  async salvarUsuario(p,d){
    let id=p&&p.id,convidado=false;
    if(!id){const r=await SB.funcao('usuarios-convite',{email:d.email,nome:d.name});id=r.user_id;convidado=!!r.convidado}
    await SB.rpc('usuario_salvar',{p_user:id,p_nome:d.name,p_email:d.email,p_funcao:d.role||null,p_tipo:PERFIL_TIPO[d.perfil]||'atendente',
      p_filas:d.perfil==='Atendente'?d.filas:null,p_ve_todos:!!d.todos});
    await DB.equipe.carregar();return convidado},
  async desativarUsuario(p){const r=await SB.rpc('usuario_desativar',{p_user:p.id});await DB.equipe.carregar();return r},
  async encerrarSessao(p){await SB.rpc('usuario_encerrar_sessao',{p_user:p.id});return DB.equipe.carregar()},
  async rodizio(ref,on){await SB.rpc('fila_rodizio',{p_ref:ref,p_on:!!on});return DB.equipe.carregar()},
  async criarFila(nome){await SB.rpc('fila_criar',{p_nome:nome});return DB.equipe.carregar()},
  async salvarFila(s){await SB.rpc('fila_salvar',{p_ref:s.id,p_dias:s.days,p_abre:s.open,p_fecha:s.close,p_sla:+s.sla,p_ret:+s.ret,p_lider:idDe(s.leader)});return DB.equipe.carregar()},
  async salvarTag(nome,cor){const t=await SB.rpc('tag_salvar',{p_nome:nome,p_cor:cor});await DB.equipe.carregar();return t},
  async criarResposta(atalho,texto){await SB.rpc('resposta_criar',{p_atalho:atalho,p_texto:texto});return DB.equipe.carregar()},
  async excluirResposta(atalho){await SB.rpc('resposta_excluir',{p_atalho:atalho});return DB.equipe.carregar()},
  async salvarAusencia(){await SB.rpc('ausencia_salvar',{p_on:!!CFG.away.on,p_texto:CFG.away.text||''});return DB.equipe.carregar()}
};
/* ação da tela: grava, mostra o resultado e redesenha; no erro, recarrega do banco para desfazer o que a tela mudou */
function eqAcao(p,msg){Promise.resolve(p).then(()=>{renderAll();if(msg)toast(msg)},
  e=>{const m=e&&e.message||String(e);DB.equipe.carregar().catch(()=>{}).then(()=>{renderAll();toast(m)})})}
/* mensagem de ausência: grava ao sair do campo (texto) ou ao marcar a caixa */
document.addEventListener('change',e=>{const f=e.target.dataset&&e.target.dataset.fld;
  if(SB.ligado()&&S.role==='admin'&&(f==='awayon'||f==='awaytx'))eqAcao(DB.equipe.salvarAusencia(),'Mensagem de ausência salva.')});
