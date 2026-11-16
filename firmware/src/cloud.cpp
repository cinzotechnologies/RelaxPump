#define ENABLE_USER_AUTH
#define ENABLE_DATABASE
#define ENABLE_ESP_SSLCLIENT
#include "cloud.h"

#include <ArduinoJson.h>
#include <FirebaseClient.h>
#include <WiFi.h>
#include <time.h>

#include "board.h"
#include "config.h"
#include "identity.h"
#include "ota.h"
#include "settings.h"

Cloud cloud;

static WiFiClient basic1, basic2, basic3;
static ESP_SSLClient ssl1, ssl2, ssl3;
using AsyncClient = AsyncClientClass;
static AsyncClient aClient(ssl1), cfgStream(ssl2), cmdStream(ssl3);
static UserAuth *userAuth = nullptr;
static FirebaseApp app;
static RealtimeDatabase db;
static String BASE;

static void onResult(AsyncResult &r);

// ------------------------------------------------------------------ config
static void onConfigJson(const String &json) { applyConfig(json, true); }

// ------------------------------------------------------------------ commands
static int testPort(const char *p) {
  if (!p) return -1;
  if (!strcmp(p, "PUMP")) return rp::PORT_PUMP;
  if (p[0] == 'V' && p[1] >= '1' && p[1] <= '5' && !p[2]) return p[1] - '1';
  return -1;
}

static void applyCmdJson(const String &json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc.is<JsonObject>()) return;
  Serial.println("[CLOUD] cmd " + json);
  // Command hlui (controller offline laia dah) chu ti suh — pump a hun thlawn a on palh ang.
  const double ts = doc["ts"] | 0.0;
  const time_t nowS = time(nullptr);
  db.remove(aClient, BASE + "/cmd", onResult, "cmdDel");
  if (ts > 0 && nowS > 1700000000 && (double)nowS * 1000.0 - ts > 60000.0) {
    Serial.println("[CLOUD] stale cmd ignored");
    return;
  }
  const uint32_t now = millis();

  if (ota::active()) {
    Serial.println("[CLOUD] update running, command ignored");
    return;
  }
  if (doc["ota"].is<JsonObject>()) {
    ota::request(String((const char *)(doc["ota"]["version"] | "")), pumpBusy());
    return;
  }

  if (identity::isPhe()) {
    // PHE board: no pump. The rules refuse pump / pumpCheck / test PUMP already; ignore them here too.
    if (doc["auto"].is<bool>()) pheEng.cmdAuto(doc["auto"].as<bool>(), now);
    if (doc["valve"].is<JsonObject>()) pheEng.cmdValve(doc["valve"]["i"] | -1, doc["valve"]["open"] | false, now);
    if (doc["test"].is<JsonObject>()) {
      int port = testPort(doc["test"]["port"] | "");
      if (port >= 0 && port < rp::MAX_TANKS) pheEng.cmdTest(port, doc["test"]["ms"] | 1000, now);
    }
  } else {
    if (doc["auto"].is<bool>()) eng.cmdAuto(doc["auto"].as<bool>(), now);
    // valve before pump: "open tank 2 and start" arrives as one command
    if (doc["valve"].is<JsonObject>()) eng.cmdValve(doc["valve"]["i"] | -1, doc["valve"]["open"] | false, now);
    if (doc["pump"].is<bool>()) eng.cmdPump(doc["pump"].as<bool>(), now);
    if (doc["test"].is<JsonObject>())
      eng.cmdTest(testPort(doc["test"]["port"] | ""), doc["test"]["ms"] | 1000, now);
    if (doc["pumpCheck"] == true) eng.cmdPumpCheck(now);
  }
  if (doc["wifiReset"] == true) {
    Serial.println("[CLOUD] Wi-Fi reset from the app");
    requestWifiReset();  // main loop: everything off, forget Wi-Fi, restart into Bluetooth setup
  }
}

// ------------------------------------------------------------------ results
static void onResult(AsyncResult &r) {
  if (!r.isResult()) return;
  if (r.isError())
    Serial.printf("[CLOUD] %s error %d: %s\n", r.uid().c_str(), r.error().code(), r.error().message().c_str());
  if (!r.available()) return;

  RealtimeDatabaseResult &res = r.to<RealtimeDatabaseResult>();
  const String uid = r.uid();
  if (res.isStream()) {
    const String path = res.dataPath();
    const String data = res.to<String>();
    if (res.event() != "put" && res.event() != "patch") return;
    if (uid == "cfgStream") {
      if (path == "/" && data != "null") onConfigJson(data);
      else db.get(aClient, BASE + "/config", onResult, false, "cfgGet");  // partial change: fetch all
    } else if (uid == "cmdStream") {
      if (path == "/" && data != "null") applyCmdJson(data);
      else if (path != "/") db.get(aClient, BASE + "/cmd", onResult, false, "cmdGet");
    }
    return;
  }
  if (uid == "cfgGet" && String(r.c_str()) != "null") onConfigJson(r.c_str());
  else if (uid == "cmdGet" && String(r.c_str()) != "null") applyCmdJson(r.c_str());
  else if (uid == "stable") ota::onStable(r.c_str());
}

