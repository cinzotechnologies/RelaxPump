#include "engine.h"

#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

namespace rp {

static int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

// ------------------------------------------------------------------ layout rules
void sanitize(Layout &l) {
  l.n = clampi(l.n, 1, MAX_TANKS);
  for (int i = 0; i < MAX_TANKS; i++) {
    TankCfg &t = l.tank[i];
    if (t.fullCm < 25) t.fullCm = 25;
    if (t.emptyCm < t.fullCm + 10) t.emptyCm = t.fullCm + 10;
    if (t.litres < 0) t.litres = 0;
    if (t.heightFt < 0) t.heightFt = 0;
  }
  l.main.minPct = clampi(l.main.minPct, 5, 40);
  if (l.main.fullCm < 25) l.main.fullCm = 25;
  if (l.main.emptyCm < l.main.fullCm + 10) l.main.emptyCm = l.main.fullCm + 10;
  l.low = clampi(l.low, 5, 80);
  l.high = clampi(l.high, l.low + 10, 100);
  l.maxRunMin = clampi(l.maxRunMin, 5, 180);
}

// ------------------------------------------------------------------ basics
Engine::Engine() {
  for (int i = 0; i < N_SENSORS; i++) {
    level[i] = -1;
    distCm[i] = 0;
    ok[i] = detected[i] = lowSent[i] = false;
    fails[i] = detFails[i] = 0;
  }
  for (int i = 0; i < MAX_TANKS; i++) valveOn[i] = false;
  msg[0] = 0;
}

void Engine::begin(Outputs *o, Sink *s) {
  out = o;
  sink = s;
  allOff();
}

bool Engine::changed() {
  bool d = dirty;
  dirty = false;
  return d;
}

const char *Engine::phaseName() const {
  switch (ph) {
    case Phase::Idle: return "Idle";
    case Phase::Opening: return "Opening valve";
    case Phase::Filling: return "Filling";
    case Phase::Switching: return "Switching tank";
    case Phase::Stopping: return "Stopping";
    case Phase::Locked: return "Locked";
    case Phase::Testing: return "Testing";
  }
  return "?";
}

void Engine::go(Phase p, uint32_t now) {
  ph = p;
  phaseAt = now;
  dirty = true;
}

void Engine::say(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof msg, fmt, ap);
  va_end(ap);
  dirty = true;
}

void Engine::ev(const char *type, int tank, float minutes) {
  if (sink) sink->event(type, tank, runAuto, minutes);
}

bool Engine::configured(int idx) const {
  if (idx == MAIN) return cfg.main.enabled;
  return idx >= 0 && idx < cfg.n;
}

bool Engine::mainLow() const { return cfg.main.enabled && ok[MAIN] && level[MAIN] < cfg.main.minPct; }

bool Engine::coolingDown(uint32_t now) const { return stoppedOnce && now - lastStop < tm.cooldownMs; }

int Engine::valvesOn() const {
  int n = 0;
  for (int i = 0; i < MAX_TANKS; i++) n += valveOn[i];
  return n;
}

/** Water can go somewhere: the active tank's valve is open, or it is the single tank (no valve). */
bool Engine::pathOpen() const {
  if (active < 0 || active >= cfg.n) return false;
  if (!hasValves(cfg)) return true;
  return valveOn[active];
}

// ------------------------------------------------------------------ outputs (with guards)
/** Opening is refused when 2 valves are already on (hard limit: valve power supply). */
bool Engine::setValve(int i, bool on) {
  if (i < 0 || i >= MAX_TANKS) return false;
  if (valveOn[i] == on) return true;
  if (on && valvesOn() >= MAX_VALVES_ON) return false;
  valveOn[i] = on;
  if (out) out->valve(i, on);
  dirty = true;
  return true;
}

void Engine::setPump(bool on) {
  if (on && !pathOpen()) return;  // never against closed valves
  if (pumpOn == on) return;
  pumpOn = on;
  if (out) out->pump(on);
  dirty = true;
}

