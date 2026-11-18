// Registro estruturado (uma linha JSON por evento), sem dado pessoal além do necessário.
import { mascararTelefone, mascararTexto } from './regras.ts';

export type Nivel = 'debug' | 'info' | 'aviso' | 'erro';

export function log(nivel: Nivel, funcao: string, mensagem: string, campos: Record<string, unknown> = {}): void {
  const c: Record<string, unknown> = { ...campos };
  if ('telefone' in c) c.telefone = mascararTelefone(c.telefone);
  if ('destino' in c) c.destino = mascararTelefone(c.destino);
  if (typeof c.erro === 'string') c.erro = mascararTexto(c.erro);
  const linha = JSON.stringify({ ts: new Date().toISOString(), nivel, funcao, mensagem: mascararTexto(mensagem), ...c });
  (nivel === 'erro' ? console.error : console.log)(linha);
}
