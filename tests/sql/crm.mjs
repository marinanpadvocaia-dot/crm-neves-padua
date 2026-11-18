// Testes da aba CRM ligada ao banco (crm_0016). A = admin, B = atendente só do atendimento, V = comercial, L = líder.
export default async function({db,q,t,err,A,B}){
  console.log('\n— CRM no banco (crm_0016)');
  const novo=async e=>(await db.query(`insert into auth.users(email) values ('${e}') returning id`)).rows[0].id;
  const V=await novo('vendas@x'),L=await novo('lider-crm@x');
  await db.exec(`insert into crm.acessos values ('${V}','comercial','atendente'),('${V}','atendimento','atendente'),('${L}','comercial','lider');
    insert into crm.filas_config(fila_ref,nome) values ('comercial','Comercial') on conflict do nothing;
    insert into crm.fila_membros(fila_ref,user_id) values ('comercial','${V}'),('comercial','${L}') on conflict do nothing`);   // CRM só do setor comercial (crm_0024)

  // criar negócio
  let r=await q(`select crm.negocio_criar('pj','  Oficina   Teste ',15000,'Meta Ads','Oficina ME','16 99999-0001') id`,V);const N=r.rows[0].id;
  r=await db.query(`select n.nome,e.nome etapa,n.responsavel_id=('${V}')::uuid dono,o.nome origem,n.probabilidade p,n.telefone_norm tn
    from crm.negocios n join crm.funil_etapas e on e.id=n.etapa_id left join crm.origens o on o.id=n.origem_id where n.id='${N}'`);
  t('negócio criado na 1ª etapa, com dono, origem e telefone normalizado',r.rows[0].nome==='Oficina Teste'&&r.rows[0].etapa==='Novo lead'&&r.rows[0].dono&&r.rows[0].origem==='Meta Ads'&&r.rows[0].p===10&&r.rows[0].tn==='16999990001',JSON.stringify(r.rows[0]));
  t('funil inexistente é recusado',/funil não encontrado/.test(await err(()=>q(`select crm.negocio_criar('xx','Nome')`,V))));
  t('nome vazio é recusado',/escreva o nome/.test(await err(()=>q(`select crm.negocio_criar('pj','  ')`,V))));
  t('sem acesso ao comercial não cria negócio',/sem acesso à área comercial/.test(await err(()=>q(`select crm.negocio_criar('pj','X')`,B))));

  // mover de etapa
  const et=async n=>(await db.query(`select e.id from crm.funil_etapas e join crm.funis f on f.id=e.funil_id where f.slug='pj' and e.nome='${n}'`)).rows[0].id;
  const PERD=await et('Perdido'),GANHO=await et('Ganho');
  t('perder sem motivo é recusado',/motivo da perda/.test(await err(()=>q(`update crm.negocios set etapa_id='${PERD}' where id='${N}'`,V))));
  await q(`update crm.negocios set etapa_id='${await et('Qualificado')}' where id='${N}'`,V);
  await q(`update crm.negocios set etapa_id='${await et('Perdido')}', motivo_perda_id=(select id from crm.motivos_perda where nome='Sem resposta') where id='${N}'`,V);
  r=await db.query(`select count(*)::int n, bool_and(user_id=('${V}')::uuid) u from crm.negocio_historico where negocio_id='${N}'`);
  t('histórico gravado pelo banco, com quem mudou',r.rows[0].n===2&&r.rows[0].u===true,JSON.stringify(r.rows[0]));
  await q(`update crm.negocios set etapa_id='${await et('Negociação')}' where id='${N}'`,V);
  r=await db.query(`select motivo_perda_id is null m, fechado_em is null f, etapa_max_ordem o from crm.negocios where id='${N}'`);
  t('reabrir limpa motivo e fechamento e guarda a etapa máxima',r.rows[0].m&&r.rows[0].f&&r.rows[0].o===6,JSON.stringify(r.rows[0]));
  t('ninguém grava histórico à mão',/permission denied/.test(await err(()=>q(`insert into crm.negocio_historico(negocio_id,para_etapa_id) values ('${N}','${GANHO}')`,V))));
  t('equipe não muda etapas do funil',/permission denied/.test(await err(()=>q(`update crm.funil_etapas set probabilidade=99`,A))));
  t('equipe não muda origens',/permission denied/.test(await err(()=>q(`insert into crm.origens(nome) values ('X')`,V))));
  await q(`update crm.negocios set campos='{"banco":"Banco A"}', previsao_fechamento='2026-12-01', valor=20000 where id='${N}'`,V);
  r=await db.query(`select campos->>'banco' b, valor::int v from crm.negocios where id='${N}'`);t('comercial edita valor, previsão e campos do negócio',r.rows[0].b==='Banco A'&&r.rows[0].v===20000);

  // atividades
  await q(`insert into crm.atividades(negocio_id,tipo,titulo,quando) values ('${N}','ligacao','Ligar','2026-11-20 10:00-03')`,V);
  r=await db.query(`select id, responsavel_id=('${V}')::uuid d, criado_por=('${V}')::uuid c from crm.atividades where negocio_id='${N}'`);const T1=r.rows[0].id;
  t('atividade fica com quem criou como responsável',r.rows[0].d&&r.rows[0].c);
  await q(`update crm.atividades set concluida=true where id='${T1}'`,V);
  r=await db.query(`select concluida_em is not null c from crm.atividades where id='${T1}'`);t('concluir preenche a data de conclusão',r.rows[0].c===true);
  await q(`update crm.atividades set concluida=false where id='${T1}'`,V);
  r=await db.query(`select concluida_em is null c from crm.atividades where id='${T1}'`);t('reabrir limpa a data de conclusão',r.rows[0].c===true);
  r=await q(`delete from crm.atividades where id='${T1}' returning id`,V);t('atendente não exclui atividade (só líder)',r.rows.length===0);
  r=await q(`delete from crm.atividades where id='${T1}' returning id`,L);t('líder exclui atividade',r.rows.length===1);

  // campos personalizados
  t('só administrador cria campo',/só o administrador/.test(await err(()=>q(`select crm.campo_criar('Vara','texto')`,V))));
  r=await q(`select crm.campo_criar('Data da citação','data') c`,A);t('campo criado com chave sem acento',r.rows[0].c==='data_da_citacao',r.rows[0].c);
  t('lista sem opções é recusada',/opções da lista/.test(await err(()=>q(`select crm.campo_criar('Porte','lista',array[' '])`,A))));
  r=await q(`select crm.campo_criar('Porte','lista',array['ME','EPP','ME']) c`,A);
  r=await db.query(`select opcoes from crm.campos_personalizados where chave='porte'`);t('opções da lista sem repetição',r.rows[0].opcoes.length===2);
  t('nome de campo repetido é recusado',/já existe um campo/.test(await err(()=>q(`select crm.campo_criar('porte','texto')`,A))));
  r=await q(`select crm.campo_criar('1º contato','texto') c`,A);t('chave sempre começa com letra',/^c_1/.test(r.rows[0].c),r.rows[0].c);
  await q(`select crm.campo_excluir('porte')`,A);
  r=await db.query(`select count(*)::int n from crm.campos_personalizados where chave='porte'`);t('admin exclui campo',r.rows[0].n===0);

  // tempo médio por etapa (histórico real), no funil Comercial só com este negócio (crm_0024: um funil só)
  await db.exec(`delete from crm.negocios where funil_id=(select id from crm.funis where slug='pj')`);
  const ea=async n=>(await db.query(`select e.id from crm.funil_etapas e join crm.funis f on f.id=e.funil_id where f.slug='pj' and e.nome='${n}'`)).rows[0].id;
  const N2=(await q(`select crm.negocio_criar('pj','Tempo Teste') id`,V)).rows[0].id;
  await db.exec(`update crm.negocios set created_at=now()-interval '10 days' where id='${N2}'`);
  await q(`update crm.negocios set etapa_id='${await ea('Em contato')}' where id='${N2}'`,V);
  await db.exec(`update crm.negocio_historico set criado_em=now()-interval '4 days' where negocio_id='${N2}'`);
  await q(`update crm.negocios set etapa_id='${await ea('Qualificado')}' where id='${N2}'`,V);
  r=await q(`select e.nome, t.dias::float d from crm.crm_tempo_etapas((select id from crm.funis where slug='pj')) t join crm.funil_etapas e on e.id=t.etapa_id`,V);
  const dias=Object.fromEntries(r.rows.map(x=>[x.nome,x.d]));
  t('tempo médio: 6 dias em "Novo lead" e 4 em "Em contato"',Math.abs(dias['Novo lead']-6)<0.2&&Math.abs(dias['Em contato']-4)<0.2,JSON.stringify(dias));
  r=await q(`select count(*)::int n from crm.crm_tempo_etapas((select id from crm.funis where slug='pj'))`,B);t('sem acesso ao comercial, relatório vazio',r.rows[0].n===0);
}
