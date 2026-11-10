// Host tests for the fill engine (lib/engine): 1, 2, 3 and 5 tanks, with and without the main
// tank sensor (docs/flexible-system.md §4), and the safety rules of CLAUDE.md §7. A small "plant"
// model raises the level of the tank whose path is open while the pump runs, and checks the
// invariants on every tick.
//
//   pio test -e native                 (needs a host C++ compiler)
//   scripts/test-native.sh             (any C++17 compiler, no PlatformIO)
#ifdef RP_SHIM
#include "unity_shim.h"
#else
#include <unity.h>
#endif

#include <string.h>

#include <algorithm>
#include <string>
#include <vector>

#include "engine.h"

using namespace rp;

// ------------------------------------------------------------------ fakes
struct Out : Outputs {
  bool v[MAX_TANKS] = {};
  bool pumpOn = false;
  std::vector<std::string> log;
  void valve(int i, bool on) override {
    if (v[i] != on) log.push_back(std::string(on ? "open V" : "close V") + std::to_string(i + 1));
    v[i] = on;
  }
  void pump(bool on) override {
    if (pumpOn != on) log.push_back(on ? "pump on" : "pump off");
    pumpOn = on;
  }
};

struct Ev : Sink {
  std::vector<std::string> events;
  float litres = 0;
  void event(const char *type, int tank, bool, float) override {
    events.push_back(std::string(type) + ":" + std::to_string(tank));
  }
  void usage(int, float, float l) override { litres += l; }
  bool has(const std::string &e) const {
    for (auto &x : events)
      if (x == e) return true;
    return false;
  }
  int count(const std::string &e) const {
    int n = 0;
    for (auto &x : events) n += x == e;
    return n;
  }
};

static int violations = 0;

struct Sim {
  Engine e;
  Out out;
  Ev sink;
  uint32_t t = 1000;
  float lvl[N_SENSORS];
  float pumpRate[MAX_TANKS];  // % per minute while filling
  bool echo[N_SENSORS];
  float mainDrop = 0;  // main tank % per minute while the pump runs

  explicit Sim(Layout l) {
    for (int i = 0; i < N_SENSORS; i++) {
      lvl[i] = 50;
      echo[i] = true;
    }
    for (int i = 0; i < MAX_TANKS; i++) pumpRate[i] = 2;
    e.begin(&out, &sink);
    e.setLayout(l, t);
    feed(6);
  }
  static float cmOf(float pct, float emptyCm, float fullCm) { return emptyCm - pct / 100.0f * (emptyCm - fullCm); }
  void feed(int times = 1) {
    for (int k = 0; k < times; k++)
      for (int i = 0; i < N_SENSORS; i++) {
        float e0 = i == MAIN ? e.cfg.main.emptyCm : e.cfg.tank[i].emptyCm;
        float f0 = i == MAIN ? e.cfg.main.fullCm : e.cfg.tank[i].fullCm;
        e.reading(i, echo[i] ? cmOf(lvl[i], e0, f0) : -1, t);
      }
  }
  void set(int i, float pct) {
    lvl[i] = pct;
    feed(8);
  }
  bool single() const { return e.cfg.n == 1; }
  int flowingTank() const {
    if (single()) return 0;  // no valve: the pump fills tank 1 directly
    for (int i = 0; i < MAX_TANKS; i++)
      if (out.v[i]) return i;
    return -1;
  }
  void invariants() {
    int open = 0;
    for (int i = 0; i < MAX_TANKS; i++) open += out.v[i];
    if (out.pumpOn && open == 0 && !single()) violations++;  // never pump against closed valves
    if (open > MAX_VALVES_ON) violations++;                  // hard limit
    if (open == 2 && e.phase() != Phase::Switching) violations++;  // 2 only while switching
    if (single() && open > 0 && e.phase() != Phase::Testing) violations++;  // one tank: no valve
  }
  /** Advance time in 1 s ticks, with the plant model. */
  void run(uint32_t ms) {
    for (uint32_t s = 0; s < ms; s += 1000) {
      t += 1000;
      int f = flowingTank();
      if (f >= 0 && out.pumpOn) lvl[f] += pumpRate[f] / 60.0f;
      if (out.pumpOn) lvl[MAIN] -= mainDrop / 60.0f;
      for (int i = 0; i < N_SENSORS; i++) lvl[i] = lvl[i] > 100 ? 100 : lvl[i] < 0 ? 0 : lvl[i];
      feed();
      e.loop(t);
      invariants();
    }
  }
  void runMin(float m) { run((uint32_t)(m * 60000)); }
  /** Manual fill, as the app does it: open the valve (2+ tanks), then start the pump. */
  void fill(int i) {
    if (!single()) e.cmdValve(i, true, t);
    e.cmdPump(true, t);
  }
  bool logHas(const char *s) const {
    for (auto &x : out.log)
      if (x == s) return true;
    return false;
  }
  int logIndex(const char *s) const {
    for (size_t i = 0; i < out.log.size(); i++)
      if (out.log[i] == s) return (int)i;
    return -1;
  }
  int pumpStarts() const { return (int)std::count(out.log.begin(), out.log.end(), std::string("pump on")); }
};

