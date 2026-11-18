// Motor dos fluxos de trabalho (Edge Function fluxos-motor, a cada 1 min). Dependências injetadas para testar sem o Supabase.
// 1) lê as mensagens novas dos canais e identifica contato/texto (mesmo leitor dos agentes de IA) -> crm.fluxo_registrar_mensagem
// 2) roda o ciclo no banco (eventos de tempo, inscrições, passos) -> crm.fluxo_ciclo
// 3) envia os webhooks dos passos "Chamar webhook" (só https, nunca endereço interno)
import { entradaDoEvento } from './ia-regras.ts';

export interface BancoFluxos { rpc(fn: string, args?: Record<string, unknown>): Promise<any> }
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Webhook só para endereço público com https (evita chamar serviços internos do servidor). */
export function urlSegura(u: string): boolean {
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':') || h.startsWith('[')) return false;   // IP direto: recusado
  return h.includes('.');
}

export async function rodarMotorFluxos(d: { banco: BancoFluxos; fetch?: Fetch; limite?: number }) {
  const contagem = { mensagens: 0, ignoradas: 0, webhooks: 0, webhooks_falhos: 0, ciclo: {} as Record<string, unknown> };
  const eventos = (await d.banco.rpc('fluxo_mensagens_pendentes', { p_limite: d.limite ?? 200 })) ?? [];
  for (const e of eventos) {
    const ent = entradaDoEvento(e.canal_tipo, e.tipo, e.payload);
    let deMim = false, destino: string | null = ent?.destino ?? null;
    const jid = String(e.payload?.key?.remoteJid ?? '');
    if (!ent && e.canal_tipo === 'whatsapp' && e.payload?.key?.fromMe && jid.endsWith('@s.whatsapp.net')) {
      deMim = true; destino = jid.split('@')[0].replace(/\D/g, '');               // o escritório respondeu pelo celular
    }
    const ok = await d.banco.rpc('fluxo_registrar_mensagem', {
      p_evento: e.evento_id, p_canal: e.canal_id, p_contato: ent?.contato ?? null, p_nome: ent?.nome ?? null,
      p_texto: ent?.texto ?? null, p_destino: destino, p_quando: e.ocorrido_em ?? new Date().toISOString(), p_de_mim: deMim,
    });
    if (ok) contagem.mensagens++; else contagem.ignoradas++;
  }
  contagem.ciclo = (await d.banco.rpc('fluxo_ciclo', { p_limite: 100 })) ?? {};
  const f = d.fetch ?? fetch;
  for (const w of (await d.banco.rpc('fluxo_webhooks_pendentes', { p_limite: 20 })) ?? []) {
    contagem.webhooks++;
    if (!urlSegura(w.url)) { await d.banco.rpc('fluxo_webhook_marcar', { p_id: w.id, p_ok: false, p_resposta: 'endereço recusado (precisa ser https público)' }); contagem.webhooks_falhos++; continue; }
    try {
      const r = await f(w.url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'crm-fluxos/1' }, body: JSON.stringify(w.corpo), signal: AbortSignal.timeout(10_000), redirect: 'error' });
      await d.banco.rpc('fluxo_webhook_marcar', { p_id: w.id, p_ok: r.ok, p_resposta: 'HTTP ' + r.status });
      if (!r.ok) contagem.webhooks_falhos++;
    } catch (err) {
      await d.banco.rpc('fluxo_webhook_marcar', { p_id: w.id, p_ok: false, p_resposta: String((err as Error)?.message ?? err) });
      contagem.webhooks_falhos++;
    }
  }
  return contagem;
}
