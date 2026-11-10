/*
  RelaxPump controller v2 — engineered by CINZO.
  One firmware for every home: 1–8 semi tanks (sensor and/or valve each), optional PHE line,
  optional main-tank sensor, one pump. The installer setup in the app writes the layout to
  `config`; nothing is re-flashed per customer. Board v1 or v2 pin map: see board.h.

  - First start (no Wi-Fi saved): BLE provisioning "RelaxPump-XXXX" (security 1 + PoP from secrets.h).
    The app sends the home Wi-Fi. Hold BOOT 5 s to forget Wi-Fi and set up again.
  - Online: Firebase RTDB as the device account — config/cmd streams, state, events, usage.
  - The fill logic (lib/engine) runs on the board, so Auto keeps working without internet.
  - Serial 115200, type `h` + Enter for the bench commands.

  LED: slow blink = waiting for Bluetooth setup, fast blink = connecting, on = online,
       double blink = stopped for safety (see the app).
*/
#include <Arduino.h>
#include <ArduinoOTA.h>
#include <WiFi.h>
#include <WiFiProv.h>
#include <esp_task_wdt.h>

#include "board.h"
#include "cloud.h"
#include "config.h"
#include "secrets.h"
#include "settings.h"

rp::Engine eng;
static board::Outputs outputs;

static volatile bool provisioning = false;
static volatile bool gotIp = false;
static bool otaStarted = false;

// ------------------------------------------------------------------ config
void applyConfig(const String &json, bool fromCloud) {
  rp::Layout l = eng.cfg;
  settings::Parsed p = settings::parse(json, l);
  if (!p.ok) return;
  eng.setLayout(l, millis());
  if (fromCloud) settings::saveConfig(json);
  Serial.printf("[CFG] %d tanks%s%s, mode %s, start <%d%%, stop %d%%, max %d min\n", eng.cfg.n,
                eng.cfg.phe.enabled ? " + PHE" : "", eng.cfg.main.enabled ? " + main" : "",
                eng.cfg.mode == rp::Mode::Auto  ? "auto"
                : eng.cfg.mode == rp::Mode::Phe ? "PHE only"
                                                : "pump only",
                eng.cfg.low, eng.cfg.high, eng.cfg.maxRunMin);
}

