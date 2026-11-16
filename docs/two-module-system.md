# RelaxPump v3 — two modules: Household + PHE (one app, many boards, OTA)

Read with the root `CLAUDE.md` and `docs/flexible-system.md`. Where they disagree, **this file
wins**. Every safety rule in `CLAUDE.md` §7 still applies to the Household module.
Owner decisions: 2026-11-16.

---

## 1. The product

| | Household module | PHE module |
|---|---|---|
| What it does | Pump lifts water from the main tank to 1–5 semi tanks | PHE (government) supply lines fill 1–5 tanks directly |
| Pump | Yes, relay K1 → contactor | **No pump** |
| Per tank / per line | Sensor + valve pair (one tank = sensor only) | **Sensor + valve pair, always** (also with one line) |
| Max | 5 semi tanks | 5 PHE lines |
| Main tank sensor | Optional (dry-run protection) | No |
| Valves | 12 V NC solenoid (closes on power cut) | same |

- Each module is a **separate product with its own ESP32**. A customer buys Household only, PHE
  only, or both.
- Both use the **same PCB design** (8 relays, sensor ports, 230 V in) and the **same firmware build**.
  The PHE board is assembled without the pump terminal and the MAIN port.
- The module **type is set at the factory** and stored on the board. The customer never picks it.
- **One app, one account, many boards.** Home shows a module for every board on the account.
- Boards never talk to each other. Each one works alone, also with no internet.

### PHE line = one tank
A PHE line ends in one tank. The sensor sits on that tank (ultrasonic, measures the water level),
the valve sits on the pipe just before the tank. If two lines fill the same tank, they are set up
as two lines with the same tank size (two sensors). This keeps "sensor + valve = one pair" true
everywhere and makes moving a line to another tank simple.

---

## 2. Hardware (provisional — the Rev C board is designed next)

One pin map for both types. Tanks/lines use the same ports T1–T5 / V1–V5.

| Relay | Household | PHE | GPIO |
|---|---|---|---|
| K1 | PUMP (230 V contactor coil) | not fitted | G33 |
| K2 | V1 | V1 | G25 |
| K3 | V2 | V2 | G26 |
| K4 | V3 | V3 | G27 |
| K5 | V4 | V4 | G32 |
| K6 | V5 | V5 | G22 |
| K7 | spare | spare | G5 |
| K8 | spare | spare | G15 |

Sensors unchanged: T1 G16/G17 · T2 G18/G19 · T3 G23/G4 · T4 G13/G34 · T5 G14/G35 · MAIN G21/G39.
LED G2 (Wi-Fi), BOOT G0. Keep every pin in `board.h` so the Rev C board only changes that file.
Board version selects the output polarity: 1 = relay module (active LOW), 2 = PCB v2 (active HIGH),
**3 = Rev C (ULN driver, active HIGH)**. Spares K7/K8 are driven OFF and never used yet.

12 V supply: PHE may hold all 5 valves open together (≈ 0.5 A each). Buy **continuous-duty** coils.
PHE pressure is low: buy **zero-pressure / direct-acting** solenoids, not pilot-operated.

---

## 3. Data model changes (Realtime Database)

Same tree as `docs/data-model.md`. Additions:

```
devices/{id}/
  info:   { ..., type: 'household' | 'phe', flash: 4 | 8 }   device writes; missing type = household
  config: household → unchanged
          phe       → { tankCount: 1..5, low: reopen % (50–95, default 85), high: close % (60–100, default 95),
                        tanks: [ { name?, litres?, emptyCm, fullCm } ] }     // tanks = PHE lines
                        no main, no maxRunMin, no heightFt
  state:  household → unchanged
          phe       → { online, lastSeen, rssi, ssid, auto, msg,
                        tanks: [ { pct, valve, ok, rising } ],   rising = level went up ≥ 2 % in 10 min
                        supply: 'flowing' | 'none' | 'unknown' }
          both      → fwAvailable: 'x.y.z' | null,
                      ota: { phase: 'download'|'verify'|'install'|'restart'|'done'|'failed', pct, to, err? } | null
  cmd:    household → unchanged + ota?
          phe       → { auto?, valve?: { i, open }, test?: { port: 'V1'..'V5', ms ≤ 3000 }, ota?, ts }
                      (pump, pumpCheck rejected)
          ota       → { version: 'x.y.z' }
  events: phe adds  flow_start | flow_stop | phe_full | overflow (level rises with the valve closed)
  usage:  phe       → { litres, perTank: [ { litres } ] }   litres received per line

firmware/stable: { version, url, sha256, sig, size, notes: [..], minFw, rollout: 0–100, date }
                  admin writes; any signed-in user and every device may read
```

