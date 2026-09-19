#include "jev_client.h"

#include <chrono>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <stdexcept>

int main(int argc, char* argv[]) {
    if (argc > 2 || (argc == 2 && std::string(argv[1]) == "--help")) {
        std::cout << "Usage: JevTactics [request.json]\n"
                     "No file: run the built-in combat decision.\n"
                     "Optional environment variable: JEV_BACKEND_URL (default http://127.0.0.1:3001)\n";
        return argc > 2 ? 1 : 0;
    }
    try {
        // Replace these sample numbers with values from your game's unit.
        jev::Json state = {
            {"unit", {{"hp", 8}, {"maxHp", 100}, {"healingPotions", 0}}},
            {"nearbyEnemies", 3}, {"escapeRouteOpen", true}
        };
        jev::Json questions = {
            {"retreat", {{"type", "boolean"}, {"instructions", "Should this unit retreat to survive?"}}},
            {"action", {
                {"type", "choice"}, {"instructions", "Choose the safest legal action using the available resources."},
                {"criteria", {{"attack", "Fight nearby enemies"}, {"retreat", "Move away along the escape route"}}}
            }},
            {"danger", {
                {"type", "score"}, {"instructions", "Rate the danger to the unit."},
                {"criteria", jev::Json::array({"safe", "threatened", "critical"})}
            }}
        };
        if (argc == 2) {
            std::ifstream file(argv[1]);
            if (!file) throw std::runtime_error(std::string("Cannot open request file: ") + argv[1]);
            const auto request = jev::Json::parse(file);
            state = request.at("state");
            questions = request.at("questions");
        }
        const char* configuredUrl = std::getenv("JEV_BACKEND_URL");
        const std::string url = configuredUrl ? configuredUrl : "http://127.0.0.1:3001";
        std::cout << "[Jev] Sending " << questions.size() << " question(s) to " << url << '\n'
                  << "[State] " << state.dump() << std::endl;
        const auto start = std::chrono::steady_clock::now();
        const auto answers = jev::evaluate(state, questions, url);
        const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start);
        std::cout << "[Jev] Answered in " << elapsed.count() << " ms\n";
        for (const auto& [name, answer] : answers.items()) {
            std::cout << "[Answer] " << name << ": " << answer.dump() << '\n';
        }
        // This threshold is a game rule, not a rule imposed by Jev.
        if (answers.contains("retreat") && answers.at("retreat").value("type", "") == "boolean") {
            const double probability = answers.at("retreat").at("probability").get<double>();
            std::cout << "[Game] " << (probability >= 0.75 ? "RETREAT" : "HOLD")
                      << " (retreat threshold = 0.75)\n";
        }
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "[Error] " << error.what() << '\n'
                  << "[Game] AI unavailable; keep the existing game decision.\n";
        return 1;
    }
}
