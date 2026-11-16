/*
  RelaxPump controller v3 — engineered by CINZO.
  One PCB and ONE firmware build for both modules (docs/two-module-system.md):
    Household — pump + 1–5 semi tanks (sensor + valve each; one tank = sensor only), optional main
                tank sensor. Engine: lib/engine/src/engine.* (v2 behaviour, unchanged).
    PHE       — 1–5 PHE supply lines (sensor + valve each, no pump). Engine: lib/engine/src/phe.*.
  The module type is set at the factory (NVS "rpid/type", from `npm run factory-flash`, or the
  serial command `type household|phe`) and reported as info.type. Pins: board.h (8 relays).

  - First start (no Wi-Fi saved): BLE provisioning "RelaxPump-H-XXXX" (household) or
    "RelaxPump-P-XXXX" (PHE), security 1, shared PoP. The app reads `rp-identity`
    ("RP2;<id>;<claimCode>;<type>;<fw>"), then sends the home Wi-Fi. Hold BOOT 5 s to set up again.
  - Online: Firebase RTDB as the device account — config/cmd streams, state, events, usage.
  - Software updates over the air from the app: src/ota.h (signed, rollback).
  - The fill logic runs on the board, so Auto keeps working without internet.
  - Serial 115200, type `h` + Enter for the bench / factory commands.

  LED: slow blink = waiting for Bluetooth setup, fast blink = connecting, on = online,
       double blink = stopped for safety (see the app), very fast flicker = software update.
*/
#include <Arduino.h>
#include <ArduinoOTA.h>
#include <WiFi.h>
#include <esp_task_wdt.h>
#include <esp_wifi.h>
#include <wifi_provisioning/manager.h>
#include <wifi_provisioning/scheme_ble.h>

#include "board.h"
#include "cloud.h"
#include "config.h"
#include "identity.h"
#include "ota.h"
#include "settings.h"

rp::Engine eng;       // household
rp::PheEngine pheEng;  // PHE
static board::Outputs outputs;
static bool phe = false;  // module type, fixed at boot

static volatile bool provisioning = false;
static volatile bool gotIp = false;
static bool otaStarted = false;

bool pumpBusy() {
  if (phe) return false;
  rp::Phase p = eng.phase();
  return eng.pumpOn || p == rp::Phase::Opening || p == rp::Phase::Filling || p == rp::Phase::Switching ||
         p == rp::Phase::Stopping || p == rp::Phase::Testing;
}

// ------------------------------------------------------------------ config
void applyConfig(const String &json, bool fromCloud) {
  if (phe) {
    rp::PheLayout l = pheEng.cfg;
    if (!settings::parsePhe(json, l)) return;
    pheEng.setLayout(l, millis());
    if (fromCloud) settings::saveConfig(json);
    Serial.printf("[CFG] PHE: %d line%s, reopen <%d%%, close %d%%\n", pheEng.cfg.n, pheEng.cfg.n == 1 ? "" : "s",
                  pheEng.cfg.low, pheEng.cfg.high);
    return;
  }
  rp::Layout l = eng.cfg;
  if (!settings::parse(json, l)) return;
  eng.setLayout(l, millis());
  if (fromCloud) settings::saveConfig(json);
  Serial.printf("[CFG] %d tank%s (%s)%s, start <%d%%, stop %d%%, max %d min\n", eng.cfg.n, eng.cfg.n == 1 ? "" : "s",
                rp::hasValves(eng.cfg) ? "valve per tank" : "no valve, pump direct",
                eng.cfg.main.enabled ? " + main tank sensor" : "", eng.cfg.low, eng.cfg.high, eng.cfg.maxRunMin);
}

// ------------------------------------------------------------------ Wi-Fi / BLE setup
static String bleName() {
  // RelaxPump-H-1C2C / RelaxPump-P-1C2C: the app shows the type in the scan list.
  return String("RelaxPump-") + (phe ? "P-" : "H-") + identity::get().id.substring(5);
}

