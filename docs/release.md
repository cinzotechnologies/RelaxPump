# RelaxPump — release checklist (Android first)

Everything runs on **free plans**: Firebase **Spark** + Cloudflare (Workers, D1, R2, Access).
No Blaze plan, no card on Google Cloud. Push notifications and cleanup run on the Cloudflare
cron Worker `relaxpump-jobs` instead of Cloud Functions.

| Piece | Where | Status |
|---|---|---|
| App users, tanks, controller data | Firebase `iotcinzo` (Auth + Realtime DB) | rules deployed |
| Public site, privacy, delete account | `relaxpump.cinzotechnologies.workers.dev` | live |
| Admin (content, media, password requests) | `relaxpumpadmin.cinzotechnologies.workers.dev` | live, Cloudflare Access |
| Push notifications + daily cleanup | Worker `relaxpump-jobs` (cron every minute / 03:00 IST) | needs the secret below |

## 1. Secrets you set by hand (keys never go in git or chat)

Run in `web/` (Git Bash). Each prints `Success! Uploaded secret …`.

```sh
# a) Firebase service account → admin Worker (password resets) and jobs Worker (push, cleanup)
node -e "process.stdout.write(JSON.stringify(require('D:/keys/iotcinzo-admin.json')))" | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --env admin
node -e "process.stdout.write(JSON.stringify(require('D:/keys/iotcinzo-admin.json')))" | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT -c jobs/wrangler.jsonc

# b) Firebase Web API key → public site (account deletion page)
node -e "process.stdout.write(require('../app/google-services.json').client[0].api_key[0].current_key)" | npx wrangler secret put FIREBASE_WEB_API_KEY
```

Already done: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (admin Worker); `GOOGLE_SERVICES_JSON` (EAS,
preview + production).

Check in Firebase console → Project settings → **Cloud Messaging**: "Firebase Cloud Messaging
API (V1)" must say **Enabled** (needed for push).

## 2. Admin access for a second person

Cloudflare Access allows "Cloudflare account members". To let `hacheh976@gmail.com` in:
Cloudflare → Manage account → **Members → Invite** (role: Administrator or a read-only role), or
edit the Access policy in Zero Trust → Access → Applications → relaxpumpadmin → add an
**Emails** rule. The email must also be in `ADMIN_EMAILS` (`web/wrangler.jsonc`).

## 3. Build the app

```sh
cd app
npx eas-cli build -p android --profile preview      # APK to test on phones (real Firebase)
npx eas-cli build -p android --profile production   # AAB for Google Play
```

Test on the preview APK before production: sign up, sign in after closing the app, claim a
controller (or `npm run fake-device` in `firebase/`), Forgot password → admin → WhatsApp,
notifications with the app closed, Account › Delete account.

## 4. Google Play Console (by hand)

- **App content → Privacy policy:** `https://relaxpump.cinzotechnologies.workers.dev/privacy`
- **App content → Data safety:**
  - Collected: *Personal info → Name, Phone number* (account management, app functionality,
    required); *App activity → Other actions* is **not** collected; *Device or other IDs* →
    push token (app functionality). Location, contacts, photos, files: **not collected**.
  - Shared with third parties: **No**. Encrypted in transit: **Yes**.
  - Users can request deletion: **Yes** — in the app and at
    `https://relaxpump.cinzotechnologies.workers.dev/delete-account`
- **Account deletion URL:** `https://relaxpump.cinzotechnologies.workers.dev/delete-account`
- **App access:** "All or some functionality is restricted" → give the reviewer a test phone
  number + password, and note: *"A RelaxPump controller is needed for live tank data; the test
  account is linked to a demo controller."* Link one with `npm run fake-device` / `link-device`
  in `firebase/` so the reviewer sees tanks.
- **Content rating** questionnaire (utility app, no user content) · **Target audience**: 18+.
- **Store listing:** short + full description, icon 512×512, feature graphic 1024×500, at least
  2 phone screenshots (take them from the preview APK).

## 5. After release

- Website: set the Google Play link (Admin → Website → App download → "Google Play is live").
- Publish over-the-air fixes with `npx eas-cli update --channel production` (JS-only changes).

## 6. v3 rollout (Household + PHE, many boards, OTA) — in this order

1. **Rules** (changes Firebase): `cd firebase && npm test && npm run deploy:rules`.
   Old v2 apps keep working (their writes still match the household shape).
2. **Website + push jobs** (changes Cloudflare): `cd web && npm run check`, then
   `npm run db:migrate:remote` (applies `0003_v3.sql`: new copy where the admin has not edited it,
   new products), `npm run deploy`, `npm run deploy:jobs` (PHE + update notifications).
