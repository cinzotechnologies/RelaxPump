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

bool parse(const String &json, rp::Layout &l) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc.is<JsonObject>()) return false;
  l.low = doc["low"] | l.low;
  l.high = doc["high"] | l.high;
  l.maxRunMin = doc["maxRunMin"] | l.maxRunMin;
  l.n = doc["tankCount"] | 3;
  if (l.n < 1) l.n = 1;
  if (l.n > rp::MAX_TANKS) l.n = rp::MAX_TANKS;
  for (int i = 0; i < rp::MAX_TANKS; i++) l.tank[i] = rp::TankCfg();
  eachIndexed(doc["tanks"], [&](int i, JsonVariantConst t) {
    if (i < 0 || i >= rp::MAX_TANKS) return;
    rp::TankCfg &c = l.tank[i];
    c.emptyCm = t["emptyCm"] | c.emptyCm;
    c.fullCm = t["fullCm"] | c.fullCm;
    c.litres = t["litres"] | 0.0f;
    c.heightFt = t["heightFt"] | 0.0f;
  });
  l.main = rp::MainCfg();
  JsonVariantConst m = doc["main"];
  if (!m.isNull()) {
    l.main.enabled = m["enabled"] | false;
    l.main.emptyCm = m["emptyCm"] | l.main.emptyCm;
    l.main.fullCm = m["fullCm"] | l.main.fullCm;
    l.main.litres = m["litres"] | 0.0f;
    l.main.minPct = m["minPct"] | l.main.minPct;
  }
  return true;
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
