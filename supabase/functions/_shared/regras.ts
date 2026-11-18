// Regras puras (sem banco, sem rede). Testadas em tests/unit/regras.test.mjs.
// Só sintaxe TypeScript "apagável" (roda no Deno e no Node 24 sem compilar).

export type EstadoCanal = 'conectado' | 'desconectado' | 'aguardando_qr' | 'bloqueado';

export interface EventoNormalizado {
  idExterno: string;
  tipo: string;          // mensagem | mensagem_enviada | status:<x> | conexao
  ocorridoEm: string | null;
  payload: unknown;
  estado?: EstadoCanal;  // só em eventos de conexão
}

/** Intervalo mínimo entre dois envios do mesmo canal (proteção do número). */
export const INTERVALO_ENVIO_MS = 1500;

/** Telefone para log: só os 4 últimos dígitos. */
export function mascararTelefone(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 4 ? '****' : '*'.repeat(Math.min(d.length - 4, 9)) + d.slice(-4);
}

/** Remove CPF, CNPJ, e-mail e sequências longas de números (conta, cartão) de textos que vão para log. */
export function mascararTexto(v: unknown): string {
  return String(v ?? '')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\d{6,}/g, (m) => '*'.repeat(m.length - 2) + m.slice(-2));
}

/** Estado da Evolution (connectionState) → estado do CRM. */
export function estadoDaEvolution(state: unknown): EstadoCanal {
  switch (String(state ?? '').toLowerCase()) {
    case 'open': return 'conectado';
    case 'connecting': return 'aguardando_qr';
    case 'refused': return 'bloqueado';
    default: return 'desconectado';
  }
}

/** Só dígitos, com DDI 55 quando vier sem (formato que a Evolution espera em `number`). */
export function numeroParaEnvio(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) throw new Error('destino vazio');
  return d.length <= 11 ? '55' + d : d;
}

const segParaIso = (s: unknown): string | null => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

/**
 * Corpo do webhook da Evolution (v2) → eventos para crm.webhook_registrar.
 * Conferir os nomes dos campos com a versão instalada na VPS antes da produção.
 */
export function normalizarEventoEvolution(body: any): EventoNormalizado[] {
  const ev = String(body?.event ?? '').toLowerCase().replace(/_/g, '.');
  const dados = body?.data;
  const lista = Array.isArray(dados) ? dados : dados ? [dados] : [];
  if (ev === 'messages.upsert') {
    return lista.filter((m: any) => m?.key?.id).map((m: any) => ({
      idExterno: String(m.key.id),
      tipo: m.key.fromMe ? 'mensagem_enviada' : 'mensagem',
      ocorridoEm: segParaIso(m.messageTimestamp),
      payload: m,
    }));
  }
  if (ev === 'messages.update') {
    return lista.filter((m: any) => m?.keyId || m?.key?.id).map((m: any) => ({
      idExterno: String(m.keyId ?? m.key.id),
      tipo: 'status:' + String(m.status ?? 'desconhecido').toLowerCase(),
      ocorridoEm: segParaIso(m.date_time ?? m.messageTimestamp),
      payload: m,
    }));
  }
  if (ev === 'connection.update') {
    const state = dados?.state ?? dados?.connection;
    const quando = body?.date_time ? new Date(body.date_time).toISOString() : new Date().toISOString();
    return [{ idExterno: `conexao:${state}:${quando.slice(0, 16)}`, tipo: 'conexao', ocorridoEm: quando, payload: dados, estado: estadoDaEvolution(state) }];
  }
  return [];
}

/** Comparação em tempo constante (segredo do webhook). */
export function iguaisSeguro(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
