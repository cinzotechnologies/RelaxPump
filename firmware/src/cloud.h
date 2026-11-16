// Firebase Realtime Database link (FirebaseClient by mobizt): device login (identity from NVS),
// config/cmd streams, info (fw, board, maxTanks, type, flash) on connect, state every 3 s and on
// change, events and usage, firmware/stable for OTA. Handles both module types: Household
// (rp::Engine) and PHE (rp::PheEngine), chosen by identity::isPhe().
#pragma once
#include <Arduino.h>
#include <engine.h>
#include <phe.h>

class Cloud : public rp::Sink {
 public:
  void begin();  // call once Wi-Fi has an IP
  void loop();
  bool ready() const;
  bool started() const { return isStarted; }
  uint32_t offlineMs() const;

  void event(const char *type, int tank, bool autoRun, float minutes) override;
  void usage(int tank, float minutes, float litres) override;

 private:
  bool isStarted = false;
  bool streamsPaused = false;
  uint32_t lastState = 0, lastOnline = 0;
  void pushState();
  void startStreams();
};

extern Cloud cloud;
extern rp::Engine eng;        // household engine
extern rp::PheEngine pheEng;  // PHE engine
/** Apply a config JSON (from the cloud or flash). Defined in main.cpp. */
void applyConfig(const String &json, bool fromCloud);
/** App asked to change Wi-Fi: main.cpp turns everything off, forgets Wi-Fi and restarts. */
void requestWifiReset();
/** Household pump running (OTA must wait). Defined in main.cpp. */
bool pumpBusy();
