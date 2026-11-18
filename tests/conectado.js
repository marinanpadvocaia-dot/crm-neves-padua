// Teste do modo CONECTADO contra um Supabase SIMULADO (interceptação no navegador). Nada sai para a rede.
// Monta o app como homologação (URL fictícia), entra como líder e como administrador e confere que a tela
// lê e grava pelo banco: login comum, criação de senha pelo link do e-mail, equipe, setores,
// tags, respostas rápidas, ausência e Agentes de IA.  Uso: npm run test:conectado
const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),os=require('os');
const raiz=path.join(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'crm-con-'));
const BASE='https://abcdefghijklmnopqrst.supabase.co';
const amb={nome:'homologacao',rotulo:'Homologação',supabaseUrl:BASE,chavePublicavel:'sb_publishable_teste',aviso:'HOMOLOGAÇÃO · teste',conectado:true};
const files=fs.readdirSync(path.join(raiz,'js')).filter(f=>f.endsWith('.js')).sort();
const FLX_CAT=fs.readFileSync(path.join(raiz,'supabase','functions','_shared','fluxos-catalogo.json'),'utf8');
fs.writeFileSync(path.join(out,'app-con.js'),`(function(){\nconst AMBIENTE=Object.freeze(${JSON.stringify(amb)});\nconst FLX_CAT=${FLX_CAT};\n${files.map(f=>fs.readFileSync(path.join(raiz,'js',f),'utf8')).join('\n')}\nrenderAll();\n})();\n`);
fs.writeFileSync(path.join(out,'con.html'),fs.readFileSync(path.join(raiz,'index.html'),'utf8')
  .replace('css/app.css',require('url').pathToFileURL(path.join(raiz,'css','app.css')).href).replace('dist/app.js','app-con.js'));

const LID='11111111-1111-1111-1111-111111111111',ADM='55555555-5555-5555-5555-555555555555',ATD='66666666-6666-6666-6666-666666666666',NOVO='77777777-7777-7777-7777-777777777777';
const AG='22222222-2222-2222-2222-222222222222',RV='33333333-3333-3333-3333-333333333333';
// estado do "banco"
const DBS={revisao:'pendente',agentesExtra:[],regrasExtra:[],fatores:{[LID]:[],[ADM]:[]},eu:LID,
  equipe:[{user_id:ADM,nome:'Ana Júlia Neves',email:'admin@homolog.test',funcao:'Administração',tipo:'admin',ve_todos:false,filas:[],online:true,ultimo_acesso:'2026-11-12T10:00:00Z',visto_em:'2026-11-12T10:05:00Z'},
          {user_id:LID,nome:'Líder Teste',email:'lider@homolog.test',funcao:null,tipo:'lider',ve_todos:false,filas:[],online:false,ultimo_acesso:null,visto_em:null},
          {user_id:ATD,nome:'Atendente Teste',email:'atendente@homolog.test',funcao:'Passivos',tipo:'atendente',ve_todos:false,filas:['passivos'],online:true,ultimo_acesso:'2026-11-12T09:00:00Z',visto_em:'2026-11-12T10:04:00Z'}],
  filas:[{fila_ref:'triagem',nome:'Triagem',dias:'Seg–Sex',abre:'08:00:00',fecha:'18:00:00',sla_primeira_min:30,sla_retorno_min:120,lider_id:null},
         {fila_ref:'passivos',nome:'Gestão de Passivos PJ',dias:'Seg–Sex',abre:'08:00:00',fecha:'18:00:00',sla_primeira_min:15,sla_retorno_min:120,lider_id:LID,rodizio_ativo:false,rodizio_proximo:0},
         {fila_ref:'comercial',nome:'Comercial',dias:'Seg–Sex',abre:'08:00:00',fecha:'18:00:00',sla_primeira_min:15,sla_retorno_min:120,lider_id:LID,rodizio_ativo:false,rodizio_proximo:0}],   // líder do comercial: usa o CRM (crm_0024)
  tags:[{nome:'PJ',cor:0},{nome:'Urgente',cor:2}],respostas:[{atalho:'/boasvindas',texto:'Olá, [Nome]!',criada_por:null}],
  config:[{chave:'ausencia',valor:{on:true,text:'Fora do horário.'}}]};
const ETN=['Novo lead','Em contato','Qualificado','Reunião agendada','Proposta enviada','Negociação','Ganho','Perdido'];
const CRMD={funis:[{id:'F1',slug:'pj',nome:'Comercial'}],   // um funil só (crm_0024)
  etapas:[...ETN.map((n,i)=>({id:'E'+(i+1),funil_id:'F1',nome:n,ordem:i+1,probabilidade:[10,20,35,50,65,80,100,0][i],tipo:i===6?'ganho':i===7?'perdido':'aberta'})),
          {id:'A1',funil_id:'F2',nome:'Novo lead',ordem:1,probabilidade:10,tipo:'aberta'},{id:'A7',funil_id:'F2',nome:'Ganho',ordem:2,probabilidade:100,tipo:'ganho'},{id:'A8',funil_id:'F2',nome:'Perdido',ordem:3,probabilidade:0,tipo:'perdido'}],
  origens:[{id:'O1',nome:'Meta Ads'},{id:'O2',nome:'Indicação'}],perdas:[{id:'P1',nome:'Sem resposta'},{id:'P2',nome:'Fora do perfil'}],
  campos:[{chave:'banco',nome:'Banco principal',tipo:'texto',opcoes:null}],
  negocios:[{id:'N1',funil_id:'F1',etapa_id:'E1',nome:'Cliente Real Um',empresa:'Real ME',telefone:'16 99999-0001',valor:10000,probabilidade:10,responsavel_id:LID,origem_id:'O1',previsao_fechamento:null,motivo_perda_id:null,etapa_max_ordem:1,conversa_ref:null,cliente_ref:null,externo_id:null,campos:{}},
            {id:'N2',funil_id:'F1',etapa_id:'E7',nome:'Cliente Ganho',empresa:'',telefone:null,valor:30000,probabilidade:100,responsavel_id:LID,origem_id:'O2',previsao_fechamento:null,motivo_perda_id:null,etapa_max_ordem:6,conversa_ref:null,cliente_ref:null,externo_id:null,campos:{}}],
  atividades:[{id:'T1',negocio_id:'N1',tipo:'ligacao',titulo:'Ligar para o cliente',quando:'2026-11-20T13:00:00Z',concluida:false,responsavel_id:LID,origem:'manual'}],
  formulario:[{negocio_id:'N1',pergunta:'Quantos bancos?',resposta:'3'}]};
const CW='c0000000-0000-4000-8000-000000000001',CR='c0000000-0000-4000-8000-000000000002',CI='c0000000-0000-4000-8000-000000000003';
const agoraIso=()=>new Date().toISOString(),haMin=m=>new Date(Date.now()-m*60000).toISOString();
const CND={verificacoes:0,
  canais:[{id:CW,tipo:'whatsapp',nome:'WhatsApp homologação',numero:'+55 16 90000-0001',provedor:'evolution',instancia:'homolog',estado:'desconectado',estado_exibido:'desconectado',ativo:true,principal:true,reserva:false,silencio_max_min:120,ultima_mensagem_recebida_em:haMin(50),ultima_verificacao_em:haMin(1)},
          {id:CR,tipo:'whatsapp',nome:'WhatsApp reserva',numero:'+55 16 90000-0002',provedor:'evolution',instancia:'homolog-reserva',estado:'conectado',estado_exibido:'conectado',ativo:false,principal:false,reserva:true,silencio_max_min:120,ultima_mensagem_recebida_em:null,ultima_verificacao_em:null},
          {id:CI,tipo:'instagram',nome:'Instagram (simulado)',numero:'@np.homologacao',provedor:'simulado',instancia:'ig-homolog',estado:'conectado',estado_exibido:'conectado',ativo:true,principal:true,reserva:false,silencio_max_min:240,ultima_mensagem_recebida_em:haMin(5),ultima_verificacao_em:haMin(1)}],
  fila:[{id:'S1',canal_id:CW,estado:'pendente',conteudo:'Bom dia! Recebemos o seu contrato.',destino:'+55 16 98800-0101',conversa_ref:null,tentativas:0,erro:null,origem:'automacao',created_at:haMin(8),proxima_tentativa_em:haMin(8)},
        {id:'S2',canal_id:CW,estado:'falhou',conteudo:'Segue a proposta.',destino:'+55 16 98800-0102',conversa_ref:null,tentativas:5,erro:'Evolution respondeu 500',origem:'ia',created_at:haMin(90),proxima_tentativa_em:haMin(30)}],
  eventos:[{de:'conectado',para:'desconectado',detalhe:'Evolution: close',criado_em:haMin(12)},{de:'conectado',para:'conectado',detalhe:'Passou a ser o principal (por Ana)',criado_em:haMin(600)}],
  whk:[{id:31,canal_id:CW,id_externo:'3EB0C4F1',tipo:'mensagem',recebido_em:haMin(20),processado_em:null,tentativas:0,erro:null},
       {id:32,canal_id:CW,id_externo:'conexao:close',tipo:'conexao',recebido_em:haMin(12),processado_em:haMin(12),tentativas:0,erro:null},
       {id:33,canal_id:CW,id_externo:'3EB0F310',tipo:'mensagem',recebido_em:haMin(10),processado_em:null,tentativas:5,erro:'payload inválido'}],
  alertas:[{id:41,tipo:'canal_caiu',nivel:'critico',mensagem:'WhatsApp homologação (+55 16 90000-0001) está desconectado.',aberto_em:haMin(12),resolvido_em:null,notificado_em:haMin(11)},
           {id:42,tipo:'automacao_falhou',nivel:'aviso',mensagem:'Automação com erro na última hora.',aberto_em:haMin(30),resolvido_em:null,notificado_em:null}]};
