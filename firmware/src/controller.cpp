#include "controller.h"

#include <Preferences.h>

#include "hw.h"

static Preferences prefs;

const char *Controller::phaseName() const {
  switch (ph) {
    case Phase::Idle: return "Idle";
    case Phase::Opening: return "Opening valve";
    case Phase::Pumping: return "Pumping";
    case Phase::Switching: return "Switching tank";
    case Phase::Stopping: return "Stopping";
    case Phase::Locked: return "Locked";
  }
  return "?";
}

void Controller::begin(Listener *l) {
  ls = l;
  loadSettings();
}

bool Controller::changed() {
  bool d = dirty;
  dirty = false;
  return d;
}

void Controller::go(Phase p) {
  ph = p;
  phaseAt = millis();
  dirty = true;
}

bool Controller::coolingDown() const { return lastStop != 0 && millis() - lastStop < COOLDOWN_MS; }

// ------------------------------ Sensors ------------------------------
void Controller::updateSensor(int t) {
  if (t >= cfg.tankCount) {
    sensorOk[t] = false;
    level[t] = -1;
    return;
  }
  static int fails[MAX_TANKS] = {0, 0, 0};
  float d = hw::readMedianCm(t);
  if (d < 0) {
    if (fails[t] < 1000) fails[t]++;
    if (fails[t] >= SENSOR_FAIL_MAX && sensorOk[t]) {
      sensorOk[t] = false;
      level[t] = -1;
      dirty = true;
    }
    return;
  }
  fails[t] = 0;
  if (!sensorOk[t]) dirty = true;
  sensorOk[t] = true;
  distCm[t] = d;
  float span = cfg.tanks[t].emptyCm - cfg.tanks[t].fullCm;
  if (span < 5) span = 5;
  float p = (cfg.tanks[t].emptyCm - d) * 100.0f / span;
  p = constrain(p, 0.0f, 100.0f);
  float prev = level[t];
  level[t] = prev < 0 ? p : prev * 0.6f + p * 0.4f;  // smoothing
  if ((int)roundf(prev) != (int)roundf(level[t])) dirty = true;

  // "low" event once per crossing below Start.
  if (level[t] < cfg.low && !lowSent[t]) {
    lowSent[t] = true;
    if (ls) ls->onEvent("low", t, false, 0);
  } else if (level[t] > cfg.low + 5) {
    lowSent[t] = false;
  }
}

void Controller::readNextSensor() {
  if (millis() - lastSensorAt < SENSOR_STEP_MS) return;
  lastSensorAt = millis();
  updateSensor(sensorIdx);
  sensorIdx = (sensorIdx + 1) % MAX_TANKS;
}

int Controller::pickLowest(int except) const {
  int best = -1;
  for (int i = 0; i < cfg.tankCount; i++) {
    if (i == except || !sensorOk[i] || level[i] >= cfg.low) continue;
    if (best < 0 || level[i] < level[best]) best = i;
  }
  return best;
}

// ------------------------------ State machine ------------------------
void Controller::startFill(int t, bool autoRun) {
  Serial.printf("[RUN] fill Tank %d (%.0f%%)%s\n", t + 1, level[t], autoRun ? " auto" : "");
  for (int i = 0; i < MAX_TANKS; i++) hw::setValve(i, i == t);  // one tank at a time
  active = t;
  runAuto = autoRun;
  msg = "";
  go(Phase::Opening);
}

void Controller::logUsage(bool stopped) {
  if (active < 0) return;
  float minutes = (millis() - runStart) / 60000.0f;
  float rise = level[active] >= 0 ? max(0.0f, level[active] - startPct) : 0;
  float litres = cfg.tanks[active].litres * rise / 100.0f;
  if (ls) {
    if (stopped) ls->onEvent("pump_off", active, runAuto, minutes);
    ls->onUsage(active, minutes, litres);
  }
}

void Controller::beginStop(const char *reason) {
  if (hw::pumpOn) {
    hw::setPump(false);
    logUsage(true);
  }
  if (reason && ls) ls->onEvent(reason, max(active, 0), runAuto, 0);
  go(Phase::Stopping);
}

