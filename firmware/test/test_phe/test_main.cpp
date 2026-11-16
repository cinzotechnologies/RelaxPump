// Host tests for the PHE engine (lib/engine/src/phe.*): 1, 2 and 5 lines
// (docs/two-module-system.md §4.2). A small "plant" raises a line's level while its valve is open
// and the PHE supply is on, and checks the invariants every tick:
//   - a valve is never open while its sensor is in error;
//   - a valve never stays open at or above `high`;
//   - the pump output (K1, not fitted) is never switched on.
//
//   pio test -e native                 (needs a host C++ compiler)
//   scripts/test-native.sh             (any C++17 compiler, no PlatformIO)
#ifdef RP_SHIM
#include "../test_engine/unity_shim.h"
#else
#include <unity.h>
#endif

#include <string>
#include <vector>

#include "phe.h"

using namespace rp;

struct Out : Outputs {
  bool v[MAX_TANKS] = {};
  bool pumpEver = false;
  int switches = 0;
  void valve(int i, bool on) override {
    if (v[i] != on) switches++;
    v[i] = on;
  }
  void pump(bool on) override { pumpEver |= on; }
};

struct Ev : Sink {
  std::vector<std::string> events;
  float litres[MAX_TANKS] = {};
  void event(const char *type, int tank, bool, float) override {
    events.push_back(std::string(type) + ":" + std::to_string(tank));
  }
  void usage(int tank, float, float l) override { litres[tank] += l; }
  int count(const std::string &e) const {
    int n = 0;
    for (auto &x : events) n += x == e;
    return n;
  }
  bool has(const std::string &e) const { return count(e) > 0; }
};

static int violations = 0;

struct Sim {
  PheEngine e;
  Out out;
  Ev sink;
  uint32_t t = 1000;
  float lvl[MAX_TANKS];
  float rate[MAX_TANKS];   // % per minute while the valve is open and water comes
  float leak[MAX_TANKS];   // % per minute with the valve closed (stuck / leaking valve)
  float use[MAX_TANKS];    // % per minute drawn by the house
  bool echo[MAX_TANKS];
  bool water = true;       // PHE supply on

  explicit Sim(int n, int start = 50) {
    PheLayout l;
    l.n = n;
    for (int i = 0; i < MAX_TANKS; i++) {
      l.line[i].litres = 1000;
      lvl[i] = start;
      rate[i] = 1.0f;
      leak[i] = 0;
      use[i] = 0;
      echo[i] = true;
    }
    e.begin(&out, &sink);
    e.setLayout(l, t);
    for (int k = 0; k < 3; k++) feed();
  }
  static float cmOf(float pct) { return 120 - pct / 100.0f * 90; }
  void feed() {
    for (int i = 0; i < MAX_TANKS; i++) e.reading(i, echo[i] ? cmOf(lvl[i]) : -1, t);
  }
  /** Advance `sec` seconds in 1 s steps. */
  void run(uint32_t sec) {
    for (uint32_t s = 0; s < sec; s++) {
      t += 1000;
      for (int i = 0; i < MAX_TANKS; i++) {
        float d = -use[i] / 60.0f;
        if (out.v[i] && water) d += rate[i] / 60.0f;
        if (!out.v[i]) d += leak[i] / 60.0f;
        lvl[i] += d;
        if (lvl[i] > 100) lvl[i] = 100;
        if (lvl[i] < 0) lvl[i] = 0;
      }
      feed();
      e.loop(t);
      for (int i = 0; i < MAX_TANKS; i++) {
        if (out.v[i] && !e.ok[i] && !e.testing()) violations++;
        if (out.v[i] && e.ok[i] && e.level[i] >= e.cfg.high + 1) violations++;
      }
      if (out.pumpEver) violations++;
    }
  }
  void min(uint32_t m) { run(m * 60); }
};

void setUp() { violations = 0; }
void tearDown() {}

// ------------------------------------------------------------------ boot
void test_boot_all_closed() {
  Sim s(5, 10);
  for (int i = 0; i < MAX_TANKS; i++) TEST_ASSERT_FALSE(s.out.v[i]);
  s.min(5);  // Auto is off after boot until set
  for (int i = 0; i < MAX_TANKS; i++) TEST_ASSERT_FALSE(s.out.v[i]);
  TEST_ASSERT_EQUAL(0, violations);
}

