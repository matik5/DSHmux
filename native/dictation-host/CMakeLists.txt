cmake_minimum_required(VERSION 3.20)

project(dsh-dictation-host LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(WHISPER_CPP_DIR "$ENV{WHISPER_CPP_DIR}" CACHE PATH "Path to a whisper.cpp checkout")
if(NOT WHISPER_CPP_DIR OR NOT EXISTS "${WHISPER_CPP_DIR}/CMakeLists.txt")
    message(FATAL_ERROR "Set WHISPER_CPP_DIR to a whisper.cpp v1.9.2 checkout")
endif()

if(CMAKE_C_COMPILER_ID MATCHES "Clang|GNU")
    add_compile_options(
        "-ffile-prefix-map=${WHISPER_CPP_DIR}=whisper.cpp"
        "-ffile-prefix-map=${CMAKE_SOURCE_DIR}=dshmux/native/dictation-host"
        "-ffile-prefix-map=${CMAKE_BINARY_DIR}=build"
    )
endif()

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "Build a portable target-architecture binary" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)

add_subdirectory("${WHISPER_CPP_DIR}" whisper-build EXCLUDE_FROM_ALL)

find_package(SDL2 CONFIG REQUIRED)

add_executable(dsh-dictation-host src/main.cpp)
target_link_libraries(dsh-dictation-host PRIVATE whisper SDL2::SDL2)

if(MSVC)
    target_compile_options(dsh-dictation-host PRIVATE /W4 /permissive-)
else()
    target_compile_options(dsh-dictation-host PRIVATE -Wall -Wextra -Wpedantic)
endif()
