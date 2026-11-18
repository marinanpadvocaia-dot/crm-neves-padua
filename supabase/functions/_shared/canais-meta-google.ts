// Adaptadores do Instagram (Meta) e do Google (Perfil da Empresa), na mesma interface do WhatsApp.
// O resto do sistema só conhece Adaptador.estado / Adaptador.enviarTexto; tokens vêm dos Secrets das Edge Functions.
// ATENÇÃO: conferir, na hora de ligar, a versão do Graph API em uso e o acesso aprovado à API do Perfil da Empresa.
import type { Adaptador, Canal } from './adaptador.ts';
import type { EventoNormalizado } from './regras.ts';
import { iguaisSeguro } from './regras.ts';

/** Destino no formato "tipo:id" (dm:<IGSID>, comentario:<id>, avaliacao:<accounts/../reviews/..>). */
export function partesDestino(destino: string): { tipo: string; id: string } {
  const i = destino.indexOf(':');
  if (i <= 0 || i === destino.length - 1) throw new Error(`destino inválido: ${destino}`);
  return { tipo: destino.slice(0, i), id: destino.slice(i + 1) };
}

// ---- Instagram --------------------------------------------------------------------------------

/** Corpo do webhook do Instagram → eventos para crm.webhook_registrar, com o id da conta que recebeu. */
export function normalizarEventoInstagram(body: any): { conta: string; ev: EventoNormalizado }[] {
  if (body?.object !== 'instagram' || !Array.isArray(body?.entry)) return [];
  const out: { conta: string; ev: EventoNormalizado }[] = [];
  for (const en of body.entry) {
    const conta = String(en?.id ?? '');
    for (const m of en?.messaging ?? []) {
      if (!m?.message?.mid) continue;
      out.push({ conta, ev: {
        idExterno: String(m.message.mid),
        tipo: m.message.is_echo ? 'mensagem_enviada' : 'mensagem',
        ocorridoEm: Number.isFinite(Number(m.timestamp)) ? new Date(Number(m.timestamp)).toISOString() : null,
        payload: m,
      } });
    }
    for (const c of en?.changes ?? []) {
      if (c?.field !== 'comments' || !c?.value?.id) continue;
      // Comentário da própria conta (resposta do escritório) não vira pedido de resposta.
      const proprio = String(c.value?.from?.id ?? '') === conta;
      out.push({ conta, ev: {
        idExterno: String(c.value.id),
        tipo: proprio ? 'comentario_proprio' : 'comentario',
        ocorridoEm: en?.time ? new Date(Number(en.time) * 1000).toISOString() : null,
        payload: c.value,
      } });
    }
  }
  return out;
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');

/** Cabeçalho X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(corpo bruto, App Secret). */
export async function assinaturaMetaValida(corpoBruto: string, cabecalho: string | null, segredo: string): Promise<boolean> {
  if (!segredo || !cabecalho?.startsWith('sha256=')) return false;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const esperado = 'sha256=' + hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpoBruto)));
  return iguaisSeguro(cabecalho, esperado);
}

/** Instagram API com login do Instagram (graph.instagram.com). canal.instancia = id da conta profissional. */
export function criarInstagram(cfg: { token: string; versao?: string; fetch?: typeof fetch }): Adaptador {
  const f = cfg.fetch ?? fetch;
  const base = `https://graph.instagram.com/${cfg.versao ?? 'v23.0'}`;
  const cab = { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' };
  const erro = async (r: Response) => `Instagram respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`;
  return {
    async estado() {
      const r = await f(`${base}/me?fields=user_id,username`, { headers: cab });
      if (r.ok) return { estado: 'conectado', detalhe: 'Instagram: token válido' };
      const j: any = await r.json().catch(() => ({}));
      if (r.status === 401 || j?.error?.code === 190) return { estado: 'desconectado', detalhe: 'Instagram: token expirado ou revogado' };
      throw new Error(`Instagram respondeu ${r.status}`);
    },
    async enviarTexto(c: Canal, destino: string, texto: string) {
      const d = partesDestino(destino);
      let r: Response;
      if (d.tipo === 'dm') {
        if (!c.instancia) throw new Error(`canal ${c.nome} sem id da conta do Instagram`);
        r = await f(`${base}/${encodeURIComponent(c.instancia)}/messages`, {
          method: 'POST', headers: cab, body: JSON.stringify({ recipient: { id: d.id }, message: { text: texto } }),
        });
      } else if (d.tipo === 'comentario') {
        r = await f(`${base}/${encodeURIComponent(d.id)}/replies`, { method: 'POST', headers: cab, body: JSON.stringify({ message: texto }) });
      } else throw new Error(`destino ${d.tipo} não é do Instagram`);
      if (!r.ok) throw new Error(await erro(r));
      const j: any = await r.json().catch(() => ({}));
      return { idExterno: j?.message_id ?? j?.id ?? null };
    },
  };
}

// ---- Google (Perfil da Empresa) ---------------------------------------------------------------
// O Google encerrou as mensagens do perfil (Business Messages) em 2024: aqui só há avaliações.

export interface AdaptadorGoogle extends Adaptador {
  listarAvaliacoes(canal: Canal): Promise<any[]>;
}

/** canal.instancia = "accounts/<id>/locations/<id>". Token por refresh token OAuth (Secrets). */
export function criarGoogle(cfg: { clientId: string; clientSecret: string; refreshToken: string; fetch?: typeof fetch }): AdaptadorGoogle {
  const f = cfg.fetch ?? fetch;
  let token: { valor: string; ate: number } | null = null;
  async function acesso(): Promise<string> {
    if (token && token.ate > Date.now() + 60_000) return token.valor;
    const r = await f('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: 'refresh_token' }).toString(),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j?.access_token) {
      const e = new Error(`Google recusou o token: ${j?.error ?? r.status}`);
      (e as any).revogado = j?.error === 'invalid_grant';
      throw e;
    }
    token = { valor: j.access_token, ate: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
    return token.valor;
  }
  const local = (c: Canal) => {
    if (!c.instancia || !/^accounts\/[^/]+\/locations\/[^/]+$/.test(c.instancia)) throw new Error(`canal ${c.nome}: instância deve ser accounts/<id>/locations/<id>`);
    return c.instancia;
  };
  return {
    async estado() {
      try { await acesso(); return { estado: 'conectado', detalhe: 'Google: acesso válido' }; }
      catch (e) { if ((e as any).revogado) return { estado: 'desconectado', detalhe: 'Google: autorização revogada' }; throw e; }
    },
    async listarAvaliacoes(c) {
      const r = await f(`https://mybusiness.googleapis.com/v4/${local(c)}/reviews?pageSize=50&orderBy=updateTime%20desc`,
        { headers: { authorization: `Bearer ${await acesso()}` } });
      if (!r.ok) throw new Error(`Google respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j: any = await r.json();
      return Array.isArray(j?.reviews) ? j.reviews : [];
    },
    async enviarTexto(c, destino, texto) {
      const d = partesDestino(destino);
      if (d.tipo !== 'avaliacao') throw new Error(`destino ${d.tipo} não é do Google`);
      if (!d.id.startsWith(local(c) + '/reviews/')) throw new Error('avaliação não pertence a este perfil');
      const r = await f(`https://mybusiness.googleapis.com/v4/${d.id}/reply`, {
        method: 'PUT', headers: { authorization: `Bearer ${await acesso()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ comment: texto }),
      });
      if (!r.ok) throw new Error(`Google respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return { idExterno: d.id };
    },
  };
}
