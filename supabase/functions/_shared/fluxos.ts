// Fluxos de trabalho: catálogo de gatilhos e ações, validação e construção com IA (Edge Function fluxos-ia).
// A IA recebe SÓ o catálogo, as opções do escritório (filas, tags, funis…) e o fluxo em edição. Nenhum dado de cliente.
// A saída estruturada da API não aceita esquema recursivo: a IA devolve os passos numa lista plana (pai + ramo)
// e aqui viram a árvore que a tela desenha. Tudo é conferido contra o catálogo antes de voltar para a tela.
import catalogo from './fluxos-catalogo.json' with { type: 'json' };
import type { ProvedorIA } from './processos-ia.ts';

export type Par = [string, string];
export interface Campo { k: string; rotulo: string; tipo: string; opcoes?: string; obrig?: boolean; padrao?: unknown; depende?: string; dica?: string }
export interface ItemCatalogo { tipo: string; nome: string; grupo: string; descricao: string; campos: Campo[]; ramos?: string[]; fim?: boolean; aviso?: string }
export interface Condicao { sujeito: string; operador: string; valor: string }
export interface Opcoes { [lista: string]: Par[] | Record<string, Par[]> }
export interface Passo { id: string; tipo: string; cfg: Record<string, unknown>; ramos?: { id: string; nome: string; passos: Passo[] }[] }
export interface Gatilho { id: string; tipo: string; cfg: Record<string, unknown> }
export interface Definicao { gatilhos: Gatilho[]; passos: Passo[] }

export const CATALOGO = catalogo as unknown as { estaticas: Record<string, Par[]>; gatilhos: ItemCatalogo[]; acoes: ItemCatalogo[] };
const G = new Map(CATALOGO.gatilhos.map((x) => [x.tipo, x]));
const A = new Map(CATALOGO.acoes.map((x) => [x.tipo, x]));
export const itemGatilho = (t: string) => G.get(t);
export const itemAcao = (t: string) => A.get(t);

/** Opções válidas de um campo (estáticas do catálogo ou do escritório; etapas dependem do funil escolhido). */
export function opcoesDoCampo(c: Campo, cfg: Record<string, unknown>, op: Opcoes): Par[] | null {
  if (c.tipo === 'valor_do_sujeito') {
    const s = String(cfg.sujeito ?? '');
    if (s === 'etapa') return Object.values((op.etapas ?? {}) as Record<string, Par[]>).flat();
    const lista = ({ tag: 'tags', funil: 'funis', canal: 'canais', origem: 'origens' } as Record<string, string>)[s];
    return lista ? (CATALOGO.estaticas[lista] ?? (op[lista] as Par[]) ?? []) : null;
  }
  if (c.tipo !== 'select' || !c.opcoes) return null;
  if (c.opcoes === 'etapas') return ((op.etapas ?? {}) as Record<string, Par[]>)[String(cfg[c.depende ?? 'funil'] ?? '')] ?? [];
  return CATALOGO.estaticas[c.opcoes] ?? (op[c.opcoes] as Par[]) ?? [];
}

/** Nomes dos caminhos de um passo que ramifica. */
export function ramosDe(item: ItemCatalogo | undefined, cfg: Record<string, unknown>): string[] | null {
  return item?.ramos ?? null;
}

/** Lista de condições do "Se / senão" (aceita o formato antigo, com uma condição só no próprio passo). */
function limparCondicoes(bruto: Record<string, unknown>, op: Opcoes, onde: string, pend: string[]): Condicao[] {
  let L = bruto.condicoes as unknown;
  if (!Array.isArray(L)) L = bruto.sujeito ? [{ sujeito: bruto.sujeito, operador: bruto.operador, valor: bruto.valor }] : [];
  const suj = CATALOGO.estaticas.sujeitos.map(([v]) => v), ops = CATALOGO.estaticas.operadores.map(([v]) => v);
  const out: Condicao[] = [];
  for (const x of (L as Record<string, unknown>[]).slice(0, 10)) {
    if (!x || typeof x !== 'object') continue;
    const q: Condicao = { sujeito: String(x.sujeito ?? ''), operador: String(x.operador ?? 'e'), valor: x.valor == null ? '' : String(x.valor).slice(0, 200) };
    if (!suj.includes(q.sujeito)) { pend.push(`${onde}: condição sobre “${q.sujeito}” não existe`); continue; }
    if (!ops.includes(q.operador)) q.operador = 'e';
    const o = opcoesDoCampo({ k: 'valor', rotulo: 'valor', tipo: 'valor_do_sujeito' }, { sujeito: q.sujeito }, op);
    if (o && q.valor !== '' && !o.some(([v]) => v === q.valor)) { pend.push(`${onde}: “${q.valor}” não existe`); q.valor = ''; }
    if (q.valor === '') pend.push(`${onde}: falta o valor de uma condição`);
    out.push(q);
  }
  if (!out.length) pend.push(`${onde}: falta ao menos uma condição`);
  return out;
}

