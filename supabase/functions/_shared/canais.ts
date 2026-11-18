// Reconectar e verificar um canal pela tela (Configurações → Saúde e faixa de canais). Só líder ou administrador.
// Dependências injetadas para testar sem o Supabase e sem a Evolution.
//   acao 'qr'        → pede um QR Code novo à Evolution (só canais com QR Code) e marca o canal como "aguardando QR Code";
//   acao 'verificar' → consulta o estado agora, sem esperar a verificação de 1 em 1 minuto.
// Quem pediu fica anotado no histórico do canal. Nenhum segredo sai daqui: a apikey da Evolution fica nos segredos da função.
import type { Adaptador, Canal } from './adaptador.ts';
import type { Resposta } from './usuarios.ts';

export interface CanalLinha extends Canal { ativo: boolean }

export interface DepsConectar {
  /** crm.eh_lider() avaliado com o JWT de quem chamou. */
  ehLider(tokenUsuario: string): Promise<boolean>;
  /** crm.nome_logado() com o JWT de quem chamou. */
  nome(tokenUsuario: string): Promise<string>;
  /** Canal pelo id (service_role), ligado ou não: o reserva é conectado antes da troca. */
  canal(id: string): Promise<CanalLinha | null>;
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T>;
  adaptador(c: Canal): Adaptador;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function conectarCanal(deps: DepsConectar, autorizacao: string | null, corpo: unknown): Promise<Resposta> {
  const token = /^Bearer\s+(\S+)$/i.exec(autorizacao ?? '')?.[1];
  if (!token) return { status: 401, corpo: { erro: 'Sessão encerrada. Entre de novo.' } };
  if (!(await deps.ehLider(token))) return { status: 403, corpo: { erro: 'Só líderes e administradores reconectam canais.' } };
  const c = (corpo ?? {}) as { canal_id?: unknown; acao?: unknown };
  const id = String(c.canal_id ?? ''), acao = String(c.acao ?? '');
  if (!UUID.test(id)) return { status: 400, corpo: { erro: 'Canal inválido.' } };
  if (acao !== 'qr' && acao !== 'verificar') return { status: 400, corpo: { erro: 'Ação inválida.' } };
  const canal = await deps.canal(id);
  if (!canal) return { status: 404, corpo: { erro: 'Canal não encontrado.' } };
  const quem = await deps.nome(token);
  const ad = deps.adaptador(canal);

  if (acao === 'verificar') {
    let estado = canal.estado, detalhe = '';
    try { ({ estado, detalhe = '' } = await ad.estado(canal)); }
    catch (e) { estado = 'desconectado'; detalhe = 'sem resposta do provedor: ' + String((e as Error)?.message ?? e).slice(0, 200); }
    const mudou = await deps.rpc<boolean>('registrar_estado_canal', { p_canal: canal.id, p_estado: estado, p_detalhe: `verificação pedida por ${quem}${detalhe ? ' · ' + detalhe : ''}` });
    return { status: 200, corpo: { estado, mudou, detalhe } };
  }

  if (!ad.conectar) {
    return { status: 400, corpo: { erro: canal.tipo === 'whatsapp'
      ? 'Este canal não usa QR Code.'
      : 'Instagram e Google não usam QR Code: reconectam renovando o acesso (token) nos segredos das funções. Veja docs/ativar-agentes-ia.md.' } };
  }
  let r;
  try { r = await ad.conectar(canal); }
  catch (e) { return { status: 502, corpo: { erro: 'Não foi possível pedir o QR Code: ' + String((e as Error)?.message ?? e).slice(0, 200) + '.' } }; }
  if (r.conectado) {
    await deps.rpc('registrar_estado_canal', { p_canal: canal.id, p_estado: 'conectado', p_detalhe: `verificação pedida por ${quem}: já estava conectado` });
    return { status: 200, corpo: { conectado: true } };
  }
  const mudou = await deps.rpc<boolean>('registrar_estado_canal', { p_canal: canal.id, p_estado: 'aguardando_qr', p_detalhe: `QR Code pedido por ${quem}` });
  if (!mudou) await deps.rpc('canal_anotar', { p_canal: canal.id, p_detalhe: `QR Code pedido por ${quem}` });
  return { status: 200, corpo: { conectado: false, qr: r.qr ?? null, codigo: r.codigo ?? null } };
}
