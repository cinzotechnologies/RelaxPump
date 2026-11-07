/*
  Smart Water Tank Controller  v1.0
  ---------------------------------------------------------------
  Hardware (pin map):
    Tank 1 sensor : Trig G16, Echo G17 (1k/2k divider)
    Tank 2 sensor : Trig G18, Echo G19 (1k/2k divider)
    Tank 3 sensor : Trig G23, Echo G4  (1k/2k divider)
    Relay IN1 G25 -> Valve 1
    Relay IN2 G26 -> Valve 2
    Relay IN3 G27 -> Valve 3
    Relay IN4 G33 -> Pump contactor
    Relay module is ACTIVE LOW (LOW = ON).

  Phone control:
    1. Phone WiFi-ah "TankController" zawm (password: 12345678)
    2. Browser-ah 192.168.4.1 hawng
    3. Settings-ah in WiFi dah la, tank teh na (cm) dah rawh.
       Chumi hnuah in WiFi-a i phone chuan http://tank.local
       emaw Serial Monitor-a IP lang kha hawng rawh.

  Serial Monitor (115200): h = help, s = sensor, 1/2/3/4 = relay test
  ---------------------------------------------------------------
*/

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>

// ------------------------- Pins -------------------------------
const int NT = 3;                                // tank zat
const int TRIG[NT]  = {16, 18, 23};
const int ECHO[NT]  = {17, 19, 4};
const int VALVE[NT] = {25, 26, 27};
const int PUMP      = 33;
const int RELAY_ON  = LOW;
const int RELAY_OFF = HIGH;

// ------------------------- Timing -----------------------------
const unsigned long VALVE_LEAD_MS   = 2000;     // valve hawng hmasa, pump on hmain
const unsigned long PUMP_STOP_MS    = 3000;     // pump off hnuah, valve khar hmain
const unsigned long SWITCH_MS       = 1500;     // tank thlak: valve thar hawng, hlui khar hmain
const unsigned long COOLDOWN_MS     = 60000;    // pump tawp hnu, a tan leh hmain
const unsigned long SENSOR_STEP_MS  = 400;      // sensor pakhat zel teh na inkar
const unsigned long NO_RISE_MS      = 300000;   // min 5 chhung level a pung loh chuan tawp
const float         NO_RISE_PCT     = 2.0;
const int           SENSOR_FAIL_MAX = 15;       // vawi 15 a chhiar theih loh chuan error

// ------------------------- Settings ---------------------------
struct Config {
  float emptyCm[NT];   // sensor atanga tank hnuai (tank ruak) - cm
  float fullCm[NT];    // sensor atanga tui (tank khat) - cm (25 aia tlem suh)
  bool  enabled[NT];
  int   lowPct;        // hei hnuaiah a tan
  int   highPct;       // hei-ah a tawp
  int   maxRunMin;     // pump kal theih rei ber (minute)
  bool  autoMode;
  String ssid, pass;
} cfg;

Preferences prefs;
WebServer server(80);

// ------------------------- State ------------------------------
enum State { IDLE, OPENING, PUMPING, SWITCHING, STOPPING, LOCKED };
const char* STATE_NAME[] = {"Idle", "Valve hawng mek", "Pump kal mek", "Tank thlak mek", "Tawp mek", "Lock (error)"};

State state = IDLE;
int   activeTank = -1;     // tui pek mek tank
int   nextTank   = -1;     // thlak tur tank
unsigned long stateAt   = 0;
unsigned long runStart  = 0;
unsigned long lastStop  = 0;
unsigned long riseCheckAt = 0;
float riseCheckPct = 0;

float distCm[NT]  = {0, 0, 0};
float levelPct[NT] = {-1, -1, -1};
int   failCount[NT] = {0, 0, 0};
bool  sensorOk[NT]  = {false, false, false};
bool  valveOn[NT]   = {false, false, false};
bool  pumpOn = false;
int   sensorIdx = 0;
unsigned long lastSensorAt = 0;
String lastError = "";

// ===================== Relay helpers ==========================
void setValve(int t, bool on) {
  valveOn[t] = on;
  digitalWrite(VALVE[t], on ? RELAY_ON : RELAY_OFF);
}

