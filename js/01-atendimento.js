const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const ini=n=>n.replace(/[^A-Za-zÀ-ÿ ]/g,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'#';
const nowT=()=>new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const fmt=m=>m<60?m+' min':Math.floor(m/60)+' h'+(m%60?' '+String(m%60).padStart(2,'0'):'');

const ME={atendente:'Ana Luiza',marina:'Marina',gabriel:'Gabriel',lider:'Mario',admin:'Ana Júlia'};
const TEAM=[
 {k:'Marina',name:'Marina Cícero',email:'marina.npadvocaia@gmail.com',role:'Financeiro'},
 {k:'Ana Luiza',name:'Ana Luiza',email:'',role:'Gestão de Passivos PJ'},
 {k:'Mario',name:'Mario',email:'',role:'Líder (exemplo)'},
 {k:'Lucas',name:'Lucas',email:'',role:'Superendividamento'},
 {k:'Natasha',name:'Natasha',email:'',role:'Acordos'},
 {k:'Gabriel',name:'Gabriel',email:'',role:'Comercial'},
 {k:'Maria Júlia',name:'Maria Júlia',email:'',role:'Jurídico'},
 {k:'Ana Júlia',name:'Ana Júlia',email:'',role:'Administração'}];
const person=k=>TEAM.find(p=>p.k===k)||{k,name:k,email:'',role:''};
const nz=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const QUEUES=[
 {id:'minha',name:'Minha fila'},{id:'mencoes',name:'Menções'},{id:'todos',name:'Todos os clientes'},{id:'triagem',name:'Triagem'},{id:'comercial',name:'Comercial'},
 {id:'passivos',name:'Gestão de Passivos PJ'},{id:'super',name:'Superendividamento'},{id:'acordos',name:'Acordos'},{id:'financeiro',name:'Financeiro'}];
const FILAS0={'Ana Luiza':['passivos'],'Marina':['financeiro'],'Mario':['passivos'],'Lucas':['super'],'Natasha':['acordos'],'Gabriel':['comercial']};
TEAM.forEach(p=>{p.filas=(FILAS0[p.k]||[]).slice()});
const ACCESS={};
const OPQ=()=>QUEUES.filter(q=>!['minha','mencoes','todos','triagem'].includes(q.id)).map(q=>q.id);
function recompute(){Object.keys(ME).forEach(r=>{const p=person(ME[r]);ACCESS[r]=['minha','mencoes',...((r==='admin'||p.todos)?['todos']:[]),'triagem',...((r==='lider'||r==='admin')?OPQ():(p.filas||[]))]})}
recompute();
const STATUS=['Aguardando','Em atendimento','Resolvido'];
const CANAIS={whatsapp:['WhatsApp','WA'],instagram:['Instagram','IG'],google:['Google Meu Negócio','GMN']};
const TEMAS=['Andamento do caso','Documentação inicial','Boleto e financeiro','Proposta comercial','Negociação bancária','Outro'];
const QUICK={
 '/dados':'Esses são os dados necessários para elaboração da documentação inicial:\n\nNOME:\nCPF:\nRG:\nESTADO CIVIL:\nENDEREÇO:\nCEP:\nPROFISSÃO:\nE-mail:\nData de Nascimento:\nTelefone:\n\nO melhor dia para vencimento dos boletos seria dia 01, 05, 10 ou 20?',
 '/boasvindas':'Olá, [Nome]! Aqui é do Neves Pádua Advocacia. Recebemos a sua mensagem e já vamos te atender.',
 '/foradohorario':'Olá! Nosso atendimento funciona em horário comercial. Sua mensagem foi registrada e retornamos no próximo horário de atendimento.',
 '/aguarde':'[Nome], estamos analisando o seu caso e retornamos até [horário] com uma posição.'};

/* Base de conhecimento = PROCEDIMENTOS (o que fazer, em que ordem, cuidados, quando escalar).
   Textos prontos ficam nas respostas rápidas (/); o procedimento só aponta qual usar (campo quick).
   sec: ['todos'] = vale para todas as filas; senão, aparece só nas filas listadas. */
const ARTICLES=[
 {id:'a1',t:'Pedir os dados para a documentação inicial',sec:['comercial','triagem'],quick:'/dados',por:'Ana Júlia',em:'05/11/2026',
  when:'O cliente aceitou a proposta e falta reunir os dados para o contrato.',
  steps:['Conferir no CRM se algum dado já existe.','Enviar a resposta rápida /dados.','Ao receber, conferir CPF, endereço e CEP.','Lançar os dados no CRM.'],
  care:'Não pedir documentos sensíveis além do necessário. Avisar que os dados são tratados com sigilo.',esc:'Cliente PJ com mais de um sócio, ou dado divergente do cadastro.'},
 {id:'a2',t:'Cliente pergunta sobre o andamento do caso',sec:['passivos','super','acordos'],quick:'/andamento',por:'Ana Júlia',em:'05/11/2026',
  when:'O cliente pergunta “como está meu processo?” sem pergunta específica.',
  steps:['Abrir a ficha no CRM.','Ler a última movimentação e a nota do responsável.','Responder com data e próximo passo (/andamento).','Se não houver novidade, dizer isso e dar prazo de retorno.'],
  care:'Nunca prometer resultado nem prazo de decisão judicial. Se depender de análise jurídica, não improvisar.',esc:'Cliente pede avaliação de chances ou de valores. Deixar nota interna e transferir ao advogado responsável.'},
 {id:'a3',t:'Cliente irritado com a demora',sec:['todos'],quick:'/demora',por:'Ana Júlia',em:'05/11/2026',
  when:'O cliente reclama de falta de retorno.',
  steps:['Reconhecer a demora sem desculpas longas.','Verificar o histórico para saber o que aconteceu.','Dar um prazo concreto.','Avisar o líder se o SLA estiver estourado.'],
  care:'Não culpar outro setor na conversa com o cliente.',esc:'Ameaça de rescisão, de reclamação em órgão público ou pedido de falar com o sócio.'},
 {id:'a4',t:'Cliente pede segunda via de boleto',sec:['financeiro'],quick:'/segundavia',por:'Marina',em:'05/11/2026',
  when:'O cliente precisa do boleto de novo ou quer mudar a data de vencimento.',
  steps:['Localizar o cliente e a parcela no financeiro.','Gerar a segunda via com a nova data, se houver.','Enviar o boleto e confirmar o vencimento (/segundavia).'],
  care:'Só alterar o dia de vencimento para 01, 05, 10 ou 20.',esc:'Cliente com parcelas em atraso há mais de 30 dias.'}];
/* textos que antes ficavam dentro dos artigos viraram respostas rápidas */
Object.assign(QUICK,{
 '/andamento':'Olá, [Nome]! Consultei o seu caso. A última movimentação foi [movimentação], em [data]. O próximo passo é [passo]. Se houver novidade antes disso, aviso por aqui.',
 '/demora':'[Nome], você tem razão em cobrar, e peço desculpas pela demora. Já estou verificando o seu caso e retorno até [horário] com uma posição.',
 '/segundavia':'Olá, [Nome]! Segue a segunda via do boleto com vencimento em [data]. Qualquer dúvida, é só chamar por aqui.'});

const convos=[
 {id:'c1',name:'Marcos Tavares',org:'Tavares Auto Peças LTDA',phone:'+55 16 98800-0101',queue:'passivos',owner:'Ana Luiza',status:'Em atendimento',target:60,waiting:48,answered:false,unread:true,proto:'20261104-0003',
  msgs:[{f:'c',x:'Segue a proposta que o banco mandou.',t:'ontem 15:10',media:{k:'pdf',n:'Proposta_Banco_A.pdf',s:'412 KB'}},
        {f:'c',x:'',t:'ontem 15:12',media:{k:'audio',n:'Áudio do Marcos',s:'0:42'}},
        {f:'a',au:'Ana Luiza',x:'Recebi, Marcos. Segue o resumo das condições.',t:'ontem 15:30',media:{k:'img',n:'Resumo_condicoes.png',s:'180 KB'}},
        {f:'a',au:'Ana Luiza',x:'Bom dia, Marcos! Recebemos a proposta do banco e estamos analisando as condições.',t:'ontem 16:40'},
        {f:'n',au:'Ana Luiza',x:'A proposta veio com taxa acima do combinado. Falar com a Dra. Maria Júlia antes de responder valores.',t:'ontem 16:52'},
        {f:'n',au:'Ana Luiza',x:'@Marina Cícero confere se o boleto de honorários de novembro do Marcos já foi pago? Preciso saber antes de falar de valores.',t:'ontem 16:58',mentions:[{k:'Marina',done:false}]},
        {f:'c',x:'Bom dia! Queria saber como está a negociação com o banco. O gerente me ligou ontem.',t:'09:14'}],
  ct:{tipo:'Cliente PJ',doc:'CNPJ 12.***.***/0001-**',setor:'Gestão de Passivos PJ',resp:'Ana Luiza',items:['Capital de giro, Banco A (em negociação)','Conta garantida, Banco B (acompanhamento)'],tags:['PJ','Negociação ativa'],hist:[['20261028-0012','Negociação bancária','28/10'],['20261015-0004','Documentação inicial','15/10']]}},
 {id:'c2',name:'Renata Souza',org:'Lead',phone:'+55 16 99100-0202',queue:'comercial',owner:'Gabriel',status:'Novo',target:5,waiting:7,answered:false,unread:true,proto:'20261104-0006',tr:true,trFrom:'Triagem',trBy:'Lucas',
  msgs:[{f:'c',x:'Boa tarde, vi o anúncio de vocês. Minha empresa tem dívidas em três bancos e não consigo mais pagar. Vocês ajudam?',t:'09:55'}],
  ct:{tipo:'Lead',doc:'Não informado',setor:'Comercial',resp:'Gabriel',items:[],tags:['Lead novo','Anúncio'],hist:[]}},
 {id:'c3',name:'+55 16 99xxx-0142',org:'Contato não cadastrado',phone:'+55 16 99xxx-0142',queue:'triagem',owner:null,status:'Novo',target:30,waiting:3,answered:false,unread:true,proto:'20261104-0007',
  msgs:[{f:'c',x:'Oi',t:'10:00'},{f:'c',x:'Preciso falar sobre um processo que recebi',t:'10:00'}],ct:null},
 {id:'c4',name:'Helena Prado',org:'Superendividamento',phone:'+55 16 98800-0404',queue:'super',owner:'Lucas',status:'Aguardando cliente',target:120,waiting:0,answered:true,unread:false,proto:'20261103-0021',
  msgs:[{f:'a',au:'Lucas',x:'Helena, preciso do extrato de dívidas atualizado para montar o plano.',t:'ontem 15:20'}],
  ct:{tipo:'Cliente',doc:'CPF ***.482.***-**',setor:'Superendividamento',resp:'Lucas',items:['Plano de pagamento em montagem'],tags:['Servidor público'],hist:[['20261020-0009','Documentação inicial','20/10']]}},
 {id:'c5',name:'Cláudio Ferreira',org:'CF Transportes',phone:'+55 16 98800-0505',queue:'passivos',owner:'Ana Luiza',status:'Aguardando interno',target:240,waiting:130,answered:false,unread:false,proto:'20261104-0002',
  msgs:[{f:'c',x:'Mandei os extratos do banco agora de manhã.',t:'08:05'},{f:'n',au:'Ana Luiza',x:'Aguardando a Dra. Maria Júlia conferir os extratos antes de retornar.',t:'08:30'}],
  ct:{tipo:'Cliente PJ',doc:'CNPJ 34.***.***/0001-**',setor:'Gestão de Passivos PJ',resp:'Ana Luiza',items:['Cédula de crédito, Banco C (análise)'],tags:['PJ'],hist:[['20261022-0015','Documentação inicial','22/10']]}},
 {id:'c6',name:'Débora Lima',org:'Financeiro',phone:'+55 16 98800-0606',queue:'financeiro',owner:'Marina',status:'Em atendimento',target:240,waiting:20,answered:false,unread:true,proto:'20261104-0005',
  msgs:[{f:'c',x:'Preciso da segunda via do boleto de novembro.',t:'09:42'}],
  ct:{tipo:'Cliente',doc:'CPF ***.117.***-**',setor:'Financeiro',resp:'Marina',items:['Honorários, 12 parcelas'],tags:['Boleto dia 10'],hist:[]}},
 {id:'c7',name:'Paulo Nogueira',org:'Acordos',phone:'+55 16 98800-0707',queue:'acordos',owner:'Natasha',status:'Em atendimento',target:60,waiting:67,answered:false,unread:true,proto:'20261104-0001',
  msgs:[{f:'c',x:'Recebi a proposta de acordo. Posso pagar à vista com desconto?',t:'08:55'}],
  ct:{tipo:'Cliente',doc:'CPF ***.906.***-**',setor:'Acordos',resp:'Natasha',items:['Proposta de acordo enviada'],tags:[],hist:[]}},
 {id:'c8',name:'Sandra Oliveira',org:'SO Confecções',phone:'+55 16 98800-0808',queue:'passivos',owner:'Mario',status:'Em atendimento',target:60,waiting:15,answered:false,unread:false,proto:'20261104-0004',
  msgs:[{f:'c',x:'Enviei os contratos que faltavam. Pode confirmar o recebimento?',t:'09:47'}],
  ct:{tipo:'Cliente PJ',doc:'CNPJ 55.***.***/0001-**',setor:'Gestão de Passivos PJ',resp:'Mario',items:['Financiamento, Banco A'],tags:['PJ'],hist:[]}},
 {id:'c9',name:'Ricardo Alves',org:'Financeiro',phone:'+55 16 98800-0909',queue:'financeiro',owner:'Marina',status:'Resolvido',target:240,waiting:0,answered:true,unread:false,proto:'20261103-0018',tema:'Boleto e financeiro',resumo:'Enviada a segunda via com novo vencimento.',
  msgs:[{f:'c',x:'Pode mudar meu vencimento para dia 20?',t:'ontem 11:02'},{f:'a',au:'Marina',x:'Feito, Ricardo. O próximo boleto vence dia 20.',t:'ontem 11:20'}],
  ct:{tipo:'Cliente',doc:'CPF ***.330.***-**',setor:'Financeiro',resp:'Marina',items:['Honorários, 10 parcelas'],tags:['Boleto dia 20'],hist:[]}},
 {id:'c10',name:'Renata Moura',org:'Instagram · direct',phone:'@renata.moura',canal:'instagram',queue:'triagem',owner:null,status:'Aguardando',target:30,waiting:9,answered:false,unread:true,proto:'20261105-0012',
  msgs:[{f:'c',x:'Oi! Vi o reel de vocês sobre dívida de empresa. Como funciona a análise?',t:'10:20'}],ct:null},
 {id:'c11',name:'Fernando Cardoso',org:'Google Meu Negócio · avaliação',phone:'Avaliação 5 estrelas',canal:'google',queue:'triagem',owner:null,status:'Aguardando',target:60,waiting:25,answered:false,unread:true,proto:'20261105-0013',
  msgs:[{f:'c',x:'Atendimento muito atencioso e transparente. Recomendo o escritório.',t:'09:30'}],ct:null},
 {id:'c12',name:'@paulo.lima',org:'Instagram · direct',phone:'@paulo.lima',canal:'instagram',queue:'comercial',owner:'Gabriel',status:'Aguardando',target:30,waiting:4,answered:false,unread:true,proto:'20261105-0014',
  msgs:[{f:'c',x:'Prefiro falar com uma pessoa, pode ser?',t:'10:05'},{f:'s',x:'A IA parou para este contato: ele pediu para falar com uma pessoa. Atendimento delegado ao Comercial (rodízio): Gabriel',t:'10:05'},
   {f:'n',au:'Assistente virtual (IA)',x:'@Gabriel o contato pediu para falar com uma pessoa no Instagram. O atendimento é seu (primeiro contato, Comercial).',t:'10:05',mentions:[{k:'Gabriel',done:false}]}],ct:null}
];

convos.forEach(c=>{c.tags=(c.ct&&c.ct.tags)?c.ct.tags.slice():[];c.canal=c.canal||'whatsapp';if(c.status==='Novo')c.status='Aguardando';if(c.status==='Aguardando interno')c.status='Em atendimento';if(c.status==='Aguardando cliente'){c.status='Em atendimento';c.pausa=true}});
const TAGS=['PJ','Negociação ativa','Lead novo','Anúncio','Servidor público','Boleto dia 10','Boleto dia 20','Urgente','Aguardando documentos','Inadimplente','Possível reclamação','Cliente VIP'];
const TC=[['Azul','#2F6FDE'],['Verde','#2E9E6B'],['Vermelho','#D64545'],['Laranja','#E07B1F'],['Roxo','#8A4FD6'],['Turquesa','#14A3A3'],['Rosa','#D6489A'],['Dourado','#B8964A']];
const TAGCOL={'PJ':0,'Negociação ativa':1,'Lead novo':3,'Anúncio':6,'Servidor público':5,'Boleto dia 10':7,'Boleto dia 20':7,'Urgente':2,'Aguardando documentos':3,'Inadimplente':2,'Possível reclamação':4,'Cliente VIP':7};
const tagC=t=>'tg'+((TAGCOL[t]!=null?TAGCOL[t]:0));
let S_ntagc=0;
const MK={pdf:'PDF',img:'Imagem',audio:'Áudio',doc:'Documento',video:'Vídeo'};
const QBY={};
const S={auth:false,att:{},q:'',qt:'cliente',mfil:'todas',role:'atendente',view:'atend',queue:'minha',sel:'c1',show:'atend',tab:'ficha',mode:'msg',tray:null,pane:'list',canal:'todos',qopen:false,kb:null,kbq:'',drafts:{},down:false};
const me=()=>ME[S.role];
const qName=id=>(QUEUES.find(q=>q.id===id)||{}).name||id;
const cur=()=>convos.find(c=>c.id===S.sel&&canSee(c));
function mentionedMe(c,pending){return c.msgs.some(m=>m.mentions&&m.mentions.some(x=>x.k===me()&&(!pending||!x.done)))}
const canSee=c=>c.owner===me()||ACCESS[S.role].includes('todos')||ACCESS[S.role].includes(c.queue)||mentionedMe(c);
const isTr=c=>c.tr&&c.trBy!==me();
const inQueue=id=>id==='minha'?convos.filter(c=>c.owner===me()||ACCESS[S.role].includes(c.queue)):id==='mencoes'?convos.filter(c=>mentionedMe(c,true)):id==='todos'?(ACCESS[S.role].includes('todos')?convos.slice():[]):convos.filter(c=>c.queue===id&&ACCESS[S.role].includes(id));
function sla(c){
  if(c.status==='Resolvido')return{s:'pause',label:'Encerrado',r:0};
  if(c.pausa)return{s:'pause',label:'SLA pausado',r:0};
  if(c.answered)return{s:'ok',label:'Respondido',r:0};
  const r=c.waiting/c.target;
  if(r>1)return{s:'bad',label:'Atrasado '+fmt(c.waiting-c.target),r};
  return{s:r>=.75?'warn':'ok',label:fmt(c.target-c.waiting)+' restantes',r};
}
const lastT=c=>{const m=c.msgs.filter(x=>x.f!=='n'&&x.f!=='s').slice(-1)[0];return m?m.t:''};
const snippet=c=>{const m=c.msgs.filter(x=>x.f==='c'||x.f==='a').slice(-1)[0];return m?(m.f==='a'?'Você: ':'')+(m.x||('['+(MK[m.media&&m.media.k]||'Arquivo')+']')).replace(/\n/g,' '):''};
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>e.hidden=true,3200)}

