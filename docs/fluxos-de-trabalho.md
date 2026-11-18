# Fluxos de trabalho: como funcionam e como ligar

Os fluxos substituem as antigas "Fluxos de conversa" e "Automações". Funcionam como no GCV:
**acionadores** (basta um acontecer) → **passos** em sequência, com **caminhos** (se/senão, horário, aguardar resposta). Não há menus nem perguntas automáticas ao cliente (decisão de 13/11/2026).

## Como um fluxo roda

1. **Publicar** grava uma versão. O que roda é a versão publicada; editar o rascunho depois não muda nada até publicar de novo.
2. A cada minuto, a função `fluxos-motor`:
   - lê as mensagens novas do WhatsApp e do Instagram (o mesmo leitor dos agentes de IA);
   - procura os eventos de tempo (cliente sem responder, equipe sem responder, negócio parado, data de campo, tarefa atrasada);
   - inscreve cada contato ou negócio nos fluxos publicados cujo acionador bate;
   - anda com cada inscrição até ela esperar (Aguardar, Aguardar resposta, fora do horário ou acima do limite de envio) ou terminar.
3. Cada evento tem uma chave única: **nada dispara duas vezes**. Mensagens saem pela fila de saída (a mesma do atendimento, com o mesmo controle de repetição).
4. Tudo fica visível no fluxo: **Histórico de inscrições** (quem entrou, onde está, quando segue, botão "Tirar do fluxo") e **Registros de execução** (o que cada passo fez, inclusive o que foi pulado e por quê).

## Configurações de cada fluxo

| Opção | O que faz |
|---|---|
| Permitir que o mesmo contato entre de novo | Sem isso, quem já passou pelo fluxo não entra outra vez. Com isso, só não entra se ainda estiver nele. |
| Tirar o contato do fluxo quando ele responder | Se o cliente escreveu, ele sai (a equipe assume). Quem está num passo "Aguardar resposta" segue pelo caminho "Respondeu". |
| Enviar mensagens só dentro do horário do setor | Fora do horário, a mensagem espera a abertura do setor escolhido. |

## O que já funciona e o que depende do passo 2

| | Já funciona | Depende do passo 2 (vínculo com o sistema jurídico) |
|---|---|---|
| Acionadores | Nova conversa, cliente respondeu (palavras-chave), cliente sem responder, conversa sem resposta da equipe, fora do horário, negócio criado, mudou de etapa, ganho, perdido, parado na etapa, campo alterado, data de um campo, tarefa atrasada | Tag adicionada/removida, atendimento resolvido. Webhook de entrada depende da integração de leads (`crm_0001`). |
| Ações | Mensagem, resposta rápida, avisar alguém da equipe (menção na fila Menções), atualizar campo, criar negócio, mover etapa, marcar ganho/perdido, criar atividade, criar tarefa, aguardar, aguardar resposta, se/senão, dentro do horário, ir para outro fluxo, encerrar, webhook | Adicionar/remover tag, transferir para fila. Atribuir responsável já funciona no negócio; no atendimento, depois do passo 2. |
| Condições do "Se" | Etapa, funil, origem e valor do negócio, canal, última resposta do cliente | Tag do contato (até lá conta como "não", e o registro explica) |

No construtor, o que depende do passo 2 aparece com um aviso amarelo.

**Contato:** no WhatsApp, o contato é identificado pelos últimos 11 dígitos do número, igual ao telefone dos negócios. Assim, uma mensagem do cliente e o negócio dele se encontram sem precisar do passo 2.

## Regras do WhatsApp (mensagens automáticas)

O número do escritório usa a Evolution (WhatsApp comum, não a API oficial). O WhatsApp bloqueia números que mandam muitas
mensagens, rápido demais, fora de hora ou para quem não quer receber. Por isso, toda mensagem **automática** dos fluxos segue estas regras
(mensagens digitadas pela equipe e respostas da IA aprovadas por uma pessoa não entram nos limites):

| Regra | Padrão | O que acontece |
|---|---|---|
| Limite por minuto, por hora e por dia, por número | 8 / 100 / 500 | Passou do limite, a mensagem **espera** (não é perdida): 1 min, 15 min ou o próximo dia de envio. |
| Horário de envio automático | Seg–Sáb, 8h às 20h | Fora do horário, espera a próxima abertura. Vale junto com a opção "só no horário do setor" do fluxo. |
| Intervalo entre mensagens | 2,5 s a 5,5 s, variável | Mensagens automáticas saem espaçadas e sem ritmo fixo (envio "robótico" é o que mais bloqueia). |
| Quem pede para parar | — | Se o cliente responder só "PARAR", "PARE", "SAIR", "STOP", "CANCELAR" ou "não quero mais receber", ele sai de todos os fluxos e não recebe mais mensagens automáticas (fica registrado em `crm.consentimentos`). A equipe continua podendo falar com ele normalmente. |
| Instagram | 24 h | Só responde até 24 h depois da última mensagem do cliente (regra da Meta). Depois disso, o passo é pulado e o registro explica. |
| Mesma mensagem repetida | 60 s | A mesma mensagem para o mesmo contato em menos de 60 s é recusada (regra da fila de saída). |

Para mudar os limites ou o horário (SQL Editor):
```sql
update crm.config set valor = valor || '{"por_hora": 80, "inicio": "09:00", "fim": "19:00"}' where chave = 'whatsapp_automacao';
```

**Boas práticas que o sistema não consegue garantir sozinho:**
- Personalize as mensagens com `{nome}`: textos idênticos para muitos contatos são marcados como spam.
- Mande mensagem automática só para quem já falou com o escritório ou deixou o número (formulário, anúncio). Nada de listas compradas.
- Em fluxos para muitos contatos ao mesmo tempo (ex.: negócios parados), comece com poucos e acompanhe os registros.
- Se o número receber aviso ou bloqueio do WhatsApp, despublique os fluxos de mensagem e use o número reserva (`docs/plano-b-numero-reserva.md`).

## Ligar (homologação primeiro)

1. Aplicar `crm_0018_fluxos_de_trabalho.sql` e `crm_0019_fluxos_motor.sql` depois das anteriores (antes, `npm run test:sql`).
2. Publicar as funções:
   ```
   supabase functions deploy fluxos-motor --no-verify-jwt --project-ref <ref>
   supabase functions deploy fluxos-ia    --no-verify-jwt --project-ref <ref>
   ```
   `fluxos-motor` usa o `CRON_SEGREDO` (passo 1). `fluxos-ia` usa `ANTHROPIC_API_KEY` e `APP_URL`.
3. Agendar (função `crm.chamar_funcao` de `supabase/functions/README.md`):
   ```sql
   select cron.schedule('crm-fluxos-motor', '* * * * *', $$ select crm.chamar_funcao('fluxos-motor') $$);
   ```
   As mensagens saem pela `whatsapp-saida`, que já roda a cada minuto.
4. Testar com o **chip de teste**: publicar um fluxo "Cliente respondeu · palavra teste" → "Enviar mensagem", mandar "teste" do celular de teste e conferir, em até 2 minutos, a resposta no celular e os registros no fluxo.

## Cuidados

- **Webhooks** só vão para endereço `https` público (endereço interno ou IP direto é recusado). Até 3 tentativas.
- **Volume**: cada ciclo executa até 100 inscrições e lê até 200 mensagens novas; os limites do WhatsApp acima valem por cima disso.
- Despublicar um fluxo para de inscrever contatos novos; quem já estava nele segue até o fim. **Apagar** tira todo mundo.
