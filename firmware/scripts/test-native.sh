#!/usr/bin/env sh
# Host unit tests for lib/engine without PlatformIO. Uses $CXX, else g++, clang++ or `zig c++`.
#   sh scripts/test-native.sh
set -e
cd "$(dirname "$0")/.."
CXX="${CXX:-$(command -v g++ || command -v clang++ || echo 'zig c++')}"
mkdir -p .pio/native-test
$CXX -std=c++17 -O1 -Wall -Wextra -DRP_SHIM -Ilib/engine/src -Itest/test_engine \
  lib/engine/src/engine.cpp test/test_engine/test_main.cpp -o .pio/native-test/engine_tests
./.pio/native-test/engine_tests
