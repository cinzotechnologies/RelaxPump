#include "board.h"

#include <Arduino.h>
#include <Preferences.h>
#include <Wire.h>

#include "secrets.h"

#ifndef RP_BOARD
#define RP_BOARD 1
#endif

namespace board {

// ------------------------------------------------------------------ v1
static const int V1_TRIG[3] = {16, 18, 23};
static const int V1_ECHO[3] = {17, 19, 4};  // through 1k/2k dividers (5 V → 3.3 V)
static const int V1_VALVE[3] = {25, 26, 27};
static const int V1_PUMP = 33;
static const int RELAY_ON = LOW, RELAY_OFF = HIGH;  // relay module is active LOW

// ------------------------------------------------------------------ v2
static const int V2_SDA = 21, V2_SCL = 22;
static const uint8_t MCP_ADDR = 0x20;
static const uint8_t MCP_IODIRA = 0x00, MCP_OLATA = 0x14;
static const int V2_PUMP = 33, V2_PHE = 32;  // direct pins: always stoppable even if I2C fails
static const int V2_TRIG = 18;               // shared trigger, echoes read one at a time
static const int V2_ECHO[9] = {34, 35, 36, 39, 16, 17, 19, 23, 4};  // S1–S8, MAIN

static int ver = 1;
static uint8_t olat = 0;  // MCP23017 output shadow
static bool fault = false;

int version() { return ver; }
bool faulted() { return fault; }

rp::Ports ports() {
  rp::Ports p;
  if (ver == 2) {
    p.sensors = 8;
    p.valves = 8;
    p.phe = true;
    p.main = true;
  } else {
    p.sensors = 3;
    p.valves = 3;
    p.phe = false;
    p.main = false;
  }
  return p;
}

static bool mcpWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MCP_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

static int mcpRead(uint8_t reg) {
  Wire.beginTransmission(MCP_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((int)MCP_ADDR, 1) != 1) return -1;
  return Wire.read();
}

void begin(int v) {
  ver = v == 2 ? 2 : 1;
  if (ver == 1) {
    for (int i = 0; i < 3; i++) {
      digitalWrite(V1_VALVE[i], RELAY_OFF);
      pinMode(V1_VALVE[i], OUTPUT);
      digitalWrite(V1_VALVE[i], RELAY_OFF);
      pinMode(V1_TRIG[i], OUTPUT);
      digitalWrite(V1_TRIG[i], LOW);
      pinMode(V1_ECHO[i], INPUT);
    }
    digitalWrite(V1_PUMP, RELAY_OFF);
    pinMode(V1_PUMP, OUTPUT);
    digitalWrite(V1_PUMP, RELAY_OFF);
    return;
  }
  // v2: pump and PHE first (direct pins), then the expander: latch all OFF, then outputs.
  digitalWrite(V2_PUMP, LOW);
  pinMode(V2_PUMP, OUTPUT);
  digitalWrite(V2_PUMP, LOW);
  digitalWrite(V2_PHE, LOW);
  pinMode(V2_PHE, OUTPUT);
  digitalWrite(V2_PHE, LOW);
  pinMode(V2_TRIG, OUTPUT);
  digitalWrite(V2_TRIG, LOW);
  for (int p : V2_ECHO) pinMode(p, INPUT);
  Wire.begin(V2_SDA, V2_SCL, 100000);
  Wire.setTimeOut(20);
  olat = 0;
  fault = !(mcpWrite(MCP_OLATA, 0) && mcpWrite(MCP_IODIRA, 0x00));
  if (fault) Serial.println("[BOARD] MCP23017 not found - valve board error");
}

void valve(int i, bool on) {
  if (i < 0 || i >= 8) return;
  if (ver == 1) {
    if (i < 3) digitalWrite(V1_VALVE[i], on ? RELAY_ON : RELAY_OFF);
    return;
  }
  uint8_t next = on ? (olat | (1 << i)) : (olat & ~(1 << i));
  olat = next;
  if (!mcpWrite(MCP_OLATA, olat)) fault = true;
}

void pump(bool on) { digitalWrite(ver == 2 ? V2_PUMP : V1_PUMP, ver == 2 ? (on ? HIGH : LOW) : (on ? RELAY_ON : RELAY_OFF)); }

void phe(bool on) {
  if (ver == 2) digitalWrite(V2_PHE, on ? HIGH : LOW);
}

void allOff() {
  pump(false);
  phe(false);
  for (int i = 0; i < 8; i++) valve(i, false);
}

bool faultCheck() {
  if (ver != 2) return false;
  // Settings lost (brown-out reset of the expander) also counts: its valves dropped closed.
  int dir = mcpRead(MCP_IODIRA);
  int lat = mcpRead(MCP_OLATA);
  if (dir != 0x00 || lat != olat) fault = true;
  return fault;
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
  int trig, echo;
  if (ver == 1) {
    if (idx < 0 || idx >= 3) return -1;
    trig = V1_TRIG[idx];
    echo = V1_ECHO[idx];
  } else {
    if (idx < 0 || idx > 8) return -1;
    trig = V2_TRIG;
    echo = V2_ECHO[idx];
  }
  // Median of 3 readings inside 20–450 cm (below 20 cm is the blind zone).
  float v[3];
  int n = 0;
  for (int i = 0; i < 3; i++) {
    float d = readOnceCm(trig, echo);
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
