# Base de conhecimento no banco

Parte 6 da troca da demonstração pelo banco. As tabelas e as regras já existiam desde a `crm_0013`; a `crm_0023` acrescenta "restaurar" e limites de tamanho. Faça tudo **primeiro na homologação**.

## O que passa a funcionar

| Na tela (aba **Base**, no painel da conversa) | Quem | No banco |
|---|---|---|
| Procedimentos gerais e das filas da pessoa; com a conversa aberta, os da fila dela aparecem primeiro ("Desta fila") | todos | `crm.base_artigos` + `crm.base_artigo_filas`, filtrados pelo RLS (`crm.artigo_visivel`) |
| "Ver todas as filas" | líder e administrador | idem |
| Criar e editar: o administrador em qualquer fila ou em "Todas as filas"; o líder só nas filas que lidera | administrador e líder | `crm.salvar_artigo` (confere a permissão de novo) |
| Excluir (o procedimento some para a equipe, mas fica guardado) | quem pode editar | `crm.excluir_artigo` |
| **Histórico** de versões: quem criou, alterou, excluiu ou restaurou, e como estava cada versão | líder e administrador | `crm.base_artigo_historico` |
| **Ver excluídos** e **Restaurar** | administrador | `crm.restaurar_artigo` (`crm_0023`) |
| "Usar /atalho na conversa" (resposta rápida relacionada) | todos | `crm.respostas_rapidas` (parte 1) |

Limites (no banco): título até 120 letras, até 30 passos, cada passo até 500 letras.

A Base no banco começa **vazia**: os 4 procedimentos da demonstração não são copiados. Na homologação, o seed cria um procedimento de teste.

## Ligar

1. Aplicar `crm_0023_base_na_tela.sql` no SQL Editor (depois da `crm_0022`). É idempotente.
2. Nada de Edge Function nem segredo novo.

## Conferir na homologação

1. Como administrador: criar um procedimento em "Todas as filas" e outro só na fila Passivos.
2. Como atendente de Passivos: os dois aparecem. Como atendente de outra fila: só o geral.
3. Como líder de Passivos: edita o de Passivos; o geral não tem "Editar".
4. Excluir o de Passivos → some para o atendente. Como administrador: "Ver excluídos" → abrir → **Restaurar**.
5. Em qualquer procedimento, **Histórico** mostra as versões com os nomes; "Ver" mostra como estava.

## Testes automáticos

`npm run test:sql` (permissões por fila, histórico, restaurar, limites), `npm run test:conectado` (aba Base contra um Supabase simulado: líder e administrador).
