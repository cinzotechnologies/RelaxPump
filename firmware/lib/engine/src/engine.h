// RelaxPump fill engine — pure C++17, no Arduino. Decides every valve / pump / PHE move from the
// layout (docs/flexible-system.md), the sensor readings and the commands. The board code
// (src/) feeds it readings and the time, and turns its output calls into pins.
// Unit-tested on the host: firmware/test/ (pio test -e native, or scripts/test-native.*).
//
// Safety (CLAUDE.md §7, kept exactly):
//   pump fill:  open tank valve → 2 s → pump on … pump off → 3 s → close valve
//   PHE fill:   open tank valve → 2 s → PHE on  … PHE off  → 2 s → close valve
//   one tank at a time; pump and PHE never together; never pump with no open path;
//   max run time; dry-run stop (< 2 % in 5 min); 60 s cooldown before the pump restarts;
//   stop on sensor failure; everything off when offline longer than the max run time.
#pragma once
#include <stdint.h>

namespace rp {

constexpr int MAX_SEMI = 8;
constexpr int MAIN = 8;      // sensor index of the main tank
constexpr int N_SENSORS = 9;
constexpr int PORT_PHE = 8;  // test ports: 0..7 = V1..V8
constexpr int PORT_PUMP = 9;

enum class Src : uint8_t { None, Pump, Phe };
enum class Mode : uint8_t { Auto, Phe, Pump };
enum class Phase : uint8_t { Idle, Opening, Filling, Switching, Stopping, Locked, Testing };

struct Timings {
  uint32_t valveLeadMs = 2000;   // valve open → source on
  uint32_t pumpStopMs = 3000;    // pump off → close valve
  uint32_t pheStopMs = 2000;     // PHE off → close valve
  uint32_t switchMs = 1500;      // switching tanks: open new, then close old
  uint32_t cooldownMs = 60000;   // rest before the pump may start again
  uint32_t noRiseMs = 300000;    // dry-run window
  float noRisePct = 2.0f;        // must rise this much per window (and per PHE probe)
  int sensorFailMax = 15;        // consecutive bad readings → sensor error
  int detectFailMax = 3;         // consecutive bad readings → "No answer" in setup
  uint32_t checkMs = 120000;     // pump check: per tank
  uint32_t testMaxMs = 3000;     // cmd.test pulse limit
  float mainHysteresis = 5.0f;   // main tank must recover minPct + this before Auto restarts
};

struct SemiCfg {
  bool sensor = true;
  bool valve = true;
  float emptyCm = 120;  // sensor → tank bottom
  float fullCm = 30;    // sensor → full level (≥ 25, blind zone)
  float litres = 0;     // 0 = unknown
  float heightFt = 0;   // 0 = unknown
  int fillMin = 0;      // fill time when there is no sensor
};

struct MainCfg {
  bool enabled = false;
  bool sensor = false;
  float emptyCm = 200;
  float fullCm = 30;
  float litres = 0;
  int minPct = 10;
};

struct PheCfg {
  bool enabled = false;
  int probeMin = 4;
  int retryMin = 30;
};

struct Ports {
  int sensors = 3;
  int valves = 3;
  bool phe = false;
  bool main = false;
};

struct Layout {
  int n = 3;
  SemiCfg semi[MAX_SEMI];
  MainCfg main;
  PheCfg phe;
  Mode mode = Mode::Pump;
  int low = 20;
  int high = 95;
  int maxRunMin = 30;
};

/** Clamp to the ports and the rules of docs/flexible-system.md §2. */
void sanitize(Layout &l, const Ports &p);

/** Tanks Auto (and the pump check) may fill: sensor + valve, or the single tank with a sensor. */
bool autoCapable(const Layout &l, int i);

/** May this tank be filled at all? (2+ tanks: needs a valve.) */
bool fillable(const Layout &l, int i);

struct Outputs {
  virtual void valve(int i, bool on) = 0;
  virtual void pump(bool on) = 0;
  virtual void phe(bool on) = 0;
  virtual ~Outputs() = default;
};

struct Sink {
  virtual void event(const char *type, int tank, bool autoRun, float minutes) = 0;
  virtual void usage(int tank, float minutes, float litres, bool phe) = 0;
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
  Ports ports;
  Timings tm;
  bool autoMode = false;

