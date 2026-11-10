// Layout config <-> JSON (the RTDB `config` node, both v1 and v2 shapes) and flash storage.
#pragma once
#include <Arduino.h>
#include <engine.h>

namespace settings {

struct Parsed {
  bool ok = false;
  bool v1 = false;      // old shape (tankCount + tanks): needs migration
  String migration;     // v1 only: JSON for config/{semi, mode, main, phe}
};

/** Parse a config JSON into `out` (fields not present keep their defaults). */
Parsed parse(const String &json, rp::Layout &out);

/** The last config from the cloud, so the controller works after a reboot without internet. */
void saveConfig(const String &json);
String loadConfig();

bool loadAuto();
void saveAuto(bool on);

}  // namespace settings