/* ---- tema claro/escuro: escolhido no app, salvo no navegador (não segue o sistema) ---- */
const isDark=()=>document.documentElement.dataset.theme==='dark';
function themeLabel(){
  const moon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
  const sun='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
  document.querySelectorAll('[data-act=theme]').forEach(b=>{b.innerHTML=(isDark()?sun+'<span class="tl">Modo claro</span>':moon+'<span class="tl">Modo escuro</span>');b.setAttribute('aria-label',isDark()?'Mudar para o modo claro':'Mudar para o modo escuro');b.title=isDark()?'Mudar para o modo claro':'Mudar para o modo escuro'});
}
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('np-tema',t)}catch(e){}themeLabel()}
if(document.documentElement.dataset.theme!=='dark')document.documentElement.dataset.theme='light';

function renderTop(){
  document.body.classList.toggle('locked',!S.auth);themeLabel();
  const ICON={"atend": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 5h16v11H9l-5 4z\"/></svg>", "fluxos": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"6\" cy=\"6\" r=\"2.5\"/><circle cx=\"18\" cy=\"12\" r=\"2.5\"/><circle cx=\"6\" cy=\"18\" r=\"2.5\"/><path d=\"M8.5 6H12a3 3 0 0 1 3 3v0M8.5 18H12a3 3 0 0 0 3-3v0\"/></svg>", "crm": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z\"/></svg>", "ia": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z\"/></svg>", "rel": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 20V10M12 20V4M19 20v-7\"/></svg>", "tarefas": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><path d=\"M8 12l3 3 5-6\"/></svg>", "cfg": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2\"/></svg>"},SHORT={atend:'Atendimento',fluxos:'Fluxos',crm:'CRM',tarefas:'Tarefas',ia:'Agentes IA',rel:'Gestão',cfg:'Ajustes'};
  const t=[['atend','Atendimento']];if(S.role==='lider'||S.role==='admin')t.push(['fluxos','Fluxos de trabalho']);if(veCRM())t.push(['crm','CRM']);if(veTarefas())t.push(['tarefas','Tarefas']);if(S.role==='lider'||S.role==='admin')t.push(['ia','Agentes de IA'],['rel','Painel do gestor']);if(S.role==='admin')t.push(['cfg','Configurações']);
  if(!t.some(x=>x[0]===S.view))S.view='atend';
  $('#rail').innerHTML=t.map(([k,l])=>`<button type="button" class="rb${S.view===k?' on':''}" data-act="view" data-v="${k}" title="${l}" aria-label="${l}">${ICON[k]}<span>${SHORT[k]}</span>${k==='tarefas'&&tarefasUrgentes()?`<i class="rb-n" aria-label="${tarefasUrgentes()} atrasadas ou para hoje">${tarefasUrgentes()}</i>`:''}</button>`).join('');
  // Demonstração: só um selo discreto no cabeçalho. Homologação: faixa amarela (precisa chamar atenção).
  const avisoAmb=AMBIENTE.aviso+(AMBIENTE.conectado&&DB.modo==='mock'?' (Já usam o banco: login, equipe, setores, tags, respostas rápidas, ausência, CRM, importação de leads, tarefas, fluxos de trabalho (com o motor no servidor), menções dos fluxos e da IA, Agentes de IA, canais, fila de saída e saúde e Base de conhecimento. As conversas e as demais áreas ainda mostram dados de demonstração.)':'');
  const ab=$('#ambbar');ab.textContent=avisoAmb;ab.hidden=!avisoAmb||AMBIENTE.nome==='demonstracao';ab.classList.toggle('hml',AMBIENTE.nome==='homologacao');
  const bd=$('#ambbadge');bd.hidden=AMBIENTE.nome!=='demonstracao';bd.title=avisoAmb;
  renderCanais();
  $('#app').hidden=S.view!=='atend';$('#reports').hidden=S.view!=='rel';$('#settings').hidden=S.view!=='cfg';['fluxos','crm','ia','tarefas'].forEach(k=>$('#'+k).hidden=S.view!==k);
}
const CFG={sectors:[
 {id:'comercial',days:'Seg–Sex',open:'08:00',close:'19:00',sla:10,ret:60,leader:'Gabriel'},
 {id:'passivos',days:'Seg–Sex',open:'08:00',close:'18:00',sla:15,ret:120,leader:'Mario'},
 {id:'super',days:'Seg–Sex',open:'08:00',close:'18:00',sla:15,ret:120,leader:'Mario'},
 {id:'acordos',days:'Seg–Sex',open:'08:00',close:'18:00',sla:15,ret:120,leader:'Natasha'},
 {id:'financeiro',days:'Seg–Sex',open:'09:00',close:'17:00',sla:30,ret:240,leader:'Marina'}]};