static Layout layout(int n, bool main = false) {
  Layout l;
  l.n = n;
  for (int i = 0; i < MAX_TANKS; i++) {
    l.tank[i] = TankCfg();
    l.tank[i].litres = 1000;
  }
  l.main.enabled = main;
  l.main.minPct = 10;
  l.low = 20;
  l.high = 95;
  return l;
}

void setUp() { violations = 0; }
void tearDown() {}

// ------------------------------------------------------------------ layout rules
void test_sanitize() {
  Layout l = layout(9);
  l.main.minPct = 60;
  l.low = 90;
  l.high = 50;
  l.tank[0].fullCm = 10;
  sanitize(l);
  TEST_ASSERT_EQUAL(5, l.n);
  TEST_ASSERT_EQUAL(40, l.main.minPct);
  TEST_ASSERT_EQUAL(80, l.low);
  TEST_ASSERT_EQUAL(90, l.high);
  TEST_ASSERT_EQUAL(25, (int)l.tank[0].fullCm);
  Layout z = layout(0);
  sanitize(z);
  TEST_ASSERT_EQUAL(1, z.n);
}

void test_valves_implied_by_count() {
  TEST_ASSERT_FALSE(hasValves(layout(1)));
  TEST_ASSERT_TRUE(hasValves(layout(2)));
  TEST_ASSERT_TRUE(hasValves(layout(5)));
}

// ------------------------------------------------------------------ fills
void test_pump_fill_sequence_and_timings() {
  Sim s(layout(3));
  s.set(0, 50);
  s.fill(0);
  TEST_ASSERT_TRUE(s.out.v[0]);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(1000);
  TEST_ASSERT_FALSE(s.out.pumpOn);  // 2 s valve lead
  s.run(2000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.pumpRate[0] = 10;
  for (int k = 0; k < 600 && s.out.pumpOn; k++) s.run(1000);  // 50 → 95 %
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(s.out.v[0]);  // valve stays open 3 s after the pump stops
  s.run(4000);
  TEST_ASSERT_FALSE(s.out.v[0]);
  TEST_ASSERT_TRUE(s.sink.has("pump_on:0"));
  TEST_ASSERT_TRUE(s.sink.has("full:0"));
  TEST_ASSERT_TRUE(s.sink.has("pump_off:0"));
  TEST_ASSERT_TRUE(s.sink.litres > 400);
  TEST_ASSERT_EQUAL(0, violations);
}

void test_pump_needs_an_open_valve() {
  Sim s(layout(2));
  s.e.cmdPump(true, s.t);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(strstr(s.e.msg, "Open a valve") != nullptr);
}

void test_auto_lowest_first_then_switch() {
  Sim s(layout(3));
  for (int i = 0; i < 3; i++) s.pumpRate[i] = 20;
  s.set(0, 15);
  s.set(1, 10);
  s.set(2, 60);
  s.e.cmdAuto(true, s.t);
  s.run(3000);
  TEST_ASSERT_TRUE(s.out.v[1]);  // lowest first
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.runMin(10);
  // switched to tank 1 (index 0): opened V1 before closing V2, without stopping the pump
  int openV1 = s.logIndex("open V1"), closeV2 = s.logIndex("close V2");
  TEST_ASSERT_TRUE(openV1 >= 0 && closeV2 > openV1);
  TEST_ASSERT_EQUAL(1, s.pumpStarts());
  TEST_ASSERT_TRUE(s.lvl[0] >= 95 && s.lvl[1] >= 95);
  TEST_ASSERT_TRUE(s.lvl[2] < 70);  // above Start: not filled
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Idle);
  TEST_ASSERT_EQUAL(0, violations);
}

void test_auto_tie_prefers_lower_tank() {
  Layout l = layout(2);
  l.tank[0].heightFt = 30;
  l.tank[1].heightFt = 12;
  Sim s(l);
  s.set(0, 10);
  s.set(1, 10);
  s.e.cmdAuto(true, s.t);
  s.run(1000);
  TEST_ASSERT_TRUE(s.out.v[1]);
  TEST_ASSERT_FALSE(s.out.v[0]);
}

