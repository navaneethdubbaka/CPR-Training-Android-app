/*
 * CPR Trainer — App Test Serial Firmware
 *
 * Sends CSV lines at 115200 baud matching the CPR Trainer web/Android app format.
 * No physical sensors required — use this sketch to verify USB / Web Serial connection.
 *
 * CSV layout (12 channels, comma-separated, newline-terminated):
 *   [0]  Left shoulder tap      (default app assignment)
 *   [1]  Right shoulder tap
 *   [2]  AED pad upper
 *   [3]  AED pad lower
 *   [4]  Neck tilt / spare touch
 *   [5]  Compression depth (cm) — ultrasonic channel in app
 *   [6]  Breath pressure (V)    — analog A0 channel in app
 *   [7-11] Digital buttons D2,D4,D6,D8,D10 (unused by default)
 *
 * App detection thresholds (for reference):
 *   Compression depth: starts >= 6 cm, completes when <= 5.2 cm
 *   Breath pressure:   starts > 0.25 V, peak > 0.40 V, ends < 0.22 V
 *
 * Serial commands (Settings → Serial monitor, line ending NL):
 *   help        — list commands
 *   auto        — loop full CPR demo sequence
 *   stop        — stop auto demo
 *   shoulder_l  — pulse left shoulder tap
 *   shoulder_r  — pulse right shoulder tap
 *   aed         — hold both AED pads ON for 2 s
 *   compress    — one compression depth waveform
 *   breath      — one rescue breath pressure waveform
 *   idle        — reset all channels to rest
 */

const unsigned long LINE_INTERVAL_MS = 100;

const float DEPTH_WAVE[] = { 0, 3, 5.5, 6.5, 6.5, 5.0, 2.0, 0 };
const int DEPTH_WAVE_LEN = 8;

const float BREATH_WAVE[] = { 0.05, 0.35, 0.55, 2.8, 2.5, 1.2, 0.4, 0.05 };
const int BREATH_WAVE_LEN = 8;

int touch[5] = { 0, 0, 0, 0, 0 };
float depthCm = 0;
float breathV = 0.05;
int buttons[5] = { 0, 0, 0, 0, 0 };

bool autoDemo = true;
unsigned long lastLineMs = 0;

// Auto demo state
int autoStep = 0;
unsigned long stepStartMs = 0;
int compressionCount = 0;
int breathCount = 0;
unsigned long nextCompressionMs = 0;

// Touch / AED pulse
int pulseChannel = -1;       // 0-4 touch index, 100 = AED hold
unsigned long pulseEndMs = 0;

// Wave playback
bool runningWave = false;
bool waveIsBreath = false;
int waveStep = 0;
unsigned long lastWaveStepMs = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }
  stepStartMs = millis();
  Serial.println(F("# CPR Trainer test firmware ready"));
  Serial.println(F("# CSV: L-shoulder,R-shoulder,AED-U,AED-L,neck,depth_cm,breath_V,btn x5"));
  Serial.println(F("# Type 'help' for commands or wait for auto demo"));
}

void loop() {
  pollSerialCommands();

  unsigned long now = millis();
  updatePulse(now);

  if (runningWave) {
    advanceWave(now);
  }

  if (autoDemo && !runningWave && pulseChannel < 0) {
    runAutoDemo(now);
  }

  if (now - lastLineMs >= LINE_INTERVAL_MS) {
    lastLineMs = now;
    emitLine();
  }
}

void emitLine() {
  Serial.print(touch[0]); Serial.print(',');
  Serial.print(touch[1]); Serial.print(',');
  Serial.print(touch[2]); Serial.print(',');
  Serial.print(touch[3]); Serial.print(',');
  Serial.print(touch[4]); Serial.print(',');
  Serial.print(depthCm, 1); Serial.print(',');
  Serial.print(breathV, 2); Serial.print(',');
  for (int i = 0; i < 5; i++) {
    Serial.print(buttons[i]);
    if (i < 4) Serial.print(',');
  }
  Serial.println();
}

void resetTouch() {
  for (int i = 0; i < 5; i++) touch[i] = 0;
}

void setIdle() {
  resetTouch();
  depthCm = 0;
  breathV = 0.05;
  for (int i = 0; i < 5; i++) buttons[i] = 0;
  runningWave = false;
  pulseChannel = -1;
}

void startTouchPulse(int index, unsigned long durationMs) {
  resetTouch();
  touch[index] = 1;
  pulseChannel = index;
  pulseEndMs = millis() + durationMs;
  runningWave = false;
}

void startAedHold(unsigned long durationMs) {
  resetTouch();
  touch[2] = 1;
  touch[3] = 1;
  pulseChannel = 100;
  pulseEndMs = millis() + durationMs;
  runningWave = false;
}