// ------------------------------------------------------------------ Wi-Fi / BLE setup
static void onSysEvent(arduino_event_t *e) {
  switch (e->event_id) {
    case ARDUINO_EVENT_PROV_START:
      provisioning = true;
      Serial.println("[PROV] Bluetooth setup started: RelaxPump-" + String(RP_DEVICE_ID).substring(5));
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

static void startProvisioning(bool forget) {
  static char service[20];
  snprintf(service, sizeof service, "RelaxPump-%s", String(RP_DEVICE_ID).substring(5).c_str());
  // Uses saved Wi-Fi if there is one; otherwise advertises over BLE until the app sends it.
  // FREE_BTDM releases the Bluetooth memory once setup is done (needed for TLS).
  WiFiProv.beginProvision(WIFI_PROV_SCHEME_BLE, WIFI_PROV_SCHEME_HANDLER_FREE_BTDM, WIFI_PROV_SECURITY_1, RP_POP,
                          service, NULL, NULL, forget);
}

static void checkBootButton() {
  static uint32_t downAt = 0;
  if (digitalRead(PIN_BOOT) == LOW) {
    if (!downAt) downAt = millis();
    if (millis() - downAt > BOOT_HOLD_MS) {
      Serial.println("[PROV] BOOT held: forgetting Wi-Fi, restarting into Bluetooth setup");
      board::allOff();
      WiFi.disconnect(true, true);  // erase saved credentials
      delay(300);
      ESP.restart();
    }
  } else {
    downAt = 0;
  }
}

// ------------------------------------------------------------------ sensors
/** One reading per step: ports in the layout every time, the other ports now and then (setup). */
static void readSensors() {
  static uint32_t last = 0;
  static int cur = 0, spare = 0, step = 0;
  if (millis() - last < SENSOR_STEP_MS) return;
  last = millis();
  rp::Ports p = board::ports();
  auto inLayout = [&](int i) {
    if (i == rp::MAIN) return eng.cfg.main.enabled && eng.cfg.main.sensor;
    return i < eng.cfg.n && eng.cfg.semi[i].sensor;
  };
  auto exists = [&](int i) { return i == rp::MAIN ? p.main : i < p.sensors; };
  int idx = -1;
  if (++step % SPARE_PORT_EVERY == 0) {
    for (int k = 0; k < rp::N_SENSORS && idx < 0; k++) {
      spare = (spare + 1) % rp::N_SENSORS;
      if (exists(spare) && !inLayout(spare)) idx = spare;
    }
  }
  for (int k = 0; k < rp::N_SENSORS && idx < 0; k++) {
    cur = (cur + 1) % rp::N_SENSORS;
    if (inLayout(cur)) idx = cur;
  }
  if (idx < 0) return;
  eng.reading(idx, board::readCm(idx), millis());
}

static void checkBoard() {
  static uint32_t last = 0;
  if (board::version() != 2 || millis() - last < BOARD_CHECK_MS) return;
  last = millis();
  if (board::faultCheck()) eng.boardFault(millis());
}

// ------------------------------------------------------------------ LED
static void led() {
  uint32_t t = millis();
  bool on;
  if (eng.phase() == rp::Phase::Locked) on = (t % 1200) < 120 || ((t % 1200) > 240 && (t % 1200) < 360);
  else if (provisioning) on = (t % 1000) < 500;
  else if (!cloud.ready()) on = (t % 250) < 125;
  else on = true;
  digitalWrite(PIN_LED, on);
}

// ------------------------------------------------------------------ Serial (bench tests)
static void printStatus() {
  for (int i = 0; i < eng.cfg.n; i++) {
    const rp::SemiCfg &c = eng.cfg.semi[i];
    Serial.printf("Tank %d [%s%s]: ", i + 1, c.sensor ? "S" : "-", c.valve ? "V" : "-");
    if (!c.sensor) Serial.printf("no sensor, timer %d min", c.fillMin);
    else if (eng.ok[i]) Serial.printf("%.1f cm  %.0f%%", eng.distCm[i], eng.level[i]);
    else Serial.print("sensor error");
    Serial.printf("  valve %s\n", eng.valveOn[i] ? "OPEN" : "closed");
  }
  if (eng.cfg.main.enabled && eng.cfg.main.sensor) {
    if (eng.ok[rp::MAIN]) Serial.printf("Main: %.1f cm  %.0f%% (stop below %d%%)\n", eng.distCm[rp::MAIN],
                                        eng.level[rp::MAIN], eng.cfg.main.minPct);
    else Serial.println("Main: sensor error");
  }
  Serial.print("Ports answering:");
  for (int i = 0; i < rp::N_SENSORS; i++)
    if (eng.detected[i]) Serial.printf(i == rp::MAIN ? " MAIN" : " S%d", i + 1);
  Serial.println();
  Serial.printf("Board v%d%s | Pump %s | PHE %s | Auto %s | %s | cloud %s | heap %u\n", board::version(),
                board::faulted() ? " (VALVE BOARD ERROR)" : "", eng.pumpOn ? "ON" : "off", eng.pheOn ? "ON" : "off",
                eng.autoMode ? "ON" : "off", eng.phaseName(), cloud.ready() ? "online" : "offline",
                ESP.getFreeHeap());
  if (eng.msg[0]) Serial.printf("Msg: %s\n", eng.msg);
}

static void serialHelp() {
  Serial.println(
      "s            status\n"
      "v<n>         toggle valve n (1-8)\n"
      "f<n>         fill tank n (source from the mode)\n"
      "p / e        pump on/off / PHE on/off\n"
      "t<port>      test pulse 1 s: tV3, tPHE, tPUMP\n"
      "c            pump check\n"
      "a            auto on/off\n"
      "r            reset (clears a lockout, everything off)\n"
      "board 1|2    set board version and restart\n"
      "w            forget Wi-Fi and restart");
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
    if (c == "h") serialHelp();
    else if (c == "s") printStatus();
    else if (c[0] == 'v' && c.length() == 2) {
      int i = c[1] - '1';
      if (i >= 0 && i < 8) eng.cmdValve(i, !eng.valveOn[i], now);
    } else if (c[0] == 'f' && c.length() == 2) {
      int i = c[1] - '1';
      eng.cmdFill(i, eng.cfg.mode == rp::Mode::Phe || (eng.cfg.mode == rp::Mode::Auto && eng.cfg.phe.enabled)
                         ? rp::Src::Phe
                         : rp::Src::Pump,
                  now);
    } else if (c == "p") eng.cmdPump(!eng.pumpOn, now);
    else if (c == "e") eng.cmdPhe(!eng.pheOn, now);
    else if (c == "tPHE") eng.cmdTest(rp::PORT_PHE, 1000, now);
    else if (c == "tPUMP") eng.cmdTest(rp::PORT_PUMP, 1000, now);
    else if (c[0] == 't' && c[1] == 'V' && c.length() == 3) eng.cmdTest(c[2] - '1', 1000, now);
    else if (c == "c") eng.cmdPumpCheck(now);
    else if (c == "a") eng.cmdAuto(!eng.autoMode, now);
    else if (c == "r") {
      eng.reset(now);
      Serial.println("Reset");
    } else if (c == "board 1" || c == "board 2") {
      board::storeVersion(c[6] - '0');
      Serial.println("Board version saved, restarting");
      board::allOff();
      delay(300);
      ESP.restart();
    } else if (c == "w") {
      board::allOff();
      WiFi.disconnect(true, true);
      delay(300);
      ESP.restart();
    } else {
      Serial.println("? (h = help)");
      continue;
    }
    if (c != "h") printStatus();
  }
}

// ------------------------------------------------------------------ setup / loop
void setup() {
  board::begin(board::storedVersion());  // outputs OFF before anything else
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n=== RelaxPump %s  %s  board v%d ===\n", FW_VERSION, RP_DEVICE_ID, board::version());

  eng.ports = board::ports();
  eng.begin(&outputs, &cloud);
  String saved = settings::loadConfig();
  if (saved.length()) applyConfig(saved, false);
  else eng.setLayout(eng.cfg, millis());  // 3 tanks with sensor + valve until the app sets it up
  eng.autoMode = settings::loadAuto();
  if (board::faulted()) eng.boardFault(millis());

  WiFi.onEvent(onSysEvent);
  startProvisioning(false);

  esp_task_wdt_init(15, true);  // reboot if the loop hangs for 15 s (outputs default OFF)
  esp_task_wdt_add(NULL);
  serialHelp();
}

void loop() {
  esp_task_wdt_reset();
  checkBootButton();
  serialCmd();
  readSensors();
  checkBoard();
  eng.loop(millis());

  static bool savedAuto = eng.autoMode;
  if (eng.autoMode != savedAuto) {
    savedAuto = eng.autoMode;
    settings::saveAuto(savedAuto);
  }

  if (gotIp && !provisioning) {
    cloud.begin(&eng);
    if (!otaStarted) {
      otaStarted = true;
      ArduinoOTA.setHostname(("relaxpump-" + String(RP_DEVICE_ID).substring(3)).c_str());
      ArduinoOTA.setPassword(RP_POP);
      ArduinoOTA.onStart([]() { board::allOff(); });
      ArduinoOTA.begin();
    }
    ArduinoOTA.handle();
  }
  cloud.loop();
  if (cloud.started() && !cloud.ready()) eng.offlineGuard(cloud.offlineMs(), millis());

  led();
  static uint32_t lastPrint = 0;
  if (millis() - lastPrint > 15000) {
    lastPrint = millis();
    printStatus();
  }
}
