// Edge Function agendada (a cada 10 min via pg_cron): busca avaliações novas do Perfil da Empresa no Google
// e grava cada uma uma única vez em crm.webhook_eventos (tipo "avaliacao"). A IA rascunha a resposta depois (ia-agentes).
import { buscarAvaliacoesGoogle } from '../_shared/processos-ia.ts';
import { adaptadorPadrao, bancoSupabase, exigirSegredoCron, json } from '../_shared/supabase.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  const negado = exigirSegredoCron(req);
  if (negado) return negado;
  try {
    return json(await buscarAvaliacoesGoogle({ banco: bancoSupabase(), adaptador: adaptadorPadrao() }));
  } catch (e) {
    log('erro', 'google-avaliacoes', 'falha geral', { erro: String((e as Error)?.message ?? e) });
    return json({ erro: 'falha ao buscar avaliações' }, 500);
  }
});
