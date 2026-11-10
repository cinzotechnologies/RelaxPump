# RelaxPump — project brief for Claude Code

RelaxPump is a water-tank automation product, **engineered by CINZO** (Cinzo Technologies).
One ESP32 controller per home: one ultrasonic sensor and one solenoid valve per tank, one
pump switched by relay + contactor. A mobile app shows the tank levels and runs the pump,
by hand or automatically.

Repo: `https://github.com/cinzotechnologies/RelaxPump` (monorepo, branch `main`).
Firebase project id: `iotcinzo` (Spark / free plan for now).

Everything under `reference/` is source material. Read it before you build anything:

| File | What it is |
|---|---|
| `reference/design/Main.dc.html` | **The approved UI.** Every screen, colour, size, animation and state. Build the app to match it exactly (see "UI rules"). |
| `reference/design/Logo.dc.html` | Logo options. The app uses option **A · Level ring** (ring gauge with water inside). |
| `reference/design/Theme.dc.html` | Colour tokens. |
| `reference/firmware/TankController.ino` | Working ESP32 sketch (local web page version). Reuse its pins, sensor maths and pump-safety logic. Comments are in Mizo. |
| `reference/firmware/ValveTest.ino` | Relay/valve test sketch. Keep as `firmware/tools/ValveTest`. |
| `reference/hardware/Smart_Water_Tank_Project_Plan.pdf` | Hardware plan and wiring. |

The `.dc.html` files are a design format: HTML with inline styles, `{{holes}}` filled from
`renderVals()` in the `<script>` at the bottom, `<sc-if>` / `<sc-for>` for conditions and lists.
Read the markup for layout and the script for behaviour and computed styles.

---

## 1. Repo layout

```
RelaxPump/
  app/                Expo (React Native) app
  firmware/           PlatformIO project for the ESP32 controller
    tools/ValveTest/  relay test sketch
  firebase/           database.rules.json, firebase.json, seed/test scripts
  docs/               setup guide, data model, wiring notes (copy the PDF here)
  reference/          keep as-is (design + legacy code)
  README.md
  .gitignore          node_modules, .expo, android/, ios/, google-services.json,
                      GoogleService-Info.plist, firmware/.pio, secrets.h, *.keystore, .env*
```

The repo is **public**. Never commit secrets: `google-services.json`, `GoogleService-Info.plist`,
`firmware/include/secrets.h`, keystores, `.env`. Commit `*.example` versions instead.

## 2. Tech stack

**App**
- Expo SDK (latest stable) + TypeScript (strict), **Expo Router** (file-based routes).
- **Development build** (`expo-dev-client`) — needed for BLE and React Native Firebase. Not Expo Go.
- **@react-native-firebase/app, /auth, /database, /messaging** (+ config plugins).
- BLE provisioning: **`@orbital-systems/react-native-esp-idf-provisioning`** (wraps Espressif's
  official provisioning libs; matches the ESP32 `WiFiProv` BLE scheme, security 1 + PoP).
  If it cannot build with the current Expo SDK, fall back to `react-native-ble-plx` with the
  Espressif protocomm protocol and say so.
- UI: **react-native-reanimated** (all motion), **react-native-svg** (tank, waves, rings, logo,
  icons), **expo-linear-gradient**, **expo-blur**, **react-native-gesture-handler**,
  **@gorhom/bottom-sheet** (all sheets), **expo-haptics** (light tap on toggles).
- Fonts via **expo-font**: Inter (300–700) and Outfit (300, 500, 600). On iOS use the system
  font where the design says `-apple-system`.
- State: **zustand**. Forms: **react-hook-form + zod**.
- Camera QR scan for the device PoP code: **expo-camera**.
- Notifications: **expo-notifications** (local) now; FCM push later (needs Blaze, see §6).
- Lint/format: ESLint (expo config) + Prettier. Tests: Jest + React Native Testing Library for
  stores and the pump-safety helpers.
- Builds: **EAS Build** (`eas.json` with `development`, `preview` (APK), `production`).
- Android package / iOS bundle id: `com.cinzo.relaxpump`. App name: `RelaxPump`.

**Firmware**
- **PlatformIO**, Arduino framework, board `esp32dev`, partition `huge_app.csv`.
- **WiFiProv** (BLE scheme, `WIFI_PROV_SECURITY_1`, PoP) for first-time Wi-Fi setup.
  Use `WIFI_PROV_SCHEME_HANDLER_FREE_BTDM` so BLE memory is freed after setup.
- **FirebaseClient** by mobizt (async, RTDB + Auth) for cloud. **ArduinoJson**.
- **Preferences** for config, **ArduinoOTA** for local updates, task watchdog enabled.

