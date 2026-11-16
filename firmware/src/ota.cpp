#include "ota.h"

#include <HTTPClient.h>
#include <Preferences.h>
#include <Update.h>
#include <WiFiClientSecure.h>
#include <esp_ota_ops.h>
#include <mbedtls/base64.h>
#include <mbedtls/md.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>

#include "board.h"
#include "config.h"
#include "identity.h"
#include "ota_pubkey.h"

// Keep the new firmware "pending verify" after boot; ota::cloudReached() marks it valid.
// (arduino-esp32 otherwise marks every image valid inside initArduino()).
extern "C" bool verifyRollbackLater() { return true; }

namespace ota {

enum class Phase : uint8_t { None, Download, Verify, Install, Restart, Done, Failed };
static const char *phaseName(Phase p) {
  switch (p) {
    case Phase::Download: return "download";
    case Phase::Verify: return "verify";
    case Phase::Install: return "install";
    case Phase::Restart: return "restart";
    case Phase::Done: return "done";
    case Phase::Failed: return "failed";
    default: return "";
  }
}

struct Stable {
  String version, url, sha256, sig, minFw;
  uint32_t size = 0;
  int rollout = 0;
};

static Stable stable;
static String available;  // fwAvailable
static volatile Phase phase = Phase::None;
static volatile int pct = 0;
static String target, err;
static uint32_t shownAt = 0;  // done/failed are shown for a while, then cleared
static bool pendingVerify = false, verified = false;
static uint32_t bootAt = 0;
static bool checkDue = true;
static uint32_t lastCheck = 0;
static const char *pendingEvent = nullptr;
static TaskHandle_t task = nullptr;

// ------------------------------------------------------------------ helpers
int cmpVersion(const char *a, const char *b) {
  int x[3] = {0, 0, 0}, y[3] = {0, 0, 0};
  sscanf(a ? a : "", "%d.%d.%d", &x[0], &x[1], &x[2]);
  sscanf(b ? b : "", "%d.%d.%d", &y[0], &y[1], &y[2]);
  for (int i = 0; i < 3; i++)
    if (x[i] != y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

int bucket(const String &id) {
  uint8_t h[32];
  mbedtls_sha256((const uint8_t *)id.c_str(), id.length(), h, 0);
  uint32_t v = ((uint32_t)h[0] << 24) | ((uint32_t)h[1] << 16) | ((uint32_t)h[2] << 8) | h[3];
  return (int)(v % 100);
}

static void saveResult(const char *res, const String &to, const String &why) {
  Preferences p;
  p.begin("rpota", false);
  p.putString("res", res);  // "pending" = rebooting into the new slot
  p.putString("to", to);
  p.putString("from", FW_VERSION);
  p.putString("err", why);
  p.end();
}

static void fail(const String &why) {
  err = why;
  pct = 0;
  phase = Phase::Failed;
  shownAt = millis();
  if (why != "busy") pendingEvent = "ota_failed";
  Serial.printf("[OTA] failed: %s\n", why.c_str());
}

static String hex(const uint8_t *b, size_t n) {
  static const char *H = "0123456789abcdef";
  String s;
  s.reserve(n * 2);
  for (size_t i = 0; i < n; i++) {
    s += H[b[i] >> 4];
    s += H[b[i] & 15];
  }
  return s;
}

/** ECDSA P-256 / SHA-256 signature (base64 DER) over the binary whose digest is `hash`. */
static bool signatureOk(const uint8_t hash[32], const String &sigB64) {
  if (!OTA_PUBKEY_PEM[0]) return false;
  uint8_t sig[160];
  size_t sigLen = 0;
  if (mbedtls_base64_decode(sig, sizeof sig, &sigLen, (const uint8_t *)sigB64.c_str(), sigB64.length()) != 0)
    return false;
  mbedtls_pk_context pk;
  mbedtls_pk_init(&pk);
  bool ok = mbedtls_pk_parse_public_key(&pk, (const uint8_t *)OTA_PUBKEY_PEM, sizeof OTA_PUBKEY_PEM) == 0 &&
            mbedtls_pk_can_do(&pk, MBEDTLS_PK_ECDSA) &&
            mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256, hash, 32, sig, sigLen) == 0;
  mbedtls_pk_free(&pk);
  return ok;
}

// ------------------------------------------------------------------ the update (own task)
static void run(void *) {
  const Stable s = stable;
  WiFiClientSecure tls;
  tls.setInsecure();  // integrity comes from sha256 + the signature, not from TLS
  HTTPClient http;
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);  // GitHub Releases → objects host
  http.setTimeout(20000);
  http.setConnectTimeout(15000);
  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  uint8_t digest[32];
  static uint8_t buf[4096];
  size_t got = 0;
  uint32_t lastData = millis();

  Serial.printf("[OTA] %s → %s  %s (%u bytes)\n", FW_VERSION, s.version.c_str(), s.url.c_str(), s.size);
  if (!http.begin(tls, s.url)) {
    fail("connect");
    goto out;
  }
  {
    int code = http.GET();
    if (code != 200) {
      fail("http " + String(code));
      goto out;
    }
    int len = http.getSize();
    if (len > 0 && (uint32_t)len != s.size) {
      fail("size");
      goto out;
    }
  }
  if (!Update.begin(s.size, U_FLASH)) {
    fail("no room");  // binary larger than the OTA slot
    goto out;
  }
  mbedtls_sha256_starts(&sha, 0);
  {
    WiFiClient *in = http.getStreamPtr();
    while (got < s.size) {
      size_t n = in->available();
      if (!n) {
        if (!http.connected() || millis() - lastData > 30000) break;
        delay(5);
        continue;
      }
      if (n > sizeof buf) n = sizeof buf;
      if (n > s.size - got) n = s.size - got;
      n = in->readBytes(buf, n);
      if (!n) continue;
      lastData = millis();
      mbedtls_sha256_update(&sha, buf, n);
      if (Update.write(buf, n) != n) {
        Update.abort();
        fail("write");
        goto out;
      }
      got += n;
      pct = (int)(got * 100ULL / s.size);
    }
  }
  if (got != s.size) {
    Update.abort();
    fail("download");
    goto out;
  }
  phase = Phase::Verify;
  pct = 100;
  mbedtls_sha256_finish(&sha, digest);
  if (hex(digest, 32) != s.sha256) {
    Update.abort();
    fail("sha256");
    goto out;
  }
  if (!signatureOk(digest, s.sig)) {
    Update.abort();
    fail(OTA_PUBKEY_PEM[0] ? "signature" : "no key");
    goto out;
  }
  phase = Phase::Install;
  if (!Update.end(true)) {  // sets the new slot as the boot partition
    fail("install");
    goto out;
  }
  saveResult("pending", s.version, "");
  phase = Phase::Restart;
  Serial.println("[OTA] installed, restarting");

out:
  mbedtls_sha256_free(&sha);
  http.end();
  task = nullptr;
  vTaskDelete(nullptr);
}

// ------------------------------------------------------------------ public
void boot() {
  bootAt = millis();
  const esp_partition_t *running = esp_ota_get_running_partition();
  esp_ota_img_states_t st;
  pendingVerify = running && esp_ota_get_state_partition(running, &st) == ESP_OK && st == ESP_OTA_IMG_PENDING_VERIFY;

  Preferences p;
  p.begin("rpota", false);
  String res = p.getString("res", ""), to = p.getString("to", ""), why = p.getString("err", "");
  p.clear();
  p.end();
  if (res == "pending") {
    target = to;
    if (to == FW_VERSION) {
      // New firmware is running; "done" once it reaches the cloud (cloudReached).
      Serial.printf("[OTA] running %s, waiting for the cloud to confirm\n", FW_VERSION);
    } else {
      // The bootloader went back to this (old) slot: the new firmware never confirmed.
      err = "rolled back";
      phase = Phase::Failed;
      shownAt = millis();
      pendingEvent = "ota_failed";
      Serial.printf("[OTA] %s did not start, back on %s\n", to.c_str(), FW_VERSION);
    }
  } else if (res == "failed") {
    target = to;
    err = why;
    phase = Phase::Failed;
    shownAt = millis();
    pendingEvent = "ota_failed";
  }
}

void cloudReached() {
  if (verified) return;
  verified = true;
  if (pendingVerify) {
    esp_ota_mark_app_valid_cancel_rollback();
    Serial.println("[OTA] new firmware confirmed");
  }
  if (target == FW_VERSION && phase == Phase::None) {
    phase = Phase::Done;
    pct = 100;
    shownAt = millis();
    pendingEvent = "ota_done";
  }
}

void loop() {
  uint32_t now = millis();
  // Rollback: a new image that has not reached the cloud within 90 s goes back to the old slot.
  if (pendingVerify && !verified && now - bootAt > OTA_CONFIRM_MS) {
    Serial.println("[OTA] no cloud within 90 s: rolling back");
    board::allOff();
    esp_ota_mark_app_invalid_rollback_and_reboot();
  }
  if (phase == Phase::Restart && !task) {
    static uint32_t restartAt = 0;
    if (!restartAt) restartAt = now;
    if (now - restartAt > 2500) {  // let the state push "restart" first
      board::allOff();
      ESP.restart();
    }
  }
  if ((phase == Phase::Done || phase == Phase::Failed) && !task && now - shownAt > OTA_SHOW_RESULT_MS) {
    phase = Phase::None;
    err = "";
  }
  if (now - lastCheck > OTA_CHECK_EVERY_MS) checkDue = true;
}

bool wantCheck() {
  if (!checkDue) return false;
  checkDue = false;
  lastCheck = millis();
  return true;
}

void onStable(const String &json) {
  JsonDocument d;
  if (json == "null" || deserializeJson(d, json) || !d.is<JsonObject>()) {
    available = "";
    return;
  }
  stable.version = d["version"] | "";
  stable.url = d["url"] | "";
  stable.sha256 = d["sha256"] | "";
  stable.sig = d["sig"] | "";
  stable.minFw = d["minFw"] | "0.0.0";
  stable.size = d["size"] | 0;
  stable.rollout = d["rollout"] | 0;
  const String &id = identity::get().id;
  bool newer = cmpVersion(stable.version.c_str(), FW_VERSION) > 0;
  bool allowed = cmpVersion(stable.minFw.c_str(), FW_VERSION) <= 0;
  bool inRollout = bucket(id) < stable.rollout;
  available = newer && allowed && inRollout ? stable.version : "";
  Serial.printf("[OTA] stable %s (rollout %d%%, bucket %d, minFw %s) → %s\n", stable.version.c_str(),
                stable.rollout, bucket(id), stable.minFw.c_str(),
                available.length() ? "update available" : "nothing to do");
}

bool request(const String &version, bool busy) {
  if (task || phase == Phase::Download || phase == Phase::Verify || phase == Phase::Install ||
      phase == Phase::Restart)
    return false;
  target = version;
  if (busy) {
    fail("busy");
    return false;
  }
  if (!available.length() || version != available || version != stable.version || !stable.url.startsWith("https://") ||
      stable.sha256.length() != 64 || !stable.size) {
    fail("not available");
    return false;
  }
  if (!OTA_PUBKEY_PEM[0]) {
    fail("no key");
    return false;
  }
  err = "";
  pct = 0;
  phase = Phase::Download;
  shownAt = millis();
  board::allOff();
  if (xTaskCreatePinnedToCore(run, "ota", 12288, nullptr, 1, &task, 1) != pdPASS) {
    task = nullptr;
    fail("task");
    return false;
  }
  return true;
}

bool active() {
  return task || phase == Phase::Download || phase == Phase::Verify || phase == Phase::Install ||
         phase == Phase::Restart;
}

void putState(JsonDocument &doc) {
  if (available.length()) doc["fwAvailable"] = available;
  else doc["fwAvailable"] = nullptr;
  if (phase == Phase::None) {
    doc["ota"] = nullptr;
    return;
  }
  JsonObject o = doc["ota"].to<JsonObject>();
  o["phase"] = phaseName(phase);
  o["pct"] = (int)pct;
  if (target.length()) o["to"] = target;
  if (err.length()) o["err"] = err.substring(0, 80);
}

const char *takeEvent() {
  const char *e = pendingEvent;
  pendingEvent = nullptr;
  return e;
}

}  // namespace ota
