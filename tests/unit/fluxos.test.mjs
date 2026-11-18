// Construtor de fluxos com IA (Edge Function fluxos-ia): plano plano -> árvore, validação contra o catálogo e permissões.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {arvoreDoPlano,pendencias,processarFluxoIA,montarPedidoFluxo,ESQUEMA_FLUXO,planoDaArvore,CATALOGO} from '../../supabase/functions/_shared/fluxos.ts';

const OP={filas:[['triagem','Triagem'],['passivos','Gestão de Passivos PJ']],tags:[['PJ','PJ']],funis:[['pj','Gestão de Passivos PJ']],
  etapas:{pj:[['Novo lead','Novo lead'],['Proposta enviada','Proposta enviada'],['Negociação','Negociação']]},pessoas:[['u1','Gabriel']],
  respostas:[['/dados','/dados']],origens:[['Meta Ads','Meta Ads']],perdas:[['Sem resposta','Sem resposta']],campos:[['banco','Banco principal']],fluxos:[]};
const J=o=>JSON.stringify(o);

test('plano_vira_arvore_com_caminhos',()=>{
  const {definicao:d,avisos}=arvoreDoPlano({nome:'x',resumo:'',avisos:[],gatilhos:[{tipo:'etapa_mudou',config_json:J({funil:'pj',etapa:'Proposta enviada'})}],
    passos:[{id:'a',pai:'',ramo:'',tipo:'aguardar',config_json:J({quantidade:2,unidade:'dias'})},
            {id:'b',pai:'',ramo:'',tipo:'aguardar_resposta',config_json:J({horas:48})},
            {id:'c',pai:'b',ramo:'Não respondeu',tipo:'criar_tarefa',config_json:J({titulo:'Ligar',responsavel:'u1',em_horas:4})},
            {id:'d',pai:'b',ramo:'respondeu',tipo:'fim',config_json:'{}'}]},OP);
  assert.equal(d.gatilhos[0].cfg.etapa,'Proposta enviada');
  assert.deepEqual(d.passos.map(p=>p.tipo),['aguardar','aguardar_resposta']);
  const r=d.passos[1].ramos;assert.deepEqual(r.map(x=>x.nome),['Respondeu','Não respondeu']);
  assert.equal(r[0].passos[0].tipo,'fim','ramo encontrado sem diferenciar maiúsculas');assert.equal(r[1].passos[0].cfg.responsavel,'u1');
  assert.deepEqual(avisos,[]);assert.deepEqual(pendencias(d,OP),[]);
});
test('valor_inventado_pela_ia_vira_pendencia_e_fica_vazio',()=>{
  const {definicao:d,avisos}=arvoreDoPlano({nome:'x',resumo:'',avisos:[],gatilhos:[{tipo:'tag_adicionada',config_json:J({tag:'VIP'})}],
    passos:[{id:'a',pai:'',ramo:'',tipo:'transferir',config_json:J({fila:'trabalhista'})},{id:'b',pai:'',ramo:'',tipo:'webhook',config_json:J({url:'http://inseguro'})}]},OP);
  assert.equal(d.gatilhos[0].cfg.tag,'');assert.equal(d.passos[0].cfg.fila,'');assert.equal(d.passos[1].cfg.url,'');
  assert.ok(avisos.some(a=>/VIP/.test(a))&&avisos.some(a=>/trabalhista/.test(a))&&avisos.some(a=>/https/.test(a)),avisos.join(' | '));
  assert.ok(pendencias(d,OP).length>=3);
});
test('etapa_precisa_ser_do_funil_escolhido',()=>{
  const {definicao:d}=arvoreDoPlano({nome:'x',resumo:'',avisos:[],gatilhos:[{tipo:'etapa_mudou',config_json:J({funil:'pj',etapa:'Audiência'})}],passos:[{id:'a',pai:'',ramo:'',tipo:'fim',config_json:'{}'}]},OP);
  assert.equal(d.gatilhos[0].cfg.etapa,'');
});
test('tipos_desconhecidos_e_passos_depois_de_ramificar_sao_tratados',()=>{
  const {definicao:d,avisos}=arvoreDoPlano({nome:'x',resumo:'',avisos:['algo ficou de fora'],gatilhos:[{tipo:'nao_existe',config_json:'{}'}],
    passos:[{id:'a',pai:'',ramo:'',tipo:'se',config_json:J({sujeito:'tag',operador:'e',valor:'PJ'})},{id:'b',pai:'',ramo:'',tipo:'mensagem',config_json:J({texto:'Oi'})},
            {id:'c',pai:'zz',ramo:'Sim',tipo:'tag_adicionar',config_json:J({tag:'PJ'})},{id:'d',pai:'',ramo:'',tipo:'enviar_email',config_json:'{}'}]},OP);
  assert.equal(d.gatilhos.length,0);assert.equal(d.passos.length,1,'nada depois do Se/senão');
  assert.deepEqual(d.passos[0].ramos[0].passos.map(p=>p.tipo),['mensagem','tag_adicionar'],'o resto foi para o caminho Sim');
  assert.ok(avisos.includes('algo ficou de fora')&&avisos.some(a=>/nao_existe/.test(a))&&avisos.some(a=>/enviar_email/.test(a)));
});
test('plano_da_arvore_guarda_pai_e_caminho',()=>{
  const {definicao:d}=arvoreDoPlano({nome:'x',resumo:'',avisos:[],gatilhos:[],passos:[{id:'h',pai:'',ramo:'',tipo:'horario',config_json:J({fila:'triagem'})},
    {id:'t',pai:'h',ramo:'Fora do horário',tipo:'transferir',config_json:J({fila:'passivos'})}]},OP);
  assert.deepEqual(d.passos[0].ramos.map(r=>[r.nome,r.passos.length]),[['Dentro do horário',0],['Fora do horário',1]]);
  const plano=planoDaArvore(d);assert.equal(plano.passos[1].pai,d.passos[0].id);assert.equal(plano.passos[1].ramo,'Fora do horário');
});
test('menus_e_perguntas_nao_existem_mais',()=>{
  const {definicao:d,avisos}=arvoreDoPlano({nome:'x',resumo:'',avisos:[],gatilhos:[],passos:[{id:'m',pai:'',ramo:'',tipo:'menu',config_json:'{}'},{id:'p',pai:'',ramo:'',tipo:'pergunta',config_json:'{}'}]},OP);
  assert.equal(d.passos.length,0);assert.ok(avisos.some(a=>/menu/.test(a))&&avisos.some(a=>/pergunta/.test(a)));
  assert.ok(!CATALOGO.acoes.some(x=>['menu','pergunta','coletar'].includes(x.tipo)));
});
test('esquema_sem_recursao_e_com_additionalProperties_false',()=>{
  const objs=[];const w=o=>{if(o&&typeof o==='object'){if(o.type==='object')objs.push(o);Object.values(o).forEach(w)}};w(ESQUEMA_FLUXO);
  assert.ok(objs.length>=3&&objs.every(o=>o.additionalProperties===false));assert.ok(!JSON.stringify(ESQUEMA_FLUXO).includes('$ref'));
  assert.equal(ESQUEMA_FLUXO.properties.passos.items.properties.tipo.enum.length,CATALOGO.acoes.length);
});
test('pedido_leva_catalogo_opcoes_e_regras_mas_nenhum_dado_de_cliente',()=>{
  const {system,usuario}=montarPedidoFluxo(OP,'Follow-up de proposta',null);
  assert.match(system,/criar_tarefa/);assert.match(system,/"u1" \(Gabriel\)/);assert.match(system,/etapas do funil "pj"/);assert.match(system,/NUNCA citar valores/);
  assert.match(usuario,/Monte este fluxo: Follow-up de proposta/);
  const alt=montarPedidoFluxo(OP,'troque a espera para 3 dias',{gatilhos:[{id:'g',tipo:'tag_adicionada',cfg:{tag:'PJ'}}],passos:[]});assert.match(alt.usuario,/Fluxo atual/);
});
const deps=(o={})=>({modelo:'claude-opus-5-5',ehLider:async t=>{deps.t=t;return o.lider??true},opcoes:async()=>OP,
  provedor:()=>({gerar:async a=>{deps.args=a;return o.saida??{texto:J({nome:'Follow-up',resumo:'Espera e liga.',avisos:[],gatilhos:[{tipo:'etapa_mudou',config_json:J({funil:'pj',etapa:'Proposta enviada'})}],
    passos:[{id:'1',pai:'',ramo:'',tipo:'criar_tarefa',config_json:J({titulo:'Ligar',responsavel:'u1'})}]})}}})});