**Backend**
- Firebase **Authentication** (Email/Password provider — see §5).
- Firebase **Realtime Database** (region `asia-southeast1`) for live state and commands.
- Security rules in `firebase/database.rules.json`, deployed with `firebase-tools`, tested with
  the **Firebase Emulator Suite** (`@firebase/rules-unit-testing`).

## 3. UI rules — match the design exactly

- Dark theme only. Tokens: base `#021A20`, card `#0A242B`, deep card `#06171C`, teal `#035360`,
  light teal `#037788`, glow `#7FE3EC`, text `#E8F6F7`, muted `#8FB3B8`, faint `#6E8A8F`,
  warning `#F59E0B`, danger text `#FCA5A5`. Put them in `app/src/theme/tokens.ts`; no hard-coded
  colours in screens.
- Copy sizes, radii, spacing, font weights and gradients from `Main.dc.html` (the design frame is
  390 × 844; scale with the screen width, keep it pixel-close on a 390-wide phone).
- English UI text only, exactly as written in the design. Keep text minimal.
- Motion: screen slide (forward from right, back from left, 420 ms, cubic-bezier(.22,1,.36,1)),
  staggered fade-up on entry, springy toggles, press scale 0.96, animated water waves (two layers,
  opposite directions), filling level transitions, bottom sheets sliding up. Respect "reduce motion".
- Recreate every SVG (tank on welcome, level-ring logo, icons) with react-native-svg from the paths
  in the design files.

**Screens (from the design)**
1. **Welcome** — floating tank with animated water, `RelaxPump` wordmark (Outfit; "Relax" 300 in
   `#7FE3EC`, "Pump" 600 white), "Tanks that fill themselves.", gradient **Get started** pill with
   dark arrow circle, footer "Engineered by **CINZO**" with fading lines.
2. **Auth** — back button, segmented **Sign in / Sign up**, Name (sign up only), +91 phone
   (10 digits), password with show/hide, inline errors, spinner, "Forgot password?".
   No "I have an account" link.
3. **Home** — teal gradient header: logo tile (level-ring logo on white tile) → back to Welcome,
   "Welcome back" + name, **notification bell** (red dot when unread) and **avatar** with initials
   (conic white/teal ring) → Account. Dark level card with animated waves at the average level,
   status ("Filling Tank 2" / "Auto" / "Idle"), small "Start x% / Stop y%" chips.
   Four tiles: Pump, Auto, Tanks, Usage (active = filled glow, others outlined). Tank list with
   progress rings, % and optional litres ("520 / 1,000 L").
4. **Tanks** — Edit button, one card per tank (3 per row; taller gauges when ≤3 tanks) with wave
   fill, dashed start/stop lines, % and litres, valve Open/Closed button. Auto card: toggle and two
   sliders (Start below 5–80 %, Stop at 20–100 %, kept ≥10 apart). Warning banner. Start/Stop pump.
5. **Usage** — Water/Pump segmented control, total, 7-day bar chart (tap a bar for a tooltip),
   per-tank bars.
6. **Account** — avatar, name, phone, Change password (sheet), Tanks, Sign out, version footer.
7. **Sheets** — Your tanks (count stepper 1…`maxTanks`, optional litres per tank), Change password,
   Notifications list, **Bluetooth setup** (status → searching → found → choose Wi-Fi + password
   → connecting → online).
8. **Bottom nav** — 5 items: Home, Tanks, centre **Bluetooth** button, Usage, + (tanks sheet).
   The centre button sits fixed in the middle (two equal halves either side), raised, dark with a
   teal outline; it turns teal with a glow ring only while its sheet is open. Nav has a teal outline.

Bluetooth is used **only for first-time setup** (and when the user changes router/password): the
app sends the home Wi-Fi name + password to the ESP32 over BLE. All daily control goes through
Wi-Fi + Firebase, so it works from anywhere. After sign up with no device, open the Bluetooth setup
flow automatically. Add a QR scan step for the device PoP code (sticker on the box).

## 4. Data model (Realtime Database)

```
devices/{deviceId}/
  info:   { name, fw, maxTanks, ownerUid }          // ownerUid set on claim
  state:  { online, lastSeen, rssi, ssid, pump, auto, msg,
            tanks: [{ pct, valve, ok }] }            // written by the device every 3 s or on change
  config: { tankCount, low, high, maxRunMin,
            tanks: [{ emptyCm, fullCm, litres|null }] }  // written by the app, read by the device
  cmd:    { pump: true|false, valve: {i, open}, ts } // app writes, device applies then deletes
  events/{pushId}: { type: "full"|"low"|"pump_on"|"pump_off"|"dry_run"|"timeout"|"sensor", tank, ts }
  usage/{yyyy-mm-dd}: { litres, pumpMin, perTank: [...] }
users/{uid}: { name, phone, devices: { deviceId: true }, createdAt }
claims/{deviceId}: { codeHash }                       // written once at factory, never readable
```

