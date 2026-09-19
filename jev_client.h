#pragma once

#include <nlohmann/json.hpp>
#include <string>

namespace jev {
using Json = nlohmann::json;

// Sends {state, questions} to the backend and returns the named answers.
// Blocks for at most 35 seconds. Throws std::runtime_error on failure.
// No Gateway key belongs in the C++ program.
Json evaluate(const Json& state, const Json& questions,
              const std::string& backendUrl = "http://127.0.0.1:3001");
}
