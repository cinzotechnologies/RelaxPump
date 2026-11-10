# Realtime Database data model (v2 flexible system)

Source of truth for the shape: `docs/flexible-system.md` §5. Types in the app:
`app/src/model/layout.ts` (config, ports, validation, v1 → v2 reading) and `app/src/model/types.ts`.

```
devices/{deviceId}/                     deviceId = "RP-" + 6 hex, e.g. RP-3F2A9C
  info:   { name, fw, board: 'v1'|'v2', maxTanks,
            ports: { sensors, valves, phe, main }, ownerUid }
                                         admin creates; the device writes fw/board/maxTanks/ports;
                                         the user sets ownerUid by claiming
  config: { semi: [ { name?, litres?, emptyCm, fullCm, heightFt?,
                      sensor, valve, fillMin? } ],        1..maxTanks entries
            main: { enabled, sensor, litres?, emptyCm, fullCm, minPct },
            phe:  { enabled, probeMin, retryMin },
            mode: 'auto'|'phe'|'pump', low, high, maxRunMin }
  state:  { online, lastSeen, rssi, ssid, auto, msg,
            pump, phe, src: 'pump'|'phe'|null, active: int|null,
            semi: [ { pct|null, valve, ok } ],
            main: { pct|null, ok } | null,
            detected: { s: [bool × 8], main },           which sensor ports answer
            check: { run, rows: [ { i, pctMin, lpm|null, minToFull|null, slow } ] } }
  cmd:    { pump?, phe?, auto?, valve?: { i, open }, fill?: { i, src },
            test?: { port: 'V1'..'V8'|'PHE'|'PUMP', ms ≤ 3000 }, pumpCheck?, ts }
  events/{pushId}: { type, tank, ts, min?, auto? }
            type = full | low | pump_on | pump_off | dry_run | timeout | sensor |
                   phe_on | phe_off | phe_none | main_low | board_error | check_done
            tank = semi index, or -1 for main tank / board events
  usage/{yyyy-mm-dd}: { litres, pumpMin, pheLitres,
                        perTank: [ { litres, pumpMin, pheLitres } ] }
users/{uid}: { name, phone, devices: { deviceId: true }, fcm: { token: true }, createdAt }
claims/{deviceId}: { codeHash }                      admin only, never readable
claimAttempts/{deviceId}/{uid}: "<sha256 hex>"       write-only, used by the claim rule
installerPins/{deviceId}: { hash }                   never readable (see "Installer PIN")
pinAttempts/{deviceId}/{uid}: { hash, ts }           write-only, fresh (± 60 s) timestamp
pinChecks/{deviceId}/{uid}: ts                       write succeeds only with a valid PIN
```

## Per-tank rules (app, rules and firmware)

| Tank has | Behaviour |
|---|---|
| sensor + valve | Auto fills below `low`, stops at `high` |
| valve only | manual Fill for `fillMin` (1–120) minutes, not in Auto |
| sensor only | level shown; only allowed as the single tank (pump fills it directly) |
| neither | single tank only; pump on/off with a `fillMin` timer |

- With 2+ semi tanks every tank has a valve.
- No sensor → `fillMin` is required.
- Semi tank *n* always uses port S*n* and V*n*; the count is capped by `info.maxTanks`
  (= `ports.sensors`: 3 on board v1, 8 on board v2).
- `main.enabled` needs `ports.main`, `phe.enabled` needs `ports.phe`, `mode: 'phe'` needs PHE.

## Who may write what

| Path | Writer |
|---|---|
| `config` as a whole, `config/semi/{i}` (layout), `maxRunMin`, `main`, `phe` | owner **with installer PIN** (or no PIN set yet) |
| `config/low`, `high`, `mode`, `semi/{i}/name`, `semi/{i}/litres`, `main/litres` | owner (customer) |
| `config/semi`, `main`, `phe`, `mode` while they don't exist | device (one-time migration) |
| `info/fw`, `board`, `maxTanks`, `ports` | device |
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
- **Save:** one multi-path update of `config/*` (+ `installerPins/{id}` on the first setup or a PIN
  change), then the app deletes its attempt.
- **Forgot PIN:** CINZO runs `npm run reset-pin -- --id RP-XXXXXX` in `firebase/`.
- The PIN stops family members (who share the one account) from changing the wiring layout by
  mistake. It is 4 digits, so it is not strong security.

## Migration from v1

v1 config: `{ tankCount, low, high, maxRunMin, tanks: [{ emptyCm, fullCm, litres, name }] }`.

1. **App** (`normalizeConfig`) reads both shapes: without `semi`, the first `tankCount` entries of
   `tanks` become semi tanks with `sensor = valve = true`, `mode = 'pump'`, no PHE / main.
2. **Firmware v2**, on first connect, if `config/semi` is missing, writes `semi`, `mode`, `main`,
   `phe` once (rules allow the device only while they don't exist). `tankCount` and `tanks` stay
   for old app versions and are ignored afterwards.
3. The installer's first Save writes the full v2 config.

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
