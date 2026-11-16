// Pins (docs/two-module-system.md §2). ONE pin map for both module types (Household, PHE) and every
// board revision; the Rev C board only changes this file and board.cpp.
//
//   relay  Household            PHE          GPIO
//   K1     PUMP (contactor)     not fitted   G33
//   K2     V1                   V1           G25
//   K3     V2                   V2           G26
//   K4     V3                   V3           G27
//   K5     V4                   V4           G32
//   K6     V5                   V5           G22
//   K7     spare                spare        G5    driven OFF, never used yet
//   K8     spare                spare        G15   driven OFF, never used yet
//
//   port   Trig  Echo          Echo goes through a 1k/2k divider (5 V → 3.3 V);
//   T1     G16   G17           G34/G35/G39 are input-only, fine for Echo.
//   T2     G18   G19           Tanks (household) and PHE lines use the same ports T1–T5 / V1–V5.
//   T3     G23   G4
//   T4     G13   G34
//   T5     G14   G35
//   MAIN   G21   G39           household only (PHE boards are built without the MAIN port)
//   LED G2 (Wi-Fi), BOOT G0
//
// The board version only selects the output polarity:
//   1 = relay module (6- or 8-channel), active LOW
//   2 = PCB v2 (hardware/pcb-v2.md), MOSFET outputs, active HIGH
//   3 = Rev C (ULN driver), active HIGH
// It comes from NVS ("board", serial command `board 1|2|3`), else RP_BOARD in secrets.h, else 1.
// Every output is written OFF before it becomes an output.
#pragma once
#include <engine.h>

namespace board {

constexpr int RELAYS = 8;  // K1..K8

void begin(int version);
int version();
/** "v1" | "v2" | "v3" for info.board. */
const char *label();

void valve(int i, bool on);  // 0..4 = V1..V5 (K2..K6)
void pump(bool on);          // K1
void allOff();               // K1..K8 off

/** Distance in cm (median of 3, 20–450 cm), -1 = no echo. idx 0..4 = T1..T5, 5 = MAIN. */
float readCm(int idx);

/** Version to use at boot: NVS → secrets.h → 1. */
int storedVersion();
void storeVersion(int v);

/** Flash chip size in MB (4 = DevKit, 8 = Rev C module). */
int flashMb();

/** rp::Outputs that drives this board. */
struct Outputs : rp::Outputs {
  void valve(int i, bool on) override { board::valve(i, on); }
  void pump(bool on) override { board::pump(on); }
};

}  // namespace board