// ------------------------------------------------------------------ lifecycle
void Cloud::startStreams() {
  db.get(cfgStream, BASE + "/config", onResult, true, "cfgStream");
  db.get(cmdStream, BASE + "/cmd", onResult, true, "cmdStream");
}

void Cloud::begin() {
  if (isStarted) return;
  if (!identity::valid()) {
    static bool said = false;
    if (!said) Serial.println("[CLOUD] no device identity (factory-flash the NVS image): staying offline");
    said = true;
    return;
  }
  const identity::Id &id = identity::get();
  isStarted = true;
  BASE = "/devices/" + id.id;
  configTime(19800, 0, "pool.ntp.org", "time.google.com");  // IST, for usage/{yyyy-mm-dd}

  ESP_SSLClient *ssl[] = {&ssl1, &ssl2, &ssl3};
  WiFiClient *basic[] = {&basic1, &basic2, &basic3};
  for (int i = 0; i < 3; i++) {
    ssl[i]->setClient(basic[i]);
    ssl[i]->setInsecure();
    ssl[i]->setBufferSizes(2048, 1024);
    ssl[i]->setDebugLevel(1);
    ssl[i]->setSessionTimeout(150);
  }
  userAuth = new UserAuth(identity::apiKey(), id.email, id.pass, 3000);
  initializeApp(aClient, app, getAuth(*userAuth), onResult, "auth");
  app.getApp<RealtimeDatabase>(db);
  db.url(identity::dbUrl());

  cfgStream.setSSEFilters("get,put,patch,keep-alive,cancel,auth_revoked");
  cmdStream.setSSEFilters("get,put,patch,keep-alive,cancel,auth_revoked");
  startStreams();
  Serial.println("[CLOUD] started as " + id.email);
}

bool Cloud::ready() const { return isStarted && WiFi.isConnected() && app.ready(); }

uint32_t Cloud::offlineMs() const { return lastOnline ? millis() - lastOnline : millis(); }

void Cloud::loop() {
  if (!isStarted) return;
  app.loop();
  if (!ready()) return;
  lastOnline = millis();
  ota::cloudReached();  // new firmware confirmed (cancels the rollback)

  static bool infoSent = false;
  if (!infoSent) {
    infoSent = true;
    // The rules cap config.tankCount by maxTanks (old 3-tank firmware reports 3). info.type can
    // be written once only (the rules refuse a change).
    JsonDocument doc;
    doc["fw"] = FW_VERSION;
    doc["board"] = board::label();
    doc["maxTanks"] = rp::MAX_TANKS;
    doc["type"] = identity::typeName();
    doc["flash"] = board::flashMb();
    String body;
    serializeJson(doc, body);
    db.update<object_t>(aClient, BASE + "/info", object_t(body), onResult, "info");
  }

  // OTA: free the two stream connections (heap for the HTTPS download), bring them back after.
  if (ota::active() && !streamsPaused) {
    streamsPaused = true;
    cfgStream.stopAsync(true);
    cmdStream.stopAsync(true);
  } else if (!ota::active() && streamsPaused) {
    streamsPaused = false;
    startStreams();
  }
  if (ota::wantCheck()) db.get(aClient, "/firmware/stable", onResult, false, "stable");
  if (const char *e = ota::takeEvent()) event(e, -1, false, 0);

  uint32_t now = millis();
  bool changed = identity::isPhe() ? pheEng.changed() : eng.changed();
  if (ota::active()) changed = true;  // progress
  if ((changed && now - lastState >= STATE_MIN_GAP_MS) || now - lastState >= STATE_EVERY_MS) pushState();
  else if (changed) {
    // keep the flag for the next allowed slot
    lastState = now - STATE_EVERY_MS + STATE_MIN_GAP_MS;
  }
}

static void putPct(JsonObject o, float pct, bool ok) {
  if (ok && pct >= 0) o["pct"] = (int)roundf(pct);
  else o["pct"] = nullptr;
}

/** Which ports answer + live distance per port (installer setup / Add device "Check wiring"). */
template <typename E>
static void putPorts(JsonDocument &doc, const E &e, bool withMain) {
  JsonArray det = doc["detected"]["tanks"].to<JsonArray>();
  for (int i = 0; i < rp::MAX_TANKS; i++) det.add(e.detected[i]);
  doc["detected"]["main"] = withMain && e.detected[rp::MAIN];
  JsonArray cm = doc["cm"].to<JsonArray>();
  for (int i = 0; i < rp::N_SENSORS; i++) {
    if (e.detected[i] && (withMain || i != rp::MAIN)) cm.add(roundf(e.distCm[i]));
    else cm.add(nullptr);
  }
}

