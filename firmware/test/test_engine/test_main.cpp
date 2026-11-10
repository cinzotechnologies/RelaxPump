// Host tests for the fill engine (lib/engine). Every layout of docs/flexible-system.md §2, every
// mode, and the safety rules of CLAUDE.md §7. A small "plant" model raises the level of the tank
// whose path is open while the pump or PHE runs, and checks the invariants on every tick.
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
  bool v[MAX_SEMI] = {};
  bool pumpOn = false, pheOn = false;
  std::vector<std::string> log;
  void valve(int i, bool on) override {
    if (v[i] != on) log.push_back(std::string(on ? "open V" : "close V") + std::to_string(i + 1));
    v[i] = on;
  }
  void pump(bool on) override {
    if (pumpOn != on) log.push_back(on ? "pump on" : "pump off");
    pumpOn = on;
  }
  void phe(bool on) override {
    if (pheOn != on) log.push_back(on ? "phe on" : "phe off");
    pheOn = on;
  }
};

struct Ev : Sink {
  std::vector<std::string> events;
  float litres = 0, pheLitres = 0;
  void event(const char *type, int tank, bool, float) override {
    events.push_back(std::string(type) + ":" + std::to_string(tank));
  }
  void usage(int, float, float l, bool phe) override { (phe ? pheLitres : litres) += l; }
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
  float pumpRate[MAX_SEMI];  // % per minute while filling
  float pheRate[MAX_SEMI];
  bool echo[N_SENSORS];
  bool pheWater = true;
  float mainDrop = 0;  // main tank % per minute while the pump runs

  Sim(Ports p, Layout l) {
    for (int i = 0; i < N_SENSORS; i++) {
      lvl[i] = 50;
      echo[i] = true;
    }
    for (int i = 0; i < MAX_SEMI; i++) pumpRate[i] = pheRate[i] = 2;
    e.ports = p;
    e.begin(&out, &sink);
    e.setLayout(l, t);
    feed(6);
  }
  static float cmOf(float pct, float emptyCm, float fullCm) { return emptyCm - pct / 100.0f * (emptyCm - fullCm); }
  void feed(int times = 1) {
    for (int k = 0; k < times; k++)
      for (int i = 0; i < N_SENSORS; i++) {
        float e0 = i == MAIN ? e.cfg.main.emptyCm : e.cfg.semi[i].emptyCm;
        float f0 = i == MAIN ? e.cfg.main.fullCm : e.cfg.semi[i].fullCm;
        e.reading(i, echo[i] ? cmOf(lvl[i], e0, f0) : -1, t);
      }
  }
  void set(int i, float pct) {
    lvl[i] = pct;
    feed(8);
  }
  int flowingTank() const {
    for (int i = 0; i < MAX_SEMI; i++)
      if (out.v[i]) return i;
    return e.cfg.n == 1 && !e.cfg.semi[0].valve ? 0 : -1;
  }
  void invariants() {
    if (out.pumpOn && out.pheOn) violations++;  // never together
    int open = 0;
    for (int i = 0; i < MAX_SEMI; i++) open += out.v[i];
    bool direct = e.cfg.n == 1 && !e.cfg.semi[0].valve;
    if (out.pumpOn && open == 0 && !direct) violations++;  // never pump against closed valves
    if (out.pheOn && open == 0 && !direct && e.phase() != Phase::Testing) violations++;
    if (open > 2) violations++;                      // 2 only while switching
    if (open == 2 && e.phase() != Phase::Switching) violations++;
  }
  /** Advance time in 1 s ticks, with the plant model. */
  void run(uint32_t ms) {
    for (uint32_t s = 0; s < ms; s += 1000) {
      t += 1000;
      int f = flowingTank();
      if (f >= 0 && out.pumpOn) lvl[f] += pumpRate[f] / 60.0f;
      if (f >= 0 && out.pheOn && pheWater) lvl[f] += pheRate[f] / 60.0f;
      if (out.pumpOn) lvl[MAIN] -= mainDrop / 60.0f;
      for (int i = 0; i < N_SENSORS; i++) lvl[i] = lvl[i] > 100 ? 100 : lvl[i] < 0 ? 0 : lvl[i];
      feed();
      e.loop(t);
      invariants();
    }
  }
  void runMin(float m) { run((uint32_t)(m * 60000)); }
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
};

static const Ports V1{3, 3, false, false};
static const Ports V2{8, 8, true, true};