3. **Signing key** (once, by the owner): `node firmware/scripts/keygen.mjs` → private key in
   `D:/keys/relaxpump-ota-sign.pem` (+ a second copy offline), public key in
   `firmware/include/ota_pubkey.h` → commit it. Without it every board refuses updates ("no key").
4. **Firmware with the key**: `pio run -e release`; the factory / last USB flash of every existing
   board: `npm run factory-flash -- --id RP-… --port COMx` (`docs/SETUP.md` §6).
5. **App**: `cd app && npm run check`, EAS preview build → test → production.
6. **First OTA**: raise `FW_VERSION`, commit, then § Firmware update below.

## Firmware update (OTA)

Boards download the update themselves from the GitHub Release (HTTPS), check its sha256 and the
ECDSA P-256 signature against the public key built into their firmware, install it into the other
slot and restart. A board that does not reach the cloud within 90 s of the new boot goes back to
the old version by itself (and reports "update failed"). Household boards refuse while the pump
runs; every output is off during the update. (`docs/two-module-system.md` §4.3, `firmware/src/ota.h`.)

Each release:

1. Raise `FW_VERSION` in `firmware/src/config.h`, run the host tests, commit and push to `main`.
2. Dry run (builds, signs, checks the signature, publishes nothing):
   `RP_SIGN_KEY=D:/keys/relaxpump-ota-sign.pem node firmware/scripts/release.mjs --dry-run`
   - It warns above 95 % of the 4 MB boards' OTA slot (1,966,080 bytes). 3.0.0 with the key built in
     is ≈ 1.92 MB (97.5 %): trim before adding big features, or move those boards to Rev C.
3. Publish at 10 %: `RP_SIGN_KEY=… GITHUB_TOKEN=… node firmware/scripts/release.mjs --notes "Line 1|Line 2"`
   - `GITHUB_TOKEN`: fine-grained token, this repo only, *Contents: read and write* (or a logged-in
     `gh` CLI). It creates the Release `fw-vX.Y.Z` with `relaxpump-X.Y.Z.bin`, checks the download
     URL answers, then writes `firmware/stable` (`--min-fw x.y.z` for boards that must update via an
     older step first).
   - The repo is public, so the binary is public: it never contains `secrets.h` (env:release) and
     the script refuses a binary that holds any device password or claim code.
4. Test board first: its rollout bucket is `sha256(id) % 100` (serial `id` shows it). If it is not
   under 10, use `--rollout <bucket+1>` for the first step. App → My devices → Update now → watch
   Downloading → Checking → Installing → Restarting → Up to date.
5. Widen: `node firmware/scripts/release.mjs --rollout 100`. Pause: `--rollout 0` (boards stop
   offering it; boards already updated stay).
6. Something wrong after an update? The board rolls back on its own if it cannot reach the cloud.
   Otherwise publish a fixed higher version; there is no downgrade.

Never commit the private key; keep the offline copy. Losing it means no board can be updated
again without a USB flash.

## Not done / later

- iOS (needs an Apple developer account and `GoogleService-Info.plist`).
- SMS OTP for Forgot password (needs Blaze) — the admin + WhatsApp flow replaces it.
- Custom domain (`cinzotechnologies.com` is in another Cloudflare account).

## Voice control (no fees)

The app runs these links without a tap (signed in + controller online; commands older than
2 minutes are dropped): `relaxpump://do/pump-on`, `pump-off`, `auto-on`, `auto-off`.
"Pump on" uses the open valve, or opens the emptiest tank's valve first, then starts the pump.

- **Android app shortcuts:** long-press the RelaxPump icon → Pump on / Pump off / Auto on / Auto off
  (works in the preview APK). Drag one to the home screen for one-tap control.
- **Google Assistant (App Actions):** "Hey Google, turn on the pump in RelaxPump", "… stop the
  pump in RelaxPump", "… turn on auto in RelaxPump" (phrases in `app/plugins/withVoiceShortcuts.js`).
  Google only enables App Actions for apps **installed from Google Play**; on phones where Gemini
  replaced Assistant, support depends on Google. Before release, test with Android Studio's
  "App Actions Test Tool" (Google Assistant plugin).
- **Siri (iPhone, once the iOS app exists):** Shortcuts app → New shortcut → *Open URLs* →
  `relaxpump://do/pump-on` → name it "Pump on". Then "Hey Siri, Pump on". Native Siri App Intents
  need the iOS build (Apple developer account).
