// RelaxPump fill engine — pure C++17, no Arduino. Decides every valve / pump move from the layout
// (docs/flexible-system.md: 1–5 semi tanks, sensor + valve per tank, one tank = sensor only,
// optional main-tank sensor), the sensor readings and the commands. The board code (src/) feeds it
// readings and the time, and turns its output calls into pins.
// Unit-tested on the host: firmware/test/ (pio test -e native, or scripts/test-native.sh).
//
// Safety (CLAUDE.md §7, kept exactly):
//   open the tank valve → 2 s → pump on … pump off → 3 s → close the valve
//   one tank at a time; never pump with all valves closed (except one tank: no valve, the pump
//   fills it directly); max run time; dry-run stop (< 2 % in 5 min); 60 s cooldown before the
//   pump restarts; stop on sensor failure; everything off when offline longer than the max run.
// v2 additions: never more than 2 valves on at once (only while switching tanks); the pump never
//   starts, and stops, when the main tank is below main.minPct.
#pragma once
#include <stdint.h>

namespace rp {

constexpr int MAX_TANKS = 5;
constexpr int MAIN = 5;       // sensor index of the main tank
constexpr int N_SENSORS = 6;  // T1–T5 + MAIN
constexpr int PORT_PUMP = 5;  // test ports: 0..4 = V1..V5, 5 = PUMP
constexpr int MAX_VALVES_ON = 2;

enum class Phase : uint8_t { Idle, Opening, Filling, Switching, Stopping, Locked, Testing };

struct Timings {
  uint32_t valveLeadMs = 2000;   // valve open → pump on
  uint32_t pumpStopMs = 3000;    // pump off → close valve
  uint32_t switchMs = 1500;      // switching tanks: open new, then close old
  uint32_t cooldownMs = 60000;   // rest before the pump may start again
  uint32_t noRiseMs = 300000;    // dry-run window
  float noRisePct = 2.0f;        // must rise this much per window
  int sensorFailMax = 15;        // consecutive bad readings → sensor error
  int detectFailMax = 3;         // consecutive bad readings → "No answer" in setup
  uint32_t checkMs = 120000;     // pump check: per tank
  uint32_t testMaxMs = 3000;     // cmd.test pulse limit
  float mainHysteresis = 5.0f;   // main tank must recover minPct + this before Auto restarts
};

struct TankCfg {
  float emptyCm = 120;  // sensor → tank bottom
  float fullCm = 30;    // sensor → full level (≥ 25, blind zone)
  float litres = 0;     // 0 = unknown
  float heightFt = 0;   // above the main tank, 0 = unknown
};

struct MainCfg {
  bool enabled = false;
  float emptyCm = 200;
  float fullCm = 30;
  float litres = 0;
  int minPct = 10;
};

struct Layout {
  int n = 3;  // tankCount 1..5
  TankCfg tank[MAX_TANKS];
  MainCfg main;
  int low = 20;
  int high = 95;
  int maxRunMin = 30;
};

/** Clamp to the rules of docs/flexible-system.md. */
void sanitize(Layout &l);

/** 2+ tanks: every tank has a valve. One tank: no valve, the pump fills it directly. */
inline bool hasValves(const Layout &l) { return l.n >= 2; }

struct Outputs {
  virtual void valve(int i, bool on) = 0;
  virtual void pump(bool on) = 0;
  virtual ~Outputs() = default;
};

struct Sink {
  virtual void event(const char *type, int tank, bool autoRun, float minutes) = 0;
  virtual void usage(int tank, float minutes, float litres) = 0;
  virtual ~Sink() = default;
};

struct CheckRow {
  bool done = false;
  bool skipped = false;  // already full, or sensor error
  float pctMin = -1;     // % per minute
  float lpm = -1;        // litres per minute (needs litres)
  float minToFull = -1;  // empty → full at this rate
  bool slow = false;     // < 2 % in 5 min
};

class Engine {
 public:
  Layout cfg;
  Timings tm;
  bool autoMode = false;

  float level[N_SENSORS];  // %, -1 = unknown
  float distCm[N_SENSORS];
  bool ok[N_SENSORS];        // configured sensor gives readings
  bool detected[N_SENSORS];  // the port answers at all (setup wizard)

  bool valveOn[MAX_TANKS];
  bool pumpOn = false;
  char msg[96];

  bool checkRun = false;
  CheckRow check[MAX_TANKS];

  Engine();
  void begin(Outputs *o, Sink *s);
  void setLayout(const Layout &l, uint32_t now);
  void reading(int idx, float cm, uint32_t now);  // cm < 0 = no echo
  void loop(uint32_t now);

  // Commands (app / serial). Any command clears a lockout.
  void cmdPump(bool on, uint32_t now);
  void cmdValve(int i, bool open, uint32_t now);
  void cmdAuto(bool on, uint32_t now);
  bool cmdTest(int port, uint32_t ms, uint32_t now);
  bool cmdPumpCheck(uint32_t now);
  void reset(uint32_t now);

  /** Call while the cloud is unreachable; stops everything after maxRunMin. */
  void offlineGuard(uint32_t offlineMs, uint32_t now);

  Phase phase() const { return ph; }
  int activeTank() const { return active; }
  bool mainLow() const;
  int valvesOn() const;
  bool changed();  // true once after something the app shows changed
  const char *phaseName() const;
  /** For the next pump start (cooldown). */
  bool coolingDown(uint32_t now) const;

 private:
  Outputs *out = nullptr;
  Sink *sink = nullptr;
  Phase ph = Phase::Idle;
  int active = -1, next = -1;
  bool runAuto = false, lockAfterStop = false;
  uint32_t phaseAt = 0, runStart = 0, tankStart = 0, riseAt = 0, lastStop = 0;
  uint32_t stopWaitMs = 0;  // pump off → close valve (3 s), 0 when the pump was not on
  bool stoppedOnce = false;
  float startPct = 0, risePct = 0;
  bool dirty = true;
  bool lowSent[N_SENSORS];
  bool mainHold = false;  // main tank was low; wait for it to recover
  int fails[N_SENSORS], detFails[N_SENSORS];
  // test pulse
  int testPort = -1, testStage = 0;
  uint32_t testMs = 0;

  void go(Phase p, uint32_t now);
  void say(const char *fmt, ...);
  void ev(const char *type, int tank, float minutes = 0);
  bool setValve(int i, bool on);
  void setPump(bool on);
  void allOff();
  bool pathOpen() const;

  int pickAuto(int except) const;
  bool pumpAllowed(uint32_t now, bool quiet);
  void startFill(int t, bool autoRun, uint32_t now);
  void startPump(uint32_t now);
  void beginStop(uint32_t now, const char *reason = nullptr);
  void lockout(const char *reason, int tank, uint32_t now);
  void switchTo(int t, uint32_t now);
  void logUsage(bool stopped, uint32_t now);
  void clearLock(uint32_t now);
  void manual(uint32_t now);
  void fillTick(uint32_t now);
  void checkTick(uint32_t now);
  void finishCheckRow(uint32_t now);
  int nextCheckTank(int after);
  void testTick(uint32_t now);
  bool configured(int idx) const;
  bool busy() const { return pumpOn || ph == Phase::Opening || ph == Phase::Switching; }
};

}  // namespace rp
