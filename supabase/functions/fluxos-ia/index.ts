// Construtor de fluxos com IA (botões "Construa usando IA" e "✨ Construir" do construtor). Chamada pelo navegador.
// Publicada com --no-verify-jwt: a própria função confere o JWT de quem chamou com crm.eh_lider() (líder ou administrador).
// Usa a mesma chave da API da Anthropic dos agentes (Secret ANTHROPIC_API_KEY). A IA recebe só o catálogo de gatilhos e
// ações, as opções do escritório (filas, tags, funis, nomes da equipe…) e o fluxo em edição; nenhum dado de cliente.
// Devolve uma PROPOSTA: nada é salvo aqui. A pessoa confere no construtor e salva/publica.
import { processarFluxoIA } from '../_shared/fluxos.ts';
import { cabecalhosCors } from '../_shared/usuarios.ts';
import { criarAnthropic } from '../_shared/ia-anthropic.ts';
import { depsFluxoIASupabase } from '../_shared/supabase.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  const cors = cabecalhosCors(Deno.env.get('APP_URL') ?? '');
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return responder({ erro: 'método não permitido' }, 405);
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return responder({ erro: 'corpo inválido' }, 400); }
  const chave = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!chave) return responder({ erro: 'A IA ainda não foi configurada neste ambiente (falta a chave da API).' }, 503);
  try {
    const deps = depsFluxoIASupabase(() => criarAnthropic(chave), Deno.env.get('FLUXOS_IA_MODELO') || 'claude-opus-5-5');
    const r = await processarFluxoIA(deps, req.headers.get('authorization'), corpo);
    return responder(r.corpo, r.status);
  } catch (e) {
    log('erro', 'fluxos-ia', 'falha ao montar fluxo', { erro: String((e as Error)?.message ?? e) });
    return responder({ erro: 'Não foi possível falar com a IA agora. Tente de novo em instantes.' }, 500);
  }
});