void Cloud::pushState() {
  lastState = millis();
  JsonDocument doc;
  doc["online"] = true;
  doc["lastSeen"][".sv"] = "timestamp";
  doc["rssi"] = WiFi.RSSI();
  doc["ssid"] = WiFi.SSID();

  if (identity::isPhe()) {
    const rp::PheEngine &e = pheEng;
    doc["auto"] = e.autoMode;
    doc["msg"] = ota::active() ? "Updating software" : e.msg;
    JsonArray tanks = doc["tanks"].to<JsonArray>();
    for (int i = 0; i < e.cfg.n; i++) {
      JsonObject t = tanks.add<JsonObject>();
      putPct(t, e.level[i], e.ok[i]);
      t["valve"] = e.valveOn[i];
      t["ok"] = e.ok[i];
      t["rising"] = e.valveOn[i] && e.rising[i];
    }
    doc["supply"] = rp::supplyName(e.supply());
    putPorts(doc, e, false);
  } else {
    const rp::Engine &e = eng;
    doc["pump"] = e.pumpOn;
    doc["auto"] = e.autoMode;
    doc["msg"] = ota::active() ? "Updating software" : e.msg;
    if (e.activeTank() >= 0) doc["active"] = e.activeTank();
    else doc["active"] = nullptr;

    JsonArray tanks = doc["tanks"].to<JsonArray>();
    for (int i = 0; i < e.cfg.n; i++) {
      JsonObject t = tanks.add<JsonObject>();
      putPct(t, e.level[i], e.ok[i]);
      t["valve"] = rp::hasValves(e.cfg) && e.valveOn[i];
      t["ok"] = e.ok[i];
    }
    if (e.cfg.main.enabled) {
      JsonObject m = doc["main"].to<JsonObject>();
      putPct(m, e.level[rp::MAIN], e.ok[rp::MAIN]);
      m["ok"] = e.ok[rp::MAIN];
    } else {
      doc["main"] = nullptr;
    }
    putPorts(doc, e, true);

    bool anyCheck = e.checkRun;
    for (int i = 0; i < e.cfg.n; i++) anyCheck |= e.check[i].done;
    if (anyCheck) {
      doc["check"]["run"] = e.checkRun;
      JsonArray rows = doc["check"]["rows"].to<JsonArray>();
      for (int i = 0; i < e.cfg.n; i++) {
        const rp::CheckRow &c = e.check[i];
        if (!c.done) continue;
        JsonObject r = rows.add<JsonObject>();
        r["i"] = i;
        r["skipped"] = c.skipped;
        if (c.skipped) continue;
        r["pctMin"] = roundf(c.pctMin * 100) / 100;
        if (c.lpm >= 0) r["lpm"] = roundf(c.lpm * 10) / 10;
        if (c.minToFull >= 0) r["minToFull"] = (int)roundf(c.minToFull);
        r["slow"] = c.slow;
      }
    }
  }
  ota::putState(doc);
  String body;
  serializeJson(doc, body);
  db.set<object_t>(aClient, BASE + "/state", object_t(body), onResult, "state");
}

// ------------------------------------------------------------------ events / usage
void Cloud::event(const char *type, int tank, bool autoRun, float minutes) {
  Serial.printf("[EVENT] %s tank %d\n", type, tank + 1);
  if (!ready()) return;
  JsonDocument doc;
  doc["type"] = type;
  doc["tank"] = tank;
  doc["ts"][".sv"] = "timestamp";
  doc["auto"] = autoRun;
  if (minutes > 0) doc["min"] = roundf(minutes * 10) / 10;
  String body;
  serializeJson(doc, body);
  db.push<object_t>(aClient, BASE + "/events", object_t(body), onResult, "event");
}

void Cloud::usage(int tank, float minutes, float litres) {
  if (!ready() || tank < 0) return;
  struct tm t;
  if (!getLocalTime(&t, 0)) return;  // no clock yet
  char day[11];
  strftime(day, sizeof day, "%Y-%m-%d", &t);
  JsonDocument doc;
  float m = roundf(minutes * 10) / 10, l = roundf(litres);
  const String pt = "perTank/" + String(tank) + "/";
  doc["litres"][".sv"]["increment"] = l;
  doc[pt + "litres"][".sv"]["increment"] = l;
  if (!identity::isPhe()) {  // PHE: litres received per line, no pump
    doc["pumpMin"][".sv"]["increment"] = m;
    doc[pt + "pumpMin"][".sv"]["increment"] = m;
  }
  String body;
  serializeJson(doc, body);
  db.update<object_t>(aClient, BASE + "/usage/" + day, object_t(body), onResult, "usage");
}
