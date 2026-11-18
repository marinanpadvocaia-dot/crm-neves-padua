# Supabase — CRM / Atendimento (schema `crm`)

> **Status:** arquivos para versionar no git do escritório. **Não executar** no projeto real até autorização expressa da Maria Júlia.

## Ordem das migrações
| Arquivo | O que faz |
|---|---|
| `crm_0000_verificar_ambiente.sql` | **Somente leitura.** Lista colunas/tipos das tabelas existentes (`leads`, `clientes`, `atd_*`, `perfis`…). Rodar primeiro e enviar o resultado. |
| `crm_0001_integracao_leads_api_webhooks.sql` | Já existente no repositório. Mantido, não duplicado, não executado. |
| `crm_0002_base_e_acesso.sql` | Schema `crm`, helpers, `acessos`, `pode()/eh_lider()/eh_admin()`, grants. |
| `crm_0003_atendimento.sql` | Atendimento por conversa (fila, responsável, status; sem ticket), filas, rodízio, histórico, mensagens agendadas, config. |
| `crm_0004_funis_e_negocios.sql` | Funis, etapas, origens, motivos de perda, negócios, atividades, campos personalizados. |
| `crm_0005_fluxos_e_automacoes.sql` | Fluxos, automações e execuções. |
| `crm_0006_agentes_ia.sql` | Agentes (padrão: rascunho), regras validadas por advogado, revisões, resumos semanais. |
| `crm_0007_importacao_de_leads.sql` | Lotes/linhas de importação e deduplicação. |
| `crm_0008` | **Reservada** (passo 2): trocar os `*_ref text` por chaves reais, depois do resultado do `crm_0000`. |
| `crm_0009_canais_e_estado.sql` | Canais (WhatsApp, Instagram, Google), estado, histórico de mudanças, "silêncio suspeito" (`canais_status`). |
| `crm_0010_fila_de_saida.sql` | Fila de saída com idempotência, repetição 30 s → 2 min → 10 min → 1 h, Reenviar/Cancelar; agendadas passam pela fila. |
| `crm_0011_webhook_idempotente.sql` | Eventos brutos do webhook com chave única (canal + id + tipo), ordem pela data do provedor, reprocessamento. |
| `crm_0012_alertas_e_saude.sql` | Alertas (abrem e resolvem sozinhos), painel de saúde (`saude_resumo`), relatório diário. |
| `crm_0013_base_de_conhecimento.sql` | Base = procedimentos por fila (gerais ou de filas específicas). Admin edita tudo; líder só os das filas que lidera. Gravação por função, com histórico; excluir = desativar. |
| `crm_0014_agentes_ia_conexao.sql` | Agentes de IA prontos para ligar: 3 agentes semeados (desligados, em rascunho), 6 regras (validação registrada por comando), revisão ligada aos eventos dos canais (um rascunho por evento), aprovar = enviar pela fila de saída, correção vira exemplo, recusa do contato, modo automático só por admin com critérios, provedor `google` nos canais. Roteiro: `docs/ativar-agentes-ia.md`. |
| `crm_0015_equipe_e_ajustes.sql` | Equipe no banco: perfis (nome, função, "vê todos"), tipo de acesso e filas gravados por função só do administrador, sem limite de usuários, sessões (logado, encerrar sessão: sessão encerrada perde o acesso na hora em todas as políticas), setores e filas (horário, prazos, líder, rodízio), tags, respostas rápidas e mensagem de ausência. Excluir usuário = tirar o acesso ao CRM (o login do Supabase Auth é do sistema jurídico também e nunca é apagado). Roteiro: `docs/ligar-equipe-e-login.md`. |
| `crm_0016_crm_conexao.sql` | Aba CRM no banco: criar negócio (`negocio_criar`), perder exige motivo, histórico de etapas gravado só pelo banco, data de conclusão das atividades, campos personalizados só pelo administrador (`campo_criar`/`campo_excluir`), tempo médio real por etapa (`crm_tempo_etapas`). Funis, etapas, origens e motivos de perda ficam só para leitura da equipe (mudam pelo SQL Editor). |
| `crm_0017_tarefas.sql` | Tarefas sobre o contato, criadas na conversa. Individuais: só o responsável vê (nem o administrador vê as dos outros). Recebem e veem a aba Tarefas: administradores e quem está na fila Comercial (código da fila em `crm.config` `tarefas`, padrão `comercial`). Criar, concluir, mudar prazo e excluir só por funções. |
| `crm_0018_fluxos_de_trabalho.sql` | Fluxos e automações viram **fluxos de trabalho** (como no GCV): pastas, rascunho/publicado, versões publicadas (`crm.fluxo_versoes`; editar não mexe no que está publicado), lixeira, duplicar. Gravação só por funções de líder/admin. `crm.automacoes` fica obsoleta. A execução no servidor é a parte 3b. |
| `crm_0019_fluxos_motor.sql` | **Motor dos fluxos** (parte 3b): eventos com chave única (negócios, atendimentos, mensagens dos canais, eventos de tempo), inscrições nos fluxos publicados, execução passo a passo com esperas e caminhos, registros, avisos para a equipe (`crm.avisos`), webhooks de saída e regras do WhatsApp para mensagens automáticas (limites por minuto/hora/dia, horário de envio, "PARAR", 24 h do Instagram). Roteiro: `docs/fluxos-de-trabalho.md`. |
| `crm_0020_ia_pedido_humano.sql` | Agentes de IA só no Instagram e no Google. Pedido de atendimento humano: a IA para na hora para aquele contato (pausa de 30 dias, `crm.ia_pausas`), rascunhos pendentes dele são descartados e o atendimento é delegado a um atendente do Comercial (rodízio), que recebe uma menção (fila Menções); sem ninguém no Comercial, a menção vai para líderes e administradores. "Devolver para a IA" tira a pausa. |
| `crm_0021_importacao.sql` | Importação de leads no banco: lote iniciado, linhas em partes de até 500 (até 5000 por lote), o banco confere de novo quem já existe (telefone → ID externo → e-mail), etapa, motivo de perda, origem e responsável; cada linha registrada com ação, avisos e erros. Não dispara fluxos (a não ser que o lote peça, só para os novos). Desfazer (administrador, até 7 dias) apaga os negócios criados pelo lote. |

