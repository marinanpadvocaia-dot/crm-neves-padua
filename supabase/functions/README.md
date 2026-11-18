# Edge Functions: canais (WhatsApp, Instagram, Google) e agentes de IA

> **Status:** escritas e testadas localmente com canais e IA simulados (`npm run test:unit`). **Nunca publicadas.**
> Publicar primeiro na homologação, com o chip de teste e contas de teste. A conversa com os serviços reais
> (Evolution, Graph API do Instagram, API do Perfil da Empresa) precisa ser conferida com as versões em uso.
> Agentes de IA, Instagram e Google: roteiro completo em [`docs/ativar-agentes-ia.md`](../../docs/ativar-agentes-ia.md).

| Função | Quando roda | O que faz |
|---|---|---|
| `whatsapp-webhook` | A cada evento da Evolution | Grava o evento bruto uma única vez (`crm.webhook_registrar`). Repetido é ignorado. Conexão muda o estado do canal na hora. |
| `whatsapp-saude` | A cada 1 min (pg_cron) | Consulta o estado de cada canal (WhatsApp, Instagram e Google), grava as mudanças, abre/resolve alertas e avisa a gestão. Com `?relatorio=1`, envia o relatório do dia. |
| `whatsapp-saida` | A cada 1 min (pg_cron) | Esvazia a fila de saída de **todos os canais**: devolve mensagens presas, traz as agendadas, envia com intervalo de 1,5 s e registra sucesso/falha (repetição 30 s → 2 min → 10 min → 1 h; na 5ª falha, o atendente decide). |
| `instagram-webhook` | A cada aviso da Meta | Confere a assinatura (`X-Hub-Signature-256`), grava directs e comentários uma única vez. GET responde à verificação do webhook. |
| `google-avaliacoes` | A cada 10 min (pg_cron) | Busca avaliações sem resposta do Perfil da Empresa e grava cada uma uma única vez. |
| `usuarios-convite` | Quando o administrador cria um usuário na tela | Confere que quem chamou é administrador, reaproveita quem já tem login (sistema jurídico) e convida por e-mail quem não tem. Roteiro: [`docs/ligar-equipe-e-login.md`](../../docs/ligar-equipe-e-login.md). |
| `canais-conectar` | Quando líder ou administrador clica em "Reconectar (QR Code)" ou "Verificar agora" | Confere líder/admin pelo JWT, pede um QR Code novo à Evolution (a apikey não sai da função; o navegador só recebe a imagem e o código de pareamento) ou consulta o estado na hora, grava o estado e anota quem pediu no histórico do canal. Roteiro: [`docs/canais-e-saude.md`](../../docs/canais-e-saude.md). |
| `fluxos-motor` | A cada 1 min (pg_cron) | Lê as mensagens novas dos canais, procura eventos de tempo, inscreve contatos e negócios nos fluxos publicados, executa os passos (mensagens pela fila de saída) e envia os webhooks. Roteiro: [`docs/fluxos-de-trabalho.md`](../../docs/fluxos-de-trabalho.md). |
| `fluxos-ia` | Quando alguém pede para a IA montar ou mudar um fluxo | Confere líder/admin, manda à IA só o catálogo de gatilhos e ações e as opções do escritório (filas, tags, funis, nomes da equipe), confere a resposta contra o catálogo e devolve uma proposta. Nada é salvo: a pessoa confere e publica. |
| `ia-agentes` | A cada 1 min (pg_cron) | Para cada mensagem nova de canal com agente ligado: confere recusa do contato, mascara dados, chama a IA (Claude) com as regras validadas e grava o rascunho na revisão humana. Em modo rascunho, nada é enviado. |

A lógica fica em `_shared/processos.ts` (canal) e `_shared/processos-ia.ts` (IA, Instagram, Google), com banco, adaptadores e IA injetados; `index.ts` de cada função só liga os fios.
Regras puras: `_shared/regras.ts` e `_shared/ia-regras.ts`. Adaptadores: `_shared/adaptador.ts` (Evolution) e `_shared/canais-meta-google.ts` (Instagram, Google). IA: `_shared/ia-anthropic.ts` (SDK oficial da Anthropic).
Trocar de provedor = novo adaptador, sem mexer no app nem nas tabelas.

**Ainda falta (passo 2):** gravar as mensagens recebidas na conversa (`atd_mensagens`) e descobrir o número de destino a partir da conversa. As duas coisas dependem do resultado do `crm_0000` e do `crm_0008`. Até lá, as mensagens recebidas ficam em `crm.webhook_eventos` e os envios precisam do `destino` preenchido (as respostas aprovadas da IA já levam o destino).

## Segredos

Ficam nos *Secrets* das Edge Functions (criptografados, fora do git). Nada disso vai para o front nem para o banco.

