/*
 * CPR Trainer — NodeMCU (ESP8266) mock sensor stream
 *
 * Sends the same 12-channel CSV as analog_v2 Arduino firmware over WiFi.
 * Use this to verify the web app connection without the Mega + USB cable.
 *
 * Protocol (newline-terminated text, ~10 Hz):
 *   # PROFILE analog_v2
 *   shoulder_l,shoulder_r,aed_u,aed_l,neck,depth_cm,breath_V,force,0,0,0,0
 *
 * Web app setup (Chrome on same WiFi):
 *   1. Settings (gear) → Connect tab
 *   2. Connection type: WiFi/TCP  (NOT USB Web Serial)
 *   3. Hardware profile: Analog v2
 *   4. IP = Serial Monitor IP below, Port = 81
 *   5. Tap Connect → open Serial Monitor tab
 *
 * Libraries (Arduino IDE → Library Manager):
 *   - ESP8266WiFi (board package)
 *   - WebSockets by Markus Sattler (links2004)
 *
 * Board: NodeMCU 1.0 (ESP-12E), 115200 baud Serial Monitor
 */

#include <ESP8266WiFi.h>
#include <WebSocketsServer.h>

// -------- WiFi — edit before upload --------
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

const uint16_t WS_PORT = 81;
const unsigned long LINE_INTERVAL_MS = 100;

WebSocketsServer webSocket(WS_PORT);

unsigned long lastLineMs = 0;
uint32_t tick = 0;

// Mock sensor state
int shoulder = 0;
int aedUpper = 0;
int aedLower = 0;
int neck = 0;
int depthCm = 11;
float breathV = 0.16f;
int force = 0;

void sendLine(uint8_t clientNum, const char* text) {
  if (clientNum == 255) {
    webSocket.broadcastTXT(text);
  } else {
    webSocket.sendTXT(clientNum, text);
  }
}

void sendProfileBanner(uint8_t clientNum) {
  sendLine(clientNum, "# PROFILE analog_v2");
  sendLine(clientNum, "# CPR Trainer NodeMCU mock — 12ch CSV WebSocket");
}

void updateMockSensors() {
  // ~3 s shoulder tap pulse
  shoulder = ((tick / 30) % 2 == 0 && (tick % 30) < 5) ? 1 : 0;

  // AED pads toggle every ~5 s (staggered)
  aedUpper = (tick % 50) < 8 ? 1 : 0;
  aedLower = (tick % 50) >= 25 && (tick % 50) < 33 ? 1 : 0;

  // Neck tilt brief pulse every ~4 s
  neck = (tick % 40) >= 10 && (tick % 40) < 15 ? 1 : 0;

  // Compression wave every ~2 s (depth 11 → 6 → 11, force 0 → 120 → 0)
  const int wavePos = tick % 20;
  if (wavePos < 10) {
    depthCm = 11 - (wavePos * 5) / 10;       // 11 down toward 6
    force = wavePos * 12;                     // 0 → ~108
  } else {
    depthCm = 6 + ((wavePos - 10) * 5) / 10; // back toward 11
    force = (20 - wavePos) * 12;
  }
  if (depthCm < 6) depthCm = 6;
  if (depthCm > 11) depthCm = 11;
  if (force < 0) force = 0;
  if (force > 200) force = 200;

  // Breath wave every ~3 s (0.16 → 0.45 → 0.16 V)
  const int breathPos = tick % 30;
  if (breathPos < 15) {
    breathV = 0.16f + (breathPos * 0.29f) / 15.0f;
  } else {
    breathV = 0.45f - ((breathPos - 15) * 0.29f) / 15.0f;
  }
}

void sendCsvLine(uint8_t clientNum) {
  char line[96];
  snprintf(
    line,
    sizeof(line),
    "%d,%d,%d,%d,%d,%d,%.2f,%d,0,0,0,0",
    shoulder,
    shoulder,
    aedUpper,
    aedLower,
    neck,
    depthCm,
    breathV,
    force
  );
  sendLine(clientNum, line);
}

void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WS] client #%u disconnected\n", num);
      break;
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[WS] client #%u connected from %s\n", num, ip.toString().c_str());
      sendProfileBanner(num);
      sendCsvLine(num);
      break;
    }
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println();
  Serial.println("CPR Trainer NodeMCU mock starting...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("WiFi connecting");
  uint8_t attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 60) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi failed — check SSID/password in sketch");
    return;
  }

  Serial.print("WiFi OK  IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("WebSocket ws://");
  Serial.print(WiFi.localIP());
  Serial.print(":");
  Serial.println(WS_PORT);
  Serial.println("In app: Connection type WiFi/TCP, port 81, profile Analog v2");

  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
}

void loop() {
  webSocket.loop();

  unsigned long now = millis();
  if (now - lastLineMs < LINE_INTERVAL_MS) {
    return;
  }
  lastLineMs = now;
  tick++;

  updateMockSensors();
  sendCsvLine(255); // broadcast to all clients
}
