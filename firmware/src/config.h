// RelaxPump controller — pins, timings and settings.
// Pins come from reference/firmware/TankController.ino (the user will re-check them on the board).
#pragma once
#include <Arduino.h>

#define FW_VERSION "1.0.0"

// ------------------------- Pins -------------------------------
constexpr int MAX_TANKS = 3;                     // this board: 3 sensors, 3 valves
constexpr int PIN_TRIG[MAX_TANKS]  = {16, 18, 23};
constexpr int PIN_ECHO[MAX_TANKS]  = {17, 19, 4}; // through 1k/2k dividers (5 V → 3.3 V)
constexpr int PIN_VALVE[MAX_TANKS] = {25, 26, 27};
constexpr int PIN_PUMP   = 33;                   // pump contactor relay
constexpr int PIN_LED    = 2;                    // DevKit blue LED
constexpr int PIN_BOOT   = 0;                    // hold 5 s → forget Wi-Fi, BLE setup again
constexpr int RELAY_ON   = LOW;                  // relay module is active LOW
constexpr int RELAY_OFF  = HIGH;

// ------------------------- Safety timings ---------------------
constexpr uint32_t VALVE_LEAD_MS   = 2000;       // open valve, wait, then start pump (solenoid valves)
constexpr uint32_t PUMP_STOP_MS    = 3000;       // stop pump, wait, then close valve
constexpr uint32_t SWITCH_MS       = 1500;       // switching tanks: open new valve, then close old
constexpr uint32_t COOLDOWN_MS     = 60000;      // rest after the pump stops before it may start again
constexpr uint32_t NO_RISE_MS      = 300000;     // dry-run check window (5 min)
constexpr float    NO_RISE_PCT     = 2.0f;       // must rise at least this much per window
constexpr int      SENSOR_FAIL_MAX = 15;         // consecutive bad readings → sensor error
constexpr uint32_t SENSOR_STEP_MS  = 400;        // one sensor read per step, round-robin

// ------------------------- Cloud ------------------------------
constexpr uint32_t STATE_EVERY_MS  = 3000;       // push state at least this often
constexpr uint32_t STATE_MIN_GAP_MS = 500;       // and on change, but not faster than this
constexpr uint32_t BOOT_HOLD_MS    = 5000;
