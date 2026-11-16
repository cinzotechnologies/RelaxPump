# RelaxPump Relay Board (Rev B) — your circuit

Visual drafts: `BoardTop.dc.html` (click a part for its pins), `BoardPinout.dc.html`, `BoardNetlist.dc.html`.
KiCad schematic for EasyEDA Pro import: `RelaxPump_RelayBoard_kicad.zip`. Tables: `relaypump-board-netlist.csv`, `relaypump-board-bom.csv`.

## How it works

1. **230 V AC** → J1 (L, N, PE) → F1 fuse T2A → RV1 MOV → **PS1 AC-DC 12 V 5 A** (isolated).
2. **+12V** → buck U2 → **+5V** (relay coils, sensors, power LED) → AMS1117 U3 → **+3V3** (ESP32).
3. **Relay 1 (K1):** COM = 230 V L (after F1), NO → J2 PUMP OUT → **contactor coil** (N and PE on J2 too). Do not run the pump straight from the relay.
4. **Relays 2–6 (K2–K6):** COM = +12V, NO → J4–J8 → solenoid valves 1–5 (SS34 flyback on each output).
5. **ULN2003A** drives the 6 relay coils from the ESP32 → **relay ON = GPIO HIGH** (firmware: active-high board).
6. **6 sensor connectors** J9–J14 (T1–T5, MAIN): 1 = 5V, 2 = GND, 3 = ECHO, 4 = TRIG. Echo 1 kΩ/2 kΩ divider, trig 100 Ω, ESD diode.
7. **ESP32-WROOM-32E** = Wi-Fi + Bluetooth (BLE) in one module. RESET (EN), BOOT (IO0), **Wi-Fi LED** (IO2), **power LED** (5 V).
8. **Upload:** J3 UART header (GND, TX, RX, 3V3, EN, IO0) with a 3.3 V USB-TTL adapter: hold BOOT, tap RESET, upload.

## ESP32 pins

| Pin | Name | Net |
|---|---|---|
| 1 | GND | GND |
| 2 | 3V3 | +3V3 |
| 3 | EN | EN |
| 4 | SENSOR_VP / IO36 | NC |
| 5 | SENSOR_VN / IO39 | ECHO_MAIN |
| 6 | IO34 | ECHO_T4 |
| 7 | IO35 | ECHO_T5 |
| 8 | IO32 | RLY_V4 |
| 9 | IO33 | RLY_PUMP |
| 10 | IO25 | RLY_V1 |
| 11 | IO26 | RLY_V2 |
| 12 | IO27 | RLY_V3 |
| 13 | IO14 | TRIG_T5_IO |
| 14 | IO12 | NC (strapping) |
| 15 | GND | GND |
| 16 | IO13 | TRIG_T4_IO |
| 17 | SD2 / IO9 | NC (flash) |
| 18 | SD3 / IO10 | NC (flash) |
| 19 | CMD / IO11 | NC (flash) |
| 20 | CLK / IO6 | NC (flash) |
| 21 | SD0 / IO7 | NC (flash) |
| 22 | SD1 / IO8 | NC (flash) |
| 23 | IO15 | NC (strapping) |
| 24 | IO2 | LED_WIFI |
| 25 | IO0 | IO0_BOOT |
| 26 | IO4 | ECHO_T3 |
| 27 | IO16 | TRIG_T1_IO |
| 28 | IO17 | ECHO_T1 |
| 29 | IO5 | NC |
| 30 | IO18 | TRIG_T2_IO |
| 31 | IO19 | ECHO_T2 |
| 32 | NC | NC |
| 33 | IO21 | TRIG_MAIN_IO |
| 34 | RXD0 / IO3 | UART_RX |
| 35 | TXD0 / IO1 | UART_TX |
| 36 | IO22 | RLY_V5 |
| 37 | IO23 | TRIG_T3_IO |
| 38 | GND | GND |
| 39 | GND (pad) | GND |

Same GPIOs as the firmware plan: pump G33, valves G25/G26/G27/G32/G22, sensors T1 16/17, T2 18/19, T3 23/4, T4 13/34, T5 14/35, MAIN 21/39.

## Safety (230 V on the board)

- 230 V zone: J1, F1, RV1, PS1 input, K1 contacts, J2. Traces ≥ 2 mm, **≥ 8 mm creepage** to low-voltage copper, 2 mm slot between K1 and K2, no ground pour in the zone.
- Silkscreen L / N / PE and ⚠ 230 V. Put the board in a closed box; earth the box. Electrician for the mains wiring.
- Valves ≤ 2 on at once (firmware); 12 V 5 A supply.

## Nets

