// Runs the compiled C++ client against the real backend with a fake evaluator.
// No API key or Gateway credits are used.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createBackend } from './server.mjs';

const executable = process.argv[2];
const run = promisify(execFile);
let failure = false;
let lastRequest;
const server = createBackend(async request => {
  lastRequest = request;
  if (failure) throw new Error('Test upstream failure');
  const answers = Object.fromEntries(Object.entries(request.questions).map(([name, question]) => {
    if (question.type === 'boolean') return [name, { type: 'boolean', probability: 0.85 }];
    if (question.type === 'choice') return [name, { type: 'choice', choice: Object.keys(question.criteria)[0], probabilities: {} }];
    return [name, { type: 'score', score: 2, probabilities: {} }];
  }));
  return { answers };
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const invoke = (args = [], backendUrl = url) => run(executable, args, {
  env: { ...process.env, JEV_BACKEND_URL: backendUrl }, timeout: 45000,
});
try {
  const combat = await invoke();
  assert.match(combat.stdout, /\[Game\] RETREAT/);
  assert.match(combat.stdout, /\[Answer\] action:/);
  assert.match(combat.stdout, /\[Answer\] danger:/);
  assert.equal(lastRequest.state.unit.hp, 8);
  const dialogue = await invoke([fileURLToPath(new URL('./examples/dialogue.json', import.meta.url))]);
  assert.match(dialogue.stdout, /\[Answer\] questOffer:/);
  assert.match(dialogue.stdout, /\[Answer\] intent:/);
  assert.equal(lastRequest.state.speaker, 'merchant');
  failure = true;
  await assert.rejects(invoke(), error => error.code === 1 && /Backend HTTP 502/.test(error.stderr));
  console.log('PASS: C++ combat, dialogue, response parsing, and upstream failure');
} finally {
  await new Promise(resolve => server.close(resolve));
}
await assert.rejects(invoke(), error => error.code === 1 && /Backend connection failed/.test(error.stderr));
console.log('PASS: backend unavailable');

const invalid = createServer((req, res) => res.end('not JSON'));
invalid.listen(0, '127.0.0.1');
await once(invalid, 'listening');
try {
  await assert.rejects(invoke([], `http://127.0.0.1:${invalid.address().port}`),
    error => error.code === 1 && /invalid JSON/.test(error.stderr));
  console.log('PASS: malformed backend response');
} finally {
  await new Promise(resolve => invalid.close(resolve));
}
