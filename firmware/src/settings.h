// Layout config <-> JSON (the RTDB `config` node) and flash storage.
#pragma once
#include <Arduino.h>
#include <engine.h>

namespace settings {

/**
 * Parse a config JSON — { tankCount, tanks: [{ emptyCm, fullCm, litres, heightFt }],
 * main: { enabled, emptyCm, fullCm, litres, minPct }, low, high, maxRunMin } — into `out`.
 * Fields not present keep their defaults (v1 configs have no `main` → no main sensor).
 */
bool parse(const String &json, rp::Layout &out);

/** The last config from the cloud, so the controller works after a reboot without internet. */
void saveConfig(const String &json);
String loadConfig();

bool loadAuto();
void saveAuto(bool on);

}  // namespace settings
