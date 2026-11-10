// Tiny stand-in for Unity, used by scripts/test-native.sh when the tests are compiled without
// PlatformIO (any C++17 compiler: g++, clang++, `zig c++`). `pio test -e native` uses real Unity.
#pragma once
#include <math.h>
#include <stdio.h>
#include <string.h>

static int shim_fail = 0, shim_count = 0, shim_cur_fail = 0;
static const char *shim_name = "";

#define SHIM_FAIL(msg, line)                                         \
  do {                                                               \
    printf("  FAIL %s (line %d): %s\n", shim_name, (int)(line), msg); \
    shim_cur_fail = 1;                                               \
    return;                                                          \
  } while (0)

#define TEST_ASSERT_TRUE(c) \
  if (!(c)) SHIM_FAIL(#c, __LINE__)
#define TEST_ASSERT_FALSE(c) \
  if (c) SHIM_FAIL("!(" #c ")", __LINE__)
#define TEST_ASSERT_EQUAL(a, b) \
  if ((long)(a) != (long)(b)) SHIM_FAIL(#a " == " #b, __LINE__)
#define TEST_ASSERT_EQUAL_INT(a, b) TEST_ASSERT_EQUAL(a, b)
#define TEST_ASSERT_FLOAT_WITHIN(d, e, a) \
  if (fabs((double)(a) - (double)(e)) > (d)) SHIM_FAIL(#a " ~ " #e, __LINE__)
#define TEST_ASSERT_EQUAL_STRING(a, b) \
  if (strcmp((a), (b)) != 0) SHIM_FAIL(#a " == " #b, __LINE__)

#define UNITY_BEGIN() (shim_fail = 0, shim_count = 0)
#define UNITY_END() (printf("%d tests, %d failed\n", shim_count, shim_fail), shim_fail)
#define RUN_TEST(fn)                      \
  do {                                    \
    shim_name = #fn;                      \
    shim_cur_fail = 0;                    \
    setUp();                              \
    fn();                                 \
    tearDown();                           \
    shim_count++;                         \
    if (shim_cur_fail) shim_fail++;       \
    else printf("  ok   %s\n", #fn);      \
  } while (0)
