RelaxPump Controller v2 Rev A - KiCad schematic for EasyEDA Pro import

Files: RelaxPump_v2.kicad_sch, RelaxPump_v2.kicad_pro
Every part from hardware/pcb-v2-bom.csv is placed; every connection is a global net label
(net names = hardware/pcb-v2-netlist.csv). Unused pins have a no-connect flag.
Mounting holes H1-H4 are not in the schematic: add them on the PCB.

Pad numbering used (so footprints match):
- Diodes / LEDs: pin 1 = cathode, pin 2 = anode
- AO3400A (SOT-23): 1 = G, 2 = S, 3 = D
- Electrolytic caps: 1 = +, 2 = -
- U1 ESP32 DevKitC: pins 1-19 = left row (L1-L19, 3V3 at the top), pins 20-38 = right row (R1-R19, GND at the top)
- U2 buck module: 1 IN+, 2 IN-, 3 OUT+, 4 OUT-
- RJ45: pins 1-8 as T568B