const KBD={arts:[
  {id:'K-A1',titulo:'Procedimento geral do banco',todas_filas:true,quando_usar:'Sempre que o cliente pedir retorno.',passos:['Passo um','Passo dois'],cuidados:'Não prometer prazo.',quando_escalar:null,resposta_rapida:'/boasvindas',versao:2,ativo:true,atualizado_por:ADM,updated_at:'2026-11-10T10:00:00Z',base_artigo_filas:[]},
  {id:'K-A2',titulo:'Passivos: renegociação',todas_filas:false,quando_usar:'Cliente quer renegociar.',passos:['Ver a dívida'],cuidados:null,quando_escalar:null,resposta_rapida:null,versao:1,ativo:true,atualizado_por:LID,updated_at:'2026-11-11T10:00:00Z',base_artigo_filas:[{fila_ref:'passivos'}]},
  {id:'K-A3',titulo:'Triagem: primeiro contato',todas_filas:false,quando_usar:'Primeira mensagem.',passos:['Cumprimentar'],cuidados:null,quando_escalar:null,resposta_rapida:null,versao:1,ativo:true,atualizado_por:ADM,updated_at:'2026-11-11T10:00:00Z',base_artigo_filas:[{fila_ref:'triagem'}]},
  {id:'K-X1',titulo:'Procedimento excluído antigo',todas_filas:true,quando_usar:'Antigo.',passos:['x'],cuidados:null,quando_escalar:null,resposta_rapida:null,versao:2,ativo:false,atualizado_por:ADM,updated_at:'2026-11-09T10:00:00Z',base_artigo_filas:[]}],
  hist:[{id:5,versao:2,acao:'alterado',dados:{titulo:'Procedimento geral do banco',todas_filas:true,filas:[],passos:['Passo um','Passo dois']},user_id:ADM,criado_em:'2026-11-10T10:00:00Z'},
        {id:4,versao:1,acao:'criado',dados:{titulo:'Procedimento geral (primeira versão)',todas_filas:true,filas:[],passos:['Passo antigo']},user_id:LID,criado_em:'2026-11-09T10:00:00Z'}]};
const writes=[];
const rpcs=[],funcs=[];
const usuario=id=>({id,email:(DBS.equipe.find(p=>p.user_id===id)||{email:'novo@x'}).email,factors:DBS.fatores[id]||[]});