CFG.away={on:true,text:'Olá! Recebemos sua mensagem fora do nosso horário de atendimento. Retornamos no próximo dia útil a partir das 8h. Se for urgente, informe o assunto aqui.'};
const PERFIS=['Atendente','Líder de setor','Administrador'];
TEAM.forEach(p=>{p.perfil=p.k==='Ana Júlia'?'Administrador':p.k==='Mario'?'Líder de setor':'Atendente'});
function renderSettings(){
  if(S.role!=='admin'){$('#settings').innerHTML='';return}
  const sel=(opts,val,attr)=>`<select ${attr}>${opts.map(o=>`<option value="${esc(o.v)}"${o.v===val?' selected':''}>${esc(o.l)}</option>`).join('')}</select>`;
  const people=TEAM.map(p=>({v:p.k,l:p.name}));
  $('#settings').innerHTML=`<div class="cfg"><div class="ph" style="padding-left:0;border:0"><h2 style="font-family:var(--serif);font-size:20px;margin:0">Configurações</h2></div>
  <div class="tbl"><h3>Setores, horários e prazos</h3><p class="src note">Fora do horário, a mensagem é registrada e o prazo (SLA) só começa a contar na abertura. Cada setor tem o seu horário.</p>
   <table><thead><tr><th>Setor</th><th>Dias</th><th>Abre</th><th>Fecha</th><th>1ª resposta (min)</th><th>Retorno (min)</th><th>Líder</th></tr></thead><tbody>
   ${CFG.sectors.map(s=>`<tr><td><b>${esc(qName(s.id))}</b></td>
    <td>${sel(['Seg–Sex','Seg–Sáb','Todos os dias'].map(x=>({v:x,l:x})),s.days,`data-cfg="sector.days" data-id="${s.id}" aria-label="Dias"`)}</td>
    <td><input type="time" value="${s.open}" data-cfg="sector.open" data-id="${s.id}" aria-label="Abre"></td>
    <td><input type="time" value="${s.close}" data-cfg="sector.close" data-id="${s.id}" aria-label="Fecha"></td>
    <td><input type="number" min="1" value="${s.sla}" data-cfg="sector.sla" data-id="${s.id}" aria-label="Primeira resposta"></td>
    <td><input type="number" min="1" value="${s.ret}" data-cfg="sector.ret" data-id="${s.id}" aria-label="Retorno"></td>
    <td>${sel([{v:'',l:'Escolher…'},...people],s.leader,`data-cfg="sector.leader" data-id="${s.id}" aria-label="Líder"`)}</td></tr>`).join('')}</tbody></table>
   <div class="row" style="justify-content:flex-start"><b>Nova fila</b><input id="nq" placeholder="Nome da fila (ex.: Trabalhista)" maxlength="40" style="flex:1;min-width:160px;max-width:320px"><button type="button" class="btn pri" data-act="newQueue">Criar fila</button></div>
   <p class="src note">Os prazos acima são sugestões para você confirmar. O amarelo aparece em 75% do prazo e o vermelho ao estourar. Depois de criar a fila, marque abaixo quem participa dela.</p></div>

  <div class="tbl"><h3>Tags do escritório</h3><p class="src note">Todos podem adicionar estas tags aos contatos. Só o administrador cria e muda a cor. A cor ajuda a achar o que importa de relance.</p>
   <div class="row" style="justify-content:flex-start;align-items:flex-start;flex-direction:column">${TAGS.map(t=>`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="tag on ${tagC(t)}" style="margin:0">${esc(t)}</span><span class="sw">${TC.map((x,i)=>`<button type="button" class="tg${i}${TAGCOL[t]===i?' on':''}" data-act="setTagColor" data-t="${esc(t)}" data-i="${i}" title="${x[0]}" aria-label="${esc(t)}: cor ${x[0]}"></button>`).join('')}</span></div>`).join('')}</div></div>
  <div class="tbl"><h3>Respostas rápidas</h3><table><thead><tr><th>Atalho</th><th>Texto</th><th>Criada por</th><th></th></tr></thead><tbody>
   ${Object.keys(QUICK).map(k=>`<tr><td><b>${esc(k)}</b></td><td class="src">${esc(QUICK[k].slice(0,110))}${QUICK[k].length>110?'…':''}</td><td class="src">${esc(QBY[k]||'Padrão')}</td><td><button type="button" class="btn" data-act="delQuick" data-k="${esc(k)}">Excluir</button></td></tr>`).join('')}</tbody></table>
   <p class="src note">Todos criam respostas rápidas pela caixa de mensagem (“+ Nova resposta”). Só o administrador exclui. Os procedimentos da Base são editados pelo administrador e pelos líderes, na própria aba Base.</p></div>
  <p class="src">${SB.ligado()?'Alterações gravadas no banco ('+esc(AMBIENTE.rotulo)+') e válidas para toda a equipe.':'Alterações valem só nesta demonstração e não são salvas.'}</p></div>`;
}
function renderQueues(){}
function queuesHtml(){
  return ACCESS[S.role].map(id=>{
    const list=inQueue(id).filter(c=>id==='mencoes'||c.status!=='Resolvido'),late=list.some(c=>sla(c).s==='bad'),extra=id==='mencoes'?avisosPend().length:0;
    return `<button type="button" class="q${id===S.queue?' on':''}" data-act="queue" data-id="${id}"><span>${esc(qName(id))}${id==='minha'?`<small>${esc(me())}</small>`:''}</span><span class="qc">${late?'<i class="dot bad" title="Há atendimento atrasado"></i>':''}${list.some(isTr)?'<i class="dot info" title="Há atendimento transferido para esta fila"></i>':''}${list.length+extra}</span></button>`}).join('');
}
function qhead(){const n=inQueue(S.queue).filter(c=>S.queue==='mencoes'||c.status!=='Resolvido').length+(S.queue==='mencoes'?avisosPend().length:0);
  return `<button type="button" class="qbtn" data-act="qmenu" aria-expanded="${S.qopen?'true':'false'}">☰ <span>${esc(qName(S.queue))}</span><small>${n} ${S.qopen?'▴':'▾'}</small></button>${S.qopen?`<div class="qmenu">${queuesHtml()}</div>`:''}`}
function hl(text,n){const t=String(text||'').replace(/\s+/g,' ');const i=nz(t).indexOf(n);if(i<0||!n)return esc(t.slice(0,80));
  const a=Math.max(0,i-28),b=Math.min(t.length,i+n.length+48);
  return (a>0?'…':'')+esc(t.slice(a,i))+'<mark>'+esc(t.slice(i,i+n.length))+'</mark>'+esc(t.slice(i+n.length,b))+(b<t.length?'…':'')}
