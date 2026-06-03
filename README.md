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

Optional (only if using real Arduino over WebSocket):

- **Backend server** — same repo, second terminal (see [Optional: backend server](#optional-backend-server-for-arduino-websocket))

---

## 1. Clone the repository

```bash
git clone <YOUR_REPO_URL>
cd CPR16
```

Replace `<YOUR_REPO_URL>` with the Git URL your team provides (HTTPS or SSH).

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

## 5. Using pose on the web

1. Start a session and advance to steps that show the camera (Testing shows preview earlier; **Hand Placement** is step **4**).
2. Wait for **“Loading pose model…”** then a badge like **POSE · wasm** or **POSE · webgl** (first load can take 15–30 seconds).
3. Frame your **upper body and arms** in the camera.
4. Overlays you should see:
   - **Skeleton** (lines/dots on body)
   - **STERNAL TARGET** (red box on chest area)
   - Feedback: arms straight, position, tips
5. On **Hand Placement**, hold **good** posture (straight arms + lean forward) for about **1.5 seconds** to auto-verify and advance—or use **Verify Hands** in simulation if pose is not available.

Overlay text **“Pose preview — hold good posture at Hand Placement to advance”** means you are on an early step with camera preview; full auto-advance from pose applies on **Hand Placement**.

---

## Optional: backend server for Arduino WebSocket

Only needed if you connect a real Arduino through the **PC running the server** (not required for web simulation demo).

**Terminal 1 — backend (port 5000):**

```bash
npm run server:dev
```

**Terminal 2 — web app:**

```bash
npx expo start --web
```

The web client talks to `http://localhost:5000` (WebSocket `/ws/arduino`) when using server-backed connection modes in Settings.

---

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Metro error about `@tensorflow/tfjs` | Stop the server, run `npx expo start --web --clear`, hard-refresh browser (Ctrl+Shift+R) |
| **Model unavailable** | Check internet; click **Retry model load**; allow `cdn.jsdelivr.net` and Google storage if on a restricted network |
| Black camera / permission denied | Browser site settings → allow Camera for localhost; click **Allow camera & retry** |
| Cannot start training | Settings → **Hardware Only Mode** → OFF |
| No skeleton, but camera works | Wait for model to finish loading; improve lighting; show shoulders, elbows, wrists |
| Port 8081 in use | Stop other Expo/Node processes or run `npx expo start --web --port 8082` |

---

## Project structure (short)

| Path | Purpose |
|------|---------|
| `app/` | Expo Router screens (main training UI) |
| `components/` | UI including `PoseCameraView`, camera, AED, feedback |
| `lib/pose-analysis.ts` | CPR posture rules (shared web + Android) |
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
