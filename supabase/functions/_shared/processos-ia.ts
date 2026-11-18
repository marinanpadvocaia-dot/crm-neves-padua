// Lógica dos agentes de IA e da entrada do Instagram/Google, com dependências injetadas (banco, IA, adaptadores).
// O mesmo código roda no Supabase (Deno) e nos testes locais (Node + PGlite + IA e canais simulados).
import type { Adaptador, Canal } from './adaptador.ts';
import type { Banco } from './processos.ts';
import type { AdaptadorGoogle } from './canais-meta-google.ts';
import { normalizarEventoInstagram } from './canais-meta-google.ts';
import { type Agente, type RegraIA, ESQUEMA_SAIDA, decidirAntesDaIA, entradaDoEvento, interpretarSaida, montarPedido, verificarResposta } from './ia-regras.ts';
import { log } from './log.ts';

/** Quem gera o texto. A chave da API fica no Secret da função; aqui só chega o pedido pronto (já mascarado). */
export interface ProvedorIA {
  gerar(p: { modelo: string; system: string; usuario: string; esquema: unknown }): Promise<{ texto: string; recusou?: boolean }>;
}

export interface BancoIA {
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T>;
  agentesAtivos(): Promise<Agente[]>;
  regrasValidadas(agenteId: string): Promise<RegraIA[]>;
  exemplos(agenteId: string): Promise<{ pergunta: string; resposta: string }[]>;
}

/** ia-agentes: para cada mensagem nova de canal com agente ligado, grava um rascunho (ou a transferência) uma única vez. */
export async function processarIA(d: { banco: BancoIA; provedor: (a: Agente) => ProvedorIA; limite?: number }) {
  const agentes = new Map((await d.banco.agentesAtivos()).map((a) => [a.id, a]));
  const r = { eventos: 0, rascunhos: 0, automaticas: 0, transferidas: 0, bloqueadas: 0, ignoradas: 0, erros: 0 };
  if (!agentes.size) return r;
  const eventos = await d.banco.rpc<any[]>('ia_eventos_para_processar', { p_limite: d.limite ?? 20 });
  const cache = new Map<string, { regras: RegraIA[]; exemplos: { pergunta: string; resposta: string }[] }>();
  for (const ev of eventos ?? []) {
    r.eventos++;
    const a = agentes.get(ev.agente_id);
    if (!a) continue;
    const registrar = (status: string, e: { contato?: string; nome?: string; destino?: string; texto?: string } | null, rascunho: string, motivo: string | null) =>
      d.banco.rpc('ia_registrar', {
        p_evento: ev.evento_id, p_agente: a.id, p_status: status, p_contato: e?.contato ?? null, p_contato_nome: e?.nome ?? null,
        p_destino: e?.destino ?? null, p_mensagem: e?.texto ?? null, p_rascunho: rascunho, p_motivo: motivo,
      });
    try {
      const e = entradaDoEvento(ev.canal_tipo, ev.tipo, ev.payload);
      if (!e) { await registrar('ignorada', null, '', 'evento sem texto para responder'); r.ignoradas++; continue; }
      if (!(await d.banco.rpc<boolean>('ia_pode_processar', { p_contato: e.contato }))) {
        // IA pausada para este contato (pediu uma pessoa antes ou foi assumido): nada de IA, vai direto para a equipe
        await registrar('transferida', e, '', 'IA pausada para este contato: a mensagem vai direto para a equipe.'); r.transferidas++; continue;
      }
      const antes = decidirAntesDaIA(a, e);
      if (antes) { await registrar(antes.status, e, '', antes.motivo); r.transferidas++; continue; }
      if (!cache.has(a.id)) cache.set(a.id, { regras: await d.banco.regrasValidadas(a.id), exemplos: await d.banco.exemplos(a.id) });
      const { regras, exemplos } = cache.get(a.id)!;
      if (!regras.length) { log('erro', 'ia-agentes', 'agente ligado sem regra validada: nada processado', { agente: a.slug }); r.erros++; continue; }
      const pedido = montarPedido(a, regras, exemplos, e);
      const saida = await d.provedor(a).gerar({ modelo: a.modelo, system: pedido.system, usuario: pedido.usuario, esquema: ESQUEMA_SAIDA });
      const dec = saida.recusou
        ? { acao: 'transferir' as const, resposta: '', motivo: 'A IA se recusou a responder esta mensagem.' }
        : interpretarSaida(saida.texto);
      if (dec.acao === 'transferir') { await registrar('transferida', e, dec.resposta, dec.motivo || 'A IA indicou atendimento humano.'); r.transferidas++; continue; }
      const bloqueio = verificarResposta(dec.resposta);
      if (bloqueio) { await registrar('bloqueada', e, dec.resposta, `Bloqueado pela trava de regras: ${bloqueio}.`); r.bloqueadas++; continue; }
      if (a.modo === 'automatico') { await registrar('aprovada', e, dec.resposta, dec.motivo); r.automaticas++; }
      else { await registrar('pendente', e, dec.resposta, dec.motivo); r.rascunhos++; }
    } catch (err) {
      // Sem registro: o evento volta na próxima rodada (até 24 h). A mensagem do erro não leva o texto do contato.
      r.erros++;
      log('erro', 'ia-agentes', 'falha ao processar evento', { evento_id: ev.evento_id, agente: a.slug, erro: String((err as Error)?.message ?? err) });
    }
  }
  log('info', 'ia-agentes', 'rodada concluída', r);
  return r;
}

