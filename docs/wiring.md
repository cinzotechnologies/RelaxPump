# Wiring notes (v3: Household + PHE modules, 8 relays)

Two modules, each its own board with the **same PCB and the same firmware**; the type is set at the
factory (`docs/two-module-system.md` §1–2):

- **Household:** pump + **1–5 semi tanks** (sensor + valve each; one tank = sensor only) + optional
  **main-tank sensor**. Outputs K1 = PUMP, K2–K6 = V1–V5.
- **PHE:** **1–5 PHE lines**, each a sensor on its tank + a valve on its pipe (always both), **no
  pump, no MAIN port**. Outputs K2–K6 = V1–V5; K1 not fitted. See § PHE module below.

The installer tells the app how many tanks / lines are wired (Installer setup, PIN); nothing is
re-flashed. Pins: `firmware/src/board.h` (the Rev C board only changes that file).

Tank *n* always uses sensor port **T*n*** and valve relay **V*n***. Wire tanks from T1 upwards
with no gaps.

## Pins (tanks 1–3 and the pump keep the pins of the first board)

| Port | Trig | Echo | Valve relay |
|---|---|---|---|
| T1 | G16 | G17 | V1 = K2 = G25 |
| T2 | G18 | G19 | V2 = K3 = G26 |
| T3 | G23 | G4 | V3 = K4 = G27 |
| T4 | G13 | G34 | V4 = K5 = G32 |
| T5 | G14 | G35 | V5 = K6 = G22 |
| MAIN | G21 | G39 | — (household only) |
| PUMP | — | — | K1 = G33 (household only) |
| spare | — | — | K7 = G5, K8 = G15 (driven OFF, not used yet) |

| Other | Pin |
|---|---|
| Status LED | G2 |
| SETUP / BOOT button (hold 5 s = forget Wi-Fi) | G0 |
| Power | VIN / GND ← 5 V buck (set it to 5.0 V **before** connecting) |

- **Echo** through a 1k / 2k divider (5 V → 3.3 V): Echo → 1k → GPIO, GPIO → 2k → GND.
  G34 / G35 / G39 are input-only — fine for Echo.
- **One tank:** only T1 is wired; V1 is not used, the pump fills the tank directly.
- **2 to 5 tanks:** every tank has a sensor **and** a valve. Going from 1 to 2 tanks means fitting
  a valve on tank 1 too.
- Full first-board plan with pictures: [`Smart_Water_Tank_Project_Plan.pdf`](Smart_Water_Tank_Project_Plan.pdf)
  (it shows 3 tanks; T4/T5/MAIN are the additions above).

## Outputs: relay module (board 1), PCB v2 (board 2) or Rev C (board 3)

The firmware has one pin map; the **board version only picks the output polarity**. It is stored on
the board at the factory (`npm run new-device -- --board v1|v2|v3` → `factory-flash`), or set with
the serial command `board 1|2|3` (kept in flash).

| Board | Outputs | Polarity |
|---|---|---|
| 1 — relay module | **6-channel** relay module (or 8-channel, 2 unused): IN1–IN5 = V1–V5 (G25 G26 G27 G32 G22), IN6 = PUMP (G33) | **active LOW** |
| 2 — PCB v2 | 6 MOSFET outputs, see [`hardware/pcb-v2.md`](../hardware/pcb-v2.md) | **active HIGH** |
| 3 — Rev C | 8 outputs K1–K8 through a ULN driver (board being designed), 8 MB ESP32 module | **active HIGH** |

- Every output is written OFF **before** it becomes an output, so nothing switches on at boot.
- Relay module: COM ← +12 V, NO → valve +; valve − → GND.
- **Valves:** 12 V DC normally-closed solenoids. Since firmware 2.2, **all valves may be on at
  once** (manual fill), so size the 12 V supply for every valve together: ≤ 12 W valves need
  1 A each, brass 20 W valves 1.7 A each (3 brass valves → 12 V 6 A, 5 → 12 V 10 A), plus a 5 V
  3 A buck for the ESP32 and the sensors.
- **Pump:** the PUMP output switches the **contactor coil** only; the contactor carries the pump
  current. Size it to the pump: 0.5 HP 9 A · 1 HP 12 A · 1.5 HP 18 A · 2 HP 25 A; MCB; overload
  relay from 1.5 HP. Or use the output as a dry contact in an existing starter. RC snubber on the
  coil. Relay module: L → COM, NO → A1, A2 ← N. **Mains work by an electrician.**
- PCB v2: **no 230 V on the PCB** — PUMP drives a 12 V DIN-rail interface relay in the mains box,
  which switches the contactor coil.

## PHE module

- Line *n* = sensor **T*n*** on the tank it fills + valve **V*n*** on the pipe just before that tank.
  Two lines into one tank = two lines with two sensors.
- No pump terminal, no MAIN port (the PHE board is assembled without them); K1 stays OFF.
- **Valves:** PHE pressure is low → buy **zero-pressure / direct-acting** 12 V NC solenoids, not
  pilot-operated ones. Auto may hold **all five open for hours**, so they must be
  **continuous-duty** coils, and the 12 V supply must carry every valve together (≈ 0.5 A each for
  6 W coils → 5 lines: 12 V 3 A minimum).
- Valves close by themselves on a power cut (NC); the board starts with every valve closed and
  closes a line when its sensor stops answering.

## Sensors

- JSN-SR04T: mount the probe ≥ 30 cm above the full level (20–25 cm blind zone).
- Cable (CAT6, RJ45 T568B on the PCB): brown = 5 V, brown-white + spare whites = GND,
  blue = Trig, green = Echo.
- **Main tank sensor** (port MAIN, optional): the pump never starts, and stops, below the
  "stop below" level (default 10 %, 5–40 %). The "level must rise 2 % in 5 min" dry-run check stays
  as the backup.

## Safety timings (unchanged, CLAUDE.md §7)

Open the tank valve → 2 s → pump on; pump off → 3 s → close the valve (one tank: pump on/off only).
One tank fills at a time; switching tanks opens the next valve before closing the last one. Max run
time (default 30 min), dry-run stop, 60 s cooldown, stop on sensor failure, everything off when
offline longer than the max run time.

## Bench test from the serial monitor (115200, type `h`)

Household commands below; a PHE board has `s`, `v<n>` (open/close line *n*), `tV<n>`, `a` (Auto fill),
`r` (all valves closed) and the board commands — no pump, no `f`, no pump check.

| Command | Does |
|---|---|
| `s` | status: levels (T1–T5, MAIN), valves, ports that answer, board, cloud |
| `v3` | toggle valve 3 (V1–V5; 2+ tanks only) |
| `f2` | fill tank 2 (opens its valve, then the pump; one tank: pump only) |
| `p` | pump on/off |
| `tV3`, `tPUMP` | 1 s test pulse; the pump test opens V1 first |
| `c` | pump check |
| `a` | Auto on/off |
| `r` | reset: everything off, clears a lockout |
| `board 1` / `2` / `3` | set the board version (output polarity) and restart |
| `id` | identity: id, type, where it came from (NVS / secrets.h), flash size, OTA bucket |
| `type household` / `type phe` | factory only: set the module type and restart |
| `w` | forget Wi-Fi and restart |

Relay-only test sketch: `firmware/tools/ValveTest` (V1 → V5, 10 s each, pump off).

## Status LED

| Pattern | Meaning |
|---|---|
| slow blink (1 s) | waiting for Bluetooth setup |
| fast blink | connecting to Wi-Fi / Firebase |
| on | online |
| double blink | stopped for safety — see the message in the app; any command from the app clears it |
