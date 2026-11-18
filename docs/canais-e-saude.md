# Canais, fila de saída e saúde no banco

Parte 5 da troca da demonstração pelo banco (`crm_0022` + Edge Function `canais-conectar`). Faça tudo **primeiro na homologação**.
As tabelas e as funções agendadas do passo 1 (`crm_0009`–`crm_0012`, `whatsapp-saude`, `whatsapp-saida`, `whatsapp-webhook`) já existiam; esta parte liga a tela a elas.

## O que passa a funcionar

| Na tela | Quem | No banco |
|---|---|---|
| Faixa e resumo "Canais ok" com o estado real de cada canal ativo, atualizados a cada minuto | todos | `crm.canais_status` |
| Histórico do canal ao clicar (quedas, reconexões, trocas, quem pediu QR Code) | todos | `crm.canal_eventos` |
| Aviso na caixa de mensagem quando o canal está fora, com o tamanho real da fila | todos | `crm.saida_mensagens` |
| **Reconectar (QR Code)**: o QR Code vem da Evolution; a janela fecha sozinha quando o celular conecta. Também mostra o código de pareamento | líder e administrador | Edge Function `canais-conectar` |
| **Verificar agora**: consulta o estado na hora, sem esperar o minuto | líder e administrador | `canais-conectar` |
| Configurações → **Saúde**: alertas abertos, fila de saída (Reenviar/Cancelar), eventos recebidos dos canais (Reprocessar), avisos ao grupo de gestão (se chegaram ou não) e relatório do dia | administrador | `crm.saude_resumo`, `crm.relatorio_diario`, `crm.webhook_eventos`, `crm.alertas` |
| **+ Novo canal** e **Editar** (nome, número, provedor, instância, tempo de silêncio, reserva) | administrador | `crm.canal_salvar` |
| **Ligar verificação / Desligar** um canal que não é o principal | administrador | `crm.canal_ativar` |
| **Tornar principal** (plano B em um clique): o antigo é desligado e a fila pendente ou com falha sai pelo novo | administrador | `crm.canal_tornar_principal` |
| **Marcar como visto** o alerta "automação com erro" (o único que não se resolve sozinho) | líder e administrador | `crm.alerta_visto` |

Regras que valem no banco, não só na tela:
- Canal novo nasce **desligado** e não principal: ligar e virar principal são passos separados, para não trocar o número de envio sem querer.
- O principal não pode ser desligado; para tirá-lo, torne outro principal.
- Instância repetida e provedor que não serve ao tipo (ex.: Meta para WhatsApp) são recusados.
- A apikey da Evolution nunca chega ao navegador: fica nos segredos da função.

Continua de demonstração: as **conversas**. A bolha de uma conversa de demonstração usa uma fila local, mas com o estado real do canal. As mensagens recebidas ficam guardadas em `crm.webhook_eventos` ("Guardado · entra na conversa com o passo 2" no painel) até o passo 2.

## 1. Banco

Aplicar `crm_0022_canais_conexao.sql` no SQL Editor (depois da `crm_0021`). É idempotente.

## 2. Edge Function

```
supabase functions deploy canais-conectar --no-verify-jwt --project-ref <ref>
```
Usa os segredos que o passo 1 já pede: `EVOLUTION_URL`, `EVOLUTION_APIKEY` e `APP_URL` (o CORS só aceita o endereço do app). Nada novo para configurar.

## 3. Conferir na homologação (com o chip de teste)

1. Entrar como administrador → Configurações → **Saúde**. Os canais do seed aparecem; os quadros mostram números do banco.
2. **Avisos ao grupo de gestão**: se aparecer "não enviado · canal de gestão não configurado", falta o segredo `ALERTA_WEBHOOK_URL` na função `whatsapp-saude`.
3. No celular do chip de teste, desconectar o aparelho (WhatsApp → Aparelhos conectados → Sair). Em até 1 minuto a faixa fica vermelha e o alerta abre.
4. Clicar no canal na faixa → **Reconectar (QR Code)** → ler o QR. A janela fecha sozinha e a faixa volta a "Canais ok". O histórico mostra "QR Code pedido por <seu nome>".
5. Plano B de teste: **+ Novo canal** para o reserva de homologação (instância `homolog-reserva`), **Reconectar**, **Tornar principal**. Conferir que a fila foi junto e que o histórico registra a troca. Depois, **Tornar principal** no chip de teste para voltar.
6. Entrar como líder: reconectar e verificar funcionam; a aba Saúde não aparece (é do administrador).

## Testes automáticos

- `npm run test:sql`: permissões, cadastro, plano B (fila vai junto, enviada fica), alerta visto.
- `npm run test:unit`: `canais-conectar` (só líder, QR Code, já conectado, Instagram/Google sem QR, erro da Evolution) e o pedido de QR Code à Evolution; integração com o banco local (QR pedido → verificar → conectado, com histórico).
- `npm run test:conectado`: a tela contra um Supabase simulado (faixa, histórico, QR Code, painel de saúde, plano B, cadastro).
