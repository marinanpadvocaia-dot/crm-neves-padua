// Lógica das três funções do canal, com as dependências injetadas (banco, adaptador, espera).
// Assim o mesmo código roda no Supabase (Deno) e nos testes locais (Node + PGlite + adaptador simulado).
import type { Adaptador, Canal } from './adaptador.ts';
import { INTERVALO_ENVIO_MS, normalizarEventoEvolution } from './regras.ts';
import { log } from './log.ts';

export interface Banco {
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T>;
  canais(): Promise<Canal[]>;                                   // canais ativos
  canalPorInstancia(instancia: string): Promise<Canal | null>;
  alertasParaNotificar(): Promise<{ id: number; nivel: string; mensagem: string }[]>;
  marcarNotificados(ids: number[]): Promise<void>;
}

export interface Deps {
  banco: Banco;
  adaptador: (canal: Canal) => Adaptador;
  esperar?: (ms: number) => Promise<void>;
  sorteio?: () => number;                                       // 0..1 (testes passam um valor fixo)
  resolverDestino?: (m: any) => Promise<string | null>;       // conversa → número (vínculo real no passo 2)
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** whatsapp-saida: devolve presas, traz agendadas, envia um lote. Nunca envia sem passar pela fila. */
export async function processarFila(d: Deps, limite = 20) {
  const esperar = d.esperar ?? dormir;
  const recuperadas = await d.banco.rpc<number>('saida_recuperar_travadas', { p_min: 5 });
  const agendadas = await d.banco.rpc<number>('agendadas_para_fila');
  const lote = await d.banco.rpc<any[]>('saida_pegar_lote', { p_limite: limite });
  const canais = new Map((await d.banco.canais()).map((c) => [c.id, c]));
  let enviadas = 0, falhas = 0;
  for (const [i, m] of (lote ?? []).entries()) {
    // mensagens automáticas saem mais espaçadas e com intervalo variável (envio "robótico" é o que mais bloqueia número)
    if (i > 0) await esperar(INTERVALO_ENVIO_MS + (m.origem === 'automacao' ? 1000 + Math.round((d.sorteio ?? Math.random)() * 3000) : 0));
    const canal = canais.get(m.canal_id);
    try {
      if (!canal) throw new Error('canal inativo');
      const destino = m.destino ?? (d.resolverDestino ? await d.resolverDestino(m) : null);
      if (!destino) throw new Error('destino não resolvido (vínculo com a conversa depende do crm_0008)');
      const r = await d.adaptador(canal).enviarTexto(canal, destino, m.conteudo);
      await d.banco.rpc('saida_concluir', { p_id: m.id, p_ok: true, p_externo_id: r.idExterno });
      enviadas++;
      log('info', 'whatsapp-saida', 'enviada', { saida_id: m.id, atendimento_id: m.atendimento_id, canal_id: m.canal_id, destino });
    } catch (e) {
      const erro = String((e as Error)?.message ?? e).slice(0, 500);
      const estado = await d.banco.rpc<string>('saida_concluir', { p_id: m.id, p_ok: false, p_erro: erro });
      falhas++;
      log(estado === 'falhou' ? 'erro' : 'aviso', 'whatsapp-saida', 'falha no envio', { saida_id: m.id, atendimento_id: m.atendimento_id, canal_id: m.canal_id, tentativa: m.tentativas, estado, erro });
    }
  }
  return { recuperadas, agendadas, lote: (lote ?? []).length, enviadas, falhas };
}

/** whatsapp-saude: consulta o estado de cada canal, grava mudanças, abre/resolve alertas e notifica. */
export async function verificarSaude(d: Deps & { notificar?: (texto: string) => Promise<void> }) {
  const mudancas: string[] = [];
  for (const c of await d.banco.canais()) {
    if (!['evolution', 'meta', 'google', 'simulado'].includes(c.provedor)) continue;
    let estado = c.estado, detalhe = '';
    try { ({ estado, detalhe = '' } = await d.adaptador(c).estado(c)); }
    catch (e) { estado = 'desconectado'; detalhe = 'sem resposta do provedor: ' + String((e as Error)?.message ?? e).slice(0, 200); }
    const mudou = await d.banco.rpc<boolean>('registrar_estado_canal', { p_canal: c.id, p_estado: estado, p_detalhe: detalhe });
    if (mudou) { mudancas.push(`${c.nome}: ${c.estado} → ${estado}`); log('aviso', 'whatsapp-saude', 'estado do canal mudou', { canal_id: c.id, de: c.estado, para: estado, detalhe }); }
  }
  const novos = await d.banco.rpc<number>('verificar_alertas');
  let notificados = 0;
  if (d.notificar) {
    const lista = await d.banco.alertasParaNotificar();
    if (lista.length) {
      try {
        await d.notificar(lista.map((a) => `${a.nivel === 'critico' ? '🔴' : '🟡'} ${a.mensagem}`).join('\n'));
        await d.banco.marcarNotificados(lista.map((a) => a.id));
        notificados = lista.length;
      } catch (e) { log('erro', 'whatsapp-saude', 'não foi possível avisar a gestão', { erro: String((e as Error)?.message ?? e) }); }
    }
  }
  return { mudancas, alertas_novos: novos, notificados };
}

/** whatsapp-webhook: grava cada evento bruto uma única vez. Repetido = ignorado. */
export async function receberWebhook(d: Deps, body: any) {
  const canal = await d.banco.canalPorInstancia(String(body?.instance ?? ''));
  if (!canal) { log('aviso', 'whatsapp-webhook', 'instância desconhecida', { instancia: body?.instance }); return { canal: null, novos: 0, repetidos: 0 }; }
  let novos = 0, repetidos = 0;
  for (const ev of normalizarEventoEvolution(body)) {
    const [r] = await d.banco.rpc<{ evento_id: number; novo: boolean }[]>('webhook_registrar', {
      p_canal: canal.id, p_id_externo: ev.idExterno, p_tipo: ev.tipo, p_payload: ev.payload, p_ocorrido_em: ev.ocorridoEm,
    });
    if (!r?.novo) { repetidos++; continue; }
    novos++;
    // Conexão: atualiza o estado na hora e encerra o evento.
    if (ev.tipo === 'conexao' && ev.estado) {
      await d.banco.rpc('registrar_estado_canal', { p_canal: canal.id, p_estado: ev.estado, p_detalhe: 'aviso do provedor (webhook)' });
      await d.banco.rpc('webhook_marcar', { p_id: r.evento_id });
    }
    // Mensagens ficam pendentes: gravá-las na conversa (atd_mensagens) entra no passo 2, com o vínculo real.
  }
  log('info', 'whatsapp-webhook', 'webhook recebido', { canal_id: canal.id, evento: body?.event, novos, repetidos });
  return { canal: canal.id, novos, repetidos };
}