void Controller::lockout(const char *reason, int tank, const String &text) {
  Serial.println("[LOCK] " + text);
  if (hw::pumpOn) {
    hw::setPump(false);
    logUsage(true);
  }
  if (ls) ls->onEvent(reason, max(tank, 0), runAuto, 0);
  msg = text;
  // Valves close after the normal stop delay; Stopping → Locked.
  go(Phase::Stopping);
  next = -2;  // marker: lock after stopping
}

void Controller::loop() {
  readNextSensor();
  uint32_t now = millis();
  uint32_t in = now - phaseAt;

  switch (ph) {
    case Phase::Idle:
      if (cfg.autoMode && !coolingDown()) {
        int t = pickLowest(-1);
        if (t >= 0) startFill(t, true);
      }
      break;

    case Phase::Opening:
      if (in >= VALVE_LEAD_MS) {
        if (!hw::setPump(true)) {
          go(Phase::Idle);
          break;
        }
        runStart = riseAt = now;
        startPct = risePct = level[active];
        if (ls) ls->onEvent("pump_on", active, runAuto, 0);
        go(Phase::Pumping);
      }
      break;

    case Phase::Pumping: {
      int t = active;
      if (t < 0 || hw::openValves() == 0) {
        beginStop();
        break;
      }
      if (!sensorOk[t]) {
        lockout("sensor", t, "Tank " + String(t + 1) + " sensor error. Pump stopped.");
        break;
      }
      if (now - runStart > (uint32_t)cfg.maxRunMin * 60000UL) {
        lockout("timeout", t, "Pump ran " + String(cfg.maxRunMin) + " min. Check the sump and pipes.");
        break;
      }
      if (now - riseAt > NO_RISE_MS) {
        if (level[t] - risePct < NO_RISE_PCT) {
          lockout("dry_run", t, "Tank " + String(t + 1) + " not rising. Check the sump.");
          break;
        }
        riseAt = now;
        risePct = level[t];
      }
      if (level[t] >= cfg.high) {
        Serial.printf("[RUN] Tank %d full\n", t + 1);
        if (ls) ls->onEvent("full", t, runAuto, 0);
        int n = runAuto && cfg.autoMode ? pickLowest(t) : -1;
        if (n >= 0) {
          // Usage for the finished tank, then switch: open the new valve first.
          logUsage(false);
          next = n;
          hw::setValve(n, true);
          go(Phase::Switching);
        } else {
          beginStop();
        }
      }
      break;
    }

    case Phase::Switching:
      if (in >= SWITCH_MS) {
        hw::setValve(active, false);
        active = next;
        next = -1;
        runStart = riseAt = now;
        startPct = risePct = level[active];
        if (ls) ls->onEvent("pump_on", active, runAuto, 0);
        go(Phase::Pumping);
      }
      break;

    case Phase::Stopping:
      if (in >= PUMP_STOP_MS) {
        for (int i = 0; i < MAX_TANKS; i++) hw::setValve(i, false);
        active = -1;
        lastStop = millis();
        bool lock = next == -2;
        next = -1;
        go(lock ? Phase::Locked : Phase::Idle);
      }
      break;

    case Phase::Locked:
      break;  // cleared by any app/serial command
  }
}

// ------------------------------ Commands -----------------------------
void Controller::cmdPump(bool on) {
  if (ph == Phase::Locked) reset();
  if (cfg.autoMode) {
    cfg.autoMode = false;
    saveSettings();
  }
  msg = "";
  if (!on) {
    if (hw::pumpOn || ph == Phase::Opening || ph == Phase::Switching) beginStop();
    dirty = true;
    return;
  }
  if (hw::pumpOn || ph == Phase::Opening) return;
  if (coolingDown()) {
    msg = "Pump is resting. Try again in a minute.";
    dirty = true;
    return;
  }
  int t = -1;
  for (int i = 0; i < cfg.tankCount; i++)
    if (hw::valveOn[i]) {
      t = i;
      break;
    }
  if (t < 0) {
    msg = "Open a valve first";
    dirty = true;
    return;
  }
  startFill(t, false);
}

