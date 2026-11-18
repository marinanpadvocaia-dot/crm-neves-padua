// Convite de usuário (Configurações → Usuários → Novo usuário). Chamada pelo navegador do administrador.
// Publicada com --no-verify-jwt: a própria função confere o JWT de quem chamou com crm.eh_admin().
// Quem ainda não tem login recebe o e-mail de convite do Supabase Auth (link para criar a senha, que abre o app).
// Quem já tem login (ex.: usuário do sistema jurídico) é reaproveitado, sem novo e-mail.
// Depois, o app grava nome, tipo de acesso e filas com crm.usuario_salvar (também só administrador).
import { cabecalhosCors, convidarUsuario } from '../_shared/usuarios.ts';
import { depsConviteSupabase } from '../_shared/supabase.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  const appUrl = Deno.env.get('APP_URL') ?? '';
  const cors = cabecalhosCors(appUrl);
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return responder({ erro: 'método não permitido' }, 405);
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return responder({ erro: 'corpo inválido' }, 400); }
  try {
    const r = await convidarUsuario(depsConviteSupabase(), req.headers.get('authorization'), corpo, appUrl || undefined);
    return responder(r.corpo, r.status);
  } catch (e) {
    log('erro', 'usuarios-convite', 'falha no convite', { erro: String((e as Error)?.message ?? e) });
    return responder({ erro: 'Não foi possível enviar o convite agora. Tente de novo.' }, 500);
  }
});
