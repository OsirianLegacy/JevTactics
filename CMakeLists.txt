cmake_minimum_required(VERSION 4.1)
project(JevTactics)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Include the usual Homebrew locations when configuring from CLion on macOS.
if(APPLE)
    list(APPEND CMAKE_PREFIX_PATH /opt/homebrew /usr/local)
endif()
find_package(CURL REQUIRED)
find_package(nlohmann_json 3.11 REQUIRED)

add_executable(JevTactics main.cpp jev_client.cpp)
target_link_libraries(JevTactics PRIVATE CURL::libcurl nlohmann_json::nlohmann_json)

include(CTest)
if(BUILD_TESTING)
    find_program(NODE_EXECUTABLE node)
    if(NODE_EXECUTABLE)
        add_test(NAME cpp_backend_integration
            COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/backend/cpp.test.mjs" "$<TARGET_FILE:JevTactics>")
        set_tests_properties(cpp_backend_integration PROPERTIES TIMEOUT 60)
    endif()
endif()
