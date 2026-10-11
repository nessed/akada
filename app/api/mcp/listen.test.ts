import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpHandler, InMemoryServerEventBus, McpServer, PROTOCOL_VERSION_META_KEY } from '@modelcontextprotocol/server';
import { endListenAfterAcknowledgement, listenRequestId } from './listen';

const REVISION = '2026-07-28';
const SERVER = { name: 'akada', version: '1.0.0' };

// The same handler shape route.ts builds, against a server with no tools:
// what matters is how the SDK serves the listen stream, not what is on it.
const bus = new InMemoryServerEventBus();
const handler = createMcpHandler(() => new McpServer(SERVER), { responseMode: 'json', bus });

function listen(id: number | string, extraMeta: Record<string, unknown> = {}) {
  return new Request('https://akada.test/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': REVISION,
      'mcp-method': 'subscriptions/listen',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'subscriptions/listen',
      params: {
        notifications: { toolsListChanged: true },
        _meta: {
          [PROTOCOL_VERSION_META_KEY]: REVISION,
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
          ...extraMeta,
        },
      },
    }),
  });
}

/** Everything the stream says, or null if it is still open after `ms`. */
async function readAll(response: Response, ms = 1000): Promise<string | null> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + ms;
  for (;;) {
    const left = deadline - Date.now();
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, left))),
    ]);
    if (chunk === null) {
      await reader.cancel();
      return null;
    }
    if (chunk.done) return text;
    text += decoder.decode(chunk.value, { stream: true });
  }
}

function frames(text: string) {
  return text
    .split('\n\n')
    .filter((frame) => frame.startsWith('event: message'))
    .map((frame) => JSON.parse(frame.slice(frame.indexOf('data: ') + 6)) as Record<string, unknown>);
}

test('the SDK on its own holds a listen stream open', async () => {
  const response = await handler.fetch(listen(1));
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(await readAll(response, 300), null);
  // Cancelling it is what lets the SDK let go.
  assert.equal(bus.listenerCount, 0);
});

test('a listen stream is acknowledged, completed and closed', async () => {
  const request = listen(7);
  const id = await listenRequestId(request);
  assert.equal(id, 7);
  const response = endListenAfterAcknowledgement(await handler.fetch(request), 7, SERVER);
  assert.equal(response.status, 200);
  const text = await readAll(response);
  assert.notEqual(text, null, 'the stream should end by itself');
  const [ack, complete, ...rest] = frames(text!);
  assert.equal(ack.method, 'notifications/subscriptions/acknowledged');
  assert.deepEqual(complete, {
    jsonrpc: '2.0',
    id: 7,
    result: {
      resultType: 'complete',
      _meta: { 'io.modelcontextprotocol/subscriptionId': 7, 'io.modelcontextprotocol/serverInfo': SERVER },
    },
  });
  assert.equal(rest.length, 0);
  // The SDK's side was cancelled too, so its listener and keepalive are gone.
  assert.equal(bus.listenerCount, 0);
});

test('a refused listen request passes through as the SDK wrote it', async () => {
  const request = listen('x', { 'io.modelcontextprotocol/clientCapabilities': undefined });
  const upstream = await handler.fetch(request);
  const response = endListenAfterAcknowledgement(upstream, 'x', SERVER);
  assert.equal(response, upstream);
  assert.equal(response.headers.get('content-type'), 'application/json');
});

test('only a listen request is singled out, and the body stays readable', async () => {
  const call = new Request('https://akada.test/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  assert.equal(await listenRequestId(call), undefined);
  assert.equal(((await call.json()) as { method: string }).method, 'tools/list');

  const garbage = new Request('https://akada.test/api/mcp', { method: 'POST', body: 'not json' });
  assert.equal(await listenRequestId(garbage), undefined);
  assert.equal(await garbage.text(), 'not json');
});
