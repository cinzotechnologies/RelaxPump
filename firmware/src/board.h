// Pins (docs/flexible-system.md §2). One pin map for every controller; tanks 1–3 and the pump keep
// the pins of the first board:
//
//   port   Trig  Echo  Valve        Echo goes through a 1k/2k divider (5 V → 3.3 V);
//   T1     G16   G17   V1 = G25     G34/G35/G39 are input-only, fine for Echo.
//   T2     G18   G19   V2 = G26
//   T3     G23   G4    V3 = G27
//   T4     G13   G34   V4 = G32
//   T5     G14   G35   V5 = G22
//   MAIN   G21   G39   —
//   PUMP               G33          LED G2, BOOT G0, spare G5
//
// The board version only selects the output polarity:
//   1 = relay module (6- or 8-channel), active LOW
//   2 = PCB v2 (hardware/pcb-v2.md), MOSFET outputs, active HIGH
// It comes from NVS ("board", serial command `board 1|2`), else RP_BOARD in secrets.h, else 1.
// Every output is written OFF before it becomes an output.
#pragma once
#include <engine.h>

namespace board {

void begin(int version);
int version();

void valve(int i, bool on);  // 0..4 = V1..V5
void pump(bool on);
void allOff();

/** Distance in cm (median of 3, 20–450 cm), -1 = no echo. idx 0..4 = T1..T5, 5 = MAIN. */
float readCm(int idx);

/** Version to use at boot: NVS → secrets.h → 1. */
int storedVersion();
void storeVersion(int v);

/** rp::Outputs that drives this board. */
struct Outputs : rp::Outputs {
  void valve(int i, bool on) override { board::valve(i, on); }
  void pump(bool on) override { board::pump(on); }
};

}  // namespace board
