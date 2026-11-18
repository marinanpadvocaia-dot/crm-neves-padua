# Subir o CRM para o git e para o Supabase

Roteiro de 18/11/2026, no mesmo padrão do sistema jurídico: código por **pull request** com o check `verificar`, banco **primeiro na homologação**, depois na produção, com a autorização da Maria Júlia registrada.

> O que este roteiro assume: o CRM só cria o schema `crm` e as funções dele. Nenhuma migração altera tabelas ou funções do sistema jurídico (conferido: o único contato com fora do schema são as chaves para `auth.users` e o uso de `auth.uid()`). O que ainda não foi feito: `crm_0000` (conferência das tabelas do jurídico) e `crm_0008` (trocar `*_ref text` por chaves reais). O CRM sobe sem eles; as filas só precisam ter o mesmo código do `atd_filas` (ver `docs/ligar-equipe-e-login.md`, §2.3).

## 1. Git

> **Decisão de 18/11/2026:** o repositório fica em `nevespaduaadv/crm`, **público** como o `painel` do sistema jurídico (o GitHub Pages gratuito exige repositório público). Não há chave secreta no código; os dados ficam protegidos pelo login e pelo RLS. O app é publicado pelo `.github/workflows/publicar.yml` a cada merge na `main`, só se o `npm test` passar, hoje com o ambiente **homologação**. O item 1 abaixo (privado) ficou superado.

1. **Repositório privado** `nevespaduaadv/crm`. Não deixe público: tem regras de atendimento, procedimentos e a estrutura do banco.
   ```
   gh repo create nevespaduaadv/crm --private --description "CRM e Atendimento Neves Pádua"
   ```
   (ou pelo site do GitHub, marcando *Private*).
2. **`.gitignore`** (hoje só tem `node_modules/`). Acrescente:
   ```
   .env
   .env.*
   *.log
   d5*.png
   ```
   `dist/` fica de fora do git se o app for publicado por build manual (`npm run build:producao`); se for publicar pelo GitHub Pages direto do repositório, deixe `dist/` dentro. Decida antes do primeiro commit.
3. **Conferir antes de commitar** (na pasta do projeto):
   ```
   npm install
   npm test
   git grep -nEi "eyJ[A-Za-z0-9_-]{20,}|sk-ant-|sb_secret|service_role_key" -- . ":!supabase/migrations"
   ```
   O `git grep` tem que voltar vazio. As chaves **publicáveis** em `config/ambientes/*.json` podem ir ao git; qualquer chave secreta, não.
4. **Primeiro envio por branch e PR** (não direto na `main`):
   ```
   git init -b main
   git add .
   git commit -m "CRM e Atendimento: base, migrações crm_0002 a crm_0026, Edge Functions e testes"
   git remote add origin https://github.com/nevespaduaadv/crm.git
   git push -u origin main
   git checkout -b feat/ajustes-seguintes
   ```
   O primeiro commit na `main` vazia é inevitável; **depois dele** tudo entra por PR.
5. **Proteção da `main`** (GitHub > Settings > Rules > Rulesets), como no repositório do sistema: exigir PR e o check **`verificar`**. O arquivo `.github/workflows/verificar.yml` deste pacote cria esse check (roda `npm test`; não usa Supabase nenhum).

## 2. Supabase: homologação primeiro

Siga `docs/promover-para-producao.md` (seção "Montar a homologação"). Em resumo:

1. Projeto novo e **separado** (`np-crm-homologacao`, plano gratuito). Não use o beta do sistema jurídico (`ooynicwexxqqccihjiah`): ele recebe cópia de dados reais pelo Espelho e o CRM de teste exige dados fictícios.
2. *Settings > API > Exposed schemas*: acrescentar `crm`.
3. Aplicar as migrações em ordem, uma por vez, com o ajudante:
   ```
   .\scripts\aplicar-migracoes.ps1
   ```
   Ele copia cada arquivo para a área de transferência; você cola no SQL Editor, roda (confirma o aviso "Potential issue") e segue. Pula a `0001` (guardada) e a `0000` (só leitura).
4. Criar os logins de teste, rodar `supabase/seed/homologacao.sql`, preencher `config/ambientes/homologacao.json` (URL e chave publicável **da homologação**), publicar as Edge Functions (`supabase/functions/README.md`).
5. Repetir o "Pronto quando" de cada passo do plano (derrubar o canal e ver alerta, fila e reenvio; convite de usuário; encerrar sessão).

