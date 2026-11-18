-- supabase/seed/homologacao.sql
-- Carga de dados FICTÍCIOS para o Supabase de HOMOLOGAÇÃO. Nunca copiar dados reais de clientes.
-- Rodar depois das migrações crm_0002…, no SQL Editor do projeto de homologação. Pode rodar mais de uma vez.
-- Usuários: crie antes, em Authentication → Users, os e-mails abaixo (senha à sua escolha):
--   admin@homolog.test (administrador) · lider@homolog.test (líder) · atendente@homolog.test · comercial@homolog.test
-- Quem não existir é simplesmente ignorado.

-- Trava: este arquivo se recusa a rodar no banco marcado como produção.
do $$ begin
  if exists (select 1 from crm.config where chave = 'ambiente' and valor->>'nome' = 'producao') then
    raise exception 'seed de homologação NÃO roda em produção (crm.config ambiente = producao)';
  end if;
end $$;
insert into crm.config (chave, valor) values ('ambiente', '{"nome":"homologacao"}') on conflict (chave) do nothing;

-- acessos
insert into crm.acessos (user_id, area, papel)
select u.id, a.area, a.papel from auth.users u
join (values ('admin@homolog.test','admin','admin'),
             ('lider@homolog.test','atendimento','lider'),('lider@homolog.test','comercial','lider'),('lider@homolog.test','gestao','lider'),
             ('atendente@homolog.test','atendimento','atendente'),
             ('comercial@homolog.test','comercial','atendente'),('comercial@homolog.test','atendimento','atendente')) as a(email, area, papel)
  on a.email = u.email
on conflict (user_id, area) do nothing;

-- perfis (nome e função que aparecem na tela)
insert into crm.perfis (user_id, nome, email, funcao)
select u.id, p.nome, u.email, p.funcao from auth.users u
join (values ('admin@homolog.test','Administrador Teste','Administração'),('lider@homolog.test','Líder Teste','Gestão de Passivos PJ'),
             ('atendente@homolog.test','Atendente Teste','Superendividamento'),('comercial@homolog.test','Comercial Teste','Comercial')) as p(email, nome, funcao)
  on p.email = u.email
on conflict do nothing;

-- filas e quem participa
insert into crm.filas_config (fila_ref, nome, abre, fecha, sla_primeira_min, sla_retorno_min, rodizio_ativo) values
  ('triagem','Triagem','08:00','18:00',30,120,false), ('comercial','Comercial','08:00','19:00',10,60,true),
  ('passivos','Gestão de Passivos PJ','08:00','18:00',15,120,true), ('super','Superendividamento','08:00','18:00',15,120,true),
  ('financeiro','Financeiro','09:00','17:00',30,240,false)
on conflict (fila_ref) do nothing;
insert into crm.fila_membros (fila_ref, user_id, ordem)
select f.fila, u.id, f.ordem from auth.users u
join (values ('comercial','comercial@homolog.test',1),('passivos','atendente@homolog.test',1),('passivos','lider@homolog.test',2),('super','atendente@homolog.test',1)) as f(fila, email, ordem)
  on f.email = u.email
on conflict do nothing;

-- canais: chip de TESTE (nunca o número do escritório) + reserva + Instagram/Google simulados
insert into crm.canais (tipo, nome, numero, provedor, instancia, principal, reserva, ativo)
select * from (values
  ('whatsapp','WhatsApp homologação (chip de teste)','+55 16 90000-0001','evolution','homolog',true,false,true),
  ('whatsapp','WhatsApp reserva (homologação)','+55 16 90000-0002','evolution','homolog-reserva',false,true,false),
  ('instagram','Instagram (simulado)','@np.homologacao','simulado','ig-homolog',true,false,true),
  ('google','Google Meu Negócio (simulado)','Perfil de teste','simulado','gmn-homolog',true,false,true)
) as c(tipo, nome, numero, provedor, instancia, principal, reserva, ativo)
where not exists (select 1 from crm.canais x where x.instancia = c.instancia);

-- avaliações do Google são raras: silêncio suspeito só depois de 7 dias
update crm.canais set silencio_max_min = 10080 where tipo = 'google' and instancia = 'gmn-homolog' and silencio_max_min = 120;

-- regras da IA: em HOMOLOGAÇÃO a validação fica registrada em nome do administrador de teste, para os agentes poderem ligar.
-- Em produção, registrar com o e-mail da advogada que validou (docs/ativar-agentes-ia.md).
update crm.regras_ia set validada_por = (select id from auth.users where email = 'admin@homolog.test'), validada_em = now()
 where agente_id is null and validada_em is null and ativa and exists (select 1 from auth.users where email = 'admin@homolog.test');