/** Limpa a configuração: só campos do catálogo; valor fora das opções vira pendência (fica vazio). */
function limparCfg(item: ItemCatalogo, bruto: Record<string, unknown>, op: Opcoes, onde: string, pend: string[]) {
  const cfg: Record<string, unknown> = {};
  for (const c of item.campos) {
    if (c.tipo === 'condicoes') { cfg[c.k] = limparCondicoes(bruto, op, onde, pend); continue; }
    let v = bruto[c.k];
    if (v === undefined || v === null || v === '') v = c.padrao ?? '';
    if (c.tipo === 'numero' && v !== '') { const n = Number(v); v = Number.isFinite(n) && n >= 0 ? n : ''; }
    else if (v !== '') v = String(v).slice(0, 2000);
    cfg[c.k] = v;
  }
  for (const c of item.campos) {          // depois de todos preenchidos (etapa depende do funil)
    if (c.tipo === 'condicoes') continue;
    const ops = opcoesDoCampo(c, cfg, op), v = cfg[c.k];
    if (ops && v !== '' && !ops.some(([val]) => val === String(v))) { pend.push(`${onde}: “${v}” não existe em ${c.rotulo.toLowerCase()}`); cfg[c.k] = ''; }
    if (c.obrig && cfg[c.k] === '') pend.push(`${onde}: falta ${c.rotulo.toLowerCase()}`);
  }
  if (cfg.url && !/^https:\/\//.test(String(cfg.url))) { pend.push(`${onde}: o webhook precisa de endereço https://`); cfg.url = ''; }
  return cfg;
}

/** Confere uma definição inteira (o que a tela salva): devolve as pendências, sem mudar nada. */
export function pendencias(def: Definicao, op: Opcoes): string[] {
  const p: string[] = [];
  if (!def.gatilhos?.length) p.push('Falta o acionador (gatilho)');
  def.gatilhos?.forEach((g, i) => { const it = itemGatilho(g.tipo); if (!it) p.push(`Acionador ${i + 1}: tipo desconhecido`); else limparCfg(it, g.cfg ?? {}, op, it.nome, p); });
  const andar = (L: Passo[]) => L.forEach((s) => {
    const it = itemAcao(s.tipo); if (!it) { p.push(`Passo desconhecido (${s.tipo})`); return; }
    limparCfg(it, s.cfg ?? {}, op, it.nome, p); (s.ramos ?? []).forEach((r) => andar(r.passos));
  });
  andar(def.passos ?? []);
  if (!def.passos?.length) p.push('Falta ao menos uma ação');
  return p;
}

// ---- saída da IA (lista plana) -> árvore -------------------------------------------------------------------
export interface PlanoIA { nome: string; resumo: string; avisos: string[]; gatilhos: { tipo: string; config_json: string }[];
  passos: { id: string; pai: string; ramo: string; tipo: string; config_json: string }[] }
const lerCfg = (s: string) => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, unknown> : {}; } catch { return {}; } };

