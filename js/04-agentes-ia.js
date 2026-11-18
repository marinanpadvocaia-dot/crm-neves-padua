/* ---- Agentes de IA ----
   Demonstração: dados fictícios em memória, nenhuma IA é chamada.
   Homologação/produção: tudo vem do banco (crm.agentes, revisoes_ia, regras_ia, resumos_semanais) pela camada DB.ia,
   e toda gravação passa pelas funções do crm_0014/crm_0026 (aprovar = enviar pela fila de saída, com a pessoa como autora).
   Só o administrador cria, edita e exclui (arquiva) agentes e regras, e valida as regras (crm_0026).
   Só um agente LIGADO por tipo de mensagem: Instagram directs, Instagram comentários, Google avaliações. */
const CANAL_ROT={instagram:'Instagram',google:'Avaliações do Perfil da Empresa no Google',whatsapp:'WhatsApp do escritório'};
const IA_TIPOS={instagram:[['mensagem','Directs'],['comentario','Comentários']],google:[['avaliacao','Avaliações']]};
const IA_MODELOS=[['claude-opus-5-5','Claude Opus 5.5','O mais cuidadoso com tom e julgamento. Cerca de US$ 0,02 a 0,05 por mensagem.'],
  ['claude-sonnet-5-5','Claude Sonnet 5.5','Equilibrado. Cerca de metade do custo do Opus.'],
  ['claude-haiku-5-5','Claude Haiku 5.5','O mais barato (cerca de 1/40 do custo do Opus). Erra mais em tom e em julgamento.']];
const IA_TIPO_REGRA={proibido:['bad','Nunca'],obrigatorio:['ok','Sempre'],cuidado:['warn','Com cuidado']};
const tiposRot=(canal,t)=>(IA_TIPOS[canal]||[]).filter(x=>(t||[]).includes(x[0])).map(x=>x[1].toLowerCase()).join(' e ')||'—';
const canalRot=a=>a.canal==='instagram'?'Instagram ('+tiposRot('instagram',a.tipos)+')':CANAL_ROT[a.canal]||a.canal;
const modeloRot=m=>(IA_MODELOS.find(x=>x[0]===m)||[m,m])[1];
const AGENTES=[
 {id:'i1',slug:'instagram',canal:'instagram',tipos:['mensagem','comentario'],nome:'Agente Instagram',on:true,modo:'rascunho',modelo:'claude-opus-5-5',limite:200,
  instrucoes:'Responda directs e comentários do Instagram do escritório. Seja breve e cordial. Para comentários públicos, nunca trate de caso concreto: convide para o direct.',
  sozinho:['Dúvidas frequentes aprovadas (o que o escritório faz, horários, como agendar)','Triagem inicial: entende o assunto e pede nome, telefone e cidade'],
  captura:'Pede nome, telefone e cidade; quem aprova a resposta registra o lead no funil (origem Instagram).',
  transfere:['Pedido de proposta ou valores','Caso específico, reclamação ou menção a banco determinado','Pessoa pede para falar com humano'],
  base:'Artigos e perguntas frequentes aprovados',registro:'Revisão humana, canal Instagram'},
 {id:'i2',slug:'google',canal:'google',tipos:['avaliacao'],nome:'Agente Google (avaliações)',on:true,modo:'rascunho',modelo:'claude-opus-5-5',limite:200,
  instrucoes:'Responda avaliações públicas do Perfil da Empresa no Google em tom institucional, em até 3 frases, sem citar nenhum detalhe de caso, mesmo que a pessoa cite.',
  sozinho:['Escreve a resposta de avaliações positivas em tom institucional'],
  captura:'Não capta; convida a entrar em contato pelos canais oficiais.',
  transfere:['Avaliação com 3 estrelas ou menos (vai direto a uma pessoa, sem rascunho)','Qualquer menção a cliente, caso ou processo'],
  base:'Modelos de resposta institucional',registro:'Revisão humana, canal Google'}];
const CONVIA=[
 {id:'v1',ag:'i1',quem:'@renata.moura',st:'revisar',nota:'Triagem inicial.',msgs:[{f:'c',x:'Oi! Vi o reel sobre dívida de empresa. Como funciona a análise?'},{f:'ia',x:'Olá! Sou o assistente virtual do escritório Neves Pádua, especializado em direito bancário. A análise começa por entender a situação da empresa. Pode me dizer seu nome, cidade e um telefone para contato?'}]},
 {id:'v2',ag:'i1',quem:'@joao.mendes',st:'transferida',nota:'Pediu valores.',msgs:[{f:'c',x:'Quanto custa para renegociar a dívida da minha empresa?'},{f:'ia',x:'Os valores dependem da análise do caso e são apresentados pela equipe. Vou encaminhar sua conversa para um atendente, tudo bem?'},{f:'h',x:'Transferida para atendimento humano'}]},
 {id:'v7',ag:'i1',quem:'@carla.ferreira',st:'bloqueada',nota:'Bloqueado pela trava de regras: cita valor em reais.',msgs:[{f:'c',x:'Quanto fica para revisar o contrato do meu financiamento?'},{f:'ia',x:'A revisão do contrato fica em R$ 1.500.'}]},
 {id:'v3',ag:'i2',quem:'Fernando Cardoso',st:'revisar',nota:'Avaliação positiva.',msgs:[{f:'c',x:'Atendimento muito atencioso e transparente. Recomendo o escritório. ★★★★★'},{f:'ia',x:'Agradecemos a confiança e o carinho, Fernando. Nosso compromisso é atender cada pessoa com clareza e respeito. Estamos à disposição.'}]},
 {id:'v4',ag:'i2',quem:'Anônimo',st:'transferida',nota:'Avaliação com 2 estrela(s): vai direto a uma pessoa, sem rascunho.',msgs:[{f:'c',x:'Demoraram para me responder. ★★'},{f:'h',x:'Avaliação negativa: nenhum rascunho gerado, enviada a um atendente'}]},
 {id:'v6',ag:'i1',quem:'@paulo.lima',contato:'instagram:1795',pausa:true,com:'Gabriel',st:'transferida',nota:'O cliente pediu para falar com uma pessoa.',msgs:[{f:'c',x:'Prefiro falar com uma pessoa, pode ser?'},{f:'h',x:'Pedido de atendimento humano: a IA parou para este contato e o atendimento foi delegado ao Comercial'}]}];
const REGRAS=['Opinar sobre chance de êxito, prever prazo de decisão ou estimar valor de condenação, acordo ou economia.','Prometer ou sugerir resultado, garantir benefício ou comparar com outros escritórios.','Dar orientação jurídica ou aconselhar sobre o caso concreto de quem não é cliente: a conversa vira atendimento humano.','Revelar dados de processo ou de outras pessoas; antes de informar andamento, confirmar a identidade.','Divulgar valores de honorários ou fazer captação ativa por mensagem não solicitada.','Fingir ser humano ou falar em nome de uma pessoa: o agente se identifica como assistente virtual.']
  .map((r,i)=>({id:'rg'+(i+1),tipo:'proibido',regra:r,fonte:i===3?'Sigilo profissional (Estatuto e Código de Ética da OAB); LGPD':'Código de Ética e Disciplina da OAB; Provimento 205/2021',ag:null,validada:'11/11/2026',por:'',subst:null}));
