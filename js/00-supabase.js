/* ===== Conexão com o Supabase (só em homologação/produção) =====
   Sem biblioteca: Auth e REST (PostgREST) por fetch, no schema crm, com a chave PUBLICÁVEL do ambiente.
   A sessão fica só na memória da aba (recarregou = entra de novo). Quem decide o que cada pessoa vê é o RLS do banco.
   Na demonstração (AMBIENTE.conectado = false) nada aqui é usado. */
const SB={
  sessao:null,
  ligado:()=>!!(AMBIENTE.conectado&&AMBIENTE.supabaseUrl&&AMBIENTE.chavePublicavel),
  async _auth(caminho,corpo,token,metodo){
    const r=await fetch(AMBIENTE.supabaseUrl+'/auth/v1/'+caminho,{method:metodo||(corpo?'POST':'GET'),
      headers:{apikey:AMBIENTE.chavePublicavel,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:corpo?JSON.stringify(corpo):undefined});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(SB._msgAuth(j));
    return j},
  _msgAuth(j){const m=String(j.error_description||j.msg||j.message||j.error||'');
    if(/invalid login|invalid_grant|credentials/i.test(m))return 'E-mail ou senha incorretos.';
    if(/not confirmed/i.test(m))return 'E-mail ainda não confirmado. Veja a caixa de entrada.';
    if(/weak|password should|at least/i.test(m))return 'Senha fraca: use pelo menos 10 caracteres, misturando letras e números.';
    if(/same.*password|different from the old/i.test(m))return 'Escolha uma senha diferente da anterior.';
    if(/rate limit|too many/i.test(m))return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    return 'Não foi possível entrar ('+(m||'erro do servidor')+').'},
  _guardar(j){SB.sessao={token:j.access_token,renovar:j.refresh_token,ate:Date.now()+(+j.expires_in||3600)*1000,user:j.user}},
  async token(){
    if(!SB.sessao)throw new Error('Sessão encerrada. Entre de novo.');
    if(SB.sessao.ate-Date.now()<60000){try{SB._guardar(await SB._auth('token?grant_type=refresh_token',{refresh_token:SB.sessao.renovar}))}catch(e){SB.sessao=null;throw new Error('Sessão vencida. Entre de novo.')}}
    return SB.sessao.token},
  /* REST no schema crm. Erros do banco (RAISE) voltam como mensagem legível. */
  async req(caminho,{metodo='GET',corpo,devolver}={}){
    const r=await fetch(AMBIENTE.supabaseUrl+'/rest/v1/'+caminho,{method:metodo,
      headers:{apikey:AMBIENTE.chavePublicavel,authorization:'Bearer '+await SB.token(),'accept-profile':'crm','content-profile':'crm','content-type':'application/json',
        ...(devolver?{prefer:'return=representation'}:{})},
      body:corpo===undefined?undefined:JSON.stringify(corpo)});
    const txt=await r.text();let j=null;try{j=txt?JSON.parse(txt):null}catch(e){}
    if(!r.ok)throw new Error(j&&j.message?sbFrase(j.message):'O banco respondeu '+r.status+'.');
    return j},
  rpc:(fn,args)=>SB.req('rpc/'+fn,{metodo:'POST',corpo:args||{}}),
  sel:(tabela,consulta)=>SB.req(tabela+'?'+consulta),
  /* lê tudo, de 1000 em 1000 (o Supabase devolve no máximo 1000 linhas por consulta) */
  async todos(tabela,consulta){const out=[];for(let de=0;;de+=1000){const L=await SB.sel(tabela,consulta+'&limit=1000&offset='+de)||[];out.push(...L);if(L.length<1000)return out}},
  /* grava e confere que alguma linha mudou: com RLS, gravar sem permissão não dá erro, só não muda nada */
  async mudar(metodo,tabela,filtro,corpo,semPermissao){const L=await SB.req(tabela+(filtro?'?'+filtro:''),{metodo,corpo,devolver:true});
    if(!L||!L.length)throw new Error(semPermissao||'Nada foi alterado: sem permissão ou o registro não existe mais.');return L},
  /* Edge Function chamada pelo navegador (ex.: usuarios-convite), com o JWT de quem está logado. */
  async funcao(nome,corpo){
    const r=await fetch(AMBIENTE.supabaseUrl+'/functions/v1/'+nome,{method:'POST',
      headers:{apikey:AMBIENTE.chavePublicavel,authorization:'Bearer '+await SB.token(),'content-type':'application/json'},body:JSON.stringify(corpo||{})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.erro||'A função '+nome+' respondeu '+r.status+'.');
    return j},
  async sair(){const t=SB.sessao&&SB.sessao.token;SB.sessao=null;if(t)try{await SB._auth('logout',{},t)}catch(e){}}
};
/* Mensagens do banco começam em minúscula (RAISE); na tela, com maiúscula e ponto. */
const sbFrase=m=>{const s=String(m||'').trim();return s?s[0].toUpperCase()+s.slice(1)+(/[.!?]$/.test(s)?'':'.'):s};
/* Papel no CRM a partir de crm.acessos (cada pessoa lê só as próprias linhas). */
async function sbPapel(){
  const L=await SB.sel('acessos','select=area,papel&user_id=eq.'+encodeURIComponent(SB.sessao.user.id));
  if(!L||!L.length)throw new Error('Seu usuário ainda não tem acesso ao CRM. Peça ao administrador.');
  return L.some(x=>x.papel==='admin'||x.area==='admin')?'admin':L.some(x=>x.papel==='lider')?'lider':'atendente'}
async function sbConcluir(){
  try{const papel=await sbPapel();
    if(!(await SB.rpc('registrar_presenca',{p_login:true})))throw new Error('Sua sessão foi encerrada. Entre de novo.');
    await DB.equipe.carregar();
    const eu=TEAM.find(p=>p.id===SB.sessao.user.id);
    if(!eu)throw new Error('Seu perfil não foi encontrado no CRM. Peça ao administrador.');
    ME[papel]=eu.k;recompute();finishLogin(papel);
    Promise.all([DB.crm.carregar(),veTarefas()?DB.tarefas.carregar():null,DB.avisos.carregar(),DB.canais.carregar(),DB.base.carregar()]).then(()=>{if(S.auth)renderAll()})}   // CRM, canais etc. em segundo plano (painel e contagens usam os negócios)
  catch(e){await SB.sair();sbTelas('lgf');lmsg(e.message)}}
/* mostra uma das telas do login (e-mail e senha, ou criar senha pelo link do e-mail) */
function sbTelas(id){['lgf','lsenha'].forEach(x=>{const f=document.getElementById(x);if(f)f.hidden=x!==id})}
/* Login real: e-mail e senha no Supabase Auth (login comum, sem código de autenticador). */
async function sbEntrar(email,senha){
  lmsg('Entrando…','ok');
  try{SB._guardar(await SB._auth('token?grant_type=password',{email,password:senha}));await sbConcluir()}
  catch(e){SB.sessao=null;lmsg(e.message)}}
/* Link do e-mail (convite ou "esqueci minha senha"): o Supabase volta para o app com a sessão no endereço (#access_token=…). */
async function sbLinkDoEmail(){
  const h=new URLSearchParams(location.hash.replace(/^#/,''));if(!h.has('access_token')&&!h.has('error'))return;
  history.replaceState(null,'',location.pathname+location.search);
  if(h.has('error')){lmsg(/expired|invalid/i.test(h.get('error_code')+h.get('error_description'))?'O link venceu ou já foi usado. Use “Esqueci minha senha” para receber outro.':'Não foi possível abrir o link ('+(h.get('error_description')||h.get('error'))+').');return}
  try{SB._guardar({access_token:h.get('access_token'),refresh_token:h.get('refresh_token'),expires_in:h.get('expires_in')});
    SB.sessao.user=await SB._auth('user',null,SB.sessao.token);
    $('#lsenhaq').textContent=(h.get('type')==='invite'?'Bem-vindo(a) ao CRM do escritório. ':'')+'Crie a senha de '+(SB.sessao.user.email||'acesso')+'. Use pelo menos 10 caracteres.';
    sbTelas('lsenha');$('#lserr').hidden=true;$('#ls1').focus()}
  catch(e){SB.sessao=null;lmsg('O link venceu ou já foi usado. Use “Esqueci minha senha” para receber outro.')}}
async function sbSalvarSenha(){
  const a=$('#ls1').value,b=$('#ls2').value,x=$('#lserr');x.hidden=true;
  const erro=t=>{x.hidden=false;x.textContent=t};
  if(a.length<10)return erro('Use pelo menos 10 caracteres.');
  if(a!==b)return erro('As duas senhas não são iguais.');
  try{SB.sessao.user=await SB._auth('user',{password:a},SB.sessao.token,'PUT');$('#ls1').value='';$('#ls2').value='';
    await sbConcluir()}
  catch(e){erro(e.message)}}
async function sbEsqueci(email){
  if(!email){lmsg('Escreva o seu e-mail no campo acima e clique de novo em “Esqueci minha senha”.');return}
  try{await SB._auth('recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{email});
    lmsg('Se o e-mail estiver cadastrado, chega em instantes um link para criar uma nova senha.','ok')}
  catch(e){lmsg(e.message)}}
/* presença: a cada minuto avisa o banco que a sessão está ativa; sessão encerrada pelo administrador sai na hora */
setInterval(()=>{if(!SB.ligado()||!S.auth||!SB.sessao)return;
  SB.rpc('registrar_presenca',{p_login:false}).then(ok=>{if(ok===false)sairDoApp('Sua sessão foi encerrada pelo administrador. Entre de novo.')},()=>{})},60000);
/* Conectado: some o acesso de demonstração e o seletor "Ver como". */
if(SB.ligado()){const d=document.querySelector('#login .demo');if(d)d.hidden=true;
  const r=document.getElementById('role');if(r){r.hidden=true;const l=document.querySelector('label[for=role]');if(l)l.hidden=true}
  document.getElementById('lsenha').addEventListener('submit',e=>{e.preventDefault();sbSalvarSenha()});
  setTimeout(sbLinkDoEmail,0)}
