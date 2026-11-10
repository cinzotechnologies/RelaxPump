# RelaxPump

Water-tank automation, **engineered by CINZO**. One ESP32 controller per home for 1–8 semi
tanks (each with a sensor and/or a solenoid valve), an optional PHE (public water) line, an
optional main-tank sensor and one pump. The installer sets the layout in the app — the firmware is
the same for every home (`docs/flexible-system.md`). The app shows the levels and fills the tanks
by hand or automatically, from the pump or the PHE line.

| Folder | What |
|---|---|
| `app/` | Expo (React Native, TypeScript) app — development build, Expo Router |
| `firmware/` | PlatformIO project for the ESP32 controller (`tools/ValveTest` = relay test) |
| `web/` | Website, store and admin panel — Next.js on Cloudflare (see `docs/website-brief.md`) |
| `firebase/` | Realtime Database rules, emulator tests, admin/seed scripts |
| `docs/` | Setup guide, data model, wiring (board v1 + v2), v2 plan |
| `hardware/` | PCB v2 notes (pins, connectors, layout) |
| `reference/` | Approved design and legacy code (read-only) |

Setup: see [`docs/SETUP.md`](docs/SETUP.md).

Secrets are never committed: `google-services.json`, `GoogleService-Info.plist`,
`firmware/include/secrets.h`, keystores, `.env`.
