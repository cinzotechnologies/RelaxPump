// Firebase Realtime Database link (FirebaseClient by mobizt): device login, config/cmd streams,
// state every 3 s and on change, events and usage.
#pragma once
#include "controller.h"

class Cloud : public Listener {
 public:
  void begin(Controller *c);  // call once Wi-Fi has an IP
  void loop();
  bool ready() const;
  bool started() const { return isStarted; }
  uint32_t offlineMs() const;

  void onEvent(const char *type, int tank, bool autoRun, float minutes) override;
  void onUsage(int tank, float minutes, float litres) override;

 private:
  Controller *ctl = nullptr;
  bool isStarted = false;
  uint32_t lastState = 0, lastOnline = 0;
  void pushState();
};

extern Cloud cloud;
