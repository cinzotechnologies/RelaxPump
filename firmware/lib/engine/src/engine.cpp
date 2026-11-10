#include "engine.h"

#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

namespace rp {

static int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }
static bool after(uint32_t now, uint32_t t) { return (int32_t)(now - t) >= 0; }

// ------------------------------------------------------------------ layout rules
void sanitize(Layout &l, const Ports &p) {
  int maxN = clampi(p.sensors > p.valves ? p.sensors : p.valves, 1, MAX_SEMI);
  l.n = clampi(l.n, 1, maxN);
  for (int i = 0; i < MAX_SEMI; i++) {
    SemiCfg &t = l.semi[i];
    if (i >= p.sensors) t.sensor = false;
    if (i >= p.valves) t.valve = false;
    if (t.fullCm < 25) t.fullCm = 25;
    if (t.emptyCm < t.fullCm + 10) t.emptyCm = t.fullCm + 10;
    if (!t.sensor && (t.fillMin < 1 || t.fillMin > 120)) t.fillMin = t.fillMin < 1 ? 10 : 120;
    if (t.litres < 0) t.litres = 0;
  }
  if (!p.main) l.main.enabled = false;
  if (!l.main.enabled) l.main.sensor = false;
  l.main.minPct = clampi(l.main.minPct, 5, 40);
  if (l.main.fullCm < 25) l.main.fullCm = 25;
  if (l.main.emptyCm < l.main.fullCm + 10) l.main.emptyCm = l.main.fullCm + 10;
  if (!p.phe) l.phe.enabled = false;
  l.phe.probeMin = clampi(l.phe.probeMin, 1, 15);
  l.phe.retryMin = clampi(l.phe.retryMin, 5, 240);
  if (l.mode == Mode::Phe && !l.phe.enabled) l.mode = Mode::Auto;
  l.low = clampi(l.low, 5, 80);
  l.high = clampi(l.high, l.low + 10, 100);
  l.maxRunMin = clampi(l.maxRunMin, 5, 180);
}

bool fillable(const Layout &l, int i) {
  if (i < 0 || i >= l.n) return false;
  return l.n == 1 || l.semi[i].valve;  // 2+ tanks: every fill goes through the tank's valve
}

bool autoCapable(const Layout &l, int i) { return fillable(l, i) && l.semi[i].sensor; }

// ------------------------------------------------------------------ basics
Engine::Engine() {
  for (int i = 0; i < N_SENSORS; i++) {
    level[i] = -1;
    distCm[i] = 0;
    ok[i] = detected[i] = lowSent[i] = false;
    fails[i] = detFails[i] = 0;
  }
  for (int i = 0; i < MAX_SEMI; i++) valveOn[i] = false;
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
    case Phase::Filling: return src == Src::Phe ? "Filling (PHE)" : "Filling (pump)";
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
  if (idx == MAIN) return cfg.main.enabled && cfg.main.sensor;
  return idx >= 0 && idx < cfg.n && cfg.semi[idx].sensor;
}

bool Engine::mainLow() const {
  return cfg.main.enabled && cfg.main.sensor && ok[MAIN] && level[MAIN] < cfg.main.minPct;
}

bool Engine::coolingDown(uint32_t now) const { return stoppedOnce && now - lastStop < tm.cooldownMs; }

/** Water can go somewhere: the active tank's valve is open, or it is the single tank without one. */
bool Engine::pathOpen() const {
  if (active < 0 || active >= cfg.n) return false;
  if (!cfg.semi[active].valve) return cfg.n == 1;
  return valveOn[active];
}

// ------------------------------------------------------------------ outputs (with guards)
void Engine::setValve(int i, bool on) {
  if (i < 0 || i >= MAX_SEMI || valveOn[i] == on) return;
  valveOn[i] = on;
  if (out) out->valve(i, on);
  dirty = true;
}

void Engine::setPump(bool on) {
  if (on && (pheOn || !pathOpen())) return;  // never with PHE, never against closed valves
  if (pumpOn == on) return;
  pumpOn = on;
  if (out) out->pump(on);
  dirty = true;
}

void Engine::setPhe(bool on) {
  if (on && (pumpOn || !pathOpen())) return;
  if (pheOn == on) return;
  pheOn = on;
  if (out) out->phe(on);
  dirty = true;
}

