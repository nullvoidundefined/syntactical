// An organization-level API key needs the anthropic-workspace-id header on every request; a
// workspace-scoped key sends none. Checked on the request the real SDK sends, through a fake fetch.
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { buildAnthropicOptions } from '../../clients/buildAnthropicOptions.js';

const REPLY = {
  content: [{ citations: null, text: 'ok', type: 'text' }],
  id: 'msg_test',
  model: 'claude-haiku-5-5',
  role: 'assistant',
  stop_reason: 'end_turn',
  stop_sequence: null,
  type: 'message',
  usage: { input_tokens: 1, output_tokens: 1 },
};

async function sentHeaders(workspaceId?: string): Promise<Headers> {
  const fetch = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(REPLY), { headers: { 'content-type': 'application/json' }, status: 200 }),
  );
  const client = new Anthropic({ ...buildAnthropicOptions({ apiKey: 'test-key', workspaceId }), fetch });
  await client.messages.create({
    max_tokens: 16,
    messages: [{ content: 'hi', role: 'user' }],
    model: 'claude-haiku-5-5',
  });
  return new Headers(fetch.mock.calls[0]?.[1]?.headers);
}

describe('buildAnthropicOptions', () => {
  it('sends anthropic-workspace-id when a workspace id is given', async () => {
    const headers = await sentHeaders('wrkspc_test');

    expect(headers.get('anthropic-workspace-id')).toBe('wrkspc_test');
    expect(headers.get('x-api-key')).toBe('test-key');
  });

  it('sends no workspace header without a workspace id', async () => {
    const headers = await sentHeaders(undefined);

    expect(headers.has('anthropic-workspace-id')).toBe(false);
  });
});
