# Como promover uma mudança para produção

Uma página. Vale para toda migração `crm_NNNN`, Edge Function ou build do app.
Nada vai para produção sem a autorização expressa da Maria Júlia.

## Os três ambientes

| Ambiente | Para quê | Banco | WhatsApp | Build |
|---|---|---|---|---|
| Demonstração | Validar telas com a equipe | Nenhum (dados em memória) | Nenhum | `npm run build` |
| Homologação | Ensaiar tudo antes | Projeto Supabase **separado** (plano gratuito) | Chip de teste | `npm run build:homologacao` |
| Produção | Uso real | `ksdwzljfjfucjevdqxvx` | Número do escritório | `npm run build:producao` |

A configuração de cada um fica em `config/ambientes/<nome>.json` (URL e **chave publicável**). O build se recusa a gerar o app se encontrar uma chave secreta ou `service_role`, se a homologação apontar para o projeto de produção ou se a produção apontar para outro projeto.

## Montar a homologação (uma vez)

1. Criar um projeto novo no Supabase (ex.: `np-crm-homologacao`). Em *Settings → API → Exposed schemas*, adicionar `crm`.
2. No SQL Editor, aplicar em ordem as `supabase/migrations/crm_0002…` (pular a `crm_0001`, que segue guardada).
3. Em *Authentication → Users*, criar `admin@homolog.test`, `lider@homolog.test`, `atendente@homolog.test` e `comercial@homolog.test`.
4. Rodar `supabase/seed/homologacao.sql` (só dados fictícios; ele se recusa a rodar se o banco estiver marcado como produção).
5. Preencher `config/ambientes/homologacao.json` com a URL e a chave publicável **do projeto de homologação**.
6. Ligar o chip de teste à instância `homolog` da Evolution e publicar as funções (ver `supabase/functions/README.md`).

## Promover (a cada mudança)

1. **Local:** `npm test` passa (build + 80+ verificações SQL + unidade + integração). Se mexeu em tela: `npm run test:e2e`.
2. **Homologação:** aplicar a migração nova e repetir o "Pronto quando" do passo no plano (ex.: derrubar o chip e conferir alerta, fila e reenvio).
3. **Registro:** no PR, anotar o que foi testado em homologação e o resultado (print ou saída do teste).
4. **Autorização:** a Maria Júlia aprova por escrito (mensagem ou comentário no PR).
5. **Produção, nesta ordem:**
   1. Backup: *Database → Backups* (ou `pg_dump` do schema `crm`).
   2. Na primeira vez: `insert into crm.config (chave, valor) values ('ambiente','{"nome":"producao"}');` (é o que impede o seed de homologação de rodar ali).
   3. Aplicar a migração no SQL Editor. Todas são idempotentes: reaplicar não estraga nada.
   4. Publicar as Edge Functions, se mudaram.
   5. `npm run build:producao` e publicar o `dist/`.
6. **Conferir:** abrir o app, ver a faixa de canais verde e o painel de saúde sem alertas novos.

## Se der errado

- Migração com erro: ela roda numa transação no SQL Editor e não deixa nada pela metade. Corrija em homologação antes de tentar de novo.
- App com problema: publique de novo o `dist/` da versão anterior (guarde o zip de cada publicação).
- Dados: restaure o backup do passo 5.1. O CRM nunca altera tabelas do sistema jurídico, então o jurídico não é afetado.
