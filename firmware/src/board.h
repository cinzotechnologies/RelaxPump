// Board pin maps. One firmware for both boards; the version comes from NVS ("board", set with the
// serial command `board 1|2`), else RP_BOARD in secrets.h, else 1.
//
//  v1 (today's board): Trig G16/G18/G23, Echo G17/G19/G4, valve relays G25/G26/G27,
//      pump relay G33. Relays are active LOW. 3 tanks, no PHE, no MAIN.
//  v2 (new PCB, hardware/pcb-v2.md): V1–V8 on an MCP23017 (I2C G21/G22, GPA0–7) driving MOSFETs,
//      PUMP G33 and PHE G32 direct, shared Trig G18, Echo S1–S8 G34/G35/G36/G39/G16/G17/G19/G23,
//      Echo MAIN G4. Outputs are active HIGH.
#pragma once
#include <engine.h>

namespace board {

void begin(int version);  // every output OFF before it becomes an output
int version();
rp::Ports ports();

void valve(int i, bool on);  // 0..7
void pump(bool on);
void phe(bool on);
void allOff();

/** Distance in cm (median of 3, 20–450 cm), -1 = no echo or no such port. idx 8 = MAIN. */
float readCm(int idx);

/** v2: true when the valve board (MCP23017) stopped answering or lost its settings. */
bool faultCheck();
bool faulted();

/** Version to use at boot: NVS → secrets.h → 1. */
int storedVersion();
void storeVersion(int v);

/** rp::Outputs that drives this board. */
struct Outputs : rp::Outputs {
  void valve(int i, bool on) override { board::valve(i, on); }
  void pump(bool on) override { board::pump(on); }
  void phe(bool on) override { board::phe(on); }
};

}  // namespace board