// ------------------------------------------------------------------ auto, 1 line
void test_auto_one_line_opens_below_low_closes_at_high() {
  Sim s(1, 60);
  s.e.cmdAuto(true, s.t);
  s.run(2);
  TEST_ASSERT_TRUE(s.out.v[0]);
  s.min(40);  // 1 %/min → reaches 95 %
  TEST_ASSERT_FALSE(s.out.v[0]);
  TEST_ASSERT_TRUE(s.sink.has("phe_full:0"));
  TEST_ASSERT_TRUE(s.e.level[0] >= 94);
  TEST_ASSERT_EQUAL(0, violations);
}

void test_auto_does_not_reopen_until_below_low() {
  Sim s(1, 60);
  s.e.cmdAuto(true, s.t);
  s.min(40);
  TEST_ASSERT_FALSE(s.out.v[0]);
  s.use[0] = 0.5f;  // house uses water
  s.min(10);        // ~95 → ~90: above 85, still closed
  TEST_ASSERT_FALSE(s.out.v[0]);
  s.min(12);        // below 85 → reopens
  TEST_ASSERT_TRUE(s.out.v[0]);
  TEST_ASSERT_EQUAL(0, violations);
}

// ------------------------------------------------------------------ 2 lines, independent
void test_two_lines_open_together() {
  Sim s(2, 40);
  s.e.cmdAuto(true, s.t);
  s.run(2);
  TEST_ASSERT_TRUE(s.out.v[0]);
  TEST_ASSERT_TRUE(s.out.v[1]);
  s.rate[1] = 3;
  s.min(20);  // line 2 full first
  TEST_ASSERT_FALSE(s.out.v[1]);
  TEST_ASSERT_TRUE(s.out.v[0]);
  TEST_ASSERT_EQUAL(0, violations);
}

