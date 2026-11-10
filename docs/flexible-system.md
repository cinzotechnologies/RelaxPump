# RelaxPump v2 — customizable system (1–5 semi tanks)

This replaces the fixed "3 tanks" plan **and the earlier 8-tank / PHE draft**. Read it together
with the root `CLAUDE.md`. Where they disagree, **this file wins**. All safety rules in
`CLAUDE.md` §7 still apply.

Goal: **one controller and one firmware build for every home.** The customer orders a kit for the
number of tanks they have; the installer tells the app how many tanks are connected. The firmware
is flashed once and never rebuilt per customer.

---

## 1. Rules of the product

| Rule | Detail |
|---|---|
| Semi tanks | **1 to 5** per controller |
| Sensor + valve | **Always a pair** for each semi tank (one Tank Kit = 1 sensor + 1 valve) |
| One tank only | **Sensor only, no valve.** The pump fills that tank directly |
| Relays | **6 channels:** V1–V5 for the valves + 1 for the pump |
| Main tank sensor | Optional (port MAIN). Protects the pump from running dry |
| PHE line | **Not supported** (removed) |
| Filling | One tank at a time (unchanged) |

### What the customer orders
| Tanks | Kits |
|---|---|
| 1 | Controller + **Sensor Kit ×1** + Pump Kit (+ Main Tank Kit) |
| 2–5 | Controller + **Tank Kit ×n** (sensor + valve) + Pump Kit (+ Main Tank Kit) |

Store products: Controller (6-relay) · Tank Kit (sensor + valve) · Sensor Kit · Main Tank Kit ·
Pump Kit (contactor sized to the pump) · Home Installation · spare Level Sensor · spare Solenoid Valve.

---

## 2. Hardware

### Pins (extends today's board; tanks 1–3 and the pump keep their current pins)
| Port | Trig | Echo | Valve relay |
|---|---|---|---|
| T1 | G16 | G17 | V1 = G25 |
| T2 | G18 | G19 | V2 = G26 |
| T3 | G23 | G4 | V3 = G27 |
| T4 | G13 | G34 | V4 = G32 |
| T5 | G14 | G35 | V5 = G22 |
| MAIN | G21 | G39 | — |
| PUMP | — | — | G33 |

- Echo through 1k/2k dividers (G34/G35/G39 are input-only — fine for Echo).
- Relay module: **6-channel** (or 8-channel with 2 unused), **active LOW**; write HIGH before
  `pinMode(OUTPUT)` at boot. LED G2, BOOT G0 (unchanged). Spare: G5.
- One tank: V1 is not used; the pump fills the tank directly.
- Valves: 12 V DC normally-closed solenoids. **At most 2 valves on at once** (only while switching
  tanks) — the firmware refuses a 3rd. Power: 12 V 3 A for ≤ 12 W valves, **12 V 5 A** for brass
  20 W valves. 5 V 3 A buck for the ESP32 and sensors.
- Pump relay switches the **contactor coil** only; the contactor carries the pump current
  (0.5 HP 9 A · 1 HP 12 A · 1.5 HP 18 A · 2 HP 25 A; MCB; overload relay ≥ 1.5 HP). Or use the
  relay as a dry contact in an existing starter. RC snubber on the coil.
- PCB (later): ESP32 DevKit socket, 6 outputs, 6 RJ45 jacks (T1–T5, MAIN), 12 V in, 5 V buck.
  Update `hardware/pcb-v2.md` and `reference/pcb-v2/` to this (they still show the old 8 + PHE draft).

### Pump sizing (docs, store calculator, installer)
Pick by the **highest tank**: lift = height_ft / 3.28 × 1.2 + 0.5 m (+ depth if the main tank is
underground; a surface pump cannot lift from deeper than ~6 m → submersible). Typical: up to ~50 ft
→ 1 HP; 60–80 ft → 1.5–2 HP; above ~100 ft → high-head or booster pump. The number of tanks does
not change the HP, because tanks fill one at a time.

---

## 3. Data model (Realtime Database) — small change from today

```
info:   { name, fw, maxTanks: 5, board: 'v1'|'v2', ownerUid }
config: { tankCount: 1..5, low, high, maxRunMin,
          tanks: [ { name, litres|null, emptyCm, fullCm, heightFt|null } ],   // length = tankCount
          main:  { enabled: bool, litres|null, emptyCm, fullCm, minPct } }    // optional
installerPins/{id}: { hash }        // sha256 of the PIN — see the note below
state:  { online, lastSeen, rssi, ssid, pump, auto, msg, active: int|null,
          tanks: [ { pct, valve, ok } ],
          main:  { pct, ok } | null,
          detected: { tanks: [bool × 5], main: bool },          // which sensor ports answer
          check: [ { lpm, minToFull, slow } ] | null }          // last pump check
cmd:    { pump?, valve?: { i, open }, auto?, test?: { port: 'V1'..'V5'|'PUMP', ms }, pumpCheck?, ts }
events: type += main_low | board_error
usage:  unchanged (perTank up to 5)
```