void Controller::cmdValve(int t, bool open) {
  if (t < 0 || t >= cfg.tankCount) return;
  if (ph == Phase::Locked) reset();
  if (cfg.autoMode) {
    cfg.autoMode = false;
    saveSettings();
  }
  msg = "";
  dirty = true;
  if (!open && hw::valveOn[t] && hw::pumpOn && hw::openValves() == 1) {
    msg = "Pump stopped first";
    beginStop();  // pump off → wait → valve closes
    return;
  }
  if (open && hw::pumpOn && ph == Phase::Pumping && t != active) {
    // One tank at a time: switch to the new tank (open new, then close old).
    logUsage(false);
    hw::setValve(t, true);
    next = t;
    go(Phase::Switching);
    return;
  }
  if (ph == Phase::Stopping || ph == Phase::Opening || ph == Phase::Switching) return;  // busy
  hw::setValve(t, open);
}

void Controller::cmdAuto(bool on) {
  if (ph == Phase::Locked) reset();
  if (on && ph != Phase::Idle && !runAuto) beginStop();  // manual → auto: stop first
  cfg.autoMode = on;
  msg = "";
  saveSettings();
  dirty = true;
}

void Controller::reset() {
  hw::allOff();
  active = -1;
  next = -1;
  msg = "";
  go(Phase::Idle);
}

void Controller::offlineGuard(uint32_t offlineMs) {
  if (hw::pumpOn && offlineMs > (uint32_t)cfg.maxRunMin * 60000UL) {
    lockout("timeout", active, "Lost internet while pumping. Stopped for safety.");
  }
}

// ------------------------------ Settings -----------------------------
void Controller::applySettings(const Settings &s) {
  bool a = cfg.autoMode;
  cfg = s;
  cfg.autoMode = a;
  cfg.tankCount = constrain(cfg.tankCount, 1, MAX_TANKS);
  cfg.low = constrain(cfg.low, 5, 80);
  cfg.high = constrain(cfg.high, cfg.low + 10, 100);
  cfg.maxRunMin = constrain(cfg.maxRunMin, 5, 180);
  for (int i = 0; i < MAX_TANKS; i++) {
    if (cfg.tanks[i].fullCm < 25) cfg.tanks[i].fullCm = 25;
    if (cfg.tanks[i].emptyCm < cfg.tanks[i].fullCm + 10) cfg.tanks[i].emptyCm = cfg.tanks[i].fullCm + 10;
  }
  // A tank that was removed while filling: stop.
  if (active >= cfg.tankCount && hw::pumpOn) beginStop();
  saveSettings();
  dirty = true;
}

void Controller::loadSettings() {
  prefs.begin("rp", true);
  for (int i = 0; i < MAX_TANKS; i++) {
    cfg.tanks[i].emptyCm = prefs.getFloat(("e" + String(i)).c_str(), 120);
    cfg.tanks[i].fullCm = prefs.getFloat(("f" + String(i)).c_str(), 30);
    cfg.tanks[i].litres = prefs.getFloat(("l" + String(i)).c_str(), 0);
  }
  cfg.tankCount = prefs.getInt("n", MAX_TANKS);
  cfg.low = prefs.getInt("low", 20);
  cfg.high = prefs.getInt("high", 95);
  cfg.maxRunMin = prefs.getInt("maxrun", 30);
  cfg.autoMode = prefs.getBool("auto", false);
  prefs.end();
}

void Controller::saveSettings() {
  prefs.begin("rp", false);
  for (int i = 0; i < MAX_TANKS; i++) {
    prefs.putFloat(("e" + String(i)).c_str(), cfg.tanks[i].emptyCm);
    prefs.putFloat(("f" + String(i)).c_str(), cfg.tanks[i].fullCm);
    prefs.putFloat(("l" + String(i)).c_str(), cfg.tanks[i].litres);
  }
  prefs.putInt("n", cfg.tankCount);
  prefs.putInt("low", cfg.low);
  prefs.putInt("high", cfg.high);
  prefs.putInt("maxrun", cfg.maxRunMin);
  prefs.putBool("auto", cfg.autoMode);
  prefs.end();
}
