# RelaxPump Controller v2 — PCB (Rev A draft)

Matches `docs/flexible-system.md`: **5 semi tanks (T1–T5) + MAIN sensor, 6 outputs (V1–V5 + PUMP)**.
Visual drafts: `reference/pcb-v2/PcbTop.dc.html` (top view, click a part to see its pins),
`PcbPinout.dc.html` (every ESP32 pin), `PcbNetlist.dc.html` (every net + BOM).
Machine-readable: `pcb-v2-netlist.csv` (Ref, Pin, Pin name, Net) and `pcb-v2-bom.csv`.
`reference/pcb-v2/PcbSpec.dc.html` is the old 8-tank + PHE draft — ignore it.

This is a schematic-level draft. Draw it in KiCad, EasyEDA or Flux, run ERC/DRC, order 5–10
prototypes, bench-test, then Rev B.

## Board

- 120 × 90 mm, 2-layer, 1.6 mm, 1 oz (2 oz better), 4 × M3 holes (GND), fits an IP65 box.
- Top edge: J2–J7 output terminals (V1–V5, PUMP), MOSFET channels under them.
- Right: J1 12 V in → F1 5 A → D1 SS54 → +12V; D2 SMBJ15A, C1 470 µF, C2 10 µF; U2 5 V 3 A buck module.
- Left: U1 ESP32-DevKitC-32E in 2 × 1×19 female headers; antenna over the left edge, no copper under it.
- Bottom edge: J8–J13 RJ45 (T1–T5, MAIN) with ESD (PESD5V0S2BT) and Echo dividers (1 k / 2 k) above them.
- SW1 SETUP (G0), SW2 RESET (EN), LED7 status (G2), LED8 5 V power, J14 spare (3V3, G5, GND).

## Output channel (×6: V1–V5, PUMP)

GPIO → 100 Ω → AO3400A gate (10 kΩ gate→GND, so OFF at boot) · source GND · drain = `Vn_OUT` →
terminal pin 2 · terminal pin 1 = +12V · SS34 flyback (K +12V, A drain) · 4.7 kΩ + green LED from +12V
to drain (lights when ON). Outputs are **active HIGH** on this board (the old relay module is active LOW;
firmware selects by board version). PUMP drives the 12 V coil of a DIN-rail interface relay in the mains
box; that relay switches the contactor coil. **No 230 V on this PCB.**

## Sensor port (×6: T1–T5, MAIN) — RJ45 T568B

| RJ45 pin | Colour | Net |
|---|---|---|
| 8 | brown | +5V |
| 7 | brown-white | GND |
| 4 | blue | TRIG (GPIO → 100 Ω) |
| 5 | blue-white | GND |
| 6 | green | ECHO 5 V → 1 kΩ → GPIO, 2 kΩ GPIO→GND |
| 3 | green-white | GND |
| 1, 2 | orange pair | not used |

At the sensor end crimp CAT6 to the JSN-SR04T: brown → 5V, brown-white/blue-white/green-white → GND, blue → Trig, green → Echo.

## ESP32 DevKitC pins (antenna up)

| Left | Pin | Net | | Right | Pin | Net |
|---|---|---|---|---|---|---|
| L1 | 3V3 | +3V3 | | R1 | GND | GND |
| L2 | EN | EN | | R2 | G23 | TRIG_T3_IO |
| L3 | SENSOR_VP / G36 | NC | | R3 | G22 | GATE_V5 |
| L4 | SENSOR_VN / G39 | ECHO_MAIN | | R4 | TX / G1 | NC (USB serial) |
| L5 | G34 | ECHO_T4 | | R5 | RX / G3 | NC (USB serial) |
| L6 | G35 | ECHO_T5 | | R6 | G21 | TRIG_MAIN_IO |
| L7 | G32 | GATE_V4 | | R7 | GND | GND |
| L8 | G33 | GATE_PUMP | | R8 | G19 | ECHO_T2 |
| L9 | G25 | GATE_V1 | | R9 | G18 | TRIG_T2_IO |
| L10 | G26 | GATE_V2 | | R10 | G5 | SPARE_G5 |
| L11 | G27 | GATE_V3 | | R11 | G17 | ECHO_T1 |
| L12 | G14 | TRIG_T5_IO | | R12 | G16 | TRIG_T1_IO |
| L13 | G12 | NC (strapping) | | R13 | G4 | ECHO_T3 |
| L14 | GND | GND | | R14 | G0 | SW_SETUP |
| L15 | G13 | TRIG_T4_IO | | R15 | G2 | LED_STATUS |
| L16 | SD2 / G9 | NC (flash) | | R16 | G15 | NC (strapping) |
| L17 | SD3 / G10 | NC (flash) | | R17 | SD1 / G8 | NC (flash) |
| L18 | CMD / G11 | NC (flash) | | R18 | SD0 / G7 | NC (flash) |
| L19 | 5V | +5V | | R19 | CLK / G6 | NC (flash) |

## Nets