function searchRes(q){
  const n=nz(q).trim(),d=q.replace(/\D/g,''),out=[];
  const t=S.qt;
  convos.filter(canSee).forEach(c=>{
    let w=null;
    if(t==='cliente'){
      if(nz(c.name).includes(n)||nz(c.org||'').includes(n))w={k:'Cliente',h:hl(nz(c.name).includes(n)?c.name:c.org,n)};
      else if(nz(c.proto).includes(n))w={k:'Protocolo',h:hl(c.proto,n)};
    }else if(t==='numero'){
      if(d.length>=3&&c.phone.replace(/\D/g,'').includes(d))w={k:'Número',h:esc(c.phone)};
    }else{
      const m=c.msgs.find(m=>m.f!=='s'&&(nz(m.x).includes(n)||(m.media&&nz(m.media.n).includes(n))));
      if(m)w=(m.media&&!nz(m.x).includes(n))?{k:'Mídia',h:hl(m.media.n,n)}:{k:m.f==='n'?'Nota interna':'Mensagem',h:hl(m.x,n)}}
    if(w)out.push({c,w});
  });
  return out;
}
const QT={cliente:['Cliente','Nome do cliente, empresa ou protocolo'],numero:['Número','Número de telefone (mínimo 3 dígitos)'],mensagem:['Mensagem','Texto das mensagens, das notas internas e nomes de arquivos']};
function stTabs(all){const n=k=>all.filter(c=>k==='resolvidos'?c.status==='Resolvido':c.status===(k==='aguard'?'Aguardando':'Em atendimento')).filter(c=>S.canal==='todos'||c.canal===S.canal).length;
  return `<div class="stt-tabs" role="tablist">${[['aguard','Aguardando'],['atend','Em atendimento'],['resolvidos','Resolvidos']].map(([k,l])=>`<button type="button" role="tab" data-act="show" data-v="${k}" class="${S.show===k?'on':''}">${l} <b>${n(k)}</b></button>`).join('')}</div>`}
