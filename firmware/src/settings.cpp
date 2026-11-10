#include "settings.h"

#include <ArduinoJson.h>
#include <Preferences.h>

namespace settings {

/** RTDB sends arrays as JSON arrays, or as {"0": …} objects when there are gaps. */
template <typename F>
static void eachIndexed(JsonVariantConst v, F fn) {
  if (v.is<JsonArrayConst>()) {
    int i = 0;
    for (JsonVariantConst x : v.as<JsonArrayConst>()) fn(i++, x);
  } else if (v.is<JsonObjectConst>()) {
    for (JsonPairConst kv : v.as<JsonObjectConst>()) {
      const char *k = kv.key().c_str();
      if (*k >= '0' && *k <= '9') fn(atoi(k), kv.value());
    }
  }
}

Parsed parse(const String &json, rp::Layout &l) {
  Parsed r;
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc.is<JsonObject>()) return r;
  r.ok = true;
  l.low = doc["low"] | l.low;
  l.high = doc["high"] | l.high;
  l.maxRunMin = doc["maxRunMin"] | l.maxRunMin;

  JsonVariantConst semi = doc["semi"];
  if (!semi.isNull()) {
    int n = 0;
    eachIndexed(semi, [&](int i, JsonVariantConst t) {
      if (i < 0 || i >= rp::MAX_SEMI) return;
      rp::SemiCfg c;
      c.sensor = t["sensor"] | true;
      c.valve = t["valve"] | true;
      c.emptyCm = t["emptyCm"] | c.emptyCm;
      c.fullCm = t["fullCm"] | c.fullCm;
      c.litres = t["litres"] | 0.0f;
      c.heightFt = t["heightFt"] | 0.0f;
      c.fillMin = t["fillMin"] | 0;
      l.semi[i] = c;
      if (i + 1 > n) n = i + 1;
    });
    l.n = n > 0 ? n : 1;
    JsonVariantConst m = doc["main"];
    l.main.enabled = m["enabled"] | false;
    l.main.sensor = m["sensor"] | false;
    l.main.emptyCm = m["emptyCm"] | l.main.emptyCm;
    l.main.fullCm = m["fullCm"] | l.main.fullCm;
    l.main.litres = m["litres"] | 0.0f;
    l.main.minPct = m["minPct"] | l.main.minPct;
    JsonVariantConst p = doc["phe"];
    l.phe.enabled = p["enabled"] | false;
    l.phe.probeMin = p["probeMin"] | l.phe.probeMin;
    l.phe.retryMin = p["retryMin"] | l.phe.retryMin;
    const char *mode = doc["mode"] | "pump";
    l.mode = !strcmp(mode, "auto") ? rp::Mode::Auto : !strcmp(mode, "phe") ? rp::Mode::Phe : rp::Mode::Pump;
    return r;
  }

  // v1: { tankCount, tanks: [{ emptyCm, fullCm, litres, name }] } — every tank has sensor + valve.
  r.v1 = true;
  JsonVariantConst tanks = doc["tanks"];
  l.n = doc["tankCount"] | 3;
  if (l.n < 1) l.n = 1;
  if (l.n > rp::MAX_SEMI) l.n = rp::MAX_SEMI;
  for (int i = 0; i < rp::MAX_SEMI; i++) l.semi[i] = rp::SemiCfg();
  eachIndexed(tanks, [&](int i, JsonVariantConst t) {
    if (i < 0 || i >= rp::MAX_SEMI) return;
    l.semi[i].emptyCm = t["emptyCm"] | l.semi[i].emptyCm;
    l.semi[i].fullCm = t["fullCm"] | l.semi[i].fullCm;
    l.semi[i].litres = t["litres"] | 0.0f;
  });
  l.main = rp::MainCfg();
  l.phe = rp::PheCfg();
  l.mode = rp::Mode::Pump;

  // Migration body for config/{semi, mode, main, phe} (rules let the device write these once).
  JsonDocument mig;
  JsonArray out = mig["semi"].to<JsonArray>();
  for (int i = 0; i < l.n; i++) {
    JsonObject t = out.add<JsonObject>();
    JsonVariantConst old = tanks.is<JsonArrayConst>() ? tanks[i] : tanks[String(i)];
    const char *name = old["name"] | "";
    if (*name) t["name"] = name;
    if (l.semi[i].litres > 0) t["litres"] = l.semi[i].litres;
    t["emptyCm"] = l.semi[i].emptyCm;
    t["fullCm"] = l.semi[i].fullCm;
    t["sensor"] = true;
    t["valve"] = true;
  }
  mig["mode"] = "pump";
  JsonObject m = mig["main"].to<JsonObject>();
  m["enabled"] = false;
  m["sensor"] = false;
  m["minPct"] = 10;
  JsonObject p = mig["phe"].to<JsonObject>();
  p["enabled"] = false;
  p["probeMin"] = 4;
  p["retryMin"] = 30;
  serializeJson(mig, r.migration);
  return r;
}

void saveConfig(const String &json) {
  Preferences p;
  p.begin("rp", false);
  if (p.getString("cfg", "") != json) p.putString("cfg", json);
  p.end();
}

String loadConfig() {
  Preferences p;
  p.begin("rp", true);
  String s = p.getString("cfg", "");
  p.end();
  return s;
}

bool loadAuto() {
  Preferences p;
  p.begin("rp", true);
  bool a = p.getBool("auto", false);  // a fresh board starts with Auto OFF: test first
  p.end();
  return a;
}

void saveAuto(bool on) {
  Preferences p;
  p.begin("rp", false);
  p.putBool("auto", on);
  p.end();
}

}  // namespace settings
