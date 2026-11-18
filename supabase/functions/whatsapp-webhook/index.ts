// Recebe os webhooks da Evolution. Publicada com --no-verify-jwt (a Evolution não manda JWT):
// a proteção é o segredo na URL (?s=...), comparado em tempo constante.
// Responde rápido: só grava o evento bruto (idempotente). O processamento é separado.
import { receberWebhook } from '../_shared/processos.ts';
import { adaptadorPadrao, bancoSupabase, json } from '../_shared/supabase.ts';
import { iguaisSeguro } from '../_shared/regras.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });
  const segredo = Deno.env.get('WEBHOOK_SEGREDO') ?? '';
  if (!iguaisSeguro(new URL(req.url).searchParams.get('s') ?? '', segredo)) return new Response('não autorizado', { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return new Response('corpo inválido', { status: 400 }); }
  try {
    return json(await receberWebhook({ banco: bancoSupabase(), adaptador: adaptadorPadrao() }, body));
  } catch (e) {
    // 500 faz a Evolution tentar de novo; a chave única impede duplicar o que já foi gravado.
    log('erro', 'whatsapp-webhook', 'falha ao gravar evento', { erro: String((e as Error)?.message ?? e) });
    return json({ erro: 'falha ao gravar' }, 500);
  }
});
