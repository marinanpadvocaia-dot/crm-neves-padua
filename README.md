# CRM + Atendimento — Neves Pádua

Protótipo do front em **código** (fora do artefato), migrações do schema `crm` e Edge Functions dos canais (WhatsApp, Instagram, Google) e dos agentes de IA.
**Nada está conectado ainda**: na demonstração, o app roda com dados fictícios em memória; migrações e funções só foram testadas localmente.
Em homologação/produção já leem e gravam no banco: **login** (e-mail e senha, convite por e-mail, criação de senha), **equipe e usuários**, **setores, filas e rodízio**, **tags**, **respostas rápidas**, **mensagem de ausência**, **CRM** (funis, negócios, atividades, campos, relatórios), **Tarefas** (criadas na conversa, individuais), **Fluxos de trabalho** (lista, construtor visual, IA, publicação e motor que executa no servidor), **menções** dos fluxos e da IA (fila Menções) e **Agentes de IA**. As demais áreas ainda usam a demonstração e estão sendo trocadas por partes.

## Como rodar
```
npm install                 # PGlite (testes SQL) e Playwright (teste de tela; usa o Edge/Chrome instalado)
npm run build               # gera dist/app.js (ambiente: demonstração)
# abra index.html no navegador (ou sirva a pasta: npx serve .)
```

## Testes
```
npm test          # build + SQL (337 verificações) + unidade + integração (~1 min)
npm run test:e2e  # teste de fumaça da tela no navegador (demonstração)
npm run test:conectado  # a tela em modo conectado contra um Supabase simulado no navegador (nada sai para a rede)
npm run modelo    # regenera docs/modelo-de-dados.html a partir das migrações
```

## Ambientes (passo 0 do plano)
`config/ambientes/{demonstracao,homologacao,producao}.json` com URL e **chave publicável**.
`npm run build:homologacao` / `npm run build:producao`. O build recusa chave secreta/`service_role`, homologação apontando para produção e produção fora do projeto `ksdwzljfjfucjevdqxvx`.
Roteiro: [docs/promover-para-producao.md](docs/promover-para-producao.md).

## Estrutura
- `index.html` — marcação (login, topo, faixa de canais, áreas) e carrega `dist/app.js`.
- `css/app.css` — visual (tema claro branco + bordô, escuro preto + bordô, escolhido no app; conversa no estilo WhatsApp).
- `js/` (concatenados em ordem pelo `build.mjs`, mesmo escopo; `AMBIENTE` é injetado pelo build):
  - `00-dados.js` — **camada de dados** (`DB`): ponto único de gravação. Hoje em memória.
  - `00-supabase.js` — conexão com o Supabase (Auth + REST no schema `crm`, só chave publicável); login real (e-mail e senha), link do e-mail (criar senha), presença a cada minuto. Só age quando o ambiente é conectado.
  - `01-atendimento.js` — caixa de entrada, conversa, ficha, base, login, tema.
  - `04-agentes-ia.js` — Agentes de IA com `DB.ia` (memória na demonstração; banco + funções do `crm_0014` quando conectado).
  - `06-importacao-leads.js` — importação de planilha (.csv): prévia no navegador; conectado, grava no banco em partes, com histórico e "Desfazer".
  - `02-fluxos.js` — **fluxos de trabalho** (como no GCV): lista com pastas, construtor visual com acionadores, ações e caminhos, painel de IA, teste. Catálogo: `supabase/functions/_shared/fluxos-catalogo.json` (injetado pelo build como `FLX_CAT`).
  - `03-crm.js`, `05-config-e-eventos.js`, `06-importacao-leads.js`, `07-estrutura-one.js`.
  - `10-usuarios.js` — Ajustes em abas e página de Usuários (tipo, filas, status de login, acessos, limite do plano).
  - `09-base.js` — Base de conhecimento: procedimentos por fila, editor (admin e líder do setor). Conectado (parte 6): do banco, com histórico de versões e restaurar excluídos.
  - `14-avisos.js` — menções dos fluxos ("Avisar alguém da equipe") e da IA (contato pediu uma pessoa), no topo da fila Menções.
  - `13-tarefas.js` — tarefas sobre o contato: criar na conversa (⋯ → Criar tarefa) e aba Tarefas, só para administradores e fila Comercial; cada um vê só as suas (`crm_0017`).
  - `12-crm.js` — `DB.crm`: funis, negócios, atividades, campos e relatórios no banco (`crm_0004` + `crm_0016`).
  - `11-equipe.js` — `DB.equipe`: equipe, setores e filas, rodízio, tags, respostas rápidas e ausência no banco (`crm_0015`).
  - `08-canais-e-saida.js` — passo 1: faixa de estado dos canais, fila de saída (estado na bolha, Reenviar/Cancelar), painel de saúde. Conectado (parte 5): tudo do banco, reconectar por QR Code, cadastro de canais e plano B.