void setPump(bool on) {
  if (on) {
    bool anyOpen = false;
    for (int i = 0; i < NT; i++) if (valveOn[i]) anyOpen = true;
    if (!anyOpen) {                       // himna: valve zawng zawng khar chuan pump on lo
      Serial.println("[SAFE] Valve a khar vek - pump on lo");
      return;
    }
    if (!pumpOn) runStart = millis();
  }
  pumpOn = on;
  digitalWrite(PUMP, on ? RELAY_ON : RELAY_OFF);
}

int openValveCount() {
  int n = 0;
  for (int i = 0; i < NT; i++) if (valveOn[i]) n++;
  return n;
}

void allOff() {
  setPump(false);
  for (int i = 0; i < NT; i++) setValve(i, false);
}

// ===================== Sensors ================================
float readOnceCm(int t) {
  digitalWrite(TRIG[t], LOW);
  delayMicroseconds(4);
  digitalWrite(TRIG[t], HIGH);
  delayMicroseconds(20);                 // JSN-SR04T hian 10us aia rei a duh
  digitalWrite(TRIG[t], LOW);
  unsigned long us = pulseIn(ECHO[t], HIGH, 30000UL);   // 30 ms = 5 m vel
  if (us == 0) return -1;
  return us / 58.0f;
}

float readMedianCm(int t) {
  float v[3];
  int n = 0;
  for (int i = 0; i < 3; i++) {
    float d = readOnceCm(t);
    if (d >= 20 && d <= 450) v[n++] = d;       // 20 cm hnuai chu blind zone
    delay(40);
  }
  if (n == 0) return -1;
  for (int i = 0; i < n - 1; i++)
    for (int j = i + 1; j < n; j++)
      if (v[j] < v[i]) { float x = v[i]; v[i] = v[j]; v[j] = x; }
  return v[n / 2];
}

void updateSensor(int t) {
  if (!cfg.enabled[t]) { sensorOk[t] = false; levelPct[t] = -1; return; }
  float d = readMedianCm(t);
  if (d < 0) {
    if (failCount[t] < 1000) failCount[t]++;
    if (failCount[t] >= SENSOR_FAIL_MAX) { sensorOk[t] = false; levelPct[t] = -1; }
    return;
  }
  failCount[t] = 0;
  sensorOk[t] = true;
  distCm[t] = d;
  float span = cfg.emptyCm[t] - cfg.fullCm[t];
  if (span < 5) span = 5;
  float p = (cfg.emptyCm[t] - d) * 100.0f / span;
  if (p < 0) p = 0;
  if (p > 100) p = 100;
  levelPct[t] = (levelPct[t] < 0) ? p : (levelPct[t] * 0.6f + p * 0.4f);   // a ngawi tir
}

// ===================== Auto logic ==============================
int pickTank(int except) {                 // a hniam ber tank
  int best = -1;
  float bestPct = 1000;
  for (int i = 0; i < NT; i++) {
    if (i == except || !cfg.enabled[i] || !sensorOk[i]) continue;
    if (levelPct[i] < cfg.lowPct && levelPct[i] < bestPct) { best = i; bestPct = levelPct[i]; }
  }
  return best;
}

void goState(State s) { state = s; stateAt = millis(); }

void lockout(const String& why) {
  lastError = why;
  Serial.println("[LOCK] " + why);
  allOff();
  activeTank = nextTank = -1;
  goState(LOCKED);
}

void startFill(int t) {
  Serial.printf("[AUTO] Tank %d tui pek tan (%.0f%%)\n", t + 1, levelPct[t]);
  activeTank = t;
  setValve(t, true);
  goState(OPENING);
}

void beginStop() {
  setPump(false);
  goState(STOPPING);
}