export function arvoreDoPlano(plano: PlanoIA, op: Opcoes): { definicao: Definicao; avisos: string[] } {
  const avisos = [...(plano.avisos ?? [])].map(String).slice(0, 10);
  let n = 0; const novoId = (p: string) => p + (++n);
  const gatilhos: Gatilho[] = [];
  for (const g of plano.gatilhos ?? []) {
    const it = itemGatilho(g.tipo); if (!it) { avisos.push(`Acionador “${g.tipo}” não existe e foi ignorado.`); continue; }
    gatilhos.push({ id: novoId('g'), tipo: g.tipo, cfg: limparCfg(it, lerCfg(g.config_json), op, it.nome, avisos) });
  }
  const brutos = (plano.passos ?? []).slice(0, 80);
  const porId = new Map<string, Passo>(), usados = new Set<string>();
  for (const b of brutos) {
    const it = itemAcao(b.tipo); if (!it) { avisos.push(`Ação “${b.tipo}” não existe e foi ignorada.`); continue; }
    const cfg = limparCfg(it, lerCfg(b.config_json), op, it.nome, avisos);
    const nomes = ramosDe(it, cfg);
    porId.set(b.id, { id: novoId('p'), tipo: b.tipo, cfg, ...(nomes ? { ramos: nomes.map((nm) => ({ id: novoId('r'), nome: nm, passos: [] })) } : {}) });
  }
  const raiz: Passo[] = [];
  for (const b of brutos) {
    const s = porId.get(b.id); if (!s || usados.has(b.id)) continue; usados.add(b.id);
    if (!b.pai) { raiz.push(s); continue; }
    const pai = porId.get(b.pai), ramo = pai?.ramos?.find((r) => r.nome.toLowerCase() === String(b.ramo).trim().toLowerCase());
    if (!pai || pai === s || !ramo) { avisos.push(`O passo “${itemAcao(b.tipo)?.nome}” apontava para um caminho que não existe e foi colocado no fim.`); raiz.push(s); continue; }
    ramo.passos.push(s);
  }
  // regra do construtor: depois de um passo que ramifica ou encerra, a sequência acaba
  const arrumar = (L: Passo[], fundo = 0): Passo[] => {
    if (fundo > 12) return [];
    const out: Passo[] = [];
    for (let i = 0; i < L.length; i++) {
      const s = L[i]; out.push(s); s.ramos?.forEach((r) => { r.passos = arrumar(r.passos, fundo + 1); });
      const it = itemAcao(s.tipo);
      if ((s.ramos || it?.fim) && i < L.length - 1) {
        const resto = L.slice(i + 1);
        if (s.ramos?.length) { s.ramos[0].passos.push(...arrumar(resto, fundo + 1)); avisos.push(`Passos depois de “${it?.nome}” foram para o caminho “${s.ramos[0].nome}”.`); }
        else avisos.push(`Passos depois de “${it?.nome}” foram descartados (o fluxo termina ali).`);
        break;
      }
    }
    return out;
  };
  return { definicao: { gatilhos, passos: arrumar(raiz) }, avisos: [...new Set(avisos)].slice(0, 15) };
}

/** Árvore -> lista plana (para mandar o fluxo atual à IA quando o pedido é de alteração). */
export function planoDaArvore(def: Definicao) {
  const passos: { id: string; pai: string; ramo: string; tipo: string; config_json: string }[] = [];
  const andar = (L: Passo[], pai: string, ramo: string) => L.forEach((s) => {
    passos.push({ id: s.id, pai, ramo, tipo: s.tipo, config_json: JSON.stringify(s.cfg ?? {}) });
    (s.ramos ?? []).forEach((r) => andar(r.passos, s.id, r.nome));
  });
  andar(def.passos ?? [], '', '');
  return { gatilhos: (def.gatilhos ?? []).map((g) => ({ tipo: g.tipo, config_json: JSON.stringify(g.cfg ?? {}) })), passos };
}

export const ESQUEMA_FLUXO = {
  type: 'object', additionalProperties: false, required: ['nome', 'resumo', 'avisos', 'gatilhos', 'passos'],
  properties: {
    nome: { type: 'string', description: 'Nome curto do fluxo, em português.' },
    resumo: { type: 'string', description: 'O que o fluxo faz, em 1 a 3 frases simples.' },
    avisos: { type: 'array', items: { type: 'string' }, description: 'O que não deu para montar com o catálogo, ou o que a pessoa precisa conferir.' },
    gatilhos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tipo', 'config_json'],
      properties: { tipo: { type: 'string', enum: CATALOGO.gatilhos.map((x) => x.tipo) }, config_json: { type: 'string' } } } },
    passos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'pai', 'ramo', 'tipo', 'config_json'],
      properties: { id: { type: 'string' }, pai: { type: 'string' }, ramo: { type: 'string' }, tipo: { type: 'string', enum: CATALOGO.acoes.map((x) => x.tipo) }, config_json: { type: 'string' } } } },
  },
};

const listaTxt = (it: ItemCatalogo) => `- ${it.tipo} (${it.nome}): ${it.descricao}` +
  (it.ramos ? ` RAMIFICA em: ${it.ramos.join(' | ')}.` : '') + (it.fim ? ' ENCERRA o fluxo.' : '') +
  (it.campos.length ? ` Campos: ${it.campos.map((c) => `${c.k}${c.obrig ? '*' : ''}=${c.tipo === 'select' ? 'opção de ' + c.opcoes : c.tipo === 'condicoes' ? 'lista de {"sujeito": opção de sujeitos, "operador": opção de operadores, "valor": texto ou opção conforme o sujeito (tags, funis, canais, origens, etapas)}' : c.tipo}`).join(', ')}` : '') +
  (it.aviso ? ` ATENÇÃO: ${it.aviso} Evite, a não ser que o pedido exija.` : '');

