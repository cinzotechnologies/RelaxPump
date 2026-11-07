# Realtime Database data model

```
devices/{deviceId}/                     deviceId = "RP-" + 6 hex, e.g. RP-3F2A9C
  info:   { name, fw, maxTanks, ownerUid }           admin creates; user sets ownerUid by claiming
  state:  { online, lastSeen, rssi, ssid, pump, auto, msg,
            tanks: [{ pct, valve, ok }] }            device writes every 3 s and on change
  config: { tankCount, low, high, maxRunMin,
            tanks: [{ emptyCm, fullCm, litres }] }   owner writes, device reads (litres 0 = unknown)
  cmd:    { pump?, valve?: { i, open }, auto?, ts }  owner writes, device applies then deletes
  events/{pushId}: { type, tank, ts, min?, auto? }   device appends; type = full | low | pump_on |
                                                     pump_off | dry_run | timeout | sensor
  usage/{yyyy-mm-dd}: { litres, pumpMin,
                        perTank: [{ litres, pumpMin }] }  device adds each time the pump stops
users/{uid}: { name, phone, devices: { deviceId: true }, createdAt }
claims/{deviceId}: { codeHash }                      admin only, never readable
claimAttempts/{deviceId}/{uid}: "<sha256 hex>"       write-only, used by the claim rule
```

`cmd.auto` is an addition to the original brief: the Auto toggle is a command, the device keeps it
in flash and reports it in `state.auto`.

## Accounts

| Who | Firebase Auth email | Notes |
|---|---|---|
| Customer | `91XXXXXXXXXX@users.relaxpump.app` | phone + password in the app |
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

`firebase/database.rules.json`, tested by `firebase/test/rules.test.js` (`npm test` in `firebase/`).