  float level[N_SENSORS];  // %, -1 = unknown
  float distCm[N_SENSORS];
  bool ok[N_SENSORS];        // configured sensor gives readings
  bool detected[N_SENSORS];  // the port answers at all (setup wizard)

  bool valveOn[MAX_SEMI];
  bool pumpOn = false;
  bool pheOn = false;
  char msg[96];

  bool checkRun = false;
  CheckRow check[MAX_SEMI];

  Engine();
  void begin(Outputs *o, Sink *s);
  void setLayout(const Layout &l, uint32_t now);
  void reading(int idx, float cm, uint32_t now);  // cm < 0 = no echo
  void loop(uint32_t now);

  // Commands (app / serial). Any command clears a lockout.
  void cmdPump(bool on, uint32_t now);
  void cmdPhe(bool on, uint32_t now);
  void cmdValve(int i, bool open, uint32_t now);
  void cmdFill(int i, Src s, uint32_t now);
  void cmdAuto(bool on, uint32_t now);
  bool cmdTest(int port, uint32_t ms, uint32_t now);
  bool cmdPumpCheck(uint32_t now);
  void reset(uint32_t now);

  /** Call while the cloud is unreachable; stops everything after maxRunMin. */
  void offlineGuard(uint32_t offlineMs, uint32_t now);
  /** Valve board (MCP23017) error: pump and PHE off at once, lockout. */
  void boardFault(uint32_t now);

  Phase phase() const { return ph; }
  int activeTank() const { return active; }
  Src source() const { return src; }
  bool mainLow() const;
  bool changed();  // true once after something the app shows changed
  const char *phaseName() const;
  /** For the next pump start (cooldown). */
  bool coolingDown(uint32_t now) const;

 private:
  Outputs *out = nullptr;
  Sink *sink = nullptr;
  Phase ph = Phase::Idle;
  Src src = Src::None;
  int active = -1, next = -1;
  bool runAuto = false, lockAfterStop = false, timed = false, probing = false;
  uint32_t phaseAt = 0, runStart = 0, tankStart = 0, riseAt = 0, probeAt = 0, lastStop = 0;
  uint32_t pheRetryAt = 0;  // PHE not tried again before this (0 = any time)
  bool pheRetryArmed = false;
  bool stoppedOnce = false, boardErr = false;
  uint32_t stopWaitMs = 0;
  float startPct = 0, risePct = 0, probePct = 0;
  bool dirty = true;
  bool lowSent[N_SENSORS];
  bool mainHold = false;  // main tank was low; wait for it to recover
  int fails[N_SENSORS], detFails[N_SENSORS];
  // pending fill after a stop (fallback to the pump, or a manual fill while busy)
  int pendTank = -1;
  Src pendSrc = Src::None;
  bool pendAuto = false;
  // test pulse
  int testPort = -1, testStage = 0;
  uint32_t testMs = 0;

  void go(Phase p, uint32_t now);
  void say(const char *fmt, ...);
  void ev(const char *type, int tank, float minutes = 0);
  void setValve(int i, bool on);
  void setPump(bool on);
  void setPhe(bool on);
  void allOff();
  bool pathOpen() const;
  bool sourceOn() const { return pumpOn || pheOn; }

  int pickAuto(int except) const;
  Src autoSource(uint32_t now) const;
  bool pumpAllowed(uint32_t now, bool quiet, bool anyMode = false);
  void startFill(int t, Src s, bool autoRun, uint32_t now);
  void startSource(uint32_t now);
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
  void pheFail(uint32_t now);
  void testTick(uint32_t now);
  bool configured(int idx) const;
};

}  // namespace rp
