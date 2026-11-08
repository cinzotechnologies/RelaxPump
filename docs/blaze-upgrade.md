# Things that need the Blaze (pay-as-you-go) plan

The project runs on **Spark (free)**. These parts are written or stubbed but switched off until the
project moves to Blaze. Ask before upgrading — Blaze needs a billing account.

| Feature | Why Blaze | Where | Switch on |
|---|---|---|---|
| Push notifications when the app is closed | Cloud Functions | `firebase/functions/src/index.ts` (`onDeviceEvent`) | deploy functions (the app already saves each phone's FCM token at `users/{uid}/fcm`; iOS also needs an APNs key in Firebase) |
| Daily usage roll-up / cleanup of old events | Cloud Functions (scheduled) | `firebase/functions/src/index.ts` (`dailyCleanup`) | deploy functions |
| SMS "Forgot password" and phone verification | Firebase Phone Auth sends SMS (charged per SMS) | app `ForgotSheet`, flag `ENABLE_PHONE_OTP` in `app/app.config.ts` | add SHA-1/SHA-256 of the signing key in the console, set the flag `true`, build the OTP screen |

Until then:

- Events show in the **Notifications** sheet and as a local notification while the app is running.
- Forgot password → **Contact support** (WhatsApp) → `npm run reset-password` in `firebase/`.

## Steps when you upgrade

1. Firebase console → **Upgrade** → Blaze; set a budget alert (e.g. ₹500/month).
2. `cd firebase/functions && npm install` (once)
3. `cd firebase && npm run deploy:rules && npm run deploy:functions` (builds first; needs `npx firebase login`)
4. iOS only: Firebase console → Project settings → Cloud Messaging → upload the APNs key.
5. Test push on a development build or preview APK (not Expo Go).