static void onSysEvent(arduino_event_t *e) {
  switch (e->event_id) {
    case ARDUINO_EVENT_PROV_START:
      provisioning = true;
      Serial.println("[PROV] Bluetooth setup started: " + bleName());
      break;
    case ARDUINO_EVENT_PROV_CRED_RECV:
      Serial.printf("[PROV] got Wi-Fi \"%s\"\n", (const char *)e->event_info.prov_cred_recv.ssid);
      break;
    case ARDUINO_EVENT_PROV_CRED_FAIL:
      Serial.println("[PROV] Wi-Fi failed: wrong password or network not found");
      break;
    case ARDUINO_EVENT_PROV_CRED_SUCCESS:
      Serial.println("[PROV] Wi-Fi OK");
      break;
    case ARDUINO_EVENT_PROV_END:
      provisioning = false;
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      gotIp = true;
      Serial.print("[WIFI] IP ");
      Serial.println(IPAddress(e->event_info.got_ip.ip_info.ip.addr));
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      gotIp = false;
      break;
    default:
      break;
  }
}

bool wifiLowLevelInit(bool persistent);  // arduino-esp32 WiFiGeneric

// Without this, initArduino() frees the Bluetooth controller memory at boot (its weak default says
// Bluetooth is unused) and BLE setup can never start. The WiFiProv library used to pull this in.
extern "C" bool btInUse() { return true; }

/** Encrypted BLE reply: the app reads this board's id, claim code, type and firmware. */
static esp_err_t onIdentityRequest(uint32_t, const uint8_t *, ssize_t, uint8_t **out, ssize_t *outLen, void *) {
  const identity::Id &id = identity::get();
  String reply = "RP2;" + id.id + ";" + id.claim + ";" + identity::typeName() + ";" FW_VERSION;
  *out = (uint8_t *)strdup(reply.c_str());
  if (!*out) return ESP_ERR_NO_MEM;
  *outLen = reply.length();
  return ESP_OK;
}

/**
 * Uses saved Wi-Fi if there is one; otherwise advertises over BLE until the app sends it.
 * Same steps as WiFiProv.beginProvision, which has no way to add the identity endpoint.
 */
static void startProvisioning() {
  static uint8_t serviceUuid[16] = {0xb4, 0xdf, 0x5a, 0x1c, 0x3f, 0x6b, 0xf4, 0xbf,
                                    0xea, 0x4a, 0x82, 0x03, 0x04, 0x90, 0x1a, 0x02};
  static char service[24];
  snprintf(service, sizeof service, "%s", bleName().c_str());

  wifi_prov_mgr_config_t config = {};
  config.scheme = wifi_prov_scheme_ble;
  // FREE_BTDM releases the Bluetooth memory once setup is done (needed for TLS).
  config.scheme_event_handler.event_cb = wifi_prov_scheme_ble_event_cb_free_btdm;

  wifiLowLevelInit(true);
  bool provisioned = false;
  if (wifi_prov_mgr_init(config) != ESP_OK || wifi_prov_mgr_is_provisioned(&provisioned) != ESP_OK) {
    Serial.println("[PROV] could not start the setup manager");
    return;
  }
  if (provisioned) {
    wifi_config_t saved = {};
    esp_wifi_get_config(WIFI_IF_STA, &saved);
    Serial.printf("[WIFI] connecting to saved network \"%s\" (hold BOOT 5 s or type w to forget it)\n",
                  (const char *)saved.sta.ssid);
    esp_wifi_start();
    wifi_prov_mgr_deinit();
    WiFi.begin();
    return;
  }
  wifi_prov_scheme_ble_set_service_uuid(serviceUuid);
  if (wifi_prov_mgr_endpoint_create(BLE_IDENTITY_ENDPOINT) != ESP_OK ||
      wifi_prov_mgr_start_provisioning(WIFI_PROV_SECURITY_1, RP_BLE_POP, service, NULL) != ESP_OK ||
      wifi_prov_mgr_endpoint_register(BLE_IDENTITY_ENDPOINT, onIdentityRequest, NULL) != ESP_OK) {
    Serial.println("[PROV] could not start Bluetooth setup");
  }
}

static bool wifiResetWanted = false;
static uint32_t wifiResetAt = 0;
void requestWifiReset() {
  wifiResetWanted = true;
  wifiResetAt = millis();
}

static void allStop() {
  if (phe) pheEng.closeAll(millis());
  else eng.reset(millis());
  board::allOff();
}

/** Forget the saved Wi-Fi and restart: the board comes back in Bluetooth setup. */
static void forgetWifiAndRestart(const char *why) {
  Serial.printf("[PROV] %s: forgetting Wi-Fi, restarting into Bluetooth setup\n", why);
  allStop();
  WiFi.disconnect(true, true);  // erase saved credentials
  delay(300);
  ESP.restart();
}

