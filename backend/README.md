# Local Jev backend

Run commands from the JevTactics project root. This is a separate Node process alongside the C++ program.

```sh
npm install
npm start
```

The existing root `.env` provides `AI_GATEWAY_API_KEY`. Keep this key out of C++ and version control.

Leave the server running. In a second terminal, send either example:

```sh
curl http://127.0.0.1:3001/evaluate -H 'Content-Type: application/json' --data-binary @backend/examples/combat.json
curl http://127.0.0.1:3001/evaluate -H 'Content-Type: application/json' --data-binary @backend/examples/dialogue.json
```

Each call uses Gateway credits. Stop the server with Ctrl+C.

## Request contract

`POST /evaluate` accepts JSON containing `state` and `questions`.

- `state`: any string, object, or array describing the situation. Different requests may use entirely different structures.
- `questions`: a map of names you choose to question definitions. Each needs `type` and `instructions`.
- `boolean`: returns `probability` of true. Optional `criteria` describes `true` and `false`.
- `choice`: requires `criteria`, a map of option names to descriptions. Returns `choice` and `probabilities`.
- `score`: requires `criteria`, an array of labels from lowest to highest. Returns `score` on the zero-based scale and `probabilities`.

Response: `{ "answers": { ... } }`, preserving your question names. You can mix question types in a request. To add a new decision, change the JSON, not the server. The model remains fixed to Jev.

The C++ client in `jev_client.cpp` POSTs this JSON and reads the response. See `../HOWTO.md` for building, running, and expanding it. It needs only the local URL, not the Gateway key. Requests block for up to 35 seconds; run them off the rendering thread when integrating into a real-time game.

`GET /health` checks that the backend is running without contacting Jev. Validation errors return 400, oversized bodies 413, wrong content types 415, and upstream failures 502/504. Requests are limited to 64 KiB and 32 questions.

The server listens only on this computer (`127.0.0.1`). This is a local development backend, not a deployed Vercel service. Before making it accessible to other players, add authentication, per-user request limits, and server-owned game rules.

Run `npm test` for local HTTP tests with a fake evaluator; these tests do not spend credits.

API reference: https://vercel.com/docs/ai-gateway/modalities/evaluation
