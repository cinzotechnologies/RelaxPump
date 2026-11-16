// Over-the-air update from the app (docs/two-module-system.md §4.3).
//
//  1. Check: on boot and every 24 h the board reads firmware/stable. When version > FW_VERSION,
//     minFw <= FW_VERSION and the board's rollout bucket passes (first 4 bytes of sha256(id),
//     big-endian, % 100 < rollout), state.fwAvailable = version.
//  2. Update: the app writes cmd.ota = { version } (the rules only accept firmware/stable/version).
//     Household refuses while the pump runs (msg "busy"). Then: pump off, every valve closed →
//     HTTPS download (redirects followed) into the other OTA slot, hashing while writing → check
//     sha256 and the ECDSA P-256 signature (sig = base64 DER over the binary, public key built in:
//     include/ota_pubkey.h) → set the boot slot → restart. state.ota reports phase + percent.
//  3. Rollback: the new firmware stays "pending verify" (ESP-IDF app rollback, enabled in the
//     Arduino bootloader) until it reaches the cloud. No cloud within 90 s of boot, or a crash
//     before that → the bootloader starts the old slot again, which reports ota.phase = failed.
#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

namespace ota {

/** setup(): read the result of the last update from NVS, note if this boot is pending verify. */
void boot();
/** First time the cloud is ready after boot: mark this firmware valid (cancels rollback). */
void cloudReached();
/** Every loop: rollback timer, update task progress, 24 h check timer. */
void loop();

/** The cloud should read firmware/stable now (boot, then every 24 h). Clears the flag. */
bool wantCheck();
/** firmware/stable JSON (or "null"). */
void onStable(const String &json);

/** cmd.ota from the app. `busy` = the household pump is running. False when refused. */
bool request(const String &version, bool busy);
/** An update is running: main keeps every output off and ignores other commands. */
bool active();

/** Adds fwAvailable and ota to the state document. */
void putState(JsonDocument &doc);
/** Event to send once the cloud is up ("ota_done" / "ota_failed"), or nullptr. Clears it. */
const char *takeEvent();

/** Compare "x.y.z" versions: <0, 0, >0. */
int cmpVersion(const char *a, const char *b);
/** 0..99 rollout bucket of a device id. */
int bucket(const String &id);

}  // namespace ota
