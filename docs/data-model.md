# Realtime Database data model (v3: Household + PHE modules, many boards per account, OTA)

Source of truth for the shape: `docs/flexible-system.md` §3 (Household) and
`docs/two-module-system.md` §3 (PHE, OTA — it wins where they differ). Types in the app:
`app/src/model/layout.ts` (household config), `app/src/model/phe.ts` (PHE config),
`app/src/model/types.ts` and `app/src/model/state.ts` (reading state/info/firmware).

```
devices/{deviceId}/                     deviceId = "RP-" + 6 hex, e.g. RP-3F2A9C
  info:   { name, fw, board: 'v1'|'v2'|'v3', maxTanks: 5, ownerUid,
            type: 'household'|'phe', flash: 4|8|16 }
                                         admin creates (new-device writes type); the device
                                         writes fw/board/maxTanks/type/flash. type is set at the
                                         factory and can never change (missing = household).
                                         board: v1 hand-wired relays (active LOW), v2 PCB,
                                         v3 Rev C (8 relays, K7/K8 spare). User sets ownerUid by claiming.
  config: household → { tankCount: 1..5, low, high, maxRunMin,
                        tanks: [ { name?, litres?, emptyCm, fullCm, heightFt? } ],   length = tankCount
                        main?: { enabled, litres?, emptyCm?, fullCm?, minPct 5–40 } }
          phe       → { tankCount: 1..5 (= PHE lines), low: reopen 50–95 (85), high: close 60–100 (95),
                        tanks: [ { name?, litres?, emptyCm, fullCm } ] }        no main/maxRunMin/heightFt
  state:  household → { online, lastSeen, rssi, ssid, pump, auto, msg, active: int|null,
                        tanks: [ { pct, valve, ok } ],
                        main: { pct, ok } | null,
                        detected: { tanks: [bool × 5], main },       which sensor ports answer
                        cm: [cm|null × 6],                           live distances T1–T5, MAIN
                        check: { run, rows: [ { i, pctMin, lpm|null, minToFull|null, slow } ] } | null }
          phe       → { online, lastSeen, rssi, ssid, auto, msg, detected, cm,
                        tanks: [ { pct, valve, ok, rising } ],       rising = up ≥ 2 % in 10 min
                        supply: 'flowing'|'none'|'unknown' }
          both      → fwAvailable: 'x.y.z' | null                    this board may install it
                      ota: { phase: download|verify|install|restart|done|failed, pct, to, err? } | null
  cmd:    household → { pump?, auto?, valve?: { i: 0..4, open }, pumpCheck?,
                        test?: { port: 'V1'..'V5'|'PUMP', ms ≤ 3000 }, wifiReset?, ota?, ts }
          phe       → { auto?, valve?: { i, open }, test?: { port: 'V1'..'V5', ms ≤ 3000 },
                        wifiReset?, ota?, ts }                       pump/pumpCheck/PUMP refused
          ota       → { version: 'x.y.z' }                           must equal firmware/stable/version
  events/{pushId}: { type, tank, ts, min?, auto? }
            household: full | low | pump_on | pump_off | dry_run | timeout | sensor |
                       main_low | board_error | check_done
            phe:       flow_start | flow_stop | phe_full | overflow | sensor
            both:      ota_done | ota_failed
            tank = tank / line index, or -1 for main tank / board / supply events
  usage/{yyyy-mm-dd}: household { litres, pumpMin, perTank: [ { litres, pumpMin } ] }   up to 5
                      phe       { litres, perTank: [ { litres } ] }    litres received per line
firmware/stable: { version, url, sha256, sig, size, minFw, rollout: 0–100, date, notes: [..] }
                                         written by firmware/scripts/release.mjs (admin);
                                         any signed-in user and every device may read it
users/{uid}: { name, phone, devices: { deviceId: true, … }, fcm: { token: true }, createdAt }
                                         one account, any number of boards (both types)
claims/{deviceId}: { codeHash }                      admin only, never readable
claimAttempts/{deviceId}/{uid}: "<sha256 hex>"       write-only, used by the claim rule
installerPins/{deviceId}: { hash }                   never readable (see "Installer PIN")
pinAttempts/{deviceId}/{uid}: { hash, ts }           write-only, fresh (± 60 s) timestamp
pinChecks/{deviceId}/{uid}: ts                       write succeeds only with a valid PIN
```

## Layout rules (app, rules and firmware)

- 1–5 semi tanks; tank *n* uses port T*n* (sensor) and relay V*n* (valve).
- **Valves are implied:** `tankCount ≥ 2` → every tank has a valve; `tankCount == 1` → no valve,
  the pump fills the tank directly (V1 unused).
