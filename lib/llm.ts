import Anthropic from '@anthropic-ai/sdk';
import { isRateLimitError, withRateLimit, withRetry } from '@/lib/rate-limit';

function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY ?? process.env.OPENROUTER_API_KEY;
}

function useOpenRouter(key: string): boolean {
  return key.startsWith('sk-or-');
}

let anthropicClient: Anthropic | null | undefined;

function getAnthropicClient(apiKey: string): Anthropic {
  if (anthropicClient === undefined) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

async function callAnthropic(prompt: string, maxTokens: number, apiKey: string): Promise<string> {
  const message = await getAnthropicClient(apiKey).messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return message.content[0].type === 'text' ? message.content[0].text : '[]';
}

async function callOpenRouter(prompt: string, maxTokens: number, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
      'X-Title': 'Drake AI',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-haiku-4.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status} ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '[]';
}

export async function completePrompt(prompt: string, maxTokens = 1024): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY or OPENROUTER_API_KEY in .env.local');
  }

  const call = () =>
    useOpenRouter(apiKey)
      ? callOpenRouter(prompt, maxTokens, apiKey)
      : callAnthropic(prompt, maxTokens, apiKey);

  return withRateLimit(() => withRetry(call));
}

export { isRateLimitError };
