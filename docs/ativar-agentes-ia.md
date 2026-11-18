# Ativar os agentes de IA

Roteiro para ligar os agentes de IA, os canais Instagram e Google e a revisão humana. Tudo está pronto e testado localmente,
mas **nada foi publicado**. Fazer primeiro na **homologação**. A produção só entra com a autorização da Maria Júlia.

**Onde a IA atua:** só no **Instagram** (directs e comentários) e nas **avaliações do Google**, canais em que o atendimento não é contínuo.
No WhatsApp, quem atende é a equipe. A IA deve ser pouco usada: em modo rascunho, uma pessoa aprova cada resposta.

## Como funciona, em uma frase por etapa

1. Uma mensagem chega por um canal: um direct ou comentário no Instagram (webhook `instagram-webhook`) ou uma avaliação no Google (busca `google-avaliacoes`, a cada 10 min). Ela é gravada **uma única vez** em `crm.webhook_eventos`.
2. A cada 1 minuto, a função `ia-agentes` pega as mensagens novas dos canais que têm um agente **ligado**.
3. Para cada mensagem, a função faz as conferências abaixo, nesta ordem:
   - **se o contato pede para falar com uma pessoa** ("quero falar com um atendente", "prefiro uma pessoa", "é um robô?"…), a IA **para na hora**: nada de rascunho, o atendimento vai para um atendente do Comercial (rodízio da fila, por ser o primeiro contato), que é avisado em **Menções**;
   - se a IA está pausada para o contato (pediu uma pessoa antes, uma pessoa assumiu ou ele recusou a IA), a mensagem vai direto para a equipe, sem a IA ler o texto;
   - avaliação com 3 estrelas ou menos vai direto a uma pessoa, sem chamar a IA;
   - telefone, CPF, CNPJ, e-mail e números de conta são **mascarados** antes de sair do Supabase;
   - a IA recebe as instruções do agente, as **regras validadas** e as últimas correções aprovadas pela equipe, e responde em formato fixo: responder ou transferir;
   - uma trava automática barra rascunhos com valor em reais, honorários, promessa de resultado, opinião sobre chance ou "sou advogada". Esses rascunhos ficam **bloqueados**, e só líder ou administrador libera.
4. O resultado vai para a aba **Agentes de IA → Revisão humana**. Nada é enviado ao cliente.
5. Uma pessoa **aprova e envia**, **envia com correção** (a correção vira exemplo para o agente) ou **assume a conversa**. O envio passa pela mesma fila de saída do WhatsApp, com repetição em caso de falha e a pessoa registrada como autora.

Resposta automática, sem revisão, só pode ser ligada pelo administrador, com motivo escrito, depois de 30 dias de revisão e com 90% das respostas aprovadas sem edição. O banco recusa a mudança fora dessas condições e registra no histórico quem mudou o modo, quando e por quê.

---

## 1. A função que chama a IA (`ia-agentes`)

**O que é:** um pequeno programa que roda dentro do Supabase (Edge Function), não no navegador. Ele é o único lugar que fala com a IA.
O código está em `supabase/functions/ia-agentes/` e `supabase/functions/_shared/` (`processos-ia.ts`, `ia-regras.ts`, `ia-anthropic.ts`).

**Qual IA:** Claude, da Anthropic, pelo SDK oficial (`@anthropic-ai/sdk` 1.3.0). O modelo padrão é o `claude-opus-5-5`, gravado por agente na coluna `crm.agentes.modelo`.
Quando o modelo se recusa a responder uma mensagem, o próprio serviço tenta outro modelo na mesma chamada (`fallbacks: "default"`). Se ainda assim houver recusa, a mensagem vai a uma pessoa.

**Custo estimado:** cada mensagem envia cerca de 1.500 a 2.500 tokens (instruções, regras, exemplos e a mensagem) e recebe algumas centenas a 2.000 tokens, incluindo o raciocínio do modelo.
Com o Opus 5.5 (US$ 4 por milhão de tokens de entrada e US$ 20 por milhão de saída), isso dá **cerca de US$ 0,02 a 0,05 por mensagem**. Com 50 mensagens por dia, ficaria entre US$ 30 e 75 por mês.
Dois limites seguram o gasto: o **limite diário por agente** (`crm.agentes.limite_diario`, padrão 200) e o **limite de gasto** que se define no Console da Anthropic (item 2).
Se o custo pesar, o administrador troca o modelo do agente na tela (**Agentes de IA → Editar → Modelo de IA**). As opções são Claude Opus 5.5 (US$ 4 / US$ 20 por milhão de tokens), Claude Sonnet 5.5 (US$ 2 / US$ 10, cerca de metade do custo) e Claude Haiku 5.5 (US$ 0,10 / US$ 0,50, cerca de 1/40). A escolha é de vocês: o mais barato erra mais em tom e em julgamento. O limite diário também se ajusta ali (1 a 2000).