(async()=>{
  let br;for(const o of [process.env.PW_CANAL?{channel:process.env.PW_CANAL}:{},{channel:'msedge'},{channel:'chrome'}]){try{br=await chromium.launch(o);break}catch(e){}}
  if(!br)throw new Error('nenhum navegador disponível');
  const pg=await br.newPage({viewport:{width:1400,height:900}});const errs=[];globalThis.__errs=errs;
  pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));
  await pg.route(BASE+'/**',async r=>{
    const req=r.request(),u=new URL(req.url()),h=req.headers(),p=u.pathname,m=req.method(),body=()=>JSON.parse(req.postData()||'{}');
    const j=(x,s=200)=>r.fulfill({status:s,contentType:'application/json',body:JSON.stringify(x)}),erro=(msg,s=400)=>j({message:msg},s);
    // ---- Auth
    if(p==='/auth/v1/token'){const b=body();if(b.password!=='certa')return j({error:'invalid_grant',error_description:'Invalid login credentials'},400);
      DBS.eu=b.email==='admin@homolog.test'?ADM:LID;return j({access_token:'TK',refresh_token:'RT',expires_in:3600,user:usuario(DBS.eu)})}
    if(p==='/auth/v1/user'&&m==='GET')return j(usuario(DBS.eu));
    if(p==='/auth/v1/user'&&m==='PUT'){funcs.push(['senha',body().password]);return j(usuario(DBS.eu))}
    if(p==='/auth/v1/recover'){funcs.push(['recover',body().email,u.searchParams.get('redirect_to')]);return j({})}
    if(p.startsWith('/auth/v1/factors')){funcs.push(['mfa',p]);return j({})}   // o app não deve mais chamar
    if(p==='/auth/v1/logout')return r.fulfill({status:204,body:''});
    // ---- Edge Function
    if(p==='/functions/v1/fluxos-ia'){funcs.push(['fluxos-ia',body(),h.authorization]);return j({nome:'Follow-up pela IA',resumo:'Espera 2 dias e cria tarefa.',avisos:['Confira o responsável.'],
      definicao:{gatilhos:[{id:'g1',tipo:'etapa_mudou',cfg:{funil:'pj',etapa:'Proposta enviada'}}],passos:[{id:'p1',tipo:'aguardar',cfg:{quantidade:2,unidade:'dias'}},{id:'p2',tipo:'criar_tarefa',cfg:{titulo:'Ligar para o cliente',responsavel:ADM,em_horas:24}}]}})}
    if(p==='/functions/v1/canais-conectar'){const b=body();funcs.push(['canais-conectar',b,h.authorization]);const c=CND.canais.find(x=>x.id===b.canal_id);
      if(b.acao==='qr'){c.estado=c.estado_exibido='aguardando_qr';return j({conectado:false,qr:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',codigo:'WZYEH1YY'})}
      CND.verificacoes++;if(CND.verificacoes>=2){c.estado=c.estado_exibido='conectado'}return j({estado:c.estado,mudou:c.estado==='conectado',detalhe:'Evolution'})}
    if(p==='/functions/v1/usuarios-convite'){funcs.push(['convite',body(),h.authorization]);return j({user_id:NOVO,convidado:true})}
    // ---- REST
    if(p.startsWith('/rest/v1/')&&(h['accept-profile']!=='crm'||h.authorization!=='Bearer TK'||h.apikey!=='sb_publishable_teste'))return erro('cabeçalhos errados',401);
    if(p==='/rest/v1/acessos')return j(DBS.eu===ADM?[{area:'admin',papel:'admin'}]:[{area:'gestao',papel:'lider'},{area:'atendimento',papel:'lider'}]);
    if(p==='/rest/v1/filas_config')return j(DBS.filas);
    if(p==='/rest/v1/tags')return j(DBS.tags);
    if(p==='/rest/v1/fila_membros')return j(DBS.equipe.flatMap(x=>x.filas.map(f=>({fila_ref:f,user_id:x.user_id}))));
    if(p==='/rest/v1/respostas_rapidas')return j(DBS.respostas);
    if(p==='/rest/v1/config')return j(DBS.config);
    if(['/rest/v1/funis','/rest/v1/funil_etapas','/rest/v1/origens','/rest/v1/motivos_perda','/rest/v1/campos_personalizados','/rest/v1/negocios','/rest/v1/atividades','/rest/v1/respostas_formulario'].includes(p)){
      const tab=p.slice(9),lista={funis:CRMD.funis,funil_etapas:CRMD.etapas,origens:CRMD.origens,motivos_perda:CRMD.perdas,campos_personalizados:CRMD.campos,negocios:CRMD.negocios,atividades:CRMD.atividades,respostas_formulario:CRMD.formulario}[tab];
      if(m==='GET')return j(+(u.searchParams.get('offset')||0)>0?[]:lista);
      const id=(u.searchParams.get('id')||'').replace('eq.','');writes.push([m,tab,id,m==='DELETE'?null:body(),h.prefer]);
      if(m==='DELETE')return j([]);   // RLS: atendente/líder sem permissão -> nada apagado
      if(m==='POST'){const x={id:'T'+(lista.length+1),concluida:false,origem:'manual',...body()};lista.push(x);return j([x],201)}
      const x=lista.find(y=>y.id===id);if(!x)return j([]);Object.assign(x,body());return j([x])}
    if(p==='/rest/v1/tarefas')return j(DBS.eu===ADM?[{id:'K1',titulo:'Ligar para o Marcos',descricao:'Sobre a proposta',quando:'2026-01-10T13:00:00Z',criado_por:LID,conversa_ref:'c1',contato_nome:'Marcos Tavares',contato_telefone:'+55 16 98800-0101',concluida:false}]:[]);
    if(p==='/rest/v1/fluxos')return j([{id:'FX1',nome:'Fluxo do banco',descricao:null,status:'publicado',definicao:{gatilhos:[{id:'g1',tipo:'tag_adicionada',cfg:{tag:'PJ'}}],passos:[{id:'p1',tipo:'transferir',cfg:{fila:'passivos'}}]},configuracoes:{},pasta_id:null,versao_publicada:1,updated_at:'2026-11-10T10:00:00Z',created_at:'2026-11-01T10:00:00Z',excluido_em:null}]);
    if(p==='/rest/v1/fluxo_pastas')return j([]);
    if(p==='/rest/v1/importacoes')return j([{id:'IMP0',lote:'Lote antigo',arquivo:'a.csv',status:'concluida',criados:3,atualizados:0,ignorados:1,created_at:new Date().toISOString()}]);
    if(p==='/rest/v1/fluxo_registros')return j([{criado_em:'2026-11-12T10:01:00Z',contato_nome:'Joana Lima',passo_tipo:'transferir',resultado:'pulado',detalhe:'sem atendimento vinculado (passo 2)'}]);
    if(p==='/rest/v1/avisos')return j(DBS.eu===LID?[{id:7,texto:'Negócio ganho! · Carla Mendes (fluxo “Aviso”)',criado_em:'2026-11-12T11:00:00Z',lido_em:DBS.avisoLido?'2026-11-12T12:00:00Z':null}]:[]);
    if(p==='/rest/v1/agentes')return j([...DBS.agentesExtra,{id:AG,slug:'instagram',nome:'Agente Instagram',canal:'instagram',tipos:['mensagem','comentario'],modelo:'claude-opus-5-5',limite_diario:200,instrucoes:'Seja breve.',arquivado_em:null,ativo:true,modo:'rascunho',requer_vinculo:false,responde_sozinho:'Dúvidas frequentes',transfere_quando:'Valores',captacao:'Pede nome',base_conhecimento:'FAQ',destino_registro:'Revisão'}]);
    if(p==='/rest/v1/revisoes_ia')return j([{id:RV,agente_id:AG,status:DBS.revisao,contato:'instagram:9',contato_nome:'@teste.banco',mensagem_cliente:'Como funciona?',rascunho:'Olá! Sou o assistente virtual.',texto_final:DBS.revisao==='pendente'?null:'Olá! Sou o assistente virtual.',motivo:'triagem',created_at:'2026-11-12T10:00:00Z'}]);
    if(p==='/rest/v1/regras_ia')return j([{id:'RG1',agente_id:null,tipo:'proibido',regra:'Prometer resultado.',fonte:'Provimento 205/2021',validada_em:'2026-11-11T12:00:00Z',validada_por:ADM,substitui_id:null},...DBS.regrasExtra]);
    if(p==='/rest/v1/resumos_semanais')return j([]);
    if(p==='/rest/v1/base_artigos'){if(!/base_artigo_filas\(fila_ref\)/.test(u.searchParams.get('select')||''))return erro('sem as filas',400);
      return j(+(u.searchParams.get('offset')||0)>0?[]:KBD.arts.filter(x=>x.ativo||DBS.eu===ADM))}
    if(p==='/rest/v1/base_artigo_historico')return j(u.searchParams.get('artigo_id')==='eq.K-A1'?KBD.hist:[]);
    if(p==='/rest/v1/canais_status')return j(CND.canais);
    if(p==='/rest/v1/saida_mensagens')return j(CND.fila);
    if(p==='/rest/v1/canal_eventos')return j(u.searchParams.get('canal_id')==='eq.'+CW?CND.eventos:[]);
    if(p==='/rest/v1/webhook_eventos')return j(CND.whk);
    if(p==='/rest/v1/alertas')return j(CND.alertas);
    if(p.startsWith('/rest/v1/rpc/')){const fn=p.slice(13),a=body();rpcs.push([fn,a]);
      switch(fn){
        case 'registrar_presenca':return j(true);
        case 'equipe':return j(DBS.equipe);
        case 'ia_indicadores':return j([]);
        case 'ia_aprovar':DBS.revisao='aprovada';return j('44444444-4444-4444-4444-444444444444');
        case 'agente_ativar':return erro('nenhum canal instagram ativo: conecte o canal antes de ligar o agente');
        case 'agente_salvar':{if(a.p_dados.nome==='Agente Instagram')return erro('já existe um agente com esse nome');
          DBS.agentesExtra.push({id:'AG2',slug:'ag-x',nome:a.p_dados.nome,canal:a.p_dados.canal,tipos:a.p_dados.tipos,modelo:a.p_dados.modelo,limite_diario:a.p_dados.limite_diario,instrucoes:a.p_dados.instrucoes,
            arquivado_em:null,ativo:false,modo:'rascunho',requer_vinculo:false,responde_sozinho:a.p_dados.responde_sozinho,transfere_quando:a.p_dados.transfere_quando,captacao:null,base_conhecimento:null,destino_registro:null});return j('AG2')}
        case 'agente_arquivar':{const x=DBS.agentesExtra.find(y=>y.id===a.p_id);if(x){x.arquivado_em='2026-11-18T12:00:00Z';x.ativo=false}return j(null)}
        case 'agente_restaurar':{const x=DBS.agentesExtra.find(y=>y.id===a.p_id);if(x)x.arquivado_em=null;return j(null)}
        case 'regra_salvar':DBS.regrasExtra.push({id:'RG2',agente_id:a.p_agente,tipo:a.p_tipo,regra:a.p_regra,fonte:a.p_fonte,validada_em:null,validada_por:null,substitui_id:a.p_id});return j('RG2');
        case 'regra_validar':{const x=DBS.regrasExtra.find(y=>y.id===a.p_id);if(x){x.validada_em='2026-11-18T12:00:00Z';x.validada_por=ADM}return j(null)}
        case 'usuario_salvar':{if(a.p_user===NOVO&&!DBS.equipe.some(x=>x.user_id===NOVO))DBS.equipe.push({user_id:NOVO,nome:a.p_nome,email:a.p_email,funcao:a.p_funcao,tipo:a.p_tipo,ve_todos:a.p_ve_todos,filas:a.p_filas||[],online:false,ultimo_acesso:null,visto_em:null});return j(null)}
        case 'usuario_encerrar_sessao':{const x=DBS.equipe.find(y=>y.user_id===a.p_user);if(x)x.online=false;return j(1)}
        case 'usuario_desativar':DBS.equipe=DBS.equipe.filter(y=>y.user_id!==a.p_user);return j({atendimentos:2,negocios:1});
        case 'fila_salvar':{if(a.p_abre>=a.p_fecha)return erro('o horário de abertura precisa ser antes do fechamento');const f=DBS.filas.find(x=>x.fila_ref===a.p_ref);
          Object.assign(f,{dias:a.p_dias,abre:a.p_abre+':00',fecha:a.p_fecha+':00',sla_primeira_min:a.p_sla,sla_retorno_min:a.p_ret,lider_id:a.p_lider});return j(null)}
        case 'fila_criar':DBS.filas.push({fila_ref:'previdenciario',nome:a.p_nome,dias:'Seg–Sex',abre:'08:00:00',fecha:'18:00:00',sla_primeira_min:15,sla_retorno_min:120,lider_id:null});return j('previdenciario');
        case 'fila_rodizio':DBS.filas.find(x=>x.fila_ref===a.p_ref).rodizio_ativo=a.p_on;return j(null);
        case 'negocio_criar':{const n={id:'N9',funil_id:'F1',etapa_id:'E1',nome:a.p_nome,empresa:null,telefone:null,valor:a.p_valor,probabilidade:10,responsavel_id:DBS.eu,origem_id:(CRMD.origens.find(o=>o.nome===a.p_origem)||{}).id||null,previsao_fechamento:null,motivo_perda_id:null,etapa_max_ordem:1,conversa_ref:null,cliente_ref:null,externo_id:null,campos:{}};CRMD.negocios.push(n);return j('N9')}
        case 'crm_tempo_etapas':return j([{etapa_id:'E1',dias:6.5,negocios:3}]);
        case 'campo_criar':CRMD.campos.push({chave:'divida',nome:a.p_nome,tipo:a.p_tipo,opcoes:a.p_opcoes});return j('divida');
        case 'campo_excluir':CRMD.campos=CRMD.campos.filter(c=>c.chave!==a.p_chave);return j(null);
        case 'tarefa_criar':return j('K9');
        case 'tarefa_concluir':return j(null);
        case 'importacao_iniciar':return j('IMP1');
        case 'importacao_processar':return j({criados:a.p_linhas.filter(x=>x.act!=='ignorar').length,atualizados:0,ignorados:a.p_linhas.filter(x=>x.act==='ignorar').length});
        case 'importacao_concluir':return j({criados:6,atualizados:0,ignorados:1,lote:'GCV nov/2026'});
        case 'importacao_desfazer':return j(3);
        case 'fluxo_contagens':return j([{fluxo_id:'FX1',inscritos:12,ativos:3}]);
        case 'fluxo_inscricoes_de':return j([{id:'I1',contato_nome:'Joana Lima',contato:'whatsapp:16977770001',estado:'esperando_resposta',passo_tipo:'aguardar_resposta',proximo_em:'2026-11-19T10:00:00Z',erro:null,criado_em:'2026-11-12T10:00:00Z'},
          {id:'I2',contato_nome:'Rui',contato:'whatsapp:16955550001',estado:'concluida',passo_tipo:null,proximo_em:null,erro:null,criado_em:'2026-11-12T09:00:00Z'}]);
        case 'fluxo_inscricao_remover':return j(null);
        case 'aviso_lido':DBS.avisoLido=true;return j(null);
        case 'fluxo_salvar':return j(a.p_id||'FX9');
        case 'fluxo_publicar':return j(1);
        case 'tag_salvar':{const t=DBS.tags.find(x=>x.nome.toLowerCase()===a.p_nome.toLowerCase());if(t)t.cor=a.p_cor;else DBS.tags.push({nome:a.p_nome,cor:a.p_cor});return j(t?t.nome:a.p_nome)}
        case 'resposta_criar':DBS.respostas.push({atalho:a.p_atalho,texto:a.p_texto,criada_por:DBS.eu});return j(a.p_atalho);
        case 'resposta_excluir':DBS.respostas=DBS.respostas.filter(x=>x.atalho!==a.p_atalho);return j(null);
        case 'salvar_artigo':{if(a.p_titulo==='Erro')return erro('sem permissão para gravar procedimento nestas filas');
          const x={id:a.p_id||'K-N1',titulo:a.p_titulo,todas_filas:a.p_todas_filas,quando_usar:a.p_quando_usar,passos:a.p_passos,cuidados:a.p_cuidados,quando_escalar:a.p_quando_escalar,resposta_rapida:a.p_resposta_rapida,versao:1,ativo:true,atualizado_por:DBS.eu,updated_at:agoraIso(),base_artigo_filas:(a.p_filas||[]).map(f=>({fila_ref:f}))};
          const i=KBD.arts.findIndex(y=>y.id===x.id);if(i>=0)KBD.arts[i]=x;else KBD.arts.push(x);return j(x.id)}
        case 'excluir_artigo':KBD.arts.find(y=>y.id===a.p_id).ativo=false;return j(null);
        case 'restaurar_artigo':KBD.arts.find(y=>y.id===a.p_id).ativo=true;return j(null);
        case 'painel_gestor':{if(a.p_de==='erro')return erro('x');const lid=DBS.eu!==ADM,z={abertos:0,sem_responsavel:0,atrasados:0,novos:0,resolvidos:0,primeira_resposta_media_min:null,no_prazo_pct:null};
          if(DBS.painelErro)return erro('período inválido: escolha até um ano');
          return j({de:a.p_de,ate:a.p_ate,gerado_em:agoraIso(),todas_filas:!lid,filas:lid?[{fila:'comercial',nome:'Comercial'}]:[{fila:'comercial',nome:'Comercial'},{fila:'passivos',nome:'Gestão de Passivos PJ'}],
            agora:lid?{abertos:0,sem_responsavel:0,atrasados:0,perto_do_prazo:0,aguardando_cliente:0}:{abertos:7,sem_responsavel:2,atrasados:3,perto_do_prazo:1,aguardando_cliente:1},
            periodo:lid?{novos:0,resolvidos:0,respondidos:0,primeira_resposta_media_min:null,no_prazo_pct:null}:{novos:20,resolvidos:13,respondidos:18,primeira_resposta_media_min:9,no_prazo_pct:72},
            por_fila:lid?[{fila:'comercial',nome:'Comercial',sla_min:10,...z}]:[{fila:'comercial',nome:'Comercial',sla_min:10,...z},{fila:'passivos',nome:'Gestão de Passivos PJ',sla_min:15,abertos:7,sem_responsavel:2,atrasados:3,novos:20,resolvidos:13,primeira_resposta_media_min:9,no_prazo_pct:72}],
            por_pessoa:lid?[]:[{user_id:ATD,nome:'Atendente Teste',online:true,abertos:5,atrasados:3,resolvidos:8,primeira_resposta_media_min:7}],
            por_canal:['whatsapp','instagram','google'].map((c,i)=>({canal:c,abertos:lid?0:[6,1,0][i],atrasados:lid?0:[3,0,0][i],novos:lid?0:[17,3,0][i],resolvidos:lid?0:[11,2,0][i]})),
            comercial:{novos:4,novos_valor:60000,ganhos:1,ganhos_valor:15000,perdidos:1,conversao_pct:50,abertos:3,abertos_valor:45000,previsto_valor:12500,
              por_etapa:['Novo lead','Em contato','Qualificado','Reunião agendada','Proposta enviada','Negociação'].map((e,i)=>({etapa:e,qtd:i<3?1:0,valor:i<3?15000:0})),
              motivos_perda:[{motivo:'Sem resposta',qtd:1}],por_origem:[{origem:'Meta Ads',novos:4,ganhos:1,perdidos:1,ganhos_valor:15000}]}})}
        case 'saude_resumo':return j({canais:[],fila:{pendentes:CND.fila.filter(x=>x.estado==='pendente').length,enviando:0,falhou:CND.fila.filter(x=>x.estado==='falhou').length,mais_antiga_min:8,tempo_medio_envio_seg:4},
          webhook:{nao_processados:2,com_erro:1},alertas_abertos:CND.alertas.filter(a=>!a.resolvido_em).map(({id,tipo,nivel,mensagem,aberto_em})=>({id,tipo,nivel,mensagem,aberto_em}))});
        case 'relatorio_diario':return j({dia:'2026-11-16',recebidas:14,enviadas:9,falhas:1,primeira_resposta_media_min:6});
        case 'alerta_visto':{const x=CND.alertas.find(y=>y.id===a.p_id);if(!x||x.tipo!=='automacao_falhou')return erro('este alerta se resolve sozinho quando o problema some');x.resolvido_em=agoraIso();return j(null)}
        case 'saida_reenviar':{const x=CND.fila.find(y=>y.id===a.p_id);x.estado='pendente';x.tentativas=0;x.erro=null;return j(null)}
        case 'saida_cancelar':CND.fila=CND.fila.filter(y=>y.id!==a.p_id);return j(null);
        case 'webhook_reprocessar':{const x=CND.whk.find(y=>y.id===a.p_id);x.erro=null;x.tentativas=0;return j(null)}
        case 'canal_salvar':{if(a.p_provedor==='evolution'&&!a.p_instancia)return erro('informe o nome da instância na Evolution');
          if(!a.p_id){CND.canais.push({id:'c0000000-0000-4000-8000-000000000009',tipo:a.p_tipo,nome:a.p_nome,numero:a.p_numero,provedor:a.p_provedor,instancia:a.p_instancia,estado:'desconectado',estado_exibido:'desconectado',ativo:false,principal:false,reserva:a.p_reserva,silencio_max_min:a.p_silencio_max_min,ultima_mensagem_recebida_em:null,ultima_verificacao_em:null});return j('c0000000-0000-4000-8000-000000000009')}
          Object.assign(CND.canais.find(x=>x.id===a.p_id),{nome:a.p_nome,numero:a.p_numero,silencio_max_min:a.p_silencio_max_min});return j(a.p_id)}
        case 'canal_ativar':CND.canais.find(x=>x.id===a.p_id).ativo=a.p_ativo;return j(null);
        case 'canal_tornar_principal':{const c=CND.canais.find(x=>x.id===a.p_id),ant=CND.canais.find(x=>x.tipo===c.tipo&&x.principal&&x.ativo);let n=0;
          if(ant){ant.principal=false;ant.ativo=false;CND.fila.filter(f=>f.canal_id===ant.id).forEach(f=>{f.canal_id=c.id;n++})}c.principal=true;c.ativo=true;return j(n)}
        case 'ausencia_salvar':DBS.config[0].valor={on:a.p_on,text:a.p_texto};return j(null);
      }
      return j(null)}
    return erro('rota não simulada '+m+' '+p,404);
  });
  const ok=(c,n)=>{console.log((c?'  ok   ':'  FALHA ')+n);if(!c)process.exitCode=1};
  const toast=async()=>{await pg.waitForTimeout(250);return pg.$eval('#toast',e=>e.textContent)};
  const rpc=fn=>rpcs.filter(x=>x[0]===fn).pop();
  const url=require('url').pathToFileURL(path.join(out,'con.html')).href;

  console.log('— login como líder');
  await pg.goto(url);
  ok(await pg.isHidden('#login .demo'),'acesso de demonstração escondido');ok(await pg.isHidden('#role'),'seletor "Ver como" escondido');
  await pg.fill('#le','lider@homolog.test');await pg.fill('#lp','errada');await pg.click('#lgf button[type=submit]');await pg.waitForTimeout(200);
  ok(/incorretos/.test(await pg.textContent('#lerr')),'senha errada recusada');
  await pg.fill('#lp','certa');await pg.click('#lgf button[type=submit]');await pg.waitForTimeout(400);
  const tabs=await pg.$$eval('#rail button',b=>b.map(x=>x.dataset.v));ok(tabs.includes('ia')&&!tabs.includes('cfg'),'papel líder vindo de crm.acessos: '+tabs);
  ok(tabs.includes('crm'),'líder da fila Comercial vê o CRM');
  ok(rpc('registrar_presenca')&&rpc('registrar_presenca')[1].p_login===true,'presença registrada no login');
  await pg.click('[data-act=qmenu]');ok(/Minha fila\s*Líder Teste/.test(await pg.textContent('.qmenu')),'“Minha fila” mostra o nome do perfil do banco');await pg.click('[data-act=qmenu]');
  ok(/Já usam o banco: login, equipe/.test(await pg.textContent('#ambbar')),'aviso de ambiente');
  ok(/Menções\s*1/.test(await pg.textContent('.qbtn'))&&/Negócio ganho/.test(await pg.textContent('#list')),'com menção pendente, o login abre na fila Menções');
  await pg.click('[data-act=qmenu]');await pg.click('[data-act=queue][data-id=minha]');
  // resposta rápida criada pela caixa de mensagem
  await pg.click('.it');await pg.click('[data-act=quickToggle]');ok(/\/boasvindas/.test(await pg.textContent('.quick'))&&!/\/dados/.test(await pg.textContent('.quick')),'respostas rápidas vêm do banco');
  await pg.click('[data-act=newQuick]');await pg.fill('#qn','prazo');await pg.fill('#qt','O prazo é [data].');await pg.click('[data-act=saveQuick]');
  ok(/criada para toda a equipe/.test(await toast())&&rpc('resposta_criar')[1].p_atalho==='/prazo','resposta rápida gravada no banco');
  // agentes de IA
  await pg.click('#rail [data-v=ia]');await pg.waitForTimeout(300);
  ok(/Conectado ao banco \(Homologação\)/.test(await pg.textContent('#ia')),'aba de IA conectada');
  await pg.click('[data-fld=agon]');ok(/nenhum canal instagram ativo/i.test(await toast()),'erro do banco aparece ao ligar o agente');
  await pg.click('[data-x=iatab][data-v=rev]');await pg.click('[data-x=iaok]');await pg.waitForTimeout(300);
  ok(rpc('ia_aprovar')&&rpc('ia_aprovar')[1].p_id===RV,'aprovar chama crm.ia_aprovar');
  await pg.click('[data-x=iatab][data-v=agentes]');ok(!(await pg.$('[data-ia=novo]'))&&!(await pg.$('[data-ia=editar]'))&&!(await pg.$('[data-ia=excluir]')),'líder não cria, edita nem exclui agentes');
  await pg.click('[data-x=iatab][data-v=regras]');ok(!(await pg.$('[data-ia=rnova]'))&&/Só o administrador cria, edita e valida/.test(await pg.textContent('#ia'))&&/Validada em 11\/11\/2026/.test(await pg.textContent('#ia')),'líder vê as regras e quando foram validadas, sem editar');

  console.log('— tarefas (líder fora do comercial)');
  ok(!(await pg.$$eval('#rail button',b=>b.map(x=>x.dataset.v))).includes('tarefas'),'líder fora da fila Comercial não vê a aba Tarefas');
  await pg.click('#rail [data-v=atend]');await pg.click('.it');await pg.click('[data-act=chMenu]');await pg.click('[data-act=tray][data-v=task]');
  ok(JSON.stringify(await pg.$$eval('#tk-resp option',o=>o.map(x=>x.value)))==='["Ana Júlia Neves"]','responsáveis possíveis: admin e fila Comercial (vindo do banco)');
  await pg.fill('#tk-tit','Ligar sobre a proposta');await pg.fill('#tk-quando','2026-11-21T09:30');await pg.click('[data-tk=criar]');await pg.waitForTimeout(250);
  const tc=rpc('tarefa_criar');ok(tc&&tc[1].p_responsavel===ADM&&tc[1].p_titulo==='Ligar sobre a proposta'&&tc[1].p_quando===new Date('2026-11-21T09:30').toISOString()&&tc[1].p_contato_nome,'tarefa criada no banco para o admin: '+JSON.stringify(tc&&tc[1]));
  ok(/Só Ana vê a tarefa/.test(await toast()),'aviso de que só o responsável vê');

  console.log('— CRM conectado');
  const ultima=(m,tab)=>writes.filter(w=>w[0]===m&&w[1]===tab).pop();
  await pg.click('#rail [data-v=crm]');await pg.waitForTimeout(300);
  let cx=await pg.textContent('#crm');
  ok(/Conectado ao banco \(Homologação\)/.test(cx)&&/Cliente Real Um/.test(cx)&&!/Padaria Estrela/.test(cx),'negócios vêm do banco (sem os da demonstração)');
  ok(!(await pg.$('.pipes'))&&!/Superendividamento|Acordos/.test(cx),'um funil só: sem abas de funil');
  ok(!(await pg.$('#fown'))&&!/Dono/.test(cx)&&!/Líder Teste/.test(await pg.textContent('.kan')),'sem divisão por dono: sem filtro e sem dono nos cartões');
  ok(await pg.isEnabled('text=⬆ Importar leads'),'importação de leads ligada ao banco');
  await pg.click('.deal[data-id=N1]');await pg.selectOption('[data-x-sel=stage]','Qualificado');await pg.waitForTimeout(250);
  let w=ultima('PATCH','negocios');ok(w&&w[2]==='N1'&&w[3].etapa_id==='E3'&&/return=representation/.test(w[4]),'mudar etapa grava etapa_id no banco: '+JSON.stringify(w));
  ok(/Cliente Real Um → Qualificado/.test(await toast()),'aviso da mudança de etapa');
  await pg.fill('[data-fld=lead][data-f=valor]','25000');await pg.press('[data-fld=lead][data-f=valor]','Tab');await pg.waitForTimeout(250);
  w=ultima('PATCH','negocios');ok(w&&w[3].valor===25000,'valor gravado');
  await pg.selectOption('[data-fld=lead][data-f=origem]','Indicação');await pg.waitForTimeout(250);
  w=ultima('PATCH','negocios');ok(w&&w[3].origem_id==='O2','origem gravada pelo id');
  await pg.fill('[data-fld=leadc][data-f=banco]','Banco B');await pg.press('[data-fld=leadc][data-f=banco]','Tab');await pg.waitForTimeout(250);
  w=ultima('PATCH','negocios');ok(w&&w[3].campos&&w[3].campos.banco==='Banco B','campo personalizado gravado');
  await pg.click('[data-x=lose][data-id=N1]');await pg.selectOption('#perdasel','Fora do perfil');await pg.click('[data-x=perdaok]');await pg.waitForTimeout(250);
  w=ultima('PATCH','negocios');ok(w&&w[3].etapa_id==='E8'&&w[3].motivo_perda_id==='P2','perder grava a etapa e o motivo');
  await pg.click('[data-x=crmside][data-v=form]');ok(/Quantos bancos\?/.test(await pg.textContent('.drawer')),'respostas do formulário vêm do banco');
  await pg.click('[data-x=crmside][data-v=ativ]');ok(/Ligar para o cliente/.test(await pg.textContent('.drawer')),'atividades vêm do banco');
  await pg.fill('#tkd','2026-11-21T09:30');await pg.fill('#tkn','Enviar proposta');await pg.click('[data-x=taskadd]');await pg.waitForTimeout(250);
  w=ultima('POST','atividades');ok(w&&w[3].tipo==='ligacao'&&w[3].titulo==='Enviar proposta'&&w[3].quando===new Date('2026-11-21T09:30').toISOString()&&w[3].responsavel_id===LID,'atividade criada no banco: '+JSON.stringify(w&&w[3]));
  await pg.click('[data-x=taskdel][data-t=T1]');ok(/Só líder ou administrador/.test(await toast()),'exclusão negada pelo banco aparece como aviso');
  await pg.check('[data-x-chk=T1]');await pg.waitForTimeout(250);w=ultima('PATCH','atividades');ok(w&&w[2]==='T1'&&w[3].concluida===true,'concluir atividade');
  await pg.click('[data-x=dealclose]');
  await pg.click('[data-x=dealnew]');await pg.fill('#ndn','Novo Cliente');await pg.fill('#ndv','5000');await pg.selectOption('#ndo','Meta Ads');await pg.click('[data-x=dealcreate]');await pg.waitForTimeout(300);
  const nc=rpc('negocio_criar');ok(nc&&nc[1].p_funil==='pj'&&nc[1].p_nome==='Novo Cliente'&&nc[1].p_valor===5000&&nc[1].p_origem==='Meta Ads','novo negócio pelo banco');
  ok(/Novo Cliente/.test(await pg.textContent('.drawer')),'negócio novo aberto no painel');
  ok(await pg.$('.col.rec[data-stage=Ganho]')&&await pg.$('.col.rec[data-stage=Perdido]')&&!(await pg.$('.deal[data-id=N2]')),'Ganho e Perdido começam recolhidas');
  ok(await pg.$$eval(".col",c=>c.map(x=>x.getAttribute("style")).join("|")).then(v=>v.includes("var(--st-1)")&&v.includes("var(--st-2)")&&v.includes("var(--st-ganho)")&&v.includes("var(--st-perdido)")),"cada etapa com a sua cor");
  await pg.click('[data-x=colrec][data-v=Ganho]');ok(await pg.isVisible('.deal[data-id=N2]')&&await pg.getAttribute('[data-x=colrec][data-v=Ganho]','aria-expanded')==='true','expandir a etapa mostra os negócios');
  await pg.click('[data-x=colrec][data-v="Novo lead"]');ok(await pg.$('.col.rec[data-stage="Novo lead"]')&&/Expandir todas \(2 recolhidas\)/.test(await pg.textContent('#crm')),'recolher outra etapa');
  await pg.click('[data-x=colabrir]');ok(!(await pg.$('.col.rec')),'"Expandir todas"');
  await pg.click('.deal[data-id=N2]');await pg.click('[data-x=closedeal]');ok(/passo 2/.test(await pg.textContent('.modal')),'fechar contrato explica que depende do passo 2');await pg.click('[data-x=closeno]');
  await pg.click('[data-x=crmtab][data-v=rel]');await pg.waitForTimeout(300);ok(/6,5 d/.test(await pg.textContent('#crm')),'tempo médio por etapa vem do histórico do banco');
  await pg.click('[data-x=crmtab][data-v=funil]');await pg.click('[data-imp=open]');await pg.waitForTimeout(200);
  ok(/as linhas vão para o banco/.test(await pg.textContent('.modal'))&&/Importações anteriores \(1\)/.test(await pg.textContent('.modal')),'importação conectada, com o histórico de lotes');
  ok(!(await pg.$('[data-imp=desfazer]')),'só o administrador vê "Desfazer"');
  await pg.click('[data-imp=sample]');await pg.click('[data-imp=s2]');await pg.click('[data-imp=s3]');await pg.click('[data-imp=s4]');await pg.click('[data-imp=go]');await pg.waitForTimeout(500);
  const ini=rpc('importacao_iniciar'),pr=rpc('importacao_processar');
  ok(ini&&ini[1].p_funil==='pj'&&ini[1].p_disparar===false&&ini[1].p_total===7,'lote iniciado no banco: '+JSON.stringify(ini&&ini[1]));
  const lin=pr&&pr[1].p_linhas;
  ok(lin&&lin.length===7&&lin.find(x=>x.n===2).entrada==='2026-10-02'&&lin.find(x=>x.n===8).act==='ignorar'&&lin.find(x=>x.n===2).valor==='45000','linhas enviadas com a prévia (data, valor, ignoradas)');
  ok(rpc('importacao_concluir')&&/6 criados/.test(await toast()),'importação concluída no banco');
  await pg.screenshot({path:path.join(out,'conectado-crm.png'),fullPage:true});
  await pg.click('[data-x=crmtab][data-v=funil]');

  console.log('— fluxos de trabalho conectados');
  await pg.click('#rail [data-v=fluxos]');await pg.waitForTimeout(300);
  let fx=await pg.textContent('#fluxos');ok(/Fluxo do banco/.test(fx)&&!/Boas-vindas e triagem/.test(fx),'fluxos vêm do banco (sem os da demonstração)');
  ok(/Fluxo do banco\s*Publicado\s*12\s*3/.test(fx),'inscritos e ativos vêm do motor (crm.fluxo_contagens)');
  await pg.click('[data-fw=abrir][data-id=FX1]');await pg.click('[data-fw=aba][data-v=insc]');await pg.waitForTimeout(300);
  fx=await pg.textContent('#fluxos');ok(/Joana Lima/.test(fx)&&/Esperando resposta/.test(fx)&&/Aguardar resposta/.test(fx)&&/Concluído/.test(fx),'histórico de inscrições do banco, com o passo atual');
  await pg.click('[data-fw=tirar][data-id=I1]');await pg.waitForTimeout(300);ok(rpc('fluxo_inscricao_remover')&&rpc('fluxo_inscricao_remover')[1].p_id==='I1','tirar do fluxo chama o banco');
  await pg.click('[data-fw=aba][data-v=reg]');await pg.waitForTimeout(300);
  fx=await pg.textContent('#fluxos');ok(/Transferir para fila/.test(fx)&&/Pulado/.test(fx)&&/passo 2/.test(fx),'registros de execução do banco');
  await pg.click('[data-fw=voltar]');
  await pg.click('#rail [data-v=atend]');await pg.click('[data-act=qmenu]');await pg.click('[data-act=queue][data-id=mencoes]');await pg.waitForTimeout(200);
  ok(/Negócio ganho/.test(await pg.textContent('#list'))&&!(await pg.$('#avisosbtn')),'menção do banco na fila Menções (sem sino)');
  await pg.click('[data-av=lido]');await pg.waitForTimeout(300);ok(rpc('aviso_lido')&&rpc('aviso_lido')[1].p_id===7&&!/Negócio ganho/.test(await pg.textContent('#list')),'menção resolvida no banco');await pg.click('[data-act=qmenu]');await pg.click('[data-act=queue][data-id=minha]');
  await pg.click('#rail [data-v=fluxos]');await pg.waitForTimeout(200);
  await pg.click('[data-fw=novo]');await pg.click('[data-fw=add-gat]');await pg.click('[data-fw=pick][data-v=etapa_mudou]');
  ok(JSON.stringify(await pg.$$eval('[data-fw-cfg=funil] option',o=>o.map(x=>x.value)))==='["","pj"]','opções do acionador vêm do CRM do banco');
  await pg.selectOption('[data-fw-cfg=funil]','pj');await pg.selectOption('[data-fw-cfg=etapa]','Qualificado');await pg.waitForTimeout(1300);
  let fs1=rpcs.filter(x=>x[0]==='fluxo_salvar');ok(fs1.length>=1&&fs1[0][1].p_id===null&&fs1.at(-1)[1].p_definicao.gatilhos[0].cfg.etapa==='Qualificado','salvamento automático cria o fluxo no banco');
  ok(/Salvo/.test(await pg.textContent('#fxsalvo')),'aviso de salvo');
  await pg.click('[data-fw=ia]');await pg.fill('#fxiatxt','Depois da proposta, esperar 2 dias e criar tarefa de ligação para a Ana Júlia');await pg.click('[data-fw=ia-enviar]');await pg.waitForTimeout(300);
  const ia=funcs.find(x=>x[0]==='fluxos-ia');ok(ia&&ia[2]==='Bearer TK'&&ia[1].definicao&&ia[1].definicao.gatilhos[0].tipo==='etapa_mudou','IA chamada pela Edge Function com o fluxo atual');
  ok(/Follow-up pela IA/.test(await pg.textContent('.fx-ia'))&&/Confira o responsável/.test(await pg.textContent('.fx-ia')),'proposta da IA com resumo e avisos');
  await pg.click('[data-fw=ia-aplicar]');await pg.waitForTimeout(1300);
  fx=await pg.textContent('#fluxos');ok(/Aguardar/.test(fx)&&/Ligar para o cliente/.test(fx),'proposta aplicada no construtor');
  ok(rpcs.filter(x=>x[0]==='fluxo_salvar').at(-1)[1].p_id==='FX9','depois de criado, salva no mesmo fluxo');
  await pg.click('#fxpub');await pg.waitForTimeout(300);ok(rpc('fluxo_publicar')&&rpc('fluxo_publicar')[1].p_id==='FX9'&&rpc('fluxo_publicar')[1].p_publicar===true,'publicar no banco');
  await pg.screenshot({path:path.join(out,'conectado-fluxos.png'),fullPage:true});
  await pg.click('[data-fw=voltar]');

  console.log('— canais conectados (líder)');
  await pg.click('#rail [data-v=atend]');await pg.waitForTimeout(200);
  ok(/WhatsApp homologação · desconectado/.test(await pg.textContent('#cnresumo')),'resumo do cabeçalho mostra o canal do banco fora do ar');
  let fx5=await pg.textContent('#canais');
  ok(await pg.isVisible('#canais')&&/WhatsApp homologação/.test(fx5)&&/Instagram \(simulado\)/.test(fx5)&&!/WhatsApp do escritório/.test(fx5)&&!/WhatsApp reserva/.test(fx5),'faixa com os canais ativos do banco (sem os da demonstração, sem o reserva desligado)');
  ok(/Fila de saída: 1 aguardando · 1 com falha/.test(fx5),'contagem da fila de saída vem do banco');
  await pg.click('.it');ok(/WhatsApp homologação desconectado\. O que você enviar fica na fila \(1 aguardando\)/.test(await pg.textContent('.cn-aviso')),'aviso na caixa de mensagem com a fila real');
  await pg.click(`[data-cn=pop][data-id="${CW}"]`);await pg.waitForTimeout(300);
  fx5=await pg.textContent('.cn-pop');
  ok(/Evolution: close/.test(fx5)&&/sem mudança de estado/.test(fx5)&&/Passou a ser o principal/.test(fx5),'histórico do canal vem de canal_eventos');
  ok(!/Simular/.test(fx5),'sem botões de simulação no modo conectado');
  await pg.click('.cn-pop [data-cn=qr]');await pg.waitForTimeout(300);
  const qrc=funcs.find(x=>x[0]==='canais-conectar'&&x[1].acao==='qr');
  ok(qrc&&qrc[1].canal_id===CW&&qrc[2]==='Bearer TK','QR Code pedido pela Edge Function com o token do líder');
  ok(await pg.isVisible('img.qr-img')&&/WZYEH1YY/.test(await pg.textContent('.modal')),'QR Code real e código de pareamento na tela');
  await pg.waitForTimeout(9000);
  ok(CND.verificacoes>=2&&!(await pg.$('img.qr-img')),'a janela confere o estado e fecha sozinha quando conecta');
  ok(/conectado\. A fila de saída volta a andar/.test(await pg.textContent('#toast')),'aviso de canal conectado');
  ok(/Canais ok · 1 na fila · 1 com falha/.test(await pg.textContent('#cnresumo')),'resumo volta a "Canais ok" com a fila real');
  ok(!(await pg.$('.cn-aviso')),'aviso da caixa de mensagem some');

  console.log('— Base de conhecimento conectada (líder)');
  await pg.click('[data-act=tab][data-v=base]');await pg.waitForTimeout(200);
  let kb=await pg.textContent('#side');
  ok(/Procedimento geral do banco/.test(kb)&&!/Pedir os dados para a documentação inicial/.test(kb)&&!/excluído antigo/.test(kb),'procedimentos vêm do banco (sem os de demonstração nem os excluídos)');
  await pg.check('[data-kb=todas]');await pg.waitForTimeout(100);kb=await pg.textContent('#side');
  ok(/Passivos: renegociação/.test(kb)&&/Triagem: primeiro contato/.test(kb)&&!/Ver excluídos/.test(kb),'líder vê a base inteira, sem a lista de excluídos');
  await pg.click('[data-act=kb][data-id=K-A3]');ok(!(await pg.$('[data-kb=editar]')),'líder não edita procedimento de fila que não lidera');
  await pg.click('[data-act=kb][data-id=""]');await pg.click('[data-act=kb][data-id=K-A1]');
  kb=await pg.textContent('#side');ok(/Atualizado por Ana Júlia Neves em 10\/11\/2026/.test(kb)&&/Passo dois/.test(kb)&&!(await pg.$('[data-kb=editar]')),'detalhe com o autor pelo nome; procedimento geral só o administrador edita');
  await pg.click('[data-kb=hist]');await pg.waitForTimeout(300);kb=await pg.textContent('.kb-hist');
  ok(/v2 · Alterado por Ana Júlia Neves/.test(kb)&&/v1 · Criado por Líder Teste/.test(kb),'histórico de versões com quem fez');
  await pg.click('[data-kb=versao][data-id="4"]');ok(/Versão 1 · Procedimento geral \(primeira versão\)/.test(await pg.textContent('.kb-foto'))&&/Passo antigo/.test(await pg.textContent('.kb-foto')),'ver como estava uma versão antiga');
  await pg.click('[data-act=kb][data-id=""]');await pg.click('[data-kb=novo]');
  ok(await pg.isDisabled('input[name=kbonde][value=todas]')&&JSON.stringify(await pg.$$eval('[data-kbfila]',x=>x.map(y=>y.dataset.kbfila)))==='["passivos","comercial"]','líder cria só nas filas que lidera');
  await pg.fill('#kbt','Erro');await pg.fill('#kbw','Teste');await pg.click('[data-kb=salvar]');await pg.waitForTimeout(250);
  ok(/sem permissão para gravar/i.test(await pg.textContent('#toast'))&&await pg.isVisible('#kbt'),'recusa do banco aparece e o formulário continua aberto');
  await pg.fill('#kbt','Passivos: documentos do banco');await pg.fill('#kbs','1. Pedir o extrato\n- Conferir o contrato\n');await pg.selectOption('#kbq2','/boasvindas');await pg.click('[data-kb=salvar]');await pg.waitForTimeout(300);
  const sa=rpc('salvar_artigo');ok(sa&&sa[1].p_id===null&&sa[1].p_todas_filas===false&&JSON.stringify(sa[1].p_filas)==='["passivos"]'&&JSON.stringify(sa[1].p_passos)==='["Pedir o extrato","Conferir o contrato"]'&&sa[1].p_resposta_rapida==='/boasvindas','procedimento gravado pelo banco: '+JSON.stringify(sa&&sa[1]));
  ok(!(await pg.$('#kbt'))&&/Passivos: documentos do banco/.test(await pg.textContent('#side'))&&await pg.$('[data-kb=editar]'),'procedimento novo aberto, com Editar para o líder da fila');
  await pg.click('[data-kb=editar]');await pg.fill('#kbw','Quando o cliente manda documentos.');await pg.click('[data-kb=salvar]');await pg.waitForTimeout(300);
  ok(rpc('salvar_artigo')[1].p_id==='K-N1'&&rpc('salvar_artigo')[1].p_quando_usar==='Quando o cliente manda documentos.','editar grava no mesmo procedimento');
  await pg.click('[data-act=tab][data-v=ficha]');

  console.log('— Painel do gestor conectado (líder)');
  await pg.click('#rail [data-v=rel]');await pg.waitForTimeout(300);
  let pn=await pg.textContent('#reports');const pg1=rpc('painel_gestor');
  const hojeIso=await pg.evaluate(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')});
  ok(pg1&&pg1[1].p_de===hojeIso&&pg1[1].p_ate===hojeIso,'painel pede ao banco o dia de hoje: '+JSON.stringify(pg1&&pg1[1]));
  ok(/Filas que você lidera: Comercial/.test(pn)&&/Ainda não há atendimentos no banco/.test(pn)&&!/Testar o rodízio/.test(pn),'líder: escopo das filas dele, aviso de que os atendimentos chegam no passo 2, sem o teste do rodízio');
  ok(/Comercial/.test(pn)&&/R\$ 45\.000/.test(pn)&&/Sem resposta/.test(pn)&&/Meta Ads/.test(pn)&&/Previsto pela probabilidade de cada etapa: R\$ 12\.500/.test(pn),'resumo do comercial vem do banco');
  await pg.click('[data-pnl=per][data-v="7d"]');await pg.waitForTimeout(300);
  const d7=await pg.evaluate(()=>{const d=new Date();d.setDate(d.getDate()-6);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')});
  ok(rpc('painel_gestor')[1].p_de===d7&&rpc('painel_gestor')[1].p_ate===hojeIso,'7 dias pede o período certo ao banco');
  DBS.painelErro=true;await pg.click('[data-pnl=atualizar]');await pg.waitForTimeout(300);
  const pe1=await pg.textContent('#reports');ok(/período inválido/i.test(pe1)&&/R\$ 45\.000/.test(pe1),'erro do banco aparece e os últimos números continuam na tela');
  DBS.painelErro=false;await pg.click('[data-pnl=atualizar]');await pg.waitForTimeout(300);ok(!/período inválido/i.test(await pg.textContent('#reports')),'tentar de novo limpa o erro');
  await pg.click('[data-pnl=per][data-v=hoje]');await pg.waitForTimeout(200);
  await pg.click('#rail [data-v=atend]');
  await pg.click('[data-act=logout]');await pg.waitForTimeout(200);

  console.log('— administrador: login comum');
  DBS.fatores[ADM]=[{id:'F-JURIDICO',factor_type:'totp',status:'verified'}];   // mesmo com autenticador cadastrado em outro sistema
  await pg.fill('#le','admin@homolog.test');await pg.fill('#lp','certa');await pg.click('#lgf button[type=submit]');await pg.waitForTimeout(400);
  ok((await pg.$$eval('#rail button',b=>b.map(x=>x.dataset.v))).includes('cfg'),'admin entra só com e-mail e senha, sem código');
  ok(!funcs.some(x=>x[0]==='mfa'),'nenhuma chamada de autenticador');
  await pg.waitForTimeout(300);ok((await pg.$$eval('#rail button',b=>b.map(x=>x.dataset.v))).includes('tarefas'),'admin vê a aba Tarefas');
  ok(/^1$/.test((await pg.textContent('#rail [data-v=tarefas] .rb-n'))||''),'aviso de tarefa atrasada no menu');
  await pg.click('#rail [data-v=tarefas]');await pg.waitForTimeout(200);ok(/Ligar para o Marcos/.test(await pg.textContent('#tarefas'))&&/criada por Líder Teste/.test(await pg.textContent('#tarefas')),'tarefas do admin vêm do banco');
  await pg.check('[data-tk=feita][data-id=K1]');await pg.waitForTimeout(250);ok(rpc('tarefa_concluir')&&rpc('tarefa_concluir')[1].p_id==='K1','concluir tarefa no banco');

  console.log('— Configurações conectadas');
  await pg.click('#rail [data-v=cfg]');await pg.waitForTimeout(200);
  let tx=await pg.textContent('#settings');
  ok(/Ana Júlia Neves/.test(tx)&&/Atendente Teste/.test(tx)&&!/Natasha/.test(tx),'usuários vêm do banco (sem a equipe de demonstração)');
  ok(!/usuários contratados/.test(tx),'sem limite de usuários');
  ok(/LOGADO/.test(tx),'presença vinda do banco');
  await pg.click('[data-cfgaba=setores]');
  ok(/Gestão de Passivos PJ\s*Desligado\s*Atendente Teste/.test(await pg.textContent('#settings')),'rodízio: estado e pessoas da fila vindos do banco');
  await pg.check('[data-rod=passivos]');ok(/Rodízio de Gestão de Passivos PJ ligado/.test(await toast())&&rpc('fila_rodizio')[1].p_on===true,'rodízio ligado no banco');
  ok(/Ligado\s*Atendente Teste\s*Atendente Teste/.test(await pg.textContent('#settings')),'próximo do rodízio exibido');
  await pg.click('[data-cfgaba=usuarios]');
  await pg.click(`[data-us=sair][data-k="Atendente Teste"]`);ok(/encerrada/.test(await toast())&&rpc('usuario_encerrar_sessao')[1].p_user===ATD,'encerrar sessão chama o banco');
  await pg.click('[data-us=novo]');await pg.fill('#usn','Pessoa Nova');await pg.fill('#use','pessoa.nova@homolog.test');await pg.click('[data-usfila=passivos]');await pg.click('[data-us=salvar]');
  tx=await toast();const cv=funcs.find(x=>x[0]==='convite');
  ok(cv&&cv[1].email==='pessoa.nova@homolog.test'&&cv[2]==='Bearer TK','convite pela Edge Function com o token de quem está logado');
  const us=rpc('usuario_salvar');ok(us&&us[1].p_user===NOVO&&us[1].p_tipo==='atendente'&&JSON.stringify(us[1].p_filas)==='["passivos"]','perfil, tipo e filas gravados: '+JSON.stringify(us&&us[1]));
  ok(/recebe agora o e-mail/.test(tx),'aviso do e-mail de convite');
  await pg.click('[data-us=editar][data-k="Pessoa Nova"]');ok(await pg.isDisabled('#use'),'e-mail de usuário existente não é editável (é o login)');await pg.click('[data-us=fechar]');
  await pg.click('[data-us=excluir][data-k="Atendente Teste"]');await pg.click('[data-us=excluirok]');
  ok(/2 atendimento\(s\) voltaram/.test(await toast())&&!/Atendente Teste/.test(await pg.textContent('#settings')),'excluir tira o acesso no banco');
  await pg.click('[data-cfgaba=setores]');
  await pg.fill('[data-cfg="sector.sla"][data-id=passivos]','20');await pg.press('[data-cfg="sector.sla"][data-id=passivos]','Tab');
  ok(/atualizado/.test(await toast())&&rpc('fila_salvar')[1].p_sla===20&&rpc('fila_salvar')[1].p_lider===LID,'prazo do setor gravado (líder pelo id)');
  await pg.fill('[data-cfg="sector.open"][data-id=passivos]','19:00');await pg.press('[data-cfg="sector.open"][data-id=passivos]','Tab');
  ok(/antes do fechamento/.test(await toast()),'erro do banco ao salvar o setor');
  ok(await pg.inputValue('[data-cfg="sector.open"][data-id=passivos]')==='08:00','tela volta ao valor salvo depois do erro');
  await pg.fill('#nq','Previdenciário');await pg.click('[data-act=newQueue]');ok(/criada/.test(await toast())&&/Previdenciário/.test(await pg.textContent('#settings')),'fila criada no banco');
  await pg.click('[data-cfgaba=respostas]');
  await pg.click('[data-act=setTagColor][data-t=Urgente][data-i="4"]');await pg.waitForTimeout(200);ok(rpc('tag_salvar')[1].p_cor===4,'cor da tag gravada');
  await pg.click('[data-act=delQuick][data-k="/boasvindas"]');ok(/excluída/.test(await toast())&&rpc('resposta_excluir'),'resposta rápida excluída no banco');
  await pg.click('[data-cfgaba=setores]');
  const aus=await pg.$('[data-fld=awaytx]');
  if(aus){await aus.fill('Voltamos às 8h.');await aus.press('Tab');ok(/ausência salva/.test(await toast())&&rpc('ausencia_salvar')[1].p_texto==='Voltamos às 8h.','mensagem de ausência gravada')}
  else ok(false,'campo da mensagem de ausência não encontrado');
  ok(/gravadas no banco \(Homologação\)/.test(await pg.textContent('#settings')),'rodapé diz que grava no banco');
  await pg.click('#rail [data-v=crm]');await pg.waitForTimeout(200);await pg.click('[data-x=crmtab][data-v=campos]');
  await pg.fill('#cpn','Dívida total');await pg.selectOption('#cpt','número');await pg.click('[data-x=campoadd]');await pg.waitForTimeout(250);
  const cc=rpc('campo_criar');ok(cc&&cc[1].p_tipo==='numero'&&cc[1].p_nome==='Dívida total','campo personalizado criado no banco');
  await pg.click('[data-x=campodel][data-id=banco]');await pg.waitForTimeout(250);ok(rpc('campo_excluir')&&rpc('campo_excluir')[1].p_chave==='banco','campo excluído no banco');
  await pg.click('#rail [data-v=cfg]');
  await pg.screenshot({path:path.join(out,'conectado-ajustes.png'),fullPage:true});

  console.log('— saúde do atendimento conectada (admin)');
  await pg.click('[data-cfgaba=saude]');await pg.waitForTimeout(400);
  let sd=await pg.textContent('#saude');
  ok(/2\s*alertas abertos/.test(sd)&&/1\s*na fila de saída · a mais antiga há 8 min/.test(sd)&&/1\s*envios com falha/.test(sd)&&/9\s*enviadas hoje · média 4 s/.test(sd)&&/1\s*eventos com erro · 2 guardados/.test(sd),'quadros vêm de crm.saude_resumo e do relatório do dia');
  ok(/14 recebidas · 9 enviadas · 1 falhas · 1ª resposta média 6 min/.test(sd),'relatório do dia do banco');
  ok(!/Simular falha do provedor/.test(sd)&&!/Marcos Tavares/.test(sd),'sem simulação nem eventos de demonstração');
  ok(/Guardado\s*entra na conversa com o passo 2/.test(sd)&&/payload inválido/.test(sd),'eventos dos canais: guardados até o passo 2 e o com erro');
  ok(/enviado ao grupo/.test(sd)&&/não enviado\s*canal de gestão não configurado/.test(sd),'avisos ao grupo de gestão: enviado e não enviado');
  await pg.click('#saude [data-cn=whk][data-id="33"]');await pg.waitForTimeout(300);ok(rpc('webhook_reprocessar')&&rpc('webhook_reprocessar')[1].p_id===33,'reprocessar evento no banco');
  await pg.click('#saude [data-cn=visto][data-id="42"]');await pg.waitForTimeout(300);ok(rpc('alerta_visto')&&rpc('alerta_visto')[1].p_id===42&&/1\s*alertas abertos/.test(await pg.textContent('#saude')),'alerta de automação marcado como visto');
  await pg.click('#saude [data-cn=re][data-id=S2]');await pg.waitForTimeout(300);ok(rpc('saida_reenviar')&&rpc('saida_reenviar')[1].p_id==='S2'&&/de volta à fila/.test(await pg.textContent('#toast')),'reenviar mensagem com falha');
  await pg.click('#saude [data-cn=cancel][data-id=S1]');await pg.waitForTimeout(300);ok(rpc('saida_cancelar')&&rpc('saida_cancelar')[1].p_id==='S1','cancelar envio');
  sd=await pg.textContent('#saude');ok(/WhatsApp reserva/.test(sd)&&/Desligado/.test(sd)&&/reserva \(plano B\)/.test(sd),'reserva desligado aparece na lista de canais');
  await pg.click(`#saude [data-cn=troca][data-id="${CR}"]`);await pg.waitForTimeout(200);
  ok(/WhatsApp homologação é desligado e as 1 mensagem\(ns\) da fila dele saem pelo novo canal/.test(await pg.textContent('.modal')),'plano B explica o que acontece antes de trocar');
  await pg.click('[data-cn=trocaok]');await pg.waitForTimeout(400);
  ok(rpc('canal_tornar_principal')&&rpc('canal_tornar_principal')[1].p_id===CR&&/WhatsApp reserva agora é o principal\. 1 mensagem/.test(await pg.textContent('#toast')),'reserva virou o principal (plano B)');
  await pg.click(`#saude [data-cn=ativar][data-id="${CW}"]`);await pg.waitForTimeout(300);ok(rpc('canal_ativar')&&rpc('canal_ativar')[1].p_id===CW&&rpc('canal_ativar')[1].p_ativo===true,'ligar a verificação do antigo principal');
  await pg.click('#saude [data-cn=cnnovo]');await pg.waitForTimeout(150);
  await pg.fill('#cnf-nome','WhatsApp Financeiro');await pg.fill('#cnf-num','+55 16 90000-0003');await pg.click('[data-cn=cnsalvar]');await pg.waitForTimeout(300);
  ok(/instância na Evolution/.test(await pg.textContent('#toast'))&&await pg.isVisible('#cnf-nome')&&await pg.inputValue('#cnf-nome')==='WhatsApp Financeiro','erro do banco mantém o formulário preenchido');
  await pg.selectOption('#cnf-tipo','instagram');await pg.waitForTimeout(100);
  ok(JSON.stringify(await pg.$$eval('#cnf-prov option',o=>o.map(x=>x.value)))==='["meta","simulado"]'&&await pg.inputValue('#cnf-nome')==='WhatsApp Financeiro','provedores mudam com o tipo, sem perder o que foi digitado');
  await pg.selectOption('#cnf-tipo','whatsapp');await pg.fill('#cnf-inst','financeiro');await pg.check('#cnf-res');await pg.click('[data-cn=cnsalvar]');await pg.waitForTimeout(300);
  const cs=rpc('canal_salvar');ok(cs&&cs[1].p_id===null&&cs[1].p_tipo==='whatsapp'&&cs[1].p_provedor==='evolution'&&cs[1].p_instancia==='financeiro'&&cs[1].p_silencio_max_min===120&&cs[1].p_reserva===true,'novo canal gravado: '+JSON.stringify(cs&&cs[1]));
  ok(!(await pg.$('#cnf-nome'))&&/desligado/.test(await pg.textContent('#toast'))&&/WhatsApp Financeiro/.test(await pg.textContent('#saude')),'formulário fecha e o canal aparece desligado');
  await pg.click(`#saude [data-cn=cneditar][data-id="${CI}"]`);ok(await pg.inputValue('#cnf-nome')==='Instagram (simulado)'&&!(await pg.$('#cnf-tipo')),'editar não troca o tipo');
  await pg.fill('#cnf-sil','480');await pg.click('[data-cn=cnsalvar]');await pg.waitForTimeout(300);ok(rpc('canal_salvar')[1].p_id===CI&&rpc('canal_salvar')[1].p_silencio_max_min===480,'editar canal');
  await pg.screenshot({path:path.join(out,'conectado-saude.png'),fullPage:true});

  console.log('— Agentes de IA conectados (admin)');
  await pg.click('#rail [data-v=ia]');await pg.waitForTimeout(300);await pg.click('[data-x=iatab][data-v=agentes]');
  ok(/Instagram \(directs e comentários\)/.test(await pg.textContent('#ia'))&&/Claude Opus 5\.5 · até 200 mensagens por dia/.test(await pg.textContent('#ia')),'cartão mostra os tipos de mensagem, o modelo e o limite do banco');
  await pg.click('[data-ia=novo]');await pg.fill('#iaf-nome','Agente Instagram');await pg.fill('#iaf-sozinho','Agradecimentos');await pg.click('[data-ia=salvar]');
  ok(/já existe um agente com esse nome/i.test(await pg.textContent('.iaf-err')),'nome repetido: a tela avisa antes de mandar ao banco');
  await pg.fill('#iaf-nome','Agente comentários');await pg.uncheck('[data-iatipo][value=mensagem]');await pg.check('[data-iatipo][value=comentario]');await pg.selectOption('#iaf-modelo','claude-haiku-5-5');await pg.fill('#iaf-limite','80');
  await pg.click('[data-ia=salvar]');await pg.waitForTimeout(300);
  const as=rpc('agente_salvar');ok(as&&as[1].p_id===null&&as[1].p_dados.nome==='Agente comentários'&&JSON.stringify(as[1].p_dados.tipos)==='["comentario"]'&&as[1].p_dados.modelo==='claude-haiku-5-5'&&as[1].p_dados.limite_diario===80&&as[1].p_dados.responde_sozinho==='Agradecimentos','criar agente chama crm.agente_salvar: '+JSON.stringify(as&&as[1]));
  ok(/Agente comentários/.test(await pg.textContent('#ia'))&&/Claude Haiku 5\.5 · até 80/.test(await pg.textContent('#ia')),'agente novo aparece com o que veio do banco');
  await pg.click('[data-ia=excluir][data-id=AG2]');await pg.click('[data-ia=excluirok]');await pg.waitForTimeout(300);
  ok(rpc('agente_arquivar')&&rpc('agente_arquivar')[1].p_id==='AG2'&&!(await pg.$('[data-ia=editar][data-id=AG2]')),'excluir chama crm.agente_arquivar e tira da lista');
  await pg.click('[data-ia=verarq]');ok(/excluído em 18\/11\/2026/.test(await pg.textContent('#ia')),'excluídos com a data');
  await pg.click('[data-ia=restaurar][data-id=AG2]');await pg.waitForTimeout(300);ok(rpc('agente_restaurar')&&await pg.$('[data-ia=editar][data-id=AG2]'),'restaurar chama crm.agente_restaurar');
  await pg.click('[data-x=iatab][data-v=regras]');await pg.click('[data-ia=rnova]');await pg.selectOption('#iarg-tipo','cuidado');await pg.selectOption('#iarg-ag','AG2');
  await pg.fill('#iarg-regra','Ao falar de prazos, dizer que dependem da análise do caso.');await pg.click('[data-ia=rsalvar]');await pg.waitForTimeout(300);
  const rs=rpc('regra_salvar');ok(rs&&rs[1].p_id===null&&rs[1].p_tipo==='cuidado'&&rs[1].p_agente==='AG2'&&rs[1].p_fonte===null,'nova regra chama crm.regra_salvar: '+JSON.stringify(rs&&rs[1]));
  ok(/Só para o Agente comentários/.test(await pg.textContent('#ia'))&&/Aguardando validação/.test(await pg.textContent('#ia'))&&/Regras \(1 para validar\)/.test(await pg.textContent('#ia')),'regra do agente aguardando validação');
  await pg.click('[data-ia=rvalidar][data-id=RG2]');await pg.waitForTimeout(300);
  ok(rpc('regra_validar')&&/Validada em 18\/11\/2026 por /.test(await pg.textContent('#ia')),'validar chama crm.regra_validar e mostra quem validou');
  await pg.screenshot({path:path.join(out,'conectado-ia-regras.png'),fullPage:true});

  console.log('— Painel do gestor conectado (admin)');
  await pg.click('#rail [data-v=rel]');await pg.waitForTimeout(300);
  let pa=await pg.textContent('#reports');
  ok(/Todas as filas/.test(pa)&&!/Filas que você lidera/.test(pa)&&!/Ainda não há atendimentos/.test(pa),'admin vê todas as filas, números do admin e não os do líder anterior');
  ok(/Atendente Teste/.test(pa)&&/conectado agora/.test(pa)&&/3 atrasados/.test(pa)&&/72%/.test(pa)&&/9 min/.test(pa),'por pessoa e período com os números do banco');
  await pg.screenshot({path:path.join(out,'conectado-painel.png'),fullPage:true});

  console.log('— Base de conhecimento conectada (admin)');
  await pg.click('#rail [data-v=atend]');await pg.click('.it');await pg.click('[data-act=tab][data-v=base]');await pg.waitForTimeout(200);
  await pg.check('[data-kb=excl]');ok(/Procedimento excluído antigo/.test(await pg.textContent('#side')),'administrador vê os excluídos');
  await pg.click('[data-act=kb][data-id=K-X1]');ok(/Excluído/.test(await pg.textContent('#side')),'detalhe do excluído');
  await pg.click('[data-kb=restaurar]');await pg.waitForTimeout(300);
  ok(rpc('restaurar_artigo')&&rpc('restaurar_artigo')[1].p_id==='K-X1'&&/restaurado/.test(await pg.textContent('#toast')),'restaurar pelo banco');
  await pg.click('[data-act=kb][data-id=""]');await pg.check('[data-kb=todas]');await pg.click('[data-act=kb][data-id=K-A3]');await pg.click('[data-kb=editar]');
  ok(await pg.isEnabled('input[name=kbonde][value=todas]'),'administrador pode marcar "Todas as filas"');
  await pg.click('[data-kb=excluir]');await pg.click('[data-kb=excluirok]');await pg.waitForTimeout(300);
  ok(rpc('excluir_artigo')&&rpc('excluir_artigo')[1].p_id==='K-A3'&&/ainda pode restaurá-lo/.test(await pg.textContent('#toast')),'excluir pelo banco');
  await pg.screenshot({path:path.join(out,'conectado-base.png'),fullPage:true});
  await pg.click('[data-act=tab][data-v=ficha]');
  await pg.click('[data-act=logout]');await pg.waitForTimeout(150);

  console.log('— link do e-mail (convite) e "esqueci minha senha"');
  DBS.eu=LID;await pg.goto('about:blank');await pg.goto(url+'#access_token=TK&refresh_token=RT&expires_in=3600&type=invite');await pg.waitForTimeout(300);
  ok(await pg.isVisible('#lsenha')&&/lider@homolog.test/.test(await pg.textContent('#lsenhaq')),'link do convite abre "Crie sua senha"');
  ok(!(await pg.evaluate(()=>location.hash)),'token some do endereço');
  await pg.fill('#ls1','curta');await pg.fill('#ls2','curta');await pg.click('#lsenha button[type=submit]');ok(/10 caracteres/.test(await pg.textContent('#lserr')),'senha curta recusada');
  await pg.fill('#ls1','senha-forte-123');await pg.fill('#ls2','senha-forte-123');await pg.click('#lsenha button[type=submit]');await pg.waitForTimeout(400);
  ok(funcs.some(x=>x[0]==='senha'&&x[1]==='senha-forte-123')&&(await pg.$$eval('#rail button',b=>b.length))>0,'senha gravada e entrada no app');
  await pg.click('[data-act=logout]');await pg.waitForTimeout(150);
  await pg.goto('about:blank');await pg.goto(url+'#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');await pg.waitForTimeout(200);
  ok(/venceu/.test(await pg.textContent('#lerr')),'link vencido explica o que fazer');
  await pg.fill('#le','lider@homolog.test');await pg.click('[data-act=forgot]');await pg.waitForTimeout(200);
  const rc=funcs.find(x=>x[0]==='recover');ok(rc&&rc[1]==='lider@homolog.test'&&/con\.html$/.test(rc[2]),'“Esqueci minha senha” pede o link ao Supabase');

  console.log('ERRS',JSON.stringify(errs));if(errs.length)process.exitCode=1;await br.close();
})().catch(e=>{console.log('FAIL',e.message,globalThis.__errs||'');process.exit(1)});
