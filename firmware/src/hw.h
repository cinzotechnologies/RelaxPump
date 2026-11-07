// Relays and ultrasonic sensors (JSN-SR04T). Sensor maths and filtering from the legacy sketch.
#pragma once
#include "config.h"

namespace hw {

inline bool valveOn[MAX_TANKS] = {false, false, false};
inline bool pumpOn = false;

/** Relays OFF first, then make the pins outputs, so nothing clicks on at boot. */
inline void begin() {
  for (int i = 0; i < MAX_TANKS; i++) {
    digitalWrite(PIN_VALVE[i], RELAY_OFF);
    pinMode(PIN_VALVE[i], OUTPUT);
    digitalWrite(PIN_VALVE[i], RELAY_OFF);
    pinMode(PIN_TRIG[i], OUTPUT);
    digitalWrite(PIN_TRIG[i], LOW);
    pinMode(PIN_ECHO[i], INPUT);
  }
  digitalWrite(PIN_PUMP, RELAY_OFF);
  pinMode(PIN_PUMP, OUTPUT);
  digitalWrite(PIN_PUMP, RELAY_OFF);
}

inline int openValves() {
  int n = 0;
  for (int i = 0; i < MAX_TANKS; i++) n += valveOn[i];
  return n;
}

inline void setValve(int t, bool on) {
  if (t < 0 || t >= MAX_TANKS) return;
  valveOn[t] = on;
  digitalWrite(PIN_VALVE[t], on ? RELAY_ON : RELAY_OFF);
}

/** Never runs the pump with every valve closed. Returns false if refused. */
inline bool setPump(bool on) {
  if (on && openValves() == 0) {
    Serial.println("[SAFE] all valves closed - pump stays off");
    on = false;
  }
  pumpOn = on;
  digitalWrite(PIN_PUMP, on ? RELAY_ON : RELAY_OFF);
  return pumpOn == on;
}

inline void allOff() {
  pumpOn = false;
  digitalWrite(PIN_PUMP, RELAY_OFF);
  for (int i = 0; i < MAX_TANKS; i++) setValve(i, false);
}

// --------------------------- Sensors ----------------------------
inline float readOnceCm(int t) {
  digitalWrite(PIN_TRIG[t], LOW);
  delayMicroseconds(4);
  digitalWrite(PIN_TRIG[t], HIGH);
  delayMicroseconds(20);  // JSN-SR04T wants > 10 us
  digitalWrite(PIN_TRIG[t], LOW);
  unsigned long us = pulseIn(PIN_ECHO[t], HIGH, 30000UL);  // 30 ms ≈ 5 m
  if (us == 0) return -1;
  return us / 58.0f;
}

/** Median of 3 readings inside 20–450 cm (below 20 cm is the blind zone). -1 if none valid. */
inline float readMedianCm(int t) {
  float v[3];
  int n = 0;
  for (int i = 0; i < 3; i++) {
    float d = readOnceCm(t);
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

}  // namespace hw
