// Provedor de IA: Claude (Anthropic), pelo SDK oficial. Só roda no Supabase (Deno); os testes usam um provedor simulado.
// A chave vem do Secret ANTHROPIC_API_KEY da Edge Function. Nunca do banco, nunca do front.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import type { ProvedorIA } from './processos-ia.ts';

// Modelos que aceitam o "fallback" do lado do servidor: se o modelo recusar, outro modelo tenta na mesma chamada.
const COM_FALLBACK = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export function criarAnthropic(apiKey: string): ProvedorIA {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return {
    async gerar({ modelo, system, usuario, esquema }) {
      const pedido = {
        model: modelo,
        max_tokens: 16000,
        system,
        messages: [{ role: 'user' as const, content: usuario }],
        cache_control: { type: 'ephemeral' as const },                         // agente + regras + exemplos se repetem
        output_config: { effort: 'medium' as const, format: { type: 'json_schema' as const, schema: esquema as Record<string, unknown> } },
      };
      const r = COM_FALLBACK.has(modelo)
        ? await client.beta.messages.create({ ...pedido, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.messages.create(pedido);
      if (r.stop_reason === 'refusal') return { texto: '', recusou: true };
      const texto = r.content.flatMap((b: { type: string; text?: string }) => (b.type === 'text' && b.text ? [b.text] : [])).join('');
      return { texto };
    },
  };
}
