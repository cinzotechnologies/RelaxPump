# Wiring notes (v2: 1–5 semi tanks, 6 relays)

One controller and one firmware for every home: **1–5 semi tanks** (sensor + valve each; one tank =
sensor only), an optional **main-tank sensor**, and **6 outputs** (V1–V5 + PUMP). No PHE line.
The installer tells the app how many tanks are wired (Installer setup, PIN); nothing is re-flashed.
Plan and limits: `docs/flexible-system.md` §1–2. Pins: `firmware/src/board.h`.

Tank *n* always uses sensor port **T*n*** and valve relay **V*n***. Wire tanks from T1 upwards
with no gaps.

## Pins (tanks 1–3 and the pump keep the pins of the first board)

| Port | Trig | Echo | Valve relay |
|---|---|---|---|
| T1 | G16 | G17 | V1 = G25 |
| T2 | G18 | G19 | V2 = G26 |
| T3 | G23 | G4 | V3 = G27 |
| T4 | G13 | G34 | V4 = G32 |
| T5 | G14 | G35 | V5 = G22 |
| MAIN | G21 | G39 | — |
| PUMP | — | — | G33 |

| Other | Pin |
|---|---|
| Status LED | G2 |
| SETUP / BOOT button (hold 5 s = forget Wi-Fi) | G0 |
| Spare | G5 |
| Power | VIN / GND ← 5 V buck (set it to 5.0 V **before** connecting) |

- **Echo** through a 1k / 2k divider (5 V → 3.3 V): Echo → 1k → GPIO, GPIO → 2k → GND.
  G34 / G35 / G39 are input-only — fine for Echo.
- **One tank:** only T1 is wired; V1 is not used, the pump fills the tank directly.
- **2 to 5 tanks:** every tank has a sensor **and** a valve. Going from 1 to 2 tanks means fitting
  a valve on tank 1 too.
- Full first-board plan with pictures: [`Smart_Water_Tank_Project_Plan.pdf`](Smart_Water_Tank_Project_Plan.pdf)
  (it shows 3 tanks; T4/T5/MAIN are the additions above).

## Outputs: relay module (board 1) or PCB (board 2)

The firmware has one pin map; the **board version only picks the output polarity**. Set it in
`secrets.h` (`RP_BOARD 1|2`, written by `npm run new-device -- --board v1|v2`) or with the serial
command `board 1` / `board 2` (kept in flash).

| Board | Outputs | Polarity |
|---|---|---|
| 1 — relay module | **6-channel** relay module (or 8-channel, 2 unused): IN1–IN5 = V1–V5 (G25 G26 G27 G32 G22), IN6 = PUMP (G33) | **active LOW** |
| 2 — PCB v2 | 6 MOSFET outputs, see [`hardware/pcb-v2.md`](../hardware/pcb-v2.md) | **active HIGH** |

- Every output is written OFF **before** it becomes an output, so nothing switches on at boot.
- Relay module: COM ← +12 V, NO → valve +; valve − → GND.
- **Valves:** 12 V DC normally-closed solenoids. The firmware never has more than **2 valves on at
  once** (only for a moment while switching tanks). Power: 12 V **3 A** for ≤ 12 W valves,
  12 V **5 A** for brass 20 W valves; plus a 5 V 3 A buck for the ESP32 and the sensors.
- **Pump:** the PUMP output switches the **contactor coil** only; the contactor carries the pump
  current. Size it to the pump: 0.5 HP 9 A · 1 HP 12 A · 1.5 HP 18 A · 2 HP 25 A; MCB; overload
  relay from 1.5 HP. Or use the output as a dry contact in an existing starter. RC snubber on the
  coil. Relay module: L → COM, NO → A1, A2 ← N. **Mains work by an electrician.**
- PCB v2: **no 230 V on the PCB** — PUMP drives a 12 V DIN-rail interface relay in the mains box,
  which switches the contactor coil.

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
| `board 1` / `board 2` | set the board version (output polarity) and restart |
| `w` | forget Wi-Fi and restart |

Relay-only test sketch: `firmware/tools/ValveTest` (V1 → V5, 10 s each, pump off).

## Status LED

| Pattern | Meaning |
|---|---|
| slow blink (1 s) | waiting for Bluetooth setup |
| fast blink | connecting to Wi-Fi / Firebase |
| on | online |
| double blink | stopped for safety — see the message in the app; any command from the app clears it |