const RESUMOS=[
 {id:'r1',c:'Marcos Tavares',sem:'26/10 a 01/11',txt:'Pedidos: enviou a proposta do Banco A e perguntou sobre as condições. Respostas da equipe: recebimento confirmado e resumo das condições enviado. Pendências: aguardar a conferência da Dra. Maria Júlia antes de responder valores. Tom: colaborativo, com pressa.',ok:false},
 {id:'r2',c:'Helena Prado',sem:'26/10 a 01/11',txt:'Pedidos: perguntou sobre o plano de pagamento. Respostas da equipe: solicitado o extrato de dívidas atualizado. Pendências: cliente enviar o extrato. Tom: cordial.',ok:true}];
/* estado da aba: carregamento do banco, indicadores para decidir sair do rascunho e os formulários abertos */
const IA={carregado:false,carregando:false,erro:'',ind:{i1:{dias:6,revisadas:3,sem:2,pct:66.7},i2:{dias:6,revisadas:1,sem:1,pct:100}},
  ed:null,edErro:'',verArq:false,confArq:null,rg:null,rgErro:'',desat:null,ocupado:false};
const PENDENTE=v=>v.st==='revisar'||v.st==='bloqueada';
const iaCnt=ag=>CONVIA.filter(v=>v.ag===ag&&PENDENTE(v)).length;
const iaAdmin=()=>S.role==='admin';
const agVivos=()=>AGENTES.filter(a=>!a.arq);

/* ---- camada de dados da IA (mesma interface nos dois modos) ---- */
const ST_DB={pendente:'revisar',bloqueada:'bloqueada',transferida:'transferida',editada:'corrigida',aprovada:'aprovada',rejeitada:'rejeitada'};
const linhas=t=>String(t||'').split('\n').map(x=>x.trim()).filter(Boolean);
const dataBR=s=>{const [a,m,d]=String(s).slice(0,10).split('-');return d+'/'+m+'/'+a};
const fimSemana=s=>{const d=new Date(String(s).slice(0,10)+'T12:00:00');d.setDate(d.getDate()+6);return dataBR(d.toISOString())};
const troca=(lista,novos)=>lista.splice(0,lista.length,...novos);
function ultimaIA(v){return v.msgs.map((m,i)=>m.f==='ia'?i:-1).filter(i=>i>=0).pop()}
/* conferências da tela (o banco confere de novo e manda a mensagem dele se algo escapar) */
function iaValidarAgente(d,id){
  const nome=(d.nome||'').trim();
  if(nome.length<3||nome.length>80)return 'O nome do agente precisa ter de 3 a 80 caracteres.';
  if(!IA_TIPOS[d.canal])return 'Escolha o canal do agente.';
  if(!d.tipos.length)return 'Escolha ao menos um tipo de mensagem para o agente responder.';
  if(!linhas(d.sozinho).length)return 'Liste ao menos um assunto que a IA pode responder.';
  if(!linhas(d.transfere).length)return 'Liste ao menos um caso em que a IA passa para uma pessoa.';
  const n=+d.limite;if(!Number.isInteger(n)||n<1||n>2000)return 'O limite diário precisa ser de 1 a 2000 mensagens.';
  if(agVivos().some(a=>a.id!==id&&a.nome.trim().toLowerCase()===nome.toLowerCase()))return 'Já existe um agente com esse nome.';
  return ''}
const agConflito=(id,canal,tipos)=>AGENTES.find(x=>x.id!==id&&x.on&&!x.arq&&x.canal===canal&&x.tipos.some(t=>tipos.includes(t)));
const msgConflito=(x,tipos)=>`O agente “${x.nome}” já responde ${tiposRot(x.canal,x.tipos.filter(t=>tipos.includes(t)))} deste canal: desligue-o antes.`;
function iaValidarRegra(r,id){
  const tx=(r.regra||'').trim();
  if(tx.length<10||tx.length>600)return 'A regra precisa ter de 10 a 600 caracteres.';
  if((r.fonte||'').trim().length>200)return 'A fonte pode ter até 200 caracteres.';
  const antiga=REGRAS.find(x=>x.id===id);
  if(REGRAS.some(x=>x.id!==id&&x.subst!==id&&(!antiga||x.id!==antiga.subst)&&(x.ag||null)===(r.ag||null)&&x.regra.trim().toLowerCase()===tx.toLowerCase()))return 'Já existe uma regra com esse texto.';
  return ''}