**O que precisa para funcionar:**
- as migrações `crm_0014` (cria os agentes, as regras, a revisão e as funções de segurança), `crm_0020` (pedido de atendimento humano) e `crm_0026` (agentes e regras editáveis pela tela) aplicadas;
- o registro da validação das regras (item 5, passo 2). Sem ele, nenhum agente liga e a função não roda;
- a chave da API (item 2);
- publicar a função e agendá-la a cada 1 minuto (item 5).

---

## 2. A chave da API da Anthropic

**O que é:** uma senha longa (começa com `sk-ant-`) que identifica o escritório para a Anthropic e é usada na cobrança. Quem tem a chave gasta em nome do escritório. Por isso ela **nunca** vai para o navegador, para o git, para planilhas ou para tabelas do banco.

**Onde fica:** nos **Secrets das Edge Functions** do Supabase, o mesmo lugar onde já está a chave da Evolution. Os Secrets são criptografados e só as funções do servidor os leem.
(O Vault do Supabase continua guardando apenas o que o próprio banco usa para chamar as funções agendadas: a URL do projeto e o segredo do agendador.)

**Passo a passo (uma chave por ambiente):**
1. No Console da Anthropic (platform.claude.com), entre com a conta do escritório e crie um **workspace** separado, por exemplo "CRM homologação". Depois, outro para produção. Assim os custos aparecem separados, e cada chave pode ser cancelada sem afetar a outra.
2. No workspace, defina um **limite de gasto mensal**, por exemplo US$ 30 na homologação.
3. Crie uma **API key** nesse workspace e copie o valor. Ele só aparece uma vez.
4. Grave a chave no Supabase do mesmo ambiente:
   ```
   supabase secrets set --project-ref <ref-da-homologação> ANTHROPIC_API_KEY=sk-ant-...
   ```
   Também dá para fazer pelo painel: Edge Functions → Secrets → Add new secret.
5. Apague a chave da área de transferência e não a cole em e-mail ou chat.

**Trocar a chave** (a cada 6 meses ou se houver suspeita de vazamento): crie uma chave nova, grave-a no Secret com o mesmo nome e cancele a antiga no Console. As funções passam a usar a nova na hora, sem publicar de novo.

**Privacidade:** a IA só recebe o texto já mascarado e as instruções. Antes da produção, confiram nos termos comerciais vigentes da Anthropic como os dados enviados pela API são usados e retidos.

---

## Pedido de atendimento humano

| O que acontece | Detalhe |
|---|---|
| A IA para na hora | O pedido é reconhecido **antes** de chamar a IA. Nenhum rascunho é gerado; rascunhos ainda pendentes do mesmo contato são descartados (ninguém aprova uma resposta velha). |
| A IA fica pausada para o contato | 30 dias (`crm.config` `ia_pausa_dias`). Novas mensagens dele vão direto para a equipe. Vale também quando a própria IA indica que precisa de uma pessoa ou quando alguém clica em "Assumir a conversa". |
| Vai para o Comercial | Por ser o primeiro contato, o atendimento é delegado a um atendente da fila **Comercial**, pelo rodízio da fila (com o rodízio desligado, o primeiro da lista; quem está inativo é pulado). A fila usada fica em `crm.config` `ia_delegar`. |
| O atendente é avisado em Menções | O atendente recebe uma menção na fila **Menções** do atendimento (não há aba nem sino separado). Sem ninguém no Comercial, a menção vai para os líderes e administradores, para escolherem quem atende. Quando alguém assume pela tela, fica com essa pessoa e não há menção. |
| Voltar para a IA | Em Revisão humana, na conversa transferida: **Devolver para a IA** (tira a pausa daquele contato). |

## 3. Instagram

**Pré-requisitos:**
- Conta do Instagram **profissional** (comercial ou de criador) do escritório.
- Um **app na Meta** (developers.facebook.com) com o produto **Instagram** ("API do Instagram com login do Instagram"), com as permissões `instagram_business_basic`, `instagram_business_manage_messages` e `instagram_business_manage_comments`.
- Para atender pessoas que não são testadoras do app, a Meta exige **análise do app** e **verificação da empresa**. Isso leva dias: comece cedo.

