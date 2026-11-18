// Testes da equipe, sessões e ajustes (crm_0015). A = admin, B = atendente.
export default async function({db,q,t,err,A,B}){
  console.log('\n— Equipe, sessões e ajustes (crm_0015)');
  // como o PostgREST: sub + claims completos (session_id vem do JWT do Supabase Auth)
  const qx=async(sql,uid,sessao)=>{await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);
    select set_config('request.jwt.claims','${JSON.stringify({sub:uid,session_id:sessao})}',false);`);
    try{return await db.query(sql)}finally{await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','',false);`)}};
  const novo=async e=>(await db.query(`insert into auth.users(email) values ('${e}') returning id`)).rows[0].id;
  await db.exec(`insert into crm.filas_config(fila_ref,nome) values ('comercial','Comercial'),('triagem','Triagem') on conflict do nothing`);

  // presença cria o perfil de quem recebeu acesso pelo SQL Editor
  let r=await qx(`select crm.registrar_presenca(true) ok`,A,'s-admin');
  t('presença no login devolve true',r.rows[0].ok===true);
  r=await db.query(`select nome,email,ultimo_acesso is not null u from crm.perfis where user_id='${A}'`);
  t('perfil criado no primeiro acesso, com o início do e-mail',r.rows[0]&&r.rows[0].email==='admin@x'&&r.rows[0].u===true,JSON.stringify(r.rows[0]));
  r=await qx(`select crm.registrar_presenca(false) ok`,'00000000-0000-0000-0000-00000000dead','s-x');
  t('sem acesso ao CRM, presença devolve false',r.rows[0].ok===false);

  // administração de usuários
  const N=await novo('nova.pessoa@x');
  t('atendente não gerencia usuários',/só o administrador/.test(await err(()=>q(`select crm.usuario_salvar('${N}','Nova Pessoa','nova.pessoa@x','Comercial','atendente',array['comercial'],false)`,B))));
  t('e-mail diferente do login é recusado',/não confere/.test(await err(()=>qx(`select crm.usuario_salvar('${N}','Nova Pessoa','outra@x','','atendente',null,false)`,A,'s-admin'))));
  t('fila inexistente é recusada',/fila inexistente/.test(await err(()=>qx(`select crm.usuario_salvar('${N}','Nova Pessoa','nova.pessoa@x','','atendente',array['nao-existe'],false)`,A,'s-admin'))));
  await qx(`select crm.usuario_salvar('${N}','  Nova   Pessoa ','NOVA.PESSOA@x','Comercial','atendente',array['comercial'],true)`,A,'s-admin');
  r=await db.query(`select (select string_agg(area||':'||papel,',' order by area) from crm.acessos where user_id='${N}') a,
    (select string_agg(fila_ref,',') from crm.fila_membros where user_id='${N}') f, (select nome||'|'||ve_todos from crm.perfis where user_id='${N}') p`);
  t('atendente recebe atendimento + comercial, a fila marcada e o nome limpo',r.rows[0].a==='atendimento:atendente,comercial:atendente'&&r.rows[0].f==='comercial'&&r.rows[0].p==='Nova Pessoa|true',JSON.stringify(r.rows[0]));
  const D=await novo('dup@x');
  t('nome repetido é recusado',/já existe um usuário com este nome/.test(await err(()=>qx(`select crm.usuario_salvar('${D}','nova pessoa','dup@x','','atendente',null,false)`,A,'s-admin'))));
  await qx(`select crm.usuario_salvar('${N}','Nova Pessoa','nova.pessoa@x','Coordenação','lider',null,false)`,A,'s-admin');
  r=await db.query(`select string_agg(area||':'||papel,',' order by area) a from crm.acessos where user_id='${N}'`);
  t('virar líder troca as áreas (atendimento, comercial, gestão)',r.rows[0].a==='atendimento:lider,comercial:lider,gestao:lider',r.rows[0].a);
  r=await db.query(`select ve_todos v, (select count(*)::int from crm.fila_membros where user_id='${N}') n from crm.perfis where user_id='${N}'`);
  t('líder: "ver todos" desligado e filas mantidas (null não mexe)',r.rows[0].v===false&&r.rows[0].n===1,JSON.stringify(r.rows[0]));
  t('admin não tira o próprio acesso de administrador',/próprio acesso/.test(await err(()=>qx(`select crm.usuario_salvar('${A}','Admin','admin@x','','lider',null,false)`,A,'s-admin'))));
  // sem limite de usuários
  r=await db.query(`select count(*)::int n from crm.config where chave='licencas'`);t('sem limite de usuários (nenhuma configuração de licenças)',r.rows[0].n===0);
  // equipe: todos com acesso veem nomes; presença só o admin
  await qx(`select crm.registrar_presenca(true)`,B,'s-b');
  r=await qx(`select nome,tipo,online from crm.equipe() order by nome`,B,'s-b');
  t('atendente vê a equipe, sem a presença',r.rows.length>=3&&r.rows.every(x=>x.online===null),JSON.stringify(r.rows));
  r=await qx(`select online from crm.equipe() where user_id='${B}'`,A,'s-admin');
  t('admin vê quem está logado',r.rows[0].online===true);
  r=await qx(`select count(*)::int n from crm.perfis`,B,'s-b');
  t('atendente lê só o próprio perfil na tabela',r.rows[0].n===1);
  t('atendente não grava perfil direto na tabela',/permission denied/.test(await err(()=>qx(`update crm.perfis set nome='X' where user_id='${B}'`,B,'s-b'))));

  // encerrar sessão: perde o acesso na hora; novo login (outra sessão) volta a funcionar
  t('atendente não encerra sessão de ninguém',/só o administrador/.test(await err(()=>qx(`select crm.usuario_encerrar_sessao('${A}')`,B,'s-b'))));
  r=await qx(`select crm.usuario_encerrar_sessao('${B}') n`,A,'s-admin');t('admin encerra a sessão',r.rows[0].n===1);
  r=await qx(`select crm.pode('atendimento') p, crm.registrar_presenca(false) ok`,B,'s-b');
  t('sessão encerrada: sem acesso e presença devolve false',r.rows[0].p===false&&r.rows[0].ok===false,JSON.stringify(r.rows[0]));
  r=await qx(`select count(*)::int n from crm.acessos`,B,'s-b');t('sessão encerrada não lê nem o próprio acesso',r.rows[0].n===0);
  r=await qx(`select crm.pode('atendimento') p`,B,'s-b2');t('novo login (outra sessão) volta a ter acesso',r.rows[0].p===true);

  // desativar: tira o acesso, devolve atendimentos à fila, não apaga o login
  await db.exec(`insert into crm.atendimentos(conversa_ref,fila_ref,responsavel_id,status) values ('eq-1','comercial','${N}','em_atendimento')`);
  t('admin não exclui a si mesmo',/próprio usuário/.test(await err(()=>qx(`select crm.usuario_desativar('${A}')`,A,'s-admin'))));
  r=await qx(`select crm.usuario_desativar('${N}') r`,A,'s-admin');
  t('desativar devolve a contagem de atendimentos',r.rows[0].r.atendimentos===1,JSON.stringify(r.rows[0].r));
  r=await db.query(`select (select count(*)::int from crm.acessos where user_id='${N}') a,(select count(*)::int from auth.users where id='${N}') u,
    (select status||'|'||coalesce(responsavel_id::text,'-') from crm.atendimentos where conversa_ref='eq-1') at`);
  t('sem acesso ao CRM, login mantido, atendimento de volta à fila',r.rows[0].a===0&&r.rows[0].u===1&&r.rows[0].at==='aguardando|-',JSON.stringify(r.rows[0]));
  r=await qx(`select count(*)::int n from crm.equipe() where user_id='${N}'`,A,'s-admin');t('pessoa desativada some da equipe',r.rows[0].n===0);
  await qx(`select crm.usuario_salvar('${D}','Nova Pessoa','dup@x','','atendente',null,false)`,A,'s-admin');
  r=await db.query(`select count(*)::int n from crm.perfis where ativo and nome='Nova Pessoa'`);t('nome de quem saiu pode ser reaproveitado',r.rows[0].n===1);

  // filas e setores
  t('atendente não cria fila',/só o administrador/.test(await err(()=>q(`select crm.fila_criar('Trabalhista')`,B))));
  r=await qx(`select crm.fila_criar('  Previdenciário  ') ref`,A,'s-admin');t('fila criada com código sem acento',r.rows[0].ref==='previdenciario',r.rows[0].ref);
  t('nome de fila repetido é recusado',/já existe uma fila/.test(await err(()=>qx(`select crm.fila_criar('previdenciário')`,A,'s-admin'))));
  r=await qx(`select crm.fila_criar('Todos') ref`,A,'s-admin');t('código reservado do app não é usado',r.rows[0].ref==='fila',r.rows[0].ref);
  t('abertura depois do fechamento é recusada',/antes do fechamento/.test(await err(()=>qx(`select crm.fila_salvar('comercial','Seg–Sex','19:00','08:00',10,60,null)`,A,'s-admin'))));
  await qx(`select crm.fila_salvar('comercial','Seg–Sáb','08:00','19:00',10,60,'${A}')`,A,'s-admin');
  r=await db.query(`select dias,sla_primeira_min s,lider_id=('${A}')::uuid l from crm.filas_config where fila_ref='comercial'`);
  t('setor salvo (dias, prazo, líder)',r.rows[0].dias==='Seg–Sáb'&&r.rows[0].s===10&&r.rows[0].l===true,JSON.stringify(r.rows[0]));
  t('atendente não liga rodízio',/só o administrador/.test(await err(()=>q(`select crm.fila_rodizio('comercial',true)`,B))));
  await qx(`select crm.fila_rodizio('comercial',true)`,A,'s-admin');
  r=await db.query(`select rodizio_ativo r from crm.filas_config where fila_ref='comercial'`);t('admin liga o rodízio da fila',r.rows[0].r===true);
  t('atendente não muda horário direto na tabela',/permission denied/.test(await err(()=>q(`update crm.filas_config set sla_primeira_min=999`,B))));

  // tags, respostas rápidas, ausência
  r=await db.query(`select count(*)::int n from crm.tags`);t('12 tags semeadas',r.rows[0].n===12);
  t('atendente não cria tag',/só o administrador/.test(await err(()=>q(`select crm.tag_salvar('Nova',1)`,B))));
  r=await qx(`select crm.tag_salvar('urgente',4) t`,A,'s-admin');
  t('tag existente (sem diferenciar maiúsculas) só muda de cor',r.rows[0].t==='Urgente'&&(await db.query(`select cor from crm.tags where nome='Urgente'`)).rows[0].cor===4);
  r=await db.query(`select count(*)::int n from crm.respostas_rapidas`);t('2 respostas rápidas semeadas (/dados e /segundavia)',r.rows[0].n===2);
  r=await q(`select crm.resposta_criar('Prazo','O prazo é [data].') a`,B);t('atendente cria resposta rápida (atalho normalizado)',r.rows[0].a==='/prazo');
  r=await db.query(`select criada_por=('${B}')::uuid ok from crm.respostas_rapidas where atalho='/prazo'`);t('resposta registra quem criou',r.rows[0].ok===true);
  t('atalho repetido é recusado',/já existe o atalho/.test(await err(()=>q(`select crm.resposta_criar('/prazo','x')`,B))));
  t('atendente não exclui resposta',/só o administrador/.test(await err(()=>q(`select crm.resposta_excluir('/prazo')`,B))));
  await qx(`select crm.resposta_excluir('/prazo')`,A,'s-admin');
  r=await db.query(`select count(*)::int n from crm.respostas_rapidas where atalho='/prazo'`);t('admin exclui resposta',r.rows[0].n===0);
  t('ausência ligada sem texto é recusada',/escreva a mensagem/.test(await err(()=>qx(`select crm.ausencia_salvar(true,'  ')`,A,'s-admin'))));
  await qx(`select crm.ausencia_salvar(false,'Voltamos às 8h.')`,A,'s-admin');
  r=await db.query(`select valor from crm.config where chave='ausencia'`);t('ausência salva',r.rows[0].valor.on===false&&r.rows[0].valor.text==='Voltamos às 8h.');
  t('atendente não grava config direto',/permission denied/.test(await err(()=>q(`update crm.config set valor='{}' where chave='ausencia'`,B))));
  t('convite: busca por e-mail só para o servidor',/permission denied/.test(await err(()=>q(`select crm.usuario_id_por_email('admin@x')`,B))));
}
