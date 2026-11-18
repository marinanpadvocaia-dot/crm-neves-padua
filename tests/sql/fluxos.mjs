// Fluxos de trabalho (crm_0018). A = admin, B = atendente, L = líder.
export default async function({db,q,t,err,A,B}){
  console.log('\n— Fluxos de trabalho (crm_0018)');
  const L=(await db.query(`insert into auth.users(email) values ('lider-fx@x') returning id`)).rows[0].id;
  await db.exec(`insert into crm.acessos values ('${L}','gestao','lider'),('${L}','atendimento','lider')`);
  const DEF=`'{"gatilhos":[{"id":"g1","tipo":"etapa_mudou","cfg":{"funil":"pj","etapa":"Qualificado"}}],"passos":[{"id":"p1","tipo":"criar_atividade","cfg":{"tipo_atividade":"ligacao","titulo":"Ligar","em_dias":1}}]}'::jsonb`;

  t('atendente não cria fluxo',/só líderes e administradores/.test(await err(()=>q(`select crm.fluxo_salvar(null,'X','{"gatilhos":[],"passos":[]}')`,B))));
  t('definição inválida é recusada',/definição do fluxo inválida/.test(await err(()=>q(`select crm.fluxo_salvar(null,'X','{"passos":[]}')`,L))));
  const F=(await q(`select crm.fluxo_salvar(null,'  Lead   qualificado ','{"gatilhos":[],"passos":[]}') id`,L)).rows[0].id;
  let r=await db.query(`select nome,status,ativo,criado_por=('${L}')::uuid c from crm.fluxos where id='${F}'`);
  t('fluxo novo nasce rascunho, com nome limpo e autor',r.rows[0].nome==='Lead qualificado'&&r.rows[0].status==='rascunho'&&!r.rows[0].ativo&&r.rows[0].c,JSON.stringify(r.rows[0]));
  t('não publica sem acionador',/adicione um acionador/.test(await err(()=>q(`select crm.fluxo_publicar('${F}',true)`,L))));
  await q(`select crm.fluxo_salvar('${F}','Lead qualificado',${DEF})`,L);
  r=await q(`select crm.fluxo_publicar('${F}',true) v`,L);t('publicar cria a versão 1',r.rows[0].v===1);
  await q(`select crm.fluxo_salvar('${F}','Lead qualificado (editado)','{"gatilhos":[{"id":"g1","tipo":"tag_adicionada","cfg":{"tag":"PJ"}}],"passos":[]}')`,L);
  r=await db.query(`select v.definicao->'gatilhos'->0->>'tipo' g, f.status s from crm.fluxo_versoes v join crm.fluxos f on f.id=v.fluxo_id where v.fluxo_id='${F}' and v.versao=1`);
  t('editar o rascunho não muda a versão publicada',r.rows[0].g==='etapa_mudou'&&r.rows[0].s==='publicado',JSON.stringify(r.rows[0]));
  await q(`select crm.fluxo_salvar('${F}','Lead qualificado',${DEF})`,L);
  r=await q(`select crm.fluxo_publicar('${F}',true) v`,A);t('nova publicação vira a versão 2',r.rows[0].v===2);
  await q(`select crm.fluxo_publicar('${F}',false)`,L);
  r=await db.query(`select status,ativo,versao_publicada v from crm.fluxos where id='${F}'`);t('despublicar volta para rascunho e guarda as versões',r.rows[0].status==='rascunho'&&!r.rows[0].ativo&&r.rows[0].v===2);
  t('ninguém grava direto na tabela',/permission denied/.test(await err(()=>q(`update crm.fluxos set status='publicado'`,L))));
  r=await q(`select count(*)::int n from crm.fluxos`,B);t('atendente não vê fluxos (área de gestão)',r.rows[0].n===0);
  r=await q(`select count(*)::int n from crm.fluxo_versoes where fluxo_id='${F}'`,L);t('líder vê as versões',r.rows[0].n===2);

  // pastas, duplicar, lixeira
  const P=(await q(`select crm.fluxo_pasta_criar('Comercial') id`,L)).rows[0].id;
  t('pasta repetida é recusada',/já existe uma pasta/.test(await err(()=>q(`select crm.fluxo_pasta_criar('comercial')`,L))));
  await q(`select crm.fluxo_mover('${F}','${P}')`,L);
  const D=(await q(`select crm.fluxo_duplicar('${F}') id`,L)).rows[0].id;
  r=await db.query(`select nome,status,pasta_id=('${P}')::uuid p,definicao->'passos'->0->>'tipo' t from crm.fluxos where id='${D}'`);
  t('duplicar copia o desenho, a pasta e nasce rascunho',r.rows[0].nome==='Lead qualificado (cópia)'&&r.rows[0].status==='rascunho'&&r.rows[0].p&&r.rows[0].t==='criar_atividade',JSON.stringify(r.rows[0]));
  await q(`select crm.fluxo_publicar('${D}',true)`,L);await q(`select crm.fluxo_excluir('${D}',true)`,L);
  r=await db.query(`select excluido_em is not null e, status from crm.fluxos where id='${D}'`);t('apagar manda para a lixeira e despublica',r.rows[0].e&&r.rows[0].status==='rascunho');
  t('fluxo na lixeira não é editado',/lixeira/.test(await err(()=>q(`select crm.fluxo_salvar('${D}','X',${DEF})`,L))));
  await q(`select crm.fluxo_excluir('${D}',false)`,L);
  r=await db.query(`select excluido_em is null e from crm.fluxos where id='${D}'`);t('restaurar tira da lixeira',r.rows[0].e===true);
  t('automações antigas não recebem mais gravação direta',/permission denied/.test(await err(()=>q(`delete from crm.automacoes`,A))));
}