void autoLoop() {
  unsigned long now = millis();
  unsigned long inState = now - stateAt;

  switch (state) {
    case IDLE:
      if (cfg.autoMode && (lastStop == 0 || now - lastStop > COOLDOWN_MS)) {
        int t = pickTank(-1);
        if (t >= 0) startFill(t);
      }
      break;

    case OPENING:
      if (inState >= VALVE_LEAD_MS) {
        setPump(true);
        riseCheckAt = now;
        riseCheckPct = levelPct[activeTank];
        goState(PUMPING);
      }
      break;

    case PUMPING: {
      int t = activeTank;
      if (t < 0) { beginStop(); break; }
      if (!sensorOk[t]) { lockout("Tank " + String(t + 1) + " sensor chhiar theih loh"); break; }
      if (now - runStart > (unsigned long)cfg.maxRunMin * 60000UL) {
        lockout("Pump a kal rei lutuk (" + String(cfg.maxRunMin) + " min). Sump/pipe en rawh.");
        break;
      }
      if (now - riseCheckAt > NO_RISE_MS) {
        if (levelPct[t] - riseCheckPct < NO_RISE_PCT) {
          lockout("Tank " + String(t + 1) + " tui a pung lo. Sump a kang em, pipe a chhe em?");
          break;
        }
        riseCheckAt = now;
        riseCheckPct = levelPct[t];
      }
      if (levelPct[t] >= cfg.highPct) {
        Serial.printf("[AUTO] Tank %d a khat\n", t + 1);
        int n = pickTank(t);
        if (n >= 0 && cfg.autoMode) {         // tank dang a ngai: valve thar hawng hmasa
          nextTank = n;
          setValve(n, true);
          goState(SWITCHING);
        } else {
          beginStop();
        }
      }
      break;
    }

    case SWITCHING:
      if (inState >= SWITCH_MS) {
        setValve(activeTank, false);          // valve thar a hawng tawh, a hlui khar
        Serial.printf("[AUTO] Tank %d ah thlak\n", nextTank + 1);
        activeTank = nextTank;
        nextTank = -1;
        riseCheckAt = millis();
        riseCheckPct = levelPct[activeTank];
        goState(PUMPING);
      }
      break;

    case STOPPING:
      if (inState >= PUMP_STOP_MS) {
        for (int i = 0; i < NT; i++) setValve(i, false);
        activeTank = -1;
        lastStop = millis();
        goState(IDLE);
        Serial.println("[AUTO] Pump tawp, valve khar");
      }
      break;

    case LOCKED:
      break;                                  // web/serial atanga Reset ngai
  }
}

// Manual: pump on/off leh valve kut-in. Auto chu a off phawt ang.
void manualPump(bool on) {
  if (state == LOCKED) return;
  cfg.autoMode = false;
  if (on) {
    if (openValveCount() == 0) { lastError = "Valve pakhat tal hawng hmasa rawh"; return; }
    setPump(true);
    goState(PUMPING);
    activeTank = -1;
    for (int i = 0; i < NT; i++) if (valveOn[i]) { activeTank = i; break; }
    riseCheckAt = millis();
    riseCheckPct = activeTank >= 0 ? levelPct[activeTank] : 0;
  } else {
    beginStop();
  }
}

void manualValve(int t, bool on) {
  if (state == LOCKED || t < 0 || t >= NT) return;
  cfg.autoMode = false;
  if (!on && pumpOn && openValveCount() == 1 && valveOn[t]) {
    beginStop();                              // a hnuhnung ber valve: pump off hmasa
    return;
  }
  setValve(t, on);
  if (pumpOn && on) activeTank = t;
}

// Manual pump-ah himna (max time, valve khar vek)
void manualSafety() {
  if (!pumpOn || cfg.autoMode) return;
  if (millis() - runStart > (unsigned long)cfg.maxRunMin * 60000UL)
    lockout("Pump a kal rei lutuk (manual)");
  if (openValveCount() == 0) setPump(false);
}

// ===================== Settings save/load =====================
void loadConfig() {
  prefs.begin("tank", true);
  for (int i = 0; i < NT; i++) {
    cfg.emptyCm[i] = prefs.getFloat(("e" + String(i)).c_str(), 120);
    cfg.fullCm[i]  = prefs.getFloat(("f" + String(i)).c_str(), 30);
    cfg.enabled[i] = prefs.getBool(("on" + String(i)).c_str(), true);
  }
  cfg.lowPct    = prefs.getInt("low", 20);
  cfg.highPct   = prefs.getInt("high", 95);
  cfg.maxRunMin = prefs.getInt("maxrun", 30);
  cfg.autoMode  = prefs.getBool("auto", false);   // a tirah OFF: test hmasa rawh
  cfg.ssid      = prefs.getString("ssid", "");
  cfg.pass      = prefs.getString("pass", "");
  prefs.end();
}

