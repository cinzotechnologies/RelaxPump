// RelaxPump controller — firmware settings. Pins are in board.h, the fill
// timings in lib/engine (rp::Timings, defaults = CLAUDE.md §7).
#pragma once
#include <Arduino.h>

#define FW_VERSION "3.0.0"
#define RP_DEFAULT_DB_URL "https://iotcinzo-default-rtdb.asia-southeast1.firebasedatabase.app"

// Bluetooth setup. Same values in the app (services/provisioning.ts). The PoP is shared by all
// controllers: it encrypts the session, it does not prove ownership.
#define RP_BLE_POP "relaxpump-ble-v1"
#define BLE_IDENTITY_ENDPOINT "rp-identity"

constexpr int PIN_LED = 2;   // DevKit blue LED (both boards)
constexpr int PIN_BOOT = 0;  // hold 5 s → forget Wi-Fi, BLE setup again

constexpr uint32_t SENSOR_STEP_MS = 400;     // one sensor read per step, round-robin
constexpr int SPARE_PORT_EVERY = 6;          // every Nth step reads a port that is not in the layout

// ------------------------------------------------------------------ cloud
constexpr uint32_t STATE_EVERY_MS = 3000;    // push state at least this often
constexpr uint32_t STATE_MIN_GAP_MS = 500;   // and on change, but not faster than this
constexpr uint32_t BOOT_HOLD_MS = 5000;

// ------------------------------------------------------------------ OTA (src/ota.h)
constexpr uint32_t OTA_CONFIRM_MS = 90000;               // new firmware must reach the cloud in 90 s
constexpr uint32_t OTA_CHECK_EVERY_MS = 24UL * 3600000;  // read firmware/stable every 24 h
constexpr uint32_t OTA_SHOW_RESULT_MS = 600000;          // done / failed stay in state for 10 min