static void checkBootButton() {
  static uint32_t downAt = 0;
  static bool down = false;
  if (digitalRead(PIN_BOOT) == LOW) {
    if (!down) {
      down = true;
      downAt = millis();
    }
    if (millis() - downAt > BOOT_HOLD_MS) forgetWifiAndRestart("BOOT held");
  } else {
    down = false;
  }
}

// ------------------------------------------------------------------ sensors
static int activeLines() { return phe ? pheEng.cfg.n : eng.cfg.n; }
static bool mainInLayout() { return !phe && eng.cfg.main.enabled; }

static void feedReading(int idx, float cm) {
  if (phe) pheEng.reading(idx, cm, millis());
  else eng.reading(idx, cm, millis());
}

/** One reading per step: ports in the layout every time, the other ports now and then (setup). */
static void readSensors() {
  static uint32_t last = 0;
  static int cur = 0, spare = 0, step = 0;
  if (millis() - last < SENSOR_STEP_MS) return;
  last = millis();
  const int ports = phe ? rp::MAX_TANKS : rp::N_SENSORS;  // PHE boards have no MAIN port
  auto inLayout = [&](int i) { return i == rp::MAIN ? mainInLayout() : i < activeLines(); };
  int idx = -1;
  if (++step % SPARE_PORT_EVERY == 0) {
    for (int k = 0; k < ports && idx < 0; k++) {
      spare = (spare + 1) % ports;
      if (!inLayout(spare)) idx = spare;
    }
  }
  for (int k = 0; k < ports && idx < 0; k++) {
    cur = (cur + 1) % ports;
    if (inLayout(cur)) idx = cur;
  }
  if (idx < 0) return;
  feedReading(idx, board::readCm(idx));
}

// ------------------------------------------------------------------ LED
static void led() {
  uint32_t t = millis();
  bool on;
  if (ota::active()) on = (t % 120) < 60;
  else if (!phe && eng.phase() == rp::Phase::Locked)
    on = (t % 1200) < 120 || ((t % 1200) > 240 && (t % 1200) < 360);
  else if (provisioning) on = (t % 1000) < 500;
  else if (!cloud.ready()) on = (t % 250) < 125;
  else on = true;
  digitalWrite(PIN_LED, on);
}

// ------------------------------------------------------------------ Serial (bench + factory)
static void printStatus() {
  const identity::Id &id = identity::get();
  if (phe) {
    for (int i = 0; i < pheEng.cfg.n; i++) {
      Serial.printf("Line %d (T%d/V%d): ", i + 1, i + 1, i + 1);
      if (pheEng.ok[i]) Serial.printf("%.1f cm  %.0f%%", pheEng.distCm[i], pheEng.level[i]);
      else Serial.print("sensor error");
      Serial.printf("  valve %s%s%s\n", pheEng.valveOn[i] ? "OPEN" : "closed", pheEng.rising[i] ? "  rising" : "",
                    pheEng.held[i] ? "  (held closed)" : "");
    }
  } else {
    for (int i = 0; i < eng.cfg.n; i++) {
      Serial.printf("Tank %d (T%d): ", i + 1, i + 1);
      if (eng.ok[i]) Serial.printf("%.1f cm  %.0f%%", eng.distCm[i], eng.level[i]);
      else Serial.print("sensor error");
      if (rp::hasValves(eng.cfg)) Serial.printf("  V%d %s\n", i + 1, eng.valveOn[i] ? "OPEN" : "closed");
      else Serial.println("  (no valve)");
    }
    if (eng.cfg.main.enabled) {
      if (eng.ok[rp::MAIN]) Serial.printf("Main: %.1f cm  %.0f%% (stop below %d%%)\n", eng.distCm[rp::MAIN],
                                          eng.level[rp::MAIN], eng.cfg.main.minPct);
      else Serial.println("Main: sensor error");
    }
  }
  Serial.print("Ports answering:");
  for (int i = 0; i < rp::N_SENSORS; i++) {
    bool d = phe ? pheEng.detected[i] : eng.detected[i];
    if (d) Serial.printf(i == rp::MAIN ? " MAIN" : " T%d", i + 1);
  }
  Serial.println();
  Serial.printf("%s %s %s | board %s (%s) | ", phe ? "PHE" : "Household", id.id.c_str(), FW_VERSION, board::label(),
                board::version() == 1 ? "relays, active LOW" : "active HIGH");
  if (phe)
    Serial.printf("Valves on %d | Auto %s | supply %s", pheEng.valvesOn(), pheEng.autoMode ? "ON" : "off",
                  rp::supplyName(pheEng.supply()));
  else
    Serial.printf("Pump %s | Valves on %d | Auto %s | %s", eng.pumpOn ? "ON" : "off", eng.valvesOn(),
                  eng.autoMode ? "ON" : "off", eng.phaseName());
  Serial.printf(" | cloud %s | heap %u%s\n", cloud.ready() ? "online" : "offline", ESP.getFreeHeap(),
                ota::active() ? " | UPDATING" : "");
  const char *m = phe ? pheEng.msg : eng.msg;
  if (m[0]) Serial.printf("Msg: %s\n", m);
}

