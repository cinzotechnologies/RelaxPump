# Realtime Database data model (v2 customizable system, 1–5 tanks)

Source of truth for the shape: `docs/flexible-system.md` §3. Types in the app:
`app/src/model/layout.ts` (config, validation, helpers) and `app/src/model/types.ts`.

```
devices/{deviceId}/                     deviceId = "RP-" + 6 hex, e.g. RP-3F2A9C
  info:   { name, fw, board: 'v1'|'v2', maxTanks: 5, ownerUid }
                                         admin creates; the device writes fw/board/maxTanks
                                         (board is a label: hand-wired board / PCB, same pins);
                                         the user sets ownerUid by claiming
  config: { tankCount: 1..5, low, high, maxRunMin,
            tanks: [ { name?, litres?, emptyCm, fullCm, heightFt? } ],   length = tankCount
            main?: { enabled, litres?, emptyCm?, fullCm?, minPct 5–40 } }
  state:  { online, lastSeen, rssi, ssid, pump, auto, msg, active: int|null,
            tanks: [ { pct, valve, ok } ],
            main: { pct, ok } | null,
            detected: { tanks: [bool × 5], main },       which sensor ports answer
            check: { run, rows: [ { i, pctMin, lpm|null, minToFull|null, slow } ] } | null }
  cmd:    { pump?, auto?, valve?: { i: 0..4, open }, pumpCheck?,
            test?: { port: 'V1'..'V5'|'PUMP', ms ≤ 3000 }, ts }
  events/{pushId}: { type, tank, ts, min?, auto? }
            type = full | low | pump_on | pump_off | dry_run | timeout | sensor |
                   main_low | board_error | check_done
            tank = tank index, or -1 for main tank / board events
  usage/{yyyy-mm-dd}: { litres, pumpMin, perTank: [ { litres, pumpMin } ] }   up to 5
users/{uid}: { name, phone, devices: { deviceId: true }, fcm: { token: true }, createdAt }
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
- No PHE line, no modes, no tanks without a sensor.

## Who may write what

| Path | Writer |
|---|---|
| `config` as a whole, `tankCount`, `tanks/{i}` (layout), `emptyCm`, `fullCm`, `heightFt`, `maxRunMin`, `main` | owner **with installer PIN** (or no PIN set yet) |
| `config/low`, `high`, `tanks/{i}/name`, `tanks/{i}/litres`, `main/litres` | owner (customer) |
| `info/fw`, `board`, `maxTanks` | device |
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
| Customer | `91XXXXXXXXXX@users.relaxpump.app` | phone + password; one account per controller, the family shares the login |
| Controller | `rp-3f2a9c@devices.relaxpump.app` | created by `new-device` with `emailVerified: true`; rules require it, so a look-alike sign-up cannot act as a device |

## Claiming a controller

The box QR is `RP1;<deviceId>;<PoP>;<claimCode>`.

1. The app computes `sha256("<deviceId>:<claimCode>")` (hex).
2. One multi-path update writes `claimAttempts/{id}/{uid}`, `devices/{id}/info/ownerUid` and
   `users/{uid}/devices/{id}`.
3. The rules accept `ownerUid` only when it is empty, equals the caller, and the attempt hash equals
   `claims/{id}/codeHash`. `claims` can never be read, so only someone holding the box code can claim.

The owner releases a controller by deleting `info/ownerUid`.

## Rules

Edit `firebase/scripts/build-rules.mjs` (not the JSON); `npm run build:rules` writes
`firebase/database.rules.json`. Tests: `firebase/test/rules.test.js` (`npm test` in `firebase/`,
runs the build first). `npm run deploy:rules` builds and deploys.