function renderList(){
  const sb=qhead()+`<div class="srch"><div class="seg" role="group" aria-label="Buscar por">${Object.keys(QT).map(k=>`<button type="button" data-act="qt" data-v="${k}" class="${S.qt===k?'on':''}">${QT[k][0]}</button>`).join('')}</div>
    <input id="q" type="search" autocomplete="off" placeholder="${esc(QT[S.qt][1])}" aria-label="Buscar por ${esc(QT[S.qt][0])}" value="${esc(S.q)}"></div>`;
  const qq=S.q.trim();
  if(qq&&(S.qt==='numero'?qq.replace(/\D/g,'').length<3:qq.length<2)){
    $('#list').innerHTML=sb+`<div class="empty"><b>Continue digitando</b>${S.qt==='numero'?'Digite ao menos 3 números do telefone.':'Digite ao menos 2 letras.'}</div>`;keepQ();return}
  if(qq){
    const res=searchRes(qq),n=nz(qq);
    $('#list').innerHTML=sb+`<div class="ph"><h2>Resultados</h2><span class="src">${res.length} ${res.length===1?'atendimento':'atendimentos'}</span></div><div class="scroll">${res.length?res.map(({c,w})=>`<button type="button" class="it${c.id===S.sel?' on':''}" data-act="open" data-id="${c.id}">
      <span class="av">${esc(ini(c.name))}</span><span class="im"><span class="r1"><b>${esc(c.name)}</b><time>${esc(c.phone)}</time></span>
      <span class="r2"><span class="pill pause">${w.k}</span> ${w.h}</span>
      <span class="r3"><span class="st">${esc(qName(c.queue))} · ${esc(c.status)}${c.owner?' · '+esc(c.owner):''}</span></span></span></button>`).join(''):`<div class="empty"><b>Nada encontrado</b>Buscando por ${QT[S.qt][0].toLowerCase()}: ${esc(QT[S.qt][1].toLowerCase())}. Só aparecem os atendimentos que você pode ver.</div>`}</div>`;
    keepQ();return;
  }
  const all=inQueue(S.queue);
  const items=all.filter(c=>S.queue==='mencoes'||(S.show==='resolvidos'?c.status==='Resolvido':c.status===(S.show==='aguard'?'Aguardando':'Em atendimento'))&&(S.canal==='todos'||c.canal===S.canal)).sort((a,b)=>sla(b).r-sla(a).r);
  $('#list').innerHTML=sb+`<div class="ph"><h2>${esc(qName(S.queue))}</h2><select id="cfil" aria-label="Canal"><option value="todos">Todos os canais</option>${Object.keys(CANAIS).map(k=>`<option value="${k}"${S.canal===k?' selected':''}>${CANAIS[k][0]}</option>`).join('')}</select></div>
  ${S.queue==='mencoes'?'':stTabs(all)}
  <div class="scroll">${S.queue==='mencoes'?avisosHtml():''}${items.length?items.map(c=>{const s=sla(c);return `<button type="button" class="it${c.id===S.sel?' on':''}" data-act="open" data-id="${c.id}">
    <span class="avw"><span class="av">${esc(ini(c.name))}</span><i class="cb ${c.canal}" title="${esc(CANAIS[c.canal][0])}">${CANAIS[c.canal][1].slice(0,1)}</i></span><span class="im"><span class="r1"><b>${esc(c.name)}</b><time>${esc(lastT(c))}</time></span>
    <span class="r2">${esc(snippet(c))}</span>
    <span class="r3">${isTr(c)?`<span class="pill info">Transferido${c.trFrom?' de '+esc(c.trFrom):''}</span>`:''}${mentionedMe(c,true)?'<span class="pill warn">@ você</span>':''}<span class="pill ${s.s}">${esc(s.label)}</span><span class="st">${esc(c.status)}${S.queue==='minha'?' · '+esc(qName(c.queue)):S.queue==='todos'?' · '+esc(qName(c.queue))+(c.owner?' · '+esc(c.owner):''):(c.owner?' · '+esc(c.owner):'')}</span>${c.unread?'<span class="ub" title="Não lida">1</span>':''}</span></span></button>`}).join('')
   :S.queue==='mencoes'&&avisosPend().length?'':`<div class="empty"><b>${S.queue==='mencoes'?'Nenhuma menção':S.show==='resolvidos'?'Nenhum atendimento resolvido':S.show==='aguard'?'Ninguém aguardando':'Nada em atendimento'}</b>${S.queue==='minha'?'Os atendimentos atribuídos a você aparecem aqui.':S.queue==='mencoes'?'Aparece aqui quando um colega marcar você em uma nota interna, quando um fluxo avisar você ou quando um contato do Instagram ou do Google pedir uma pessoa e o atendimento for delegado a você.':'Quando chegar mensagem para esta fila, ela aparece aqui.'}</div>`}</div>`;
  keepQ();
}
function keepQ(){const e=$('#q');if(e&&S.keepQ){e.focus();e.setSelectionRange(e.value.length,e.value.length);S.keepQ=false}}
function msgHtml(m,i){
  if(m.f==='s')return `<div class="sys">${esc(m.x)} · ${esc(m.t)}</div>`;
  if(m.f==='n'){
    let h=esc(m.x);(m.mentions||[]).forEach(x=>{const p=person(x.k);h=h.split(esc('@'+p.name)).join(`<span class="mention">@${esc(p.name)}</span>`)});
    const tasks=(m.mentions||[]).map(x=>`<div class="mtask${x.done?' done':''}"><span>${esc(person(x.k).name)} · ${x.done?'resolvida às '+esc(x.at):'pendente'}</span>${!x.done&&x.k===me()?`<button type="button" class="btn" data-act="resolveMention" data-i="${i}" data-k="${esc(x.k)}">Marcar como resolvida</button>`:''}</div>`).join('');
    return `<div class="msg note"><div class="mh">Nota interna · só a equipe vê · ${esc(m.au)}</div><div class="mb">${h}</div>${tasks}<time>${esc(m.t)}</time></div>`;
  }
  const o=m.f==='a',cc=cur(),pv=cc&&i>0?cc.msgs[i-1]:null;
  const cont=pv&&pv.f===m.f&&(m.f==='c'||pv.au===m.au);
  const md=m.media?`<div class="mfile"><span class="mk">${esc(MK[m.media.k]||'Arquivo')}</span><span>${esc(m.media.n)}<br><small>${esc(m.media.s)}</small></span></div>`:'';
  return `<div class="msg ${o?'out':'in'}${cont?' cont':''}">${o&&!cont?`<div class="mh">${esc(m.au)}</div>`:''}${md}${m.x?`<div class="mb">${esc(m.x)}</div>`:''}<time>${esc(m.t.replace(/^ontem /,''))}${o?' '+saidaTick(m):''}</time>${o?saidaAcoes(m):''}</div>`;
}
function trayHtml(c){
  if(S.tray==='task')return tarefaTray(c);
  if(S.tray==='transfer'){
    const filas=QUEUES.filter(q=>q.id!=='minha'&&q.id!=='mencoes'&&q.id!=='todos');
    const pess=TEAM.filter(p=>p.k!==c.owner&&p.k!==me()),abertos=k=>convos.filter(x=>x.owner===k&&x.status!=='Resolvido').length;
    const modo=S.trMode==='pessoa'?'pessoa':'fila';
    const alvo=modo==='fila'
      ?`<label>Para qual fila?<select id="tq">${filas.filter(q=>q.id!==c.queue).map(q=>`<option value="${q.id}">${esc(q.name)}</option>`).join('')}</select></label>
        <span class="src">Entra na fila sem responsável; quem participa dela assume.</span>`
      :`<label>Para quem?<select id="tp">${pess.map(p=>`<option value="${esc(p.k)}">${esc(p.name)} · ${esc(p.role)} · ${abertos(p.k)} em aberto</option>`).join('')}</select></label>
        <label>Fila do atendimento<select id="tq2"><option value="">Manter em ${esc(qName(c.queue))}</option>${filas.filter(q=>q.id!==c.queue).map(q=>`<option value="${q.id}">Mudar para ${esc(q.name)}</option>`).join('')}</select></label>
        <span class="src">O atendimento vai direto para a “Minha fila” da pessoa escolhida.</span>`;
    return `<div class="tray"><div class="seg tr-modo" role="group" aria-label="Transferir para"><button type="button" data-act="trMode" data-v="fila" class="${modo==='fila'?'on':''}">Para uma fila</button><button type="button" data-act="trMode" data-v="pessoa" class="${modo==='pessoa'?'on':''}">Para um colega</button></div>
    ${alvo}
    <label>Motivo (opcional; quem recebe vê esta nota)<textarea id="tm" rows="2" placeholder="Ex.: cliente pediu avaliação de valores, precisa do advogado">${esc(S.trMotivo||'')}</textarea></label>
    <div class="row"><button class="btn" type="button" data-act="tray" data-v="">Cancelar</button><button class="btn pri" type="button" data-act="doTransfer">Transferir</button></div></div>`}
  if(S.tray==='close')return `<div class="tray"><label>Tema do atendimento<select id="ct">${TEMAS.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label>
    <label>Resumo curto (vai para o histórico do cliente no CRM)<textarea id="cr" rows="2" placeholder="O que foi tratado e o que ficou combinado"></textarea></label>
    <div class="row"><button class="btn" type="button" data-act="tray" data-v="">Cancelar</button><button class="btn pri" type="button" data-act="doClose">Encerrar atendimento</button></div></div>`;
  if(S.tray==='newquick')return `<div class="tray"><b>Nova resposta rápida</b>
    <label>Atalho (aparece ao digitar “/” na mensagem)<input id="qn" maxlength="20" placeholder="ex.: prazo"></label>
    <label>Texto da resposta<textarea id="qt" rows="4" placeholder="Use [Nome] para inserir o primeiro nome do cliente">${esc(S.nqText||'')}</textarea></label>
    <span class="src">Fica disponível para toda a equipe. Evite dados pessoais de clientes no texto.</span>
    <div class="row"><button class="btn" type="button" data-act="tray" data-v="">Cancelar</button><button class="btn pri" type="button" data-act="saveQuick">Salvar resposta</button></div></div>`;
  return '';
}
function renderChat(){
  const c=cur(),el=$('#chat');
  if(!c){el.innerHTML=`<div class="empty"><b>Selecione um atendimento</b>A conversa, as notas internas e a ficha do contato aparecem aqui.</div>`;return}
  const s=sla(c),done=c.status==='Resolvido';
  el.innerHTML=`<div class="ch"><button type="button" class="btn only-narrow" data-act="pane" data-v="list">← Lista</button>
    <span class="av">${esc(ini(c.name))}</span><div class="nm" title="${esc(c.name)} · ${esc(CANAIS[c.canal][0])} · ${esc(c.phone)} · Protocolo ${esc(c.proto)}"><h2>${esc(c.name)}</h2><div class="sub">${esc(CANAIS[c.canal][0])} · ${esc(c.phone)} · Protocolo ${esc(c.proto)}</div></div>
    <span class="ch-pills">${isTr(c)?`<span class="pill info">Transferido${c.trFrom?' de '+esc(c.trFrom):''}</span>`:''}<span class="pill ${s.s}">${esc(s.label)}</span></span>
    ${done?'':`<button type="button" class="btn" data-act="tray" data-v="transfer">Transferir</button><button type="button" class="btn res" data-act="tray" data-v="close">✓ Resolver</button>`}
    <span class="ch-mais"><button type="button" class="btn ic-sm" data-act="chMenu" aria-expanded="${S.chMenu?'true':'false'}" aria-label="Mais opções do atendimento" title="Status e mais opções">⋯</button>
    ${S.chMenu?`<div class="chmenu" role="menu"><label>Status<select id="stt" aria-label="Status">${STATUS.map(x=>`<option${x===c.status?' selected':''}>${x}</option>`).join('')}</select></label>
      <button type="button" class="btn" data-act="tray" data-v="task">+ Criar tarefa sobre o contato</button>
      <label class="chk"><input type="checkbox" id="paus"${c.pausa?' checked':''}${done?' disabled':''}> Aguardando cliente <span class="src">(pausa o prazo)</span></label>
      </div>`:''}</span>
    <button type="button" class="btn only-narrow" data-act="pane" data-v="side">Ficha e base</button></div>
    <div class="tagbar"><span class="tl">Tags</span>${c.tags.map(t=>`<span class="tag on ${tagC(t)}">${esc(t)}<button type="button" data-act="rmTag" data-t="${esc(t)}" aria-label="Remover ${esc(t)}">×</button></span>`).join('')||'<span class="src">Nenhuma</span>'}
      <button type="button" class="tag add" data-act="tagPick" aria-expanded="${S.tagPick?'true':'false'}">+ Tag</button></div>
    ${S.tagPick?`<div class="tagpick">${TAGS.filter(t=>!c.tags.includes(t)).map(t=>`<button type="button" class="tag add ${tagC(t)}" data-act="addTag" data-t="${esc(t)}">+ ${esc(t)}</button>`).join('')||'<span class="src">Todas as tags já foram adicionadas.</span>'}
      ${S.role==='admin'?`<span class="newtag"><input id="ntag" placeholder="Nova tag" maxlength="30"><span class="sw">${TC.map((x,i)=>`<button type="button" class="tg${i}${i===S_ntagc?' on':''}" data-act="pickColor" data-i="${i}" title="${x[0]}" aria-label="Cor ${x[0]}"></button>`).join('')}</span><button type="button" class="btn" data-act="newTag">Criar tag</button></span>`:'<span class="src" style="margin-left:auto">Só o administrador cria tags novas.</span>'}</div>`:''}
    ${trayHtml(c)}
    <div class="msgs" id="msgs">${c.msgs.map((m,i)=>{const d=/^ontem /.test(m.t)?'Ontem':'Hoje',pd=i>0?(/^ontem /.test(c.msgs[i-1].t)?'Ontem':'Hoje'):'';return (d!==pd?`<div class="dsep"><span>${d}</span></div>`:'')+msgHtml(m,i)}).join('')}${done?`<div class="sys">Encerrado · tema: ${esc(c.tema||'—')} · ${esc(c.resumo||'')}</div>`:''}</div>
    ${done?`<div class="done"><span>Atendimento encerrado.</span><button type="button" class="btn" data-act="reopen">Reabrir</button></div>`:
    `<div class="comp${S.mode==='nota'?' is-note':''}"><div class="cm"><div class="seg" role="group" aria-label="Tipo"><button type="button" data-act="mode" data-v="msg" class="${S.mode==='msg'?'on':''}">Mensagem</button><button type="button" data-act="mode" data-v="nota" class="${S.mode==='nota'?'on':''}">Nota interna</button></div>
      <span class="hint">${S.mode==='nota'?'Esta nota não é enviada ao cliente. Digite @ para marcar um colega.':'Será enviada ao cliente por '+CANAIS[c.canal][0]+'.'}</span></div>${S.mode==='msg'?avisoCanalComposer(c):''}
      ${S.mode==='msg'&&S.quickOpen?`<div class="quick">${Object.keys(QUICK).map(k=>`<button type="button" data-act="quick" data-k="${k}">${k}</button>`).join('')}<button type="button" data-act="newQuick" class="addq">+ Nova resposta</button></div>`:''}
      <div id="sug" class="sug" hidden></div>
      ${schedBox(c)}
      ${S.mode==='msg'&&(S.att[c.id]||[]).length?`<div class="atts">${S.att[c.id].map((a,i)=>`<span class="att"><span class="mk">${esc(MK[a.k]||'Arquivo')}</span><span class="an">${esc(a.n)}</span><small>${esc(a.s)}</small><button type="button" data-act="rmAtt" data-i="${i}" aria-label="Remover ${esc(a.n)}">×</button></span>`).join('')}</div>`:''}
      ${S.rec?`<div class="cr rec"><i class="rdot"></i><span>Gravando <b id="rt">0:00</b></span><span style="flex:1"></span><button type="button" class="btn" data-act="recCancel">Cancelar</button><button type="button" class="btn pri" data-act="recStop">Parar e anexar</button></div>`:`<div class="cr">${S.mode==='msg'?`<button type="button" class="btn ic${S.quickOpen?' on':''}" data-act="quickToggle" title="Respostas rápidas (ou digite / na mensagem)" aria-label="Respostas rápidas" aria-pressed="${S.quickOpen?'true':'false'}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg></button><button type="button" class="btn ic" data-act="attach" title="Anexar" aria-label="Anexar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button><input type="file" id="fl" multiple hidden><button type="button" class="btn ic" data-act="rec" title="Gravar áudio" aria-label="Gravar áudio"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><input type="file" id="fa" accept="audio/*" capture hidden>`:''}<textarea id="ta" rows="2" aria-label="Mensagem" placeholder="${S.mode==='nota'?'Escreva uma nota para a equipe. Use @ para marcar alguém':'Escreva a resposta ou digite / para atalhos'}"></textarea>${S.mode==='msg'?`<button type="button" class="btn ic" data-act="sched" title="Agendar envio" aria-label="Agendar envio"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></button>`:''}<button type="button" class="btn pri ic send" data-act="send" title="Enviar" aria-label="Enviar"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z"/></svg></button></div>`}</div>`}`;
  const ta=$('#ta');if(ta)ta.value=S.drafts[c.id+S.mode]||'';
  const m=$('#msgs');m.scrollTop=m.scrollHeight;
}
function fillText(x,c){return x.replace(/\[Nome\]/g,c?c.name.split(' ')[0]:'[Nome]')}
/* painel da direita retrátil: recolhido vira um trilho de ícones (só em telas largas; a escolha fica salva) */
const SIDE_IC={
 ficha:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/></svg>',
 notas:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8 9h8M8 12.5h5" stroke-linecap="round"/></svg>',
 midias:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5 12.4 19a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/></svg>',
 base:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z"/><path d="M12 6v13.5"/></svg>'};
try{S.sideMin=localStorage.getItem('np-ficha')==='min'}catch(e){}
const largo=()=>!window.matchMedia||!window.matchMedia('(max-width:899px)').matches;
function renderSide(){
  const c=cur(),el=$('#side');
  if(S.sideMin&&largo()){
    $('#app').classList.add('side-min');
    const n={notas:c?c.msgs.filter(m=>m.f==='n').length:0,midias:c?c.msgs.filter(m=>m.media).length:0};
    el.innerHTML=`<div class="srail"><button type="button" class="srail-b" data-act="sideMin" title="Abrir o painel" aria-label="Abrir o painel"><span aria-hidden="true">«</span></button>
      ${[['ficha','Ficha'],['notas','Notas'],['midias','Mídias'],['base','Base']].map(([k,l])=>`<button type="button" class="srail-b" data-act="sideOpen" data-v="${k}" title="${l}" aria-label="${l}${n[k]?' ('+n[k]+')':''}">${SIDE_IC[k]}<span>${l}</span>${n[k]?`<i>${n[k]}</i>`:''}</button>`).join('')}</div>`;
    return}
  $('#app').classList.remove('side-min');
  const head=`<div class="ph only-narrow"><button type="button" class="btn" data-act="pane" data-v="chat">← Conversa</button></div>
   <div class="sd-tabs">${[['ficha','Ficha'],['notas','Notas'+(c?` (${c.msgs.filter(m=>m.f==='n').length})`:'')],['midias','Mídias'+(c?` (${c.msgs.filter(m=>m.media).length})`:'')],['base','Base']].map(([k,l])=>`<button type="button" data-act="tab" data-v="${k}" class="${S.tab===k?'on':''}">${l}</button>`).join('')}<button type="button" class="sd-min" data-act="sideMin" title="Recolher o painel" aria-label="Recolher o painel">»</button></div>`;
  const pc=c?`<div class="pc"><span class="av">${esc(ini(c.name))}</span><b>${esc(c.name)}</b><span class="src">${esc(c.phone)}</span><span class="src">${esc(CANAIS[c.canal][0])}${c.org?' · '+esc(c.org):''}</span></div>`:'';
  let body='';
  if(S.tab==='notas'||S.tab==='midias'||S.tab==='tags'){
    if(!c)body=`<div class="empty"><b>Sem atendimento aberto</b>Abra uma conversa para ver os detalhes.</div>`;
    else if(S.tab==='notas'){
      const ns=c.msgs.filter(m=>m.f==='n');
      body=`<div class="sd"><div><h3>Notas internas</h3><span class="src">Só a equipe vê. Nada disso vai para o cliente.</span></div>${ns.length?ns.slice().reverse().map(m=>{
        let h=esc(m.x);(m.mentions||[]).forEach(x=>{const p=person(x.k);h=h.split(esc('@'+p.name)).join(`<span class="mention">@${esc(p.name)}</span>`)});
        return `<div class="nrow"><b>${esc(m.au)} · ${esc(m.t)}</b><span>${h}</span>${(m.mentions||[]).map(x=>`<span class="src">${esc(person(x.k).name)}: ${x.done?'resolvida':'pendente'}</span>`).join('')}</div>`}).join(''):'<span class="src">Nenhuma nota interna neste atendimento.</span>'}
        <p class="src" style="margin:0">Para escrever uma nota, use a aba “Nota interna” na caixa de mensagem.</p></div>`}
    else if(S.tab==='midias'){
      const all=c.msgs.filter(m=>m.media),ms=all.filter(m=>S.mfil==='todas'||(S.mfil==='recebidas'?m.f==='c':m.f==='a'));
      body=`<div class="sd"><div><h3>Mídias da conversa</h3><span class="src">Arquivos, imagens e áudios trocados neste atendimento.</span></div>
        <div class="seg" role="group" aria-label="Filtro">${[['todas','Todas'],['recebidas','Recebidas'],['enviadas','Enviadas']].map(([k,l])=>`<button type="button" data-act="mfil" data-v="${k}" class="${S.mfil===k?'on':''}">${l}</button>`).join('')}</div>
        ${ms.length?ms.map(m=>`<div class="mrow"><span class="mk">${esc(MK[m.media.k]||'Arquivo')}</span><span><b>${esc(m.media.n)}</b><br><span class="src">${m.f==='c'?'Recebida de '+esc(c.name):'Enviada por '+esc(m.au)} · ${esc(m.t)} · ${esc(m.media.s)}</span><br><button type="button" class="btn" style="margin-top:5px" data-act="soon">Abrir</button></span></div>`).join(''):'<span class="src">Nenhuma mídia neste filtro.</span>'}</div>`}
    else{
      const has=c.tags,free=TAGS.filter(t=>!has.includes(t)),canNew=S.role==='lider'||S.role==='admin';
      body=`<div class="sd"><div><h3>Tags deste contato</h3>${has.length?has.map(t=>`<span class="tag">${esc(t)}<button type="button" data-act="rmTag" data-t="${esc(t)}" aria-label="Remover ${esc(t)}">×</button></span>`).join(''):'<span class="src">Sem tags.</span>'}</div>
        <div><h3>Adicionar</h3>${free.length?free.map(t=>`<button type="button" class="tag add" data-act="addTag" data-t="${esc(t)}">+ ${esc(t)}</button>`).join(''):'<span class="src">Todas as tags já foram adicionadas.</span>'}</div>
        ${canNew?`<div><h3>Criar tag nova</h3><div style="display:flex;gap:6px"><input id="ntag" placeholder="Nome da tag" maxlength="30" style="flex:1;min-width:0;border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:5px 8px"><button type="button" class="btn" data-act="newTag">Criar</button></div></div>`:'<p class="src" style="margin:0">Só líderes e o administrador criam tags novas.</p>'}</div>`}
  }else if(S.tab==='ficha'){
    if(!c)body=`<div class="empty"><b>Sem atendimento aberto</b>A ficha vem do CRM quando você abre uma conversa.</div>`;
    else if(!c.ct)body=`<div class="sd"><div><h3>Contato não encontrado no CRM</h3><p class="src" style="margin:0">Nenhum cadastro com o telefone ${esc(c.phone)}.</p></div>
      <button type="button" class="btn" data-act="soon">Vincular a um contato existente</button><button type="button" class="btn pri" data-act="createCt">Criar contato no CRM</button></div>`;
    else{const k=c.ct;
      const inp=(f,v,ph)=>`<input data-ct="${f}" value="${esc(v)}" placeholder="${esc(ph||'')}" aria-label="${f}">`;
      const sel=(f,opts,v)=>`<select data-ct="${f}" aria-label="${f}">${(opts.some(o=>o[0]===v)||!v?opts:[[v,v]].concat(opts)).map(o=>`<option value="${esc(o[0])}"${o[0]===v?' selected':''}>${esc(o[1])}</option>`).join('')}${v?'':'<option value="" selected>Escolher…</option>'}</select>`;
      body=`<div class="sd"><div><h3>Dados do cliente</h3><span class="src">Os campos são editáveis e salvam ao sair do campo. Na versão real, gravam no CRM.</span></div>
      <dl class="kv"><dt>Nome</dt><dd>${inp('name',c.name,'Nome completo')}</dd><dt>Empresa</dt><dd>${inp('org',c.org||'','Empresa, se houver')}</dd>
      <dt>Tipo</dt><dd>${sel('tipo',['Lead','Cliente','Cliente PJ'].map(x=>[x,x]),k.tipo)}</dd><dt>Documento</dt><dd>${inp('doc',k.doc,'CPF ou CNPJ')}</dd>
      <dt>Setor</dt><dd>${sel('setor',OPQ().map(id=>[qName(id),qName(id)]),k.setor)}</dd>
      <dt>Telefone</dt><dd>${esc(c.phone)} <span class="src">(vem do WhatsApp, não editável)</span></dd></dl>
      <div><h3>Observações</h3><textarea data-ct="obs" rows="4" aria-label="Observações" placeholder="Anotações gerais sobre o cliente. Só a equipe vê.">${esc(k.obs||'')}</textarea></div>
      <div><h3>Contratos e processos</h3>${k.items.length?`<ul class="ul">${k.items.map((i,n)=>`<li>${esc(i)} <button type="button" class="xbtn" data-act="rmItem" data-i="${n}" aria-label="Remover ${esc(i)}">×</button></li>`).join('')}</ul>`:'<span class="src">Nenhum vinculado.</span>'}
        <div style="display:flex;gap:6px;margin-top:6px"><input id="ni" placeholder="Ex.: Capital de giro, Banco A" style="flex:1;min-width:0"><button type="button" class="btn" data-act="addItem">Adicionar</button></div></div>
      <div><h3>Tags</h3>${c.tags.length?c.tags.map(t=>`<span class="tag ${tagC(t)}">${esc(t)}</span>`).join(''):'<span class="src">Sem tags.</span>'}</div>
      <div><h3>Atendimentos anteriores</h3>${k.hist.length?`<div class="hist">${k.hist.map(h=>`<div><span>${esc(h[1])}<br><small class="src">${esc(h[0])}</small></span><span>${esc(h[2])}</span></div>`).join('')}</div>`:'<span class="src">Primeiro atendimento.</span>'}</div></div>`}
  }else if(S.kb){
    body=kbDetalheHtml(c);
  }else{
    body=kbListaHtml(c);
  }
  el.innerHTML=head+(S.tab==='base'?'':pc)+`<div class="scroll">${body}</div>`;
  const kq=$('#kbq');if(kq&&S.keepFocus){kq.focus();kq.setSelectionRange(kq.value.length,kq.value.length);S.keepFocus=false}
}
/* renderReports (Painel do gestor) fica em 15-painel.js */
function renderAll(){renderTop();renderQueues();renderList();renderChat();renderSide();if(S.view==='rel')renderReports();if(S.view==='fluxos')renderFluxos();if(S.view==='crm')renderCrm();if(S.view==='tarefas')renderTarefas();if(S.view==='ia')renderIA();if(S.view==='cfg')renderSettings();$('#app').dataset.pane=S.pane}

const fsize=b=>b<1024?b+' B':b<1048576?Math.max(1,Math.round(b/1024))+' KB':(b/1048576).toFixed(1).replace('.',',')+' MB';
const fkind=f=>{const t=f.type||'',n=(f.name||'').toLowerCase();return t.startsWith('image/')?'img':t.startsWith('audio/')?'audio':t.startsWith('video/')?'video':(t==='application/pdf'||n.endsWith('.pdf'))?'pdf':'doc'};
const fdur=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
let REC=null;
function recFallback(){toast('O navegador bloqueou o microfone neste protótipo. Escolha ou grave um arquivo de áudio; na versão publicada a gravação é direta.');const f=$('#fa');if(f)f.click()}
async function startRec(c){
  if(REC)return;
  if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder)){recFallback();return}
  try{
    const st=await navigator.mediaDevices.getUserMedia({audio:true}),mr=new MediaRecorder(st),ch=[];
    const r={mr,ch,t0:Date.now(),cid:c.id,keep:false,iv:null};REC=r;
    mr.ondataavailable=e=>{if(e.data&&e.data.size)ch.push(e.data)};
    mr.onstop=()=>{st.getTracks().forEach(t=>t.stop());clearInterval(r.iv);REC=null;S.rec=false;
      if(r.keep){const d=fdur(Math.max(1,Math.round((Date.now()-r.t0)/1000))),b=new Blob(ch,{type:mr.mimeType||'audio/webm'});
        (S.att[r.cid]=S.att[r.cid]||[]).push({k:'audio',n:'Áudio gravado '+d,s:d+' · '+fsize(b.size)})}
      renderChat()};
    mr.start();S.rec=true;renderChat();
    r.iv=setInterval(()=>{const e=$('#rt');if(e)e.textContent=fdur(Math.round((Date.now()-r.t0)/1000))},400);
  }catch(err){REC=null;S.rec=false;recFallback()}
}
function lmsg(t,k){const e=$('#lerr');e.hidden=!t;e.textContent=t||'';e.className=k==='ok'?'okm':'err'}
function finishLogin(r){S.auth=true;$('#lp').value='';$('#lgf').hidden=false;lmsg('');
  const sel=$('#role');sel.value=r;sel.dispatchEvent(new Event('change',{bubbles:true}))}
