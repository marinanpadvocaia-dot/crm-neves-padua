// Banco real (Supabase) para as Edge Functions. Usa a service_role, que só existe no servidor
// (variável SUPABASE_SERVICE_ROLE_KEY injetada pelo Supabase). Nunca vai para o front.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import type { Banco } from './processos.ts';
import type { Adaptador, Canal } from './adaptador.ts';
import { criarEvolution, criarSimulado } from './adaptador.ts';
import { criarGoogle, criarInstagram } from './canais-meta-google.ts';
import type { BancoIA } from './processos-ia.ts';
import type { Agente } from './ia-regras.ts';
import { iguaisSeguro } from './regras.ts';
import type { DepsConvite } from './usuarios.ts';
import type { CanalLinha, DepsConectar } from './canais.ts';
import type { DepsFluxoIA, Par } from './fluxos.ts';
import type { ProvedorIA } from './processos-ia.ts';

const env = (k: string, obrig = true) => {
  const v = Deno.env.get(k) ?? '';
  if (obrig && !v) throw new Error(`segredo ${k} não configurado`);
  return v;
};

export function bancoSupabase(): Banco {
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'crm' }, auth: { persistSession: false } });
  const ok = <T>(r: { data: T; error: any }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const COLS = 'id,tipo,nome,provedor,instancia,estado';
  return {
    rpc: async (fn, args) => ok(await sb.rpc(fn, args ?? {})),
    canais: async () => ok(await sb.from('canais').select(COLS).eq('ativo', true)) as Canal[],
    canalPorInstancia: async (i) => (ok(await sb.from('canais').select(COLS).eq('instancia', i).eq('ativo', true).limit(1)) as Canal[])[0] ?? null,
    alertasParaNotificar: async () => ok(await sb.from('alertas').select('id,nivel,mensagem').is('notificado_em', null).order('aberto_em').limit(20)) as any[],
    marcarNotificados: async (ids) => { ok(await sb.from('alertas').update({ notificado_em: new Date().toISOString() }).in('id', ids)); },
  };
}

/** Banco dos agentes de IA (mesma service_role). Só regras ativas E validadas pela advogada chegam à IA. */
export function bancoIASupabase(): BancoIA {
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'crm' }, auth: { persistSession: false } });
  const ok = <T>(r: { data: T; error: any }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    rpc: async (fn, args) => ok(await sb.rpc(fn, args ?? {})),
    agentesAtivos: async () => ok(await sb.from('agentes')
      .select('id,slug,nome,canal,modo,modelo,provedor,requer_vinculo,instrucoes,responde_sozinho,transfere_quando').eq('ativo', true)) as Agente[],
    regrasValidadas: async (id) => ok(await sb.from('regras_ia').select('tipo,regra').eq('ativa', true).not('validada_em', 'is', null)
      .or(`agente_id.is.null,agente_id.eq.${id}`).order('created_at')) as { tipo: 'proibido' | 'obrigatorio' | 'cuidado'; regra: string }[],
    exemplos: async (id) => ok(await sb.from('ia_exemplos').select('pergunta,resposta').eq('agente_id', id).eq('ativo', true)
      .order('created_at', { ascending: false }).limit(10)) as { pergunta: string; resposta: string }[],
  };
}

/** Convite de usuários: confere o administrador com o JWT de quem chamou e convida pelo Supabase Auth (service_role). */
export function depsConviteSupabase(): DepsConvite {
  const url = env('SUPABASE_URL');
  const sb = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'crm' }, auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async ehAdmin(token) {
      const r = await fetch(url + '/rest/v1/rpc/eh_admin', {
        method: 'POST', body: '{}',
        headers: { apikey: env('SUPABASE_ANON_KEY'), authorization: 'Bearer ' + token, 'content-type': 'application/json', 'content-profile': 'crm', 'accept-profile': 'crm' },
      });
      return r.ok && (await r.json()) === true;
    },
    async idPorEmail(email) {
      const r = await sb.rpc('usuario_id_por_email', { p_email: email });
      if (r.error) throw new Error(r.error.message);
      return (r.data as string | null) ?? null;
    },
    async convidar(email, nome, redirectTo) {
      const r = await sb.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo });
      if (r.error || !r.data?.user) throw new Error(r.error?.message ?? 'convite não enviado');
      return r.data.user.id;
    },
  };
}

