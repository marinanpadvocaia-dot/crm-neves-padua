# Painel do gestor

Aba **Gestão** do CRM, para líderes e administradores. Desde a `crm_0025` os números vêm do banco por uma única função, `crm.painel_gestor(de, ate)`.

## Quem vê o quê

| Pessoa | Filas no painel | Resumo do comercial |
|---|---|---|
| Administrador | todas | sim |
| Líder | só as filas que lidera (Configurações → Usuários define o líder) | só se usa o CRM (fila Comercial ou líder dela) |
| Atendente | não abre o painel | — |

## O que aparece

- **Canais**: estado de cada canal ligado e tamanho da fila de saída (mesma informação da faixa do topo).
- **Agora**: atendimentos em aberto, sem responsável, com o prazo da 1ª resposta estourado, perto do prazo (75% ou mais) e aguardando o cliente.
- **No período** (Hoje, 7 dias, 30 dias, Este mês): atendimentos novos, resolvidos, tempo médio da 1ª resposta e % respondidos dentro do prazo.
- **Por fila**, **por canal** e **por pessoa** (carga, atrasados, resolvidos, 1ª resposta e se está conectado agora).
- **Comercial**: negócios novos, ganhos, perdidos, conversão (ganhos ÷ encerrados no período), em andamento por etapa com o valor previsto pela probabilidade, por origem e principais motivos de perda.

O painel se atualiza sozinho a cada minuto enquanto está aberto; o botão **Atualizar** busca na hora.

## Como o prazo é contado

- Prazo da 1ª resposta = `sla_primeira_min` da fila (Configurações → Setores).
- Só conta o tempo **dentro do horário da fila** (dias, abertura e fechamento), no fuso de São Paulo. Mensagem que chega às 22h começa a contar na abertura do dia seguinte.
- "Aguardando o cliente" pausa o prazo.
- Feriados ainda não são descontados.
- O prazo de retorno (depois da 1ª resposta) entra quando as conversas forem ligadas ao banco.

## Antes do passo 2

Os atendimentos só passam a existir no banco quando as conversas do WhatsApp forem ligadas a ele (passo 2 do plano). Até lá, as partes de atendimento mostram zero com um aviso, e o resumo do comercial já mostra os dados reais do CRM.

## Conferir em homologação

1. Entrar como líder: o painel mostra só as filas dele.
2. Entrar como administrador: aparecem todas as filas e o comercial.
3. No SQL Editor, `select crm.painel_gestor(current_date - 6, current_date);` com um usuário líder retorna o mesmo que a tela em "7 dias".
