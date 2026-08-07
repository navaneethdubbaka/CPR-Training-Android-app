# NodeMCU mock sensor stream (WiFi — optional)

**For USB like Arduino Mega, use [`nodemcu_mock_serial/`](nodemcu_mock_serial/) instead — no WiFi.**

This folder is only if you want wireless WebSocket testing.

## Flash

1. Arduino IDE → Board: **NodeMCU 1.0 (ESP-12E Module)**
2. Install library: **WebSockets** by Markus Sattler (links2004)
3. Edit `WIFI_SSID` and `WIFI_PASS` in `nodemcu_mock_ws.ino`
4. Upload → open **Serial Monitor** at **115200**
5. Note the printed **IP address** (e.g. `192.168.1.42`)

## Web app connection

1. PC and NodeMCU on the **same WiFi**
2. Run web app: `npx expo start --web` → http://localhost:8081
3. **Settings** (gear) → **Connect** tab
4. **Connection type:** **WiFi/TCP** (not USB Web Serial)
5. **Hardware profile:** **Analog v2**
6. **IP:** from Serial Monitor  
7. **Port:** **81**
8. Tap **Connect** on start screen or Settings
9. **Serial** tab → expect:
   - `# PROFILE analog_v2`
   - CSV lines every ~100 ms with changing mock values

## Mock behavior

| Channel | Mock pattern |
|---------|----------------|
| Shoulder (0,1) | Brief tap every ~3 s |
| AED upper/lower | Periodic placement |
| Neck | Short tilt pulse |
| Depth (ch5) | Compression wave ~6–11 cm |
| Breath (ch6) | ~0.16–0.45 V wave |
| Force (ch7) | 0–~120 with depth |

## Troubleshooting

- **Connection failed:** wrong IP, wrong port (use 81), or PC not on same WiFi
- **Web Serial won't work** for NodeMCU — use WiFi/TCP only on web
- **No data after connect:** check Serial Monitor on NodeMCU shows `client connected`
