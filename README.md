# RelaxPump

Water-tank automation, **engineered by CINZO**. One ESP32 controller per home: an ultrasonic
sensor and a solenoid valve per tank, one pump through relay + contactor, and a mobile app to
watch the levels and run the pump by hand or automatically.

| Folder | What |
|---|---|
| `app/` | Expo (React Native, TypeScript) app — development build, Expo Router |
| `firmware/` | PlatformIO project for the ESP32 controller (`tools/ValveTest` = relay test) |
| `web/` | Website, store and admin panel — Next.js on Cloudflare (see `docs/website-brief.md`) |
| `firebase/` | Realtime Database rules, emulator tests, admin/seed scripts |
| `docs/` | Setup guide, data model, wiring |
| `reference/` | Approved design and legacy code (read-only) |

Setup: see [`docs/SETUP.md`](docs/SETUP.md).

Secrets are never committed: `google-services.json`, `GoogleService-Info.plist`,
`firmware/include/secrets.h`, keystores, `.env`.
