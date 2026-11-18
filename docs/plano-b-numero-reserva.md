# Plano B: trocar para o número reserva do WhatsApp

Uma página. Usar quando o número do escritório for **bloqueado** ou ficar fora por mais de 2 horas sem solução.

**Quem executa:** administrador (Ana Júlia). **Quem autoriza:** Maria Júlia. **Quem avisa os clientes ativos:** líderes de setor.

## Antes de precisar (deixar pronto)

- [ ] Chip reserva ativo, num celular do escritório, com WhatsApp Business instalado.
- [ ] Instância `reserva` criada na Evolution (sem conectar ainda, para não "esquentar" o número com uso duplo).
- [ ] Canal cadastrado e **desligado**: Configurações → Saúde → **+ Novo canal** (WhatsApp, Evolution, instância `reserva`, marcar "Número reserva"). O canal nasce desligado.
- [ ] Mensagem de aviso aos clientes aprovada (modelo abaixo).

## Na hora (cerca de 15 minutos)

1. Confirmar o problema na faixa de canais e em Configurações → Saúde (estado **Bloqueado** ou **Desconectado** há mais de 2 h).
2. Em Configurações → Saúde, na linha do reserva, clicar em **Reconectar** e ler o QR Code com o celular reserva. A janela fecha sozinha quando conectar.
3. Na mesma linha, clicar em **Tornar principal** e confirmar. O número do escritório é desligado e as mensagens pendentes ou com falha dele passam a sair pelo reserva. A troca fica no histórico dos dois canais, com o nome de quem fez.
4. Conferir que a faixa mostra o reserva **Conectado** e que a fila esvazia.
5. Líderes enviam o aviso aos clientes com conversa aberta (só a eles; nada de disparo em massa).
6. Atualizar o número no site, no Instagram e no Google Meu Negócio, se a troca for passar de 1 dia.

Se a tela estiver fora do ar, o mesmo pelo SQL Editor (faz o que o botão faz, sem o registro no histórico):
```sql
begin;
update crm.canais set principal = false, ativo = false where instancia = 'escritorio';
update crm.canais set ativo = true, principal = true where instancia = 'reserva';
update crm.saida_mensagens set canal_id = (select id from crm.canais where instancia = 'reserva')
 where estado in ('pendente','falhou') and canal_id = (select id from crm.canais where instancia = 'escritorio');
commit;
```

**Modelo de aviso:** "Olá, [Nome]! Aqui é do escritório Neves Pádua Advocacia. Nosso número principal está temporariamente fora do ar; pode continuar falando conosco por este número. O atendimento segue normalmente."

## Voltar ao número principal

Reconectar o número do escritório (passo 2, na linha dele) e clicar em **Tornar principal** nele, depois que estiver conectado e estável por pelo menos 1 dia. A fila que estiver no reserva volta junto.

## Fora deste plano

A VPS da Evolution é ponto único de falha (gargalo 2 do plano). Backup e reinício automático dela entram na lista de pré-requisitos antes da produção. Migração para a API oficial da Meta é evolução futura: basta um adaptador novo em `supabase/functions/_shared/adaptador.ts`.