test('edge_function_exige_lider_e_devolve_proposta',async()=>{
  assert.equal((await processarFluxoIA(deps(),null,{pedido:'monte algo'})).status,401);
  assert.equal((await processarFluxoIA(deps({lider:false}),'Bearer T',{pedido:'monte algo'})).status,403);
  assert.equal((await processarFluxoIA(deps(),'Bearer T',{pedido:'oi'})).status,400);
  const r=await processarFluxoIA(deps(),'Bearer T',{pedido:'Quando for para proposta enviada, criar tarefa para o Gabriel'});
  assert.equal(r.status,200);assert.equal(r.corpo.nome,'Follow-up');assert.equal(r.corpo.definicao.passos[0].cfg.responsavel,'u1');
  assert.equal(deps.args.esquema,ESQUEMA_FLUXO);
});
test('recusa_e_resposta_fora_do_formato',async()=>{
  assert.equal((await processarFluxoIA(deps({saida:{texto:'',recusou:true}}),'Bearer T',{pedido:'monte algo'})).status,422);
  assert.equal((await processarFluxoIA(deps({saida:{texto:'não é json'}}),'Bearer T',{pedido:'monte algo'})).status,502);
});

test('se_com_varias_condicoes_e_formato_antigo',()=>{
  const {definicao:d,avisos}=arvoreDoPlano({nome:'x',resumo:'',avisos:[],gatilhos:[{tipo:'cliente_sem_responder',config_json:J({minutos:60})}],
    passos:[{id:'s',pai:'',ramo:'',tipo:'se',config_json:J({modo:'qualquer',condicoes:[{sujeito:'tag',operador:'e',valor:'PJ'},{sujeito:'etapa',operador:'nao_e',valor:'Negociação'},{sujeito:'humor',operador:'e',valor:'x'},{sujeito:'canal',operador:'e',valor:'telegram'}]})},
            {id:'v',pai:'',ramo:'',tipo:'se',config_json:J({sujeito:'valor',operador:'maior',valor:'10000'})}]},OP);
  const se=d.passos[0].ramos[0].passos.length?null:d.passos[0];
  assert.equal(d.gatilhos[0].cfg.minutos,60);
  assert.equal(d.passos[0].cfg.modo,'qualquer');
  assert.deepEqual(d.passos[0].cfg.condicoes.map(q=>q.sujeito+':'+q.valor),['tag:PJ','etapa:Negociação','canal:'],'sujeito inventado sai; valor inventado fica vazio');
  assert.ok(avisos.some(a=>/humor/.test(a))&&avisos.some(a=>/telegram/.test(a)),avisos.join(' | '));
  assert.deepEqual(d.passos[0].ramos[0].passos[0].cfg.condicoes,[{sujeito:'valor',operador:'maior',valor:'10000'}],'formato antigo vira lista (e foi para o caminho Sim)');
  assert.ok(pendencias(d,OP).some(p=>/falta o valor/.test(p)));
});
