/*
 * CPR Trainer — NodeMCU (ESP8266) USB mock serial (analog_v2)
 *
 * Same wire protocol as Mega analog_hardware_serial.ino — NO WiFi.
 * Plug NodeMCU into PC USB → use Web Serial in the CPR web app.
 *
 * CSV @ 115200 baud, ~10 Hz:
 *   shoulder_l,shoulder_r,aed_u,aed_l,neck,depth_cm,breath_V,force,0,0,0,0
 *
 * Web app:
 *   Settings → Connect → USB (Web Serial)
 *   Hardware profile: Analog v2
 *   Baud: 115200
 *   Close Arduino IDE Serial Monitor before Connect in browser
 *
 * Board: NodeMCU 1.0 (ESP-12E), 115200 Serial Monitor for debug only
 */

const unsigned long LINE_INTERVAL_MS = 100;
unsigned long lastLineMs = 0;
uint32_t tick = 0;

int shoulder = 0;
int aedUpper = 0;
int aedLower = 0;
int neck = 0;
int depthCm = 11;
float breathV = 0.16f;
int force = 0;

void updateMockSensors() {
  shoulder = 0;
  aedUpper = 0;
  aedLower = 0;
  neck = 0;

  const int wavePos = tick % 20;
  if (wavePos < 10) {
    depthCm = 11 - (wavePos * 5) / 10;
    force = wavePos * 12;
  } else {
    depthCm = 6 + ((wavePos - 10) * 5) / 10;
    force = (20 - wavePos) * 12;
  }
  if (depthCm < 6) depthCm = 6;
  if (depthCm > 11) depthCm = 11;
  if (force < 0) force = 0;
  if (force > 200) force = 200;

  const int breathPos = tick % 30;
  if (breathPos < 15) {
    breathV = 0.16f + (breathPos * 0.29f) / 15.0f;
  } else {
    breathV = 0.45f - ((breathPos - 15) * 0.29f) / 15.0f;
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println(F("# PROFILE analog_v2"));
  Serial.println(F("# CPR Trainer NodeMCU USB mock — 12ch CSV @ 115200"));
  Serial.println(F("# Ready — use Web Serial in browser (not WiFi)"));
}

void loop() {
  unsigned long now = millis();
  if (now - lastLineMs < LINE_INTERVAL_MS) {
    return;
  }
  lastLineMs = now;
  tick++;

  updateMockSensors();

  Serial.print(shoulder); Serial.print(',');
  Serial.print(shoulder); Serial.print(',');
  Serial.print(aedUpper); Serial.print(',');
  Serial.print(aedLower); Serial.print(',');
  Serial.print(neck); Serial.print(',');
  Serial.print(depthCm); Serial.print(',');
  Serial.print(breathV, 2); Serial.print(',');
  Serial.print(force); Serial.print(',');
  Serial.print(0); Serial.print(',');
  Serial.print(0); Serial.print(',');
  Serial.print(0); Serial.print(',');
  Serial.println(0);
}
