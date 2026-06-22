# CPR Trainer

Tablet- and desktop-friendly CPR training app built with **Expo (React Native)** and an optional **Express** backend for Arduino sensor data.

This guide covers **cloning the repo and running the web version** in a browser—the fastest way for clients and reviewers to try the app without an Android build.

---

## What works in the web browser

| Feature | Web support |
|--------|-------------|
| Full CPR step flow (Training / Testing / C.O.L.S.) | Yes |
| Camera preview | Yes (allow browser camera permission) |
| Pose tracking (skeleton, sternal zone, posture tips) | Yes — **MoveNet** via TensorFlow.js |
| Hand placement verification (~1.5s good posture) | Yes — on **step 4 (Hand Placement)** |
| Arduino USB via Web Serial | Yes — **Chrome/Edge**, plug Arduino into PC, Settings → **USB (Web Serial)** |
| Arduino USB (OTG) | No — use **Android dev build** |
| Sensor simulation (no hardware) | Yes — turn off **Hardware Only Mode** in Settings |

**Recommended browser:** Chrome or Edge (latest). Safari may work; camera and speech features vary by browser.

**Do not use Expo Go** for pose on Android—that requires a custom dev client (`npx expo run:android`). The web app does not need Expo Go.

---

## Prerequisites

Install on the machine that will run the app:

1. **Git** — [https://git-scm.com/downloads](https://git-scm.com/downloads)
2. **Node.js 20 LTS** (18+ usually works) — [https://nodejs.org](https://nodejs.org)  
   Check versions:
   ```bash
   node -v
   npm -v
   ```
3. A **webcam** (built-in or USB) for pose/camera steps
4. Stable **internet** on first run (downloads the MoveNet pose model, ~few MB)

Optional (only if using Arduino via **WebSocket** instead of direct USB):

- **Backend server** — same repo, second terminal (see [Optional: backend server for Arduino WebSocket](#optional-backend-server-for-arduino-websocket))

---

## 1. Clone the repository

```bash
git clone https://github.com/navaneethdubbaka/CPR-Training-Android-app.git
cd CPR16
```

Replace `https://github.com/navaneethdubbaka/CPR-Training-Android-app.git` with the Git URL your team provides (HTTPS or SSH).

---

## 2. Install dependencies

From the project root:

```bash
npm install
```

This runs `patch-package` automatically after install (required for some native modules).

**Windows (PowerShell)** — same commands; if scripts are blocked, use:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## 3. Start the web app

```bash
npx expo start --web
```

Or:

```bash
npm start
```

Then press **`w`** in the terminal to open the browser if it does not open automatically.

The app is usually served at:

**http://localhost:8081**

### Clear cache after pulling updates

If you see red Metro errors (especially after TensorFlow or dependency changes):

```bash
npx expo start --web --clear
```

---

## 4. First-time setup in the browser

### Allow camera

When prompted, choose **Allow** for camera access on `localhost`. Without it, the camera panel stays black or shows an error with a **Retry** button.

### Connect Arduino via USB (web — primary hardware path)

1. Flash the Arduino sketch from `attached_assets/final_arduino_code_*.ino` at **115200 baud**.
2. Plug the Arduino into the **same PC** running the browser via USB.
3. Open **Settings → Connection**. The default mode is **USB (Web Serial)** (Chrome or Edge required).
4. Tap **Connect** on the start screen or in Settings.
5. Chrome shows a **COM port picker** — select your Arduino board.
6. Open Settings → **Serial** tab to confirm CSV lines are streaming (~10 Hz).

If you cancel the port picker or Web Serial is unavailable, turn **Hardware Only Mode OFF** to use simulation, or choose **WebSocket** in Settings if using the Node server instead.

### Turn off Hardware Only Mode (demo without Arduino)

By default the app expects **physical Arduino** sensors. For a **web-only demo**:

1. Open **Settings** (gear on the start screen).
2. Go to the **Connection** tab.
3. Turn **Hardware Only Mode** **OFF**.
4. Close Settings.

You can then **Start** training even if status shows “Simulation” / not connected. Simulation controls appear during training for testing steps without hardware.

### Choose a mode

| Mode | Use |
|------|-----|
| **Training** | Guided flow with hints |
| **Testing** | Evaluated flow; early steps show **pose preview** on web |
| **C.O.L.S.** | Compression-only endurance screen |

For trying **pose + skeleton**, **Testing** or **Training** through to **step 4 — Hand Placement** is best.

---

## 5. Using pose on the web (low-angle tablet setup)

### Step-scoped pose modes

| Steps | Camera | Pose checks |
|-------|--------|-------------|
| 1–3 (scene safety → call for help) | On | **Frame + look down only** (head & shoulders in box) |
| 4–5 (hand placement → compressions) | On | **Full CPR pose** (ears, elbows, triangle, wrists) |
| 6–8 (AED pads → shock) | **Off** | Paused — focus on AED panel |
| 9 (post-shock CPR) | On | **Full CPR pose** + 2×30:2 cycles, then Completion |

You **cannot continue** until framing requirements are met for **~1 second** (skipped on AED steps).

### Camera placement

Place the **phone or tablet on the ground at ~45°**, **front camera** facing the person performing CPR (screen toward the performer). Early steps only require **head and shoulders** in the tall **ALIGN IN FRAME** box; from step 4 onward, wrists should also be visible.

### What you should see

1. Wait for **“Loading pose model…”** then **POSE · wasm** or **POSE · webgl** (first load ~15–30 s).
2. **Framing box** — red **ALIGN IN FRAME** → green **READY TO START** when requirements are met.
3. **Ring-style joint markers** on shoulders, elbows, wrists (full pose steps).
4. **Live cue chips** — frame + look down on steps 1–3; all five chips from step 4 onward.
5. **Voice cues** (web) — logged to the session report on the completion screen.

### Hand placement (step 4)

Hold **full good posture** for **1.5 seconds** to auto-verify (ears, look down, straight elbows, triangle). Or use **Verify Hands** in simulation mode.

### Post-shock CPR (step 9 — final step)

After AED shock, complete **2 full 30:2 cycles** (compressions + rescue breaths) with the same pose and feedback as step 5. The app then goes straight to the **Completion screen** (no separate step 10). Cycle count is configurable via `POST_SHOCK_CYCLES_TRAINING` in `constants/cpr-protocol.ts`.

### Session log & snapshots (web)

Coaching alerts (pose + sensor) are recorded during training. **One snapshot** is captured on the first camera step; up to **4 additional random snapshots** may be taken later. On the **completion screen**, the Session Log header always shows alert/snapshot counts — expand it and use **Download Report (JSON)** to export.

### Force sensors (optional hardware)

Assign **Compression Force** to a **dedicated** analog channel (not shared with breath pressure) in Settings. Calibrate **offset** at rest. When depth is unavailable, compressions are detected from force peaks; when both are on separate channels, both peaks must pass thresholds.

### Simulation mode — compressions not counting?

1. Settings → **Hardware Only Mode** → **OFF**
2. Start training (simulation connects automatically)
3. On step 5 or 9, tap **Push Down** in the simulation panel — each tap runs a full press/release waveform
4. After **30** compressions, the breath panel appears; tap **Give Breath** twice per cycle

### Limitations (share with trainees)

- **Looking down** is inferred from 2D head pose, not eye gaze; accuracy depends on keeping the tablet near 45°.
- **Ear visibility** can fail with hoods, long hair, or backlight.
- **Elbow straightness** is judged in 2D; extreme side angles reduce accuracy.

---

## Optional: backend server for Arduino WebSocket

Only needed if you connect Arduino through the **PC running the server** using **WebSocket mode** in Settings (not the default web path — use **USB (Web Serial)** for direct browser USB).

**Terminal 1 — backend (port 5000):**

```bash
npm run server:dev
```

**Terminal 2 — web app:**

```bash
npx expo start --web
```

The web client talks to `http://localhost:5000` (WebSocket `/ws/arduino`) only when **WebSocket** is selected in Settings → Connection.

---

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Metro error about `@tensorflow/tfjs` | Stop the server, run `npx expo start --web --clear`, hard-refresh browser (Ctrl+Shift+R) |
| **Model unavailable** | Check internet; click **Retry model load**; allow `cdn.jsdelivr.net` and Google storage if on a restricted network |
| Black camera / permission denied | Browser site settings → allow Camera for localhost; click **Allow camera & retry** |
| Cannot start training | Settings → **Hardware Only Mode** → OFF |
| Push Down does not count compressions | Hardware Only OFF; ensure simulation is connected; tap Push Down once per compression (wait ~0.5s between taps) |
| No skeleton, but camera works | Wait for model to finish loading; improve lighting; show shoulders, elbows, wrists |
| Port 8081 in use | Stop other Expo/Node processes or run `npx expo start --web --port 8082` |

---

## Project structure (short)

| Path | Purpose |
|------|---------|
| `app/` | Expo Router screens (main training UI) |
| `components/` | UI including `PoseCameraView`, camera, AED, feedback |
| `lib/pose-analysis.ts` | CPR posture rules (shared web + Android) |
| `lib/cpr-pose-constants.ts` | Low-angle framing zone, thresholds, triangle overlay |
| `lib/pose-detection-web.ts` | Web MoveNet (TensorFlow.js) |
| `assets/models/movenet_lightning.tflite` | Android pose model (not used on web) |
| `server/` | Express API + Arduino WebSocket |
| `constants/cpr-protocol.ts` | CPR steps and targets |

---

## Android (not web) — quick pointer

Pose on a **physical Android tablet/phone** uses a **custom dev build** (Vision Camera + TFLite), not Expo Go:

```bash
npx expo run:android
```

See `replit.md` in the repo for hardware/USB details.

---

## Support checklist for clients

- [ ] Node 20 installed  
- [ ] `git clone` + `npm install` completed  
- [ ] `npx expo start --web --clear` runs without errors  
- [ ] Browser opened to localhost  
- [ ] Camera allowed  
- [ ] Hardware Only Mode **off** for demo without Arduino  
- [ ] Pose badge shows **wasm** or **webgl** after model load  
- [ ] Step 4 Hand Placement tested for posture feedback  

For repository access issues or environment-specific blocks (firewall, VPN), contact your development team with the exact error text from the browser console (F12 → Console) and the terminal.