static Layout layout(int n, int noSensor = -1) {
  Layout l;
  l.n = n;
  for (int i = 0; i < MAX_SEMI; i++) {
    l.semi[i] = SemiCfg();
    l.semi[i].litres = 1000;
  }
  if (noSensor >= 0) {
    l.semi[noSensor].sensor = false;
    l.semi[noSensor].fillMin = 10;
  }
  l.mode = Mode::Pump;
  l.low = 20;
  l.high = 95;
  return l;
}

void setUp() { violations = 0; }
void tearDown() {}

// ------------------------------------------------------------------ layout rules
void test_sanitize_caps_to_ports() {
  Layout l = layout(5);
  l.phe.enabled = true;
  l.main.enabled = l.main.sensor = true;
  l.mode = Mode::Phe;
  l.semi[1].sensor = false;
  l.semi[1].fillMin = 0;
  sanitize(l, V1);
  TEST_ASSERT_EQUAL(3, l.n);
  TEST_ASSERT_FALSE(l.phe.enabled);
  TEST_ASSERT_FALSE(l.main.enabled);
  TEST_ASSERT_TRUE(l.mode == Mode::Auto);
  TEST_ASSERT_EQUAL(10, l.semi[1].fillMin);
}

void test_fillable_rules() {
  Layout l = layout(2);
  l.semi[1].valve = false;
  TEST_ASSERT_TRUE(fillable(l, 0));
  TEST_ASSERT_FALSE(fillable(l, 1));  // 2+ tanks: needs a valve
  Layout one = layout(1);
  one.semi[0].valve = false;
  TEST_ASSERT_TRUE(fillable(one, 0));
  TEST_ASSERT_TRUE(autoCapable(one, 0));
  one.semi[0].sensor = false;
  TEST_ASSERT_FALSE(autoCapable(one, 0));
}

// ------------------------------------------------------------------ pump fills
void test_pump_fill_sequence_and_timings() {
  Sim s(V1, layout(3));
  s.set(0, 50);
  s.e.cmdFill(0, Src::Pump, s.t);
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

void test_auto_lowest_first_then_switch() {
  Sim s(V1, layout(3));
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
  TEST_ASSERT_EQUAL(1, (int)std::count(s.out.log.begin(), s.out.log.end(), std::string("pump on")));
  TEST_ASSERT_TRUE(s.lvl[0] >= 95 && s.lvl[1] >= 95);
  TEST_ASSERT_TRUE(s.lvl[2] < 70);  // above Start: not filled
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Idle);
  TEST_ASSERT_EQUAL(0, violations);
}

void test_auto_tie_prefers_lower_tank() {
  Layout l = layout(2);
  l.semi[0].heightFt = 30;
  l.semi[1].heightFt = 12;
  Sim s(V2, l);
  s.set(0, 10);
  s.set(1, 10);
  s.e.cmdAuto(true, s.t);
  s.run(1000);
  TEST_ASSERT_TRUE(s.out.v[1]);
  TEST_ASSERT_FALSE(s.out.v[0]);
}

void test_auto_skips_tank_without_sensor() {
  Sim s(V2, layout(3, 1));
  s.set(0, 90);
  s.set(2, 90);
  s.lvl[1] = 0;  // no sensor: Auto never fills it
  s.e.cmdAuto(true, s.t);
  s.runMin(2);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_FALSE(s.out.v[1]);
}

void test_every_layout_1_to_8_tanks_auto() {
  for (int n = 1; n <= 8; n++) {
    Sim s(V2, layout(n));
    for (int i = 0; i < n; i++) {
      s.pumpRate[i] = 25;
      s.set(i, 5 + i);
    }
    s.e.cmdAuto(true, s.t);
    s.runMin(5.0f * n + 2);
    for (int i = 0; i < n; i++) TEST_ASSERT_TRUE(s.lvl[i] >= 95);
    for (int i = n; i < MAX_SEMI; i++) TEST_ASSERT_FALSE(s.logHas(("open V" + std::to_string(i + 1)).c_str()));
    TEST_ASSERT_FALSE(s.out.pumpOn);
    TEST_ASSERT_EQUAL(0, violations);
  }
}

// ------------------------------------------------------------------ optional sensor / valve
void test_valve_only_tank_runs_timer() {
  Sim s(V2, layout(2, 1));
  s.e.cmdFill(1, Src::Pump, s.t);
  s.run(3000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  TEST_ASSERT_TRUE(s.out.v[1]);
  s.runMin(9.8f);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.runMin(0.3f);
  TEST_ASSERT_FALSE(s.out.pumpOn);  // 10 min timer
  s.run(4000);
  TEST_ASSERT_FALSE(s.out.v[1]);
  TEST_ASSERT_TRUE(s.sink.has("timeout:1"));
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Idle);  // not a lockout
  TEST_ASSERT_EQUAL(0, violations);
}

