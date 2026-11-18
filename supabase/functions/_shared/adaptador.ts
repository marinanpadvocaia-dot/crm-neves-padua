// Camada adaptadora do canal: o resto do sistema só conhece esta interface.
// Trocar a Evolution pela API oficial da Meta = escrever outro adaptador, sem mexer no app nem nas tabelas.
import { estadoDaEvolution, numeroParaEnvio, type EstadoCanal } from './regras.ts';

export interface Canal {
  id: string;
  tipo: string;
  nome: string;
  provedor: 'evolution' | 'meta' | 'google' | 'simulado';
  instancia: string | null;
  estado: EstadoCanal;
}

export interface Adaptador {
  estado(canal: Canal): Promise<{ estado: EstadoCanal; detalhe?: string }>;
  enviarTexto(canal: Canal, destino: string, texto: string): Promise<{ idExterno: string | null }>;
  /** Só canais com QR Code (Evolution): pede um código novo para ler no celular. */
  conectar?(canal: Canal): Promise<Conexao>;
}

/** Resposta do pedido de QR Code: já conectado, ou a imagem do código (data URL) e o código de pareamento. */
export interface Conexao { conectado: boolean; qr?: string | null; codigo?: string | null }

/** Evolution API v2 (QR Code). A apikey vem dos segredos da função, nunca do banco nem do front. */
export function criarEvolution(cfg: { url: string; apikey: string; fetch?: typeof fetch }): Adaptador {
  const f = cfg.fetch ?? fetch;
  const base = cfg.url.replace(/\/+$/, '');
  const inst = (c: Canal) => {
    if (!c.instancia) throw new Error(`canal ${c.nome} sem instância cadastrada`);
    return encodeURIComponent(c.instancia);
  };
  return {
    async estado(c) {
      const r = await f(`${base}/instance/connectionState/${inst(c)}`, { headers: { apikey: cfg.apikey } });
      if (r.status === 404) return { estado: 'desconectado', detalhe: 'instância não encontrada na Evolution' };
      if (!r.ok) throw new Error(`Evolution respondeu ${r.status}`);
      const j: any = await r.json();
      const st = j?.instance?.state ?? j?.state;
      return { estado: estadoDaEvolution(st), detalhe: `Evolution: ${st}` };
    },
    async enviarTexto(c, destino, texto) {
      const r = await f(`${base}/message/sendText/${inst(c)}`, {
        method: 'POST',
        headers: { apikey: cfg.apikey, 'content-type': 'application/json' },
        body: JSON.stringify({ number: numeroParaEnvio(destino), text: texto }),
      });
      if (!r.ok) throw new Error(`Evolution respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j: any = await r.json();
      return { idExterno: j?.key?.id ?? null };
    },
    async conectar(c) {
      const r = await f(`${base}/instance/connect/${inst(c)}`, { headers: { apikey: cfg.apikey } });
      if (r.status === 404) throw new Error(`a instância ${c.instancia} não existe na Evolution: crie-a no painel da Evolution`);
      if (!r.ok) throw new Error(`Evolution respondeu ${r.status}`);
      const j: any = await r.json();
      if (String(j?.instance?.state ?? j?.state ?? '').toLowerCase() === 'open') return { conectado: true };
      const b64 = typeof j?.base64 === 'string' ? j.base64 : null;
      const qr = b64 ? (b64.startsWith('data:image/') ? b64 : 'data:image/png;base64,' + b64) : null;
      if (!qr && !j?.pairingCode) throw new Error('a Evolution não devolveu o QR Code; tente de novo em instantes');
      return { conectado: false, qr, codigo: j?.pairingCode ?? null };
    },
  };
}

/** Adaptador de teste (homologação sem chip, testes automáticos). Nada sai para a rede. */
export function criarSimulado(opts: { estado?: EstadoCanal; falhar?: boolean } = {}): Adaptador & { enviadas: { destino: string; texto: string }[] } {
  const enviadas: { destino: string; texto: string }[] = [];
  let estado: EstadoCanal = opts.estado ?? 'conectado';
  return {
    enviadas,
    async estado() { return { estado, detalhe: 'simulado' }; },
    // simula a leitura do QR Code: a próxima verificação já encontra o canal conectado
    async conectar() { const ja = estado === 'conectado'; estado = 'conectado'; return ja ? { conectado: true } : { conectado: false, qr: null, codigo: 'SIMULADO' }; },
    async enviarTexto(_c, destino, texto) {
      if (opts.falhar) throw new Error('falha simulada do provedor');
      enviadas.push({ destino, texto });
      return { idExterno: 'SIM-' + enviadas.length };
    },
  };
}
