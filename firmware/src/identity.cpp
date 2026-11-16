#include "identity.h"

#include <Preferences.h>

#include "config.h"

// Release builds (env:release, scripts/release.mjs) never compile secrets.h in: the binary is public.
#if !defined(RP_RELEASE) && __has_include("secrets.h")
#include "secrets.h"  // dev fallback only (git-ignored)
#endif
#if __has_include("project.h")
#include "project.h"  // shared build values (git-ignored; see include/project.h.example)
#endif

#ifndef RP_FIREBASE_API_KEY
#define RP_FIREBASE_API_KEY ""
#endif
#ifndef RP_FIREBASE_DB_URL
#define RP_FIREBASE_DB_URL RP_DEFAULT_DB_URL
#endif

namespace identity {

static Id cur;
static bool loaded = false;

static void load() {
  loaded = true;
  Preferences p;
  if (p.begin("rpid", true)) {
    cur.id = p.getString("id", "");
    cur.email = p.getString("email", "");
    cur.pass = p.getString("pass", "");
    cur.claim = p.getString("claim", "");
    cur.pop = p.getString("pop", "");
    cur.type = p.getString("type", "household") == "phe" ? Type::Phe : Type::Household;
    p.end();
  }
  cur.fromNvs = cur.id.length() > 0;
#ifdef RP_DEVICE_ID
  if (!cur.fromNvs) {
    cur.id = RP_DEVICE_ID;
    cur.email = RP_DEVICE_EMAIL;
    cur.pass = RP_DEVICE_PASSWORD;
    cur.claim = RP_CLAIM_CODE;
#ifdef RP_POP
    cur.pop = RP_POP;
#endif
#ifdef RP_TYPE_PHE
    cur.type = Type::Phe;
#endif
  }
#endif
  if (!cur.email.length() && cur.id.length()) {
    cur.email = cur.id;
    cur.email.toLowerCase();
    cur.email += "@devices.relaxpump.app";
  }
  if (!cur.pop.length()) cur.pop = cur.claim;
}

const Id &get() {
  if (!loaded) load();
  return cur;
}

bool valid() {
  const Id &i = get();
  return i.id.startsWith("RP-") && i.id.length() == 9 && i.pass.length() && i.claim.length();
}

bool storeType(const String &t) {
  if (t != "household" && t != "phe") return false;
  Preferences p;
  if (!p.begin("rpid", false)) return false;
  p.putString("type", t);
  p.end();
  return true;
}

String apiKey() {
  Preferences p;
  String k;
  if (p.begin("rpid", true)) {
    k = p.getString("apikey", "");
    p.end();
  }
  return k.length() ? k : String(RP_FIREBASE_API_KEY);
}

String dbUrl() {
  Preferences p;
  String u;
  if (p.begin("rpid", true)) {
    u = p.getString("dburl", "");
    p.end();
  }
  return u.length() ? u : String(RP_FIREBASE_DB_URL);
}

}  // namespace identity
