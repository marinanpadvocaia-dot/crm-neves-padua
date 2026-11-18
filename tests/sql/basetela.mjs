// Base de conhecimento na tela (crm_0023): restaurar excluído (só admin), limites de tamanho, histórico.
export default async function({db,q,t,err,A,B}){
  console.log('\n— Base na tela (crm_0023)');
  const salvar=(u,titulo,passos=['Conferir o cadastro.'])=>q(`select crm.salvar_artigo(null,'${titulo}',true,'{}','Quando o cliente pede.','${JSON.stringify(passos).replace(/'/g,"''")}'::jsonb) id`,u).then(r=>r.rows[0].id);
  t('título com mais de 120 letras é recusado',/até 120 letras/.test(await err(()=>salvar(A,'x'.repeat(121)))));
  t('mais de 30 passos é recusado',/até 30 passos/.test(await err(()=>salvar(A,'Muitos passos',Array.from({length:31},(_,i)=>'Passo '+i)))));
  t('passo com mais de 500 letras é recusado',/até 500 letras/.test(await err(()=>salvar(A,'Passo longo',['y'.repeat(501)]))));
  const id=await salvar(A,'Restaurar teste');
  await q(`select crm.excluir_artigo('${id}')`,A);
  t('excluído some para o atendimento',(await q(`select count(*)::int n from crm.base_artigos where id='${id}'`,B)).rows[0].n===0);
  t('atendente não restaura',/só o administrador/.test(await err(()=>q(`select crm.restaurar_artigo('${id}')`,B))));
  await q(`select crm.restaurar_artigo('${id}')`,A);
  let r=await q(`select ativo, versao from crm.base_artigos where id='${id}'`,B);
  t('restaurado volta para o atendimento como nova versão',r.rows[0]?.ativo===true&&r.rows[0].versao===3,JSON.stringify(r.rows[0]));
  t('restaurar de novo é recusado',/já ativo/.test(await err(()=>q(`select crm.restaurar_artigo('${id}')`,A))));
  r=await q(`select string_agg(acao||':'||versao,',' order by id) h from crm.base_artigo_historico where artigo_id='${id}'`,A);
  t('histórico: criado, excluído, restaurado',r.rows[0].h==='criado:1,excluido:2,restaurado:3',r.rows[0].h);
  r=await q(`select dados->'filas' f, dados->>'titulo' tt from crm.base_artigo_historico where artigo_id='${id}' and acao='restaurado'`,A);
  t('a versão restaurada guarda a fotografia com as filas',r.rows[0].tt==='Restaurar teste'&&Array.isArray(r.rows[0].f));
}