function sairDoApp(msg){cancelRec();if(SB.ligado()){SB.sair();TAREFAS.length=0;TK.carregado=false;AVISOS.length=0;Object.assign(PNL,{dados:null,chave:'',em:null,erro:''});Object.assign(IA,{carregado:false,erro:'',ed:null,edErro:'',confArq:null,rg:null,rgErro:'',desat:null,verArq:false})}S.auth=false;S.tray=null;$('#lp').value='';
  const ls=document.getElementById('lsenha');if(ls)ls.hidden=true;$('#lgf').hidden=false;lmsg(msg||'');renderTop()}
$('#lgf').addEventListener('submit',e=>{e.preventDefault();
  const em=nz($('#le').value).trim(),pw=$('#lp').value;
  if(!em||!pw){lmsg('Informe e-mail e senha.');return}
  if(SB.ligado()){sbEntrar(em,pw);return}
  const p=TEAM.find(x=>x.email&&nz(x.email)===em);
  if(!p){lmsg('E-mail não cadastrado. Peça ao administrador para cadastrar o seu e-mail em Configurações.');return}
  const r=Object.keys(ME).find(k=>ME[k]===p.k);
  if(!r){lmsg('Este usuário ainda não tem perfil de demonstração. Use um dos acessos abaixo.');return}
  finishLogin(r)});