void test_single_tank_sensor_only_pumps_direct() {
  Layout l = layout(1);
  l.semi[0].valve = false;
  Sim s(V1, l);
  s.pumpRate[0] = 20;
  s.set(0, 10);
  s.e.cmdAuto(true, s.t);
  s.run(2000);
  TEST_ASSERT_TRUE(s.out.pumpOn);  // no valve: no lead needed
  s.runMin(5);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(s.lvl[0] >= 95);
  TEST_ASSERT_EQUAL(0, violations);
}

void test_single_tank_neither_is_timed() {
  Layout l = layout(1, 0);
  l.semi[0].valve = false;
  l.semi[0].fillMin = 5;
  Sim s(V1, l);
  s.e.cmdPump(true, s.t);
  s.run(1000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.runMin(5.1f);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Idle);
}

void test_two_tanks_without_valve_refused() {
  Layout l = layout(2);
  l.semi[1].valve = false;
  Sim s(V2, l);
  s.e.cmdFill(1, Src::Pump, s.t);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(strstr(s.e.msg, "needs a valve") != nullptr);
}

// ------------------------------------------------------------------ safety
void test_cooldown_before_restart() {
  Sim s(V1, layout(3));
  s.e.cmdFill(0, Src::Pump, s.t);
  s.run(10000);
  s.e.cmdPump(false, s.t);
  s.run(4000);
  s.e.cmdFill(1, Src::Pump, s.t);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(strstr(s.e.msg, "resting") != nullptr);
  s.run(60000);
  s.e.cmdFill(1, Src::Pump, s.t);
  s.run(3000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
}

void test_dry_run_lockout_and_clear() {
  Sim s(V1, layout(3));
  s.pumpRate[0] = 0.2f;  // 1 % in 5 min: dry
  s.set(0, 30);
  s.e.cmdFill(0, Src::Pump, s.t);
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
  Sim s(V1, l);
  s.pumpRate[0] = 0.6f;  // rises 3 % per 5 min: passes the dry-run check, never full
  s.set(0, 20);
  s.e.cmdFill(0, Src::Pump, s.t);
  s.runMin(10.5f);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Locked);
  TEST_ASSERT_TRUE(s.sink.has("timeout:0"));
}

void test_sensor_failure_stops() {
  Sim s(V1, layout(3));
  s.e.cmdFill(0, Src::Pump, s.t);
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
  Sim s(V1, layout(3));
  s.e.cmdFill(2, Src::Pump, s.t);
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
  Sim s(V1, layout(3));
  s.e.cmdFill(0, Src::Pump, s.t);
  s.run(5000);
  s.e.offlineGuard(31 * 60000UL, s.t);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Locked);
}

void test_board_fault_stops_at_once() {
  Sim s(V2, layout(3));
  s.e.cmdFill(0, Src::Pump, s.t);
  s.run(5000);
  s.e.boardFault(s.t);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_FALSE(s.out.pheOn);
  TEST_ASSERT_TRUE(s.e.phase() == Phase::Locked);
  TEST_ASSERT_TRUE(s.sink.has("board_error:-1"));
  TEST_ASSERT_TRUE(strstr(s.e.msg, "valve board") != nullptr);
  s.e.boardFault(s.t);  // reported once
  TEST_ASSERT_EQUAL(1, s.sink.count("board_error:-1"));
}

void test_removing_active_tank_stops() {
  Sim s(V2, layout(4));
  s.e.cmdFill(3, Src::Pump, s.t);
  s.run(5000);
  s.e.setLayout(layout(3), s.t);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(4000);
  TEST_ASSERT_FALSE(s.out.v[3]);
}

// ------------------------------------------------------------------ main tank
static Layout withMain(int n) {
  Layout l = layout(n);
  l.main.enabled = l.main.sensor = true;
  l.main.minPct = 10;
  return l;
}

void test_main_low_blocks_pump() {
  Sim s(V2, withMain(2));
  s.set(MAIN, 5);
  TEST_ASSERT_TRUE(s.sink.has("main_low:-1"));
  s.e.cmdFill(0, Src::Pump, s.t);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_TRUE(strstr(s.e.msg, "Main tank is low") != nullptr);
  s.set(0, 5);
  s.e.cmdAuto(true, s.t);
  s.runMin(2);
  TEST_ASSERT_FALSE(s.out.pumpOn);
}