| `crm_0022_canais_conexao.sql` | Parte 5: canais na tela. Cadastro de canais pelo administrador (`crm.canal_salvar`; canal novo nasce desligado), ligar/desligar a verificação (`crm.canal_ativar`; o principal não desliga), **plano B em um clique** (`crm.canal_tornar_principal`: o reserva vira principal, o antigo é desligado e a fila pendente/com falha vai junto), "marcar como visto" do alerta de automação (`crm.alerta_visto`), histórico de quem pediu QR Code ou verificação (`crm.canal_anotar`, só a Edge Function `canais-conectar`). Roteiro: `docs/canais-e-saude.md`. |
| `crm_0023_base_na_tela.sql` | Parte 6: Base de conhecimento na tela. `crm.restaurar_artigo` (só administrador; volta como nova versão, com histórico "restaurado") e limites de tamanho na gravação (título até 120, até 30 passos de até 500 letras). Roteiro: `docs/base-de-conhecimento.md`. |
| `crm_0024_crm_so_comercial.sql` | CRM só do setor comercial, sem dono e com um funil só (pedido de 16/11/2026). A área `comercial` (negócios, atividades, importação…) passa a exigir estar na fila Comercial ou liderá-la (administrador continua com tudo; fila em `crm.config` `crm`). Funil `pj` vira "Comercial"; Superendividamento e Acordos são desligados e negócios que estiverem neles passam para o Comercial na etapa de mesma posição, sem disparar fluxos. Líderes de outros setores leem só a estrutura (funil, etapas, origens, motivos, campos) para montar fluxos. As filas do atendimento não mudam. |
| `crm_0025_painel_gestor.sql` | Painel do gestor (parte 7). `crm.painel_gestor(de, ate)` devolve numa chamada: agora (em aberto, sem responsável, prazo estourado, perto do prazo, aguardando o cliente), período (novos, resolvidos, 1ª resposta média, % no prazo), por fila, por pessoa (com quem está conectado), por canal e, para quem usa o CRM, o resumo do comercial. Líder vê só as filas que lidera; administrador vê todas. Prazo contado em minutos úteis de cada fila (`crm.minutos_uteis`, sem feriados). Só leitura; índices novos em datas de atendimentos e negócios. |
| `crm_0026_agentes_ia_editar.sql` | Agentes de IA editáveis pela tela, só pelo administrador. `crm.agente_salvar` (criar/editar: nome, canal, tipos de mensagem, instruções, o que responde, quando transfere, captação, base, registro, modelo Opus/Sonnet/Haiku 5.5, limite diário), `crm.agente_arquivar` / `crm.agente_restaurar` (excluir = arquivar e desligar; histórico guardado). Um agente **ligado** por tipo de mensagem (`agentes.tipos`: directs, comentários, avaliações), conferido ao ligar e ao editar; `crm.ia_eventos_para_processar` escolhe o agente pelo tipo. Regras: `crm.regra_salvar` (regra validada editada vira nova versão; a antiga vale até a nova ser validada), `crm.regra_validar`, `crm.regra_desativar` (validada exige motivo; recusa se um agente ligado ficaria sem regra validada). Tipos de regra Nunca/Sempre/Com cuidado vão agrupados no pedido à IA. Tudo em `crm.agentes_historico` (com os valores anteriores). |

Todas são idempotentes (podem ser reaplicadas). Exigem PostgreSQL 14+ (`create or replace trigger`).
As 0009–0012 são o passo 1 do plano de robustez; as Edge Functions que as usam estão em `functions/` (ver `functions/README.md`).
`seed/homologacao.sql` carrega dados fictícios **só na homologação** (recusa rodar em produção). Roteiro: `docs/promover-para-producao.md`.

## Antes de aplicar (quando autorizado)
1. Rodar `crm_0000` e conferir tipos de id das tabelas existentes → converter os `*_ref text` em FKs reais numa `crm_0008`.
2. Em *Settings → API → Exposed schemas*, adicionar `crm`.
3. Criar o primeiro admin: descomentar o `insert` ao final de `crm_0002` com o `user_id` correto. Os demais usuários são criados pela tela (Configurações → Usuários), que envia o convite por e-mail.
4. Sem linha em `crm.acessos` ninguém acessa nada (RLS fail-closed) — comportamento intencional.

## Regras
- O CRM **nunca** altera tabelas/funções do sistema jurídico.
- Só chave publicável no front; **nunca** `service_role`; segredos só no Vault.
- Prefixo de migrações: `crm_NNNN`.

## Testes locais (sem tocar no Supabase)
```
npm install
npm run test:sql   # PGlite: aplica 2x, RLS, auditoria, rodízio, FK composta, dedupe, canais, fila de saída, webhook, alertas, base por fila, agentes de IA, equipe e sessões, CRM, tarefas, fluxos de trabalho, motor e regras do WhatsApp, pedido de humano na IA, importação (337 verificações)
npm run test:unit  # regras das Edge Functions + integração (código real das funções × migrações reais × WhatsApp simulado) + seed
npm run modelo     # regenera docs/modelo-de-dados.html
```