void Engine::allOff() {
  pumpOn = pheOn = false;
  if (out) {
    out->pump(false);
    out->phe(false);
  }
  for (int i = 0; i < MAX_SEMI; i++) {
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
  float e = idx == MAIN ? cfg.main.emptyCm : cfg.semi[idx].emptyCm;
  float f = idx == MAIN ? cfg.main.fullCm : cfg.semi[idx].fullCm;
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
    if (i == except || !autoCapable(cfg, i) || !ok[i] || level[i] >= cfg.low) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    long a = lroundf(level[i]), b = lroundf(level[best]);
    if (a < b) best = i;
    else if (a == b) {  // tie: the lower-placed tank first, when heights are known
      float hi = cfg.semi[i].heightFt, hb = cfg.semi[best].heightFt;
      if (hi > 0 && hb > 0 && hi < hb) best = i;
    }
  }
  return best;
}

Src Engine::autoSource(uint32_t now) const {
  bool pheOk = cfg.phe.enabled && (!pheRetryArmed || after(now, pheRetryAt));
  switch (cfg.mode) {
    case Mode::Pump: return Src::Pump;
    case Mode::Phe: return pheOk ? Src::Phe : Src::None;
    case Mode::Auto: return pheOk ? Src::Phe : Src::Pump;
  }
  return Src::None;
}

bool Engine::pumpAllowed(uint32_t now, bool quiet, bool anyMode) {
  if (!anyMode && cfg.mode == Mode::Phe) {
    if (!quiet) say("PHE only mode. The pump is never started.");
    return false;
  }
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
void Engine::startFill(int t, Src s, bool autoRun, uint32_t now) {
  if (!fillable(cfg, t) || s == Src::None) return;
  for (int i = 0; i < MAX_SEMI; i++) setValve(i, i == t && cfg.semi[i].valve);  // one tank at a time
  active = t;
  src = s;
  runAuto = autoRun;
  timed = !cfg.semi[t].sensor;
  probing = false;
  msg[0] = 0;
  go(Phase::Opening, now);
}

void Engine::startSource(uint32_t now) {
  if (!pathOpen()) {
    beginStop(now);
    return;
  }
  if (src == Src::Pump) {
    if (!pumpAllowed(now, false)) {
      if (mainLow()) mainHold = true;
      beginStop(now);
      return;
    }
    setPump(true);
  } else {
    setPhe(true);
    probing = !timed;  // no sensor → cannot probe, just run the timer
    probeAt = now;
    probePct = level[active];
  }
  if (!sourceOn()) {
    beginStop(now);
    return;
  }
  runStart = tankStart = riseAt = now;
  startPct = risePct = level[active];
  if (src == Src::Pump) ev("pump_on", active);
  else if (!probing) ev("phe_on", active);
  go(Phase::Filling, now);
}

void Engine::logUsage(bool stopped, uint32_t now) {
  if (active < 0) return;
  float minutes = (now - tankStart) / 60000.0f;
  float rise = (!timed && level[active] >= 0) ? fmaxf(0.0f, level[active] - startPct) : 0;
  float litres = cfg.semi[active].litres * rise / 100.0f;
  if (stopped) ev(src == Src::Phe ? "phe_off" : "pump_off", active, minutes);
  if (sink) sink->usage(active, minutes, litres, src == Src::Phe);
}

void Engine::beginStop(uint32_t now, const char *reason) {
  stopWaitMs = pumpOn ? tm.pumpStopMs : pheOn ? tm.pheStopMs : 0;
  bool wasOn = sourceOn();
  setPump(false);
  setPhe(false);
  if (wasOn) logUsage(true, now);
  if (reason) ev(reason, active >= 0 ? active : 0);
  go(Phase::Stopping, now);
}

void Engine::lockout(const char *reason, int tank, uint32_t now) {
  checkRun = false;
  pendTank = -1;
  beginStop(now);
  ev(reason, tank);
  lockAfterStop = true;
}

void Engine::switchTo(int t, uint32_t now) {
  logUsage(false, now);
  next = t;
  setValve(t, true);  // open the new valve first, close the old one after SWITCH
  go(Phase::Switching, now);
}

void Engine::pheFail(uint32_t now) {
  ev("phe_none", active);
  pheRetryAt = now + (uint32_t)cfg.phe.retryMin * 60000UL;
  pheRetryArmed = true;
  if (cfg.mode == Mode::Auto) {
    pendTank = active;  // fall back to the pump after the stop (and the cooldown)
    pendSrc = Src::Pump;
    pendAuto = runAuto;
    say("No PHE water. Using the pump.");
  } else {
    say("No PHE water right now. Will try again later.");
  }
  beginStop(now);
}

void Engine::fillTick(uint32_t now) {
  int t = active;
  if (t < 0 || !pathOpen() || !sourceOn()) {
    beginStop(now);
    return;
  }
  const SemiCfg &c = cfg.semi[t];
  uint32_t run = now - runStart, onTank = now - tankStart;

  if (src == Src::Pump && mainLow()) {
    mainHold = true;
    say("Main tank is low. Pump stopped.");
    beginStop(now);
    return;
  }
  if (timed) {
    int lim = c.fillMin < cfg.maxRunMin ? c.fillMin : cfg.maxRunMin;
    if (onTank >= (uint32_t)lim * 60000UL) {
      ev("timeout", t, onTank / 60000.0f);  // the timer ended: normal for a tank without sensor
      beginStop(now);
    }
    return;
  }
  if (!ok[t]) {
    lockout("sensor", t, now);
    say("Tank %d sensor error. %s stopped.", t + 1, src == Src::Phe ? "PHE" : "Pump");
    return;
  }
  if (checkRun) {
    checkTick(now);
    if (ph != Phase::Filling) return;
  }
  if (src == Src::Phe && probing) {
    if (level[t] - probePct >= tm.noRisePct) {
      probing = false;  // PHE water is there
      riseAt = now;
      risePct = level[t];
      ev("phe_on", t);
      dirty = true;
    } else if (now - probeAt >= (uint32_t)cfg.phe.probeMin * 60000UL) {
      pheFail(now);
      return;
    }
  }
  if (run > (uint32_t)cfg.maxRunMin * 60000UL) {
    if (src == Src::Pump) {
      lockout("timeout", t, now);
      say("Pump ran %d min. Check the main tank and pipes.", cfg.maxRunMin);
    } else {
      ev("timeout", t, run / 60000.0f);
      pheRetryAt = now + (uint32_t)cfg.phe.retryMin * 60000UL;
      pheRetryArmed = true;
      beginStop(now);
    }
    return;
  }
  if (!probing && now - riseAt > tm.noRiseMs) {
    if (level[t] - risePct < tm.noRisePct) {
      if (src == Src::Pump) {
        lockout("dry_run", t, now);
        say("Tank %d not rising. Check the main tank.", t + 1);
      } else {
        pheFail(now);  // PHE water stopped
      }
      return;
    }
    riseAt = now;
    risePct = level[t];
  }
  if (level[t] >= cfg.high) {
    ev("full", t);
    int n = runAuto && autoMode ? pickAuto(t) : -1;
    if (n >= 0) switchTo(n, now);
    else beginStop(now);
  }
}

// ------------------------------------------------------------------ pump check
int Engine::nextCheckTank(int afterIdx) {
  for (int i = afterIdx + 1; i < cfg.n; i++) {
    if (!autoCapable(cfg, i)) continue;
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
  r.lpm = cfg.semi[active].litres > 0 ? r.pctMin * cfg.semi[active].litres / 100.0f : -1;
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
  pendTank = -1;
  if (ph != Phase::Idle) {
    say("Busy. Stop filling first.");
    return false;
  }
  for (int i = 0; i < MAX_SEMI; i++) check[i] = CheckRow();
  int t = nextCheckTank(-1);
  if (t < 0) {
    say("No tank with a sensor to check.");
    return false;
  }
  if (!pumpAllowed(now, false)) return false;
  checkRun = true;
  startFill(t, Src::Pump, false, now);
  return true;
}

// ------------------------------------------------------------------ test pulses
bool Engine::cmdTest(int port, uint32_t ms, uint32_t now) {
  if (ph == Phase::Locked) reset(now);
  if (ph != Phase::Idle || pendTank >= 0) {
    say("Busy. Stop filling first.");
    return false;
  }
  if (ms > tm.testMaxMs) ms = tm.testMaxMs;
  if (ms < 100) ms = 100;
  testMs = ms;
  if (port >= 0 && port < MAX_SEMI) {
    if (port >= ports.valves) return false;
    setValve(port, true);
    testStage = 1;
  } else if (port == PORT_PHE) {
    if (!ports.phe) return false;
    pheOn = true;  // PHE valve alone (no pump), so no path needed
    if (out) out->phe(true);
    testStage = 1;
  } else if (port == PORT_PUMP) {
    if (!pumpAllowed(now, false, true)) return false;  // wiring test: allowed in any mode
    active = 0;  // the pump test pushes a little water into tank 1
    if (cfg.semi[0].valve) setValve(0, true);
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
    if (testStage == 0 && in >= (cfg.semi[0].valve ? tm.valveLeadMs : 0)) {
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
  if (testPort == PORT_PHE) {
    pheOn = false;
    if (out) out->phe(false);
  } else {
    setValve(testPort, false);
  }
  testPort = -1;
  go(Phase::Idle, now);
}

// ------------------------------------------------------------------ main loop
void Engine::loop(uint32_t now) {
  if (mainHold && (!mainLow() && (!ok[MAIN] || level[MAIN] >= cfg.main.minPct + tm.mainHysteresis ||
                                  !(cfg.main.enabled && cfg.main.sensor))))
    mainHold = false;
  uint32_t in = now - phaseAt;

  switch (ph) {
    case Phase::Idle: {
      if (pendTank >= 0) {
        if (pendSrc == Src::Pump && !pumpAllowed(now, true)) {
          if (cfg.mode == Mode::Phe || mainLow() || mainHold) pendTank = -1;  // will not happen
          break;                                                              // wait for the cooldown
        }
        int t = pendTank;
        pendTank = -1;
        startFill(t, pendSrc, pendAuto, now);
        break;
      }
      if (autoMode) {
        int t = pickAuto(-1);
        if (t < 0) break;
        Src s = autoSource(now);
        if (s == Src::Pump && !pumpAllowed(now, true)) s = Src::None;
        if (s != Src::None) startFill(t, s, true, now);
      }
      break;
    }
    case Phase::Opening:
      if (in >= (cfg.semi[active].valve ? tm.valveLeadMs : 0)) startSource(now);
      break;
    case Phase::Filling:
      fillTick(now);
      break;
    case Phase::Switching:
      if (in >= tm.switchMs) {
        setValve(active, false);
        active = next;
        next = -1;
        timed = !cfg.semi[active].sensor;
        probing = false;
        tankStart = riseAt = now;
        startPct = risePct = level[active];
        ev(src == Src::Phe ? "phe_on" : "pump_on", active);
        go(Phase::Filling, now);
      }
      break;
    case Phase::Stopping:
      if (in >= stopWaitMs) {
        for (int i = 0; i < MAX_SEMI; i++) setValve(i, false);
        active = -1;
        src = Src::None;
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
  src = Src::None;
  pendTank = -1;
  checkRun = false;
  testPort = -1;
  lockAfterStop = false;
  boardErr = false;
  msg[0] = 0;
  go(Phase::Idle, now);
}

void Engine::clearLock(uint32_t now) {
  if (ph == Phase::Locked) reset(now);
}

/** Every manual command: clears a lockout, turns Auto off, cancels pending work. */
void Engine::manual(uint32_t now) {
  clearLock(now);
  if (autoMode) autoMode = false;
  pendTank = -1;
  if (checkRun) checkRun = false;
  msg[0] = 0;
  dirty = true;
}

void Engine::cmdPump(bool on, uint32_t now) {
  manual(now);
  if (!on) {
    if (sourceOn() || ph == Phase::Opening || ph == Phase::Switching || ph == Phase::Testing) beginStop(now);
    return;
  }
  if (pumpOn || (ph == Phase::Opening && src == Src::Pump)) return;
  int t = -1;
  for (int i = 0; i < cfg.n; i++)
    if (cfg.semi[i].valve && valveOn[i]) {
      t = i;
      break;
    }
  if (t < 0 && cfg.n == 1) t = 0;  // the only tank: no valve to choose
  if (t < 0) {
    say("Open a valve first");
    return;
  }
  if (pheOn || ph != Phase::Idle) {  // PHE is filling: switch to the pump after the stop
    pendTank = t;
    pendSrc = Src::Pump;
    pendAuto = false;
    if (sourceOn() || ph == Phase::Opening || ph == Phase::Switching) beginStop(now);
    return;
  }
  if (!pumpAllowed(now, false)) return;
  startFill(t, Src::Pump, false, now);
}

void Engine::cmdPhe(bool on, uint32_t now) {
  manual(now);
  if (!on) {
    if (pheOn || (ph == Phase::Opening && src == Src::Phe)) beginStop(now);
    return;
  }
  if (!cfg.phe.enabled) {
    say("No PHE line in this setup.");
    return;
  }
  if (pheOn || (ph == Phase::Opening && src == Src::Phe)) return;
  int t = -1;
  for (int i = 0; i < cfg.n; i++)
    if (cfg.semi[i].valve && valveOn[i]) {
      t = i;
      break;
    }
  if (t < 0 && cfg.n == 1) t = 0;
  if (t < 0) {
    say("Open a valve first");
    return;
  }
  if (ph != Phase::Idle) {
    pendTank = t;
    pendSrc = Src::Phe;
    pendAuto = false;
    if (sourceOn() || ph == Phase::Opening || ph == Phase::Switching) beginStop(now);
    return;
  }
  startFill(t, Src::Phe, false, now);
}

void Engine::cmdFill(int i, Src s, uint32_t now) {
  manual(now);
  if (!fillable(cfg, i)) {
    say("Tank %d needs a valve.", i + 1);
    return;
  }
  if (s == Src::Phe && !cfg.phe.enabled) s = Src::Pump;
  if (cfg.mode == Mode::Phe) s = Src::Phe;
  if (cfg.mode == Mode::Pump) s = Src::Pump;
  if (s == Src::Phe && !cfg.phe.enabled) {
    say("No PHE line in this setup.");
    return;
  }
  if (ph == Phase::Filling && src == s) {
    if (active != i) switchTo(i, now);
    return;
  }
  if (ph != Phase::Idle) {
    pendTank = i;
    pendSrc = s;
    pendAuto = false;
    if (sourceOn() || ph == Phase::Opening || ph == Phase::Switching) beginStop(now);
    return;
  }
  if (s == Src::Pump && !pumpAllowed(now, false)) return;
  startFill(i, s, false, now);
}

void Engine::cmdValve(int i, bool open, uint32_t now) {
  if (i < 0 || i >= cfg.n || !cfg.semi[i].valve) return;
  manual(now);
  if (!open && valveOn[i] && sourceOn() && active == i) {
    say("Pump stopped first");
    beginStop(now);  // source off → wait → valve closes
    return;
  }
  if (open && sourceOn() && ph == Phase::Filling && i != active) {
    switchTo(i, now);  // one tank at a time: open the new one, then close the old one
    return;
  }
  if (ph != Phase::Idle) return;  // busy
  setValve(i, open);
}

void Engine::cmdAuto(bool on, uint32_t now) {
  clearLock(now);
  if (on && ph != Phase::Idle && !runAuto) beginStop(now);  // manual → auto: stop first
  autoMode = on;
  pendTank = -1;
  msg[0] = 0;
  dirty = true;
}

void Engine::offlineGuard(uint32_t offlineMs, uint32_t now) {
  if (sourceOn() && offlineMs > (uint32_t)cfg.maxRunMin * 60000UL) {
    lockout("timeout", active, now);
    say("Lost internet while filling. Stopped for safety.");
  }
}

void Engine::boardFault(uint32_t now) {
  if (boardErr) return;
  boardErr = true;
  // PUMP and PHE are on direct pins: they go off even when the valve board is dead.
  pumpOn = pheOn = false;
  if (out) {
    out->pump(false);
    out->phe(false);
  }
  for (int i = 0; i < MAX_SEMI; i++) {
    valveOn[i] = false;
    if (out) out->valve(i, false);
  }
  active = next = -1;
  src = Src::None;
  checkRun = false;
  pendTank = -1;
  testPort = -1;
  if (sink) sink->event("board_error", -1, runAuto, 0);
  say("Controller error — valve board");
  go(Phase::Locked, now);
}

void Engine::setLayout(const Layout &l, uint32_t now) {
  cfg = l;
  sanitize(cfg, ports);
  bool busy = sourceOn() || ph == Phase::Opening || ph == Phase::Switching;
  if (busy && active >= 0 && !fillable(cfg, active)) beginStop(now);  // the tank was removed
  else if (busy && src == Src::Phe && (!cfg.phe.enabled || cfg.mode == Mode::Pump)) beginStop(now);
  else if (busy && src == Src::Pump && cfg.mode == Mode::Phe) beginStop(now);
  for (int i = 0; i < N_SENSORS; i++)
    if (!configured(i)) {
      ok[i] = false;
      level[i] = -1;
    }
  if (ph == Phase::Idle)
    for (int i = cfg.n; i < MAX_SEMI; i++) setValve(i, false);
  dirty = true;
}

}  // namespace rp
