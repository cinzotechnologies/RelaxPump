# RelaxPump

Water-tank automation, **engineered by CINZO**. Two modules, each its own ESP32 board with the same
PCB and the same firmware (`docs/two-module-system.md`):

- **Household** — one pump and 1–5 semi tanks (sensor + solenoid valve each; one tank = sensor
  only), optional main-tank sensor.
- **PHE** — 1–5 PHE (government) supply lines, each a sensor + valve on one tank, no pump.

One app account holds any number of boards (Home: Household | PHE tabs). The installer sets the
layout in the app; firmware updates go over the air (signed, staged rollout, automatic rollback).

| Folder | What |
|---|---|
| `app/` | Expo (React Native, TypeScript) app — development build, Expo Router |
| `firmware/` | PlatformIO project for the ESP32 controller (`tools/ValveTest` = relay test) |
| `web/` | Website, store and admin panel — Next.js on Cloudflare (see `docs/website-brief.md`) |
| `firebase/` | Realtime Database rules, emulator tests, admin/seed scripts |
| `docs/` | Setup guide, data model, wiring (Household + PHE, 8 relays), v3 plan, release + OTA checklist |
| `hardware/` | PCB v2 notes (pins, connectors, layout) |
| `reference/` | Approved design and legacy code (read-only) |

Setup: see [`docs/SETUP.md`](docs/SETUP.md).

Secrets are never committed: `google-services.json`, `GoogleService-Info.plist`,
`firmware/include/secrets.h`, `firmware/include/project.h`, `firebase/out/` (per-device identities),
the OTA signing key (kept outside the repo), keystores, `.env`.
