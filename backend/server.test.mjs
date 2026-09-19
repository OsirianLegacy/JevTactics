import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createBackend } from './server.mjs';

test('HTTP contract accepts different structures and rejects invalid requests', async t => {
  const calls = [];
  const server = createBackend(async input => {
    calls.push(input);
    if (input.state === 'fail') throw new Error('private upstream details');
    return { answers: { test: { type: 'boolean', probability: 0.85 } } };
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = body => fetch(`${base}/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal(calls.length, 0);
  for (const name of ['combat', 'dialogue']) {
    const body = await readFile(new URL(`examples/${name}.json`, import.meta.url), 'utf8');
    const response = await post(body);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).answers.test.probability, 0.85);
    assert.deepEqual(calls.at(-1).state, JSON.parse(body).state);
    assert.deepEqual(calls.at(-1).questions, JSON.parse(body).questions);
    assert.equal(calls.at(-1).model, 'typesafe-ai/jev');
  }
  for (const body of ['{', '{}', JSON.stringify({ state: 'x', questions: { x: { type: 'choice', instructions: 'Pick' } } })]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post(JSON.stringify({ state: 'x'.repeat(66000) }))).status, 413);
  assert.equal(calls.length, 2);
  assert.equal((await fetch(`${base}/evaluate`)).status, 405);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  const failed = await post(JSON.stringify({ state: 'fail', questions: { x: { type: 'boolean', instructions: 'Test' } } }));
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes('private upstream details'));
});
