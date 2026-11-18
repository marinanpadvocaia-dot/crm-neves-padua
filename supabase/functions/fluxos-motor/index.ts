// Edge Function agendada (a cada 1 min via pg_cron): o motor dos fluxos de trabalho publicados.
// Lê as mensagens novas dos canais, procura eventos de tempo, inscreve contatos/negócios nos fluxos e executa os passos.
// Mensagens saem pela fila de saída (whatsapp-saida envia). Toda a lógica pesada fica no banco (crm_0019).
import { rodarMotorFluxos } from '../_shared/processos-fluxos.ts';
import { bancoSupabase, exigirSegredoCron, json } from '../_shared/supabase.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  const negado = exigirSegredoCron(req);
  if (negado) return negado;
  try {
    const r = await rodarMotorFluxos({ banco: bancoSupabase() });
    if (r.webhooks_falhos) log('aviso', 'fluxos-motor', 'webhooks com falha', { falhos: r.webhooks_falhos });
    return json(r);
  } catch (e) {
    log('erro', 'fluxos-motor', 'falha geral', { erro: String((e as Error)?.message ?? e) });
    return json({ erro: 'falha no motor dos fluxos' }, 500);
  }
});