const regraValida=r=>!!r.validada;
DB.ia={
  async carregar(){
    if(!SB.ligado())return;IA.carregando=true;
    try{
      const [ag,rv,rg,rs]=await Promise.all([
        SB.sel('agentes','select=id,slug,nome,canal,tipos,ativo,modo,modelo,limite_diario,requer_vinculo,instrucoes,responde_sozinho,transfere_quando,captacao,base_conhecimento,destino_registro,arquivado_em&order=nome'),
        SB.sel('revisoes_ia','select=id,agente_id,status,contato,contato_nome,mensagem_cliente,rascunho,texto_final,motivo,delegado_id,created_at&status=neq.ignorada&order=created_at.desc&limit=100'),
        SB.sel('regras_ia','select=id,agente_id,tipo,regra,fonte,validada_em,validada_por,substitui_id&ativa=eq.true&order=created_at'),
        SB.sel('resumos_semanais','select=id,cliente_ref,semana_inicio,resumo,status&order=semana_inicio.desc&limit=50')]);
      const pausas=new Set(((await SB.sel('ia_pausas','select=contato&ate=gt.'+encodeURIComponent(new Date().toISOString())).catch(()=>[]))||[]).map(x=>x.contato));
      troca(AGENTES,ag.map(a=>({id:a.id,slug:a.slug,canal:a.canal,tipos:a.tipos||[],nome:a.nome,on:a.ativo,modo:a.modo,vinculo:a.requer_vinculo,modelo:a.modelo||'claude-opus-5-5',
        limite:a.limite_diario||200,instrucoes:a.instrucoes||'',sozinho:linhas(a.responde_sozinho),captura:a.captacao||'',transfere:linhas(a.transfere_quando),
        base:a.base_conhecimento||'',registro:a.destino_registro||'',arq:!!a.arquivado_em,arqEm:a.arquivado_em?dataBR(a.arquivado_em):''})));
      troca(CONVIA,rv.map(r=>{const txt=r.texto_final||r.rascunho,msgs=[{f:'c',x:r.mensagem_cliente||'(sem texto)'}];
        if(txt)msgs.push({f:'ia',x:txt});
        if(r.status==='transferida')msgs.push({f:'h',x:'Transferida para atendimento humano'});
        if(r.status==='aprovada'||r.status==='editada')msgs.push({f:'h',x:'Aprovada e colocada na fila de envio'});
        const dg=r.delegado_id&&TEAM.find(p=>p.id===r.delegado_id);
        return {id:r.id,ag:r.agente_id,quem:r.contato_nome||r.contato||'—',contato:r.contato,pausa:pausas.has(r.contato),com:dg?dg.name:'',st:ST_DB[r.status]||'revisar',nota:r.motivo||'',msgs}}));
      troca(REGRAS,rg.map(r=>{const p=r.validada_por&&TEAM.find(x=>x.id===r.validada_por);
        return {id:r.id,tipo:r.tipo||'proibido',regra:r.regra,fonte:r.fonte||'',ag:r.agente_id||null,validada:r.validada_em?dataBR(r.validada_em):'',por:p?p.name:'',subst:r.substitui_id||null}}));
      troca(RESUMOS,rs.map(r=>({id:r.id,c:r.cliente_ref,sem:dataBR(r.semana_inicio)+' a '+fimSemana(r.semana_inicio),txt:r.resumo,ok:r.status==='publicado'})));
      if(S.role==='admin'){const ind=await Promise.all(agVivos().map(a=>SB.rpc('ia_indicadores',{p_agente:a.id}).then(x=>x&&x[0]).catch(()=>null)));
        IA.ind={};agVivos().forEach((a,i)=>{const x=ind[i];if(x)IA.ind[a.id]={dias:x.dias_de_historico,revisadas:x.revisadas,sem:x.sem_edicao,pct:x.pct_sem_edicao==null?null:+x.pct_sem_edicao}})}
      IA.carregado=true;IA.erro='';
    }catch(e){IA.erro=e.message}finally{IA.carregando=false}},
  async ativar(id,on){
    if(SB.ligado()){await SB.rpc('agente_ativar',{p_id:id,p_ativo:on});return DB.ia.carregar()}
    const a=AGENTES.find(x=>x.id===id);if(!a)return;
    if(on&&a.arq)throw new Error('Agente excluído: restaure antes de ligar.');
    if(on&&a.vinculo)throw new Error('Este agente consulta dados de clientes e só liga depois do vínculo com o sistema jurídico (passo 2).');
    if(on&&!REGRAS.some(r=>regraValida(r)&&(!r.ag||r.ag===id)))throw new Error('Nenhuma regra validada: valide as regras antes de ligar o agente.');
    const x=on&&agConflito(id,a.canal,a.tipos);if(x)throw new Error(msgConflito(x,a.tipos));
    a.on=on},
  /* criar (id null) ou editar; d = rascunho do formulário */
  async salvarAgente(id,d){
    const dados={nome:d.nome.trim(),canal:d.canal,tipos:d.tipos,instrucoes:d.instrucoes.trim(),responde_sozinho:linhas(d.sozinho).join('\n'),
      transfere_quando:linhas(d.transfere).join('\n'),captacao:d.captura.trim(),base_conhecimento:d.base.trim(),destino_registro:d.registro.trim(),modelo:d.modelo,limite_diario:+d.limite};
    if(SB.ligado()){const r=await SB.rpc('agente_salvar',{p_id:id||null,p_dados:dados});await DB.ia.carregar();return r}
    const e=iaValidarAgente(d,id);if(e)throw new Error(e);
    const v={nome:dados.nome,canal:dados.canal,tipos:[...dados.tipos],instrucoes:dados.instrucoes,sozinho:linhas(dados.responde_sozinho),transfere:linhas(dados.transfere_quando),
      captura:dados.captacao,base:dados.base_conhecimento,registro:dados.destino_registro,modelo:dados.modelo,limite:dados.limite_diario};
    if(!id){const n={id:uid('ag'),slug:uid('ag-'),on:false,modo:'rascunho',...v};AGENTES.push(n);IA.ind[n.id]={dias:0,revisadas:0,sem:0,pct:null};return n.id}
    const a=AGENTES.find(x=>x.id===id);if(!a)throw new Error('Agente não encontrado.');
    if(a.arq)throw new Error('Agente excluído: restaure antes de editar.');
    if(a.on&&a.canal!==v.canal)throw new Error('Desligue o agente antes de trocar o canal.');
    const x=a.on&&agConflito(id,v.canal,v.tipos);if(x)throw new Error(msgConflito(x,v.tipos));
    Object.assign(a,v);return id},
  async arquivar(id,motivo){
    if(SB.ligado()){await SB.rpc('agente_arquivar',{p_id:id,p_motivo:motivo||null});return DB.ia.carregar()}
    const a=AGENTES.find(x=>x.id===id);if(!a||a.arq)throw new Error('Este agente já está excluído.');
    Object.assign(a,{on:false,arq:true,arqEm:dataBR(new Date().toISOString())})},
  async restaurar(id){
    if(SB.ligado()){await SB.rpc('agente_restaurar',{p_id:id});return DB.ia.carregar()}
    const a=AGENTES.find(x=>x.id===id);if(!a||!a.arq)throw new Error('Este agente não está excluído.');
    if(agVivos().some(x=>x.nome.trim().toLowerCase()===a.nome.trim().toLowerCase()))throw new Error(`Já existe um agente com o nome “${a.nome}”: renomeie o outro antes de restaurar.`);
    a.arq=false;a.arqEm=''},
  async salvarRegra(id,r){
    if(SB.ligado()){const x=await SB.rpc('regra_salvar',{p_id:id||null,p_tipo:r.tipo,p_regra:r.regra.trim(),p_fonte:r.fonte.trim()||null,p_agente:r.ag||null});await DB.ia.carregar();return x}
    const e=iaValidarRegra(r,id);if(e)throw new Error(e);
    const v={tipo:r.tipo,regra:r.regra.trim(),fonte:r.fonte.trim(),ag:r.ag||null};
    if(!id){const n={id:uid('rg'),...v,validada:'',por:'',subst:null};REGRAS.push(n);return n.id}
    const o=REGRAS.find(x=>x.id===id);if(!o)throw new Error('Regra não encontrada ou desativada.');
    if(!regraValida(o)){Object.assign(o,v);return id}
    if(o.tipo===v.tipo&&o.regra===v.regra&&o.fonte===v.fonte&&o.ag===v.ag)return id;
    const p=REGRAS.find(x=>x.subst===id&&!regraValida(x));if(p){Object.assign(p,v);return p.id}
    const n={id:uid('rg'),...v,validada:'',por:'',subst:id};REGRAS.push(n);return n.id},
  async validarRegra(id){
    if(SB.ligado()){await SB.rpc('regra_validar',{p_id:id});return DB.ia.carregar()}
    const r=REGRAS.find(x=>x.id===id);if(!r)throw new Error('Regra não encontrada ou desativada.');if(regraValida(r))throw new Error('Esta regra já está validada.');
    r.validada=dataBR(new Date().toISOString());r.por=me();
    if(r.subst){const i=REGRAS.findIndex(x=>x.id===r.subst);if(i>=0)REGRAS.splice(i,1);r.subst=null}},
  async desativarRegra(id,motivo){
    if(SB.ligado()){await SB.rpc('regra_desativar',{p_id:id,p_motivo:motivo||null});return DB.ia.carregar()}
    const r=REGRAS.find(x=>x.id===id);if(!r)throw new Error('Regra não encontrada ou já desativada.');
    if(regraValida(r)&&(motivo||'').trim().length<5)throw new Error('Escreva o motivo para desativar uma regra validada.');
    const sai=REGRAS.filter(x=>x.id===id||(x.subst===id&&!regraValida(x))),fica=REGRAS.filter(x=>!sai.includes(x));
    const sem=AGENTES.find(a=>a.on&&!a.arq&&!fica.some(x=>regraValida(x)&&(!x.ag||x.ag===a.id)));
    if(sem)throw new Error(`O agente “${sem.nome}” ficaria sem nenhuma regra validada: desligue-o antes.`);
    troca(REGRAS,fica)},
  async aprovar(id,texto){
    if(SB.ligado()){await SB.rpc('ia_aprovar',{p_id:id,p_texto:texto&&texto.trim()?texto:null});return DB.ia.carregar()}
    const v=CONVIA.find(x=>x.id===id);if(!v||!PENDENTE(v))throw new Error('Esta revisão já foi tratada.');
    const i=ultimaIA(v),orig=i!=null?v.msgs[i].x:'',fin=(texto||'').trim()||orig;
    if(!fin)throw new Error('Escreva a resposta antes de enviar.');
    if(i!=null)v.msgs[i].x=fin;else v.msgs.push({f:'ia',x:fin});
    v.st=fin!==orig?'corrigida':'aprovada';v.msgs.push({f:'h',x:'Aprovada por '+me()+' e colocada na fila de envio (simulado)'})},
  async assumir(id){
    if(SB.ligado()){await SB.rpc('ia_assumir',{p_id:id});return DB.ia.carregar()}
    const v=CONVIA.find(x=>x.id===id);if(!v||!PENDENTE(v))throw new Error('Esta revisão já foi tratada.');
    v.st='transferida';v.msgs.push({f:'h',x:'Conversa assumida por '+me()});v.nota='Assumida por uma pessoa.'},
  async mudarModo(id,modo,motivo){
    if(SB.ligado()){await SB.rpc('agente_mudar_modo',{p_id:id,p_modo:modo,p_motivo:motivo});return DB.ia.carregar()}
    if((motivo||'').trim().length<10)throw new Error('Registre o motivo (decisão por escrito de quem autorizou).');
    const x=IA.ind[id]||{dias:0,pct:0};
    if(modo==='automatico'&&x.dias<30)throw new Error(`Resposta automática só depois de 30 dias de revisão (hoje: ${x.dias} dias).`);
    if(modo==='automatico'&&(x.pct||0)<90)throw new Error(`Resposta automática exige 90% aprovadas sem edição (hoje: ${x.pct}%).`);
    const a=AGENTES.find(y=>y.id===id);if(a)a.modo=modo},
  /* devolver um contato para a IA (tira a pausa) */
  async despausar(contato){if(SB.ligado()){await SB.rpc('ia_despausar',{p_contato:contato});return DB.ia.carregar()}
    CONVIA.filter(v=>v.contato===contato).forEach(v=>v.pausa=false)},
  async salvarResumo(id,texto,publicar){
    if(SB.ligado()){await SB.rpc('resumo_salvar',{p_id:id,p_texto:texto,p_publicar:!!publicar});return DB.ia.carregar()}
    const r=RESUMOS.find(x=>x.id===id);if(!r||r.ok)throw new Error('Resumo não encontrado ou já publicado.');
    if(texto&&texto.trim())r.txt=texto;if(publicar)r.ok=true}
};
/* ações da tela: mostra o resultado e redesenha (inclusive no erro, para desfazer a caixa marcada) */
function iaAcao(p,msg){Promise.resolve(p).then(()=>{if(msg)toast(msg);renderIA()},e=>{toast(e.message||String(e));renderIA()})}
/* conectado: atualiza a cada 30 s com a aba aberta, sem atrapalhar quem está digitando ou com um formulário aberto */
setInterval(()=>{if(!SB.ligado()||!S.auth||S.view!=='ia'||IA.carregando||IA.ed||IA.rg||IA.desat||IA.confArq)return;const f=document.activeElement;
  if(f&&f.closest&&f.closest('#ia')&&/TEXTAREA|INPUT|SELECT/.test(f.tagName))return;DB.ia.carregar().then(renderIA)},30000);