/** instagram-webhook: grava cada evento bruto uma única vez, no canal cuja instância é o id da conta. */
export async function receberInstagram(d: { banco: Banco }, body: any) {
  let novos = 0, repetidos = 0, desconhecidos = 0;
  for (const { conta, ev } of normalizarEventoInstagram(body)) {
    const canal = await d.banco.canalPorInstancia(conta);
    if (!canal || canal.tipo !== 'instagram') { desconhecidos++; continue; }
    const [x] = await d.banco.rpc<{ evento_id: number; novo: boolean }[]>('webhook_registrar', {
      p_canal: canal.id, p_id_externo: ev.idExterno, p_tipo: ev.tipo, p_payload: ev.payload, p_ocorrido_em: ev.ocorridoEm,
    });
    if (x?.novo) novos++; else repetidos++;
  }
  if (desconhecidos) log('aviso', 'instagram-webhook', 'conta do Instagram sem canal cadastrado', { desconhecidos });
  log('info', 'instagram-webhook', 'webhook recebido', { novos, repetidos });
  return { novos, repetidos, desconhecidos };
}

/** google-avaliacoes: o Google não avisa avaliações novas por webhook aqui; a função busca e grava cada uma uma única vez. */
export async function buscarAvaliacoesGoogle(d: { banco: Banco; adaptador: (c: Canal) => Adaptador }) {
  let novas = 0, canais = 0;
  for (const c of await d.banco.canais()) {
    if (c.tipo !== 'google') continue;
    const ad = d.adaptador(c) as Partial<AdaptadorGoogle>;
    if (typeof ad.listarAvaliacoes !== 'function') continue;
    canais++;
    try {
      for (const av of await ad.listarAvaliacoes(c)) {
        if (!av?.reviewId || av?.reviewReply) continue;
        const [x] = await d.banco.rpc<{ evento_id: number; novo: boolean }[]>('webhook_registrar', {
          p_canal: c.id, p_id_externo: String(av.reviewId), p_tipo: 'avaliacao', p_payload: av, p_ocorrido_em: av.updateTime ?? av.createTime ?? null,
        });
        if (x?.novo) novas++;
      }
    } catch (e) {
      log('erro', 'google-avaliacoes', 'falha ao buscar avaliações', { canal_id: c.id, erro: String((e as Error)?.message ?? e) });
    }
  }
  return { canais, novas };
}