void test_main_low_stops_pump_then_auto_resumes() {
  Sim s(V2, withMain(2));
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

// ------------------------------------------------------------------ PHE
static Layout withPhe(int n, Mode m) {
  Layout l = layout(n);
  l.phe.enabled = true;
  l.phe.probeMin = 4;
  l.phe.retryMin = 30;
  l.mode = m;
  return l;
}

void test_phe_fill_sequence_when_water_comes() {
  Sim s(V2, withPhe(2, Mode::Auto));
  s.pheRate[0] = 4;
  s.set(0, 10);
  s.set(1, 90);
  s.e.cmdAuto(true, s.t);
  s.run(1000);
  TEST_ASSERT_TRUE(s.out.v[0]);
  TEST_ASSERT_FALSE(s.out.pheOn);
  s.run(2000);
  TEST_ASSERT_TRUE(s.out.pheOn);  // PHE first in Auto
  s.runMin(2);
  TEST_ASSERT_TRUE(s.sink.has("phe_on:0"));
  s.runMin(25);
  TEST_ASSERT_FALSE(s.out.pheOn);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.v[0]);
  TEST_ASSERT_FALSE(s.logHas("pump on"));
  TEST_ASSERT_TRUE(s.sink.pheLitres > 500);
  TEST_ASSERT_TRUE(s.logIndex("phe off") < s.logIndex("close V1"));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_phe_probe_fails_then_pump() {
  Sim s(V2, withPhe(2, Mode::Auto));
  s.pheWater = false;
  s.pumpRate[0] = 10;
  s.set(0, 10);
  s.set(1, 90);
  s.e.cmdAuto(true, s.t);
  s.runMin(4.2f);
  TEST_ASSERT_FALSE(s.out.pheOn);
  TEST_ASSERT_TRUE(s.sink.has("phe_none:0"));
  TEST_ASSERT_FALSE(s.out.pumpOn);  // cooldown first
  s.runMin(1.2f);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.runMin(10);
  TEST_ASSERT_TRUE(s.lvl[0] >= 95);
  // within retryMin the next Auto fill uses the pump straight away
  s.set(1, 5);
  s.runMin(1.5f);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  TEST_ASSERT_EQUAL(1, (int)std::count(s.out.log.begin(), s.out.log.end(), std::string("phe on")));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_phe_only_never_starts_pump() {
  Sim s(V2, withPhe(1, Mode::Phe));
  s.pheWater = false;
  s.set(0, 10);
  s.e.cmdAuto(true, s.t);
  s.runMin(10);
  TEST_ASSERT_FALSE(s.logHas("pump on"));
  TEST_ASSERT_TRUE(s.sink.has("phe_none:0"));
  s.e.cmdPump(true, s.t);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  // retried after retryMin
  s.e.cmdAuto(true, s.t);
  s.pheWater = true;
  s.runMin(31);
  TEST_ASSERT_TRUE(s.lvl[0] > 15);
  TEST_ASSERT_FALSE(s.logHas("pump on"));
}

void test_pump_only_never_uses_phe() {
  Sim s(V2, withPhe(2, Mode::Pump));
  s.set(0, 10);
  s.e.cmdAuto(true, s.t);
  s.run(3000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.e.cmdFill(1, Src::Phe, s.t);  // Pump only: forced to the pump
  s.runMin(2);
  TEST_ASSERT_FALSE(s.logHas("phe on"));
}

void test_pump_request_while_phe_switches_source() {
  Sim s(V2, withPhe(2, Mode::Auto));
  s.e.cmdFill(0, Src::Phe, s.t);
  s.run(5000);
  TEST_ASSERT_TRUE(s.out.pheOn);
  s.e.cmdPump(true, s.t);
  TEST_ASSERT_FALSE(s.out.pheOn);
  s.runMin(1.5f);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  TEST_ASSERT_FALSE(s.out.pheOn);
  TEST_ASSERT_EQUAL(0, violations);
}

// ------------------------------------------------------------------ test pulses and pump check
void test_test_pulses() {
  Sim s(V2, layout(3));
  TEST_ASSERT_TRUE(s.e.cmdTest(2, 1000, s.t));
  TEST_ASSERT_TRUE(s.out.v[2]);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(1000);
  TEST_ASSERT_FALSE(s.out.v[2]);
  TEST_ASSERT_TRUE(s.e.cmdTest(PORT_PHE, 9000, s.t));  // capped at 3 s
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.pheOn);
  TEST_ASSERT_TRUE(s.e.cmdTest(PORT_PUMP, 2000, s.t));
  TEST_ASSERT_TRUE(s.out.v[0]);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(2000);
  TEST_ASSERT_TRUE(s.out.pumpOn);
  s.run(2000);
  TEST_ASSERT_FALSE(s.out.pumpOn);
  s.run(3000);
  TEST_ASSERT_FALSE(s.out.v[0]);
  // refused while filling
  s.run(61000);
  s.e.cmdFill(1, Src::Pump, s.t);
  s.run(3000);
  TEST_ASSERT_FALSE(s.e.cmdTest(0, 1000, s.t));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_pump_check() {
  Layout l = layout(3, 2);
  Sim s(V2, l);
  s.pumpRate[0] = 1.0f;  // 1 %/min of 1000 L = 10 L/min
  s.pumpRate[1] = 0.2f;  // slow
  s.set(0, 20);
  s.set(1, 20);
  TEST_ASSERT_TRUE(s.e.cmdPumpCheck(s.t));
  TEST_ASSERT_TRUE(s.e.checkRun);
  s.runMin(5);
  TEST_ASSERT_FALSE(s.e.checkRun);
  TEST_ASSERT_TRUE(s.e.check[0].done && s.e.check[1].done);
  TEST_ASSERT_FALSE(s.e.check[2].done);  // no sensor: not checked
  TEST_ASSERT_FLOAT_WITHIN(0.35, 1.0, s.e.check[0].pctMin);
  TEST_ASSERT_FLOAT_WITHIN(3.5, 10.0, s.e.check[0].lpm);
  TEST_ASSERT_FALSE(s.e.check[0].slow);
  TEST_ASSERT_TRUE(s.e.check[1].slow);
  TEST_ASSERT_TRUE(s.sink.has("check_done:-1"));
  TEST_ASSERT_FALSE(s.out.pumpOn);
  TEST_ASSERT_EQUAL(1, (int)std::count(s.out.log.begin(), s.out.log.end(), std::string("pump on")));
  TEST_ASSERT_EQUAL(0, violations);
}

void test_detected_ports() {
  Sim s(V2, layout(2));
  s.echo[5] = false;
  s.feed(4);
  TEST_ASSERT_TRUE(s.e.detected[0]);
  TEST_ASSERT_TRUE(s.e.detected[4]);  // unconfigured port that answers
  TEST_ASSERT_FALSE(s.e.detected[5]);
  TEST_ASSERT_FALSE(s.e.ok[4]);  // not part of the layout
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_sanitize_caps_to_ports);
  RUN_TEST(test_fillable_rules);
  RUN_TEST(test_pump_fill_sequence_and_timings);
  RUN_TEST(test_auto_lowest_first_then_switch);
  RUN_TEST(test_auto_tie_prefers_lower_tank);
  RUN_TEST(test_auto_skips_tank_without_sensor);
  RUN_TEST(test_every_layout_1_to_8_tanks_auto);
  RUN_TEST(test_valve_only_tank_runs_timer);
  RUN_TEST(test_single_tank_sensor_only_pumps_direct);
  RUN_TEST(test_single_tank_neither_is_timed);
  RUN_TEST(test_two_tanks_without_valve_refused);
  RUN_TEST(test_cooldown_before_restart);
  RUN_TEST(test_dry_run_lockout_and_clear);
  RUN_TEST(test_max_run_lockout);
  RUN_TEST(test_sensor_failure_stops);
  RUN_TEST(test_closing_active_valve_stops_pump_first);
  RUN_TEST(test_offline_guard);
  RUN_TEST(test_board_fault_stops_at_once);
  RUN_TEST(test_removing_active_tank_stops);
  RUN_TEST(test_main_low_blocks_pump);
  RUN_TEST(test_main_low_stops_pump_then_auto_resumes);
  RUN_TEST(test_phe_fill_sequence_when_water_comes);
  RUN_TEST(test_phe_probe_fails_then_pump);
  RUN_TEST(test_phe_only_never_starts_pump);
  RUN_TEST(test_pump_only_never_uses_phe);
  RUN_TEST(test_pump_request_while_phe_switches_source);
  RUN_TEST(test_test_pulses);
  RUN_TEST(test_pump_check);
  RUN_TEST(test_detected_ports);
  return UNITY_END();
}