void test_layouts_1_2_3_5_tanks_with_and_without_main() {
  const int counts[] = {1, 2, 3, 5};
  for (int main = 0; main <= 1; main++)
    for (int n : counts) {
      Sim s(layout(n, main));
      s.set(MAIN, 80);
      for (int i = 0; i < n; i++) {
        s.pumpRate[i] = 25;
        s.set(i, 5 + i);
      }
      s.e.cmdAuto(true, s.t);
      s.runMin(5.0f * n + 2);
      for (int i = 0; i < n; i++) TEST_ASSERT_TRUE(s.lvl[i] >= 95);
      if (n == 1) TEST_ASSERT_FALSE(s.logHas("open V1"));  // one tank: never a valve
      for (int i = n; i < MAX_TANKS; i++) TEST_ASSERT_FALSE(s.logHas(("open V" + std::to_string(i + 1)).c_str()));
      TEST_ASSERT_EQUAL(1, s.pumpStarts());  // tanks switch without stopping the pump
      TEST_ASSERT_FALSE(s.out.pumpOn);
      TEST_ASSERT_EQUAL(0, violations);
    }
}

// ------------------------------------------------------------------ one tank
void test_single_tank_pumps_direct() {
  Sim s(layout(1));
  s.pumpRate[0] = 20;
  s.set(0, 10);
  s.e.cmdAuto(true, s.t);
  s.run(2000);
  TEST_ASSERT_TRUE(s.out.pumpOn);  // no valve: no lead needed
  s.runMin(5);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(s.lvl[0] >= 95);
  TEST_ASSERT_FALSE(s.logHas("open V1"));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_single_tank_manual_pump_and_valve_ignored() {
  Sim s(layout(1));
  s.e.cmdValve(0, true, s.t);  // there is no valve
  TEST_ASSERT_FALSE(s.out.v[0]);
  s.e.cmdPump(true, s.t);
  s.run(1000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.e.cmdPump(false, s.t);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Idle);
  TEST_ASSERT_EQUAL(0, violations);
}

void test_single_tank_safety_rules_still_apply() {
  Sim s(layout(1));
  s.pumpRate[0] = 0.2f;  // dry
  s.set(0, 30);
  s.e.cmdPump(true, s.t);
  s.runMin(5.5f);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Locked);
  TEST_ASSERT_TRUE(s.sink.has("dry_run:0"));
}

void test_layout_change_one_to_two_tanks_stops() {
  Sim s(layout(1));
  s.e.cmdPump(true, s.t);
  s.run(2000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.e.setLayout(layout(2), s.t);  // valves now needed and none is open
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Idle);
  TEST_ASSERT_EQUAL(0, violations);
}

// ------------------------------------------------------------------ valve limit
void test_never_more_than_two_valves() {
  Sim s(layout(5));
  s.e.cmdValve(0, true, s.t);
  s.e.cmdValve(3, true, s.t);  // idle: opening another closes the first
  TEST_ASSERT_FALSE(s.out.v[0]);
  TEST_ASSERT_TRUE(s.out.v[3]);
  // while switching, a third request is refused by the guard
  s.e.cmdPump(true, s.t);
  s.run(3000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.e.cmdValve(1, true, s.t);  // switch 4 → 2: V2 opens, V4 still on
  TEST_ASSERT_TRUE(s.out.v[1] && s.out.v[3]);
  s.e.cmdValve(2, true, s.t);  // third valve: refused
  TEST_ASSERT_FALSE(s.out.v[2]);
  TEST_ASSERT_EQUAL(2, s.e.valvesOn());
  s.run(2000);
  TEST_ASSERT_FALSE(s.out.v[3]);  // old valve closed after the switch
  TEST_ASSERT_TRUE(s.out.pumpOn);
  TEST_ASSERT_EQUAL(0, violations);
}

// ------------------------------------------------------------------ safety
void test_cooldown_before_restart() {
  Sim s(layout(3));
  s.fill(0);
  s.run(10000);
  s.e.cmdPump(false, s.t);
  s.run(4000);
  s.fill(1);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(strstr(s.e.msg, "resting") != nullptr);
  s.run(60000);
  s.fill(1);
  s.run(3000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
}

void test_dry_run_lockout_and_clear() {
  Sim s(layout(3));
  s.pumpRate[0] = 0.2f;  // 1 % in 5 min: dry
  s.set(0, 30);
  s.fill(0);
  s.runMin(5.5f);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Locked);
  TEST_ASSERT_FALSE(s.out.v[0]);
  TEST_ASSERT_TRUE(s.sink.has("dry_run:0"));
  s.e.cmdAuto(true, s.t);  // any command clears the lockout
  TEST_ASSERT_TRUE(s.e.phase() != Phase::Locked);
  TEST_ASSERT_EQUAL(0, violations);
}

void test_max_run_lockout() {
  Layout l = layout(3);
  l.maxRunMin = 10;
  Sim s(l);
  s.pumpRate[0] = 0.6f;  // rises 3 % per 5 min: passes the dry-run check, never full
  s.set(0, 20);
  s.fill(0);
  s.runMin(10.5f);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Locked);
  TEST_ASSERT_TRUE(s.sink.has("timeout:0"));
}

