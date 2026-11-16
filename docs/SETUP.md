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

## 5. Add a controller (factory step, v3)

Each module is its own board: **Household** (pump + 1–5 semi tanks) or **PHE** (1–5 PHE lines, no
pump). The type is set here, once, and stored on the board (`docs/two-module-system.md` §6).

```bash
cd firebase
npm run new-device -- --type household --board v3   # Rev C board (8 relays, active HIGH)
npm run new-device -- --type phe --board v3
npm run new-device -- --type household              # hand-wired relay module (board v1, active LOW)
#   --board v2 = PCB v2 (active HIGH); --id RP-3F2A9C to pick the id
```

It creates the device login, the claim hash, `info.type` and a default config (household: 3 tanks;
PHE: 1 line, reopen 85 %, close 95 %), and writes `firebase/out/<ID>/` (git-ignored): `nvs.csv`
(the board's identity for the flash below), `label.txt` + `qr.png` (box label), `device.json`,
`secrets.h` (dev fallback only).

### Test without an ESP32

```bash
npm run fake-device -- --id RP-XXXXXX          # --fast fills 10x quicker (1–5 tanks, main tank)
```

Sign up in the app (development build), then link the fake controller to that phone number:

```bash
npm run link-device -- --id RP-XXXXXX --phone 9876543210
```

With a real board, the app links it itself: Home → **Add device**.

Simulator (no Firebase, no board): `EXPO_PUBLIC_BACKEND=mock` plus
`EXPO_PUBLIC_MOCK_FLEET=both|household|phe|none`, `EXPO_PUBLIC_MOCK_PHE=1..5` (lines),
`EXPO_PUBLIC_MOCK_SUPPLY=off`, `EXPO_PUBLIC_MOCK_OTA=available|running|failed|none`.

## 6. Flash the ESP32 (USB, factory)

One firmware build for every board; the board's identity goes into its NVS partition:

```bash
node firmware/scripts/make-project-h.mjs          # once: shared Firebase API key → include/project.h
cd firebase
npm run factory-flash -- --id RP-XXXXXX --port COM5             # 4 MB DevKit (min_spiffs, 2 OTA slots)
npm run factory-flash -- --id RP-XXXXXX --port COM5 --env revc  # Rev C, 8 MB module (2 × 3 MB slots)
#   --dry-run: build + NVS image only, prints the esptool command; --no-build: flash what is built
```

It builds `env:release` (no secrets inside), makes the NVS image from `nvs.csv` (Node, same bytes as
Espressif's `nvs_partition_gen`), and writes bootloader, partition table, otadata, firmware and NVS
in one esptool run. The board restarts as `RelaxPump-H-XXXX` / `RelaxPump-P-XXXX` and waits for
Bluetooth setup. Check: `pio device monitor -b 115200`, type `id` → id, type, flash size.

**Boards made before v3** (e.g. RP-D11C2C) have no `nvs.csv`: pass `--type household --board v1`
and it is built from `device.json`. This is the **last cable flash** for them (the new partition
table has the second app slot); after it, updates come over the air. The whole NVS is rewritten, so
the board forgets its Wi-Fi: add it again in the app (Add device keeps its layout).

Development: `pio run -t upload -e esp32dev` still works with `include/secrets.h` as a fallback
(boards with an NVS identity ignore it). Serial bench commands: type `h` (`docs/wiring.md`).
Wrong output polarity? `board 1|2|3`. Wrong module type at the factory? `type household|phe`.

Fill-logic tests on the PC (no board): `sh firmware/scripts/test-native.sh` (Household and PHE
engines; needs any C++17 compiler: g++, clang++ or `zig c++` via `CXX="zig c++"`), or
`pio test -e native` with gcc.

Software updates over the air: `docs/release.md` § Firmware update (OTA).

## 7. First-time setup (customer)

1. Power the board (LED blinks: waiting for Wi-Fi).
2. Install the app, **Sign up** with phone + password.
3. Home → **Add your first device** (later: **+ Add device**):
   1. The app scans Bluetooth and lists boards with a **HOUSEHOLD** or **PHE** badge. Tap yours.
   2. Wi-Fi name + password → **Connect** (2.4 GHz; the name is remembered for the next board).
   3. Checklist: Bluetooth ✓ → Wi-Fi ✓ → RelaxPump cloud ✓ → linked to your account ✓ (only if the
      board has no owner yet; during setup anyone within Bluetooth range could do this first).
   4. Number of semi tanks (household, + main tank sensor) or PHE lines, and their names.
   5. Check wiring: sensors **Found ✓**, **Test** each valve (and the pump) → **Save**.
   6. Done → **Add another device**, or Go to Home.
4. Both modules on one account: Home shows **Household | PHE** tabs (the last tab is remembered).

**Installer setup** (Account → Installer setup / PHE setup, or My devices → a board → Installer
setup; 4-digit PIN, chosen on the first use): household tanks (count, name, size, height above the
main tank, sensor distances), main tank sensor, wiring check; PHE lines (count, name, size, sensor
distances), reopen / close levels, valve check. The app waits for the board to confirm.

**Add a tank / line:** buy a Tank Kit or PHE Line Kit (sensor + valve), wire it to the next free
port (T*n* + V*n*), then Installer setup → count + 1 (household from 1 to 2 tanks: tank 1 needs a
valve too). Customers change names, sizes and levels without the PIN.
**Account → Pump check** (household) measures each tank's fill speed.

**Account → My devices:** every board with type, online, firmware, **UPDATE** badge. A board's page
has the **Software update** card (Update now → Downloading → Checking → Installing → Restarting →
Up to date ✓; off while the pump runs) and **Remove from my account**.

The whole family can use one account: same phone number and password on every phone. Changing the
password signs the other phones out.

Changing router or password later: hold BOOT 5 s on the board, then Home → + Add device (the board
keeps its owner and layout).

## 8. Support

- Forgot password (no SMS yet): `npm run reset-password -- --phone 9876543210 --password newpass123`.
- Forgot installer PIN: `npm run reset-pin -- --id RP-XXXXXX` (the next setup chooses a new PIN).
- Rules changed (v3: info.type, PHE config/cmd, cmd.ota, firmware/stable): run `npm run deploy:rules`
  in `firebase/` before using the v3 app or firmware with the real database.
- WhatsApp support link: `app/app.config.ts` → `extra.SUPPORT_WHATSAPP`.
