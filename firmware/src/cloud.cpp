#define ENABLE_USER_AUTH
#define ENABLE_DATABASE
#define ENABLE_ESP_SSLCLIENT
#include "cloud.h"

#include <ArduinoJson.h>
#include <FirebaseClient.h>
#include <WiFi.h>
#include <time.h>

#include "hw.h"
#include "secrets.h"

Cloud cloud;

static WiFiClient basic1, basic2, basic3;
static ESP_SSLClient ssl1, ssl2, ssl3;
using AsyncClient = AsyncClientClass;
static AsyncClient aClient(ssl1), cfgStream(ssl2), cmdStream(ssl3);
static UserAuth userAuth(RP_FIREBASE_API_KEY, RP_DEVICE_EMAIL, RP_DEVICE_PASSWORD, 3000);
static FirebaseApp app;
static RealtimeDatabase db;
static const String BASE = String("/devices/") + RP_DEVICE_ID;

static void onResult(AsyncResult &r);

// ------------------------------------------------------------------ config
static void applyConfigJson(const String &json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc.is<JsonObject>()) return;
  extern Controller ctl;
  Settings s = ctl.cfg;
  s.tankCount = doc["tankCount"] | s.tankCount;
  s.low = doc["low"] | s.low;
  s.high = doc["high"] | s.high;
  s.maxRunMin = doc["maxRunMin"] | s.maxRunMin;
  JsonArrayConst tanks = doc["tanks"].as<JsonArrayConst>();
  int i = 0;
  for (JsonObjectConst t : tanks) {
    if (i >= MAX_TANKS) break;
    s.tanks[i].emptyCm = t["emptyCm"] | s.tanks[i].emptyCm;
    s.tanks[i].fullCm = t["fullCm"] | s.tanks[i].fullCm;
    s.tanks[i].litres = t["litres"] | 0.0f;
    i++;
  }
  ctl.applySettings(s);
  Serial.printf("[CLOUD] config: %d tanks, start <%d%%, stop %d%%, max %d min\n", s.tankCount, s.low, s.high,
                s.maxRunMin);
}

static void applyCmdJson(const String &json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc.is<JsonObject>()) return;
  extern Controller ctl;
  Serial.println("[CLOUD] cmd " + json);
  if (doc["auto"].is<bool>()) ctl.cmdAuto(doc["auto"].as<bool>());
  if (doc["pump"].is<bool>()) ctl.cmdPump(doc["pump"].as<bool>());
  if (doc["valve"].is<JsonObject>()) ctl.cmdValve(doc["valve"]["i"] | -1, doc["valve"]["open"] | false);
  db.remove(aClient, BASE + "/cmd", onResult, "cmdDel");
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
      if (path == "/" && data != "null") applyConfigJson(data);
      else db.get(aClient, BASE + "/config", onResult, false, "cfgGet");  // partial change: fetch all
    } else if (uid == "cmdStream") {
      if (path == "/" && data != "null") applyCmdJson(data);
      else if (path != "/") db.get(aClient, BASE + "/cmd", onResult, false, "cmdGet");
    }
    return;
  }
  if (uid == "cfgGet") applyConfigJson(r.c_str());
  else if (uid == "cmdGet" && String(r.c_str()) != "null") applyCmdJson(r.c_str());
}

// ------------------------------------------------------------------ lifecycle
void Cloud::begin(Controller *c) {
  if (isStarted) return;
  ctl = c;
  isStarted = true;
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
  initializeApp(aClient, app, getAuth(userAuth), onResult, "auth");
  app.getApp<RealtimeDatabase>(db);
  db.url(RP_FIREBASE_DB_URL);

  cfgStream.setSSEFilters("get,put,patch,keep-alive,cancel,auth_revoked");
  cmdStream.setSSEFilters("get,put,patch,keep-alive,cancel,auth_revoked");
  db.get(cfgStream, BASE + "/config", onResult, true, "cfgStream");
  db.get(cmdStream, BASE + "/cmd", onResult, true, "cmdStream");
  Serial.println("[CLOUD] started as " RP_DEVICE_EMAIL);
}

bool Cloud::ready() const { return isStarted && WiFi.isConnected() && app.ready(); }

uint32_t Cloud::offlineMs() const { return lastOnline ? millis() - lastOnline : millis(); }

void Cloud::loop() {
  if (!isStarted) return;
  app.loop();
  if (!ready()) return;
  lastOnline = millis();

  static bool infoSent = false;
  if (!infoSent) {
    infoSent = true;
    db.set<String>(aClient, BASE + "/info/fw", String(FW_VERSION), onResult, "fw");
  }

  uint32_t now = millis();
  bool changed = ctl->changed();
  if ((changed && now - lastState >= STATE_MIN_GAP_MS) || now - lastState >= STATE_EVERY_MS) pushState();
  else if (changed) {
    // keep the flag for the next allowed slot
    lastState = now - STATE_EVERY_MS + STATE_MIN_GAP_MS;
  }
}

void Cloud::pushState() {
  lastState = millis();
  JsonDocument doc;
  doc["online"] = true;
  doc["lastSeen"][".sv"] = "timestamp";
  doc["rssi"] = WiFi.RSSI();
  doc["ssid"] = WiFi.SSID();
  doc["pump"] = hw::pumpOn;
  doc["auto"] = ctl->cfg.autoMode;
  doc["msg"] = ctl->msg;
  JsonArray tanks = doc["tanks"].to<JsonArray>();
  for (int i = 0; i < ctl->cfg.tankCount; i++) {
    JsonObject t = tanks.add<JsonObject>();
    t["pct"] = ctl->level[i] < 0 ? 0 : (int)roundf(ctl->level[i]);
    t["valve"] = hw::valveOn[i];
    t["ok"] = ctl->sensorOk[i];
  }
  String body;
  serializeJson(doc, body);
  db.set<object_t>(aClient, BASE + "/state", object_t(body), onResult, "state");
}

// ------------------------------------------------------------------ events / usage
void Cloud::onEvent(const char *type, int tank, bool autoRun, float minutes) {
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

void Cloud::onUsage(int tank, float minutes, float litres) {
  if (!ready() || tank < 0) return;
  struct tm t;
  if (!getLocalTime(&t, 0)) return;  // no clock yet
  char day[11];
  strftime(day, sizeof day, "%Y-%m-%d", &t);
  JsonDocument doc;
  float m = roundf(minutes * 10) / 10, l = roundf(litres);
  doc["litres"][".sv"]["increment"] = l;
  doc["pumpMin"][".sv"]["increment"] = m;
  doc["perTank/" + String(tank) + "/litres"][".sv"]["increment"] = l;
  doc["perTank/" + String(tank) + "/pumpMin"][".sv"]["increment"] = m;
  String body;
  serializeJson(doc, body);
  db.update<object_t>(aClient, BASE + "/usage/" + day, object_t(body), onResult, "usage");
}