function renderIA(){
  if(SB.ligado()&&!IA.carregado&&!IA.carregando&&!IA.erro){DB.ia.carregar().then(renderIA)}
  const n=CONVIA.filter(PENDENTE).length,pend=REGRAS.filter(r=>!regraValida(r)).length;
  const tabs=[['agentes','Agentes'],['rev','Revisão humana ('+n+')'],['regras','Regras'+(pend?' ('+pend+' para validar)':'')],['res','Resumos semanais']];
  const sub=SB.ligado()?`Conectado ao banco (${esc(AMBIENTE.rotulo)}) · nada vai ao cliente sem a aprovação de uma pessoa`:'Demonstração · conversas fictícias, nenhuma IA real é chamada';
  let body;
  if(SB.ligado()&&!IA.carregado)body=IA.erro?`<div class="empty"><b>Não foi possível carregar</b>${esc(IA.erro)}<div class="hb" style="justify-content:center"><button type="button" class="btn" data-x="iarefresh">Tentar de novo</button></div></div>`:'<div class="empty"><b>Carregando…</b>Buscando agentes e revisões no banco.</div>';
  else body=M.iaTab==='agentes'?iaAgentes():M.iaTab==='rev'?iaRev():M.iaTab==='regras'?iaRegras():iaRes();
  const barra=SB.ligado()&&IA.carregado?`<div class="hb" style="margin:0 0 8px"><button type="button" class="btn" data-x="iarefresh">Atualizar</button>${IA.erro?`<span class="src" style="align-self:center">Última atualização falhou: ${esc(IA.erro)}</span>`:''}</div>`:'';
  $('#ia').innerHTML=`<div class="mod">${pageHead('Agentes de IA',sub)}${subTabs(M.iaTab,tabs,'iatab')}${barra}${body}</div>`;
}
const li=a=>a.length?`<ul class="ul">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'—';
function iaModo(a){
  if(S.role!=='admin')return '';
  const x=IA.ind[a.id],ind=x?`${x.dias} dia(s) de histórico · ${x.revisadas} revisada(s) nos últimos 30 dias · ${x.pct==null?'—':x.pct+'%'} sem edição`:'sem dados ainda';
  return `<details class="iamodo" style="margin-top:8px"><summary class="src">Modo de resposta (só administrador)</summary><div style="display:grid;gap:6px;margin-top:6px">
   <span class="src">${esc(ind)}. Resposta automática exige 30 dias de revisão e 90% aprovadas sem edição, com a decisão por escrito.</span>
   <select id="iamodo-${a.id}" aria-label="Modo de resposta de ${esc(a.nome)}"><option value="rascunho"${a.modo==='rascunho'?' selected':''}>Rascunho: uma pessoa aprova cada resposta</option><option value="automatico"${a.modo==='automatico'?' selected':''}>Automático: responde sozinho no que pode responder</option></select>
   <textarea id="iamot-${a.id}" rows="2" aria-label="Motivo da mudança de modo" placeholder="Motivo e quem autorizou por escrito (fica no histórico)"></textarea>
   <div class="hb"><button type="button" class="btn" data-x="iamodo" data-id="${a.id}">Salvar modo</button></div></div></details>`}

/* ---- aba Agentes: cartões, formulário (criar/editar), excluir e restaurar ---- */
function iaRascunho(a){return a?{id:a.id,nome:a.nome,canal:a.canal,tipos:[...a.tipos],instrucoes:a.instrucoes||'',sozinho:a.sozinho.join('\n'),transfere:a.transfere.join('\n'),
    captura:a.captura||'',base:a.base||'',registro:a.registro||'',modelo:a.modelo,limite:a.limite,on:a.on}
  :{id:null,nome:'',canal:'instagram',tipos:['mensagem'],instrucoes:'',sozinho:'',transfere:'Pedido de proposta ou valores\nPessoa pede para falar com humano',
    captura:'',base:'',registro:'Revisão humana',modelo:'claude-opus-5-5',limite:200,on:false}}
function iaLerForm(){const d=IA.ed,v=s=>{const e=$('#iaf-'+s);return e?e.value:null};if(!d||!$('#iaf'))return;
  ['nome','instrucoes','sozinho','transfere','captura','base','registro','modelo','limite'].forEach(k=>{const x=v(k);if(x!=null)d[k]=x});
  const c=v('canal');if(c)d.canal=c;
  d.tipos=[...document.querySelectorAll('#iaf [data-iatipo]')].filter(x=>x.checked).map(x=>x.value)}
function iaForm(d){
  const t=(IA_TIPOS[d.canal]||[]).map(([v,l])=>`<label class="iaf-ck"><input type="checkbox" data-iatipo value="${v}"${d.tipos.includes(v)?' checked':''}> ${l}</label>`).join('');
  const mod=IA_MODELOS.find(x=>x[0]===d.modelo)||IA_MODELOS[0];
  const fld=(k,rot,dica,inp)=>`<label for="iaf-${k}">${rot}${dica?`<span class="dica">${dica}</span>`:''}${inp}</label>`;
  return `<form class="ag iaf" id="iaf" novalidate aria-label="${d.id?'Editar agente':'Novo agente'}"><h3>${d.id?'Editar '+esc(d.nome||'agente'):'Novo agente'}</h3>
   ${d.id?'':'<p class="src" style="margin:0">O agente novo começa desligado e em rascunho: nada vai ao cliente sem a aprovação de uma pessoa.</p>'}
   ${fld('nome','Nome','',`<input id="iaf-nome" maxlength="80" value="${esc(d.nome)}" autocomplete="off">`)}
   <div class="iaf-g2">${fld('canal','Canal',d.on?'Desligue o agente para trocar o canal.':'',`<select id="iaf-canal"${d.on?' disabled':''}>${optH([['instagram','Instagram'],['google','Google (avaliações)']],d.canal)}</select>`)}
    <fieldset><legend>Responde a</legend><div class="iaf-cks">${t}</div><span class="dica">Só um agente ligado por tipo de mensagem.</span></fieldset></div>
   ${fld('instrucoes','Instruções','Como o agente deve se comportar. Vai no pedido à IA, junto com as regras validadas.',`<textarea id="iaf-instrucoes" rows="3" maxlength="4000">${esc(d.instrucoes)}</textarea>`)}
   <div class="iaf-g2">${fld('sozinho','O que a IA pode responder','Um assunto por linha.',`<textarea id="iaf-sozinho" rows="4" maxlength="4000">${esc(d.sozinho)}</textarea>`)}
    ${fld('transfere','Quando passa para uma pessoa','Um caso por linha. Pedido de falar com uma pessoa sempre transfere.',`<textarea id="iaf-transfere" rows="4" maxlength="4000">${esc(d.transfere)}</textarea>`)}</div>
   <div class="iaf-g2">${fld('captura','Captação de lead','',`<input id="iaf-captura" maxlength="500" value="${esc(d.captura)}">`)}
    ${fld('base','Base de conhecimento','',`<input id="iaf-base" maxlength="500" value="${esc(d.base)}">`)}</div>
   ${fld('registro','Onde a conversa fica registrada','',`<input id="iaf-registro" maxlength="500" value="${esc(d.registro)}">`)}
   <div class="iaf-g2">${fld('modelo','Modelo de IA',`<span id="iaf-moddica">${esc(mod[2])}</span>`,`<select id="iaf-modelo">${optH(IA_MODELOS.map(x=>[x[0],x[1]]),d.modelo)}</select>`)}
    ${fld('limite','Limite diário de mensagens','Passando disso, as mensagens do dia ficam para a equipe.',`<input id="iaf-limite" type="number" min="1" max="2000" step="1" inputmode="numeric" value="${esc(String(d.limite))}">`)}</div>
   ${IA.edErro?`<p class="iaf-err" role="alert">${esc(IA.edErro)}</p>`:''}
   <div class="hb"><button type="submit" class="btn pri" data-ia="salvar"${IA.ocupado?' disabled':''}>${IA.ocupado?'Salvando…':d.id?'Salvar alterações':'Criar agente'}</button><button type="button" class="btn" data-ia="cancelar">Cancelar</button></div></form>`}
function iaCartao(a){
  if(IA.ed&&IA.ed.id===a.id)return iaForm(IA.ed);
  const adm=iaAdmin(),conf=IA.confArq===a.id;
  const acoes=conf?`<div class="hb iaf-conf" role="group" aria-label="Confirmar exclusão"><span class="kb-confirma">Excluir “${esc(a.nome)}”? Ele é desligado e sai da lista. O histórico fica guardado e o administrador pode restaurar.</span>
     <button type="button" class="btn kb-del" data-ia="excluirok" data-id="${a.id}"${IA.ocupado?' disabled':''}>Sim, excluir</button><button type="button" class="btn" data-ia="excluirno">Cancelar</button></div>`
    :`<div class="hb"><button type="button" class="btn" data-x="iarev" data-id="${a.id}">Ver conversas (${CONVIA.filter(v=>v.ag===a.id).length})</button>${adm?`<button type="button" class="btn" data-ia="editar" data-id="${a.id}">Editar</button><button type="button" class="btn kb-del" data-ia="excluir" data-id="${a.id}">Excluir</button>`:''}</div>`;
  return `<div class="ag"><h3>${esc(a.nome)}<span class="sp"></span><label class="src"><input type="checkbox" data-fld="agon" data-id="${a.id}"${a.on?' checked':''}> Ligado</label></h3>
   <span class="pill ${a.on?(a.modo==='automatico'?'warn':'ok'):'pause'}">${a.on?(a.modo==='automatico'?'Responde sozinho (automático)':'Rascunho: uma pessoa aprova'):'Desligado'}</span>
   <p class="src ia-avisar">Se o contato pedir uma pessoa, a IA para e o atendimento vai para um atendente do Comercial (rodízio, por ser o primeiro contato), que é avisado em Menções.</p>
   <dl><dt>Canal</dt><dd>${esc(canalRot(a))}</dd>${a.instrucoes?`<dt>Instruções</dt><dd>${esc(a.instrucoes)}</dd>`:''}<dt>O que a IA pode responder</dt><dd>${li(a.sozinho)}</dd><dt>Captação de lead</dt><dd>${esc(a.captura||'—')}</dd><dt>Quando transfere a uma pessoa</dt><dd>${li(a.transfere)}</dd><dt>Base de conhecimento</dt><dd>${esc(a.base||'—')}</dd><dt>Onde a conversa fica registrada</dt><dd>${esc(a.registro||'—')}</dd>
   <dt>Modelo de IA</dt><dd>${esc(modeloRot(a.modelo))} · até ${a.limite} mensagens por dia</dd></dl>
   ${acoes}${iaModo(a)}</div>`}
function iaAgentes(){
  const adm=iaAdmin(),vivos=agVivos(),arq=AGENTES.filter(a=>a.arq);
  const topo=adm?`<div class="hb" style="margin:0 0 10px">${IA.ed&&!IA.ed.id?'':'<button type="button" class="btn pri" data-ia="novo">+ Novo agente</button>'}${arq.length?`<button type="button" class="btn" data-ia="verarq" aria-expanded="${IA.verArq}">${IA.verArq?'Esconder excluídos':'Ver excluídos ('+arq.length+')'}</button>`:''}</div>`:'';
  const novo=IA.ed&&!IA.ed.id?iaForm(IA.ed):'';
  const lista=vivos.length?vivos.map(iaCartao).join(''):(novo?'':`<div class="empty"><b>Nenhum agente</b>${adm?'Crie um agente para o Instagram ou para as avaliações do Google.':'O administrador ainda não criou agentes.'}</div>`);
  const ex=adm&&IA.verArq&&arq.length?`<div class="tbl" style="margin-top:12px"><h3>Agentes excluídos</h3><div class="ia-arq">${arq.map(a=>`<div class="ia-arq-i"><span><b>${esc(a.nome)}</b><br><span class="src">${esc(canalRot(a))}${a.arqEm?' · excluído em '+esc(a.arqEm):''}</span></span><button type="button" class="btn" data-ia="restaurar" data-id="${a.id}">Restaurar</button></div>`).join('')}</div><p class="src" style="margin:0;padding:0 14px 12px">Volta desligado. As conversas antigas continuam ligadas a ele.</p></div>`:'';
  return `${topo}<div class="cards2">${novo}${lista}</div>${ex}`;
}
function iaRev(){
  const fil=[['revisar','Para revisar'],['transferida','Transferidas'],['corrigida','Corrigidas'],['aprovada','Aprovadas'],['todas','Todas']];
  const L=CONVIA.filter(v=>M.iaFil==='todas'||(M.iaFil==='revisar'?PENDENTE(v):v.st===M.iaFil));
  const v=CONVIA.find(x=>x.id===M.iaSel)||L[0];if(v)M.iaSel=v.id;
  const stP={revisar:['warn','Para revisar'],bloqueada:['bad','Bloqueada pela trava'],transferida:['info','Transferida'],corrigida:['ok','Corrigida e enviada'],aprovada:['ok','Aprovada e enviada'],rejeitada:['pause','Descartada']};
  const nomeAg=id=>(AGENTES.find(a=>a.id===id)||{nome:'Agente'}).nome;
  const left=`<div class="tbl"><div class="hb" style="padding:10px">${fil.map(([k,l])=>`<button type="button" class="btn${M.iaFil===k?' pri':''}" data-x="iafil" data-v="${k}">${l}</button>`).join('')}</div><div class="fxl">${L.map(x=>`<button type="button" class="btn${v&&x.id===v.id?' on':''}" data-x="iasel" data-id="${x.id}"><b>${esc(x.quem)}</b><br><span class="src">${esc(nomeAg(x.ag))} · ${stP[x.st][1]}</span></button>`).join('')||'<span class="src">Nada neste filtro.</span>'}</div></div>`;
  if(!v)return `<div class="rv">${left}<div class="empty"><b>Sem conversas</b>Nada para revisar neste filtro.</div></div>`;
  const i=ultimaIA(v),rot=v.st==='transferida'?'Motivo da transferência':v.st==='bloqueada'?'Por que foi bloqueada':'Observação';
  const acoes=PENDENTE(v)?`${v.st==='bloqueada'?'<p class="src" style="margin:0">O rascunho violou uma regra. Só o líder ou o administrador libera; o melhor é corrigir ou assumir a conversa.</p>':''}
   <label class="src">${i!=null?'Revise ou corrija a resposta da IA':'Escreva a resposta'}<textarea id="iacorr" rows="3">${i!=null?esc(v.msgs[i].x):''}</textarea></label>
   <div class="hb"><button type="button" class="btn pri" data-x="iaok" data-id="${v.id}">Aprovar e enviar</button><button type="button" class="btn" data-x="iafix" data-id="${v.id}">Enviar com a correção</button><button type="button" class="btn" data-x="iatake" data-id="${v.id}">Assumir a conversa</button></div>
   <p class="src" style="margin:0">Ao enviar com correção, o texto corrigido vira exemplo aprovado para o agente.</p>`:'';
  const right=`<div style="display:grid;gap:8px"><div class="sim"><div class="sh">${esc(v.quem)} · ${esc(nomeAg(v.ag))} <span class="pill ${stP[v.st][0]}">${stP[v.st][1]}</span></div><div class="log">${v.msgs.map(m=>`<div class="bub ${m.f==='ia'?'me':m.f==='h'?'sy':''}">${m.f==='ia'?'<small>Assistente virtual (IA)</small>':''}${esc(m.x)}</div>`).join('')}</div></div>
   ${v.nota?`<p class="src" style="margin:0">${rot}: ${esc(v.nota)}</p>`:''}
   ${v.pausa&&v.contato?`<div class="hb" style="align-items:center"><span class="pill info">IA pausada para este contato</span><span class="src">${v.com?'Com '+esc(v.com)+' (Comercial). ':''}Novas mensagens dele vão direto para a equipe.</span><button type="button" class="btn" data-ia="despausar" data-c="${esc(v.contato)}">Devolver para a IA</button></div>`:''}${acoes}</div>`;
  return `<div class="rv">${left}${right}</div>`;
}

/* ---- aba Regras: o que os agentes nunca/sempre/com cuidado fazem; validar, editar, desativar ---- */
function iaRegraForm(r){
  const ags=[['','Todos os agentes'],...agVivos().map(a=>[a.id,'Só o '+a.nome])];
  return `<form class="iaf ia-rgf" id="iarg" novalidate aria-label="${r.id?'Editar regra':'Nova regra'}">
   <div class="iaf-g2"><label for="iarg-tipo">Tipo<select id="iarg-tipo">${optH([['proibido','Nunca (proibido)'],['obrigatorio','Sempre (obrigatório)'],['cuidado','Com cuidado']],r.tipo)}</select></label>
    <label for="iarg-ag">Vale para<select id="iarg-ag">${optH(ags,r.ag||'')}</select></label></div>
   <label for="iarg-regra">Regra<span class="dica">Escreva o que o agente faz ou deixa de fazer, em uma frase.</span><textarea id="iarg-regra" rows="2" maxlength="600">${esc(r.regra)}</textarea></label>
   <label for="iarg-fonte">Fonte (opcional)<span class="dica">Ex.: Código de Ética e Disciplina da OAB; Provimento 205/2021.</span><input id="iarg-fonte" maxlength="200" value="${esc(r.fonte)}"></label>
   <p class="src" style="margin:0">${r.id&&r.validada?'A versão atual continua valendo até você validar a nova.':'A regra só passa a valer depois de validada.'}</p>
   ${IA.rgErro?`<p class="iaf-err" role="alert">${esc(IA.rgErro)}</p>`:''}
   <div class="hb"><button type="submit" class="btn pri" data-ia="rsalvar"${IA.ocupado?' disabled':''}>${IA.ocupado?'Salvando…':'Salvar regra'}</button><button type="button" class="btn" data-ia="rcancelar">Cancelar</button></div></form>`}
function iaRegraItem(r){
  if(IA.rg&&IA.rg.id===r.id)return `<div class="ia-rg">${iaRegraForm(IA.rg)}</div>`;
  const adm=iaAdmin(),[cl,rot]=IA_TIPO_REGRA[r.tipo]||IA_TIPO_REGRA.proibido,val=regraValida(r);
  const antiga=r.subst&&REGRAS.find(x=>x.id===r.subst),nova=REGRAS.find(x=>x.subst===r.id&&!regraValida(x));
  const st=val?`<span class="src">Validada em ${esc(r.validada)}${r.por?' por '+esc(r.por):''}${nova?' · há uma nova versão aguardando validação':''}</span>`
    :`<span class="pill warn">Aguardando validação</span>${antiga?`<span class="src">Nova versão de: “${esc(antiga.regra)}”</span>`:''}`;
  const des=IA.desat===r.id?`<div class="hb ia-rg-des"><label class="src" for="iarg-mot" style="flex:1;min-width:200px">Motivo para desativar (fica registrado)<input id="iarg-mot" maxlength="300"></label>
     <button type="button" class="btn kb-del" data-ia="rdesatok" data-id="${r.id}"${IA.ocupado?' disabled':''}>Desativar</button><button type="button" class="btn" data-ia="rdesatno">Cancelar</button></div>`
    :adm?`<div class="hb">${val?'':`<button type="button" class="btn pri" data-ia="rvalidar" data-id="${r.id}"${IA.ocupado?' disabled':''}>Validar</button>`}<button type="button" class="btn" data-ia="reditar" data-id="${r.id}">Editar</button><button type="button" class="btn kb-del" data-ia="rdesat" data-id="${r.id}">${val?'Desativar':'Descartar'}</button></div>`:'';
  return `<div class="ia-rg"><div class="ia-rg-h"><span class="pill ${cl}">${rot}</span>${st}</div><p class="ia-rg-t">${esc(r.regra)}</p>${r.fonte?`<span class="src">Fonte: ${esc(r.fonte)}</span>`:''}${des}</div>`}
function iaRegras(){
  const adm=iaAdmin(),vals=REGRAS.filter(regraValida).length;
  const grupos=[[null,'Valem para todos os agentes'],...AGENTES.filter(a=>REGRAS.some(r=>r.ag===a.id)).map(a=>[a.id,'Só para o '+a.nome+(a.arq?' (excluído)':'')])];
  const aviso=vals?'':`<p class="iaf-err" role="status">Nenhuma regra validada neste ambiente: nenhum agente liga até ${adm?'você validar':'o administrador validar'} as regras.</p>`;
  const nova=IA.rg&&!IA.rg.id?`<div class="ia-rg">${iaRegraForm(IA.rg)}</div>`:'';
  return `<div class="tbl"><h3>O que os agentes nunca, sempre ou com cuidado fazem</h3><div style="padding:0 14px 6px;display:grid;gap:6px">
    <p class="src" style="margin:0">Base: sigilo profissional e publicidade na advocacia (Estatuto e Regulamento Geral da OAB, Código de Ética e Provimento 205/2021). Além das regras no pedido à IA, uma trava automática, que não muda por aqui, bloqueia rascunhos com valor em reais, honorários, promessa de resultado ou opinião sobre chance.</p>
    <p class="src" style="margin:0">${adm?'Regra nova ou editada só vale depois de validada. Ao editar uma regra validada, a versão atual continua valendo até você validar a nova.':'Só o administrador cria, edita e valida as regras.'}</p>${aviso}
    ${adm&&!(IA.rg&&!IA.rg.id)?'<div class="hb"><button type="button" class="btn pri" data-ia="rnova">+ Nova regra</button></div>':''}</div>
   ${nova}${grupos.map(([g,t])=>{const L=REGRAS.filter(r=>(r.ag||null)===g);return L.length?`<h4 class="ia-rg-g">${esc(t)}</h4>${L.map(iaRegraItem).join('')}`:''}).join('')||(nova?'':'<div class="empty"><b>Sem regras</b>Sem nenhuma regra validada, nenhum agente liga.</div>')}</div>`}
function iaRes(){
  return `<p class="src" style="margin:0">Toda semana, para cada cliente com conversa, a IA resume pedidos, respostas, pendências e tom, sem inventar nem opinar. Uma pessoa revisa e publica; a gravação do andamento no dossiê do sistema jurídico entra com o passo 2.</p>`+(RESUMOS.length?RESUMOS.map(r=>`<div class="ag"><h3>${esc(r.c)} <span class="src">· semana ${esc(r.sem)}</span><span class="sp"></span><span class="pill ${r.ok?'ok':'warn'}">${r.ok?'Publicado':'Para aprovar'}</span></h3>${M.resEdit===r.id?`<textarea id="rested" rows="5">${esc(r.txt)}</textarea>`:`<p style="margin:0">${esc(r.txt)}</p>`}
   ${r.ok?'':`<div class="hb">${M.resEdit===r.id?`<button type="button" class="btn pri" data-x="resave" data-id="${r.id}">Salvar texto</button>`:`<button type="button" class="btn" data-x="resedit" data-id="${r.id}">Editar</button>`}<button type="button" class="btn pri" data-x="resok" data-id="${r.id}">Aprovar e publicar</button></div>`}</div>`).join(''):'<div class="empty"><b>Sem resumos</b>Os resumos semanais aparecem aqui quando forem gerados.</div>');
}

/* ---- eventos da aba (data-ia) ---- */
function iaOcupado(p,ok,erro){IA.ocupado=true;renderIA();
  return Promise.resolve(p).then(r=>{IA.ocupado=false;ok&&ok(r);renderIA()},e=>{IA.ocupado=false;(erro||(m=>toast(m)))(e.message||String(e));renderIA()})}
function iaLerRegra(){const r=IA.rg,v=s=>{const e=$('#iarg-'+s);return e?e.value:null};if(!r||!$('#iarg'))return;
  ['tipo','regra','fonte'].forEach(k=>{const x=v(k);if(x!=null)r[k]=x});const g=v('ag');if(g!=null)r.ag=g||null}
function iaFoco(sel){requestAnimationFrame(()=>{const e=$(sel);if(e)e.focus()})}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-ia]');if(!b||!b.closest('#ia'))return;
  const a=b.dataset.ia,id=b.dataset.id;
  if(a==='despausar')return iaAcao(DB.ia.despausar(b.dataset.c),'A IA volta a responder este contato.');
  if(IA.ocupado)return;
  if(a==='novo'){IA.ed=iaRascunho(null);IA.edErro='';IA.confArq=null;renderIA();iaFoco('#iaf-nome')}
  else if(a==='editar'){const x=AGENTES.find(y=>y.id===id);if(!x)return;IA.ed=iaRascunho(x);IA.edErro='';IA.confArq=null;renderIA();iaFoco('#iaf-nome')}
  else if(a==='cancelar'){IA.ed=null;IA.edErro='';renderIA()}
  else if(a==='salvar'){e.preventDefault();iaLerForm();const d=IA.ed,er=iaValidarAgente(d,d.id);
    if(er){IA.edErro=er;renderIA();iaFoco('#iaf .iaf-err');return}
    iaOcupado(DB.ia.salvarAgente(d.id,d),()=>{toast(d.id?'Agente atualizado. A mudança fica no histórico.':'Agente criado, desligado e em rascunho.');IA.ed=null;IA.edErro=''},m=>{IA.edErro=m})}
  else if(a==='excluir'){IA.confArq=id;IA.ed=null;renderIA();iaFoco('[data-ia=excluirno]')}
  else if(a==='excluirno'){IA.confArq=null;renderIA()}
  else if(a==='excluirok'){iaOcupado(DB.ia.arquivar(id),()=>{IA.confArq=null;toast('Agente excluído e desligado. Dá para restaurar em “Ver excluídos”.')})}
  else if(a==='verarq'){IA.verArq=!IA.verArq;renderIA()}
  else if(a==='restaurar'){iaOcupado(DB.ia.restaurar(id),()=>toast('Agente restaurado. Ele volta desligado.'))}
  else if(a==='rnova'){IA.rg={id:null,tipo:'proibido',regra:'',fonte:'',ag:null};IA.rgErro='';IA.desat=null;renderIA();iaFoco('#iarg-regra')}
  else if(a==='reditar'){const r=REGRAS.find(x=>x.id===id);if(!r)return;IA.rg={id:r.id,tipo:r.tipo,regra:r.regra,fonte:r.fonte,ag:r.ag,validada:r.validada};IA.rgErro='';IA.desat=null;renderIA();iaFoco('#iarg-regra')}
  else if(a==='rcancelar'){IA.rg=null;IA.rgErro='';renderIA()}
  else if(a==='rsalvar'){e.preventDefault();iaLerRegra();const r=IA.rg,er=iaValidarRegra(r,r.id);
    if(er){IA.rgErro=er;renderIA();iaFoco('#iarg .iaf-err');return}
    iaOcupado(DB.ia.salvarRegra(r.id,r),()=>{toast(r.id&&r.validada?'Nova versão salva. Ela vale depois de validada; até lá, continua valendo a atual.':'Regra salva. Ela vale depois de validada.');IA.rg=null;IA.rgErro=''},m=>{IA.rgErro=m})}
  else if(a==='rvalidar'){iaOcupado(DB.ia.validarRegra(id),()=>toast('Regra validada. Ela já vale para os agentes.'))}
  else if(a==='rdesat'){const r=REGRAS.find(x=>x.id===id);if(!r)return;
    if(regraValida(r)){IA.desat=id;IA.rg=null;renderIA();iaFoco('#iarg-mot')}
    else iaOcupado(DB.ia.desativarRegra(id,''),()=>toast('Regra descartada.'))}
  else if(a==='rdesatno'){IA.desat=null;renderIA()}
  else if(a==='rdesatok'){const m=($('#iarg-mot')||{}).value||'';
    if(m.trim().length<5){toast('Escreva o motivo para desativar uma regra validada.');iaFoco('#iarg-mot');return}
    iaOcupado(DB.ia.desativarRegra(id,m.trim()),()=>{IA.desat=null;toast('Regra desativada.')})}
});
/* trocar o canal muda os tipos de mensagem; trocar o modelo mostra o custo */
document.addEventListener('change',e=>{const t=e.target;if(!t.closest||!t.closest('#iaf'))return;
  if(t.id==='iaf-canal'){iaLerForm();IA.ed.canal=t.value;IA.ed.tipos=(IA_TIPOS[t.value]||[]).map(x=>x[0]);renderIA();iaFoco('#iaf-canal')}
  else if(t.id==='iaf-modelo'){const m=IA_MODELOS.find(x=>x[0]===t.value),d=$('#iaf-moddica');if(m&&d)d.textContent=m[2]}});
/* ao corrigir um campo, a mensagem de erro anterior sai */
document.addEventListener('input',e=>{const f=e.target.closest&&e.target.closest('#iaf,#iarg');if(!f)return;
  if(f.id==='iaf')IA.edErro='';else IA.rgErro='';const m=f.querySelector('.iaf-err');if(m)m.remove()});
/* Enter num campo "clica" o botão de salvar (tratado acima); o envio nativo do formulário nunca acontece */
document.addEventListener('submit',e=>{const f=e.target;if(f.id==='iaf'||f.id==='iarg')e.preventDefault()});
