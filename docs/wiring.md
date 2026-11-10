# Wiring notes

One firmware for both boards. The board version comes from `secrets.h` (`RP_BOARD 1|2`, written by
`npm run new-device -- --board v1|v2`) or the serial command `board 1` / `board 2` (kept in flash).
Pins live in `firmware/src/board.cpp`. Plan and limits: `docs/flexible-system.md` §4.

Semi tank *n* always uses sensor port **S*n*** and valve port **V*n***. A tank may have only a
sensor, only a valve, both, or (single tank only) neither — the installer sets this in the app.

## Board v1 (today's board, 3 tanks)

Full plan with pictures: [`Smart_Water_Tank_Project_Plan.pdf`](Smart_Water_Tank_Project_Plan.pdf).

| ESP32 | Goes to | Note |
|---|---|---|
| VIN / GND | LM2596 buck 5.0 V | set the buck to 5.0 V **before** connecting |
| G16 / G17 | S1 Trig / Echo | Echo through 1k → GPIO, 2k → GND |
| G18 / G19 | S2 Trig / Echo | same divider |
| G23 / G4 | S3 Trig / Echo | same divider (PDF says G22/G23 — check the board) |
| G25 / G26 / G27 | Relay IN1–IN3 → V1–V3 | relay COM ← +12 V, NO → valve |
| G33 | Relay IN4 → contactor coil (PUMP) | L → COM, NO → A1, A2 ← N. Electrician + MCB |
| G2 | on-board LED | status |
| G0 (BOOT) | button | hold 5 s = forget Wi-Fi, Bluetooth setup again |

- No PHE port and no MAIN port: the app hides them (`info.ports`).
- The relay module is **active LOW**; the firmware writes HIGH before making the pins outputs, so
  nothing switches on at boot.

## Board v2 (PCB, up to 8 tanks + PHE + MAIN)

Details, connectors and BOM: [`hardware/pcb-v2.md`](../hardware/pcb-v2.md).

| ESP32 | Goes to | Note |
|---|---|---|
| G21 / G22 | MCP23017 SDA / SCL (0x20) | GPA0–GPA7 drive the MOSFETs of **V1–V8** |
| G33 | PUMP MOSFET → 12 V DIN-rail relay → contactor coil | direct pin: always stoppable |
| G32 | PHE MOSFET → PHE solenoid | direct pin: always closable |
| G18 | Trig of all sensors (shared) | echoes are read one at a time |
| G34 G35 G36 G39 G16 G17 G19 G23 | Echo S1–S8 | 1k/2k divider + TVS on each |
| G4 | Echo MAIN | divider + TVS |
| G2 / G0 | LED / Setup button | |

- Outputs are **active HIGH** (MOSFETs). Every output is written OFF before it becomes an output.
- **Valve board fault** (MCP23017 not answering, or reset): the pump and PHE stop at once, the
  controller locks and the app shows "Controller error — valve board".
- **No 230 V on the PCB.** PUMP switches a 12 V interface relay in the mains box, which switches
  the contactor coil (or the customer's starter as a dry contact). RC snubber on the coil.
- PHE line: fit a **check valve** on the PHE line and on the pump line.

## Both boards

- Valves are 12 V normally-closed **solenoid** valves: open → 2 s → pump on; pump off → 3 s →
  close. PHE: open tank valve → 2 s → PHE on; PHE off → 2 s → close.
- JSN-SR04T: mount the probe ≥ 30 cm above the full level (20–25 cm blind zone).
- Sensor cable (CAT6 / RJ45 T568B on v2): brown = 5 V, brown-white + spare whites = GND,
  blue = Trig, green = Echo.
- A tank **without a sensor** fills by its timer: fit an **overflow pipe**.
- Main tank sensor: the pump never starts (and stops) below the "stop below" level (default 10 %).

## Bench test from the serial monitor (115200, type `h`)

| Command | Does |
|---|---|
| `s` | status: levels, valves, ports that answer, board, cloud |
| `v3` | toggle valve 3 |
| `f2` | fill tank 2 (source from the mode) |
| `p` / `e` | pump / PHE on-off |
| `tV3`, `tPHE`, `tPUMP` | 1 s test pulse (pump test opens V1 first) |
| `c` | pump check |
| `a` | Auto on/off |
| `r` | reset: everything off, clears a lockout |
| `board 1` / `board 2` | set the board version and restart |
| `w` | forget Wi-Fi and restart |

## Status LED

| Pattern | Meaning |
|---|---|
| slow blink (1 s) | waiting for Bluetooth setup |
| fast blink | connecting to Wi-Fi / Firebase |
| on | online |
| double blink | stopped for safety — see the message in the app; any command from the app clears it |
