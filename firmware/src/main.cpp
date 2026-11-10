/*
  RelaxPump controller v2 — engineered by CINZO.
  One firmware for every home: 1–5 semi tanks (sensor + valve each; one tank = sensor only, the
  pump fills it directly), optional main-tank sensor, 6 outputs (V1–V5 + pump). The installer
  setup in the app writes the layout to `config`; nothing is re-flashed per customer.
  Pins: see board.h (board 1 = relay module active LOW, board 2 = PCB active HIGH).

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
  if (!settings::parse(json, l)) return;
  eng.setLayout(l, millis());
  if (fromCloud) settings::saveConfig(json);
  Serial.printf("[CFG] %d tank%s (%s)%s, start <%d%%, stop %d%%, max %d min\n", eng.cfg.n, eng.cfg.n == 1 ? "" : "s",
                rp::hasValves(eng.cfg) ? "valve per tank" : "no valve, pump direct",
                eng.cfg.main.enabled ? " + main tank sensor" : "", eng.cfg.low, eng.cfg.high, eng.cfg.maxRunMin);
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
  auto inLayout = [&](int i) { return i == rp::MAIN ? eng.cfg.main.enabled : i < eng.cfg.n; };
  int idx = -1;
  if (++step % SPARE_PORT_EVERY == 0) {
    for (int k = 0; k < rp::N_SENSORS && idx < 0; k++) {
      spare = (spare + 1) % rp::N_SENSORS;
      if (!inLayout(spare)) idx = spare;
    }
  }
  for (int k = 0; k < rp::N_SENSORS && idx < 0; k++) {
    cur = (cur + 1) % rp::N_SENSORS;
    if (inLayout(cur)) idx = cur;
  }
  if (idx < 0) return;
  eng.reading(idx, board::readCm(idx), millis());
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
  Serial.print("Ports answering:");
  for (int i = 0; i < rp::N_SENSORS; i++)
    if (eng.detected[i]) Serial.printf(i == rp::MAIN ? " MAIN" : " T%d", i + 1);
  Serial.println();
  Serial.printf("Board %d (%s) | Pump %s | Valves on %d | Auto %s | %s | cloud %s | heap %u\n", board::version(),
                board::version() == 2 ? "PCB, active HIGH" : "relays, active LOW", eng.pumpOn ? "ON" : "off",
                eng.valvesOn(), eng.autoMode ? "ON" : "off", eng.phaseName(), cloud.ready() ? "online" : "offline",
                ESP.getFreeHeap());
  if (eng.msg[0]) Serial.printf("Msg: %s\n", eng.msg);
}

static void serialHelp() {
  Serial.println(
      "s            status\n"
      "v<n>         toggle valve n (1-5)\n"
      "f<n>         fill tank n (opens its valve, then the pump)\n"
      "p            pump on/off (one tank: pump only)\n"
      "t<port>      test pulse 1 s: tV1 … tV5, tPUMP\n"
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

  eng.begin(&outputs, &cloud);
  String saved = settings::loadConfig();
  if (saved.length()) applyConfig(saved, false);
  else eng.setLayout(eng.cfg, millis());  // 3 tanks until the installer setup in the app
  eng.autoMode = settings::loadAuto();

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
