// Firebase Realtime Database link (FirebaseClient by mobizt): device login, config/cmd streams,
// info/ports on connect, state every 3 s and on change, events and usage.
#pragma once
#include <Arduino.h>
#include <engine.h>

class Cloud : public rp::Sink {
 public:
  void begin(rp::Engine *e);  // call once Wi-Fi has an IP
  void loop();
  bool ready() const;
  bool started() const { return isStarted; }
  uint32_t offlineMs() const;

  void event(const char *type, int tank, bool autoRun, float minutes) override;
  void usage(int tank, float minutes, float litres, bool phe) override;

 private:
  rp::Engine *eng = nullptr;
  bool isStarted = false;
  uint32_t lastState = 0, lastOnline = 0;
  void pushState();
};

extern Cloud cloud;
extern rp::Engine eng;
/** Apply a config JSON (from the cloud or flash). Defined in main.cpp. */
void applyConfig(const String &json, bool fromCloud);
