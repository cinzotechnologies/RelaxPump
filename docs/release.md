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

## Not done / later

- iOS (needs an Apple developer account and `GoogleService-Info.plist`).
- SMS OTP for Forgot password (needs Blaze) — the admin + WhatsApp flow replaces it.
- Custom domain (`cinzotechnologies.com` is in another Cloudflare account).