## 3. Supabase: produção (`ksdwzljfjfucjevdqxvx`)

**Só depois** da homologação aprovada **e** da autorização da Maria Júlia por escrito (mensagem ou comentário no PR).

Antes de qualquer SQL:

- [ ] Backup: *Database > Backups* (ou `pg_dump`). Confirme que existe antes de seguir.
- [ ] Contar as tabelas do `public` e anotar o número (a conferência no fim compara):
  ```sql
  select count(*) as tabelas_public from pg_tables where schemaname = 'public';
  select count(*) as funcoes_public from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
  ```
- [ ] Horário de pouco uso: acrescentar `crm` nos *Exposed schemas* recarrega a API do projeto, que é o mesmo do sistema jurídico.
- [ ] Auth: **não** desligue o cadastro aberto sem confirmar que o sistema jurídico não depende dele (aviso do `docs/ligar-equipe-e-login.md`, §1).

Aplicação, nesta ordem:

1. Aplicar `0002` e `0003` (`.\scripts\aplicar-migracoes.ps1 -Ate 3`). A tabela `crm.config` nasce na `0003`; logo em seguida, **antes de qualquer outra coisa**:
   ```sql
   insert into crm.config (chave, valor) values ('ambiente', '{"nome":"producao"}') on conflict (chave) do nothing;
   ```
   (é isso que impede o seed de homologação de rodar na produção).
2. Aplicar `0004` a `0026` com `.\scripts\aplicar-migracoes.ps1 -De 4`.
3. Primeiro administrador (e-mail de quem administra; precisa já existir em *Authentication > Users*):
   ```sql
   insert into crm.acessos (user_id, area, papel)
   select id, 'admin', 'admin' from auth.users where email = 'EMAIL_DO_ADMIN' on conflict do nothing;
   ```
4. Filas e código da fila Comercial: conforme `docs/ligar-equipe-e-login.md`, §2.3 (usar o mesmo código do `atd_filas`).
5. Edge Functions e segredos: `supabase/functions/README.md`. **Segredos só no painel/Vault do Supabase**, nunca no chat, no git ou neste roteiro.
6. `npm run build:producao` e publicar o app.

Conferências no fim (precisam fechar):

```sql
-- o jurídico não mudou
select count(*) as tabelas_public from pg_tables where schemaname = 'public';   -- igual ao antes
select count(*) as funcoes_public from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'; -- igual ao antes
-- o CRM subiu inteiro e com segurança ligada
select count(*) as tabelas_crm, count(*) filter (where rowsecurity) as com_rls from pg_tables where schemaname = 'crm';  -- as duas iguais (51 no teste local)
-- sem acesso cadastrado, ninguém lê nada (esperado: 0 linhas para quem não está em crm.acessos)
```

## 4. Se algo falhar

- Migração com erro: cada arquivo roda numa transação; nada fica pela metade. Corrija e rode de novo (todas são idempotentes): `-De N`.
- Antes de usar a produção: o schema `crm` é isolado. Em homologação, `drop schema crm cascade;` zera tudo. **Na produção, só com backup e com a autorização da Maria Júlia.**
- App: republique o `dist/` anterior.

## 5. Pendências conhecidas

- `crm_0000` e `crm_0008` (chaves reais para `leads`, `clientes`, `atd_*`, `perfis`).
- Um teste do rodízio (`atendimento delegado ao primeiro do rodízio do Comercial`, em `tests/sql/ia.mjs`) falhou 1 vez em 8 execuções locais e passou nas outras 7: não investiguei a causa. A função escolhe por `order by m.ordem, m.user_id`, então a suspeita é o estado do teste (rodízio ou ids sorteados). Vale investigar antes de exigir o `verificar` na `main`, para o check não reprovar PR sem motivo.
- `package.json`: o campo `description` está com acentos corrompidos (`PÃ¡dua`); corrigir ao salvar em UTF-8.
- Teste de unidade, integração e o build não foram rodados na minha conferência; só `npm run test:sql` (456 verificações, 24 migrações). O primeiro `verificar` no GitHub mostrará o resto.