void Engine::allOff() {
  pumpOn = false;
  if (out) out->pump(false);
  for (int i = 0; i < MAX_TANKS; i++) {
    valveOn[i] = false;
    if (out) out->valve(i, false);
  }
  dirty = true;
}

// ------------------------------------------------------------------ sensors
void Engine::reading(int idx, float cm, uint32_t now) {
  (void)now;
  if (idx < 0 || idx >= N_SENSORS) return;
  if (cm < 0) {
    if (detFails[idx] < 1000) detFails[idx]++;
    if (fails[idx] < 1000) fails[idx]++;
    if (detFails[idx] >= tm.detectFailMax && detected[idx]) {
      detected[idx] = false;
      dirty = true;
    }
    if (fails[idx] >= tm.sensorFailMax && ok[idx]) {
      ok[idx] = false;
      level[idx] = -1;
      dirty = true;
    }
    return;
  }
  detFails[idx] = fails[idx] = 0;
  if (!detected[idx]) dirty = true;
  detected[idx] = true;
  distCm[idx] = cm;
  if (!configured(idx)) {
    if (ok[idx]) dirty = true;
    ok[idx] = false;
    level[idx] = -1;
    return;
  }
  if (!ok[idx]) dirty = true;
  ok[idx] = true;
  float e = idx == MAIN ? cfg.main.emptyCm : cfg.tank[idx].emptyCm;
  float f = idx == MAIN ? cfg.main.fullCm : cfg.tank[idx].fullCm;
  float span = e - f < 5 ? 5 : e - f;
  float p = (e - cm) * 100.0f / span;
  p = p < 0 ? 0 : p > 100 ? 100 : p;
  float prev = level[idx];
  level[idx] = prev < 0 ? p : prev * 0.6f + p * 0.4f;  // smoothing
  if (lroundf(prev) != lroundf(level[idx])) dirty = true;

  if (idx == MAIN) {
    if (level[idx] < cfg.main.minPct && !lowSent[idx]) {
      lowSent[idx] = true;
      if (sink) sink->event("main_low", -1, false, 0);
    } else if (level[idx] > cfg.main.minPct + tm.mainHysteresis) {
      lowSent[idx] = false;
    }
  } else if (level[idx] < cfg.low && !lowSent[idx]) {
    lowSent[idx] = true;  // "low" once per crossing below Start
    if (sink) sink->event("low", idx, false, 0);
  } else if (level[idx] > cfg.low + 5) {
    lowSent[idx] = false;
  }
}

// ------------------------------------------------------------------ choosing
int Engine::pickAuto(int except) const {
  int best = -1;
  for (int i = 0; i < cfg.n; i++) {
    if (i == except || !ok[i] || level[i] >= cfg.low) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    long a = lroundf(level[i]), b = lroundf(level[best]);
    if (a < b) best = i;
    else if (a == b) {  // tie: the lower-placed tank first, when heights are known
      float hi = cfg.tank[i].heightFt, hb = cfg.tank[best].heightFt;
      if (hi > 0 && hb > 0 && hi < hb) best = i;
    }
  }
  return best;
}

bool Engine::pumpAllowed(uint32_t now, bool quiet) {
  if (mainLow() || mainHold) {
    if (!quiet) say("Main tank is low. The pump will not start.");
    return false;
  }
  if (coolingDown(now)) {
    if (!quiet) say("Pump is resting. Try again in a minute.");
    return false;
  }
  return true;
}

// ------------------------------------------------------------------ fill sequence
void Engine::startFill(int t, bool autoRun, uint32_t now) {
  if (t < 0 || t >= cfg.n) return;
  // one tank at a time: close the others first, then open this one
  for (int i = 0; i < MAX_TANKS; i++)
    if (i != t) setValve(i, false);
  if (hasValves(cfg) && !setValve(t, true)) return;
  active = t;
  runAuto = autoRun;
  msg[0] = 0;
  go(Phase::Opening, now);
}