function cancelRec(){if(REC){REC.keep=false;try{REC.mr.stop()}catch(e){}}}
const fmtW=w=>{const [d,t]=String(w).split('T');const p=d.split('-');return p[2]+'/'+p[1]+' '+(t||'').slice(0,5)};
function schedBox(c){
  if(S.mode!=='msg')return '';
  const L=(typeof SCHED!=='undefined'?SCHED:[]).filter(x=>x.c===c.id).sort((a,b)=>a.when<b.when?-1:1);
  const chips=L.length?`<div class="schl">${L.map(x=>`<span class="schc" title="${esc(x.x)}"><b>⏰ ${esc(fmtW(x.when))}</b> ${esc(x.x.length>46?x.x.slice(0,46)+'…':x.x)} <button type="button" class="xbtn" data-act="schedDel" data-id="${x.id}" aria-label="Cancelar agendamento">×</button></span>`).join('')}</div>`:'';
  const pan=S.sch?`<div class="schp"><b>Agendar esta mensagem</b><span class="src">Será enviada a ${esc(c.name)} no horário escolhido. Escreva o texto na caixa abaixo.</span><div class="row"><input type="datetime-local" id="schw" value="${S.schw||'2026-11-06T09:00'}"><button type="button" class="btn pri" data-act="schedOk">Agendar</button><button type="button" class="btn" data-act="sched">Cancelar</button></div></div>`:'';
  return chips+pan}
