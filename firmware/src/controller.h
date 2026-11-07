// Pump/valve state machine with the safety rules (CLAUDE.md §7, legacy TankController.ino).
#pragma once
#include "config.h"

struct TankCfg {
  float emptyCm = 120;  // sensor → tank bottom
  float fullCm = 30;    // sensor → full water level (≥ 25, blind zone)
  float litres = 0;     // 0 = unknown
};

struct Settings {
  int tankCount = MAX_TANKS;
  int low = 20;
  int high = 95;
  int maxRunMin = 30;
  bool autoMode = false;  // starts OFF on a fresh board: test first
  TankCfg tanks[MAX_TANKS];
};

enum class Phase { Idle, Opening, Pumping, Switching, Stopping, Locked };

/** What the controller reports to the cloud. */
struct Listener {
  virtual void onEvent(const char *type, int tank, bool autoRun, float minutes) = 0;
  virtual void onUsage(int tank, float minutes, float litres) = 0;
  virtual ~Listener() = default;
};

class Controller {
 public:
  Settings cfg;
  float level[MAX_TANKS] = {-1, -1, -1};  // %, -1 = unknown
  float distCm[MAX_TANKS] = {0, 0, 0};
  bool sensorOk[MAX_TANKS] = {false, false, false};
  String msg;  // shown in the app (state.msg)

  void begin(Listener *l);
  void loop();  // call often
  void readNextSensor();

  // Commands (app / serial). Any command also clears a lockout.
  void cmdPump(bool on);
  void cmdValve(int t, bool open);
  void cmdAuto(bool on);
  void reset();

  void applySettings(const Settings &s);  // from cloud config (keeps autoMode)
  void loadSettings();
  void saveSettings();

  /** Call while the pump runs and the cloud is unreachable; stops everything after maxRunMin. */
  void offlineGuard(uint32_t offlineMs);

  Phase phase() const { return ph; }
  int activeTank() const { return active; }
  bool changed();  // true once after something the app shows changed
  const char *phaseName() const;

 private:
  Listener *ls = nullptr;
  Phase ph = Phase::Idle;
  int active = -1, next = -1;
  uint32_t phaseAt = 0, runStart = 0, lastStop = 0, riseAt = 0;
  float risePct = 0, startPct = 0;
  bool runAuto = false;
  bool dirty = true;
  bool lowSent[MAX_TANKS] = {false, false, false};
  int sensorIdx = 0;
  uint32_t lastSensorAt = 0;

  void go(Phase p);
  void startFill(int t, bool autoRun);
  void beginStop(const char *reason = nullptr);
  void lockout(const char *reason, int tank, const String &text);
  int pickLowest(int except) const;
  void updateSensor(int t);
  bool coolingDown() const;
  void logUsage(bool stopped);
};