void Engine::startPump(uint32_t now) {
  if (!pathOpen()) {
    beginStop(now);
    return;
  }
  if (!pumpAllowed(now, false)) {
    if (mainLow()) mainHold = true;
    beginStop(now);
    return;
  }
  setPump(true);
  if (!pumpOn) {
    beginStop(now);
    return;
  }
  runStart = tankStart = riseAt = now;
  startPct = risePct = level[active];
  ev("pump_on", active);
  go(Phase::Filling, now);
}

void Engine::logUsage(bool stopped, uint32_t now) {
  if (active < 0) return;
  float minutes = (now - tankStart) / 60000.0f;
  float rise = level[active] >= 0 ? fmaxf(0.0f, level[active] - startPct) : 0;
  float litres = cfg.tank[active].litres * rise / 100.0f;
  if (stopped) ev("pump_off", active, minutes);
  if (sink) sink->usage(active, minutes, litres);
}

void Engine::beginStop(uint32_t now, const char *reason) {
  bool wasOn = pumpOn;
  stopWaitMs = wasOn ? tm.pumpStopMs : 0;
  setPump(false);
  if (wasOn) logUsage(true, now);
  if (reason) ev(reason, active >= 0 ? active : 0);
  go(Phase::Stopping, now);
}

void Engine::lockout(const char *reason, int tank, uint32_t now) {
  checkRun = false;
  beginStop(now);
  ev(reason, tank);
  lockAfterStop = true;
}

void Engine::switchTo(int t, uint32_t now) {
  if (!hasValves(cfg) || t == active) return;
  // Open the new valve first, close the old one after `switchMs` (2 valves on only here).
  for (int i = 0; i < MAX_TANKS; i++)
    if (i != t && i != active) setValve(i, false);
  if (!setValve(t, true)) return;
  logUsage(false, now);
  next = t;
  go(Phase::Switching, now);
}

void Engine::fillTick(uint32_t now) {
  int t = active;
  if (t < 0 || !pathOpen() || !pumpOn) {
    beginStop(now);
    return;
  }
  uint32_t run = now - runStart;

  if (mainLow()) {
    mainHold = true;
    say("Main tank is low. Pump stopped.");
    beginStop(now);
    return;
  }
  if (!ok[t]) {
    lockout("sensor", t, now);
    say("Tank %d sensor error. Pump stopped.", t + 1);
    return;
  }
  if (checkRun) {
    checkTick(now);
    if (ph != Phase::Filling) return;
  }
  if (run > (uint32_t)cfg.maxRunMin * 60000UL) {
    lockout("timeout", t, now);
    say("Pump ran %d min. Check the main tank and pipes.", cfg.maxRunMin);
    return;
  }
  if (now - riseAt > tm.noRiseMs) {
    if (level[t] - risePct < tm.noRisePct) {
      lockout("dry_run", t, now);
      say("Tank %d not rising. Check the main tank.", t + 1);
      return;
    }
    riseAt = now;
    risePct = level[t];
  }
  if (level[t] >= cfg.high) {
    ev("full", t);
    int n = runAuto && autoMode ? pickAuto(t) : -1;
    if (n >= 0) switchTo(n, now);
    if (ph != Phase::Switching) beginStop(now);
  }
}

// ------------------------------------------------------------------ pump check
int Engine::nextCheckTank(int afterIdx) {
  for (int i = afterIdx + 1; i < cfg.n; i++) {
    if (ok[i] && level[i] < cfg.high - 2) return i;
    check[i].done = check[i].skipped = true;
    dirty = true;
  }
  return -1;
}

void Engine::finishCheckRow(uint32_t now) {
  CheckRow &r = check[active];
  float mins = (now - tankStart) / 60000.0f;
  float rise = level[active] - startPct;
  r.pctMin = mins > 0 ? rise / mins : 0;
  if (r.pctMin < 0) r.pctMin = 0;
  r.lpm = cfg.tank[active].litres > 0 ? r.pctMin * cfg.tank[active].litres / 100.0f : -1;
  r.minToFull = r.pctMin > 0.01f ? 100.0f / r.pctMin : -1;
  r.slow = r.pctMin < tm.noRisePct / (tm.noRiseMs / 60000.0f);
  r.done = true;
  dirty = true;
}

