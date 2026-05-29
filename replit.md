# CPR Trainer - Emergency Response Training Application

## Overview
A tablet-optimized CPR training application that connects to Arduino via USB OTG and integrates camera vision for comprehensive emergency response training. Built with Expo/React Native and Express backend.

## Architecture
- **Frontend**: Expo Router (file-based routing), React Native, responsive layout (phone + tablet, portrait + landscape)
- **Backend**: Express.js on port 5000 (API + landing page)
- **State Management**: React Context (CPRTrainingContext) for training state
- **Hardware**: Dual connection modes — USB OTG (Android, primary) + WebSocket via backend (web/desktop, secondary)
- **Camera**: expo-camera for hand placement verification
- **WebSocket**: Backend serves /ws/arduino for real-time sensor data streaming (secondary connection)
- **USB Serial**: `react-native-usb-serialport-for-android` for direct USB OTG on Android (primary connection)

## Connection Modes
1. **USB (OTG)** — Primary on Android. Arduino via USB OTG cable. `react-native-usb-serialport-for-android`. Requires custom dev build.
2. **BLE (Bluetooth LE)** — Arduino with BLE module (HM-10, ESP32 BLE). `react-native-ble-plx`. Scans for UART service.
3. **WiFi/TCP** — Arduino with ESP32, ESP8266, or Ethernet shield. `react-native-tcp-socket`. Telnet-style TCP on host:port.
4. **Web Serial** — Chrome browser with USB Arduino. Native `navigator.serial` API. No package needed.
5. **WebSocket (Server)** — Backend WebSocket `/ws/arduino`. Backend has real Arduino via `serialport`. For web/desktop testing.
6. **Simulation** — Fallback when hardware-only mode is OFF and no hardware available.

`PreferredConnection` setting: `'auto' | 'usb' | 'ble' | 'tcp' | 'webserial' | 'websocket'` — Auto tries USB → BLE → TCP → WebSocket.

## Key Components
- `contexts/CPRTrainingContext.tsx` - Main training state management (exposes `hardwareOnly`, `connectionMode` state)
- `lib/usb-serial.ts` - Native USB serial manager for Android OTG (device listing, connect, read/write, line parsing)
- `lib/ble-serial.ts` - Bluetooth LE serial manager (scan, connect, Nordic UART service, data/status callbacks)
- `lib/tcp-serial.ts` - WiFi/TCP serial manager (react-native-tcp-socket on mobile, WebSocket fallback on web)
- `lib/webserial.ts` - Chrome Web Serial API wrapper (requestPort, read stream, write, vendor filters)
- `lib/arduino-serial.ts` - Frontend Arduino manager with all 5 transport modes + simulation, hardware-only toggle
- `server/arduino-serial.ts` - Backend Arduino serial port manager (real hardware connection for WebSocket mode)
- `constants/cpr-protocol.ts` - CPR step definitions and target metrics
- `components/SettingsModal.tsx` - Settings modal with Connection (hardware-only toggle, USB devices, serial ports), Assignments, Channels, and Serial Monitor tabs
- `components/SimulationControls.tsx` - Simulation buttons (hidden when hardware-only mode is active)
- `components/SensorStatus.tsx` - Connection status with USB/HW badge indicator
- `components/StartScreen.tsx` - Start screen with error state handling for hardware connection
- `components/StepIndicator.tsx` - Horizontally scrollable step indicator
- `components/` - All UI components (InstructionPanel, CompressionFeedback, BreathFeedback, etc.)

## Hardware-Only Mode
- Default: ON — all sensor inputs must come from physical Arduino hardware
- Toggle location: Settings > Connection tab > "Hardware Only Mode" switch
- When ON: no simulation fallback, SimulationControls hidden, error state shown if connection fails
- When OFF: simulation fallback enabled, SimulationControls visible during training
- `arduinoSerial.getHardwareOnly()` / `setHardwareOnly()` control the mode
- SensorStatus shows "USB" badge when connected via USB OTG, "HW" badge when hardware-only via WebSocket

