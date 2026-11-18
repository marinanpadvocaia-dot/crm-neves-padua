// Convite de usuário (página Usuários, só administrador). Dependências injetadas para testar sem o Supabase.
// Regra: o login (Supabase Auth) é compartilhado com o sistema jurídico. Aqui só se CONVIDA quem ainda não tem login;
// quem já tem é reaproveitado. Nada é apagado ou alterado no Auth.

export interface DepsConvite {
  /** crm.eh_admin() avaliado com o JWT de quem chamou (o PostgREST valida o token). */
  ehAdmin(tokenUsuario: string): Promise<boolean>;
  /** crm.usuario_id_por_email (service_role). */
  idPorEmail(email: string): Promise<string | null>;
  /** Supabase Auth: envia o e-mail de convite e devolve o id do usuário criado. */
  convidar(email: string, nome: string, redirectTo?: string): Promise<string>;
}

export interface Resposta { status: number; corpo: Record<string, unknown> }

export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export async function convidarUsuario(deps: DepsConvite, autorizacao: string | null, corpo: unknown, redirectTo?: string): Promise<Resposta> {
  const token = /^Bearer\s+(\S+)$/i.exec(autorizacao ?? '')?.[1];
  if (!token) return { status: 401, corpo: { erro: 'Sessão encerrada. Entre de novo.' } };
  if (!(await deps.ehAdmin(token))) return { status: 403, corpo: { erro: 'Só o administrador convida usuários.' } };
  const c = (corpo ?? {}) as { email?: unknown; nome?: unknown };
  const email = String(c.email ?? '').trim().toLowerCase();
  const nome = String(c.nome ?? '').trim().replace(/\s+/g, ' ');
  if (!emailValido(email)) return { status: 400, corpo: { erro: 'Informe um e-mail válido.' } };
  if (nome.length < 2 || nome.length > 80) return { status: 400, corpo: { erro: 'Escreva o nome (até 80 letras).' } };
  const existente = await deps.idPorEmail(email);
  if (existente) return { status: 200, corpo: { user_id: existente, convidado: false } };
  const id = await deps.convidar(email, nome, redirectTo);
  return { status: 200, corpo: { user_id: id, convidado: true } };
}

/** CORS: o app chama esta função do navegador. Com APP_URL definido, só aquele endereço é aceito. */
export function cabecalhosCors(appUrl: string): Record<string, string> {
  let permitido = '*';
  if (appUrl) { try { permitido = new URL(appUrl).origin; } catch { permitido = appUrl; } }
  return {
    'access-control-allow-origin': permitido,
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'origin',
  };
}
