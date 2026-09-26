import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from './route';
import { READ_SCOPE, WRITE_SCOPE } from './scopes';

type Tool = { title?: string; enabled: boolean; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } };

function toolsFor(scope: string) {
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
  // The SDK keeps its tool table private; reading it is the only way to see
  // what tools/list would answer without a transport.
  return (server as unknown as { _registeredTools: Record<string, Tool> })._registeredTools;
}

test('every tool carries a title and the annotation its verb calls for', () => {
  const tools = toolsFor(`${READ_SCOPE} ${WRITE_SCOPE}`);
  assert.ok(Object.keys(tools).length >= 36);
  for (const [name, tool] of Object.entries(tools)) {
    assert.ok(tool.title, `${name} has no title`);
    const readOnly = tool.annotations?.readOnlyHint === true;
    const destructive = tool.annotations?.destructiveHint === true;
    assert.ok(readOnly || tool.annotations?.destructiveHint !== undefined, `${name} declares neither hint`);
    if (/^(get|find|list)_/.test(name)) assert.ok(readOnly, `${name} should be readOnlyHint`);
    if (/^delete_/.test(name)) assert.ok(destructive && !readOnly, `${name} should be destructiveHint`);
    if (!/^(get|find|list)_/.test(name)) assert.ok(!readOnly, `${name} writes but claims readOnlyHint`);
  }
  assert.equal(tools.update_note.annotations?.destructiveHint, true);
});

test('a read-and-write grant exposes every tool', () => {
  const tools = toolsFor(`${READ_SCOPE} ${WRITE_SCOPE}`);
  assert.ok(Object.values(tools).every((tool) => tool.enabled));
});

test('a read-only grant exposes only the read-only tools', () => {
  const tools = toolsFor(READ_SCOPE);
  for (const [name, tool] of Object.entries(tools)) {
    assert.equal(tool.enabled, tool.annotations?.readOnlyHint === true, name);
  }
  assert.equal(tools.delete_course.enabled, false);
  assert.equal(tools.get_tasks.enabled, true);
});
