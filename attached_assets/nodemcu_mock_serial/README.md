# NodeMCU USB mock (no WiFi)

Use this sketch when you want **USB serial exactly like the Arduino Mega** — not WiFi.

## Flash

1. Board: **NodeMCU 1.0 (ESP-12E Module)**
2. Open `nodemcu_mock_serial.ino` (not `nodemcu_mock_ws.ino`)
3. **No libraries** required (no WiFi, no WebSockets)
4. Upload

## Serial Monitor (Arduino IDE)

- Baud **115200**
- You should see immediately:
  ```
  # PROFILE analog_v2
  # CPR Trainer NodeMCU USB mock — 12ch CSV @ 115200
  0,0,0,0,0,11,0.16,0,0,0,0,0
  ...
  ```
- If you only see dots `.....` you flashed the **WiFi** sketch by mistake — use this USB sketch instead.

## Web app (Chrome)

1. **Close Arduino IDE Serial Monitor** (one app per USB port)
2. `npx expo start --web` → http://localhost:8081
3. Settings → **Connect** tab
4. Connection type: **USB (Web Serial)** — not WiFi/TCP
5. Hardware profile: **Analog v2**
6. Baud: **115200**
7. Tap **Connect** → pick the NodeMCU COM port (often **CH340**)
8. Settings → **Serial** tab → same CSV as IDE monitor

## WiFi sketch

`nodemcu_mock_ws/` is only if you want wireless testing. For direct USB like Arduino, use **this folder**.