**Secrets** (no Supabase do ambiente):
```
supabase secrets set --project-ref <ref> \
  IG_TOKEN=<token de acesso de longa duração da conta> \
  IG_VERIFY_TOKEN=<texto longo aleatório, inventado por vocês> \
  META_APP_SECRET=<App Secret do app na Meta> \
  IG_GRAPH_VERSAO=v23.0
```
Confira no painel do app qual é a versão atual do Graph API e ajuste `IG_GRAPH_VERSAO`.
O token de longa duração vale 60 dias. Quando ele vence, a faixa de canais mostra o Instagram como desconectado e a gestão recebe o alerta. Renovem antes do vencimento e gravem o novo valor no mesmo Secret.

**Webhook:** no app da Meta, em Instagram → Webhooks:
- URL de retorno: `https://<ref>.supabase.co/functions/v1/instagram-webhook`
- Token de verificação: o mesmo valor de `IG_VERIFY_TOKEN`
- Campos: `messages` e `comments`

A função confere a assinatura de cada aviso (`X-Hub-Signature-256`) com o App Secret e recusa o que não vier da Meta.

**Cadastrar o canal** (SQL Editor). A instância é o **id da conta profissional do Instagram**, o mesmo que aparece como `entry.id` nos avisos:
```sql
insert into crm.canais (tipo, nome, numero, provedor, instancia, principal, silencio_max_min)
values ('instagram', 'Instagram do escritório', '@nevespadua', 'meta', '<id da conta>', true, 1440);
```

**Regra da Meta:** directs só podem ser respondidos até 24 h depois da última mensagem da pessoa. A IA só olha mensagens das últimas 24 h, mas a aprovação também precisa sair dentro desse prazo.

---

## 4. Google (Perfil da Empresa)

O Google **encerrou as mensagens do Perfil da Empresa (Business Messages) em julho de 2024**. Por isso o agente do Google cuida só das **avaliações**.

**Pré-requisitos:**
- Um projeto no Google Cloud com acesso aprovado às **APIs do Perfil da Empresa**. O pedido é feito por formulário do Google; até a aprovação, a cota é zero.
- As APIs ativadas no projeto: My Business Account Management, My Business Business Information e Google My Business (v4, onde ficam as avaliações).
- Um cliente OAuth (tipo "aplicativo da Web") e um **refresh token** gerado com a conta que administra o perfil, no escopo `https://www.googleapis.com/auth/business.manage`. Dá para gerar pelo OAuth Playground usando o próprio cliente.

**Secrets:**
```
supabase secrets set --project-ref <ref> GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=...
```

**Cadastrar o canal.** A instância é `accounts/<id da conta>/locations/<id do local>`. Avaliações são raras, então o "silêncio suspeito" fica em 7 dias:
```sql
insert into crm.canais (tipo, nome, numero, provedor, instancia, principal, silencio_max_min)
values ('google', 'Perfil do escritório no Google', 'Neves Pádua Advocacia', 'google', 'accounts/<id>/locations/<id>', true, 10080);
```

---

## 5. Ordem para ligar (homologação primeiro)

1. **Migração:** aplicar todas as migrações até a `crm_0026_agentes_ia_editar.sql`, em ordem. Antes, rodar `npm run test:sql` localmente.
2. **Registrar a validação das regras** já feita pela advogada, uma vez por ambiente. Depois da `crm_0026`, é pela tela: entre como administrador, abra **Agentes de IA → Regras** e clique em **Validar** em cada regra (fica registrado quem validou e quando). Quem preferir pode usar o SQL Editor, com o e-mail de quem validou (precisa existir em Authentication → Users):
   ```sql
   update crm.regras_ia set validada_por = (select id from auth.users where email = 'EMAIL_DE_QUEM_VALIDOU'), validada_em = now()
    where agente_id is null and validada_em is null and ativa;
   ```
   Se o texto de uma regra mudar no futuro, a nova versão entra sem validação; a versão antiga continua valendo até a nova ser validada.
