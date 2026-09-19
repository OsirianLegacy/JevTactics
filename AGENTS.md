# Project working instructions

## Roles and design authority

- The user is the Designer; Codex is the programmer.
- Read `DesignDoc.md` before working on simulation or AI behavior.
- Discuss the Entity/Grid/World foundation before implementing it. The initial documentation request does not authorize simulation code changes.
- Distinguish confirmed requirements from proposals. Do not turn unresolved proposals into accepted gameplay rules.
- Update `DesignDoc.md` as decisions are agreed. Update this file when build, launch, verification, or project conventions change.
- Preserve unrelated working-tree changes. Do not overwrite or revert existing user work.

## Current project

- C++20 console executable: `JevTactics`.
- `main.cpp`: sample state, questions, and printed Jev decision; currently makes one request and exits.
- `jev_client.h/.cpp`: HTTP/JSON client for the local backend.
- `backend/server.mjs`: Node backend calling Jev through Vercel Gateway.
- `HOWTO.md` and `backend/README.md`: detailed setup and request contract.
- No graphical game or Entity/Grid/World simulation is implemented yet.

## Build and launch

Run commands from the project root. Requirements: CMake 4.1+, C++20 compiler, libcurl, nlohmann_json 3.11+, and Node 22+.

Initial backend setup, or after dependency changes:

```sh
npm ci
```

Start the backend in one terminal:

```sh
npm start
```

The backend reads `AI_GATEWAY_API_KEY` from the root `.env`. Never print credentials, commit them, or place them in C++ code. Real Jev evaluations consume Gateway credits.

Build and launch in a second terminal:

```sh
cmake -S . -B build
cmake --build build
./build/JevTactics
```

Optional request file:

```sh
./build/JevTactics backend/examples/dialogue.json
```

In CLion, reload CMake, select the `JevTactics` target, and Run with the backend already started. Use the project root as the working directory for relative request paths.

Backend default: `http://127.0.0.1:3001`. For another port, set `PORT` for the backend and the matching `JEV_BACKEND_URL` for C++. `GET /health` checks the backend without contacting Jev.

## Verification

After building, run relevant existing tests:

```sh
npm test
ctest --test-dir build --output-on-failure
```

These tests use fake evaluators and do not require an API key or spend credits. They verify integration, not AI decision quality. Launch commands above are taken from source and existing project documentation; they were not executed during the initial design-only task.

## Implementation guidance

- Keep simulation state and numerical rules in C++; Jev supplies decisions through the existing JSON interface.
- The backend does not persist entity memories; explicitly include relevant memories in state snapshots.
- Preserve a fallback when Jev is unavailable. The current demo reports failure and exits with code 1.
- `jev::evaluate` is synchronous and may block for 35 seconds. A future graphical loop must not call it on the rendering thread.
- Validate AI-selected actions against game rules before applying them.
- Send only observer-appropriate information; distinguish remembered observations from current visible facts.
