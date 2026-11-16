// RelaxPump PHE engine — pure C++17, no Arduino (docs/two-module-system.md §4.2).
// A PHE module has 1–5 PHE (government) supply lines. Each line ends in one tank with an
// ultrasonic sensor; a 12 V NC solenoid valve sits on the pipe just before the tank. No pump.
//
//   - Lines are independent; all valves may be open together.
//   - Auto: open the valve when pct < low (reopen, default 85 %); close it at pct >= high (95 %).
//   - Manual: the owner opens/closes a valve. A manually opened valve still closes at high.
//     A valve closed by hand while Auto is on stays closed ("held") until it is opened again or
//     Auto is switched.
//   - Fail safe: a sensor that stops answering closes its valve (event "sensor").
//   - Rising: open valve and level up >= 2 % in 10 min → rising. supply = flowing when any open
//     line rises, none when valves have been open 30 min with no rise, else unknown.
//     Events flow_start / flow_stop, debounced 10 min.
//   - Overflow: valve closed and the level still rises >= 3 % above high (and above where it was
//     when the valve closed) → event "overflow" (valve leaks or is stuck).
//   - Usage: litres received per line (needs litres).
//   - Boot / power cut / Wi-Fi loss: every valve starts closed; Auto resumes from the sensors.
// Host tests: firmware/test/test_phe (scripts/test-native.sh).
#pragma once
#include <stdint.h>

#include "engine.h"

namespace rp {

struct PheLine {
  float emptyCm = 120;  // sensor → tank bottom
  float fullCm = 30;    // sensor → full level (>= 25, blind zone)
  float litres = 0;     // 0 = unknown
};

struct PheLayout {
  int n = 1;  // tankCount = PHE lines 1..5
  PheLine line[MAX_TANKS];
  int low = 85;   // reopen below, 50–95
  int high = 95;  // close at, 60–100
};

/** Clamp to docs/two-module-system.md §3. */
void sanitize(PheLayout &l);

enum class Supply : uint8_t { Unknown, Flowing, None };
const char *supplyName(Supply s);

struct PheTimings {
  uint32_t riseWindowMs = 600000;   // rising: >= risePct within this window (10 min)
  float risePct = 2.0f;
  uint32_t noneAfterMs = 1800000;   // supply none: valves open this long with no rise (30 min)
  uint32_t flowDebounceMs = 600000; // flow_start / flow_stop at most once per 10 min
  float overflowPct = 3.0f;
  int sensorFailMax = 15;
  int detectFailMax = 3;
  uint32_t testMaxMs = 3000;
  uint32_t usageFlushMs = 900000;   // write usage at least every 15 min while a valve is open
};

class PheEngine {
 public:
  PheLayout cfg;
  PheTimings tm;
  bool autoMode = false;

  float level[N_SENSORS];  // %, -1 = unknown (MAIN slot unused)
  float distCm[N_SENSORS];
  bool ok[N_SENSORS];
  bool detected[N_SENSORS];

  bool valveOn[MAX_TANKS];
  bool rising[MAX_TANKS];
  bool held[MAX_TANKS];  // closed by hand while Auto is on
  char msg[96];

  PheEngine();
  void begin(Outputs *o, Sink *s);
  void setLayout(const PheLayout &l, uint32_t now);
  void reading(int idx, float cm, uint32_t now);  // cm < 0 = no echo
  void loop(uint32_t now);

  /** False when refused (sensor error, already full); msg says why. */
  bool cmdValve(int i, bool open, uint32_t now);
  void cmdAuto(bool on, uint32_t now);
  bool cmdTest(int port, uint32_t ms, uint32_t now);
  /** Close every valve (OTA, reset). */
  void closeAll(uint32_t now);
  void reset(uint32_t now);

  Supply supply() const { return sup; }
  int valvesOn() const;
  bool testing() const { return testPort >= 0; }
  bool changed();

 private:
  Outputs *out = nullptr;
  Sink *sink = nullptr;
  bool dirty = true;
  int fails[N_SENSORS], detFails[N_SENSORS];
  // per line
  uint32_t riseAt[MAX_TANKS];  // start of the current rise window
  float riseRef[MAX_TANKS];
  float closedRef[MAX_TANKS];  // level when the valve closed (overflow), -1 = not yet known
  bool overflowSent[MAX_TANKS];
  bool sensorSent[MAX_TANKS];
  float usageRef[MAX_TANKS];
  uint32_t usageAt[MAX_TANKS];
  // supply
  Supply sup = Supply::Unknown;
  bool anyOpenFlag = false;
  uint32_t openSince = 0;   // a valve has been open since
  bool riseSeen = false;
  uint32_t lastRise = 0;    // last time any open line rose
  bool flowState = false;   // after flow_start, before flow_stop
  uint32_t flowEvAt = 0;    // last flow_start / flow_stop
  bool flowEvOnce = false;
  bool notFlowing = false;
  uint32_t notFlowSince = 0;
  // test pulse
  int testPort = -1;
  uint32_t testAt = 0, testMs = 0;

  void say(const char *fmt, ...);
  void ev(const char *type, int tank);
  void setValve(int i, bool on, uint32_t now);
  void flushUsage(int i, uint32_t now);
  void lineTick(int i, uint32_t now);
  void supplyTick(uint32_t now);
};

}  // namespace rp
