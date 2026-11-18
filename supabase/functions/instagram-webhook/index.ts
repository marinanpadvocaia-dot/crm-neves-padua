// Recebe os webhooks do Instagram (Meta). Publicada com --no-verify-jwt (a Meta não manda JWT).
// GET: verificação da assinatura do webhook (hub.verify_token). POST: confere X-Hub-Signature-256 com o App Secret
// e grava o evento bruto uma única vez (idempotente). Responde rápido; a IA processa depois (ia-agentes).
import { receberInstagram } from '../_shared/processos-ia.ts';
import { assinaturaMetaValida } from '../_shared/canais-meta-google.ts';
import { bancoSupabase, json } from '../_shared/supabase.ts';
import { iguaisSeguro } from '../_shared/regras.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe'
      && iguaisSeguro(url.searchParams.get('hub.verify_token') ?? '', Deno.env.get('IG_VERIFY_TOKEN') ?? '');
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('não autorizado', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });
  const bruto = await req.text();
  if (!(await assinaturaMetaValida(bruto, req.headers.get('x-hub-signature-256'), Deno.env.get('META_APP_SECRET') ?? ''))) {
    return new Response('assinatura inválida', { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(bruto); } catch { return new Response('corpo inválido', { status: 400 }); }
  try {
    return json(await receberInstagram({ banco: bancoSupabase() }, body));
  } catch (e) {
    // 500 faz a Meta tentar de novo; a chave única impede duplicar o que já foi gravado.
    log('erro', 'instagram-webhook', 'falha ao gravar evento', { erro: String((e as Error)?.message ?? e) });
    return json({ erro: 'falha ao gravar' }, 500);
  }
});