## USB OTG Setup (Android)
- Requires custom development build (not Expo Go): `npx expo run:android` or EAS Build
- `expo-dev-client` installed for custom native builds
- `react-native-usb-serialport-for-android` provides native USB serial access
- `app.json` configured with USB host permissions and intent filters
- Supported boards: Arduino Mega 2560 (VID 0x2341/0x2A03, PID 0x0010/0x0042), plus other Arduino boards
- Settings > Connection shows "USB Devices (OTG)" section on Android with device list and scan button

## CPR Protocol Steps (11 steps)
1. Scene Safety, 2. Check Responsiveness, 3. Call 911, 4. Check Breathing,
5. Hand Placement, 6. Compressions, 7. Open Airway, 8. Rescue Breaths,
9. AED Pad Placement, 10. AED Analysis, 11. Deliver Shock + Post-Shock

## Responsive Layout
- Detects screen size and orientation via `useWindowDimensions()`
- Landscape tablet (width >= 600): side-by-side panels
- Portrait/phone (width < 600): stacked vertical layout with scrolling
- StepIndicator uses horizontal ScrollView for narrow screens

## Recent Changes
- 2026-02-20: Initial build - full CPR training app with all 11 steps
- Dark medical theme (navy/red), landscape orientation, split-screen layout
- Virtual phone (911 call), AED panel, compression/breath feedback
- 2026-02-20: Added Settings modal with Connection config and Sensor Directory tabs
- 2026-02-20: Added real Arduino hardware support via backend serial communication
- 2026-02-20: Upgraded to 12-channel Arduino format with configurable sensor assignments
  - Backend parses 12 CSV channels: 5 I2C touch (MPR121), 1 ultrasonic, 1 analog, 5 digital buttons
  - Default baud rate changed to 115200
  - Settings modal has 4 tabs: Connection, Assignments, Channels, Serial Monitor
- 2026-02-20: Added responsive layout and serial monitor
- 2026-02-26: Added Hardware-Only Mode
- 2026-02-26: Added USB OTG serial support for Android
  - Direct Arduino connection via USB OTG cable on Android phones/tablets
  - `lib/usb-serial.ts` native USB serial manager
  - Dual connection mode: USB (primary on Android) + WebSocket (secondary)
  - Settings shows USB device list with scan button on Android
  - SensorStatus shows "USB" badge when connected via OTG
  - Requires custom dev build (expo-dev-client), not Expo Go
- 2026-04-04: COLS Module Refactor & EAS Build Config
  - Renamed "Endurance" mode → "C.O.L.S." (Compression Only Life Support) throughout UI
  - cpr-protocol.ts: 10-step sequence (removed check_breathing, open_airway, rescue_breaths)
  - 30:2 cycle-based compressions step: cyclePhase (compress/breathe), 5 cycles training, 1 cycle testing
  - Voice recognition for scene_safety, check_responsiveness, call_911 — no VirtualPhone
  - Single shoulder tap (left OR right) for check_responsiveness
  - post_aed_compressions requires only 2 compressions (POST_AED_COMPRESSIONS_REQUIRED)
  - InstructionPanel: dual-condition UI for responsiveness, cycle tracker UI for compressions
  - SimulationControls: cyclePhase-aware (shows breath sim during breathe phase)
  - CPRTrainingContext: cycle state exposed (cyclePhase, cycleCompressionCount, cycleBreathCount, completedCycles)
  - AEDPanel: removed energy level selector (simplified)
  - eas.json: development APK + preview APK + production AAB profiles