3. **Secrets:** `ANTHROPIC_API_KEY` (item 2) e os do Instagram e do Google (itens 3 e 4). Os do passo 1 do plano (`CRON_SEGREDO` etc.) já devem existir.
4. **Publicar as funções:**
   ```
   supabase functions deploy ia-agentes         --no-verify-jwt --project-ref <ref>
   supabase functions deploy instagram-webhook  --no-verify-jwt --project-ref <ref>
   supabase functions deploy google-avaliacoes  --no-verify-jwt --project-ref <ref>
   supabase functions deploy whatsapp-saida     --no-verify-jwt --project-ref <ref>   # de novo: agora envia também pelo Instagram e pelo Google
   supabase functions deploy whatsapp-saude     --no-verify-jwt --project-ref <ref>   # de novo: agora verifica também Instagram e Google
   ```
5. **Agendar** (usa a função `crm.chamar_funcao` de `supabase/functions/README.md`):
   ```sql
   select cron.schedule('crm-ia-agentes',        '* * * * *',    $$ select crm.chamar_funcao('ia-agentes') $$);
   select cron.schedule('crm-google-avaliacoes', '*/10 * * * *', $$ select crm.chamar_funcao('google-avaliacoes') $$);
   ```
6. **Cadastrar os canais** (itens 3 e 4).
7. **Abrir o app** em homologação (`npm run build:homologacao`, com a chave publicável em `config/ambientes/homologacao.json`), entrar como líder ou administrador e, em **Agentes de IA → Agentes**, marcar **Ligado** no agente. O banco recusa ligar se faltar regra validada ou canal ativo.
8. **Testar:** mandar um direct de uma conta de teste. Em até 1 minuto, o rascunho aparece em Revisão humana. Aprove e confira se a resposta chegou.

## Editar, criar e excluir agentes e regras (`crm_0026`)

Tudo pela aba **Agentes de IA**, só pelo **administrador**. Líderes veem, ligam e desligam, mas não editam. Cada mudança fica em `crm.agentes_historico`, com quem fez, quando e os valores anteriores.

| O quê | Como funciona |
|---|---|
| Criar agente | **+ Novo agente**. Escolha o canal (Instagram ou Google), a que tipo de mensagem ele responde (directs, comentários ou avaliações), as instruções, o que pode responder, quando passa para uma pessoa, o modelo e o limite diário. O agente novo nasce **desligado e em rascunho**. |
| Editar agente | **Editar** no cartão. Com o agente ligado, o canal fica travado (desligue antes para trocar). |
| Um agente ligado por tipo | Só um agente ligado para cada tipo de mensagem: Instagram directs, Instagram comentários e Google avaliações. Ex.: um agente para directs e outro, mais curto, para comentários. O banco recusa ligar (ou editar) se dois disputarem o mesmo tipo e diz qual desligar. |
| Excluir agente | **Excluir** arquiva: o agente é desligado e sai da lista. As revisões antigas e o histórico ficam. **Ver excluídos → Restaurar** traz de volta, desligado. |
| Regras | **+ Nova regra**: tipo (**Nunca**, **Sempre** ou **Com cuidado**), texto, fonte e se vale para todos os agentes ou só para um. No pedido à IA, as regras vão agrupadas por tipo. |
| Validar regra | Regra nova ou editada fica **aguardando validação** e não vale até o administrador clicar em **Validar**. Ao editar uma regra já validada, a versão atual continua valendo até a nova ser validada, para nunca ficar um intervalo sem a regra. |
| Desativar regra | Regra validada pede o motivo. Regra que ainda aguarda validação é só descartada. O banco recusa desativar se algum agente ligado ficaria sem nenhuma regra validada. |

A trava automática (valor em reais, honorários, promessa de resultado, opinião sobre chance, "sou advogada") fica no código e **não muda pela tela**.

## O que ainda não está pronto

| Item | Por quê | Quando |
|---|---|---|
| Geração dos resumos semanais | Precisa das conversas ligadas a cada cliente. A tela de revisar e publicar já funciona; gravar no dossiê também depende do vínculo. | Passo 2 |
| Lead criado pela IA no funil | Hoje quem aprova a resposta registra o lead. Criar sozinho exige os contatos sem duplicação. | Passo 3 |
| Registrar que o contato não quer falar com a IA | **Sem termo de IA** (decisão de 12/11/2026): nenhum aviso é enviado aos leads. A tabela `crm.consentimentos` e a trava continuam, para o caso de alguém pedir; falta um botão na conversa para registrar. | Quando o atendimento for ligado ao banco |
| Rascunho dentro da caixa de resposta do atendente | Hoje fica na aba Revisão humana. | Quando o atendimento for ligado ao banco |
| Login (e-mail e senha, convite, nova senha) | Programado (`docs/ligar-equipe-e-login.md`). Testado só contra um Supabase simulado. | Homologação |
