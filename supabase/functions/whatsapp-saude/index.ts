// Edge Function agendada (a cada 1 min via pg_cron): estado dos canais + alertas.
// Com ?relatorio=1 (agendada 1x por dia, 18h) envia o relatório diário ao canal de gestão.
import { verificarSaude } from '../_shared/processos.ts';
import { adaptadorPadrao, bancoSupabase, exigirSegredoCron, json } from '../_shared/supabase.ts';
import { log } from '../_shared/log.ts';

/** Canal interno de gestão (Discord: URL do webhook do canal). Sem URL configurada, os alertas ficam só no painel. */
async function notificar(texto: string) {
  const url = Deno.env.get('ALERTA_WEBHOOK_URL');
  if (!url) throw new Error('ALERTA_WEBHOOK_URL não configurado');
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: texto.slice(0, 1900) }) });
  if (!r.ok) throw new Error(`canal de alertas respondeu ${r.status}`);
}

Deno.serve(async (req) => {
  const negado = exigirSegredoCron(req);
  if (negado) return negado;
  const banco = bancoSupabase();
  try {
    if (new URL(req.url).searchParams.get('relatorio') === '1') {
      const r = await banco.rpc<any>('relatorio_diario');
      await notificar(`📊 Atendimento ${r.dia}: ${r.recebidas} recebidas · ${r.enviadas} enviadas · ${r.falhas} falhas · 1ª resposta média ${r.primeira_resposta_media_min ?? '—'} min`);
      return json(r);
    }
    return json(await verificarSaude({ banco, adaptador: adaptadorPadrao(), notificar }));
  } catch (e) {
    log('erro', 'whatsapp-saude', 'falha geral', { erro: String((e as Error)?.message ?? e) });
    return json({ erro: 'falha na verificação' }, 500);
  }
});