- 2026-04-09: Android APK build fixes (patch-package approach)
  - Task #7: Fixed all expo doctor package version mismatches for SDK 54
  - Task #8→reverted: newArchEnabled originally disabled then re-enabled (see below)
  - Task #9: Added patches/react-native-usb-serialport-for-android+0.5.0.patch — removes old AGP 3.5.3 buildscript block, adds namespace, updates compileSdk/targetSdk to 35, replaces react-native:+ with react-android
  - Task #10: Removed react-native-keyboard-controller (unused, caused duplicate class errors)
  - Added patches/react-native-tcp-socket+6.4.1.patch — adds namespace, updates compileSdk/targetSdk to 35, replaces react-native:+ with react-android
  - newArchEnabled: true (required by react-native-worklets and react-native-reanimated v4; old-arch libraries work via RN 0.81 interop layer)
- 2026-04-10: Task #14 — USB camera + MoveNet body pose detection for hand_placement step
  - react-native-vision-camera + react-native-fast-tflite for on-device pose inference
  - MoveNet Lightning PTQ TFLite model (2.76MB) bundled at assets/models/movenet_lightning.tflite
  - PoseCameraView: skeleton overlay, sternal zone rectangle, arm posture feedback, 1.5s good-posture gate
  - usePoseDetector hook in lib/pose-detection.ts; detectPose() worklet adapter exported
  - USB/external camera support in-view toggle and Settings → Connection camera picker
- 2026-04-10: Task #15 — Bundled MP4 videos for CPR steps
  - assets/videos/ folder for placing MP4 files directly in the app bundle
  - metro.config.js: added 'mp4' to assetExts so Metro bundles video files
  - lib/bundled-videos.ts: static registry mapping filenames to require() numbers; helpers for key resolution
  - lib/video-assignments.ts: unchanged — 'bundled:<filename>' prefix stored as plain string
  - components/StepVideo.tsx: resolves bundled: keys via getBundledVideoSource() for expo-av
  - Settings → Videos tab: new "Bundled" button per step (Alert picker); Gallery button for gallery; remove button
  - assets/videos/demo.mp4: 1-second black demo video included as a bundled example
- 2026-04-10: Task #17 — Ultrasonic & breath sensor offset calibration
  - lib/arduino-serial.ts: ULTRASONIC_OFFSET_KEY + BREATH_OFFSET_KEY AsyncStorage keys
  - Private fields: ultrasonicOffset, breathOffset, offsetListeners
  - Public API: getUltrasonicOffset/setUltrasonicOffset, getBreathOffset/setBreathOffset
  - calibrateUltrasonic()/calibrateBreath() — snapshots current raw channel value as offset
  - onOffsetChange() subscription for UI sync; loadOffsets() called from app/_layout.tsx
  - transformRawToSensorData: applies offset (depth = max(0, raw-offset)) before emitting SensorData
  - components/SettingsModal.tsx: ChannelCard gets optional offset/onOffsetChange/onCalibrate props
  - Offset section in ChannelCard for ultrasonic + analog channels: [-] input [+] + Set Zero button
  - "Raw: X.X → Effective: Y.Y" live preview row shown when connected
  - Zeroed! success flash with haptic notification on calibrate
- 2026-04-10: Build readiness fixes
  - Fixed 5 TypeScript errors: removed duplicate `invertRow`/`invertLabel` styles in SettingsModal, fixed icon name `folder-video`→`image-multiple-outline`, fixed `PoseDetectorHook.frameProcessor` type to `ReadonlyFrameProcessor` (frame processor type mismatch in pose-detection.ts + PoseCameraView.tsx)
  - Added `assets/android/device_filter.xml` — USB VID/PID allow-list for Arduino Mega, Uno, Nano, CH340, CP2102, FTDI chips
  - Added `plugins/withUsbDeviceFilter.js` — Expo config plugin that copies device_filter.xml into res/xml/ and adds activity-level meta-data so Android auto-launches the app when Arduino OTG is attached
  - Registered `withUsbDeviceFilter` in app.json plugins array

## User Preferences
- Tablet landscape layout (also supports phone portrait)
- Touch sensors for shoulder responsiveness and AED pads
- Camera for hand placement verification
- Color-coded feedback (red/yellow/green)
- Hardware-only mode preferred (no simulation)
- USB OTG connection preferred on Android
