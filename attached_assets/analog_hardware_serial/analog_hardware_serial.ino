/*
 * CPR Trainer — Analog Hardware Serial Firmware (analog_v2)
 *
 * 12-channel CSV at 115200 baud for CPR Trainer web/Android app.
 *
 * Hardware mapping:
 *   A15  — Shoulder (ch 0 & 1 duplicate for L/R app compatibility)
 *   A9   — AED pad upper (ch 2)
 *   A11  — AED pad lower (ch 3)
 *   A7   — Neck tilt (ch 4)
 *   D12/D13 — Ultrasonic depth cm (ch 5)
 *   J5.A1 (A1) — Rescue breath pressure (ch 6, volts)
 *   A13  — Compression force 0–600 (ch 7)
 *   ch 8–11 — unused (0)
 *
 * CSV: shoulder_l,shoulder_r,aed_u,aed_l,neck,depth_cm,breath_V,force,0,0,0,0
 */

const int PIN_SHOULDER = A15;
const int PIN_AED_UPPER = A9;
const int PIN_AED_LOWER = A11;
const int PIN_NECK = A7;
const int PIN_FORCE = A13;
const int PIN_BREATH = A1;  // J5.A1 on expansion connector

const int PING_TRIGGER = 12;
const int PING_ECHO = 13;

const int ANALOG_TOUCH_THRESHOLD = 512;
const int FORCE_MAX = 600;

const unsigned long LINE_INTERVAL_MS = 100;
unsigned long lastLineMs = 0;
long lastValidDepthCm = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }
  Serial.println(F("# PROFILE analog_v2"));
  Serial.println(F("# CPR Trainer analog firmware — 12ch CSV @ 115200"));
}

void loop() {
  unsigned long now = millis();
  if (now - lastLineMs < LINE_INTERVAL_MS) {
    return;
  }
  lastLineMs = now;

  int shoulder = analogTouch(PIN_SHOULDER);
  int aedUpper = analogTouch(PIN_AED_UPPER);
  int aedLower = analogTouch(PIN_AED_LOWER);
  int neck = analogTouch(PIN_NECK);

  long depthCm = readUltrasonicCm();
  float breathV = readVoltage(PIN_BREATH);
  int force = mapForce(analogRead(PIN_FORCE));

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

int analogTouch(int pin) {
  return analogRead(pin) > ANALOG_TOUCH_THRESHOLD ? 1 : 0;
}

float readVoltage(int pin) {
  int raw = analogRead(pin);
  return raw * (5.0f / 1023.0f);
}

int mapForce(int raw) {
  long scaled = (long)raw * FORCE_MAX / 1023;
  return (int)constrain(scaled, 0, FORCE_MAX);
}

long readUltrasonicCm() {
  long samples[3];
  int validCount = 0;
  for (int i = 0; i < 3; i++) {
    long reading = readUltrasonicCmOnce();
    if (reading > 0) {
      samples[validCount++] = reading;
    }
    if (i < 2) {
      delay(5);
    }
  }

  if (validCount == 0) {
    return lastValidDepthCm;
  }

  for (int i = 0; i < validCount - 1; i++) {
    for (int j = i + 1; j < validCount; j++) {
      if (samples[j] < samples[i]) {
        long tmp = samples[i];
        samples[i] = samples[j];
        samples[j] = tmp;
      }
    }
  }

  long median = samples[validCount / 2];
  lastValidDepthCm = median;
  return median;
}

long readUltrasonicCmOnce() {
  pinMode(PING_TRIGGER, OUTPUT);
  digitalWrite(PING_TRIGGER, LOW);
  delayMicroseconds(2);
  digitalWrite(PING_TRIGGER, HIGH);
  delayMicroseconds(5);
  digitalWrite(PING_TRIGGER, LOW);

  pinMode(PING_ECHO, INPUT);
  long duration = pulseIn(PING_ECHO, HIGH, 30000);
  if (duration <= 0) {
    return lastValidDepthCm > 0 ? lastValidDepthCm : 0;
  }
  return microsecondsToCentimeters(duration);
}

long microsecondsToCentimeters(long microseconds) {
  return microseconds / 29 / 2;
}