Rules (`firebase/scripts/build-rules.mjs` + emulator tests):
- `info/type` written by the device only, once (`!data.exists() || data.val() === newData.val()`).
  `new-device --type` also writes it.
- Config validation picks the household or the PHE shape from `info/type`.
- `cmd/pump`, `cmd/pumpCheck`, `test PUMP` refused when type is `phe`.
- `cmd/ota/version` must equal `firmware/stable/version`.
- `users/{uid}/devices` already holds many boards — the old "one account per controller" note in
  `docs/data-model.md` becomes "one account, many controllers".

---

## 4. Firmware

### 4.1 Type
- `type` lives in NVS, written at the factory (serial command `type household|phe`, or by the
  provisioning step in 4.4). Reported as `info.type`. Missing → `household` (old boards).
- One build; `main.cpp` chooses the Household engine (today's `lib/engine`) or the PHE engine.

### 4.2 PHE engine (`lib/engine`, host unit tests like the Household engine)
- Lines are independent. All valves may be open together (no pump, no "one at a time").
- **Auto:** open the valve when `pct < low`; close it at `pct ≥ high`.
- **Manual:** the owner opens/closes a valve. A manually opened valve still closes at `high`.
- **Fail safe:** sensor not answering (`ok: false`) → valve closed, event `sensor`.
- **Rising:** open valve and level up ≥ 2 % in 10 min → `rising: true`. `supply = flowing` when any
  open line is rising, `none` when valves have been open 30 min with no rise, else `unknown`.
  Events `flow_start` / `flow_stop` (debounced 10 min) — the app shows "PHE water coming".
- **Overflow:** valve closed and level still rises ≥ 3 % above `high` → event `overflow`
  (the valve leaks or is stuck).
- Usage: litres received per line per day (needs `litres`).
- Boot, power cut, Wi-Fi loss: every valve starts closed; auto resumes from the sensors.

### 4.3 OTA update over HTTPS (app button)
1. **Partitions:** today's `huge_app.csv` has no second app slot. Change to two OTA slots:
   4 MB boards → `min_spiffs.csv` (2 × 1.9 MB; current build is 1.79 MB, so set
   `CORE_DEBUG_LEVEL=0` and watch the size in CI). Rev C uses the 8 MB module → custom table with
   2 × 3 MB. **Changing the partition table needs one USB flash per existing board** — the last cable
   flash; after that every update is OTA.
2. **Per-device secrets out of the binary.** Today `secrets.h` (device email/password, PoP, claim
   code) is compiled in, one build per board — that cannot work with one OTA binary. Move them to
   NVS: `new-device` writes `firebase/out/<ID>/nvs.csv`; a `factory-flash` script builds an NVS image
   (`nvs_partition_gen.py`) and flashes firmware + NVS with esptool in one step. Shared values
   (API key, DB URL) stay in the build. `secrets.h` stays only as a dev fallback.
3. **Check:** on boot and every 24 h the board reads `firmware/stable`. If `version > fw`, the board's
   rollout bucket (`sha256(id) % 100 < rollout`) passes and `minFw ≤ fw`, it writes
   `state.fwAvailable`.
4. **Update:** app writes `cmd.ota = { version }`. Household refuses while the pump runs (msg
   "busy"). The board: pump off → all valves closed → download over HTTPS (follow redirects) into
   the other slot with `Update`, hashing while writing → check `sha256` and the **ECDSA P-256
   signature** (`sig`) with the public key built into the firmware → set boot slot → restart.
   Reports `state.ota` phases and percent.
5. **Rollback:** the new firmware marks itself valid only after it reaches the cloud within 90 s of
   boot (`esp_ota_mark_app_valid_cancel_rollback`, or an NVS boot counter if the Arduino bootloader
   has no rollback). Otherwise it boots the old slot again and reports `ota.phase = failed`.
6. **Hosting:** GitHub Releases of the public repo (free, HTTPS, no setup). Cloudflare R2 later if
   wanted — ask the owner first (it changes Cloudflare).
7. **Release script** `firmware/scripts/release.mjs`: build → sign with the private key from
   `RP_SIGN_KEY` (a file **outside the repo**, never committed) → `gh release create fw-x.y.z` →
   write `firmware/stable` with `rollout: 10`. `--rollout 100` widens it later.
   Steps: test board → 10 % → 100 %.
8. Keep `[env:ota]` (espota on the LAN) for development.

### 4.4 Bluetooth setup
- Advertise `RelaxPump-H-XXXX` (household) or `RelaxPump-P-XXXX` (PHE) so the app can show the type
  in the scan list.
- `rp-identity` answers `RP2;<id>;<claimCode>;<type>;<fw>`. The app still accepts `RP1;…` (old
  boards = household).

---

## 5. App (design: `reference/design-v3/`)

| File | Screen |
|---|---|
| `AppDevices.dc.html` | **Home.** No board → "Add your first device". One board → that module. Both → **Household / PHE** tabs. Household = today's Home. PHE = supply card (Water coming / Waiting for PHE water / No water now, flowing bar), Auto fill switch with reopen/close %, PHE lines with level ring and an OPEN/CLOSED valve button. Tweaks: household, phe, pheLines, supply. |
| `AppAddDevice.dc.html` | **Add device:** 1 Bluetooth scan (radar, boards with type badge) → 2 Wi-Fi (remembered for the next board) → 3 Connecting checklist (Bluetooth, Wi-Fi, cloud, linked to account) → 4 number of semi tanks / PHE lines + names (household also main tank sensor) → 5 Check wiring (sensors Found ✓, Test each valve; household also the pump) → 6 Done + "Add another device". |
| `AppDevice.dc.html` | **Account → My devices:** list with type badge, online, version, UPDATE badge. Detail: type (factory set, locked), ID, Wi-Fi, firmware, **Software update** card (version, notes, Update now → progress phases → Up to date ✓; disabled while the pump runs), Installer setup, Remove from my account. Tweaks: updateAvailable, pumpRunning. |

Behaviour:
1. Nothing assumes one board. Keep the selected module tab in storage.
2. Household screens (Tanks, Pump check, Usage, Installer setup with PIN) stay as v2 and act on the
   selected household board. PHE uses the same Installer setup (PIN) with the PHE shape.
3. Add device reuses today's BLE provisioning + claim; step 4–5 is the Installer setup in short form.
4. Notifications: PHE `flow_start` ("PHE water is coming"), `phe_full`, `overflow`, `sensor`.
5. Mock backend: household only, PHE only (1, 2, 5 lines), both, no boards; OTA available/running/failed.
6. Keep the approved dark theme, motion and press feedback (scale only).

---

## 6. Factory steps (per board)

1. `npm run new-device -- --type household|phe --board v3` in `firebase/` → `out/<ID>/` (nvs.csv, label).
2. `npm run factory-flash -- --id RP-XXXXXX --port COM5` → firmware + NVS image by USB.
3. Board boots, reports `info.type`, waits for Bluetooth setup. Stick the label on the box.

## 7. Website (`web/`) — same story as the app

Design source: `reference/website/` (updated 2026-11-16). Match it; keep the approved white theme,
buttons and motion.
- **Home:** hero line "Your pump tanks and PHE lines in one app — by hand or fully automatic.",
  check "Household + PHE". How it works 01 "Every tank and PHE line on your phone, anywhere.",
  04 "Add device, connect Wi-Fi, done." App screens gallery: Welcome, **Household**, **PHE**,
  Tanks, Usage, **Add device**, Account (`AppScreen.dc.html` has the new `phe` screen and the
  Household | PHE tabs). Product teaser: Household Controller, PHE Controller, Home Installation.
  Manual: "Relay K1 drives the contactor coil", "Sensor T1 and valve V1 are tank 1", app steps
  "Tap Add device → pick your board and Wi-Fi → set your tanks or PHE lines" (no QR).
- **Store:** products Household Controller, PHE Controller, Tank Kit, PHE Line Kit, Main Tank Kit,
  Pump Kit, Level Sensor, Solenoid Valve 12 V, Home Installation. Seed them in D1 (admin can edit).
- **Plan your kit:** "What do you have?" Pump + tanks | PHE lines | Both. Household part as before
  but max **5** tanks (one tank → Level Sensor instead of a Tank Kit); PHE part = PHE lines 1–5,
  no pump (result cards "PHE lines" + "Pump: None", zero-pressure valve note). Kit list adds
  PHE Controller + PHE Line Kit × lines. No PHE toggle, no 8 tanks anywhere.
- This replaces `docs/website-brief.md` §9 and `docs/flexible-system.md` §6 where they differ.

## 8. Not now
Flow meters, battery backup, board-to-board links.
