# RelaxPump Controller v2 — PCB

Placement concept: `reference/pcb-v2/PcbTop.dc.html` (top view, click a part for its notes) and
`reference/pcb-v2/PcbSpec.dc.html` (pin map, connectors, BOM, layout rules). Plan and limits:
`docs/flexible-system.md` §4. This is a concept — draw the real schematic and layout in KiCad or
EasyEDA, run DRC, order 5–10 prototypes, test, then Rev B.

## Board
- 160 × 100 mm, 2-layer, 1.6 mm, 1 oz (2 oz if possible), 4 × M3 holes, fits an IP65 box.
- Top edge: 11 screw terminals (5.08 mm, 10 A): V1–V8, PHE, PUMP, and 12V IN on the right.
- Under them: 10 low-side MOSFET channels (AO3400 or IRLZ44N, SS34 flyback, LED).
- Left: ESP32-DevKitC-32E in 2 × 1×19 female headers, antenna over the left edge, copper keep-out.
- Middle: MCP23017 (I2C 0x20) → V1–V8 gates. PHE ← G32, PUMP ← G33 (direct).
- Right: fuse 5 A → SS54 reverse protection → SMBJ15A → 470 µF → 5 V 3 A buck (MP1584EN / XL1509-5.0).
- Bottom edge: 9 × RJ45 (S1–S8, MAIN) with 1k/2k Echo dividers and TPD4E05U06 ESD arrays above them.
- Status LED (G2), Setup button (G0).

## Pins
| ESP32 | Use |
|---|---|
| G21 / G22 | MCP23017 SDA / SCL (4.7 kΩ pull-ups) |
| MCP GPA0–7 | V1–V8 gates (100 Ω, 10 kΩ pull-down) |
| G32 / G33 | PHE / PUMP gates |
| G18 | Trig, all sensors (100 Ω) |
| G34 G35 G36 G39 G16 G17 G19 G23 | Echo S1–S8 |
| G4 | Echo MAIN |
| G2 / G0 | Status LED / Setup button |
| G13 G14 G25 G26 G27 G5 | spare |

## Connectors
- 12V IN: 1 +12 V, 2 GND (12 V 5 A supply).
- V1–V8, PHE: 1 +12 V, 2 switched GND → 12 V NC solenoid.
- PUMP: 1 +12 V, 2 switched GND → coil of a 12 V DIN-rail relay in the mains box (no 230 V on the PCB).
- RJ45 (T568B): 8 +5 V (brown), 7 GND (brown-white), 4 Trig (blue), 6 Echo (green), 1–2 extra GND.

## Layout rules
- 12 V rail ≥ 2.5 mm (6 A); each valve output ≥ 1 mm (2 A).
- Ground pour both layers, stitched. No copper under the antenna.
- Firmware limit: at most 3 valve outputs on at once; all outputs OFF before pinMode at boot.

## Block diagram

```
 12 V 5 A in ─ fuse 5 A ─ SS54 ─ SMBJ15A ─┬─ 12 V rail ──┬─ V1–V8 screw terminals (+12 V)
                                          │              ├─ PHE  terminal (+12 V)
                                          │              └─ PUMP terminal (+12 V)
                                          └─ buck 5 V 3 A ─┬─ RJ45 S1–S8, MAIN (+5 V to sensors)
                                                           └─ ESP32 DevKitC (3.3 V on board)

 ESP32 ── I2C G21/G22 ── MCP23017 GPA0–7 ── 8 × MOSFET (low side) ── V1–V8 (switched GND)
       ── G32 ─────────────────────────────── MOSFET ── PHE  (switched GND)
       ── G33 ─────────────────────────────── MOSFET ── PUMP (switched GND) → 12 V DIN relay → contactor
       ── G18 Trig (shared) ── RJ45 S1–S8, MAIN
       ── G34 G35 G36 G39 G16 G17 G19 G23 / G4 ── 1k/2k dividers + ESD ── Echo S1–S8 / MAIN
       ── G2 LED, G0 Setup button
```

## Firmware notes

- Board version 2: `#define RP_BOARD 2` in `secrets.h` (`npm run new-device -- --board v2`) or the
  serial command `board 2`. The controller then reports `ports: { sensors: 8, valves: 8, phe: true,
  main: true }` and the app's installer setup allows up to 8 tanks.
- The firmware opens at most 2 valves at once (only while switching tanks), so the 3-valve limit
  above holds.
- Every second the firmware reads back the MCP23017 direction and latch registers. A missing or
  reset expander stops the pump and PHE (direct pins) and locks the controller.
- IP65 box: at least 200 × 150 × 100 mm for the 160 × 100 mm board, glands for the RJ45 cables
  on the bottom face, the antenna edge away from metal.