- `tanks` has exactly `tankCount` entries; `tankCount ≤ info.maxTanks` (old 3-tank firmware
  reports 3, v2 firmware reports 5).
- Main tank sensor (port MAIN) optional: the pump never starts, and stops, below `main.minPct`.
- No tanks without a sensor.

PHE board (`info.type = 'phe'`):
- 1–5 PHE lines; line *n* = sensor T*n* on its tank + valve V*n* on its pipe, **always** (also with
  one line). No pump, no main tank. Lines are independent; any number of valves may be open.
- Auto opens a line's valve below `low` (reopen) and closes it at `high` (close), at least 5 apart.
  A valve opened by hand still closes at `high`. Sensor lost → valve closed + event `sensor`.
- The rules pick the household or the PHE shape from `info.type`.

## Who may write what

| Path | Writer |
|---|---|
| `config` as a whole, `tankCount`, `tanks/{i}` (layout), `emptyCm`, `fullCm`, `heightFt`, `maxRunMin`, `main` | owner **with installer PIN** (or no PIN set yet) |
| `config/low`, `high`, `tanks/{i}/name`, `tanks/{i}/litres`, `main/litres` | owner (customer) |
| `info/fw`, `board`, `maxTanks`, `flash` | device |
| `info/type` | device or `new-device`, **once** (never changes afterwards) |
| `cmd/ota` | owner, only with `version == firmware/stable/version` |
| `firmware/stable` | admin only (`release.mjs`); readable by signed-in users and devices |
| `state`, `events` (append-only), `usage` | device |
| `cmd` | owner writes, device deletes |

## Installer PIN

The spec put `installerPinHash` in `config`, but the owner can read all of `devices/{id}` and
RTDB read rules cannot be taken away deeper in the tree. So the hash lives in
`installerPins/{id}` (`.read: false`).

- Hash = `sha256("<deviceId>:pin:<4 digits>")`, hex.
- **Check a PIN:** write `pinAttempts/{id}/{uid} = { hash, ts: now }`, then write
  `pinChecks/{id}/{uid} = now`. The second write succeeds only when the attempt matches (or no PIN
  is set yet → first setup). An attempt is valid for 15 minutes.
- **Save:** one multi-path update of `config` (+ `installerPins/{id}` on the first setup or a PIN
  change), then the app deletes its attempt.
- **Forgot PIN:** CINZO runs `npm run reset-pin -- --id RP-XXXXXX` in `firebase/`.
- The PIN stops family members (who share the one account) from changing the wiring layout by
  mistake. It is 4 digits, so it is not strong security.

## Older data

v1 controllers already use this shape (`tankCount` + `tanks`, no `main`), so nothing needs to be
migrated: a missing `main` means "no main tank sensor", missing `name`/`litres`/`heightFt` mean
unknown. The earlier 8-tank / PHE draft (`semi`, `phe`, `mode`, `info.ports`) was never deployed
and is rejected by the rules.

## Accounts

| Who | Firebase Auth email | Notes |
|---|---|---|
| Customer | `91XXXXXXXXXX@users.relaxpump.app` | phone + password; **one account, many controllers** (Household and PHE boards); the family shares the login |
| Controller | `rp-3f2a9c@devices.relaxpump.app` | created by `new-device` with `emailVerified: true`; rules require it, so a look-alike sign-up cannot act as a device |

## Claiming a controller

No QR. During Bluetooth setup (security 1, PoP `relaxpump-ble-v1` shared by all controllers) the app
reads the custom endpoint `rp-identity`, which answers `RP2;<deviceId>;<claimCode>;<type>;<fw>` (v3;
boards before v3 answer `RP1;<deviceId>;<claimCode>` and are household). The claim code lives in
the board's NVS since v3 (`factory-flash`), in `secrets.h` before. So anyone within Bluetooth range while the controller is in setup can claim it, if
it has no owner yet.

1. The app computes `sha256("<deviceId>:<claimCode>")` (hex).
2. One multi-path update writes `claimAttempts/{id}/{uid}`, `devices/{id}/info/ownerUid` and
   `users/{uid}/devices/{id}`.
3. The rules accept `ownerUid` only when it is empty, equals the caller, and the attempt hash equals
   `claims/{id}/codeHash`. `claims` can never be read, so only someone who got the code from the controller can claim.

The owner releases a controller by deleting `info/ownerUid` and `users/{uid}/devices/{id}` in one
update (app: Account → My devices → Remove from my account). Its box code then works for the next owner.

## Rules

Edit `firebase/scripts/build-rules.mjs` (not the JSON); `npm run build:rules` writes
`firebase/database.rules.json`. Tests: `firebase/test/rules.test.js` (`npm test` in `firebase/`,
runs the build first). `npm run deploy:rules` builds and deploys.
