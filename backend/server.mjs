import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { experimental_evaluate as evaluate } from 'ai';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = value => typeof value === 'string' && value.trim().length > 0;

function validate(body) {
  if (!record(body) || !(typeof body.state === 'string' || record(body.state) || Array.isArray(body.state))) {
    return 'state must be a string, object, or array.';
  }
  if (!record(body.questions) || Object.keys(body.questions).length === 0 || Object.keys(body.questions).length > 32) {
    return 'questions must contain between 1 and 32 named questions.';
  }
  for (const [name, question] of Object.entries(body.questions)) {
    if (!label(name) || !record(question) || !label(question.instructions)) return 'Each question needs a name and instructions.';
    const { type, criteria } = question;
    if (type === 'boolean') {
      if (criteria !== undefined && (!record(criteria) || !label(criteria.true) || !label(criteria.false))) {
        return `${name}: boolean criteria must describe true and false.`;
      }
    } else if (type === 'choice') {
      if (!record(criteria) || Object.keys(criteria).length < 2 || !Object.entries(criteria).every(([k, v]) => label(k) && label(v))) {
        return `${name}: choice criteria must map at least two option names to descriptions.`;
      }
    } else if (type === 'score') {
      if (!Array.isArray(criteria) || criteria.length < 2 || !criteria.every(label)) return `${name}: score criteria need at least two labels, lowest to highest.`;
    } else return `${name}: type must be boolean, choice, or score.`;
  }
}

export function createBackend(evaluateRequest = evaluate) {
  return createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/health' && req.method === 'GET') return reply(200, { ok: true });
    if (req.url !== '/evaluate') return reply(404, { error: 'Unknown endpoint.' });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return reply(405, { error: 'Use POST /evaluate.' });
    }
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      return reply(415, { error: 'Send Content-Type: application/json.' });
    }
    let body;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) {
          reply(413, { error: 'Request exceeds 64 KiB.' });
          return;
        }
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return reply(400, { error: 'Request must contain valid JSON.' });
    }
    const error = validate(body);
    if (error) return reply(400, { error });
    try {
      const result = await evaluateRequest({
        model: 'typesafe-ai/jev',
        state: body.state,
        questions: body.questions,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(30000),
      });
      reply(200, { answers: result.answers });
    } catch (error) {
      // Do not return SDK error objects: they can include private request data.
      const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      reply(timeout ? 504 : 502, { error: timeout ? 'Jev request timed out.' : 'Jev request failed. Check Gateway credentials, credits, and availability.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Set AI_GATEWAY_API_KEY in .env first.');
  const port = Number(process.env.PORT || 3001);
  createBackend().listen(port, '127.0.0.1', () => {
    console.log(`Jev backend listening at http://127.0.0.1:${port}`);
  });
}
