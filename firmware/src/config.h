// RelaxPump controller — firmware settings. Pins are in board.h, the fill
// timings in lib/engine (rp::Timings, defaults = CLAUDE.md §7).
#pragma once
#include <Arduino.h>

#define FW_VERSION "2.1.0"

constexpr int PIN_LED = 2;   // DevKit blue LED (both boards)
constexpr int PIN_BOOT = 0;  // hold 5 s → forget Wi-Fi, BLE setup again

constexpr uint32_t SENSOR_STEP_MS = 400;     // one sensor read per step, round-robin
constexpr int SPARE_PORT_EVERY = 6;          // every Nth step reads a port that is not in the layout

// ------------------------------------------------------------------ cloud
constexpr uint32_t STATE_EVERY_MS = 3000;    // push state at least this often
constexpr uint32_t STATE_MIN_GAP_MS = 500;   // and on change, but not faster than this
constexpr uint32_t BOOT_HOLD_MS = 5000;