static void serialHelp() {
  if (phe)
    Serial.println(
        "s            status\n"
        "v<n>         open/close the valve of PHE line n (1-5)\n"
        "t<port>      test pulse 1 s: tV1 … tV5\n"
        "a            auto fill on/off\n"
        "r            reset (all valves closed)");
  else
    Serial.println(
        "s            status\n"
        "v<n>         open/close valve n (1-5); opening starts the pump\n"
        "f<n>         fill tank n (opens its valve, then the pump)\n"
        "p            pump on/off (one tank: pump only)\n"
        "t<port>      test pulse 1 s: tV1 … tV5, tPUMP\n"
        "c            pump check\n"
        "a            auto on/off\n"
        "r            reset (clears a lockout, everything off)");
  Serial.println(
      "id           identity (id, type, flash, OTA bucket)\n"
      "type household|phe   factory: set the module type and restart\n"
      "board 1|2|3  board version (1 relays LOW, 2 PCB HIGH, 3 Rev C HIGH) and restart\n"
      "w            forget Wi-Fi and restart");
}

static void restartNow(const char *why) {
  Serial.println(why);
  allStop();
  delay(300);
  ESP.restart();
}

static void serialCmd() {
  static String line;
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch != '\n' && ch != '\r') {
      if (line.length() < 32) line += ch;
      continue;
    }
    line.trim();
    if (!line.length()) continue;
    String c = line;
    line = "";
    uint32_t now = millis();
    if (c == "h") {
      serialHelp();
      continue;
    }
    if (c == "s") {
      printStatus();
      continue;
    }
    if (c == "id") {
      const identity::Id &id = identity::get();
      Serial.printf("id %s (%s) type %s, board %s, flash %d MB, fw %s, OTA bucket %d, BLE %s\n", id.id.c_str(),
                    id.fromNvs ? "NVS" : "secrets.h", identity::typeName(), board::label(), board::flashMb(),
                    FW_VERSION, ota::bucket(id.id), bleName().c_str());
      continue;
    }
    if (c.startsWith("type ")) {
      if (identity::storeType(c.substring(5))) restartNow("Type saved, restarting");
      else Serial.println("type household | type phe");
      continue;
    }
    if (c == "board 1" || c == "board 2" || c == "board 3") {
      board::storeVersion(c[6] - '0');
      restartNow("Board version saved, restarting");
      continue;
    }
    if (c == "w") {
      forgetWifiAndRestart("serial w");
      continue;
    }
    if (ota::active()) {
      Serial.println("Software update running");
      continue;
    }
    bool known = true;
    if (phe) {
      if (c[0] == 'v' && c.length() == 2) {
        int i = c[1] - '1';
        if (i >= 0 && i < rp::MAX_TANKS) pheEng.cmdValve(i, !pheEng.valveOn[i], now);
      } else if (c[0] == 't' && c[1] == 'V' && c.length() == 3) pheEng.cmdTest(c[2] - '1', 1000, now);
      else if (c == "a") pheEng.cmdAuto(!pheEng.autoMode, now);
      else if (c == "r") pheEng.reset(now);
      else known = false;
    } else {
      if (c[0] == 'v' && c.length() == 2) {
        int i = c[1] - '1';
        if (i >= 0 && i < rp::MAX_TANKS) eng.cmdValve(i, !eng.valveOn[i], now);
      } else if (c[0] == 'f' && c.length() == 2) {
        int i = c[1] - '1';
        if (i >= 0 && i < eng.cfg.n) {
          if (rp::hasValves(eng.cfg)) eng.cmdValve(i, true, now);
          eng.cmdPump(true, now);
        }
      } else if (c == "p") eng.cmdPump(!eng.pumpOn, now);
      else if (c == "tPUMP") eng.cmdTest(rp::PORT_PUMP, 1000, now);
      else if (c[0] == 't' && c[1] == 'V' && c.length() == 3) eng.cmdTest(c[2] - '1', 1000, now);
      else if (c == "c") eng.cmdPumpCheck(now);
      else if (c == "a") eng.cmdAuto(!eng.autoMode, now);
      else if (c == "r") {
        eng.reset(now);
        Serial.println("Reset");
      } else known = false;
    }
    if (!known) Serial.println("? (h = help)");
    else printStatus();
  }
}

