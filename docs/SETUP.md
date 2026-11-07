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

Deploy the security rules (after the tests pass):

```bash
cd firebase
npm test               # emulator tests for database.rules.json
npx firebase login     # once
npm run deploy:rules
```

## 3. See the app now — Expo Go (simulator data)

```bash
cd app
npm run go             # same Wi-Fi as the phone
npm run go:tunnel      # if the phone is on another network
```

Open **Expo Go** on the phone and scan the QR code in the terminal.
Expo Go has no Firebase or Bluetooth code, so the app runs on a built-in simulator:

- Sign in with **98765 43210** / **relax123** (demo home with 3 tanks), or sign up a new account
  and finish the Bluetooth setup (simulated) to get a demo controller.

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
npm run new-device                 # or: npm run new-device -- --id RP-3F2A9C --tanks 3
```

It creates the device login, the claim hash and default config, and writes
`firebase/out/<ID>/` (git-ignored): `secrets.h` (flash with it), `qr.png` (print on the box),
`label.txt`, `device.json`.

### Test without an ESP32

```bash
npm run fake-device -- --id RP-XXXXXX          # --fast fills 10x quicker
```

In the app: sign up → Bluetooth setup opens → scan `qr.png`. The BLE search needs a real controller;
to link the fake one, use the app with the QR when a board is present, or claim it from the
Firebase console by hand during testing.

## 6. Flash the ESP32

Copy `firebase/out/<ID>/secrets.h` to
`firmware/include/secrets.h`, then in VS Code: PlatformIO → Upload, Monitor at 115200.
Relay test: `firmware/tools/ValveTest`.

## 7. First-time setup (customer)

1. Power the controller (LED blinks: waiting for Wi-Fi).
2. Install the app, **Sign up** with phone + password.
3. The Bluetooth sheet opens → **Set up device** → scan the box QR.
4. Pick the home Wi-Fi, type its password → **Connect**.
5. The controller goes online and is linked to the account. Set tank count and sizes in **Your tanks**.

Changing router or password later: centre Bluetooth button → **Change Wi-Fi** (needs the box QR).

## 8. Support

- Forgot password (no SMS yet): `npm run reset-password -- --phone 9876543210 --password newpass123`.
- WhatsApp support link: `app/app.config.ts` → `extra.SUPPORT_WHATSAPP`.