void Engine::checkTick(uint32_t now) {
  if (now - tankStart < tm.checkMs && level[active] < cfg.high) return;
  finishCheckRow(now);
  int n = nextCheckTank(active);
  if (n >= 0) {
    switchTo(n, now);
  } else {
    checkRun = false;
    ev("check_done", -1);
    beginStop(now);
  }
}

bool Engine::cmdPumpCheck(uint32_t now) {
  if (ph == Phase::Locked) reset(now);
  if (ph != Phase::Idle) {
    say("Busy. Stop filling first.");
    return false;
  }
  for (int i = 0; i < MAX_TANKS; i++) check[i] = CheckRow();
  int t = nextCheckTank(-1);
  if (t < 0) {
    say("No tank to check: all full or no sensor answer.");
    return false;
  }
  if (!pumpAllowed(now, false)) return false;
  checkRun = true;
  startFill(t, false, now);
  return true;
}

// ------------------------------------------------------------------ test pulses
bool Engine::cmdTest(int port, uint32_t ms, uint32_t now) {
  if (ph == Phase::Locked) reset(now);
  if (ph != Phase::Idle) {
    say("Busy. Stop filling first.");
    return false;
  }
  if (ms > tm.testMaxMs) ms = tm.testMaxMs;
  if (ms < 100) ms = 100;
  testMs = ms;
  for (int i = 0; i < MAX_TANKS; i++) setValve(i, false);  // a test drives one output at a time
  if (port >= 0 && port < MAX_TANKS) {
    setValve(port, true);  // valve alone, no pump (any port V1–V5: setup may test before saving)
    testStage = 1;
  } else if (port == PORT_PUMP) {
    if (!pumpAllowed(now, false)) return false;
    // The pump test pushes a little water into tank 1. V1 is opened first even with one tank
    // (no valve there: the relay clicks on nothing), so a valve wired before the layout is saved
    // is never pumped against while closed.
    active = 0;
    setValve(0, true);
    testStage = 0;
  } else {
    return false;
  }
  testPort = port;
  msg[0] = 0;
  go(Phase::Testing, now);
  return true;
}

void Engine::testTick(uint32_t now) {
  uint32_t in = now - phaseAt;
  if (testPort == PORT_PUMP) {
    if (testStage == 0 && in >= tm.valveLeadMs) {
      setPump(true);
      testStage = 1;
      phaseAt = now;
    } else if (testStage == 1 && in >= testMs) {
      setPump(false);
      testStage = 2;
      phaseAt = now;
    } else if (testStage == 2 && in >= tm.pumpStopMs) {
      setValve(0, false);
      active = -1;
      lastStop = now;
      stoppedOnce = true;
      testPort = -1;
      go(Phase::Idle, now);
    }
    return;
  }
  if (in < testMs) return;
  setValve(testPort, false);
  testPort = -1;
  go(Phase::Idle, now);
}

// ------------------------------------------------------------------ main loop
void Engine::loop(uint32_t now) {
  if (mainHold && (!cfg.main.enabled || !ok[MAIN] || level[MAIN] >= cfg.main.minPct + tm.mainHysteresis))
    mainHold = false;
  uint32_t in = now - phaseAt;

  switch (ph) {
    case Phase::Idle:
      if (autoMode) {
        int t = pickAuto(-1);
        if (t >= 0 && pumpAllowed(now, true)) startFill(t, true, now);
      }
      break;
    case Phase::Opening:
      if (in >= (hasValves(cfg) ? tm.valveLeadMs : 0)) startPump(now);
      break;
    case Phase::Filling:
      fillTick(now);
      break;
    case Phase::Switching:
      if (in >= tm.switchMs) {
        setValve(active, false);
        active = next;
        next = -1;
        tankStart = riseAt = now;
        startPct = risePct = level[active];
        ev("pump_on", active);
        go(Phase::Filling, now);
      }
      break;
    case Phase::Stopping:
      if (in >= stopWaitMs) {
        for (int i = 0; i < MAX_TANKS; i++) setValve(i, false);
        active = next = -1;
        lastStop = now;
        stoppedOnce = true;
        bool lock = lockAfterStop;
        lockAfterStop = false;
        go(lock ? Phase::Locked : Phase::Idle, now);
      }
      break;
    case Phase::Testing:
      testTick(now);
      break;
    case Phase::Locked:
      break;  // cleared by any app/serial command
  }
}

