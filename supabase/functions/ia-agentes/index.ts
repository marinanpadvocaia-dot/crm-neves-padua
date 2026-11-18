// Edge Function agendada (a cada 1 min via pg_cron): agentes de IA.
// Lê as mensagens novas dos canais com agente ligado, chama a IA e grava o rascunho na revisão humana.
// Em modo rascunho (padrão) NADA é enviado ao cliente: o envio só acontece quando uma pessoa aprova na tela.
import { processarIA } from '../_shared/processos-ia.ts';
import { criarAnthropic } from '../_shared/ia-anthropic.ts';
import { bancoIASupabase, exigirSegredoCron, json } from '../_shared/supabase.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  const negado = exigirSegredoCron(req);
  if (negado) return negado;
  try {
    let claude: ReturnType<typeof criarAnthropic> | null = null;
    const provedor = (a: { provedor: string | null; slug: string }) => {
      if ((a.provedor ?? 'anthropic') !== 'anthropic') throw new Error(`agente ${a.slug}: provedor ${a.provedor} sem adaptador`);
      const chave = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
      if (!chave) throw new Error('segredo ANTHROPIC_API_KEY não configurado');
      return claude ??= criarAnthropic(chave);
    };
    return json(await processarIA({ banco: bancoIASupabase(), provedor }));
  } catch (e) {
    log('erro', 'ia-agentes', 'falha geral', { erro: String((e as Error)?.message ?? e) });
    return json({ erro: 'falha nos agentes de IA' }, 500);
  }
});