// ------------------------------------------------------------------ setup / loop
void setup() {
  board::begin(board::storedVersion());  // outputs OFF before anything else
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  Serial.begin(115200);
  delay(200);
  phe = identity::isPhe();
  const identity::Id &id = identity::get();
  Serial.printf("\n=== RelaxPump %s  %s  %s  board %s  flash %d MB ===\n", FW_VERSION,
                id.id.length() ? id.id.c_str() : "(no identity)", phe ? "PHE" : "Household", board::label(),
                board::flashMb());
  if (!identity::valid())
    Serial.println("!! No device identity: run `npm run factory-flash` (firebase/), or put secrets.h in include/");
  ota::boot();

  if (phe) {
    pheEng.begin(&outputs, &cloud);  // every valve closed
    String saved = settings::loadConfig();
    if (saved.length()) applyConfig(saved, false);
    else pheEng.setLayout(pheEng.cfg, millis());  // 1 line until the setup in the app
    pheEng.autoMode = settings::loadAuto();
  } else {
    eng.begin(&outputs, &cloud);
    String saved = settings::loadConfig();
    if (saved.length()) applyConfig(saved, false);
    else eng.setLayout(eng.cfg, millis());  // 3 tanks until the installer setup in the app
    eng.autoMode = settings::loadAuto();
  }

  WiFi.onEvent(onSysEvent);
  if (identity::valid()) startProvisioning();

  esp_task_wdt_init(15, true);  // reboot if the loop hangs for 15 s (outputs default OFF)
  esp_task_wdt_add(NULL);
  serialHelp();
}

void loop() {
  esp_task_wdt_reset();
  checkBootButton();
  serialCmd();
  readSensors();
  ota::loop();

  static bool otaStopped = false;
  if (ota::active()) {
    // Software update: pump off, every valve closed, engines paused until the restart.
    if (!otaStopped) {
      otaStopped = true;
      allStop();
    }
    board::allOff();
  } else {
    otaStopped = false;  // a failed update: the engines carry on (everything was closed)
    if (phe) pheEng.loop(millis());
    else eng.loop(millis());
  }

  const bool autoNow = phe ? pheEng.autoMode : eng.autoMode;
  static bool savedAuto = autoNow;
  if (autoNow != savedAuto) {
    savedAuto = autoNow;
    settings::saveAuto(savedAuto);
  }

  if (gotIp && !provisioning) {
    cloud.begin();
    if (!otaStarted && identity::valid()) {
      otaStarted = true;
      // LAN updates for development: pio run -t upload -e ota --upload-port relaxpump-XXXXXX.local
      ArduinoOTA.setHostname(("relaxpump-" + identity::get().id.substring(3)).c_str());
      ArduinoOTA.setPassword(identity::get().pop.c_str());
      ArduinoOTA.onStart([]() { allStop(); });
      ArduinoOTA.begin();
    }
    if (otaStarted) ArduinoOTA.handle();
  }
  cloud.loop();
  // Household only: the pump must not run on while the app cannot see it. PHE has no pump; its
  // valves keep working from the sensors.
  if (!phe && cloud.started() && !cloud.ready()) eng.offlineGuard(cloud.offlineMs(), millis());
  // Give the cmd delete 1.5 s to reach the database, or the reset would repeat after the restart.
  if (wifiResetWanted && millis() - wifiResetAt > 1500) forgetWifiAndRestart("Wi-Fi reset from the app");

  led();
  static uint32_t lastPrint = 0;
  if (millis() - lastPrint > 15000) {
    lastPrint = millis();
    printStatus();
  }
}