function send(){
  const c=cur(),ta=$('#ta');if(!c||!ta)return;const x=ta.value.trim();
  const at=S.mode==='msg'?(S.att[c.id]||[]):[];
  if(!x&&!at.length)return;
  if(S.mode==='msg'&&at.length){
    at.forEach((a,i)=>{const m={f:'a',au:me(),x:i===0?x:'',t:nowT(),media:{k:a.k,n:a.n,s:a.s}};c.msgs.push(m);enfileirarSaida(c,m)});
    S.att[c.id]=[];c.answered=true;c.waiting=0;c.pausa=false;if(c.status==='Aguardando')c.status='Em atendimento';if(!c.owner)c.owner=me();
    c.unread=false;S.drafts[c.id+S.mode]='';renderAll();$('#ta')&&$('#ta').focus();return}
  if(S.mode==='nota'){
    let t=x;TEAM.forEach(p=>{if(p.email)t=t.split('@'+p.email).join('@'+p.name)});
    const ms=TEAM.filter(p=>t.includes('@'+p.name)).map(p=>({k:p.k,done:false}));
    c.msgs.push({f:'n',au:me(),x:t,t:nowT(),mentions:ms});
    if(ms.length)toast(ms.map(m=>person(m.k).name).join(', ')+' será avisado no painel (exemplo).');
  }
  else{const m={f:'a',au:me(),x,t:nowT()};c.msgs.push(m);if(!enfileirarSaida(c,m)){c.msgs.pop();return}c.answered=true;c.waiting=0;c.pausa=false;if(c.status==='Aguardando')c.status='Em atendimento';if(!c.owner)c.owner=me()}
  c.unread=false;S.drafts[c.id+S.mode]='';renderAll();$('#ta')&&$('#ta').focus();
}
function setDraft(c,text){S.mode='msg';S.drafts[c.id+'msg']=text;S.pane='chat';renderAll();const t=$('#ta');t.focus();t.setSelectionRange(t.value.length,t.value.length)}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act,c=cur();
  switch(a){
   case 'view':S.view=b.dataset.v;renderAll();break;
   case 'theme':setTheme(isDark()?'light':'dark');break;
   case 'createCt':if(c){c.ct={tipo:'Lead',doc:'',setor:'',obs:'',items:[],tags:[],hist:[]};renderSide();toast('Contato criado. Preencha os dados da ficha (exemplo).')}break;
   case 'addItem':{const i=$('#ni'),v=i&&i.value.trim();if(c&&c.ct&&v){c.ct.items.push(v);renderSide();toast('Salvo no CRM (exemplo).')}break}
   case 'rmItem':if(c&&c.ct){c.ct.items.splice(+b.dataset.i,1);renderSide();toast('Salvo no CRM (exemplo).')}break;
   case 'demoLogin':if(!SB.ligado())finishLogin(b.dataset.r);break;
   case 'logout':sairDoApp('');break;
   case 'forgot':if(SB.ligado()){sbEsqueci(nz($('#le').value).trim());break}lmsg('Na versão real enviamos um link para redefinir a senha ao e-mail cadastrado.','ok');break;
   case 'rec':if(c)startRec(c);break;
   case 'recStop':if(REC){REC.keep=true;REC.mr.stop()}break;
   case 'recCancel':cancelRec();break;
   case 'attach':{const f=$('#fl');if(f)f.click();break}
   case 'rmAtt':if(c){S.att[c.id].splice(+b.dataset.i,1);renderChat()}break;
   case 'newQuick':S.nqText=($('#ta')||{}).value||'';S.tray='newquick';renderChat();break;
   case 'saveQuick':{const nm=nz($('#qn').value).replace(/[^a-z0-9]/g,''),tx=$('#qt').value.trim();
     if(!nm){toast('Dê um nome ao atalho, com letras e números.');break}
     if(!tx){toast('Escreva o texto da resposta.');break}
     const k='/'+nm;if(QUICK[k]){toast('Já existe o atalho '+k+'.');break}
     if(SB.ligado()){eqAcao(DB.equipe.criarResposta(k,tx).then(()=>{S.tray=null;S.nqText=''}),'Resposta rápida '+k+' criada para toda a equipe.');break}
     QUICK[k]=tx;QBY[k]=me();S.tray=null;S.nqText='';renderAll();toast('Resposta rápida '+k+' criada.');break}
   case 'delQuick':if(S.role==='admin'&&SB.ligado()){eqAcao(DB.equipe.excluirResposta(b.dataset.k),'Resposta rápida excluída.');break}
     if(S.role==='admin'){delete QUICK[b.dataset.k];renderSettings();renderChat();toast('Resposta rápida excluída.')}break;
   case 'qt':S.qt=b.dataset.v;S.keepQ=true;renderList();break;
   case 'qmenu':S.qopen=!S.qopen;renderList();break;
   case 'queue':S.qopen=false;S.queue=b.dataset.id;S.q='';S.pane='list';renderAll();break;
   case 'show':S.show=b.dataset.v;renderList();break;
   case 'open':cancelRec();S.chMenu=false;S.quickOpen=false;S.sel=b.dataset.id;const o=convos.find(x=>x.id===S.sel);if(o){o.unread=false;if(isTr(o))o.tr=false}S.tray=null;S.pane='chat';renderAll();break;
   case 'pane':S.pane=b.dataset.v;$('#app').dataset.pane=S.pane;break;
   case 'tab':S.tab=b.dataset.v;S.kb=null;renderSide();break;
   case 'kb':S.kb=b.dataset.id||null;renderSide();break;
   case 'sched':S.sch=!S.sch;renderChat();break;
   case 'schedOk':{const c=cur(),ta=$('#ta'),w=$('#schw').value,x=ta?ta.value.trim():'';if(!x){toast('Escreva a mensagem na caixa antes de agendar.');break}if(!w){toast('Escolha a data e a hora.');break}
     DB.agendar({id:uid('s'),c:c.id,when:w,x});LOGS.unshift({h:nowT(),r:'Mensagem agendada para '+fmtW(w),alvo:c.name,res:'Agendada'});S.drafts[c.id+'msg']='';S.sch=false;S.schw=w;c.msgs.push({f:'s',x:`${me()} agendou uma mensagem para ${fmtW(w)}`,t:nowT()});renderAll();toast('Mensagem agendada (simulação).');break}
   case 'schedDel':{DB.cancelarAgendada(b.dataset.id);renderChat();break}
   case 'mode':S.mode=b.dataset.v;renderChat();break;
   case 'quick':S.quickOpen=false;if(c)setDraft(c,fillText(QUICK[b.dataset.k],c));break;
   case 'quickToggle':S.quickOpen=!S.quickOpen;S.drafts[c.id+S.mode]=($('#ta')||{}).value||'';renderChat();break;
   case 'chMenu':S.chMenu=!S.chMenu;renderChat();break;
   case 'sideMin':S.sideMin=!S.sideMin;try{localStorage.setItem('np-ficha',S.sideMin?'min':'')}catch(e){}renderSide();break;
   case 'sideOpen':S.sideMin=false;S.tab=b.dataset.v;S.kb=null;try{localStorage.setItem('np-ficha','')}catch(e){}renderSide();break;
   case 'useQuick':if(c)setDraft(c,fillText(QUICK[b.dataset.k],c));break;
   case 'pickMention':{const ta=$('#ta'),p=person(b.dataset.k),pos=ta.selectionStart;
     const before=ta.value.slice(0,pos).replace(/@([^\s@]*)$/,'@'+p.name+' ');
     ta.value=before+ta.value.slice(pos);S.drafts[c.id+S.mode]=ta.value;$('#sug').hidden=true;ta.focus();ta.setSelectionRange(before.length,before.length);break}
   case 'resolveMention':{const m=c.msgs[+b.dataset.i],x=m.mentions.find(y=>y.k===b.dataset.k);x.done=true;x.at=nowT();
     c.msgs.push({f:'s',x:person(x.k).name+' marcou a menção como resolvida',t:nowT()});renderAll();break}
   case 'send':send();break;
   case 'tray':S.tray=b.dataset.v||null;S.trMotivo='';S.chMenu=false;renderChat();break;
   case 'trMode':S.trMotivo=($('#tm')||{}).value||'';S.trMode=b.dataset.v;renderChat();break;
   case 'doTransfer':{const m=$('#tm').value.trim();S.trMotivo='';
     if(S.trMode==='pessoa'){const tp=$('#tp');if(!tp||!tp.value){toast('Escolha para quem transferir.');break}
       const p=person(tp.value),from=c.queue,to=$('#tq2').value||from;
       c.msgs.push({f:'s',x:`${me()} transferiu para ${p.name}`+(to!==from?` (fila ${qName(from)} → ${qName(to)})`:''),t:nowT()});
       if(m)c.msgs.push({f:'n',au:me(),x:'Motivo da transferência: '+m,t:nowT()});
       c.queue=to;c.owner=p.k;c.tr=true;c.trFrom=me();c.trBy=me();c.status='Aguardando';c.answered=false;c.waiting=0;S.tray=null;
       if(c.ct){c.ct.resp=p.k;c.ct.setor=qName(to)}
       if(!canSee(c)){S.sel=null;S.pane='list'}
       toast(`Transferido para ${p.name}: já está na “Minha fila” de ${p.name.split(' ')[0]}${canSee(c)?'':'. Você não tem mais acesso a este atendimento'}.`);renderAll();break}
     const to=$('#tq').value,from=c.queue;c.msgs.push({f:'s',x:`${me()} transferiu de ${qName(from)} para ${qName(to)}`,t:nowT()});if(m)c.msgs.push({f:'n',au:me(),x:'Motivo da transferência: '+m,t:nowT()});
     c.queue=to;c.owner=null;c.tr=true;c.trFrom=qName(from);c.trBy=me();c.status='Aguardando';c.answered=false;c.waiting=0;S.tray=null;
     if(!canSee(c)){S.sel=null;S.pane='list';toast('Transferido para '+qName(to)+'. Você não tem acesso a essa fila.')}else toast('Transferido para '+qName(to)+'.');renderAll();break}
   case 'doClose':{const r=$('#cr').value.trim();if(!r){toast('Escreva um resumo curto do atendimento.');break}
     c.tema=$('#ct').value;c.resumo=r;c.status='Resolvido';c.msgs.push({f:'s',x:`${me()} encerrou o atendimento`,t:nowT()});S.tray=null;toast('Atendimento encerrado. Registro enviado ao CRM (exemplo).');renderAll();break}
   case 'reopen':c.status='Em atendimento';c.answered=false;c.waiting=0;c.msgs.push({f:'s',x:`${me()} reabriu o atendimento`,t:nowT()});S.show='atend';renderAll();break;
   case 'pickColor':{const v=($('#ntag')||{}).value;S_ntagc=+b.dataset.i;renderChat();const i=$('#ntag');if(i){i.value=v||'';i.focus()}break}
   case 'setTagColor':if(SB.ligado()){eqAcao(DB.equipe.salvarTag(b.dataset.t,+b.dataset.i),'');break}TAGCOL[b.dataset.t]=+b.dataset.i;renderSettings();renderChat();break;
   case 'newQueue':{if(S.role!=='admin')break;const i=$('#nq'),v=i.value.trim();if(!v){toast('Escreva o nome da fila.');break}
     if(QUEUES.some(q=>nz(q.name)===nz(v))){toast('Já existe uma fila com esse nome.');break}
     if(SB.ligado()){eqAcao(DB.equipe.criarFila(v),`Fila “${v}” criada. Marque quem participa dela em Usuários.`);break}
     const id='q'+Date.now().toString(36);QUEUES.push({id,name:v});CFG.sectors.push({id,days:'Seg–Sex',open:'08:00',close:'18:00',sla:15,ret:120,leader:''});
     recompute();renderAll();toast(`Fila “${v}” criada. Marque quem participa dela.`);break}
   case 'tagPick':S.tagPick=!S.tagPick;renderChat();break;
   case 'mfil':S.mfil=b.dataset.v;renderSide();break;
   case 'addTag':if(c&&!c.tags.includes(b.dataset.t)){c.tags.push(b.dataset.t);c.msgs.push({f:'s',x:`${me()} adicionou a tag “${b.dataset.t}”`,t:nowT()});renderChat();renderSide()}break;
   case 'rmTag':if(c){c.tags=c.tags.filter(t=>t!==b.dataset.t);c.msgs.push({f:'s',x:`${me()} removeu a tag “${b.dataset.t}”`,t:nowT()});renderChat();renderSide()}break;
   case 'newTag':{const i=$('#ntag'),v=i.value.trim();if(!v){toast('Escreva o nome da tag.');break}
     if(S.role!=='admin'){toast('Só o administrador cria tags novas.');break}
     if(SB.ligado()&&!TAGS.some(t=>nz(t)===nz(v))){const cc=c;eqAcao(DB.equipe.salvarTag(v,S_ntagc).then(tg=>{if(cc&&!cc.tags.includes(tg)){cc.tags.push(tg);cc.msgs.push({f:'s',x:`${me()} adicionou a tag “${tg}”`,t:nowT()})}}),'Tag “'+v+'” criada para toda a equipe.');break}
     if(!TAGS.some(t=>nz(t)===nz(v))){TAGS.push(v);TAGCOL[v]=S_ntagc}const tg=TAGS.find(t=>nz(t)===nz(v));if(c&&!c.tags.includes(tg)){c.tags.push(tg);c.msgs.push({f:'s',x:`${me()} adicionou a tag “${tg}”`,t:nowT()})}
     renderChat();renderSide();break}
   case 'soon':toast('Na versão real, abre o cadastro do CRM.');break;
  }
});
document.addEventListener('change',e=>{
  const f=e.target.dataset&&e.target.dataset.ct;
  if(f){const c=cur();if(!c)return;const v=e.target.value.trim();
    if(f==='obs'){c.ct.obs=e.target.value;toast('Observações salvas (exemplo).');return}
    if(f==='phone'||f==='resp')return;
    if(f==='name'&&!v){toast('O nome não pode ficar vazio.');renderSide();return}
    if(f==='name'||f==='org')c[f]=v;else c.ct[f]=v;
    renderList();renderChat();toast('Salvo no CRM (exemplo).');return}
  if(e.target.id==='fl'||e.target.id==='fa'){const c=cur();if(!c)return;S.att[c.id]=(S.att[c.id]||[]).concat([...e.target.files].map(f=>({k:fkind(f),n:f.name,s:fsize(f.size)})));renderChat();return}
  const g=e.target.dataset&&e.target.dataset.cfg;
  if(g==='user.todos'){const p=person(e.target.dataset.k);p.todos=e.target.checked;recompute();renderAll();
    toast(`${p.name} ${p.todos?'agora vê':'não vê mais'} a fila Todos os clientes.`);return}
  if(g==='user.fila'){const p=person(e.target.dataset.k),id=e.target.dataset.id;
    p.filas=e.target.checked?[...new Set([...p.filas,id])]:p.filas.filter(x=>x!==id);recompute();renderAll();
    toast(`${p.name} ${e.target.checked?'agora participa de':'saiu de'} ${qName(id)}.`);return}
  if(g){const [kind,f]=g.split('.');
    if(kind==='sector'){const s=CFG.sectors.find(x=>x.id===e.target.dataset.id);s[f]=(f==='sla'||f==='ret')?Math.max(1,+e.target.value||1):e.target.value;
      if(SB.ligado()){eqAcao(DB.equipe.salvarFila(s),'Setor '+qName(s.id)+' atualizado.');return}}
    else{const p=person(e.target.dataset.k);p[f]=e.target.value.trim();if(f==='perfil')renderSettings()}
    toast('Alteração registrada (exemplo).');return}
  if(e.target.id==='ntag')return;
  if(e.target.id==='role'){S.qopen=false;S.role=e.target.value;S.view='atend';S.tray=null;S.pane='list';
    S.queue=inQueue('mencoes').length||avisosPend().length?'mencoes':'minha';
    if(!convos.find(c=>c.id===S.sel&&canSee(c)))S.sel=null;
    if(S.queue==='mencoes'){const f=inQueue('mencoes')[0];if(f){S.sel=f.id}}
    renderAll();return}
  if(e.target.id==='cfil'){S.canal=e.target.value;renderList();return}
  if(e.target.id==='paus'){const c=cur();if(c){c.pausa=e.target.checked;renderAll()}return}
  if(e.target.id==='stt'){const c=cur();if(!c)return;if(e.target.value==='Resolvido'){e.target.value=c.status;S.tray='close';renderChat();return}
    c.status=e.target.value;c.pausa=false;if(c.status==='Em atendimento'&&!c.owner)c.owner=me();renderAll()}
});
document.addEventListener('input',e=>{
  const c=cur();
  if(e.target.id==='ta'&&c){const ta=e.target,v=ta.value,sg=$('#sug');S.drafts[c.id+S.mode]=v;let h='';
    if(S.mode==='msg'&&/^\/\w*$/.test(v)){h=Object.keys(QUICK).filter(k=>k.startsWith(v)).map(k=>`<button type="button" data-act="useQuick" data-k="${k}"><b>${k}</b> <span class="src">${esc(QUICK[k].slice(0,60))}…</span></button>`).join('')}
    else if(S.mode==='nota'){const mm=v.slice(0,ta.selectionStart).match(/@([^\s@]*)$/);
      if(mm){const q=nz(mm[1]);h=TEAM.filter(p=>!q||nz(p.name).includes(q)||nz(p.email).startsWith(q)).map(p=>`<button type="button" data-act="pickMention" data-k="${esc(p.k)}"><b>${esc(p.name)}</b> <span class="src">${esc(p.email||p.role)}</span></button>`).join('')}}
    sg.hidden=!h;sg.innerHTML=h}
  if(e.target.id==='q'){S.q=e.target.value;S.keepQ=true;renderList();return}
  if(e.target.id==='kbq'){S.kbq=e.target.value;S.keepFocus=true;renderSide()}
});
/* menu "⋯" da conversa fecha ao clicar fora */
document.addEventListener('click',e=>{if(S.chMenu&&!e.target.closest('.ch-mais')){S.chMenu=false;renderChat()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.chMenu){S.chMenu=false;renderChat()}});
document.addEventListener('keydown',e=>{if(e.target.id==='ta'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
