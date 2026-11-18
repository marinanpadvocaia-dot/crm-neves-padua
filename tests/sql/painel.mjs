// Painel do gestor (crm_0025): minutos úteis, quem vê o quê, contas de agora/período/fila/pessoa/canal e o resumo do comercial.
// A = admin, B = atendente.
export default async function({db,q,t,err,A,B}){
  console.log('\n— Painel do gestor (crm_0025)');
  const one=async(s,u)=>(await (u?q(s,u):db.query(s))).rows[0];
  const mu=async(de,ate,dias='Seg–Sex')=>(await one(`select crm.minutos_uteis('${de}','${ate}','${dias}','08:00','18:00') m`)).m;
  // 16/11/2026 é segunda-feira; horário 8h–18h
  t('minutos úteis: fim de tarde até a manhã seguinte conta só o horário de atendimento',await mu('2026-11-16 17:00-03','2026-11-17 09:30-03')===150);
  t('minutos úteis: sexta à noite até segunda cedo pula o fim de semana',await mu('2026-11-20 17:00-03','2026-11-23 09:00-03')===120);
  t('minutos úteis: sábado conta só em fila Seg–Sáb',await mu('2026-11-21 08:00-03','2026-11-21 12:00-03','Seg–Sáb')===240&&await mu('2026-11-21 08:00-03','2026-11-21 12:00-03')===0);
  t('minutos úteis: fora do horário e intervalo invertido dão zero',await mu('2026-11-16 19:00-03','2026-11-16 23:00-03')===0&&await mu('2026-11-17 10:00-03','2026-11-16 10:00-03')===0);

  const novo=async e=>(await db.query(`insert into auth.users(email) values ('${e}') returning id`)).rows[0].id;
  const L=await novo('lider-painel@x'),M=await novo('membro-painel@x');
  await db.exec(`insert into crm.acessos values ('${L}','atendimento','lider'),('${M}','atendimento','atendente');
    insert into crm.perfis(user_id,nome,email) values ('${M}','Membro Painel','membro-painel@x'),('${L}','Líder Painel','lider-painel@x') on conflict (user_id) do nothing;
    insert into crm.filas_config(fila_ref,nome,dias,abre,fecha,sla_primeira_min,lider_id) values
      ('pnl_l','Painel do líder','Todos os dias','00:00','23:59:59',60,'${L}'),('pnl_o','Painel de outra fila','Todos os dias','00:00','23:59:59',60,null);
    insert into crm.fila_membros(fila_ref,user_id) values ('pnl_l','${M}');
    insert into crm.sessoes(sessao_id,user_id) values ('sess-painel-m','${M}');
    insert into crm.atendimentos(conversa_ref,fila_ref,canal,responsavel_id,status,aguardando_cliente,created_at,primeira_resposta_em,resolvido_em) values
      ('pnl1','pnl_l','whatsapp',null,'aguardando',false,now()-interval '3 hours',null,null),
      ('pnl2','pnl_l','instagram','${M}','em_atendimento',false,now()-interval '50 minutes',null,null),
      ('pnl3','pnl_l','whatsapp','${M}','em_atendimento',true,now()-interval '5 hours',null,null),
      ('pnl4','pnl_l','whatsapp','${M}','resolvido',false,now()-interval '2 hours',now()-interval '90 minutes',now()),
      ('pnl5','pnl_l','google','${M}','resolvido',false,now()-interval '4 hours',now()-interval '150 minutes',now()),
      ('pnl6','pnl_o','whatsapp',null,'aguardando',false,now()-interval '10 minutes',null,null)`);
  const hoje=(await one(`select (now() at time zone 'America/Sao_Paulo')::date d`)).d.toISOString().slice(0,10);
  const ontem=(await one(`select ((now() at time zone 'America/Sao_Paulo')::date - 1) d`)).d.toISOString().slice(0,10);
  const painel=async u=>(await one(`select crm.painel_gestor('${ontem}','${hoje}') p`,u)).p;

  t('atendente não abre o painel',/sem permissão para ver o painel/.test(await err(()=>painel(B))));
  t('período maior que um ano é recusado',/período inválido/.test(await err(()=>q(`select crm.painel_gestor('2025-01-01','2026-11-16')`,L))));
  t('período invertido é recusado',/período inválido/.test(await err(()=>q(`select crm.painel_gestor('2026-11-16','2026-11-01')`,L))));

  const p=await painel(L);
  t('líder vê só as filas que lidera',JSON.stringify(p.filas.map(x=>x.fila))==='["pnl_l"]'&&p.por_fila.length===1&&p.todas_filas===false,JSON.stringify(p.filas));
  t('agora: abertos, sem responsável, atrasado, perto do prazo e aguardando o cliente',
    JSON.stringify(p.agora)===JSON.stringify({abertos:3,atrasados:1,perto_do_prazo:1,sem_responsavel:1,aguardando_cliente:1}),JSON.stringify(p.agora));
  t('aguardando o cliente pausa o prazo (5 h esperando e não conta como atrasado)',p.agora.atrasados===1);
  t('período: novos, resolvidos, 1ª resposta média e % no prazo',
    p.periodo.novos===5&&p.periodo.resolvidos===2&&p.periodo.respondidos===2&&p.periodo.primeira_resposta_media_min===60&&p.periodo.no_prazo_pct===50,JSON.stringify(p.periodo));
  const f=p.por_fila[0];
  t('por fila soma igual ao total',f.abertos===3&&f.atrasados===1&&f.novos===5&&f.resolvidos===2&&f.no_prazo_pct===50&&f.sla_min===60,JSON.stringify(f));
  const m=p.por_pessoa.find(x=>x.user_id===M);
  t('por pessoa: carga, resolvidos, 1ª resposta e quem está conectado',m&&m.nome==='Membro Painel'&&m.abertos===2&&m.atrasados===0&&m.resolvidos===2&&m.primeira_resposta_media_min===60&&m.online===true,JSON.stringify(m));
  t('por canal: WhatsApp, Instagram e Google',JSON.stringify(p.por_canal.map(c=>c.canal+':'+c.abertos+'/'+c.resolvidos))==='["whatsapp:2/1","instagram:1/0","google:0/1"]',JSON.stringify(p.por_canal));
  t('líder fora do comercial não recebe o resumo do comercial',p.comercial===null);
  await db.exec(`update crm.sessoes set encerrada_em=now() where sessao_id='sess-painel-m'`);
  t('sessão encerrada não aparece como conectada',(await painel(L)).por_pessoa.find(x=>x.user_id===M).online===false);

  const pa=await painel(A);
  t('administrador vê todas as filas',pa.todas_filas===true&&pa.por_fila.some(x=>x.fila==='pnl_o'&&x.abertos===1)&&pa.por_fila.some(x=>x.fila==='pnl_l'));
  const c=pa.comercial;
  t('administrador recebe o resumo do comercial com as 6 etapas abertas',c&&c.por_etapa.length===6&&c.por_etapa[0].etapa==='Novo lead',JSON.stringify(c&&c.por_etapa));
  const e=await one(`select count(*) filter (where e.tipo='aberta')::int ab, coalesce(sum(n.valor) filter (where e.tipo='aberta'),0)::float va,
      count(*) filter (where e.tipo='ganho' and n.fechado_em >= '${ontem}'::timestamp at time zone 'America/Sao_Paulo')::int ga,
      count(*) filter (where n.created_at >= '${ontem}'::timestamp at time zone 'America/Sao_Paulo')::int nv
    from crm.negocios n join crm.funil_etapas e on e.id=n.etapa_id join crm.funis fu on fu.id=n.funil_id where fu.ativo`);
  t('resumo do comercial bate com a conta direta no banco',c.abertos===e.ab&&Number(c.abertos_valor)===e.va&&c.ganhos===e.ga&&c.novos===e.nv&&c.por_etapa.reduce((s,x)=>s+x.qtd,0)===e.ab,JSON.stringify({c:[c.abertos,c.abertos_valor,c.ganhos,c.novos],e}));
  t('conversão = ganhos ÷ (ganhos + perdidos) do período',c.ganhos+c.perdidos===0?c.conversao_pct===null:c.conversao_pct===Math.round(100*c.ganhos/(c.ganhos+c.perdidos)));
  await db.exec(`delete from crm.atendimentos where conversa_ref like 'pnl%'; delete from crm.fila_membros where fila_ref in ('pnl_l','pnl_o'); delete from crm.filas_config where fila_ref in ('pnl_l','pnl_o')`);
}