export function montarPedidoFluxo(op: Opcoes, pedido: string, atual?: Definicao | null) {
  const lst = (nome: string, L: Par[]) => `${nome}: ${L.map(([v, r]) => v === r ? `"${v}"` : `"${v}" (${r})`).join(', ') || '(nenhuma)'}`;
  const etapas = Object.entries((op.etapas ?? {}) as Record<string, Par[]>).map(([f, L]) => lst(`etapas do funil "${f}"`, L)).join('\n');
  const system = [
    'Você monta fluxos de trabalho (automações) para o CRM de um escritório de advocacia brasileiro (Neves Pádua Advocacia).',
    'Use SOMENTE os tipos do catálogo abaixo. Em config_json, escreva um objeto JSON com os campos do tipo; campos marcados com * são obrigatórios.',
    'Para campos de opção, use exatamente um dos VALORES listados (o texto entre aspas, nunca o rótulo entre parênteses). Se não existir uma opção adequada, deixe o campo vazio e explique em "avisos".',
    'Os passos vêm numa lista plana: pai = "" para a sequência principal; para passos dentro de um caminho, pai = id do passo que ramifica e ramo = nome exato do caminho. A ordem da lista é a ordem de execução.',
    'Depois de um passo que ramifica ou que encerra, nada mais vem na mesma sequência: continue dentro dos caminhos.',
    'Mensagens ao cliente: português claro, cordial e curto. NUNCA citar valores em reais ou honorários, prometer resultado, falar de chance de ganhar ou se passar por advogado. Use {nome} para o primeiro nome do cliente.',
    'Se o pedido precisar de algo que o catálogo não tem, monte o mais próximo possível e diga em "avisos" o que ficou de fora.',
    '', 'ACIONADORES (gatilhos; o fluxo começa quando QUALQUER um acontece):', ...CATALOGO.gatilhos.map(listaTxt),
    '', 'AÇÕES:', ...CATALOGO.acoes.map(listaTxt),
    '', 'OPÇÕES FIXAS:', ...Object.entries(CATALOGO.estaticas).map(([k, L]) => lst(k, L)),
    '', 'OPÇÕES DO ESCRITÓRIO:', ...['filas', 'tags', 'funis', 'pessoas', 'respostas', 'origens', 'perdas', 'campos', 'fluxos'].map((k) => lst(k, (op[k] as Par[]) ?? [])), etapas,
  ].join('\n');
  const usuario = atual?.passos?.length || atual?.gatilhos?.length
    ? `Fluxo atual (mantenha o que não for pedido para mudar):\n${JSON.stringify(planoDaArvore(atual))}\n\nAlteração pedida: ${pedido}`
    : `Monte este fluxo: ${pedido}`;
  return { system, usuario };
}

// ---- Edge Function --------------------------------------------------------------------------------------------
export interface DepsFluxoIA { ehLider(token: string): Promise<boolean>; opcoes(): Promise<Opcoes>; provedor: () => ProvedorIA; modelo: string }

export async function processarFluxoIA(deps: DepsFluxoIA, autorizacao: string | null, corpo: unknown): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const token = /^Bearer\s+(\S+)$/i.exec(autorizacao ?? '')?.[1];
  if (!token) return { status: 401, corpo: { erro: 'Sessão encerrada. Entre de novo.' } };
  if (!(await deps.ehLider(token))) return { status: 403, corpo: { erro: 'Só líderes e administradores constroem fluxos.' } };
  const c = (corpo ?? {}) as { pedido?: unknown; definicao?: unknown };
  const pedido = String(c.pedido ?? '').trim();
  if (pedido.length < 5) return { status: 400, corpo: { erro: 'Descreva o que o fluxo deve fazer.' } };
  if (pedido.length > 3000) return { status: 400, corpo: { erro: 'Descrição longa demais (até 3000 letras).' } };
  const atual = c.definicao && typeof c.definicao === 'object' ? c.definicao as Definicao : null;
  const op = await deps.opcoes();
  const { system, usuario } = montarPedidoFluxo(op, pedido, atual);
  const r = await deps.provedor().gerar({ modelo: deps.modelo, system, usuario, esquema: ESQUEMA_FLUXO });
  if (r.recusou) return { status: 422, corpo: { erro: 'A IA não montou este fluxo. Reescreva o pedido ou monte pelo construtor.' } };
  let plano: PlanoIA;
  try { plano = JSON.parse(r.texto); } catch { return { status: 502, corpo: { erro: 'A IA respondeu fora do formato. Tente de novo.' } }; }
  const { definicao, avisos } = arvoreDoPlano(plano, op);
  if (!definicao.gatilhos.length && !definicao.passos.length) return { status: 422, corpo: { erro: 'A IA não conseguiu montar nada com o catálogo. Reescreva o pedido.', avisos } };
  return { status: 200, corpo: { nome: String(plano.nome ?? '').slice(0, 80), resumo: String(plano.resumo ?? '').slice(0, 600), avisos, definicao } };
}