void updatePulse(unsigned long now) {
  if (pulseChannel < 0) return;
  if (now < pulseEndMs) return;

  if (pulseChannel == 100) {
    touch[2] = 0;
    touch[3] = 0;
  } else if (pulseChannel >= 0 && pulseChannel <= 4) {
    touch[pulseChannel] = 0;
  }
  pulseChannel = -1;
}

void startDepthWave() {
  waveIsBreath = false;
  waveStep = 0;
  lastWaveStepMs = millis();
  runningWave = true;
  depthCm = DEPTH_WAVE[0];
  breathV = 0.05;
}

void startBreathWave() {
  waveIsBreath = true;
  waveStep = 0;
  lastWaveStepMs = millis();
  runningWave = true;
  breathV = BREATH_WAVE[0];
  depthCm = 0;
}

void advanceWave(unsigned long now) {
  if (now - lastWaveStepMs < 80) return;
  lastWaveStepMs = now;
  waveStep++;

  if (waveIsBreath) {
    if (waveStep >= BREATH_WAVE_LEN) {
      runningWave = false;
      breathV = 0.05;
      waveStep = 0;
      return;
    }
    breathV = BREATH_WAVE[waveStep];
  } else {
    if (waveStep >= DEPTH_WAVE_LEN) {
      runningWave = false;
      depthCm = 0;
      waveStep = 0;
      return;
    }
    depthCm = DEPTH_WAVE[waveStep];
  }
}

void runAutoDemo(unsigned long now) {
  switch (autoStep) {
    case 0:
      Serial.println(F("# Demo: left shoulder tap"));
      startTouchPulse(0, 800);
      autoStep = 1;
      stepStartMs = now;
      break;

    case 1:
      if (now - stepStartMs > 1200) {
        Serial.println(F("# Demo: right shoulder tap"));
        startTouchPulse(1, 800);
        autoStep = 2;
        stepStartMs = now;
      }
      break;

    case 2:
      if (now - stepStartMs > 1200) {
        Serial.println(F("# Demo: AED pads placed"));
        startAedHold(2500);
        autoStep = 3;
        stepStartMs = now;
      }
      break;

    case 3:
      if (now - stepStartMs > 3200) {
        Serial.println(F("# Demo: 30 compressions"));
        compressionCount = 0;
        nextCompressionMs = now;
        autoStep = 4;
      }
      break;

    case 4:
      if (now >= nextCompressionMs) {
        startDepthWave();
        compressionCount++;
        nextCompressionMs = now + 550;
        if (compressionCount >= 30) {
          Serial.println(F("# Demo: 2 rescue breaths"));
          breathCount = 0;
          nextCompressionMs = now + 900;
          autoStep = 5;
        }
      }
      break;

    case 5:
      if (now >= nextCompressionMs) {
        startBreathWave();
        breathCount++;
        nextCompressionMs = now + 900;
        if (breathCount >= 2) {
          Serial.println(F("# Demo: cycle complete — pause 5 s"));
          setIdle();
          autoStep = 6;
          stepStartMs = now;
        }
      }
      break;

    case 6:
      if (now - stepStartMs > 5000) {
        Serial.println(F("# Demo: restarting"));
        autoStep = 0;
        stepStartMs = now;
      }
      break;
  }
}

void pollSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toLowerCase();
  if (cmd.length() == 0) return;

  if (cmd == "help") {
    Serial.println(F("Commands: help | auto | stop | idle | shoulder_l | shoulder_r | aed | compress | breath"));
    return;
  }

  if (cmd == "auto") {
    autoDemo = true;
    autoStep = 0;
    stepStartMs = millis();
    setIdle();
    Serial.println(F("# Auto demo started"));
    return;
  }

  if (cmd == "stop") {
    autoDemo = false;
    setIdle();
    Serial.println(F("# Stopped"));
    return;
  }

  if (cmd == "idle") {
    autoDemo = false;
    setIdle();
    Serial.println(F("# Idle"));
    return;
  }

  if (cmd == "shoulder_l") {
    autoDemo = false;
    startTouchPulse(0, 800);
    Serial.println(F("# Left shoulder"));
    return;
  }

  if (cmd == "shoulder_r") {
    autoDemo = false;
    startTouchPulse(1, 800);
    Serial.println(F("# Right shoulder"));
    return;
  }

  if (cmd == "aed") {
    autoDemo = false;
    startAedHold(2000);
    Serial.println(F("# AED pads"));
    return;
  }

  if (cmd == "compress") {
    autoDemo = false;
    startDepthWave();
    Serial.println(F("# Compression"));
    return;
  }

  if (cmd == "breath") {
    autoDemo = false;
    startBreathWave();
    Serial.println(F("# Breath"));
    return;
  }

  Serial.print(F("# Unknown: "));
  Serial.println(cmd);
}