-- atendimentos fictícios (um por conversa)
insert into crm.atendimentos (conversa_ref, canal, protocolo, fila_ref, status, responsavel_id)
select t.ref, t.canal, t.proto, t.fila, t.status, (select id from auth.users where email = t.email)
from (values
  ('hml-c01','whatsapp','HML-0001','passivos','em_atendimento','atendente@homolog.test'),
  ('hml-c02','whatsapp','HML-0002','comercial','aguardando',null),
  ('hml-c03','whatsapp','HML-0003','triagem','aguardando',null),
  ('hml-c04','whatsapp','HML-0004','super','em_atendimento','atendente@homolog.test'),
  ('hml-c05','whatsapp','HML-0005','financeiro','resolvido',null),
  ('hml-c06','instagram','HML-0006','triagem','aguardando',null),
  ('hml-c07','google','HML-0007','triagem','aguardando',null),
  ('hml-c08','whatsapp','HML-0008','passivos','em_atendimento','lider@homolog.test')
) as t(ref, canal, proto, fila, status, email)
on conflict (conversa_ref) do nothing;

-- negócios fictícios no funil Comercial (um funil só desde a crm_0024; telefones de faixa inexistente 90000-xxxx)
insert into crm.negocios (funil_id, etapa_id, nome, empresa, telefone, valor, origem_id, previsao_fechamento, externo_id)
select f.id, e.id, n.nome, n.empresa, n.tel, n.valor, (select id from crm.origens where nome = n.origem), current_date + n.dias, n.ext
from (values
  ('pj','Novo lead','Transportes Exemplo','Exemplo Logística ME','+55 16 90000-1001',18000,'Meta Ads',30,'HML-N01'),
  ('pj','Qualificado','Oficina Fictícia','Fictícia Mecânica ME','+55 16 90000-1002',24000,'Google Ads',20,'HML-N02'),
  ('pj','Proposta enviada','Mercado Teste','Teste Alimentos Ltda','+55 16 90000-1003',42000,'Indicação',10,'HML-N03'),
  ('pj','Negociação','Confecções Modelo','Modelo Têxtil ME','+55 16 90000-1004',15000,'Orgânico',7,'HML-N04'),
  ('pj','Em contato','Pessoa Fictícia Um',null,'+55 16 90000-2001',6000,'Meta Ads',40,'HML-N05'),
  ('pj','Qualificado','Pessoa Fictícia Dois',null,'+55 16 90000-2002',4500,'Indicação',25,'HML-N06'),
  ('pj','Reunião agendada','Auto Peças Exemplo','Exemplo Peças Ltda','+55 16 90000-3001',80000,'Indicação',15,'HML-N07'),
  ('pj','Proposta enviada','Bar Exemplo','Bar Exemplo ME','+55 16 90000-3002',45000,'Instagram',12,'HML-N08')
) as n(funil, etapa, nome, empresa, tel, valor, origem, dias, ext)
join crm.funis f on f.slug = n.funil
join crm.funil_etapas e on e.funil_id = f.id and e.nome = n.etapa
on conflict do nothing;

-- uma mensagem agendada de exemplo
insert into crm.mensagens_agendadas (atendimento_id, texto, enviar_em)
select id, 'Bom dia! Conseguiu separar o extrato atualizado? (mensagem de teste)', now() + interval '1 day'
from crm.atendimentos where conversa_ref = 'hml-c04'
  and not exists (select 1 from crm.mensagens_agendadas a join crm.atendimentos t on t.id = a.atendimento_id where t.conversa_ref = 'hml-c04');

-- base de conhecimento: procedimentos de exemplo (um geral e um por fila); texto pronto fica nas respostas rápidas
insert into crm.base_artigos (titulo, todas_filas, quando_usar, passos, cuidados, quando_escalar, resposta_rapida)
select * from (values
  ('Cliente irritado com a demora (teste)', true, 'O cliente reclama de falta de retorno.',
   '["Reconhecer a demora sem desculpas longas.","Verificar o histórico.","Dar um prazo concreto.","Avisar o líder se o SLA estiver estourado."]'::jsonb,
   'Não culpar outro setor na conversa com o cliente.', 'Ameaça de rescisão ou de reclamação em órgão público.', null),
  ('Cliente pede segunda via de boleto (teste)', false, 'O cliente precisa do boleto de novo.',
   '["Localizar a parcela no financeiro.","Gerar a segunda via.","Enviar e confirmar o vencimento."]'::jsonb,
   'Vencimento só em 01, 05, 10 ou 20.', 'Parcelas em atraso há mais de 30 dias.', '/segundavia')
) as v(titulo, todas, quando, passos, cuidados, escalar, rr)
where not exists (select 1 from crm.base_artigos a where a.titulo = v.titulo);
insert into crm.base_artigo_filas (artigo_id, fila_ref)
select id, 'financeiro' from crm.base_artigos where titulo = 'Cliente pede segunda via de boleto (teste)'
on conflict do nothing;
