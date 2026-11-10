#include "board.h"

#include <Arduino.h>
#include <Preferences.h>

#include "secrets.h"

#ifndef RP_BOARD
#define RP_BOARD 1
#endif

namespace board {

static const int TRIG[rp::N_SENSORS] = {16, 18, 23, 13, 14, 21};  // T1–T5, MAIN
static const int ECHO[rp::N_SENSORS] = {17, 19, 4, 34, 35, 39};
static const int VALVE[rp::MAX_TANKS] = {25, 26, 27, 32, 22};    // V1–V5
static const int PUMP = 33;

static int ver = 1;
static int ON = LOW, OFF = HIGH;  // v1 relay module: active LOW

int version() { return ver; }

static void outputOff(int pin) {
  digitalWrite(pin, OFF);  // latch OFF first, so the relay / MOSFET never blips on at boot
  pinMode(pin, OUTPUT);
  digitalWrite(pin, OFF);
}

void begin(int v) {
  ver = v == 2 ? 2 : 1;
  ON = ver == 2 ? HIGH : LOW;
  OFF = ver == 2 ? LOW : HIGH;
  outputOff(PUMP);
  for (int p : VALVE) outputOff(p);
  for (int i = 0; i < rp::N_SENSORS; i++) {
    pinMode(TRIG[i], OUTPUT);
    digitalWrite(TRIG[i], LOW);
    pinMode(ECHO[i], INPUT);
  }
}

void valve(int i, bool on) {
  if (i < 0 || i >= rp::MAX_TANKS) return;
  digitalWrite(VALVE[i], on ? ON : OFF);
}

void pump(bool on) { digitalWrite(PUMP, on ? ON : OFF); }

void allOff() {
  pump(false);
  for (int i = 0; i < rp::MAX_TANKS; i++) valve(i, false);
}

// ------------------------------------------------------------------ sensors
static float readOnceCm(int trig, int echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(4);
  digitalWrite(trig, HIGH);
  delayMicroseconds(20);  // JSN-SR04T wants > 10 us
  digitalWrite(trig, LOW);
  unsigned long us = pulseIn(echo, HIGH, 30000UL);  // 30 ms ≈ 5 m
  if (us == 0) return -1;
  return us / 58.0f;
}

float readCm(int idx) {
  if (idx < 0 || idx >= rp::N_SENSORS) return -1;
  // Median of 3 readings inside 20–450 cm (below 20 cm is the blind zone).
  float v[3];
  int n = 0;
  for (int i = 0; i < 3; i++) {
    float d = readOnceCm(TRIG[idx], ECHO[idx]);
    if (d >= 20 && d <= 450) v[n++] = d;
    delay(40);
  }
  if (n == 0) return -1;
  for (int i = 0; i < n - 1; i++)
    for (int j = i + 1; j < n; j++)
      if (v[j] < v[i]) {
        float x = v[i];
        v[i] = v[j];
        v[j] = x;
      }
  return v[n / 2];
}

// ------------------------------------------------------------------ version
int storedVersion() {
  Preferences p;
  p.begin("rp", true);
  int v = p.getInt("board", RP_BOARD);
  p.end();
  return v == 2 ? 2 : 1;
}

void storeVersion(int v) {
  Preferences p;
  p.begin("rp", false);
  p.putInt("board", v == 2 ? 2 : 1);
  p.end();
}

}  // namespace board
