// Who this board is. Since v3 (docs/two-module-system.md §4.3) the per-device values live in NVS,
// written once at the factory (`npm run factory-flash`, from firebase/out/<ID>/nvs.csv), so one
// signed firmware binary fits every board and can be updated over the air.
//
//   NVS namespace "rpid":  id, email, pass, claim, pop, type ("household" | "phe"), board (1|2|3)
//
// secrets.h (git-ignored) stays only as a fallback for development boards that were never
// factory-flashed. Shared values (Firebase API key, database URL) are in the build (project.h).
#pragma once
#include <Arduino.h>

namespace identity {

enum class Type : uint8_t { Household, Phe };

struct Id {
  String id;     // RP-3F2A9C
  String email;  // rp-3f2a9c@devices.relaxpump.app
  String pass;   // device account password
  String claim;  // claim code (answered over BLE during setup)
  String pop;    // LAN OTA (espota) password
  Type type = Type::Household;
  bool fromNvs = false;
};

/** Load once at boot: NVS, else secrets.h, else empty (the board then only offers serial). */
const Id &get();
bool valid();

inline bool isPhe() { return get().type == Type::Phe; }
inline const char *typeName() { return isPhe() ? "phe" : "household"; }

/** Factory serial command `type household|phe` (stored in NVS, applied after a restart). */
bool storeType(const String &t);

/** API key / database URL compiled into the build (project.h), overridable in NVS. */
String apiKey();
String dbUrl();

}  // namespace identity
