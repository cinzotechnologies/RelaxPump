/*
  Valve test - CINZO iot
  Valve 1 -> 10 s -> Valve 2 -> 10 s -> Valve 3 -> 10 s -> loop
  Valve pakhat chauh a hawng ang, a dang a khar vek.
  Pump (relay CH4) chu OFF reng.

  Relay IN1 G25 = Valve 1
  Relay IN2 G26 = Valve 2
  Relay IN3 G27 = Valve 3
  Relay IN4 G33 = Pump (OFF reng)
  Relay module hi active LOW (LOW = ON).
*/

const int VALVE[3] = {25, 26, 27};
const int PUMP = 33;
const int RELAY_ON = LOW;
const int RELAY_OFF = HIGH;
const unsigned long STEP_MS = 10000;   // second 10

void allOff() {
  for (int i = 0; i < 3; i++) digitalWrite(VALVE[i], RELAY_OFF);
  digitalWrite(PUMP, RELAY_OFF);
}

void setup() {
  // Relay OFF hmasa, chuan output siam (boot-a click loh nan)
  for (int i = 0; i < 3; i++) {
    digitalWrite(VALVE[i], RELAY_OFF);
    pinMode(VALVE[i], OUTPUT);
  }
  digitalWrite(PUMP, RELAY_OFF);
  pinMode(PUMP, OUTPUT);
  allOff();

  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("=== Valve test ===");
  Serial.println("Valve 1 > 2 > 3, second 10 zel. Pump OFF reng.");
}

void loop() {
  for (int i = 0; i < 3; i++) {
    allOff();                          // a dang zawng zawng khar
    delay(300);                        // relay inthlak hmain nghak tlem
    digitalWrite(VALVE[i], RELAY_ON);  // he valve chauh hawng
    Serial.printf("Valve %d HAWNG  (G%d)\n", i + 1, VALVE[i]);
    delay(STEP_MS);
    digitalWrite(VALVE[i], RELAY_OFF);
    Serial.printf("Valve %d KHAR\n", i + 1);
  }
}