// ------------------------------------------------------------------ commands
void Engine::reset(uint32_t now) {
  allOff();
  active = next = -1;
  checkRun = false;
  testPort = -1;
  lockAfterStop = false;
  msg[0] = 0;
  go(Phase::Idle, now);
}

void Engine::clearLock(uint32_t now) {
  if (ph == Phase::Locked) reset(now);
}

/** Every manual command: clears a lockout, turns Auto off, cancels the pump check. */
void Engine::manual(uint32_t now) {
  clearLock(now);
  if (autoMode) autoMode = false;
  if (checkRun) checkRun = false;
  msg[0] = 0;
  dirty = true;
}

void Engine::cmdPump(bool on, uint32_t now) {
  manual(now);
  if (!on) {
    if (busy() || ph == Phase::Testing) beginStop(now);
    return;
  }
  if (pumpOn || ph == Phase::Opening) return;
  if (ph != Phase::Idle) {
    say("Busy. Try again in a moment.");
    return;
  }
  int t = -1;
  if (!hasValves(cfg)) t = 0;  // the only tank: no valve to choose
  else
    for (int i = 0; i < cfg.n; i++)
      if (valveOn[i]) {
        t = i;
        break;
      }
  if (t < 0) {
    say("Open a valve first");
    return;
  }
  if (!pumpAllowed(now, false)) return;
  startFill(t, false, now);
}

void Engine::cmdValve(int i, bool open, uint32_t now) {
  if (i < 0 || i >= cfg.n || !hasValves(cfg)) return;  // one tank: there is no valve
  manual(now);
  if (!open && valveOn[i] && busy() && active == i) {
    say("Pump stopped first");
    beginStop(now);  // pump off → wait → valve closes
    return;
  }
  if (open && ph == Phase::Filling && i != active) {
    switchTo(i, now);  // one tank at a time: open the new one, then close the old one
    return;
  }
  if (ph != Phase::Idle) return;  // busy
  if (open)
    for (int k = 0; k < MAX_TANKS; k++)
      if (k != i) setValve(k, false);  // idle: only one valve open
  setValve(i, open);
}

void Engine::cmdAuto(bool on, uint32_t now) {
  clearLock(now);
  if (on && ph != Phase::Idle && !runAuto) beginStop(now);  // manual → auto: stop first
  autoMode = on;
  msg[0] = 0;
  dirty = true;
}

void Engine::offlineGuard(uint32_t offlineMs, uint32_t now) {
  if (pumpOn && offlineMs > (uint32_t)cfg.maxRunMin * 60000UL) {
    lockout("timeout", active, now);
    say("Lost internet while filling. Stopped for safety.");
  }
}

void Engine::setLayout(const Layout &l, uint32_t now) {
  bool hadValves = hasValves(cfg);
  cfg = l;
  sanitize(cfg);
  // The tank was removed, or one tank ↔ several (the water path changed): stop safely.
  if (busy() && (active >= cfg.n || hadValves != hasValves(cfg))) beginStop(now);
  for (int i = 0; i < N_SENSORS; i++)
    if (!configured(i)) {
      ok[i] = false;
      level[i] = -1;
    }
  if (ph == Phase::Idle)
    for (int i = hasValves(cfg) ? cfg.n : 0; i < MAX_TANKS; i++) setValve(i, false);
  dirty = true;
}

}  // namespace rp
