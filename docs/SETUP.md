# RelaxPump — setup guide

## 1. Tools (once, on the PC)

| Tool | Why | Install |
|---|---|---|
| Node.js 22 LTS | app + scripts | https://nodejs.org |
| Git | code | https://git-scm.com |
| Java 17+ | Firebase emulator (rules tests) | https://adoptium.net |
| Expo Go (phone) | quick look at the UI, no Firebase/BLE | Play Store |
| EAS CLI | build the real app in the cloud | `npm i -g eas-cli` |
| VS Code + PlatformIO | flash the ESP32 | PlatformIO extension |

```bash
git clone https://github.com/cinzotechnologies/RelaxPump.git
cd RelaxPump/app && npm install
cd ../firebase && npm install
```

## 2. Firebase console (project `iotcinzo`) — done on 2026-11-07

1. Authentication → Sign-in method → **Email/Password** enabled.
2. Realtime Database in **asia-southeast1**, started locked.
3. Android app `com.cinzo.relaxpump` registered → `google-services.json` in `app/` (git-ignored).
4. Service account key at `D:\keys\iotcinzo-admin.json` (outside the repo).

Deploy the security rules (after the tests pass) — uses the service account key, no login:

```bash
cd firebase
npm test               # emulator tests for database.rules.json
npm run deploy:rules   # deployed 2026-11-08
```

## 3. See the app — Expo Go (simulator data)

**Any time, no PC needed:** open Expo Go (signed in as `cinzotechnologies`) → Projects → **relaxpump**,
or open `exp://u.expo.dev/db093452-b1ce-4449-b7a4-baee91a43ca4?channel-name=preview`.
Publish a new version after changes: `npm run update:preview -- --environment preview --message "what changed"`.

**Live while coding** (updates on every save):

```bash
cd app
npm run go             # same Wi-Fi as the phone
npm run go:tunnel      # if the phone is on another network
```

Open **Expo Go** on the phone and scan the QR code in the terminal.
Expo Go has no Firebase or Bluetooth code, so the app runs on a built-in simulator:

- Sign in with **98765 43210** / **relax123** (demo home), or sign up a new account
  and finish the Bluetooth setup (simulated) to get a demo controller.
- Demo layout: `EXPO_PUBLIC_MOCK_LAYOUT` = `<tanks 1–5>[,main]`, e.g. `1`, `2`, `5,main`.
  Default `3,main`.
- Installer setup in the simulator: the first time you choose a PIN; after that, enter it.

## 4. Real app on an Android phone — development build

React Native Firebase and BLE provisioning need a development build (not Expo Go).

```bash
cd app
eas login                          # Expo account
eas init                           # links the project (first time)
eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment development --environment preview --environment production
eas build --profile development --platform android
```

Install the APK from the link EAS gives, then:

```bash
npm start                          # dev server for the development build
```

Want a standalone APK to share? `eas build --profile preview --platform android`.

## 5. Add a controller (factory step)

```bash
cd firebase
npm run new-device                 # relay module (board 1, active LOW)
npm run new-device -- --board v2   # PCB v2 (MOSFETs, active HIGH); --id RP-3F2A9C to pick the id
```

Both boards take 1–5 tanks + MAIN with the same pins (`docs/wiring.md`). It creates the device login,
the claim hash and a default config (3 tanks, no main sensor), and writes
`firebase/out/<ID>/` (git-ignored): `secrets.h` (flash with it), `qr.png` (print on the box),
`label.txt`, `device.json`.

### Test without an ESP32

```bash
npm run fake-device -- --id RP-XXXXXX          # --fast fills 10x quicker (1–5 tanks, main tank)
```

Sign up in the app (development build), then link the fake controller to that phone number:

```bash
npm run link-device -- --id RP-XXXXXX --phone 9876543210
```

With a real board, the app links it itself: Bluetooth setup → scan `qr.png`.

## 6. Flash the ESP32

Copy `firebase/out/<ID>/secrets.h` to `firmware/include/secrets.h` (it holds `RP_BOARD 1|2`), then in
VS Code: PlatformIO → Upload, Monitor at 115200 (type `h` for the bench commands, see
`docs/wiring.md`). Wrong output polarity? Type `board 1` (relays) or `board 2` (PCB) in the monitor.
Relay test: `firmware/tools/ValveTest` (V1–V5).

Fill-logic tests on the PC (no board): `sh firmware/scripts/test-native.sh` (needs any C++17
compiler: g++, clang++ or `zig c++` via `CXX="zig c++"`), or `pio test -e native` with gcc.

Old configs (`tankCount` + `tanks`, no `main`) already fit v2: nothing to convert. A controller
still on the first firmware reports `maxTanks: 3`, and the rules then refuse more than 3 tanks —
flash v2 (fw 2.1.0) to use T4, T5 and MAIN.

## 7. First-time setup (customer)

1. Power the controller (LED blinks: waiting for Wi-Fi).
2. Install the app, **Sign up** with phone + password.
3. The Bluetooth sheet opens → **Set up device** → scan the box QR.
4. Pick the home Wi-Fi, type its password → **Connect**.
5. The controller goes online and is linked to the account, and **Installer setup** opens:
   1. Choose a 4-digit installer PIN (enter it twice). Keep it; family members need no PIN.
   2. Number of semi tanks, 1–5 (tank *n* uses port T*n*: sensor + valve V*n*). One tank = sensor
      only, the pump fills it directly.
   3. Per tank: name, size, height above the main tank.
   4. Main tank sensor (port MAIN): on/off and "stop the pump below x %".
   5. Check wiring: sensors show **Found ✓** or **No answer — check cable**; tap **Test** on each
      valve and the pump and listen for the click.
   6. Summary (tanks, sensors, valves, main, relays used x of 6) → **Save**. The app waits for the
      controller to confirm the new layout.

Later: **Account → Installer setup** (PIN) to change the wiring. **Add a tank:** buy a Tank Kit
(sensor + valve), wire it to the next free port, then Installer setup → tank count + 1 (from 1 to 2
tanks, tank 1 needs a valve too). Customers can change tank names, sizes and Start/Stop levels
without the PIN.
**Account → Pump check** measures each tank's fill speed (L/min, full in…, Slow warning).

The whole family can use one account: same phone number and password on every phone. Changing the
password signs the other phones out.

Changing router or password later: centre Bluetooth button → **Change Wi-Fi** (needs the box QR).

## 8. Support

- Forgot password (no SMS yet): `npm run reset-password -- --phone 9876543210 --password newpass123`.
- Forgot installer PIN: `npm run reset-pin -- --id RP-XXXXXX` (the next setup chooses a new PIN).
- Rules changed (v2, 1–5 tanks): run `npm run deploy:rules` in `firebase/` before using the v2 app
  with the real database, or Installer setup / customer edits cannot save.
- WhatsApp support link: `app/app.config.ts` → `extra.SUPPORT_WHATSAPP`.
