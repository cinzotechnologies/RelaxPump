# RelaxPump v2 — flexible system (1–8 semi tanks, PHE, main tank)

This replaces the fixed "3 tanks, 3 valves, 1 pump" plan. Read it together with the root
`CLAUDE.md`. Where they disagree, **this file wins**. The safety rules in `CLAUDE.md` §7 still apply
to every fill.

Goal: **one controller and one firmware build for every home.** Customers buy only the kits they
need; the installer (or the customer) tells the app what is connected. The firmware is flashed
once with the maximum layout and never rebuilt per customer.

---

## 1. What one controller supports (the package limits)

| Port | Count | Used for |
|---|---|---|
| **V1–V8** | 8 relay / MOSFET outputs | semi tank valves only (12 V DC, normally closed solenoids) |
| **PHE** | 1 output | the PHE (public water) line valve |
| **PUMP** | 1 output | the pump, through a contactor or the customer's starter |
| **S1–S8** | 8 sensor inputs | semi tank ultrasonic sensors only (JSN-SR04T) |
| **MAIN** | 1 sensor input | main tank (sump) sensor |

So: up to **8 semi tanks**, plus an optional PHE line and an optional main-tank sensor, plus the pump.
Semi tank *n* always uses **S*n*** and **V*n*** (fixed, so wiring and setup stay simple).

### Kits (also the store products)
Controller (one per home) · Semi Tank Kit (sensor + valve) · Level Sensor only · Solenoid Valve only ·
PHE Kit (valve + check valve) · Main Tank Kit (sensor) · Pump Kit (contactor sized to the pump) ·
Home Installation.

---

## 2. Per-tank options

Each semi tank may have a sensor, a valve, both, or (single tank only) neither:

| Has | Behaviour |
|---|---|
| sensor + valve | full Auto: fills when below `low`, stops at `high` |
| valve only | no level. Manual "Fill" runs for the tank's **fill minutes** (required, 1–120). Not in Auto |
| sensor only | level shown. Can be filled only when it is the **only** semi tank (pump fills it directly) |
| neither | only allowed with one semi tank: pump on/off with a timer |

Rules the app and the firmware both enforce:
- With **2 or more** semi tanks, **every semi tank needs a valve.**
- A tank without a sensor needs `fillMin`; the app warns to fit an overflow pipe.
- One tank fills at a time (unchanged). Never run the pump with no open path.

---

## 3. Water sources

- **Pump** (always present) pulls from the main tank.
  - If the main tank has a sensor: never start, and stop, when main < `main.minPct` (default 10 %).
    This is the primary dry-run guard; the "level must rise 2 % in 5 min" rule stays as the backup.
  - Without a main sensor: dry-run guard as today.
- **PHE line** (optional), valve on the PHE port, check valves on both the PHE and the pump line.
  - **PHE detection without an extra sensor:** open the tank valve, then the PHE valve, and watch
    the tank level. If it rises ≥ 2 % within `pheProbeMin` (default 4 min) → PHE water is there,
    keep filling. If not → close PHE, and in Auto fall back to the pump after the cooldown.
  - While PHE is flowing, don't retry PHE for `pheRetryMin` (default 30) after a failed probe.
  - If PHE becomes available while the pump runs (optional later: pressure sensor), switch to PHE.
- **Mode** (`config.mode`): `auto` (PHE first if present, else pump) · `phe` (PHE only) · `pump` (pump only).

**Sequences** (solenoids, 2 s lead, unchanged timings in `config.h`):
- Pump fill: open tank valve → 2 s → pump on … pump off → 3 s → close tank valve.
- PHE fill: open tank valve → 2 s → open PHE valve … close PHE valve → 2 s → close tank valve.
- Switching tanks: open next tank valve, then close the previous one (as today).
- Pump and PHE are never on at the same time.

---

## 4. Hardware

### Board v1 (today's board) — keep working
Reports `ports: { sensors: 3, valves: 3, phe: false, main: false }`. Old pins unchanged.

### Board v2 (new PCB)
| Function | ESP32 pin | Notes |
|---|---|---|
| V1–V8 | **MCP23017** on I2C (G21 SDA, G22 SCL), GPA0–GPA7 | expander drives MOSFETs (12 V valves) |
| PUMP | **G33**, direct | always stoppable even if I2C fails |
| PHE | **G32**, direct | always closable even if I2C fails |
| Trig (all sensors) | G18 | shared; echoes are read one at a time |
| Echo S1–S8 | G34, G35, G36, G39, G16, G17, G19, G23 | 1k/2k divider, TVS on each line |
| Echo MAIN | G4 | divider + TVS |
| LED / BOOT | G2 / G0 | |
| Spare | G13, G14, G25, G26, G27, G5 | G39↔G13 swap if a CT current sensor is added later |

