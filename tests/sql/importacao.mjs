// Importação de leads no banco (crm_0021). A = admin, B = atendente, L = líder do comercial.
export default async function({db,q,t,err,A,B}){
  console.log('\n— Importação de leads (crm_0021)');
  const L=(await db.query(`insert into auth.users(email) values ('lider-imp@x') returning id`)).rows[0].id;
  await db.exec(`insert into crm.acessos values ('${L}','comercial','lider'),('${L}','atendimento','lider');
    insert into crm.fila_membros(fila_ref,user_id) values ('comercial','${L}') on conflict do nothing`);
  const J=o=>JSON.stringify(o).replace(/'/g,"''");
  const iniciar=(o={})=>q(`select crm.importacao_iniciar('${o.lote||'GCV nov/2026'}','gcv.csv','pj','Indicação',${o.atualizar??true},${o.disparar??false},${o.total??10}) id`,L).then(r=>r.rows[0].id);
  const proc=(id,linhas)=>q(`select crm.importacao_processar('${id}','${J(linhas)}'::jsonb) r`,L).then(r=>r.rows[0].r);
  const neg=async tel=>(await db.query(`select n.*, e.nome etapa, o.nome origem, m.nome motivo from crm.negocios n join crm.funil_etapas e on e.id=n.etapa_id left join crm.origens o on o.id=n.origem_id left join crm.motivos_perda m on m.id=n.motivo_perda_id where n.telefone_norm='${tel}'`)).rows[0];

  t('atendente não importa',/só líderes e administradores/.test(await err(()=>q(`select crm.importacao_iniciar('x','x','pj','Indicação')`,B))));
  t('mais de 5000 linhas é recusado',/até 5000 linhas/.test(await err(()=>iniciar({total:6000}))));
  const I1=await iniciar();
  t('mais de 500 linhas por parte é recusado',/no máximo 500/.test(await err(()=>proc(I1,Array.from({length:501},(_,i)=>({n:i,nome:'x'}))))));
  let r=await proc(I1,[
    {n:2,nome:'Imp  Um',empresa:'Um ME',telefone:'(16) 97000-0001',email:'um@x.com',etapa:'Qualificado',dono:L,valor:'45000',entrada:'2026-10-02',origem:'Meta Ads',tags:'PJ',obs:'Ligou 2x',ext:'IMP-1'},
    {n:3,nome:'Imp Dois',telefone:'16 97000-0002',etapa:'Perdido',perda:'Motivo inventado'},
    {n:4,nome:'Imp Três',telefone:'16 97000-0003',etapa:'Audiência'},
    {n:5,act:'ignorar',nome:'',erros:['Sem nome e sem telefone']},
    {n:6,nome:'Imp Um (de novo)',telefone:'+55 16 97000-0001',valor:'50000',etapa:'Negociação'},
    {n:7,nome:'Imp Quatro',telefone:'16 97000-0004',dono:'00000000-0000-0000-0000-000000000000',origem:'Inventada'}]);
  t('parte processada: 4 criados, 1 atualizado, 1 ignorado',r.criados===4&&r.atualizados===1&&r.ignorados===1,JSON.stringify(r));
  let n=await neg('16970000001');
  t('lead criado com dono, origem, e-mail, ID externo e data de entrada',n.nome==='Imp Um'&&n.responsavel_id===L&&n.origem==='Meta Ads'&&n.email==='um@x.com'&&n.externo_id==='IMP-1'&&new Date(n.created_at).toISOString().startsWith('2026-10-02'),JSON.stringify({nome:n.nome,origem:n.origem,c:n.created_at}));
  t('a linha repetida atualizou o mesmo negócio (etapa e valor), sem duplicar',n.etapa==='Negociação'&&Number(n.valor)===50000&&(await db.query(`select count(*)::int n from crm.negocios where telefone_norm='16970000001'`)).rows[0].n===1);
  r=await db.query(`select string_agg(pergunta||'='||resposta,'; ' order by pergunta) x from crm.respostas_formulario where negocio_id='${n.id}'`);t('etiquetas e observação vão para o formulário do negócio',r.rows[0].x==='Etiquetas=PJ; Observação da importação=Ligou 2x',r.rows[0].x);
  n=await neg('16970000002');t('perdido com motivo desconhecido vira "Fora do perfil" e fica fechado',n.etapa==='Perdido'&&n.motivo==='Fora do perfil'&&!!n.fechado_em);
  n=await neg('16970000003');t('etapa de outro funil vai para a primeira etapa',n.etapa==='Novo lead');
  n=await neg('16970000004');t('responsável desconhecido fica vazio e origem desconhecida vira a padrão',n.responsavel_id===null&&n.origem==='Indicação');
  r=await db.query(`select linha,acao,avisos,erros from crm.importacao_linhas where importacao_id='${I1}' order by linha`);
  t('cada linha registrada com ação e avisos',r.rows.length===6&&r.rows.find(x=>x.linha===4).avisos.some(a=>/Audiência/.test(a))&&r.rows.find(x=>x.linha===5).acao==='ignorar'&&r.rows.find(x=>x.linha===7).avisos.some(a=>/Inventada/.test(a)),JSON.stringify(r.rows));
  r=await db.query(`select count(*)::int n from crm.fluxo_eventos e join crm.negocios g on g.id=e.negocio_id where g.importacao_id='${I1}'`);t('importação não dispara fluxos',r.rows[0].n===0);
  r=await q(`select crm.importacao_concluir('${I1}') r`,L);t('concluir devolve o total do lote',r.rows[0].r.criados===4&&r.rows[0].r.lote==='GCV nov/2026');
  t('lote concluído não recebe mais linhas',/já concluída/.test(await err(()=>proc(I1,[{n:1,nome:'x'}]))));

  // segundo lote: sem atualizar existentes e com fluxos ligados para os novos
  const I2=await iniciar({lote:'Lote 2',atualizar:false,disparar:true});
  r=await proc(I2,[{n:2,nome:'Já existe',telefone:'16 97000-0001'},{n:3,nome:'Imp Cinco',telefone:'16 97000-0005'}]);
  t('sem "atualizar existentes", o que já existe é ignorado',r.criados===1&&r.ignorados===1);
  r=await db.query(`select erros from crm.importacao_linhas where importacao_id='${I2}' and linha=2`);t('motivo do ignorado registrado',/atualizar existentes/.test(r.rows[0].erros[0]));
  r=await db.query(`select count(*)::int n from crm.fluxo_eventos e where e.negocio_id=(select id from crm.negocios where telefone_norm='16970000005') and e.tipo='negocio_criado'`);
  t('com a opção ligada, o lead novo dispara os fluxos',r.rows[0].n===1);
  await q(`select crm.importacao_concluir('${I2}')`,L);

  // desfazer
  t('líder não desfaz importação',/só o administrador/.test(await err(()=>q(`select crm.importacao_desfazer('${I1}')`,L))));
  r=await q(`select crm.importacao_desfazer('${I1}') n`,A);t('admin desfaz: apaga os 4 negócios criados pelo lote',r.rows[0].n===4);
  r=await db.query(`select count(*)::int n from crm.negocios where telefone_norm in ('16970000001','16970000002','16970000003','16970000004')`);t('negócios do lote apagados',r.rows[0].n===0);
  t('não desfaz duas vezes',/já desfeita/.test(await err(()=>q(`select crm.importacao_desfazer('${I1}')`,A))));
  t('ninguém grava lote direto na tabela',/permission denied/.test(await err(()=>q(`insert into crm.importacoes(lote) values ('x')`,L))));
}