void saveConfig() {
  prefs.begin("tank", false);
  for (int i = 0; i < NT; i++) {
    prefs.putFloat(("e" + String(i)).c_str(), cfg.emptyCm[i]);
    prefs.putFloat(("f" + String(i)).c_str(), cfg.fullCm[i]);
    prefs.putBool(("on" + String(i)).c_str(), cfg.enabled[i]);
  }
  prefs.putInt("low", cfg.lowPct);
  prefs.putInt("high", cfg.highPct);
  prefs.putInt("maxrun", cfg.maxRunMin);
  prefs.putBool("auto", cfg.autoMode);
  prefs.putString("ssid", cfg.ssid);
  prefs.putString("pass", cfg.pass);
  prefs.end();
}

// ===================== Web page ================================
const char PAGE[] PROGMEM = R"HTML(<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tank Controller</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#eef2f0;color:#16201c}
.w{max-width:520px;margin:0 auto;padding:16px}h1{font-size:20px;margin:4px 0 12px}
.c{background:#fff;border-radius:12px;padding:14px;margin-bottom:12px}
.tanks{display:flex;gap:10px}.tk{flex:1;text-align:center}
.bar{height:120px;width:46px;margin:6px auto;border:2px solid #9ab;border-radius:6px;position:relative;overflow:hidden;background:#f6f8f7}
.fill{position:absolute;bottom:0;left:0;right:0;background:#2c78d4;transition:height .5s}
.pct{font-weight:600;font-size:18px}.sm{font-size:12px;color:#5b6863}
.row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee}
.row:last-child{border:0}button{padding:8px 16px;border-radius:8px;border:0;font-size:14px;cursor:pointer}
.on{background:#0e6b5c;color:#fff}.off{background:#d3dbd7;color:#16201c}
.err{background:#fde8e6;color:#8a1f14;padding:10px;border-radius:8px;margin-bottom:12px}
a{color:#0e6b5c}
</style></head><body><div class="w">
<h1>Tank Controller</h1>
<div id="err" class="err" style="display:none"></div>
<div class="c"><div class="tanks" id="tanks"></div></div>
<div class="c">
<div class="row"><b>Auto mode</b><button id="auto"></button></div>
<div class="row"><b>Pump</b><button id="pump"></button></div>
<div class="row"><span>Valve 1</span><button id="v0"></button></div>
<div class="row"><span>Valve 2</span><button id="v1"></button></div>
<div class="row"><span>Valve 3</span><button id="v2"></button></div>
<div class="row sm"><span id="st"></span><button class="off" onclick="go('/api/reset')">Reset</button></div>
</div>
<div class="sm">WiFi: <span id="ip"></span> · <a href="/settings">Settings</a></div>
</div><script>
let S={};
function go(u){fetch(u).then(load)}
function btn(id,on,u){const b=document.getElementById(id);b.textContent=on?'ON':'OFF';b.className=on?'on':'off';b.onclick=()=>go(u+(on?0:1))}
function load(){fetch('/api/status').then(r=>r.json()).then(s=>{S=s;
let h='';s.tanks.forEach((t,i)=>{const p=t.pct<0?0:t.pct;h+=`<div class="tk"><div class="sm">Tank ${i+1}</div><div class="bar"><div class="fill" style="height:${p}%"></div></div><div class="pct">${t.pct<0?'--':Math.round(t.pct)+'%'}</div><div class="sm">${t.ok?t.cm.toFixed(0)+' cm':'sensor error'}</div></div>`});
document.getElementById('tanks').innerHTML=h;
btn('auto',s.auto,'/api/auto?on=');btn('pump',s.pump,'/api/pump?on=');
s.valves.forEach((v,i)=>btn('v'+i,v,'/api/valve?t='+i+'&on='));
document.getElementById('st').textContent='State: '+s.state+(s.active>=0?' · Tank '+(s.active+1):'');
document.getElementById('ip').textContent=s.ip;
const e=document.getElementById('err');e.style.display=s.error?'block':'none';e.textContent=s.error;})}
load();setInterval(load,2000);
</script></body></html>)HTML";

String settingsPage() {
  String h = F("<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
               "<title>Settings</title><style>body{font-family:system-ui,sans-serif;background:#eef2f0;margin:0}"
               ".w{max-width:520px;margin:0 auto;padding:16px}.c{background:#fff;border-radius:12px;padding:14px;margin-bottom:12px}"
               "label{display:block;font-size:13px;margin-top:8px}input{width:100%;padding:8px;box-sizing:border-box;border:1px solid #ccd;border-radius:6px}"
               ".g{display:flex;gap:8px}.g>div{flex:1}button{margin-top:12px;padding:10px 18px;border:0;border-radius:8px;background:#0e6b5c;color:#fff;font-size:15px}"
               "small{color:#5b6863}</style></head><body><div class='w'><h2>Settings</h2><form method='POST' action='/settings'>"
               "<div class='c'><b>In WiFi</b><label>WiFi name</label><input name='ssid' value='");
  h += cfg.ssid;
  h += F("'><label>Password</label><input name='pass' type='password' value='");
  h += cfg.pass;
  h += F("'></div><div class='c'><b>Tank teh na (cm)</b><br><small>Ruak = sensor atanga tank hnuai. Khat = sensor atanga tui khat ber (25 aia tlem suh).</small>");
  for (int i = 0; i < NT; i++) {
    h += "<p><b>Tank " + String(i + 1) + "</b> <label style='display:inline'><input type='checkbox' name='on" + String(i) + "' style='width:auto'" + (cfg.enabled[i] ? " checked" : "") + "> Hmang</label></p>";
    h += "<div class='g'><div><label>Ruak (cm)</label><input name='e" + String(i) + "' type='number' step='1' value='" + String(cfg.emptyCm[i], 0) + "'></div>";
    h += "<div><label>Khat (cm)</label><input name='f" + String(i) + "' type='number' step='1' value='" + String(cfg.fullCm[i], 0) + "'></div></div>";
  }
  h += F("</div><div class='c'><b>Auto</b><div class='g'><div><label>Tan na (%)</label><input name='low' type='number' value='");
  h += String(cfg.lowPct);
  h += F("'></div><div><label>Tawp na (%)</label><input name='high' type='number' value='");
  h += String(cfg.highPct);
  h += F("'></div></div><label>Pump kal rei ber (minute)</label><input name='maxrun' type='number' value='");
  h += String(cfg.maxRunMin);
  h += F("'></div><button type='submit'>Save &amp; restart</button></form><p><a href='/'>Back</a></p></div></body></html>");
  return h;
}

String statusJson() {
  String j = "{\"tanks\":[";
  for (int i = 0; i < NT; i++) {
    if (i) j += ",";
    j += "{\"pct\":" + String(levelPct[i], 1) + ",\"cm\":" + String(distCm[i], 1) + ",\"ok\":" + (sensorOk[i] ? "true" : "false") + "}";
  }
  j += "],\"valves\":[";
  for (int i = 0; i < NT; i++) { if (i) j += ","; j += valveOn[i] ? "true" : "false"; }
  j += "],\"pump\":" + String(pumpOn ? "true" : "false");
  j += ",\"auto\":" + String(cfg.autoMode ? "true" : "false");
  j += ",\"state\":\"" + String(STATE_NAME[state]) + "\"";
  j += ",\"active\":" + String(activeTank);
  String ip = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("192.168.4.1 (TankController)");
  j += ",\"ip\":\"" + ip + "\"";
  String e = lastError; e.replace("\"", "'");
  j += ",\"error\":\"" + e + "\"}";
  return j;
}

void setupWeb() {
  server.on("/", []() { server.send_P(200, "text/html", PAGE); });
  server.on("/api/status", []() { server.send(200, "application/json", statusJson()); });
  server.on("/api/pump", []() { manualPump(server.arg("on") == "1"); server.send(200, "text/plain", "ok"); });
  server.on("/api/valve", []() { manualValve(server.arg("t").toInt(), server.arg("on") == "1"); server.send(200, "text/plain", "ok"); });
  server.on("/api/auto", []() {
    bool on = server.arg("on") == "1";
    if (state != LOCKED) {
      if (on && state != IDLE) beginStop();   // manual atanga auto: tawp hmasa
      cfg.autoMode = on;
      saveConfig();
    }
    server.send(200, "text/plain", "ok");
  });
  server.on("/api/reset", []() {
    allOff();
    lastError = "";
    activeTank = nextTank = -1;
    lastStop = millis();
    goState(IDLE);
    server.send(200, "text/plain", "ok");
  });
  server.on("/settings", HTTP_GET, []() { server.send(200, "text/html", settingsPage()); });
  server.on("/settings", HTTP_POST, []() {
    cfg.ssid = server.arg("ssid");
    cfg.pass = server.arg("pass");
    for (int i = 0; i < NT; i++) {
      cfg.emptyCm[i] = server.arg("e" + String(i)).toFloat();
      cfg.fullCm[i]  = server.arg("f" + String(i)).toFloat();
      cfg.enabled[i] = server.hasArg("on" + String(i));
      if (cfg.fullCm[i] < 25) cfg.fullCm[i] = 25;
      if (cfg.emptyCm[i] < cfg.fullCm[i] + 10) cfg.emptyCm[i] = cfg.fullCm[i] + 10;
    }
    cfg.lowPct    = constrain(server.arg("low").toInt(), 5, 90);
    cfg.highPct   = constrain(server.arg("high").toInt(), cfg.lowPct + 5, 100);
    cfg.maxRunMin = constrain(server.arg("maxrun").toInt(), 5, 180);
    saveConfig();
    server.send(200, "text/html", "<meta http-equiv='refresh' content='8;url=/'><p style='font-family:sans-serif'>Saved. Restart mek...</p>");
    delay(500);
    allOff();
    ESP.restart();
  });
  server.begin();
}

void setupWiFi() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP("TankController", "12345678");
  Serial.println("AP: TankController  ->  http://192.168.4.1");
  if (cfg.ssid.length()) {
    WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
    Serial.print("WiFi zawm mek: " + cfg.ssid);
    for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("WiFi IP: " + WiFi.localIP().toString() + "  (RSSI " + String(WiFi.RSSI()) + " dBm)");
      if (MDNS.begin("tank")) Serial.println("http://tank.local");
    } else {
      Serial.println("WiFi a zawm theih loh - AP hmangin hawng rawh");
    }
  }
}

// ===================== Serial test ============================
void printStatus() {
  for (int i = 0; i < NT; i++) {
    if (sensorOk[i]) Serial.printf("Tank %d: %.1f cm  %.0f%%\n", i + 1, distCm[i], levelPct[i]);
    else             Serial.printf("Tank %d: sensor error\n", i + 1);
  }
  Serial.printf("Pump %s | Valve %d%d%d | Auto %s | %s\n", pumpOn ? "ON" : "OFF",
                valveOn[0], valveOn[1], valveOn[2], cfg.autoMode ? "ON" : "OFF", STATE_NAME[state]);
}

void serialCmd() {
  if (!Serial.available()) return;
  char c = Serial.read();
  if (c == 'h') {
    Serial.println("s = sensor/status | 1,2,3 = valve on/off | 4 = pump on/off | a = auto on/off | r = reset");
  } else if (c == 's') {
    printStatus();
  } else if (c >= '1' && c <= '3') {
    int t = c - '1';
    manualValve(t, !valveOn[t]);
    printStatus();
  } else if (c == '4') {
    manualPump(!pumpOn);
    printStatus();
  } else if (c == 'a') {
    if (state != LOCKED) { if (!cfg.autoMode && state != IDLE) beginStop(); cfg.autoMode = !cfg.autoMode; saveConfig(); }
    printStatus();
  } else if (c == 'r') {
    allOff(); lastError = ""; activeTank = nextTank = -1; goState(IDLE);
    Serial.println("Reset");
  }
}

// ===================== Setup / loop ===========================
void setup() {
  for (int i = 0; i < NT; i++) {          // relay OFF hmasa, pin output siam hmain
    digitalWrite(VALVE[i], RELAY_OFF);
    pinMode(VALVE[i], OUTPUT);
    digitalWrite(VALVE[i], RELAY_OFF);
    pinMode(TRIG[i], OUTPUT);
    digitalWrite(TRIG[i], LOW);
    pinMode(ECHO[i], INPUT);
  }
  digitalWrite(PUMP, RELAY_OFF);
  pinMode(PUMP, OUTPUT);
  digitalWrite(PUMP, RELAY_OFF);

  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== Tank Controller v1.0 ===");
  loadConfig();
  setupWiFi();
  setupWeb();
  for (int i = 0; i < NT; i++) updateSensor(i);
  printStatus();
  Serial.println("h = help");
}

void loop() {
  server.handleClient();
  serialCmd();

  if (millis() - lastSensorAt >= SENSOR_STEP_MS) {
    lastSensorAt = millis();
    updateSensor(sensorIdx);
    sensorIdx = (sensorIdx + 1) % NT;
  }

  if (cfg.autoMode) autoLoop();
  else {
    if (state == OPENING || state == SWITCHING || state == STOPPING) autoLoop();  // a tawp tir zo
    manualSafety();
  }

  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 10000) { lastPrint = millis(); printStatus(); }
}