- **MCP23017 fault** (I2C error, not found): stop the pump and close PHE at once, lockout, `msg`
  "Controller error — valve board". Write all outputs OFF before setting them as outputs at boot.
- v2 outputs are **active HIGH** (MOSFET); v1 relays are **active LOW**. One firmware: board version
  in `secrets.h`/NVS (`BOARD_V1` / `BOARD_V2`) selects pins and levels.
- **No 230 V on the PCB.** PUMP drives a 12 V DIN-rail interface relay in the mains box, which
  switches the contactor coil (or the customer's starter as a dry contact). RC snubber on the coil.
- Power: 12 V 3 A in (fuse, reverse-polarity diode) → 5 V 3 A buck → 3.3 V.
- Sensor jacks: RJ45 per port (CAT6: brown 5 V, brown-white GND, blue Trig, green Echo).
- Write `hardware/pcb-v2.md`: block diagram, the pin table above, per-port connector pinout, BOM,
  layout notes (antenna at the edge, no copper under it, 2-layer, IP65 box size).

### Pump sizing (for the docs, the store calculator and the installer)
The controller doesn't limit the pump; the contactor does. Pick by the **highest tank**:
lift = height_ft / 3.28 × 1.2 + 0.5 m (+ depth if the main tank is underground; a surface pump
cannot lift from deeper than ~6 m → submersible). Typical: up to ~50 ft → 1 HP; 60–80 ft →
1.5–2 HP; above ~100 ft → high-head/booster. Contactor ≥ 1.5–2 × motor current
(0.5 HP 9 A · 1 HP 12 A · 1.5 HP 18 A · 2 HP 25 A), MCB and overload relay for ≥ 1.5 HP.
Number of tanks does not change the HP, because tanks fill one at a time.

---

## 5. Data model (Realtime Database) — replaces `config.tanks` / `state.tanks`

```
info:   { name, fw, board: 'v1'|'v2',
          ports: { sensors: 8, valves: 8, phe: true, main: true }, ownerUid }
config: { semi: [ { name, litres|null, emptyCm, fullCm, heightFt|null,
                    sensor: bool, valve: bool, fillMin|null } ],   // length 1..ports.sensors/valves
          main: { enabled: bool, sensor: bool, litres|null, emptyCm, fullCm, minPct },
          phe:  { enabled: bool, probeMin, retryMin },
          mode: 'auto'|'phe'|'pump', low, high, maxRunMin,
          installerPinHash }                                      // sha256, set by the installer
state:  { online, lastSeen, rssi, ssid, auto, msg,
          pump: bool, phe: bool, src: 'pump'|'phe'|null, active: int|null,
          semi: [ { pct|null, valve: bool, ok: bool } ],
          main: { pct|null, ok: bool } | null,
          detected: { s: [bool × 8], main: bool } }               // which sensor ports answer
cmd:    { pump?, phe?, valve?: { i, open }, fill?: { i, src: 'pump'|'phe' }, auto?,
          test?: { port: 'V3'|'PHE'|'PUMP', ms }, pumpCheck?, ts }
events: type += phe_on | phe_off | phe_none | main_low | board_error
usage/{day}: { litres, pumpMin, pheLitres, perTank: [{ litres, pumpMin, pheLitres }] }
```

- **Migration:** on first boot with the new firmware, convert old `config.tanks[]` + `tankCount`
  into `config.semi[]` (sensor = valve = true) and keep the user's names/levels. The app reads both
  shapes until every device is migrated.
- Update `firebase/database.rules.json` (validate lengths ≤ ports, `fillMin` required when
  `sensor == false`, `installerPinHash` write-only for the owner) and its emulator tests.

---

## 6. Firmware

- Arrays sized to the maximum (`MAX_SEMI = 8`); the active count and per-tank flags come from
  `config`. Unused ports are never driven.
- Sensor reading round-robin over present sensors (+ MAIN); report `detected` (echo received
  within the timeout) so setup can show which ports answer.
- Auto picks the lowest tank (with sensor + valve) below `low`; with tank heights known, prefer the
  lowest-placed tank first when levels tie.
- Valve-only tanks: manual fill for `fillMin`, then stop (event `timeout` is not an error here).
- `cmd.test`: pulse one output for `ms` (≤ 3000) — for the setup wizard's "Test" buttons; refused
  while a fill runs.
- `cmd.pumpCheck`: fill each tank (sensor + valve) for 2 min, measure %/min → L/min (needs litres),
  write `state.check: [{ lpm, minToFull }]`, flag tanks where the pump is too weak (< 2 %/5 min).
- Keep: max run time, 60 s cooldown, offline guard, lockout cleared by any command, BOOT 5 s,
  BLE provisioning, serial bench commands (extend them to 8 ports + PHE + MAIN).
- Tests: extract the decision logic into a pure C++ module and unit-test it on the host
  (PlatformIO `native` env) for every layout in §2 and every mode.

---

## 7. App — redesign for the flexible system

**Design source:** `reference/design-v2/` (same `.dc.html` format as `reference/design/`; read the
markup and the script). Keep the approved v1 look — dark teal tokens, Outfit/Inter, wave fills,
rings, springy toggles, press 0.96, bottom nav — and match these screens exactly:

| File | Screen | What to copy |
|---|---|---|
| `AppSetup.dc.html` | **Installer setup** | PIN keypad (4 digits) → 5 steps with progress bar: 1 tank count 1–8 (port legend), 2 per-tank card (name, size chips, Sensor/Valve toggles, fill time when no sensor, inline error "Needs a valve…"), 3 Main tank sensor (+ stop-below %) and PHE line, 4 Check wiring (sensor detection Found ✓ / No answer, Test buttons per V*n*, PHE, PUMP), 5 Water source (Auto / PHE only / Pump only + help text + summary) → Saved screen. Next is disabled while there are errors. |
| `AppHome.dc.html` | **Home** | Tweaks show every layout: 1–8 tanks, PHE on/off, main on/off, a tank without sensor. Level card = average of tanks with sensors + source chip (PHE / PUMP). Main tank card with bar and "PHE · Flowing". Tank list 1–8; a no-sensor tank shows a dashed circle, "No sensor · fills by timer" and a **Fill 10 min / Stop** button. |
| `AppTanks.dc.html` | **Tanks** | Source segmented control (PHE option only when installed), main tank horizontal gauge with min-% line, grid 3 per row for 1–8 tanks (tall gauges ≤ 3 tanks, short when more), no-sensor card (dashed gauge, Fill 10 min), valve button hidden with one tank, Auto card note about no-sensor tanks, Start/Stop filling. |
| `AppPumpCheck.dc.html` | **Pump check** | Ready card → animated bars while checking → per tank L/min, height, "Full in …", Good/Slow tag and the slow-pump warning. |
| `AppAccount.dc.html` | **Account** | "My setup" card (device id + board, counts of tanks / sensors / PHE / main, free ports), rows: Installer setup (PIN), Pump check, Add a tank (Buy a kit → website store), Tank names and sizes, Change password, Notifications, Sign out. |

Behaviour:
1. **Installer setup** opens automatically after a controller is claimed, and later from Account.
   PIN: set on first setup, stored only as `config.installerPinHash`; "Forgot PIN" → contact CINZO.
   Steps and validation exactly as the design; Save writes `config` in one update, then the app
   waits for `state` to confirm (spinner, timeout message). Number of tanks is capped by `info.ports`.
2. **Customer** (no PIN) can change tank names, litres, low/high and mode only.
3. **Home / Tanks / Usage** read the layout from `config` — no screen may assume 3 tanks.
   Usage adds PHE vs Pump litres.
4. **Add a tank:** buy a kit, wire it to the next free port, then Installer setup → tank count +1.
5. Mock backend: layouts 1, 3, 5, 8 tanks; with/without PHE and main sensor; one no-sensor tank.
6. Tests: layout validation (all §2 rules), setup reducer, source/mode helpers, Home/Tanks render for
   1 and 8 tanks.

## 8. Website / admin

Already designed in `reference/website/` and `docs/website-brief.md` §9: kit products and the
"Plan your kit" calculator (pump options, fill times, kit list). Use the same numbers as §4 here.

---

## 9. Milestones (show the plan first; commit + push after each)

F1. Data model + rules + emulator tests (+ migration plan)
F2. Firmware core: N tanks, optional sensor/valve, ports, board v1/v2 pin maps, host unit tests
F3. Firmware: main tank guard, PHE source + probe, modes, `test`, `pumpCheck`, MCP23017 fault handling
F4. App: match reference/design-v2 — installer setup + PIN, dynamic Home/Tanks/Usage, source selector, Pump check, Account "My setup"
F5. Mock backend layouts + app tests
F6. `hardware/pcb-v2.md`, `docs/wiring.md` (v1 + v2), manual/website text updates
F7. Bench test on the v1 board (3 tanks), then the v2 prototype; fix and document

Ask before anything that costs money, changes Firebase/Cloudflare, or deletes files. When
something needs me (flashing, wiring, Firebase console), stop and give short numbered steps.