- Valve per tank is **implied**: `tankCount ≥ 2` → every tank has a valve; `tankCount == 1` → none.
- Existing devices: `tankCount` ≤ 3 already fits; add missing fields with defaults.
- Rules (`firebase/database.rules.json`): `tankCount` 1–5, `tanks` length = `tankCount`,
  `main.minPct` 5–40, the installer PIN hash only writable by the owner. Update the emulator tests.
- **Built (R1):** the PIN hash lives in `installerPins/{id}` (never readable), not in
  `config.installerPinHash`: the owner can read all of `devices/{id}`, and a readable 4-digit hash
  is cracked in seconds. Details: `docs/data-model.md` → "Installer PIN".

---

## 4. Firmware

- `MAX_TANKS = 5`; active count from `config.tankCount`. Report `info.maxTanks = 5`.
- Read sensors round-robin over the active tanks + MAIN (if enabled). Report `state.detected`.
- **One tank:** no valve logic — "open valve → 2 s → pump" becomes "pump on"; the
  "never run with all valves closed" rule does not apply when `tankCount == 1`.
- **Main tank sensor:** never start, and stop, when main < `minPct` (event `main_low`); the
  "level rises 2 % in 5 min" dry-run rule stays as the backup.
- Auto: fill the lowest tank below `low` up to `high`, then the next (unchanged).
- `cmd.test`: pulse one output for `ms` (≤ 3000) for the setup wizard; refused while filling.
- `cmd.pumpCheck`: fill each tank for 2 min, measure %/min → L/min (needs litres) and time to
  full, write `state.check`, mark `slow` when it rises < 2 % in 5 min.
- Hard limit: never more than 2 valve relays on at once.
- Keep: max run time, 60 s cooldown, offline guard, lockout, BOOT 5 s, BLE provisioning, serial
  bench commands (extend to 5 tanks + MAIN). Unit-test the decision logic on the host
  (PlatformIO `native`) for 1, 2 and 5 tanks, with and without the main sensor.

---

## 5. App

**Design source:** `reference/design-v2/` (same `.dc.html` format; read the markup and the script).
Keep the approved v1 look and motion. Match these screens:

| File | Screen |
|---|---|
| `AppSetup.dc.html` | **Installer setup:** PIN keypad → 1 number of semi tanks 1–5 (port legend; one tank = sensor only) → 2 each tank: name, size, height above the main tank → 3 main tank sensor on/off + stop-below % → 4 Check wiring: sensors Found ✓ / No answer, **Test** for each valve and the pump → 5 Summary (tanks, sensors, valves, main, relays used x of 6) → Saved |
| `AppHome.dc.html` | **Home** for 1–5 tanks (Tweaks), main tank card when enabled |
| `AppTanks.dc.html` | **Tanks** for 1–5 tanks: tall gauges ≤ 3 tanks, short for 4–5; no valve button with one tank; main tank gauge with the min-% line |
| `AppPumpCheck.dc.html` | **Pump check** results per tank |
| `AppAccount.dc.html` | **Account** with **My setup** (tanks, valves, sensors, free ports x of 5), Installer setup (PIN), Pump check, Add a tank (→ buy a Tank Kit) |

Behaviour:
1. Installer setup opens after a controller is claimed, and later from Account (PIN). Save writes
   `config` in one update and waits for `state` to confirm.
2. The customer (no PIN) can change tank names, litres, low/high only.
3. No screen may assume 3 tanks. Home, Tanks, Usage and the Tanks sheet follow `config.tankCount` (1–5).
4. Add a tank: buy a Tank Kit, wire it to the next free port, Installer setup → tank count + 1.
   Going from 1 to 2 tanks needs a valve on **both** tanks (the app says so).
5. Mock backend layouts: 1, 2, 3, 5 tanks, with and without the main sensor.
6. Tests: setup reducer and validation, one-tank vs multi-tank helpers, Home/Tanks render for 1 and 5.

---

## 6. Website (when `web/` is built)

The store calculator in `reference/website/Shop.dc.html` still shows the old 8-tank + PHE draft.
When building or updating `web/`: max **5** tanks, **no PHE** toggle or PHE kit, kit list =
Controller + (Sensor Kit ×1 for one tank, or Tank Kit ×n) + Main Tank Kit (optional) + Pump Kit;
capability strip "Up to 5 tanks · sensor + valve per tank · main tank sensor · 6 relays". The pump
maths in `docs/website-brief.md` §9 stays the same.

---

## 7. Milestones (show the plan first; commit + push after each)

1. Data model + rules + emulator tests
2. Firmware: 1–5 tanks, one-tank mode, main sensor, test, pumpCheck, valve limit, host unit tests
3. App: installer setup + PIN, dynamic Home/Tanks/Usage/sheets, Pump check, Account "My setup"
4. Mock backend layouts + app tests
5. Docs: `docs/wiring.md` (6 relays, 5 tanks + MAIN), `docs/SETUP.md`, `hardware/pcb-v2.md`
6. Bench test on the board with 1, 3 and 5 tanks; fix and document

Ask before anything that costs money, changes Firebase, or deletes files. When something needs me
(flashing, wiring, Firebase console), stop and give short numbered steps.
