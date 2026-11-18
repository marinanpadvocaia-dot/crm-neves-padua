// Reconectar (QR Code) e "Verificar agora" de um canal. Chamada pelo navegador de líder ou administrador.
// Publicada com --no-verify-jwt: a própria função confere o JWT de quem chamou com crm.eh_lider().
// A apikey da Evolution fica nos segredos da função; o navegador só recebe a imagem do QR Code.
import { cabecalhosCors } from '../_shared/usuarios.ts';
import { conectarCanal } from '../_shared/canais.ts';
import { depsConectarSupabase } from '../_shared/supabase.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  const cors = cabecalhosCors(Deno.env.get('APP_URL') ?? '');
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return responder({ erro: 'método não permitido' }, 405);
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return responder({ erro: 'corpo inválido' }, 400); }
  try {
    const r = await conectarCanal(depsConectarSupabase(), req.headers.get('authorization'), corpo);
    if (r.status === 200) log('info', 'canais-conectar', 'pedido atendido', { canal_id: (corpo as any)?.canal_id, acao: (corpo as any)?.acao });
    return responder(r.corpo, r.status);
  } catch (e) {
    log('erro', 'canais-conectar', 'falha', { erro: String((e as Error)?.message ?? e) });
    return responder({ erro: 'Não foi possível falar com o canal agora. Tente de novo.' }, 500);
  }
});
