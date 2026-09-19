#include "jev_client.h"

#include <curl/curl.h>
#include <memory>
#include <stdexcept>

namespace {
struct CurlRuntime {
    CurlRuntime() {
        if (curl_global_init(CURL_GLOBAL_DEFAULT) != CURLE_OK)
            throw std::runtime_error("Could not initialize HTTP library.");
    }
    ~CurlRuntime() { curl_global_cleanup(); }
};

std::size_t receive(char* data, std::size_t size, std::size_t count, void* context) noexcept {
    auto& body = *static_cast<std::string*>(context);
    const auto bytes = size * count;
    try {
        if (bytes > 1024 * 1024 || body.size() > 1024 * 1024 - bytes) return 0;
        body.append(data, bytes);
        return bytes;
    } catch (...) { return 0; } // Never throw through a C callback.
}
}

jev::Json jev::evaluate(const Json& state, const Json& questions, const std::string& backendUrl) {
    static CurlRuntime runtime;
    std::unique_ptr<CURL, decltype(&curl_easy_cleanup)> handle(curl_easy_init(), curl_easy_cleanup);
    std::unique_ptr<curl_slist, decltype(&curl_slist_free_all)> headers(
        curl_slist_append(nullptr, "Content-Type: application/json"), curl_slist_free_all);
    if (!handle || !headers) throw std::runtime_error("Could not create HTTP request.");

    auto base = backendUrl;
    while (!base.empty() && base.back() == '/') base.pop_back();
    const auto url = base + "/evaluate";
    const auto request = Json{{"state", state}, {"questions", questions}}.dump();
    if (request.size() > 65536) throw std::runtime_error("Jev request exceeds the backend's 64 KiB limit.");
    std::string response;
    char error[CURL_ERROR_SIZE]{};
    curl_easy_setopt(handle.get(), CURLOPT_URL, url.c_str());
    curl_easy_setopt(handle.get(), CURLOPT_HTTPHEADER, headers.get());
    curl_easy_setopt(handle.get(), CURLOPT_POSTFIELDS, request.c_str());
    curl_easy_setopt(handle.get(), CURLOPT_POSTFIELDSIZE_LARGE, static_cast<curl_off_t>(request.size()));
    curl_easy_setopt(handle.get(), CURLOPT_WRITEFUNCTION, receive);
    curl_easy_setopt(handle.get(), CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(handle.get(), CURLOPT_ERRORBUFFER, error);
    curl_easy_setopt(handle.get(), CURLOPT_CONNECTTIMEOUT, 3L);
    curl_easy_setopt(handle.get(), CURLOPT_TIMEOUT, 35L);
    curl_easy_setopt(handle.get(), CURLOPT_NOSIGNAL, 1L);
    const auto status = curl_easy_perform(handle.get());
    if (status != CURLE_OK)
        throw std::runtime_error(std::string("Backend connection failed: ") +
                                 (error[0] ? error : curl_easy_strerror(status)) +
                                 ". Make sure npm start is running.");
    long httpStatus = 0;
    curl_easy_getinfo(handle.get(), CURLINFO_RESPONSE_CODE, &httpStatus);
    const auto result = Json::parse(response, nullptr, false);
    if (httpStatus < 200 || httpStatus >= 300) {
        const auto detail = result.is_object() && result.contains("error") && result["error"].is_string()
            ? result["error"].get<std::string>() : "Unexpected backend response.";
        throw std::runtime_error("Backend HTTP " + std::to_string(httpStatus) + ": " + detail);
    }
    if (!result.is_object() || !result.contains("answers") || !result["answers"].is_object())
        throw std::runtime_error("Backend returned invalid JSON or missing answers.");
    return result.at("answers");
}