```
supabase secrets set --project-ref <ref> \
  EVOLUTION_URL=https://evolution.seu-dominio \
  EVOLUTION_APIKEY=... \
  WEBHOOK_SEGREDO=<texto longo aleatório> \
  CRON_SEGREDO=<outro texto longo aleatório> \
  ALERTA_WEBHOOK_URL=<URL do webhook do canal de gestão no Discord> \
  ANTHROPIC_API_KEY=sk-ant-... \
  IG_TOKEN=... IG_VERIFY_TOKEN=<texto longo aleatório> META_APP_SECRET=... IG_GRAPH_VERSAO=v23.0 \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=... \
  APP_URL=https://<endereço do app>/ \
  FLUXOS_IA_MODELO=claude-opus-5-5   # opcional; padrão claude-opus-5-5
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pelo Supabase; a `service_role` só existe dentro das funções.
Os segredos do Instagram e do Google só são exigidos quando há canal cadastrado com provedor `meta` ou `google`.

## Publicar

```
supabase functions deploy whatsapp-webhook  --no-verify-jwt --project-ref <ref>
supabase functions deploy whatsapp-saude    --no-verify-jwt --project-ref <ref>
supabase functions deploy whatsapp-saida    --no-verify-jwt --project-ref <ref>
supabase functions deploy instagram-webhook --no-verify-jwt --project-ref <ref>
supabase functions deploy google-avaliacoes --no-verify-jwt --project-ref <ref>
supabase functions deploy ia-agentes        --no-verify-jwt --project-ref <ref>
supabase functions deploy usuarios-convite  --no-verify-jwt --project-ref <ref>
supabase functions deploy fluxos-ia         --no-verify-jwt --project-ref <ref>
supabase functions deploy fluxos-motor      --no-verify-jwt --project-ref <ref>
supabase functions deploy canais-conectar   --no-verify-jwt --project-ref <ref>
```
`--no-verify-jwt` porque nem a Evolution, nem a Meta, nem o pg_cron mandam JWT de usuário. A proteção é o segredo: `?s=WEBHOOK_SEGREDO` no webhook da Evolution, a assinatura com o App Secret no da Meta e o cabeçalho `x-cron-segredo` nas agendadas (comparação em tempo constante).
O `usuarios-convite` e o `canais-conectar` recebem o JWT de quem está logado e o conferem pelo próprio banco (`crm.eh_admin()` / `crm.eh_lider()`), o que funciona também com as chaves novas do Supabase.

Na Evolution, configurar o webhook da instância para
`https://<ref>.supabase.co/functions/v1/whatsapp-webhook?s=<WEBHOOK_SEGREDO>` com os eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE` e `CONNECTION_UPDATE`.

## Agendar (pg_cron + pg_net, segredos do lado do banco no Vault)

**Pelo script (recomendado):** `.\scripts\agendar-funcoes.ps1 -Ref <ref>` faz tudo abaixo de uma vez: liga as extensões, gera um `CRON_SEGREDO` novo sem exibir, grava nas Edge Functions e no Vault e cria os agendamentos. Pode rodar de novo (troca o segredo nos dois lugares). Na produção, exige `-AutorizadoProducao`. Homologação ligada em 18/11/2026.

O SQL equivalente, para conferência:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'crm_url_projeto');
select vault.create_secret('<CRON_SEGREDO>', 'crm_cron_segredo');

create or replace function crm.chamar_funcao(p_nome text) returns void language sql security definer set search_path = '' as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'crm_url_projeto') || '/functions/v1/' || p_nome,
    headers := jsonb_build_object('content-type', 'application/json',
                 'x-cron-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_segredo')),
    body    := '{}'::jsonb);
$$;
revoke all on function crm.chamar_funcao(text) from public, anon, authenticated;

select cron.schedule('crm-whatsapp-saude', '* * * * *', $$ select crm.chamar_funcao('whatsapp-saude') $$);
select cron.schedule('crm-whatsapp-saida', '* * * * *', $$ select crm.chamar_funcao('whatsapp-saida') $$);
select cron.schedule('crm-relatorio-diario', '0 21 * * 1-5', $$ select crm.chamar_funcao('whatsapp-saude?relatorio=1') $$); -- 18h em Brasília
select cron.schedule('crm-ia-agentes', '* * * * *', $$ select crm.chamar_funcao('ia-agentes') $$);
select cron.schedule('crm-google-avaliacoes', '*/10 * * * *', $$ select crm.chamar_funcao('google-avaliacoes') $$);
select cron.schedule('crm-fluxos-motor', '* * * * *', $$ select crm.chamar_funcao('fluxos-motor') $$);
```

## Testar sem o Supabase

`npm run test:unit` roda as regras puras e os testes de integração, que usam o código real destas funções contra as migrações reais (PGlite):
- canal: o WhatsApp cai, nada se perde, a fila esvazia ao reconectar sem duplicar e o webhook repetido é ignorado;
- convite: só administrador, reaproveita login existente, valida e-mail e nome;
- motor dos fluxos: mensagem real da Evolution entra no fluxo publicado, sai pela fila e o webhook é enviado, sem repetir; webhook só para https público;
- fluxos com IA: só líder/admin, resposta conferida contra o catálogo (valor inventado vira pendência), caminhos montados certo;
- IA: directs, comentários e avaliações entram uma vez só; recusa do contato, avaliação negativa e trava de regras funcionam; o telefone não chega à IA; aprovar envia pelo canal certo; a correção vira exemplo.
