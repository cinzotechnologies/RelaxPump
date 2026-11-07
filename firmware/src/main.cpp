/*
  RelaxPump controller — engineered by CINZO.
  ESP32: up to 3 tanks (ultrasonic sensor + solenoid valve each), pump via relay + contactor.

  - First start (no Wi-Fi saved): BLE provisioning "RelaxPump-XXXX" (security 1 + PoP from secrets.h).
    The app sends the home Wi-Fi. Hold BOOT 5 s to forget Wi-Fi and set up again.
  - Online: Firebase RTDB as the device account — config/cmd streams, state, events, usage.
  - The pump logic runs on the board, so auto mode keeps working without internet.
  - Serial 115200: h = help, s = status, 1/2/3 = valve, 4 = pump, a = auto, r = reset.

  LED: slow blink = waiting for Bluetooth setup, fast blink = connecting, on = online,
       double blink = stopped for safety (see the app).
*/
#include <Arduino.h>
#include <ArduinoOTA.h>
#include <WiFi.h>
#include <WiFiProv.h>
#include <esp_task_wdt.h>

#include "cloud.h"
#include "config.h"
#include "controller.h"
#include "hw.h"
#include "secrets.h"

Controller ctl;

static volatile bool provisioning = false;
static volatile bool gotIp = false;
static bool otaStarted = false;

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
      hw::allOff();
      WiFi.disconnect(true, true);  // erase saved credentials
      delay(300);
      ESP.restart();
    }
  } else {
    downAt = 0;
  }
}

// ------------------------------------------------------------------ LED
static void led() {
  uint32_t t = millis();
  bool on;
  if (ctl.phase() == Phase::Locked) on = (t % 1200) < 120 || ((t % 1200) > 240 && (t % 1200) < 360);
  else if (provisioning) on = (t % 1000) < 500;
  else if (!cloud.ready()) on = (t % 250) < 125;
  else on = true;
  digitalWrite(PIN_LED, on);
}

// ------------------------------------------------------------------ Serial (bench tests)
static void printStatus() {
  for (int i = 0; i < ctl.cfg.tankCount; i++) {
    if (ctl.sensorOk[i]) Serial.printf("Tank %d: %.1f cm  %.0f%%\n", i + 1, ctl.distCm[i], ctl.level[i]);
    else Serial.printf("Tank %d: sensor error\n", i + 1);
  }
  Serial.printf("Pump %s | Valves %d%d%d | Auto %s | %s | cloud %s | heap %u\n", hw::pumpOn ? "ON" : "OFF",
                hw::valveOn[0], hw::valveOn[1], hw::valveOn[2], ctl.cfg.autoMode ? "ON" : "OFF", ctl.phaseName(),
                cloud.ready() ? "online" : "offline", ESP.getFreeHeap());
  if (ctl.msg.length()) Serial.println("Msg: " + ctl.msg);
}

static void serialCmd() {
  if (!Serial.available()) return;
  char c = Serial.read();
  if (c == 'h') Serial.println("s = status | 1,2,3 = valve | 4 = pump | a = auto | r = reset | w = forget Wi-Fi");
  else if (c == 's') printStatus();
  else if (c >= '1' && c <= '3') {
    int t = c - '1';
    ctl.cmdValve(t, !hw::valveOn[t]);
    printStatus();
  } else if (c == '4') {
    ctl.cmdPump(!hw::pumpOn);
    printStatus();
  } else if (c == 'a') {
    ctl.cmdAuto(!ctl.cfg.autoMode);
    printStatus();
  } else if (c == 'r') {
    ctl.reset();
    Serial.println("Reset");
  } else if (c == 'w') {
    WiFi.disconnect(true, true);
    delay(300);
    ESP.restart();
  }
}

// ------------------------------------------------------------------ setup / loop
void setup() {
  hw::begin();  // relays OFF before anything else
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n=== RelaxPump %s  %s ===\n", FW_VERSION, RP_DEVICE_ID);

  ctl.begin(&cloud);
  for (int i = 0; i < MAX_TANKS; i++) ctl.readNextSensor(), delay(SENSOR_STEP_MS);

  WiFi.onEvent(onSysEvent);
  startProvisioning(false);

  esp_task_wdt_init(15, true);  // reboot if the loop hangs for 15 s (relays default OFF)
  esp_task_wdt_add(NULL);
  printStatus();
}

void loop() {
  esp_task_wdt_reset();
  checkBootButton();
  serialCmd();
  ctl.loop();

  if (gotIp && !provisioning) {
    cloud.begin(&ctl);
    if (!otaStarted) {
      otaStarted = true;
      ArduinoOTA.setHostname(("relaxpump-" + String(RP_DEVICE_ID).substring(3)).c_str());
      ArduinoOTA.setPassword(RP_POP);
      ArduinoOTA.onStart([]() { hw::allOff(); });
      ArduinoOTA.begin();
    }
    ArduinoOTA.handle();
  }
  cloud.loop();
  if (cloud.started() && !cloud.ready()) ctl.offlineGuard(cloud.offlineMs());

  led();
  static uint32_t lastPrint = 0;
  if (millis() - lastPrint > 15000) {
    lastPrint = millis();
    printStatus();
  }
}
