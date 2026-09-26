import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from './route';
import { READ_SCOPE, WRITE_SCOPE } from './scopes';
import { PROMPTS } from '@/app/docs/tools';

type Reply = { id?: number; result?: Record<string, any>; error?: { message: string } };

/**
 * A client in all but name: raw JSON-RPC over the SDK's in-memory pair, so
 * this sees exactly what Claude sees on connecting, without a network.
 */
async function connect(scope: string) {
  const server = createServer({
    v: 1,
    kind: 'access',
    iat: 0,
    exp: 0,
    clientId: 'test',
    scope,
    userId: 'user-1',
    supabaseAccessToken: 'unused',
  });
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (reply: Reply) => void>();
  client.onmessage = (message) => {
    const reply = message as Reply;
    if (typeof reply.id === 'number') pending.get(reply.id)?.(reply);
  };
  await server.connect(serverSide);
  await client.start();
  let next = 0;
  const call = (method: string, params: unknown = {}) =>
    new Promise<Reply>((resolve) => {
      const id = ++next;
      pending.set(id, resolve);
      void client.send({ jsonrpc: '2.0', id, method, params } as never);
    });
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  await client.send({ jsonrpc: '2.0', method: 'notifications/initialized' } as never);
  return { init, call };
}

test('the server introduces itself with a map, and get_briefing is the first tool', async () => {
  const { init, call } = await connect(`${READ_SCOPE} ${WRITE_SCOPE}`);
  const instructions = String(init.result?.instructions ?? '');
  assert.match(instructions, /Start with get_briefing/);
  assert.match(instructions, /complete_tasks/);
  const tools = (await call('tools/list')).result?.tools as { name: string }[];
  assert.equal(tools[0].name, 'get_briefing');
});

test('the server carries the app icon, as absolute URLs off the site', async () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://akada.test/';
  try {
    const { init } = await connect(READ_SCOPE);
    const info = init.result?.serverInfo as { name: string; websiteUrl?: string; icons?: { src: string }[] };
    assert.equal(info.name, 'Akada');
    assert.equal(info.websiteUrl, 'https://akada.test');
    assert.deepEqual(info.icons?.map((i) => i.src), [
      'https://akada.test/icon.svg',
      'https://akada.test/icon-192.png',
      'https://akada.test/icon-512.png',
    ]);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test('every prompt is offered on a full grant, and the writing ones are held back on a read-only one', async () => {
  const full = await connect(`${READ_SCOPE} ${WRITE_SCOPE}`);
  const listed = (await full.call('prompts/list')).result?.prompts as { name: string; title: string }[];
  assert.deepEqual(listed.map((p) => p.name).sort(), ['exam_prep', 'import_outline', 'log_sitting', 'plan_week', 'recall_round', 'study_now']);
  // /docs lists them by the same names and titles Claude shows.
  assert.deepEqual(
    PROMPTS.map((p) => [p.name, p.title]).sort(),
    listed.map((p) => [p.name, p.title]).sort(),
  );

  const readOnly = await connect(READ_SCOPE);
  const offered = ((await readOnly.call('prompts/list')).result?.prompts as { name: string }[]).map((p) => p.name).sort();
  assert.deepEqual(offered, PROMPTS.filter((p) => !p.writes).map((p) => p.name).sort());
});

test('a prompt names the course, the tools, and the rules that stop a model guessing', async () => {
  const { call } = await connect(`${READ_SCOPE} ${WRITE_SCOPE}`);
  const text = (name: string, args: Record<string, string> = {}) =>
    call('prompts/get', { name, arguments: args }).then((r) => String(r.result?.messages?.[0]?.content?.text ?? ''));

  const outline = await text('import_outline', { course: 'MATH 101' });
  assert.match(outline, /Find "MATH 101" with find_course/);
  assert.match(outline, /Do not call any tool.*until a file is actually attached/s);
  assert.match(outline, /kind exam with its weight/);

  const recall = await text('recall_round', { course: 'POL 100' });
  assert.match(recall, /Wait for my answer/);
  assert.match(recall, /record_recall/);
  assert.doesNotMatch(await text('recall_round'), /find_course/);

  assert.match(await text('study_now', { minutes: '45' }), /45 minutes/);
  assert.match(await text('study_now', { minutes: 'ages' }), /some time/);
});