- `supabase/migrations/` — `crm_0002…0021` (ver `supabase/README.md`). `supabase/seed/homologacao.sql` — dados fictícios.
- `supabase/functions/` — `whatsapp-webhook`, `whatsapp-saude`, `whatsapp-saida`, `instagram-webhook`, `google-avaliacoes`, `ia-agentes`, `usuarios-convite`, `fluxos-ia`, `fluxos-motor` + `_shared/` (adaptadores, regras, processos, IA).
- `docs/` — modelo de dados, roteiro de promoção, plano B do número reserva, **ativação dos agentes de IA** (`ativar-agentes-ia.md`), **equipe e login** (`ligar-equipe-e-login.md`).
- `tests/` — `sql/` (PGlite), `unit/`, `integracao/`, `smoke.js` (demonstração), `conectado.js` (modo conectado com Supabase simulado).

## Plano de robustez (10/11/2026): andamento
| Passo | Situação |
|---|---|
| 0 Homologação | Parte local pronta (ambientes, trava de chave, seed, roteiro). **Falta:** criar o projeto Supabase de homologação e o chip de teste. |
| 1 Canal WhatsApp | Migrações 0009–0012, Edge Functions e tela prontas e testadas localmente. **Falta:** publicar na homologação e conferir com a Evolution real. |
| 2 Vínculo com o jurídico | **Bloqueado:** rodar `crm_0000_verificar_ambiente.sql` no Supabase e enviar o resultado. |
| 3–4, 6–7 | Não iniciados (dependem do passo 2 ou das decisões listadas no plano). |
| Troca da demonstração pelo banco | **Parte 1** (`crm_0015`): login, equipe, setores, filas, rodízio, tags, respostas rápidas, ausência (roteiro: `docs/ligar-equipe-e-login.md`). **Parte 2** (`crm_0016`): CRM. **Tarefas** (`crm_0017`). **Parte 3a** (`crm_0018`): fluxos de trabalho (desenho, IA, publicação); **3b** (`crm_0019`): motor no servidor + "Se" com várias condições (roteiro: `docs/fluxos-de-trabalho.md`). **Parte 4** (`crm_0021`): importação de leads no banco. **Parte 5** (`crm_0022` + função `canais-conectar`): canais, fila de saída e saúde na tela, reconectar por QR Code, cadastro de canais e plano B em um clique (roteiro: `docs/canais-e-saude.md`). **Parte 6** (`crm_0023`): Base de conhecimento na tela, com histórico de versões e restaurar (roteiro: `docs/base-de-conhecimento.md`). **Ajuste do CRM** (`crm_0024`): só do setor comercial (fila Comercial e administrador), sem divisão por dono e com um funil só; kanban com uma cor por etapa e colunas recolhíveis. **Parte 7** (`crm_0025`): Painel do gestor com os números do banco (roteiro: `docs/painel-do-gestor.md`). Troca da demonstração concluída; conversas e mensagens ficam para o passo 2. |
| 5.3 IA em rascunho (só Instagram e Google; pedido de humano para a IA na hora e avisa o atendente, `crm_0020`) | Pronto para ligar (`crm_0014`, funções `ia-agentes`, `instagram-webhook`, `google-avaliacoes`, aba conectada). Regras já validadas pela advogada; falta registrar a validação no banco (agora pela tela, botão Validar) e seguir `docs/ativar-agentes-ia.md`. **Agentes editáveis** (`crm_0026`): o administrador cria, edita e exclui (arquiva, com restaurar) agentes e regras pela tela; um agente ligado por tipo de mensagem; regra nova ou editada só vale depois de validada. |

Regras: só chave publicável no front (nunca `service_role`); segredos fora do git (Secrets das Edge Functions e Vault); `crm_0001_integracao_leads_api_webhooks.sql` guardado e **não executado** até a Maria Júlia autorizar; o CRM nunca altera tabelas/funções do sistema jurídico.
