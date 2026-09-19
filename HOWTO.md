# Using Jev in JevTactics

The system has two programs: your C++ game and a small Node backend. Both run on your computer. C++ sends JSON to the backend; the backend calls Jev through Vercel and returns JSON answers. The current demo prints logs only and exits after one request.

## 1. Start the backend

Open a terminal in the project folder:

```sh
cd "/Users/boss/CLionProjects/Jev Games/JevTactics"
npm ci
npm start
```

`npm ci` is needed for initial setup or when dependencies change. Your existing `.env` file must contain `AI_GATEWAY_API_KEY=your_key`. Only the backend reads it. Leave this terminal running; Ctrl+C stops the backend. Actual Jev requests consume Gateway credits.

## 2. Build and run C++

Open a second terminal in the project folder:

```sh
cmake -S . -B build
cmake --build build
./build/JevTactics
```

The required C++ libraries (libcurl for HTTP and nlohmann_json for JSON) were already present on this Mac. On another Mac with Homebrew, install them with `brew install curl nlohmann-json` if CMake cannot find them. A C++20 compiler and CMake 4.1+ are required by this project; Node 22+ runs the backend.

In CLion, reload the CMake project, select `JevTactics`, and click Run after starting the backend. The built-in example works regardless of CLion's working directory. No key needs to be added to CLion.

You will see logs similar to these (answers and timing vary):

```text
[Jev] Sending 3 question(s) to http://127.0.0.1:3001
[State] { ... }
[Jev] Answered in 180 ms
[Answer] retreat: {"probability":0.85,"type":"boolean"}
...
[Game] RETREAT (retreat threshold = 0.75)
```

## 3. Try a different request without rebuilding

Pass a JSON file as the program argument:

```sh
./build/JevTactics backend/examples/dialogue.json
./build/JevTactics backend/examples/combat.json
```

In CLion, use an absolute file path in Run Configuration > Program arguments, or set the working directory to the project root. Copy an example file and change it to experiment. Changes to JSON files do not require rebuilding; changes to C++ do.

Each request has the same envelope, but its contents can differ:

```json
{
  "state": { "hp": 8, "nearbyEnemies": 3 },
  "questions": {
    "retreat": {
      "type": "boolean",
      "instructions": "Should the unit retreat to survive?"
    }
  }
}
```

`state` describes the situation. It can be a string, object, or array. Put in the facts needed for the decision: health, inventory, terrain, available actions, or dialogue. Jev only knows the state and instructions you send; this backend does not maintain game memory between calls.

`questions` names the decisions you want. Names such as `retreat` or `questOffer` become keys in the returned answers. Multiple questions share the same state and can use different types. The backend allows up to 32 questions and 64 KiB per request.

## 4. Call from your game code

The reusable C++ interface is one function in `jev_client.h`:

```cpp
#include "jev_client.h"

int currentHp = 8; // Replace with the unit's actual health.
jev::Json state = {{"hp", currentHp}, {"nearbyEnemies", 3}};
jev::Json questions = {
    {"retreat", {
        {"type", "boolean"},
        {"instructions", "Should this unit retreat to survive?"}
    }}
};

try {
    const auto answers = jev::evaluate(state, questions);
    const double probability = answers.at("retreat").at("probability").get<double>();
    if (probability >= 0.75) {
        // Queue your game's retreat action here.
    }
} catch (const std::exception& error) {
    // Log the error and use your normal non-AI behavior for this turn.
}
```

The function returns the contents of `answers`, not the outer HTTP envelope. JSON is built with a library, so text is escaped correctly. There is no need to assemble JSON by concatenating strings.

## 5. Add new types of game decisions

Use one of these question definitions inside `questions`:

**Boolean — probability of yes:**

```json
"canTrust": {
  "type": "boolean",
  "instructions": "Based on the supplied history, is the NPC likely to keep their promise?"
}
```

Read `answers.at("canTrust").at("probability").get<double>()`. It ranges from 0 to 1; your game chooses the action threshold. The probability is the model's assessment, not a guarantee.

**Choice — pick from named actions:**

```json
"action": {
  "type": "choice",
  "instructions": "Choose the best legal action to preserve the unit.",
  "criteria": {
    "attack": "Attack the nearby enemy",
    "retreat": "Move to the safe tile"
  }
}
```

Read `answers.at("action").at("choice").get<std::string>()`. The response also includes `probabilities` for each option. Supply available actions and check the returned choice against your game's rules before executing it. Add healing as an option only when the unit can heal.

**Score — evaluate an ordered scale:**

```json
"danger": {
  "type": "score",
  "instructions": "How dangerous is the situation?",
  "criteria": ["safe", "threatened", "critical"]
}
```

Read `answers.at("danger").at("score").get<double>()`. This scale runs from 0 to 2 and can return fractional scores; it is not a percentage. It also includes probabilities for each scale position.

For another subsystem, create a new function that builds its own state and questions, calls `jev::evaluate`, then interprets its named answers. You usually do not need to modify the backend. `main.cpp` shows all three question types and prints every returned answer.

## 6. Integrate into the game loop

The demo deliberately makes one synchronous call. `jev::evaluate` can block for up to 35 seconds (including at most 3 seconds to connect). This is fine for this logs-only program. In a real-time game, call it on a worker thread or job queue, then apply the result on the game thread. Pass a snapshot of the state to the worker, and discard an answer if the unit died or the turn changed while waiting. Do not make a request every frame: request a decision at a turn or meaningful event and reuse it where appropriate.

The game owns rules and actions. Jev provides advice. Preserve a fallback decision when the backend is offline, times out, or returns an error. The demo logs that fallback and exits with code 1 on failure; success exits with 0. Avoid printing private player data when adapting the current state logs.

## 7. Troubleshooting and tests

- `Backend connection failed`: start `npm start` in a separate terminal. The default port is 3001.
- `Backend HTTP 400`: check your JSON state, question type, instructions, and criteria.
- `Backend HTTP 502`: check your key, credits, and Vercel Gateway availability. The backend intentionally does not expose raw provider errors.
- `Backend HTTP 504`: the Jev request exceeded the backend's 30-second timeout; use the fallback.
- `Cannot open request file`: check the file path and working directory.
- CMake cannot find a library: install the missing development package and reload CMake.

If port 3001 is occupied, use matching settings in your two terminals:

```sh
PORT=3002 npm start
```

```sh
JEV_BACKEND_URL=http://127.0.0.1:3002 ./build/JevTactics
```

Run tests without an API key or spending credits:

```sh
npm test
ctest --test-dir build --output-on-failure
```

The C++ integration test starts a temporary local backend with fake answers and checks combat, dialogue, provider failures, an unavailable backend, and malformed responses. Fake answers prove the connection works; they do not evaluate Jev's decision quality.

Files: `main.cpp` is the demo/game starting point; `jev_client.h/.cpp` handles communication; `backend/server.mjs` calls Jev; `backend/examples/` contains editable requests. The backend remains local to this computer. Hosting it for players is a separate deployment step requiring authentication and usage limits; keep the Gateway key on that server.

Reference: https://vercel.com/docs/ai-gateway/modalities/evaluation