- **+12V**: PS1.4, D1.K, C1.+, C2.1, U2.1, K2.3, K3.3, K4.3, K5.3, K6.3
- **+3V3**: U3.2, U3.4, C5.1, C6.1, C7.1, U1.2, R2.1, R3.1, J3.4
- **+5V**: U2.3, C3.+, U3.3, C4.1, R1.1, U4.9, K1.1, R5.1, K2.1, R6.1, K3.1, R7.1, K4.1, R8.1, K5.1, R9.1, K6.1, R10.1, J9.1, J10.1, J11.1, J12.1, J13.1, J14.1
- **AC_L**: J1.1, F1.1
- **AC_L_F**: F1.2, RV1.1, PS1.1, K1.3
- **AC_N**: J1.2, RV1.2, PS1.2, J2.2
- **ECHO_MAIN**: U1.5, R16.2, R22.1
- **ECHO_MAIN_5V**: J14.3, R16.1, D12.2
- **ECHO_T1**: U1.28, R11.2, R17.1
- **ECHO_T1_5V**: J9.3, R11.1, D7.2
- **ECHO_T2**: U1.31, R12.2, R18.1
- **ECHO_T2_5V**: J10.3, R12.1, D8.2
- **ECHO_T3**: U1.26, R13.2, R19.1
- **ECHO_T3_5V**: J11.3, R13.1, D9.2
- **ECHO_T4**: U1.6, R14.2, R20.1
- **ECHO_T4_5V**: J12.3, R14.1, D10.2
- **ECHO_T5**: U1.7, R15.2, R21.1
- **ECHO_T5_5V**: J13.3, R15.1, D11.2
- **EN**: U1.3, R2.2, C8.1, SW1.1, J3.5
- **GND**: PS1.3, D1.A, C1.−, C2.2, U2.2, U2.4, C3.−, U3.1, C4.2, C5.2, C6.2, C7.2, LED1.K, U1.1, U1.15, U1.38, U1.39, C8.2, SW1.2, SW2.2, LED2.K, J3.1, U4.8, J4.2, D2.A, J5.2, D3.A, J6.2, D4.A, J7.2, D5.A, J8.2, D6.A, J9.2, R17.2, D7.3, J10.2, R18.2, D8.3, J11.2, R19.2, D9.3, J12.2, R20.2, D10.3, J13.2, R21.2, D11.3, J14.2, R22.2, D12.3
- **IO0_BOOT**: U1.25, R3.2, SW2.1, J3.6
- **K1_COIL**: U4.16, K1.2, LED3.K
- **K1_LED_A**: LED3.A, R5.2
- **K2_COIL**: U4.15, K2.2, LED4.K
- **K2_LED_A**: LED4.A, R6.2
- **K3_COIL**: U4.14, K3.2, LED5.K
- **K3_LED_A**: LED5.A, R7.2
- **K4_COIL**: U4.13, K4.2, LED6.K
- **K4_LED_A**: LED6.A, R8.2
- **K5_COIL**: U4.12, K5.2, LED7.K
- **K5_LED_A**: LED7.A, R9.2
- **K6_COIL**: U4.11, K6.2, LED8.K
- **K6_LED_A**: LED8.A, R10.2
- **LED_PWR_A**: LED1.A, R1.2
- **LED_WIFI**: U1.24, R4.1
- **LED_WIFI_A**: LED2.A, R4.2
- **PE**: J1.3, J2.3
- **PUMP_L**: J2.1, K1.4
- **RLY_PUMP**: U1.9, U4.1
- **RLY_V1**: U1.10, U4.2
- **RLY_V2**: U1.11, U4.3
- **RLY_V3**: U1.12, U4.4
- **RLY_V4**: U1.8, U4.5
- **RLY_V5**: U1.36, U4.6
- **TRIG_MAIN**: J14.4, R28.2, D12.1
- **TRIG_MAIN_IO**: U1.33, R28.1
- **TRIG_T1**: J9.4, R23.2, D7.1
- **TRIG_T1_IO**: U1.27, R23.1
- **TRIG_T2**: J10.4, R24.2, D8.1
- **TRIG_T2_IO**: U1.30, R24.1
- **TRIG_T3**: J11.4, R25.2, D9.1
- **TRIG_T3_IO**: U1.37, R25.1
- **TRIG_T4**: J12.4, R26.2, D10.1
- **TRIG_T4_IO**: U1.16, R26.1
- **TRIG_T5**: J13.4, R27.2, D11.1
- **TRIG_T5_IO**: U1.13, R27.1
- **UART_RX**: U1.34, J3.3
- **UART_TX**: U1.35, J3.2
- **VALVE1_P**: K2.4, J4.1, D2.K
- **VALVE2_P**: K3.4, J5.1, D3.K
- **VALVE3_P**: K4.4, J6.1, D4.K
- **VALVE4_P**: K5.4, J7.1, D5.K
- **VALVE5_P**: K6.4, J8.1, D6.K