- **+12V**: D1.K, D2.K, C1.+, C2.1, U2.1, J2.1, D3.K, R1.1, J3.1, D4.K, R2.1, J4.1, D5.K, R3.1, J5.1, D6.K, R4.1, J6.1, D7.K, R5.1, J7.1, D8.K, R6.1
- **+3V3**: U1.L1, J14.1
- **+5V**: U1.L19, U2.3, C3.+, C4.1, R38.1, J8.8, J9.8, J10.8, J11.8, J12.8, J13.8
- **ECHO_MAIN**: U1.L4, R24.2, R30.1
- **ECHO_MAIN_5V**: J13.6, R24.1, D14.2
- **ECHO_T1**: U1.R11, R19.2, R25.1
- **ECHO_T1_5V**: J8.6, R19.1, D9.2
- **ECHO_T2**: U1.R8, R20.2, R26.1
- **ECHO_T2_5V**: J9.6, R20.1, D10.2
- **ECHO_T3**: U1.R13, R21.2, R27.1
- **ECHO_T3_5V**: J10.6, R21.1, D11.2
- **ECHO_T4**: U1.L5, R22.2, R28.1
- **ECHO_T4_5V**: J11.6, R22.1, D12.2
- **ECHO_T5**: U1.L6, R23.2, R29.1
- **ECHO_T5_5V**: J12.6, R23.1, D13.2
- **EN**: U1.L2, SW2.1
- **GATE_PUMP**: U1.L8, R12.1
- **GATE_PUMP_G**: Q6.G, R12.2, R18.1
- **GATE_V1**: U1.L9, R7.1
- **GATE_V1_G**: Q1.G, R7.2, R13.1
- **GATE_V2**: U1.L10, R8.1
- **GATE_V2_G**: Q2.G, R8.2, R14.1
- **GATE_V3**: U1.L11, R9.1
- **GATE_V3_G**: Q3.G, R9.2, R15.1
- **GATE_V4**: U1.L7, R10.1
- **GATE_V4_G**: Q4.G, R10.2, R16.1
- **GATE_V5**: U1.R3, R11.1
- **GATE_V5_G**: Q5.G, R11.2, R17.1
- **GND**: U1.L14, U1.R1, U1.R7, J1.2, D2.A, C1.−, C2.2, U2.2, U2.4, C3.−, C4.2, LED8.K, Q1.S, R13.2, Q2.S, R14.2, Q3.S, R15.2, Q4.S, R16.2, Q5.S, R17.2, Q6.S, R18.2, J8.3, J8.5, J8.7, R25.2, D9.3, J9.3, J9.5, J9.7, R26.2, D10.3, J10.3, J10.5, J10.7, R27.2, D11.3, J11.3, J11.5, J11.7, R28.2, D12.3, J12.3, J12.5, J12.7, R29.2, D13.3, J13.3, J13.5, J13.7, R30.2, D14.3, LED7.K, SW1.2, SW2.2, J14.3
- **LED_STATUS**: U1.R15, R37.1
- **LED_STATUS_A**: LED7.A, R37.2
- **PUMP_LED_A**: R6.2, LED6.A
- **PUMP_OUT**: J7.2, Q6.D, D8.A, LED6.K
- **PWR_LED_A**: LED8.A, R38.2
- **SPARE_G5**: U1.R10, J14.2
- **SW_SETUP**: U1.R14, SW1.1
- **TRIG_MAIN**: J13.4, R36.2, D14.1
- **TRIG_MAIN_IO**: U1.R6, R36.1
- **TRIG_T1**: J8.4, R31.2, D9.1
- **TRIG_T1_IO**: U1.R12, R31.1
- **TRIG_T2**: J9.4, R32.2, D10.1
- **TRIG_T2_IO**: U1.R9, R32.1
- **TRIG_T3**: J10.4, R33.2, D11.1
- **TRIG_T3_IO**: U1.R2, R33.1
- **TRIG_T4**: J11.4, R34.2, D12.1
- **TRIG_T4_IO**: U1.L15, R34.1
- **TRIG_T5**: J12.4, R35.2, D13.1
- **TRIG_T5_IO**: U1.L12, R35.1
- **V1_LED_A**: R1.2, LED1.A
- **V1_OUT**: J2.2, Q1.D, D3.A, LED1.K
- **V2_LED_A**: R2.2, LED2.A
- **V2_OUT**: J3.2, Q2.D, D4.A, LED2.K
- **V3_LED_A**: R3.2, LED3.A
- **V3_OUT**: J4.2, Q3.D, D5.A, LED3.K
- **V4_LED_A**: R4.2, LED4.A
- **V4_OUT**: J5.2, Q4.D, D6.A, LED4.K
- **V5_LED_A**: R5.2, LED5.A
- **V5_OUT**: J6.2, Q5.D, D7.A, LED5.K
- **VIN_FUSED**: F1.2, D1.A
- **VIN_RAW**: J1.1, F1.1

## Rules

- +12V rail ≥ 2.5 mm (6 A); each output ≥ 1 mm (2 A); GND pour both layers, stitched.
- Valves: at most 2 outputs on at once (firmware). 12 V 5 A supply for 20 W valves.
- Test points: +12V, +5V, +3V3, GND. Silkscreen every port name and pin 1.
