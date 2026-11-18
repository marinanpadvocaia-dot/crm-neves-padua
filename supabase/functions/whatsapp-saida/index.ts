// Edge Function agendada (a cada 1 min via pg_cron): esvazia a fila de saída com repetição e espera crescente.
import { processarFila } from '../_shared/processos.ts';
import { adaptadorPadrao, bancoSupabase, exigirSegredoCron, json } from '../_shared/supabase.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  const negado = exigirSegredoCron(req);
  if (negado) return negado;
  try {
    return json(await processarFila({ banco: bancoSupabase(), adaptador: adaptadorPadrao() }));
  } catch (e) {
    log('erro', 'whatsapp-saida', 'falha geral', { erro: String((e as Error)?.message ?? e) });
    return json({ erro: 'falha ao processar a fila' }, 500);
  }
});