/** Construtor de fluxos com IA: confere o líder/admin com o JWT de quem chamou e lê as opções do escritório (service_role). */
export function depsFluxoIASupabase(provedor: () => ProvedorIA, modelo: string): DepsFluxoIA {
  const url = env('SUPABASE_URL');
  const sb = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'crm' }, auth: { persistSession: false, autoRefreshToken: false } });
  const ok = <T>(r: { data: T; error: any }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    provedor, modelo,
    async ehLider(token) {
      const r = await fetch(url + '/rest/v1/rpc/eh_lider', {
        method: 'POST', body: '{}',
        headers: { apikey: env('SUPABASE_ANON_KEY'), authorization: 'Bearer ' + token, 'content-type': 'application/json', 'content-profile': 'crm', 'accept-profile': 'crm' },
      });
      return r.ok && (await r.json()) === true;
    },
    async opcoes() {
      const [fl, tg, fu, et, pe, ac, rr, or, mp, cp, fx] = await Promise.all([
        sb.from('filas_config').select('fila_ref,nome').order('nome'), sb.from('tags').select('nome').order('nome'),
        sb.from('funis').select('id,slug,nome').eq('ativo', true).order('ordem'), sb.from('funil_etapas').select('funil_id,nome').order('ordem'),
        sb.from('perfis').select('user_id,nome').eq('ativo', true).order('nome'), sb.from('acessos').select('user_id'),
        sb.from('respostas_rapidas').select('atalho').order('atalho'), sb.from('origens').select('nome').eq('ativa', true).order('nome'),
        sb.from('motivos_perda').select('nome').eq('ativo', true).order('nome'), sb.from('campos_personalizados').select('chave,nome').order('ordem'),
        sb.from('fluxos').select('id,nome').is('excluido_em', null).order('nome')]);
      const comAcesso = new Set((ok(ac) as { user_id: string }[]).map((x) => x.user_id));
      const funis = ok(fu) as { id: string; slug: string; nome: string }[];
      const etapas: Record<string, Par[]> = {};
      for (const f of funis) etapas[f.slug] = (ok(et) as { funil_id: string; nome: string }[]).filter((e) => e.funil_id === f.id).map((e) => [e.nome, e.nome]);
      return {
        filas: (ok(fl) as { fila_ref: string; nome: string }[]).map((x) => [x.fila_ref, x.nome]),
        tags: (ok(tg) as { nome: string }[]).map((x) => [x.nome, x.nome]),
        funis: funis.map((x) => [x.slug, x.nome]), etapas,
        pessoas: (ok(pe) as { user_id: string; nome: string }[]).filter((x) => comAcesso.has(x.user_id)).map((x) => [x.user_id, x.nome]),
        respostas: (ok(rr) as { atalho: string }[]).map((x) => [x.atalho, x.atalho]),
        origens: (ok(or) as { nome: string }[]).map((x) => [x.nome, x.nome]),
        perdas: (ok(mp) as { nome: string }[]).map((x) => [x.nome, x.nome]),
        campos: (ok(cp) as { chave: string; nome: string }[]).map((x) => [x.chave, x.nome]),
        fluxos: (ok(fx) as { id: string; nome: string }[]).map((x) => [x.id, x.nome]),
      };
    },
  };
}

/** Reconectar/verificar canal: confere o líder com o JWT de quem chamou; lê o canal e grava o estado com a service_role. */
export function depsConectarSupabase(): DepsConectar {
  const url = env('SUPABASE_URL');
  const sb = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { db: { schema: 'crm' }, auth: { persistSession: false, autoRefreshToken: false } });
  const ok = <T>(r: { data: T; error: any }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const comoUsuario = async (fn: string, token: string) => {
    const r = await fetch(url + '/rest/v1/rpc/' + fn, {
      method: 'POST', body: '{}',
      headers: { apikey: env('SUPABASE_ANON_KEY'), authorization: 'Bearer ' + token, 'content-type': 'application/json', 'content-profile': 'crm', 'accept-profile': 'crm' },
    });
    return r.ok ? await r.json() : null;
  };
  const adaptador = adaptadorPadrao();
  return {
    ehLider: async (token) => (await comoUsuario('eh_lider', token)) === true,
    nome: async (token) => String((await comoUsuario('nome_logado', token)) ?? 'líder'),
    canal: async (id) => (ok(await sb.from('canais').select('id,tipo,nome,provedor,instancia,estado,ativo').eq('id', id).limit(1)) as CanalLinha[])[0] ?? null,
    rpc: async (fn, args) => ok(await sb.rpc(fn, args ?? {})),
    adaptador,
  };
}

/** Evolution (WhatsApp), Meta (Instagram) e Google; "simulado" para canais cadastrados com provedor = simulado. */
export function adaptadorPadrao(): (c: Canal) => Adaptador {
  let evo: Adaptador | null = null, ig: Adaptador | null = null, gg: Adaptador | null = null;
  const sim = criarSimulado();
  return (c) => {
    if (c.provedor === 'simulado') return sim;
    if (c.provedor === 'evolution') return evo ??= criarEvolution({ url: env('EVOLUTION_URL'), apikey: env('EVOLUTION_APIKEY') });
    if (c.provedor === 'meta') return ig ??= criarInstagram({ token: env('IG_TOKEN'), versao: env('IG_GRAPH_VERSAO', false) || undefined });
    if (c.provedor === 'google') return gg ??= criarGoogle({ clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET'), refreshToken: env('GOOGLE_REFRESH_TOKEN') });
    throw new Error(`provedor ${c.provedor} sem adaptador`);
  };
}

/** As funções agendadas exigem o cabeçalho x-cron-segredo (guardado no Vault e usado pelo pg_cron). */
export function exigirSegredoCron(req: Request): Response | null {
  const s = Deno.env.get('CRON_SEGREDO') ?? '';
  return iguaisSeguro(req.headers.get('x-cron-segredo') ?? '', s) ? null : new Response('não autorizado', { status: 401 });
}

export const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } });
