#include "phe.h"

#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

namespace rp {

static int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

void sanitize(PheLayout &l) {
  l.n = clampi(l.n, 1, MAX_TANKS);
  for (int i = 0; i < MAX_TANKS; i++) {
    PheLine &t = l.line[i];
    if (t.fullCm < 25) t.fullCm = 25;
    if (t.emptyCm < t.fullCm + 10) t.emptyCm = t.fullCm + 10;
    if (t.litres < 0) t.litres = 0;
  }
  l.high = clampi(l.high, 60, 100);
  l.low = clampi(l.low, 50, 95);
  if (l.low > l.high - 5) l.low = l.high - 5;
}

const char *supplyName(Supply s) {
  switch (s) {
    case Supply::Flowing: return "flowing";
    case Supply::None: return "none";
    default: return "unknown";
  }
}

PheEngine::PheEngine() {
  for (int i = 0; i < N_SENSORS; i++) {
    level[i] = -1;
    distCm[i] = -1;
    ok[i] = false;
    detected[i] = false;
    fails[i] = detFails[i] = 0;
  }
  for (int i = 0; i < MAX_TANKS; i++) {
    valveOn[i] = rising[i] = held[i] = false;
    riseAt[i] = usageAt[i] = 0;
    riseRef[i] = usageRef[i] = 0;
    closedRef[i] = -1;
    overflowSent[i] = sensorSent[i] = false;
  }
  msg[0] = 0;
}

void PheEngine::begin(Outputs *o, Sink *s) {
  out = o;
  sink = s;
  for (int i = 0; i < MAX_TANKS; i++) {
    valveOn[i] = false;
    if (out) out->valve(i, false);  // every valve starts closed
  }
  if (out) out->pump(false);  // K1 is not fitted on a PHE board; keep it off anyway
}

bool PheEngine::changed() {
  bool d = dirty;
  dirty = false;
  return d;
}

void PheEngine::say(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof msg, fmt, ap);
  va_end(ap);
  dirty = true;
}

void PheEngine::ev(const char *type, int tank) {
  if (sink) sink->event(type, tank, autoMode, 0);
}

int PheEngine::valvesOn() const {
  int n = 0;
  for (int i = 0; i < MAX_TANKS; i++) n += valveOn[i];
  return n;
}

void PheEngine::setValve(int i, bool on, uint32_t now) {
  if (i < 0 || i >= MAX_TANKS || valveOn[i] == on) return;
  if (!on) flushUsage(i, now);
  valveOn[i] = on;
  if (out) out->valve(i, on);
  dirty = true;
  if (on) {
    riseAt[i] = usageAt[i] = now;
    riseRef[i] = usageRef[i] = level[i] < 0 ? 0 : level[i];
    overflowSent[i] = false;
  } else {
    rising[i] = false;
    closedRef[i] = level[i];
  }
}

void PheEngine::flushUsage(int i, uint32_t now) {
  usageAt[i] = now;
  if (!valveOn[i] || level[i] < 0) return;
  float gained = level[i] - usageRef[i];
  usageRef[i] = level[i];
  if (gained <= 0 || cfg.line[i].litres <= 0) return;
  if (sink) sink->usage(i, 0, gained * cfg.line[i].litres / 100.0f);
}

void PheEngine::setLayout(const PheLayout &l, uint32_t now) {
  cfg = l;
  sanitize(cfg);
  for (int i = cfg.n; i < MAX_TANKS; i++) {
    setValve(i, false, now);  // lines no longer in the layout: closed
    held[i] = false;
    ok[i] = false;
    level[i] = -1;
  }
  dirty = true;
}

void PheEngine::reading(int idx, float cm, uint32_t now) {
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
  if (idx >= cfg.n) {  // not a line in the layout (or MAIN): only "detected"
    ok[idx] = false;
    level[idx] = -1;
    return;
  }
  if (!ok[idx]) dirty = true;
  ok[idx] = true;
  sensorSent[idx] = false;
  const PheLine &c = cfg.line[idx];
  float span = c.emptyCm - c.fullCm < 5 ? 5 : c.emptyCm - c.fullCm;
  float p = (c.emptyCm - cm) * 100.0f / span;
  p = p < 0 ? 0 : p > 100 ? 100 : p;
  float prev = level[idx];
  level[idx] = prev < 0 ? p : prev * 0.6f + p * 0.4f;
  if (prev < 0 || lroundf(prev) != lroundf(level[idx])) dirty = true;
  if (!valveOn[idx] && closedRef[idx] < 0) closedRef[idx] = level[idx];  // first reading after boot
}

bool PheEngine::cmdValve(int i, bool open, uint32_t now) {
  if (i < 0 || i >= cfg.n) return false;
  if (!open) {
    setValve(i, false, now);
    held[i] = autoMode;  // Auto would reopen it at once otherwise
    say(autoMode ? "Line %d closed by hand" : "Line %d closed", i + 1);
    return true;
  }
  if (!ok[i]) {
    say("Line %d: sensor not answering, valve stays closed", i + 1);
    return false;
  }
  if (level[i] >= cfg.high) {
    say("Line %d is full", i + 1);
    return false;
  }
  held[i] = false;
  setValve(i, true, now);
  say("Line %d open", i + 1);
  return true;
}

void PheEngine::cmdAuto(bool on, uint32_t now) {
  (void)now;
  autoMode = on;
  for (int i = 0; i < MAX_TANKS; i++) held[i] = false;
  say(on ? "Auto fill on" : "Auto fill off");
}

bool PheEngine::cmdTest(int port, uint32_t ms, uint32_t now) {
  if (port < 0 || port >= MAX_TANKS || testPort >= 0) return false;  // V1..V5 only, no pump
  if (valveOn[port]) {
    say("V%d is open already", port + 1);
    return false;
  }
  testPort = port;
  testAt = now;
  testMs = ms > tm.testMaxMs ? tm.testMaxMs : (ms < 100 ? 100 : ms);
  if (out) out->valve(port, true);
  say("Testing V%d", port + 1);
  return true;
}

void PheEngine::closeAll(uint32_t now) {
  if (testPort >= 0 && out) out->valve(testPort, false);
  testPort = -1;
  for (int i = 0; i < MAX_TANKS; i++) setValve(i, false, now);
}

void PheEngine::reset(uint32_t now) {
  closeAll(now);
  for (int i = 0; i < MAX_TANKS; i++) held[i] = false;
  say("Reset: all valves closed");
}

void PheEngine::lineTick(int i, uint32_t now) {
  // Fail safe: no sensor → closed.
  if (!ok[i]) {
    if (valveOn[i]) setValve(i, false, now);
    if (!sensorSent[i] && fails[i] >= tm.sensorFailMax) {
      sensorSent[i] = true;
      ev("sensor", i);
      say("Line %d: sensor not answering, valve closed", i + 1);
    }
    return;
  }
  const float pct = level[i];

  if (valveOn[i]) {
    if (pct >= cfg.high) {  // full: close (auto and manual)
      setValve(i, false, now);
      ev("phe_full", i);
      say("Line %d full, valve closed", i + 1);
      return;
    }
    // rising: >= risePct within the window
    if (pct - riseRef[i] >= tm.risePct) {
      if (!rising[i]) dirty = true;
      rising[i] = true;
      lastRise = now;
      riseSeen = true;
      riseRef[i] = pct;
      riseAt[i] = now;
    } else if (now - riseAt[i] >= tm.riseWindowMs) {
      if (rising[i]) dirty = true;
      rising[i] = false;
      riseRef[i] = pct;
      riseAt[i] = now;
    }
    if (now - usageAt[i] >= tm.usageFlushMs) flushUsage(i, now);
    return;
  }

  // closed
  if (closedRef[i] < 0) closedRef[i] = pct;
  if (pct < closedRef[i]) closedRef[i] = pct;  // follow the level down (water used)
  float ref = closedRef[i] > cfg.high ? closedRef[i] : (float)cfg.high;
  if (!overflowSent[i] && pct >= ref + tm.overflowPct) {
    overflowSent[i] = true;
    ev("overflow", i);
    say("Line %d still rising with the valve closed", i + 1);
  } else if (overflowSent[i] && pct < cfg.high) {
    overflowSent[i] = false;
  }
  if (autoMode && !held[i] && pct < cfg.low && testPort != i) setValve(i, true, now);
}

void PheEngine::supplyTick(uint32_t now) {
  bool anyOpen = false, anyRising = false;
  for (int i = 0; i < cfg.n; i++) {
    anyOpen |= valveOn[i];
    anyRising |= valveOn[i] && rising[i];
  }
  if (anyOpen && !anyOpenFlag) {
    anyOpenFlag = true;
    openSince = now;
  } else if (!anyOpen) {
    anyOpenFlag = false;
  }
  Supply s = Supply::Unknown;
  if (anyRising) s = Supply::Flowing;
  else if (anyOpen) {
    uint32_t since = openSince;
    if (riseSeen && (int32_t)(lastRise - since) > 0) since = lastRise;
    if (now - since >= tm.noneAfterMs) s = Supply::None;
  }
  if (s != sup) {
    sup = s;
    dirty = true;
  }

  // flow_start / flow_stop, debounced
  const bool debounced = !flowEvOnce || now - flowEvAt >= tm.flowDebounceMs;
  if (s == Supply::Flowing) {
    notFlowing = false;
    if (!flowState && debounced) {
      flowState = true;
      flowEvAt = now;
      flowEvOnce = true;
      ev("flow_start", -1);
    }
  } else if (flowState) {
    if (!notFlowing) {
      notFlowing = true;
      notFlowSince = now;
    }
    if (now - notFlowSince >= tm.flowDebounceMs) {
      flowState = false;
      notFlowing = false;
      flowEvAt = now;
      flowEvOnce = true;
      // Water stopped while a valve waits for it → "flow_stop". All valves closed because the
      // tanks are full → nothing to report.
      if (anyOpen) ev("flow_stop", -1);
    }
  }
}

void PheEngine::loop(uint32_t now) {
  if (testPort >= 0 && now - testAt >= testMs) {
    if (out) out->valve(testPort, valveOn[testPort]);
    say("V%d test done", testPort + 1);
    testPort = -1;
  }
  for (int i = 0; i < cfg.n; i++) lineTick(i, now);
  supplyTick(now);
}

}  // namespace rp