Rules: a user can read/write `devices/{id}` only if `info/ownerUid == auth.uid`. A device account
can write only its own `state`, `events`, `usage`, read its `config` and `cmd`, delete `cmd`.
Claiming: user may set `info/ownerUid` only while it is empty and when the submitted claim code
hashes to `claims/{id}/codeHash`. Write emulator tests for all of this.

## 5. Auth (works on the free Spark plan)

The design uses phone + password. Firebase has no phone+password provider, so use
**Email/Password** with a synthetic email: `91XXXXXXXXXX@users.relaxpump.app`. Store the real
name and phone in `users/{uid}`. Change password = reauthenticate + `updatePassword`.
"Forgot password?" needs SMS OTP (Firebase Phone Auth, which needs the Blaze plan): build the
screen behind a feature flag `ENABLE_PHONE_OTP=false`; while off, show "Contact support" with a
WhatsApp link placeholder. Device accounts also use Email/Password:
`{deviceId}@devices.relaxpump.app`, password in `firmware/include/secrets.h` (git-ignored).

## 6. Things that need the Blaze plan later (stub them, do not block)

Cloud Functions (push notifications on new `events`, daily usage roll-up, claim-code checks) and
Phone OTP. Put function code in `firebase/functions/` but leave it undeployed; document in
`docs/blaze-upgrade.md`. Until then the app shows events in the Notifications sheet and fires a
local notification while the app is open.

## 7. Firmware behaviour

- Pins (from `TankController.ino`): Trig G16/G18/G23, Echo G17/G19/G4 (through 1k/2k dividers),
  valve relays G25/G26/G27, pump contactor relay G33. Relays are **active LOW**; write HIGH before
  `pinMode(OUTPUT)` at boot. `MAX_TANKS = 3` for this board; report it in `info/maxTanks`.
- Sensor maths, median filtering and fail counter: reuse from the legacy sketch.
- **Safety (keep exactly):** open the valve first, wait 2 s, then start the pump; stop the pump,
  wait 3 s, then close the valve; never run the pump with all valves closed; one tank fills at a time;
  max run time (config, default 30 min); dry-run stop if the level rises < 2 % in 5 min;
  60 s cooldown before restart; stop on sensor failure; everything off if Wi-Fi/Firebase is lost
  for more than the max run time while the pump is on.
- Auto: if a tank is below `low`, fill the lowest one until `high`, then the next.
- No Wi-Fi saved → start BLE provisioning, service name `RelaxPump-XXXX` (last 4 of MAC), PoP from
  `secrets.h`. Hold the BOOT button 5 s → erase Wi-Fi and re-provision. Status LED patterns.
- Online: Firebase auth as the device user, stream `config` and `cmd`, push `state` every 3 s
  (and on change), write `events`, add to `usage` each time the pump stops.
- Serial commands from the legacy sketch stay for bench testing.

## 8. How to work

1. Make a plan with milestones and show it to me before writing code. Use a todo list.
2. Order: repo scaffold → theme + components → all screens with mock data (match the design) →
   Firebase auth + RTDB → BLE provisioning → firmware → rules + emulator tests → docs.
3. After each milestone: run typecheck, lint and tests, then `git commit` with a clear message and
   `git push origin main`.
4. Ask me before anything that costs money, changes the Firebase project, or deletes files.
5. When something needs me (Firebase console clicks, `google-services.json`, flashing the board,
   `eas login`), stop and give short numbered steps.
6. Write `docs/SETUP.md`: install tools, Firebase console steps, run the app on an Android phone,
   flash the ESP32, first-time setup.

---

## 9. Website + admin panel (`web/`)

The public website, store and admin panel are a separate part of this repo: a Next.js app on
Cloudflare Workers (OpenNext) with Cloudflare D1 + R2. Everything about it — design files in
`reference/website/`, theme, sections, data, admin, the forgot-password → WhatsApp flow and the
milestones — is in **`docs/website-brief.md`**. Read it before touching `web/`.

---

## 10. v2 customizable system (1–5 semi tanks)

One controller now supports **1–5 semi tanks**. Each tank has a sensor + valve pair; a single tank
needs only a sensor (no valve). 6 relays: 5 valves + pump. Optional main-tank sensor. No PHE line.
The firmware is flashed once; the app's installer setup (PIN) sets how many tanks are connected.
**`docs/flexible-system.md` replaces the fixed 3-tank parts of §4 and §7** (data model, pins,
behaviour), and `reference/design-v2/` holds the new app screens. Read both before changing the
firmware, the app's tank screens, the rules or the docs.