// ------------------------------------------------------------------ 5 lines
void test_five_lines_all_valves_and_layout() {
  Sim s(5, 30);
  s.e.cmdAuto(true, s.t);
  s.run(2);
  for (int i = 0; i < 5; i++) TEST_ASSERT_TRUE(s.out.v[i]);
  TEST_ASSERT_EQUAL(5, s.e.valvesOn());
  s.min(80);
  for (int i = 0; i < 5; i++) TEST_ASSERT_FALSE(s.out.v[i]);
  TEST_ASSERT_EQUAL(5, s.sink.count("phe_full:0") + s.sink.count("phe_full:1") + s.sink.count("phe_full:2") +
                           s.sink.count("phe_full:3") + s.sink.count("phe_full:4"));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_lines_outside_layout_stay_closed() {
  Sim s(2, 30);
  s.e.cmdAuto(true, s.t);
  s.run(5);
  TEST_ASSERT_FALSE(s.out.v[2]);
  TEST_ASSERT_FALSE(s.out.v[4]);
  TEST_ASSERT_FALSE(s.e.cmdValve(3, true, s.t));
}

// ------------------------------------------------------------------ manual
void test_manual_open_closes_at_high() {
  Sim s(2, 90);
  TEST_ASSERT_TRUE(s.e.cmdValve(0, true, s.t));
  s.min(10);
  TEST_ASSERT_FALSE(s.out.v[0]);
  TEST_ASSERT_TRUE(s.sink.has("phe_full:0"));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_manual_open_refused_when_full() {
  Sim s(1, 97);
  TEST_ASSERT_FALSE(s.e.cmdValve(0, true, s.t));
  TEST_ASSERT_FALSE(s.out.v[0]);
}

void test_manual_close_held_while_auto() {
  Sim s(1, 40);
  s.e.cmdAuto(true, s.t);
  s.run(2);
  TEST_ASSERT_TRUE(s.out.v[0]);
  s.e.cmdValve(0, false, s.t);
  s.min(5);
  TEST_ASSERT_FALSE(s.out.v[0]);  // held, Auto does not reopen it
  s.e.cmdValve(0, true, s.t);
  s.run(1);
  TEST_ASSERT_TRUE(s.out.v[0]);
  s.e.cmdValve(0, false, s.t);
  s.e.cmdAuto(true, s.t);  // switching Auto clears the hold
  s.run(2);
  TEST_ASSERT_TRUE(s.out.v[0]);
}

// ------------------------------------------------------------------ fail safe
void test_sensor_loss_closes_valve_and_reports() {
  Sim s(2, 40);
  s.e.cmdAuto(true, s.t);
  s.run(2);
  TEST_ASSERT_TRUE(s.out.v[1]);
  s.echo[1] = false;
  s.run(30);
  TEST_ASSERT_FALSE(s.out.v[1]);
  TEST_ASSERT_TRUE(s.out.v[0]);  // other line keeps going
  TEST_ASSERT_EQUAL(1, s.sink.count("sensor:1"));
  s.run(60);
  TEST_ASSERT_EQUAL(1, s.sink.count("sensor:1"));  // once
  TEST_ASSERT_FALSE(s.e.cmdValve(1, true, s.t));
  s.echo[1] = true;
  s.run(3);
  TEST_ASSERT_TRUE(s.out.v[1]);  // Auto resumes from the sensor
  TEST_ASSERT_EQUAL(0, violations);
}

void test_no_reading_at_boot_keeps_closed() {
  Sim s(1, 20);
  s.echo[0] = false;
  PheEngine fresh;
  Out o;
  Ev ev;
  fresh.begin(&o, &ev);
  PheLayout l;
  fresh.setLayout(l, 0);
  fresh.cmdAuto(true, 0);
  for (uint32_t t = 0; t < 30000; t += 1000) {
    fresh.reading(0, -1, t);
    fresh.loop(t);
  }
  TEST_ASSERT_FALSE(o.v[0]);
}

// ------------------------------------------------------------------ rising / supply
void test_rising_and_flow_events() {
  Sim s(2, 40);
  s.e.cmdAuto(true, s.t);
  s.min(4);
  TEST_ASSERT_TRUE(s.e.rising[0]);
  TEST_ASSERT_TRUE(s.e.supply() == Supply::Flowing);
  TEST_ASSERT_EQUAL(1, s.sink.count("flow_start:-1"));
  s.water = false;  // supply stops
  s.min(12);
  TEST_ASSERT_FALSE(s.e.rising[0]);
  TEST_ASSERT_TRUE(s.e.supply() == Supply::Unknown);
  TEST_ASSERT_EQUAL(0, s.sink.count("flow_stop:-1"));  // debounced: not yet
  s.min(12);
  TEST_ASSERT_EQUAL(1, s.sink.count("flow_stop:-1"));
  s.min(15);
  TEST_ASSERT_TRUE(s.e.supply() == Supply::None);
  TEST_ASSERT_TRUE(s.out.v[0]);  // valve stays open, waiting for water
  s.water = true;
  s.min(4);
  TEST_ASSERT_TRUE(s.e.supply() == Supply::Flowing);
  TEST_ASSERT_EQUAL(2, s.sink.count("flow_start:-1"));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_flow_events_debounced() {
  Sim s(1, 40);
  s.e.cmdAuto(true, s.t);
  s.min(4);
  TEST_ASSERT_EQUAL(1, s.sink.count("flow_start:-1"));
  // Water flickers off/on in under 10 minutes: no extra events.
  for (int k = 0; k < 3; k++) {
    s.water = false;
    s.min(3);
    s.water = true;
    s.min(3);
  }
  TEST_ASSERT_EQUAL(1, s.sink.count("flow_start:-1"));
  TEST_ASSERT_EQUAL(0, s.sink.count("flow_stop:-1"));
}

void test_supply_none_after_30_min() {
  Sim s(1, 40);
  s.water = false;
  s.e.cmdAuto(true, s.t);
  s.run(2);
  TEST_ASSERT_TRUE(s.e.supply() == Supply::Unknown);  // not "none" the moment a valve opens
  s.min(29);
  TEST_ASSERT_TRUE(s.e.supply() == Supply::Unknown);
  s.min(2);
  TEST_ASSERT_TRUE(s.e.supply() == Supply::None);
  TEST_ASSERT_EQUAL(0, s.sink.count("flow_start:-1"));
}

// ------------------------------------------------------------------ overflow
void test_overflow_when_closed_valve_leaks() {
  Sim s(1, 60);
  s.e.cmdAuto(true, s.t);
  s.min(40);
  TEST_ASSERT_FALSE(s.out.v[0]);
  s.leak[0] = 0.5f;
  s.min(10);
  TEST_ASSERT_EQUAL(1, s.sink.count("overflow:0"));
  s.min(5);
  TEST_ASSERT_EQUAL(1, s.sink.count("overflow:0"));
}

void test_no_overflow_when_already_full_at_boot() {
  Sim s(1, 99);
  s.min(10);
  TEST_ASSERT_EQUAL(0, s.sink.count("overflow:0"));
}

// ------------------------------------------------------------------ usage, test, close all
void test_usage_litres_per_line() {
  Sim s(2, 50);
  s.e.cmdAuto(true, s.t);
  s.min(60);  // both 50 % → 95 %, 1000 L each
  TEST_ASSERT_FLOAT_WITHIN(60, 450, s.sink.litres[0]);
  TEST_ASSERT_FLOAT_WITHIN(60, 450, s.sink.litres[1]);
}

void test_valve_test_pulse() {
  Sim s(2, 97);
  TEST_ASSERT_TRUE(s.e.cmdTest(1, 2000, s.t));
  TEST_ASSERT_TRUE(s.out.v[1]);
  TEST_ASSERT_FALSE(s.e.cmdTest(0, 2000, s.t));  // one at a time
  s.run(3);
  TEST_ASSERT_FALSE(s.out.v[1]);
  TEST_ASSERT_FALSE(s.e.cmdTest(5, 1000, s.t));  // PUMP port: no pump on PHE
  TEST_ASSERT_TRUE(s.e.cmdTest(0, 9000, s.t));
  s.run(4);  // capped at 3 s
  TEST_ASSERT_FALSE(s.out.v[0]);
}

void test_close_all_for_ota() {
  Sim s(5, 30);
  s.e.cmdAuto(true, s.t);
  s.run(2);
  TEST_ASSERT_EQUAL(5, s.e.valvesOn());
  s.e.closeAll(s.t);
  for (int i = 0; i < MAX_TANKS; i++) TEST_ASSERT_FALSE(s.out.v[i]);
}

void test_sanitize() {
  PheLayout l;
  l.n = 9;
  l.low = 99;
  l.high = 40;
  l.line[0].fullCm = 10;
  sanitize(l);
  TEST_ASSERT_EQUAL(5, l.n);
  TEST_ASSERT_EQUAL(60, l.high);
  TEST_ASSERT_EQUAL(55, l.low);
  TEST_ASSERT_EQUAL(25, (int)l.line[0].fullCm);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_boot_all_closed);
  RUN_TEST(test_auto_one_line_opens_below_low_closes_at_high);
  RUN_TEST(test_auto_does_not_reopen_until_below_low);
  RUN_TEST(test_two_lines_open_together);
  RUN_TEST(test_five_lines_all_valves_and_layout);
  RUN_TEST(test_lines_outside_layout_stay_closed);
  RUN_TEST(test_manual_open_closes_at_high);
  RUN_TEST(test_manual_open_refused_when_full);
  RUN_TEST(test_manual_close_held_while_auto);
  RUN_TEST(test_sensor_loss_closes_valve_and_reports);
  RUN_TEST(test_no_reading_at_boot_keeps_closed);
  RUN_TEST(test_rising_and_flow_events);
  RUN_TEST(test_flow_events_debounced);
  RUN_TEST(test_supply_none_after_30_min);
  RUN_TEST(test_overflow_when_closed_valve_leaks);
  RUN_TEST(test_no_overflow_when_already_full_at_boot);
  RUN_TEST(test_usage_litres_per_line);
  RUN_TEST(test_valve_test_pulse);
  RUN_TEST(test_close_all_for_ota);
  RUN_TEST(test_sanitize);
  return UNITY_END();
}
