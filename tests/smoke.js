// Teste de fumaça do protótipo. Usa o navegador do Playwright ou um instalado (PW_CANAL=msedge | chrome).
const {chromium}=require('playwright');const path=require('path'),os=require('os');const T=n=>path.join(os.tmpdir(),n);
(async()=>{
 let br;for(const o of [process.env.PW_CANAL?{channel:process.env.PW_CANAL}:{},{channel:'msedge'},{channel:'chrome'}]){try{br=await chromium.launch(o);break}catch(e){}}if(!br)throw new Error('nenhum navegador disponível (instale com npx playwright install chromium)');const pg=await br.newPage({viewport:{width:1500,height:900}});
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
 await pg.goto(require('url').pathToFileURL(path.join(__dirname,'..','index.html')).href);
 await pg.click('[data-act=demoLogin][data-r=admin]');
 await pg.waitForTimeout(300);
 await pg.screenshot({path:T('s_atend.png')});
 await pg.click('[data-act=qmenu]');await pg.screenshot({path:T('s_qmenu.png')});await pg.click('[data-act=qmenu]');
 const tabs=await pg.$$eval('#rail button',b=>b.map(x=>x.dataset.v));console.log('tabs',tabs);
 for(const v of ['fluxos','crm','ia','rel','cfg']){await pg.click(`#rail [data-v=${v}]`);await pg.waitForTimeout(150);await pg.screenshot({path:T(`s_${v}.png`),fullPage:true})}
 // fluxos de trabalho (lista + construtor + teste)
 const ok=(c,n)=>{if(!c){errs.push('IA: '+n)}};const toastTx=async()=>{await pg.waitForTimeout(80);return pg.$eval('#toast',e=>e.textContent)};
 await pg.click('#rail [data-v=fluxos]');
 ok(/Lista de fluxos de trabalho/.test(await pg.textContent('#fluxos'))&&/Comercial/.test(await pg.textContent('#fluxos')),'lista de fluxos com pastas');
 await pg.screenshot({path:T('s_fx_lista.png'),fullPage:true});
 await pg.click('[data-fw=pasta][data-id=pa2]');ok(/Follow-up da proposta/.test(await pg.textContent('#fluxos'))&&!/Boas-vindas e triagem/.test(await pg.textContent('#fluxos')),'abrir pasta filtra os fluxos');
 await pg.click('[data-fw=pasta][data-id=""]');
 await pg.fill('#fxbusca','triagem');ok(/Boas-vindas e triagem/.test(await pg.textContent('#fluxos'))&&!/Follow-up/.test(await pg.textContent('#fluxos')),'pesquisa');await pg.fill('#fxbusca','');
 await pg.click('[data-fw=ia-lista]');await pg.click('[data-fw=ia-ex][data-i="1"]');ok(/Proposta enviada/.test(await pg.inputValue('#fxialtxt')),'exemplo preenche o pedido para a IA');
 await pg.click('[data-fw=ia-lista-enviar]');ok(/demonstração a IA não é chamada/.test(await toastTx()),'IA explica que só funciona conectada');await pg.click('[data-fw=ia-lista-fechar]');
 await pg.fill('#fxbusca','Boas');await pg.click('[data-fw=abrir][data-id=w1]');
 let fx=await pg.textContent('#fluxos');ok(/Nova conversa/.test(fx)&&/Criar tarefa/.test(fx)&&!/Menu de opções/.test(fx)&&/Dentro do horário/.test(fx)&&/Fora do horário/.test(fx)&&/FIM/.test(fx),'construtor desenha acionador, passos e caminhos');
 await pg.screenshot({path:T('s_fx_construtor.png'),fullPage:true});
 await pg.click('[data-fw=add][data-lista=root][data-pos="1"]');await pg.fill('#fxpickbusca','tag');await pg.click('[data-fw=pick][data-v=tag_adicionar]');
 ok(/Configure este passo/.test(await pg.textContent('#fluxos')),'passo novo sem configuração fica marcado');
 await pg.selectOption('[data-fw-cfg=tag]','PJ');await pg.click('.fx-gaveta [data-fw=fechar]');
 ok(/Adicionar tag/.test(await pg.textContent('#fluxos'))&&!/Configure este passo/.test(await pg.textContent('#fluxos')),'passo configurado');
 await pg.click('[data-fw=aba][data-v=teste]');await pg.fill('#fxtnome','Maria Souza');await pg.click('[data-fw=t-ini]');
 ok(/Olá, Maria!/.test(await pg.textContent('#simlog')),'teste usa {nome}');
 await pg.click('[data-fw=t-ramo][data-k="1"]');
 ok(/Caminho: Fora do horário/.test(await pg.textContent('#simlog'))&&/Recebemos sua mensagem fora do nosso horário/.test(await pg.textContent('#simlog'))&&/Fluxo encerrado/.test(await pg.textContent('#simlog')),'teste segue o caminho escolhido (fora do horário)');
 await pg.screenshot({path:T('s_fxtest.png'),fullPage:true});
 for(const t of ['config','insc','reg']){await pg.click(`[data-fw=aba][data-v=${t}]`);await pg.screenshot({path:T(`s_fx_${t}.png`),fullPage:true})}
 ok(/Renata Moura/.test(await pg.textContent('#fluxos')),'registros de execução do fluxo');
 await pg.click('[data-fw=voltar]');await pg.click('[data-fw=novo]');
 await pg.click('#fxpub');ok(/acionador antes de publicar/.test(await toastTx()),'não publica sem acionador');
 await pg.click('[data-fw=add-gat]');await pg.click('[data-fw=pick][data-v=etapa_mudou]');await pg.selectOption('[data-fw-cfg=funil]','pj');await pg.selectOption('[data-fw-cfg=etapa]','Negociação');
 await pg.click('[data-fw=add][data-lista=root][data-pos="0"]');await pg.click('[data-fw=pick][data-v=criar_tarefa]');
 await pg.fill('[data-fw-cfg=titulo]','Revisar a negociação');await pg.selectOption('[data-fw-cfg=responsavel]','Ana Júlia');await pg.click('.fx-gaveta [data-fw=fechar]');
 await pg.fill('#fxnome','Negociação → tarefa');await pg.click('#fxpub');ok(/Fluxo publicado/.test(await toastTx()),'publicar fluxo');
 await pg.click('[data-fw=voltar]');ok(/Negociação → tarefa/.test(await pg.textContent('#fluxos')),'fluxo novo na lista');
 // "Se" com várias condições (o exemplo: tag X e 60 min sem o cliente responder)
 await pg.fill('#fxbusca','sem resposta do cliente');await pg.click('[data-fw=abrir][data-id=w6]');
 ok(/Cliente sem responder/.test(await pg.textContent('#fluxos'))&&/60 min/.test(await pg.textContent('#fluxos')),'acionador "Cliente sem responder · 60 min"');
 await pg.click('.fx-card:has-text("Se / senão")');await pg.click('[data-fw=cond-add]');
 await pg.selectOption('[data-fw-cond="1"][data-k=sujeito]','etapa');await pg.selectOption('[data-fw-cond="1"][data-k=valor]','Qualificado');
 await pg.selectOption('[data-fw-cfg=modo]','qualquer');
 ok(/Tag do contato é \/ tem Aguardando documentos ou Etapa do negócio é \/ tem Qualificado/.test(await pg.textContent('.fx-card.on')),'resumo junta as condições com "ou"');
 ok(/passo 2/.test(await pg.textContent('.fx-gaveta')),'aviso de que tag depende do passo 2');
 await pg.screenshot({path:T('s_fx_condicoes.png'),fullPage:true});
 await pg.click('[data-fw=cond-del][data-i="0"]');ok(!/Aguardando documentos/.test(await pg.textContent('.fx-card.on')),'tirar condição');
 await pg.click('.fx-gaveta [data-fw=fechar]');await pg.click('[data-fw=add-gat]');await pg.fill('#fxpickbusca','tag');
 ok(/passo 2/.test(await pg.textContent('.fx-pick')),'catálogo mostra o que depende do passo 2');await pg.click('[data-fw=pick-fechar]');
 await pg.click('[data-fw=voltar]');await pg.fill('#fxbusca','');
 // menções dos fluxos e da IA (na fila Menções, sem sino)
 await pg.click('#rail [data-v=atend]');await pg.click('[data-act=qmenu]');
 ok(/Menções\s*1/.test(await pg.textContent('.qmenu')),'fila Menções conta a menção do fluxo');
 await pg.click('[data-act=queue][data-id=mencoes]');
 ok(/Fluxo de trabalho/.test(await pg.textContent('#list'))&&/urgente/.test(await pg.textContent('#list'))&&!(await pg.$('#avisosbtn')),'menção do fluxo aparece na fila Menções (sem sino)');
 await pg.screenshot({path:T('s_mencoes.png')});
 await pg.click('[data-av=lido]');ok(/Menção resolvida/.test(await toastTx())&&!/urgente/.test(await pg.textContent('#list')),'marcar a menção como resolvida');
 await pg.click('[data-act=qmenu]');await pg.click('[data-act=queue][data-id=comercial]');await pg.click('[data-act=show][data-v=aguard]');
 ok(/@paulo\.lima/.test(await pg.textContent('#list'))&&/Gabriel/.test(await pg.textContent('#list')),'contato que pediu uma pessoa foi delegado ao Comercial (Gabriel)');await pg.click('[data-act=show][data-v=atend]');await pg.click('[data-act=qmenu]');await pg.click('[data-act=queue][data-id=minha]');
 // crm
 await pg.click('#rail [data-v=crm]');
 await pg.click('.deal[data-id=l3]');await pg.screenshot({path:T('s_crm_drawer.png'),fullPage:true});
 await pg.selectOption('[data-x-sel=stage]','Proposta enviada');
 await pg.click('[data-x=crmside][data-v=ativ]');await pg.screenshot({path:T('s_crm_ativ.png'),fullPage:true});
 for(const t of ['ativ','rel','campos']){await pg.click(`[data-x=crmtab][data-v=${t}]`);await pg.screenshot({path:T(`s_crm_${t}.png`),fullPage:true})}
 await pg.click('[data-x=crmtab][data-v=funil]');await pg.click('[data-x=colrec][data-v=Ganho]');await pg.click('.deal[data-id=l7]');await pg.click('[data-x=closedeal]');await pg.screenshot({path:T('s_close.png')});await pg.click('[data-x=closeok]');
 // importação (demonstração)
 await pg.click('[data-x=crmtab][data-v=funil]');await pg.click('[data-imp=open]');await pg.click('[data-imp=sample]');await pg.click('[data-imp=s2]');await pg.click('[data-imp=s3]');
 ok(/Prévia: nada foi gravado ainda/.test(await pg.textContent('.modal'))&&/Sem nome e sem telefone/.test(await pg.textContent('.modal')),'prévia da importação com os problemas de cada linha');
 await pg.click('[data-imp=s4]');ok(/não disparam/.test(await pg.textContent('.modal')),'importação não dispara fluxos por padrão');
 await pg.click('[data-imp=go]');ok(/Importação simulada concluída/.test(await toastTx()),'importação concluída (demonstração)');
 // ia
 await pg.click('#rail [data-v=ia]');for(const t of ['rev','regras','res']){await pg.click(`[data-x=iatab][data-v=${t}]`);await pg.screenshot({path:T(`s_ia_${t}.png`),fullPage:true})}
 await pg.click('[data-x=iatab][data-v=rev]');await pg.fill('#iacorr','Olá! Sou o assistente virtual do escritório. Em que cidade você está?');await pg.click('[data-x=iafix]');
 ok(/exemplo do agente/.test(await toastTx()),'enviar com correção');
 await pg.click('[data-x=iafil][data-v=corrigida]');ok(/Corrigida e enviada/.test(await pg.textContent('#ia')),'filtro de corrigidas');
 await pg.click('[data-x=iafil][data-v=revisar]');ok(/Bloqueada pela trava/.test(await pg.textContent('#ia')),'bloqueada aparece para revisar');
 await pg.click('[data-x=iatab][data-v=agentes]');ok(!/clientes jurídicos PF|WhatsApp do escritório/.test(await pg.textContent('#ia')),'agentes só no Instagram e no Google');
 ok(/atendente do Comercial \(rodízio/.test(await pg.textContent('#ia'))&&!(await pg.$('[data-ia-avisar]')),'pedido de uma pessoa vai para o Comercial (sem escolher quem avisar)');
 await pg.click('[data-x=iatab][data-v=rev]');await pg.click('[data-x=iafil][data-v=transferida]');await pg.click('[data-x=iasel][data-id=v6]');
 ok(/pediu para falar com uma pessoa/.test(await pg.textContent('#ia'))&&/IA pausada para este contato/.test(await pg.textContent('#ia'))&&/Com Gabriel \(Comercial\)/.test(await pg.textContent('#ia')),'pedido de humano: IA pausada e atendimento com o Comercial');
 await pg.click('[data-ia=despausar]');ok(/volta a responder/.test(await toastTx())&&!/IA pausada para este contato/.test(await pg.textContent('#ia')),'devolver o contato para a IA');await pg.click('[data-x=iatab][data-v=agentes]');
 await pg.click('.iamodo summary');await pg.selectOption('#iamodo-i1','automatico');await pg.fill('#iamot-i1','Autorizado pela Dra. por e-mail');await pg.click('[data-x=iamodo][data-id=i1]');ok(/30 dias/.test(await toastTx()),'automático exige 30 dias');
 await pg.screenshot({path:T('s_ia_agentes.png'),fullPage:true});
 // agentes editáveis (crm_0026): criar, um ligado por tipo, editar, excluir e restaurar; regras com validação
 await pg.click('[data-ia=novo]');await pg.click('[data-ia=salvar]');ok(/de 3 a 80 caracteres/.test(await pg.textContent('.iaf-err')),'formulário do agente confere o nome');
 await pg.fill('#iaf-nome','Agente de comentários');ok(!(await pg.$('.iaf-err')),'erro some ao corrigir o campo');
 await pg.uncheck('[data-iatipo][value=mensagem]');await pg.check('[data-iatipo][value=comentario]');await pg.fill('#iaf-sozinho','Agradecimentos');
 await pg.selectOption('#iaf-canal','google');ok(JSON.stringify(await pg.$$eval('[data-iatipo]',x=>x.map(y=>y.value)))==='["avaliacao"]'&&await pg.inputValue('#iaf-nome')==='Agente de comentários','trocar o canal troca os tipos e mantém o que foi digitado');
 await pg.selectOption('#iaf-canal','instagram');await pg.uncheck('[data-iatipo][value=mensagem]');await pg.check('[data-iatipo][value=comentario]');
 await pg.click('[data-ia=salvar]');ok(/criado, desligado e em rascunho/.test(await toastTx()),'agente novo criado desligado');
 const agn=(await pg.$$eval('[data-fld=agon]',x=>x.map(y=>y.dataset.id))).pop();
 await pg.click(`[data-fld=agon][data-id=${agn}]`);ok(/já responde comentários deste canal/.test(await toastTx()),'só um agente ligado por tipo de mensagem');
 await pg.click('[data-ia=editar][data-id=i1]');await pg.uncheck('[data-iatipo][value=comentario]');await pg.click('[data-ia=salvar]');
 await pg.click(`[data-fld=agon][data-id=${agn}]`);ok(/Agente ligado/.test(await toastTx()),'com o Instagram só nos directs, o de comentários liga');
 await pg.click(`[data-ia=excluir][data-id=${agn}]`);await pg.click('[data-ia=excluirok]');ok(/excluído e desligado/.test(await toastTx())&&!(await pg.$(`[data-fld=agon][data-id=${agn}]`)),'excluir arquiva o agente');
 await pg.click('[data-ia=verarq]');await pg.click(`[data-ia=restaurar][data-id=${agn}]`);ok(/volta desligado/.test(await toastTx())&&!(await pg.$eval(`[data-fld=agon][data-id=${agn}]`,x=>x.checked)),'restaurar traz o agente desligado');
 await pg.click('[data-x=iatab][data-v=regras]');await pg.click('[data-ia=rnova]');await pg.selectOption('#iarg-tipo','obrigatorio');await pg.fill('#iarg-regra','Sempre convidar para o direct quando o assunto for pessoal.');await pg.click('[data-ia=rsalvar]');
 ok(/vale depois de validada/.test(await toastTx())&&/Aguardando validação/.test(await pg.textContent('#ia')),'regra nova aguarda validação');
 await pg.click('[data-ia=reditar][data-id=rg2]');await pg.fill('#iarg-regra','Prometer ou sugerir resultado, garantir benefício, comparar com outros escritórios ou citar casos ganhos.');await pg.click('[data-ia=rsalvar]');
 ok(/continua valendo a atual/.test(await toastTx())&&/há uma nova versão aguardando validação/.test(await pg.textContent('#ia')),'editar regra validada cria nova versão');
 const pv=(await pg.$$eval('[data-ia=rvalidar]',x=>x.map(y=>y.dataset.id))).pop();await pg.click(`[data-ia=rvalidar][data-id=${pv}]`);
 ok(/citar casos ganhos/.test(await pg.textContent('#ia'))&&!/garantir benefício ou comparar/.test(await pg.textContent('#ia')),'validar a nova versão substitui a antiga');
 await pg.click('[data-ia=rdesat][data-id=rg1]');await pg.click('[data-ia=rdesatok]');ok(/Escreva o motivo/.test(await toastTx()),'desativar regra validada pede motivo');
 await pg.fill('#iarg-mot','Coberta por outra regra');await pg.click('[data-ia=rdesatok]');ok(/Regra desativada/.test(await toastTx()),'regra desativada com motivo');
 await pg.screenshot({path:T('s_ia_regras_edit.png'),fullPage:true});await pg.click('[data-x=iatab][data-v=agentes]');
 // atend ops
 await pg.click('#rail [data-v=atend]');await pg.click('.it');await pg.click('[data-act=qmenu]');await pg.click('[data-act=queue][data-id=todos]');await pg.selectOption('#cfil','instagram');await pg.screenshot({path:T('s_ig.png')});
 // tarefas: admin cria na conversa e vê na aba; atendente não tem a aba
 await pg.selectOption('#cfil','todos');await pg.click('.it[data-id=c1]');
 await pg.click('[data-act=chMenu]');await pg.click('[data-act=tray][data-v=task]');
 await pg.fill('#tk-tit','Mandar a minuta do acordo');await pg.selectOption('#tk-resp','Ana Júlia');await pg.click('[data-tk=criar]');
 ok(/Ela está na sua aba Tarefas/.test(await toastTx()),'tarefa criada na conversa');
 await pg.click('#rail [data-v=tarefas]');const tk=await pg.textContent('#tarefas');
 ok(/Mandar a minuta do acordo/.test(tk)&&/Enviar a proposta revisada/.test(tk)&&!/Confirmar reunião de diagnóstico/.test(tk),'aba Tarefas mostra só as do admin');
 ok(/Atrasadas \(1\)/.test(tk),'tarefa vencida aparece em Atrasadas');
 await pg.click('[data-tk=feita][data-id=k1]');ok(/concluída/.test(await toastTx()),'concluir tarefa');await pg.click('[data-x=tkaba][data-v=feitas]');ok(/Enviar a proposta revisada/.test(await pg.textContent('#tarefas')),'concluída vai para a aba Concluídas');
 await pg.screenshot({path:T('s_tarefas.png'),fullPage:true});
 await pg.click('[data-act=logout]');await pg.click('[data-act=demoLogin][data-r=atendente]');
 ok(!(await pg.$$eval('#rail button',b=>b.map(x=>x.dataset.v))).includes('tarefas'),'atendente fora do comercial não vê a aba Tarefas');
 await pg.click('.it');await pg.click('[data-act=chMenu]');await pg.click('[data-act=tray][data-v=task]');
 ok(!(await pg.$$eval('#tk-resp option',o=>o.map(x=>x.value))).includes('Ana Luiza'),'atendente fora do comercial não aparece como responsável');
 await pg.fill('#tk-tit','Retornar sobre honorários');await pg.selectOption('#tk-resp','Gabriel');await pg.click('[data-tk=criar]');
 ok(/Só Gabriel vê a tarefa/.test(await toastTx()),'atendente cria tarefa para o comercial');
 await pg.setViewportSize({width:420,height:800});await pg.screenshot({path:T('s_mobile.png')});
 console.log('ERRS',JSON.stringify(errs));if(errs.length)process.exitCode=1;await br.close();
})().catch(e=>{console.log('FAIL',e.message);process.exit(1)});
