# Wiring notes

Full plan with pictures: [`Smart_Water_Tank_Project_Plan.pdf`](Smart_Water_Tank_Project_Plan.pdf).
Pins are set in `firmware/src/config.h` (to be re-checked on the board).

| ESP32 | Goes to | Note |
|---|---|---|
| VIN / GND | LM2596 buck 5.0 V | set the buck to 5.0 V **before** connecting |
| G16 / G17 | Tank 1 Trig / Echo | Echo through 1k → GPIO, 2k → GND |
| G18 / G19 | Tank 2 Trig / Echo | same divider |
| G23 / G4 | Tank 3 Trig / Echo | same divider (PDF says G22/G23 — check the board) |
| G25 / G26 / G27 | Relay IN1–IN3 → valves 1–3 | relay COM ← +12 V, NO → valve |
| G33 | Relay IN4 → contactor coil | L → COM, NO → A1, A2 ← N. Electrician + MCB |
| G2 | on-board LED | status |
| G0 (BOOT) | button | hold 5 s = forget Wi-Fi, Bluetooth setup again |

- The relay module is **active LOW**; the firmware writes HIGH before making the pins outputs, so nothing
  switches on at boot.
- Valves are 12 V **solenoid** valves (2 s lead before the pump starts).
- JSN-SR04T: mount the probe ≥ 30 cm above the full level (20–25 cm blind zone). Board inside the box.
- One CAT6 per tank: brown = 5 V, brown-white + spare whites = GND, blue = Trig, green = Echo.

## Status LED

| Pattern | Meaning |
|---|---|
| slow blink (1 s) | waiting for Bluetooth setup |
| fast blink | connecting to Wi-Fi / Firebase |
| on | online |
| double blink | stopped for safety — see the message in the app; any command from the app clears it |
