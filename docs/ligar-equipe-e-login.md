# Ligar a equipe, o login e os ajustes ao banco

Parte 1 da troca da demonstração pelo banco (`crm_0015`). Faça tudo **primeiro na homologação**.

## O que passa a funcionar

| Na tela | No banco |
|---|---|
| Login comum com e-mail e senha para todos, inclusive o administrador (sem código de autenticador); "Esqueci minha senha" envia o link de verdade | Supabase Auth |
| Novo usuário recebe o **e-mail de convite** e cria a própria senha | Edge Function `usuarios-convite` + `crm.usuario_salvar` |
| Quem já tem login no sistema jurídico é aproveitado, sem novo e-mail | `crm.usuario_id_por_email` |
| Tipo de acesso, filas, "vê Todos os clientes", função | `crm.perfis`, `crm.acessos`, `crm.fila_membros` |
| Sem limite de usuários | — |
| LOGADO / DESLOGADO, último acesso, visto por último | `crm.sessoes` (o app avisa o banco a cada minuto) |
| Encerrar a sessão de alguém: a pessoa perde o acesso **na hora** | todas as políticas do CRM recusam a sessão encerrada |
| Excluir usuário: tira o acesso ao CRM, devolve os atendimentos abertos à fila (o CRM não tem dono por negócio desde a `crm_0024`) | `crm.usuario_desativar` (o login **não** é apagado: ele também serve ao sistema jurídico) |
| Setores: dias, horário, prazos, líder, nova fila, rodízio | `crm.filas_config` |
| Tags e cores, respostas rápidas, mensagem de ausência | `crm.tags`, `crm.respostas_rapidas`, `crm.config` `ausencia` |

Antes, qualquer atendente podia mudar horários e prazos direto na tabela. Agora só o administrador muda, sempre por uma função do banco.

A aba CRM foi ligada na parte 2 (`crm_0016`, aplicar depois da `crm_0015`).

Continua em demonstração (próximas partes): conversas e mensagens (dependem do passo 2), Painel do gestor. Fluxos (partes 3a/3b), importação (parte 4), canais e saúde (parte 5, `docs/canais-e-saude.md`) e Base de conhecimento (parte 6, `docs/base-de-conhecimento.md`) já foram ligados.

## 1. Supabase Auth (painel do projeto)

1. **Authentication → URL Configuration**
   - *Site URL*: o endereço onde o app fica publicado (ex.: `https://crm.nevespaduaadvocacia.com.br/`).
   - *Redirect URLs*: o mesmo endereço. O link do convite e o de "esqueci minha senha" só voltam para endereços desta lista.
2. **Authentication → Sign In / Providers → Email**: ligado. Deixe **desligado** o cadastro aberto (*Allow new users to sign up*): só entra quem o administrador convidar.
   Atenção: se o sistema jurídico usa o mesmo projeto e depende do cadastro aberto, confirme antes de desligar.
3. **Authentication → Emails → Templates**: traduza *Invite user* e *Reset password*. Sugestão para o convite:
   > Assunto: Seu acesso ao CRM do Neves Pádua
   > Você foi convidado(a) para o CRM do escritório. Clique para criar a sua senha: {{ .ConfirmationURL }}
   > O link vale por 24 horas. Se não esperava este e-mail, ignore.
4. **Authentication → Emails → SMTP**: em produção, use o e-mail do escritório (SMTP próprio). O servidor de e-mail padrão do Supabase envia poucos e-mails por hora e serve só para teste.

## 2. Banco

1. Aplicar `crm_0015_equipe_e_ajustes.sql` depois das anteriores (antes, `npm run test:sql` localmente).
2. Primeiro administrador (uma vez, com o e-mail de quem administra, que precisa existir em Authentication → Users):
   ```sql
   insert into crm.acessos (user_id, area, papel)
   select id, 'admin', 'admin' from auth.users where email = 'EMAIL_DO_ADMIN' on conflict do nothing;
   ```
   No primeiro login, o perfil é criado com o início do e-mail como nome; corrija o nome em Configurações → Usuários.
3. **Filas da produção:** cada fila tem um código (`fila_ref`). Depois do passo 2 ele precisa ser o mesmo da fila no sistema jurídico (`atd_filas`). Até lá, na produção, cadastre as filas pelo SQL com o código certo, em vez de "Nova fila" na tela:
   ```sql
   insert into crm.filas_config (fila_ref, nome, abre, fecha, sla_primeira_min, sla_retorno_min)
   values ('<código da fila no sistema jurídico>', 'Gestão de Passivos PJ', '08:00', '18:00', 15, 120) on conflict do nothing;
   ```
   Na homologação, o `seed/homologacao.sql` já cria as filas e os perfis de teste.
   **Tarefas:** recebem tarefas os administradores e quem está na fila cujo código está em `crm.config` `tarefas` (padrão `comercial`). Na produção, ajuste para o código da fila Comercial:
   ```sql
   update crm.config set valor = '{"fila": "<código da fila Comercial>"}' where chave = 'tarefas';
   ```

## 3. Edge Function do convite

```
supabase secrets set --project-ref <ref> APP_URL=https://<endereço do app>/
supabase functions deploy usuarios-convite --no-verify-jwt --project-ref <ref>
```
`APP_URL` é para onde o link do convite leva e o único endereço que pode chamar a função pelo navegador.
A função confere que quem chamou é administrador (com o login da própria pessoa) antes de convidar.

## 4. Testar (homologação)

1. `npm run build:homologacao` e abrir o app.
2. Entrar como administrador (e-mail e senha).
3. Configurações → Usuários → Novo usuário, com um e-mail de teste. Abrir o e-mail, criar a senha, entrar.
4. Com a pessoa logada em outro navegador: clicar em **LOGADO** para encerrar a sessão. Em até 1 minuto ela volta para a tela de login; antes disso, o banco já recusa qualquer leitura dela.
5. Mudar um prazo, ligar o rodízio, criar uma tag e uma resposta rápida; recarregar a página e conferir que ficou salvo.

## Limites conhecidos

- **Sem código de autenticador** (decisão de 12/11/2026): todos entram com e-mail e senha. A proteção fica na senha (mínimo de 10 caracteres), no "encerrar sessão" e no acesso por tipo. Quem tiver autenticador cadastrado em outro sistema do mesmo projeto também entra só com a senha no CRM.
- **Encerrar sessão** tira o acesso ao CRM. O login continua valendo para o sistema jurídico, se a pessoa usa os dois.
- **Trocar o e-mail** de um usuário não é feito pela tela (o e-mail é o login). Crie um usuário novo e exclua o antigo.