void test_sensor_failure_stops() {
  Sim s(layout(3));
  s.fill(0);
  s.run(5000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.echo[0] = false;
  s.run(20000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Locked);
  TEST_ASSERT_TRUE(s.sink.has("sensor:0"));
}

void test_closing_active_valve_stops_pump_first() {
  Sim s(layout(3));
  s.fill(2);
  s.run(5000);
  s.e.cmdValve(2, false, s.t);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(s.out.v[2]);
  s.run(4000);
  TEST_ASSERT_FALSE(s.out.v[2]);
  TEST_ASSERT_TRUE(s.logIndex("pump off") < s.logIndex("close V3"));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_offline_guard() {
  Sim s(layout(3));
  s.fill(0);
  s.run(5000);
  s.e.offlineGuard(31 * 60000UL, s.t);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Locked);
}

void test_removing_active_tank_stops() {
  Sim s(layout(5));
  s.fill(4);
  s.run(5000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.e.setLayout(layout(3), s.t);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_FALSE(s.out.v[4]);
  TEST_ASSERT_EQUAL(0, violations);
}

// ------------------------------------------------------------------ main tank
void test_main_low_blocks_pump() {
  Sim s(layout(2, true));
  s.set(MAIN, 5);
  TEST_ASSERT_TRUE(s.sink.has("main_low:-1"));
  s.fill(0);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(strstr(s.e.msg, "Main tank is low") != nullptr);
  s.set(0, 5);
  s.e.cmdAuto(true, s.t);
  s.runMin(2);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_EQUAL(0, violations);
}

void test_main_low_blocks_single_tank_too() {
  Sim s(layout(1, true));
  s.set(MAIN, 5);
  s.e.cmdPump(true, s.t);
  s.run(2000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
}

void test_main_low_stops_pump_then_auto_resumes() {
  Sim s(layout(2, true));
  s.mainDrop = 30;  // main tank empties fast
  s.set(MAIN, 30);
  s.pumpRate[0] = 5;
  s.set(0, 10);
  s.e.cmdAuto(true, s.t);
  s.run(3000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.runMin(1);
  TEST_ASSERT_FALSE(s.out.pumpOn);  // main below 10 %
  TEST_ASSERT_TRUE(s.e.phase() != Phase::Locked);
  s.mainDrop = 0;
  s.set(MAIN, 12);  // not recovered enough (needs 15 %)
  s.runMin(2);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.set(MAIN, 60);
  s.runMin(1.5f);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  TEST_ASSERT_EQUAL(0, violations);
}

void test_main_ignored_when_disabled() {
  Sim s(layout(2, false));
  s.set(MAIN, 0);
  TEST_ASSERT_FALSE(s.sink.has("main_low:-1"));
  s.fill(0);
  s.run(3000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
}

// ------------------------------------------------------------------ test pulses and pump check
void test_test_pulses() {
  Sim s(layout(3));
  TEST_ASSERT_TRUE(s.e.cmdTest(4, 1000, s.t));  // V5: allowed before the layout is saved
  TEST_ASSERT_TRUE(s.out.v[4]);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(1000);
  TEST_ASSERT_FALSE(s.out.v[4]);
  TEST_ASSERT_TRUE(s.e.cmdTest(2, 9000, s.t));  // capped at 3 s
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.v[2]);
  TEST_ASSERT_TRUE(s.e.cmdTest(PORT_PUMP, 2000, s.t));
  TEST_ASSERT_TRUE(s.out.v[0]);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(2000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.run(2000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.v[0]);
  TEST_ASSERT_FALSE(s.e.cmdTest(6, 1000, s.t));  // no such port
  // refused while filling
  s.run(61000);
  s.fill(1);
  s.run(3000);
  TEST_ASSERT_FALSE(s.e.cmdTest(0, 1000, s.t));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_pump_test_single_tank_opens_v1_first() {
  Sim s(layout(1));
  TEST_ASSERT_TRUE(s.e.cmdTest(PORT_PUMP, 1000, s.t));
  TEST_ASSERT_TRUE(s.out.v[0]);  // in case a valve is already wired before the save
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(7000);
  TEST_ASSERT_TRUE(s.logIndex("open V1") < s.logIndex("pump on"));
  TEST_ASSERT_TRUE(s.logIndex("pump off") < s.logIndex("close V1"));
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Idle);
}

void test_pump_check() {
  Sim s(layout(3));
  s.pumpRate[0] = 1.0f;  // 1 %/min of 1000 L = 10 L/min
  s.pumpRate[1] = 0.2f;  // slow
  s.set(0, 20);
  s.set(1, 20);
  s.set(2, 97);          // already full: skipped
  TEST_ASSERT_TRUE(s.e.cmdPumpCheck(s.t));
  TEST_ASSERT_TRUE(s.e.checkRun);
  s.runMin(5);
  TEST_ASSERT_FALSE(s.e.checkRun);
  TEST_ASSERT_TRUE(s.e.check[0].done && s.e.check[1].done);
  TEST_ASSERT_TRUE(s.e.check[2].skipped);
  TEST_ASSERT_FLOAT_WITHIN(0.35, 1.0, s.e.check[0].pctMin);
  TEST_ASSERT_FLOAT_WITHIN(3.5, 10.0, s.e.check[0].lpm);
  TEST_ASSERT_FALSE(s.e.check[0].slow);
  TEST_ASSERT_TRUE(s.e.check[1].slow);
  TEST_ASSERT_TRUE(s.sink.has("check_done:-1"));
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_EQUAL(1, s.pumpStarts());
  TEST_ASSERT_EQUAL(0, violations);
}

void test_pump_check_single_tank() {
  Sim s(layout(1));
  s.pumpRate[0] = 1.0f;
  s.set(0, 20);
  TEST_ASSERT_TRUE(s.e.cmdPumpCheck(s.t));
  s.runMin(2.5f);
  TEST_ASSERT_FALSE(s.e.checkRun);
  TEST_ASSERT_TRUE(s.e.check[0].done);
  TEST_ASSERT_FALSE(s.logHas("open V1"));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_detected_ports() {
  Sim s(layout(2));
  s.echo[3] = false;
  s.feed(4);
  TEST_ASSERT_TRUE(s.e.detected[0]);
  TEST_ASSERT_TRUE(s.e.detected[4]);  // unconfigured port that answers
  TEST_ASSERT_FALSE(s.e.detected[3]);
  TEST_ASSERT_FALSE(s.e.ok[4]);  // not part of the layout
  TEST_ASSERT_TRUE(s.e.detected[MAIN]);
  TEST_ASSERT_FALSE(s.e.ok[MAIN]);  // main sensor not enabled
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_sanitize);
  RUN_TEST(test_valves_implied_by_count);
  RUN_TEST(test_pump_fill_sequence_and_timings);
  RUN_TEST(test_pump_needs_an_open_valve);
  RUN_TEST(test_auto_lowest_first_then_switch);
  RUN_TEST(test_auto_tie_prefers_lower_tank);
  RUN_TEST(test_layouts_1_2_3_5_tanks_with_and_without_main);
  RUN_TEST(test_single_tank_pumps_direct);
  RUN_TEST(test_single_tank_manual_pump_and_valve_ignored);
  RUN_TEST(test_single_tank_safety_rules_still_apply);
  RUN_TEST(test_layout_change_one_to_two_tanks_stops);
  RUN_TEST(test_never_more_than_two_valves);
  RUN_TEST(test_cooldown_before_restart);
  RUN_TEST(test_dry_run_lockout_and_clear);
  RUN_TEST(test_max_run_lockout);
  RUN_TEST(test_sensor_failure_stops);
  RUN_TEST(test_closing_active_valve_stops_pump_first);
  RUN_TEST(test_offline_guard);
  RUN_TEST(test_removing_active_tank_stops);
  RUN_TEST(test_main_low_blocks_pump);
  RUN_TEST(test_main_low_blocks_single_tank_too);
  RUN_TEST(test_main_low_stops_pump_then_auto_resumes);
  RUN_TEST(test_main_ignored_when_disabled);
  RUN_TEST(test_test_pulses);
  RUN_TEST(test_pump_test_single_tank_opens_v1_first);
  RUN_TEST(test_pump_check);
  RUN_TEST(test_pump_check_single_tank);
  RUN_TEST(test_detected_ports);
  return UNITY_END();
}
