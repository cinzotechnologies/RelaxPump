// Layout config <-> JSON (the RTDB `config` node) and flash storage.
#pragma once
#include <Arduino.h>
#include <engine.h>
#include <phe.h>

namespace settings {

/**
 * Parse a config JSON — { tankCount, tanks: [{ emptyCm, fullCm, litres, heightFt }],
 * main: { enabled, emptyCm, fullCm, litres, minPct }, low, high, maxRunMin } — into `out`.
 * Fields not present keep their defaults (v1 configs have no `main` → no main sensor).
 */
bool parse(const String &json, rp::Layout &out);

/**
 * PHE config (docs/two-module-system.md §3): { tankCount, low (reopen), high (close),
 * tanks: [{ name?, litres?, emptyCm, fullCm }] } — tanks are the PHE lines.
 */
bool parsePhe(const String &json, rp::PheLayout &out);

/** The last config from the cloud, so the controller works after a reboot without internet. */
void saveConfig(const String &json);
String loadConfig();

bool loadAuto();
void saveAuto(bool on);

}  // namespace settings
