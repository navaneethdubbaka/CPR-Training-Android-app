import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nativeUsbSerial, pickPreferredUsbDevice, type UsbDevice } from './usb-serial';
import { bleSerial, type BleDevice } from './ble-serial';
import { tcpSerial, type TcpConfig } from './tcp-serial';
import { webSerial } from './webserial';
import { COMPRESSIONS_PER_CYCLE, BREATHS_PER_CYCLE } from '@/constants/cpr-protocol';
import {
  DEFAULT_HARDWARE_PROFILE_ID,
  ANALOG_V2_ASSIGNMENTS,
  ANALOG_V2_CHANNELS,
  assignmentsStorageKey,
  getHardwareProfile,
  isHardwareProfileId,
  type HardwareProfileId,
  type SensorChannelTemplate,
} from './hardware-profiles';

const INVERT_STORAGE_KEY = 'cpr_channel_inverts';
const ULTRASONIC_OFFSET_KEY = 'cpr_ultrasonic_offset';
const ULTRASONIC_MANUAL_CALIB_KEY = 'cpr_ultrasonic_manual_calib';
const BREATH_OFFSET_KEY = 'cpr_breath_offset';
const FORCE_OFFSET_KEY = 'cpr_force_offset';
const FORCE_MANUAL_CALIB_KEY = 'cpr_force_manual_calib';
const FORCE_MIN_PEAK_KEY = 'cpr_force_min_peak';
const PREFERRED_CONNECTION_KEY = 'cpr_preferred_connection';
const HARDWARE_PROFILE_KEY = 'cpr_hardware_profile';



export interface RawSensorData {
  channels: number[];
  timestamp: number;
}

export interface SensorData {
  touchSensors: {
    leftShoulder: boolean;
    rightShoulder: boolean;
    aedPadUpper: boolean;
    aedPadLower: boolean;
    neckTilt: boolean;
  };
  compressionDepth: number;
  compressionForce: number;
  compressionRate: number;

  compressionDetected: boolean;     // ONE cycle completed
  compressionPeak?: number;
  compressionForcePeak?: number;
  breathDetected: boolean;        // ONE breath cycle completed
  breathCount: number;           // Number of breaths in current cycle
  cycleCompressionCount: number; // Compressions in current COMPRESSION phase (0..30)
  airPressure: number;
  phase: 'COMPRESSION' | 'BREATH';
  timestamp: number;

}

export interface SensorChannel {
  index: number;
  name: string;
  type: 'i2c_touch' | 'analog_touch' | 'ultrasonic' | 'analog' | 'force' | 'digital';
  pin: string;
  unit: string;
  description: string;
  active: boolean;
  currentValue: number;
  inverted: boolean;
}

export type CPRFunction =
  | 'leftShoulder'
  | 'rightShoulder'
  | 'compressionDepth'
  | 'compressionForce'
  | 'breathPressure'
  | 'aedPadUpper'
  | 'aedPadLower'
  | 'neckTilt';

export const CPR_FUNCTION_LABELS: Record<CPRFunction, string> = {
  leftShoulder: 'Left Shoulder Tap',
  rightShoulder: 'Right Shoulder Tap',
  compressionDepth: 'Compression Depth',
  compressionForce: 'Compression Force',
  breathPressure: 'Breath Pressure',
  aedPadUpper: 'AED Pad Upper',
  aedPadLower: 'AED Pad Lower',
  neckTilt: 'Neck Tilt (Open Airway)',
};

export const CPR_FUNCTION_ICONS: Record<CPRFunction, string> = {
  leftShoulder: 'hand-wave',
  rightShoulder: 'hand-wave',
  compressionDepth: 'arrow-collapse-down',
  compressionForce: 'gauge',
  breathPressure: 'weather-windy',
  aedPadUpper: 'lightning-bolt',
  aedPadLower: 'lightning-bolt',
  neckTilt: 'rotate-3d-variant',
};

export const CPR_FUNCTION_DESCRIPTIONS: Record<CPRFunction, string> = {
  leftShoulder: 'Touch sensor for checking responsiveness (left)',
  rightShoulder: 'Touch sensor for checking responsiveness (right)',
  compressionDepth: 'Measures chest compression depth in cm',
  compressionForce: 'Measures compression force/pressure',
  breathPressure: 'Monitors rescue breath delivery pressure',
  aedPadUpper: 'Detects upper AED pad placement (right chest)',
  aedPadLower: 'Detects lower AED pad placement (left side)',
  neckTilt: 'Tilt sensor detecting head-tilt chin-lift (Open Airway step)',
};

export type SensorAssignments = Record<CPRFunction, number | null>;

export interface SensorInfo {
  id: string;
  name: string;
  type: 'touch' | 'pressure' | 'ultrasonic' | 'analog' | 'i2c_touch' | 'analog_touch' | 'force' | 'digital';
  pin: string;
  description: string;
  unit: string;
  active: boolean;
  currentValue: number | boolean;
  minValue?: number;
  maxValue?: number;
}

export type ArduinoConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type ArduinoConnectionMode = 'usb' | 'ble' | 'tcp' | 'webserial' | 'hardware' | 'simulation';
export type PreferredConnection = 'auto' | 'usb' | 'ble' | 'tcp' | 'webserial' | 'websocket';

const VALID_PREFERRED_CONNECTIONS: PreferredConnection[] = [
  'auto', 'usb', 'ble', 'tcp', 'webserial', 'websocket',
];

export interface ArduinoConfig {
  baudRate: number;
  port: string;
  dataBits: number;
  stopBits: number;
  parity: 'none' | 'even' | 'odd';
}

export interface AvailablePort {
  path: string;
  manufacturer?: string;
}

export interface SerialLogEntry {
  line: string;
  timestamp: number;
  direction: 'rx' | 'tx';
}



type SensorDataCallback = (data: SensorData) => void;
type SerialLineCallback = (entry: SerialLogEntry) => void;
type HardwareOnlyCallback = (hardwareOnly: boolean) => void;

const DEFAULT_BAUD_RATE = 115200;
const RX_WATCHDOG_MS = 1500;
const NO_RX_ERROR =
  'Port open but no serial data — check baud 115200 / cable / Mega firmware';
const FORCE_DISPLAY_MAX_N = 150;
const COMPRESSION_DEPTH_MAX_CM = 8;
const BASELINE_CAPTURE_MS = 1500;
const COMPRESSION_STEP_BASELINE_MS = 2000;
const COMPRESSION_DETECTION_GRACE_MS = 1000;
const COMPRESSION_DEBOUNCE_MS = 300;
const MIN_COMPRESSION_CYCLE_MS = 150;
const DEPTH_CYCLE_START_CM = 4.0;
const DEPTH_CYCLE_END_CM = 2.5;
const TOUCH_ON_SAMPLES = 5;
const TOUCH_OFF_SAMPLES = 2;
const ULTRASONIC_MEDIAN_WINDOW = 3;

const DEFAULT_CONFIG: ArduinoConfig = {
  baudRate: DEFAULT_BAUD_RATE,
  port: '/dev/ttyUSB0',
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
};

const DEFAULT_SENSOR_DATA: SensorData = {
  touchSensors: {
    leftShoulder: false,
    rightShoulder: false,
    aedPadUpper: false,
    aedPadLower: false,
    neckTilt: false,
  },
  compressionDepth: 0,
  compressionForce: 0,
  breathDetected: false,
  breathCount: 0,
  cycleCompressionCount: 0,
  compressionRate: 0,
  compressionDetected: false,
  airPressure: 0,
  phase: 'COMPRESSION',
  timestamp: Date.now(),
};

function buildRuntimeChannels(templates: SensorChannelTemplate[]): SensorChannel[] {
  return templates.map(ch => ({
    ...ch,
    type: ch.type as SensorChannel['type'],
    active: false,
    currentValue: 0,
    inverted: false,
  }));
}

const ARDUINO_CHANNELS: SensorChannel[] = buildRuntimeChannels(ANALOG_V2_CHANNELS);
const DEFAULT_ASSIGNMENTS: SensorAssignments = { ...ANALOG_V2_ASSIGNMENTS };

function getBackendUrl(): string {
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  if (Platform.OS === 'web') {
    return window.location.origin.replace(':8081', ':5000');
  }
  return 'http://localhost:5000';
}

function getWsUrl(): string {
  const base = getBackendUrl();
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/ws/arduino`;
}

class ArduinoSerialManager {
  private status: ArduinoConnectionStatus = 'disconnected';
  private config: ArduinoConfig = { ...DEFAULT_CONFIG };
  private listeners: Set<SensorDataCallback> = new Set();
  private statusListeners: Set<(status: ArduinoConnectionStatus) => void> = new Set();
  private configListeners: Set<(config: ArduinoConfig) => void> = new Set();
  private assignmentListeners: Set<(assignments: SensorAssignments) => void> = new Set();
  private serialLineListeners: Set<SerialLineCallback> = new Set();
  private hardwareOnlyListeners: Set<HardwareOnlyCallback> = new Set();
  private modeListeners: Set<(mode: ArduinoConnectionMode) => void> = new Set();
  private serialLog: SerialLogEntry[] = [];
  private maxSerialLogLines = 500;
  private channels: SensorChannel[] = buildRuntimeChannels(ANALOG_V2_CHANNELS);
  private assignments: SensorAssignments = { ...ANALOG_V2_ASSIGNMENTS };
  private profileId: HardwareProfileId = DEFAULT_HARDWARE_PROFILE_ID;
  private profileListeners: Set<(profileId: HardwareProfileId) => void> = new Set();
  private pendingProfileDetect: HardwareProfileId | null = null;
  private autoProfileSwitchNotice: HardwareProfileId | null = null;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsConnected = false;
  private mode: ArduinoConnectionMode = 'simulation';
  private _hardwareOnly = true;
  private preferredConnection: PreferredConnection = Platform.OS === 'web' ? 'webserial' : 'auto';
  private availablePorts: AvailablePort[] = [];
  private usbDevices: UsbDevice[] = [];
  private bleDevices: BleDevice[] = [];
  private selectedUsbDeviceId: number | null = null;
  private selectedBleDeviceId: string | null = null;
  private usbDataUnsub: (() => void) | null = null;
  private usbStatusUnsub: (() => void) | null = null;
  private bleDataUnsub: (() => void) | null = null;
  private bleStatusUnsub: (() => void) | null = null;
  private tcpDataUnsub: (() => void) | null = null;
  private tcpStatusUnsub: (() => void) | null = null;
  private wsDataUnsub: (() => void) | null = null;
  private wsStatusUnsub: (() => void) | null = null;
  private lastCompressionTime = 0;
  private compressionRate = 0;
  private channelInverts: boolean[] = new Array(12).fill(false);
  private invertListeners: Set<(inverts: boolean[]) => void> = new Set();
  private ultrasonicOffset = 0;
  private breathOffset = 0;
  private forceOffset = 0;
  private forceMinPeak = 30;
  private offsetListeners: Set<(ultrasonicOffset: number, breathOffset: number) => void> = new Set();
  private lastConnectionError = '';
  private rxSinceConnect = false;
  private errorListeners: Set<(message: string) => void> = new Set();
  private lastRawChannels: number[] = new Array(12).fill(0);
  private touchOnStreak: number[] = new Array(12).fill(0);
  private touchOffStreak: number[] = new Array(12).fill(0);
  private debouncedTouch: boolean[] = new Array(12).fill(false);
  private baselineCaptureActive = false;
  private baselineCaptureDeadline = 0;
  private depthBaselineSamples: number[] = [];
  private forceBaselineSamples: number[] = [];
  private compressionDetectionEnabled = true;
  private compressionDetectionEnableAt = 0;
  private lastCompressionDetectedAt = 0;
  private forceCycleStartAt = 0;
  private ultrasonicManuallyCalibrated = false;
  private forceManuallyCalibrated = false;
  private depthRawHistory: number[] = [];
  private lastValidDepthRaw = 0;

  private simulationInterval: ReturnType<typeof setInterval> | null = null;
  private simCompressionWaveTimer: ReturnType<typeof setTimeout> | null = null;
  private simState = {
    simDepth: 0,
    simForce: 0,
    compressionCount: 0,
    breathing: false,
    breathCount: 0,
    shoulderLeft: false,
    shoulderRight: false,
    aedUpper: false,
    aedLower: false,
    neckTilt: false,
  };

  getStatus(): ArduinoConnectionStatus {
    return this.status;
  }

  getLastConnectionError(): string {
    return this.lastConnectionError;
  }

  onConnectionErrorChange(callback: (message: string) => void): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  private setConnectionError(message: string) {
    this.lastConnectionError = message;
    this.errorListeners.forEach(cb => cb(message));
  }

  private clearConnectionError() {
    if (!this.lastConnectionError) return;
    this.lastConnectionError = '';
    this.errorListeners.forEach(cb => cb(''));
  }

  private markRxReceived() {
    this.rxSinceConnect = true;
  }

  private async waitForInitialRx(timeoutMs: number): Promise<boolean> {
    if (this.rxSinceConnect) return true;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.rxSinceConnect) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    return this.rxSinceConnect;
  }

  private async finalizeTransportConnect(mode: ArduinoConnectionMode): Promise<boolean> {
    this.rxSinceConnect = false;
    this.setMode(mode);
    this.setStatus('connected');
    this.clearConnectionError();

    const gotRx = await this.waitForInitialRx(RX_WATCHDOG_MS);
    if (!gotRx) {
      this.setConnectionError(NO_RX_ERROR);
      this.setStatus('error');
      this.disconnectActiveTransport(mode);
      return false;
    }

    console.log('[Arduino] Connected via', mode);
    this.startBaselineCapture(BASELINE_CAPTURE_MS);
    return true;
  }

  private disconnectActiveTransport(mode: ArduinoConnectionMode) {
    switch (mode) {
      case 'usb':
        nativeUsbSerial.disconnect();
        this.cleanupUsb();
        break;
      case 'ble':
        bleSerial.disconnect();
        this.cleanupBle();
        break;
      case 'tcp':
        tcpSerial.disconnect();
        this.cleanupTcp();
        break;
      case 'webserial':
        webSerial.disconnect();
        break;
    }
  }

  getMode(): ArduinoConnectionMode {
    return this.mode;
  }

  private setMode(mode: ArduinoConnectionMode) {
    if (this.mode !== mode) {
      this.mode = mode;
      this.modeListeners.forEach(cb => cb(mode));
    }
  }

  onModeChange(callback: (mode: ArduinoConnectionMode) => void): () => void {
    this.modeListeners.add(callback);
    return () => this.modeListeners.delete(callback);
  }

  getPreferredConnection(): PreferredConnection {
    return this.preferredConnection;
  }

  setPreferredConnection(pref: PreferredConnection) {
    this.preferredConnection = pref;
    AsyncStorage.setItem(PREFERRED_CONNECTION_KEY, pref).catch(() => { });
  }

  async loadPreferences(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(PREFERRED_CONNECTION_KEY);
      if (raw && VALID_PREFERRED_CONNECTIONS.includes(raw as PreferredConnection)) {
        this.preferredConnection = raw as PreferredConnection;
      } else if (Platform.OS === 'web') {
        this.preferredConnection = 'webserial';
      }
    } catch { }
    await this.loadHardwareProfile();
  }

  private shouldUseWebSerial(pref: PreferredConnection): boolean {
    if (Platform.OS !== 'web') return pref === 'webserial';
    return pref === 'webserial' || pref === 'usb' || pref === 'auto';
  }

  private async fallbackSimulationOrError(): Promise<boolean> {
    if (this._hardwareOnly) {
      if (!this.lastConnectionError) {
        this.setConnectionError('No hardware connection available');
      }
      this.setStatus('error');
      return false;
    }
    console.log('[Arduino] No hardware — simulation mode');
    this.setMode('simulation');
    await new Promise(r => setTimeout(r, 300));
    this.setStatus('connected');
    this.startSimulation();
    return true;
  }

  selectUsbDevice(deviceId: number) {
    this.selectedUsbDeviceId = deviceId;
  }

  selectBleDevice(deviceId: string) {
    this.selectedBleDeviceId = deviceId;
  }

  getBleDevices(): BleDevice[] {
    return [...this.bleDevices];
  }

  async scanBleDevices(timeoutMs = 5000): Promise<BleDevice[]> {
    if (!bleSerial.isAvailable()) return [];
    this.bleDevices = await bleSerial.scan(timeoutMs);
    return [...this.bleDevices];
  }

  isBleAvailable(): boolean {
    return bleSerial.isAvailable();
  }

  isWebSerialAvailable(): boolean {
    return webSerial.isAvailable();
  }

  getWebSerialHint(): string | null {
    return webSerial.getSecureContextHint();
  }

  getTcpConfig(): TcpConfig {
    return tcpSerial.getConfig();
  }

  setTcpConfig(config: Partial<TcpConfig>) {
    tcpSerial.setConfig(config);
  }

  getHardwareOnly(): boolean {
    return this._hardwareOnly;
  }

  setHardwareOnly(value: boolean) {
    this._hardwareOnly = value;
    this.hardwareOnlyListeners.forEach(cb => cb(value));

    if (value && this.mode === 'simulation') {
      this.stopSimulation();
      if (this.status === 'connected') {
        this.setStatus('disconnected');
      }
    }
  }

  onHardwareOnlyChange(callback: HardwareOnlyCallback): () => void {
    this.hardwareOnlyListeners.add(callback);
    return () => this.hardwareOnlyListeners.delete(callback);
  }

  getConfig(): ArduinoConfig {
    return { ...this.config };
  }

  getAvailablePorts(): AvailablePort[] {
    return [...this.availablePorts];
  }

  getUsbDevices(): UsbDevice[] {
    return [...this.usbDevices];
  }

  async refreshUsbDevices(): Promise<UsbDevice[]> {
    this.usbDevices = await nativeUsbSerial.listDevices();
    return [...this.usbDevices];
  }

  isUsbAvailable(): boolean {
    return nativeUsbSerial.isAvailable();
  }

  getChannels(): SensorChannel[] {
    return this.channels.map(c => ({ ...c }));
  }

  getHardwareProfileId(): HardwareProfileId {
    return this.profileId;
  }

  getFirmwarePath(): string {
    return getHardwareProfile(this.profileId).firmwarePath;
  }

  getPendingProfileDetect(): HardwareProfileId | null {
    return this.pendingProfileDetect;
  }

  clearPendingProfileDetect() {
    this.pendingProfileDetect = null;
  }

  getAutoProfileSwitchNotice(): HardwareProfileId | null {
    return this.autoProfileSwitchNotice;
  }

  clearAutoProfileSwitchNotice() {
    this.autoProfileSwitchNotice = null;
  }

  onProfileChange(callback: (profileId: HardwareProfileId) => void): () => void {
    this.profileListeners.add(callback);
    return () => this.profileListeners.delete(callback);
  }

  private applyProfile(profileId: HardwareProfileId, resetAssignments: boolean) {
    this.profileId = profileId;
    const profile = getHardwareProfile(profileId);
    this.channels = profile.channels.map(ch => ({
      ...ch,
      type: ch.type as SensorChannel['type'],
      active: false,
      currentValue: 0,
      inverted: this.channelInverts[ch.index] === true,
    }));
    if (resetAssignments) {
      this.assignments = { ...profile.defaultAssignments };
    }
    if (profileId === 'analog_v2') {
      const depthIdx = this.assignments.compressionDepth;
      if (depthIdx !== null && depthIdx >= 0 && depthIdx < 12) {
        this.channelInverts[depthIdx] = false;
        AsyncStorage.setItem(INVERT_STORAGE_KEY, JSON.stringify(this.channelInverts)).catch(() => { });
      }
    }
    this.channels = this.channels.map(ch => ({
      ...ch,
      inverted: this.channelInverts[ch.index] === true,
    }));
    const profileForceMin = profile.forceScale?.defaultMinPeak;
    if (profileForceMin !== undefined) {
      this.forceMinPeak = profileForceMin;
    }
    this.assignmentListeners.forEach(cb => cb(this.assignments));
    this.profileListeners.forEach(cb => cb(profileId));
  }

  async setHardwareProfile(
    profileId: HardwareProfileId,
    resetAssignments = true,
    persist = true,
  ): Promise<void> {
    if (profileId === this.profileId && !resetAssignments) return;
    this.applyProfile(profileId, resetAssignments);
    if (resetAssignments) {
      await this.persistAssignments();
    } else {
      await this.loadAssignmentsForProfile(profileId);
    }
    await this.loadForceMinPeakForProfile();
    if (persist) {
      await AsyncStorage.setItem(HARDWARE_PROFILE_KEY, profileId);
    }
  }

  async loadHardwareProfile(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(HARDWARE_PROFILE_KEY);
      const profileId = stored && isHardwareProfileId(stored)
        ? stored
        : DEFAULT_HARDWARE_PROFILE_ID;
      this.applyProfile(profileId, false);
      await this.loadAssignmentsForProfile(profileId);
      await this.loadForceMinPeakForProfile();
    } catch {
      this.applyProfile(DEFAULT_HARDWARE_PROFILE_ID, false);
    }
  }

  private async loadAssignmentsForProfile(profileId: HardwareProfileId): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(assignmentsStorageKey(profileId));
      if (!raw) {
        this.assignments = { ...getHardwareProfile(profileId).defaultAssignments };
        this.assignmentListeners.forEach(cb => cb(this.assignments));
        return;
      }
      const parsed = JSON.parse(raw) as Partial<SensorAssignments>;
      this.assignments = {
        ...getHardwareProfile(profileId).defaultAssignments,
        ...parsed,
      };
      this.assignmentListeners.forEach(cb => cb(this.assignments));
    } catch {
      this.assignments = { ...getHardwareProfile(profileId).defaultAssignments };
      this.assignmentListeners.forEach(cb => cb(this.assignments));
    }
  }

  private async persistAssignments(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        assignmentsStorageKey(this.profileId),
        JSON.stringify(this.assignments),
      );
    } catch { }
  }

  private forceMinPeakStorageKey(): string {
    return `${FORCE_MIN_PEAK_KEY}_${this.profileId}`;
  }

  private async loadForceMinPeakForProfile(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(this.forceMinPeakStorageKey());
      if (raw !== null) {
        this.forceMinPeak = parseFloat(raw) || getHardwareProfile(this.profileId).forceScale?.defaultMinPeak || 1.5;
        return;
      }
      const profileDefault = getHardwareProfile(this.profileId).forceScale?.defaultMinPeak;
      if (profileDefault !== undefined) {
        this.forceMinPeak = profileDefault;
      }
    } catch { }
  }

  getAssignments(): SensorAssignments {
    return { ...this.assignments };
  }

  setAssignment(fn: CPRFunction, channelIndex: number | null) {
    this.assignments[fn] = channelIndex;
    this.assignmentListeners.forEach(cb => cb(this.assignments));
    this.persistAssignments().catch(() => { });
  }

  onAssignmentChange(callback: (assignments: SensorAssignments) => void): () => void {
    this.assignmentListeners.add(callback);
    return () => this.assignmentListeners.delete(callback);
  }

  getChannelInverts(): boolean[] {
    return [...this.channelInverts];
  }

  setChannelInvert(channelIndex: number, inverted: boolean) {
    if (channelIndex < 0 || channelIndex >= 12) return;
    this.channelInverts[channelIndex] = inverted;
    this.invertListeners.forEach(cb => cb([...this.channelInverts]));
    AsyncStorage.setItem(INVERT_STORAGE_KEY, JSON.stringify(this.channelInverts)).catch(() => { });
  }

  onInvertChange(callback: (inverts: boolean[]) => void): () => void {
    this.invertListeners.add(callback);
    return () => this.invertListeners.delete(callback);
  }

  async loadInverts(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(INVERT_STORAGE_KEY);
      if (raw) {
        const parsed: boolean[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (let i = 0; i < 12; i++) {
            this.channelInverts[i] = parsed[i] === true;
          }
          this.channels = this.channels.map(ch => ({
            ...ch,
            inverted: this.channelInverts[ch.index] === true,
          }));
        }
      }
    } catch { }
  }

  private applyInvert(channelIndex: number, rawValue: number): number {
    if (!this.channelInverts[channelIndex]) return rawValue;
    const ch = this.channels[channelIndex];
    if (!ch) return rawValue;
    if (ch.type === 'digital' || ch.type === 'i2c_touch' || ch.type === 'analog_touch') {
      return rawValue > 0 ? 0 : 1;
    }
    const maxRange = ch.type === 'ultrasonic' ? 400 : ch.type === 'force' ? 600 : ch.type === 'analog' ? 5 : 1;
    return maxRange - rawValue;
  }

  setConfig(config: Partial<ArduinoConfig>) {
    this.config = { ...this.config, ...config };
    this.configListeners.forEach(cb => cb(this.config));

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set_config', config: this.config }));
    }
  }

  getBaudRate(): number {
    return this.config.baudRate;
  }

  setBaudRate(rate: number) {
    this.config.baudRate = rate;
    this.configListeners.forEach(cb => cb(this.config));

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set_config', config: { baudRate: rate } }));
    }
  }

  getSensorDirectory(): SensorInfo[] {
    return this.channels.map(ch => ({
      id: `channel_${ch.index}`,
      name: ch.name,
      type: ch.type as SensorInfo['type'],
      pin: ch.pin,
      description: ch.description,
      unit: ch.unit,
      active: ch.active,
      currentValue: (ch.type === 'i2c_touch' || ch.type === 'digital' || ch.type === 'analog_touch')
        ? ch.currentValue > 0
        : ch.currentValue,
      minValue: ch.type === 'ultrasonic' || ch.type === 'force' ? 0 : ch.type === 'analog' ? 0 : undefined,
      maxValue: ch.type === 'ultrasonic' ? 400 : ch.type === 'force' ? 600 : ch.type === 'analog' ? 5 : undefined,
    }));
  }

  private setStatus(status: ArduinoConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach(cb => cb(status));
  }

  onSensorData(callback: SensorDataCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  onStatusChange(callback: (status: ArduinoConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  onConfigChange(callback: (config: ArduinoConfig) => void): () => void {
    this.configListeners.add(callback);
    return () => this.configListeners.delete(callback);
  }

  onSerialLine(callback: SerialLineCallback): () => void {
    this.serialLineListeners.add(callback);
    return () => this.serialLineListeners.delete(callback);
  }

  getSerialLog(): SerialLogEntry[] {
    return [...this.serialLog];
  }

  clearSerialLog() {
    this.serialLog = [];
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'clear_serial_log' }));
    }
  }

  private addSerialLine(line: string, direction: 'rx' | 'tx') {
    const entry: SerialLogEntry = { line, timestamp: Date.now(), direction };
    this.serialLog.push(entry);
    if (this.serialLog.length > this.maxSerialLogLines) {
      this.serialLog = this.serialLog.slice(-this.maxSerialLogLines);
    }
    this.serialLineListeners.forEach(cb => cb(entry));
  }

  sendCommand(command: string, lineEnding: string = '\n') {
    const fullCommand = command + lineEnding;
    switch (this.mode) {
      case 'usb':
        nativeUsbSerial.send(fullCommand);
        break;
      case 'ble':
        bleSerial.send(fullCommand);
        break;
      case 'tcp':
        tcpSerial.send(fullCommand);
        break;
      case 'webserial':
        webSerial.send(fullCommand);
        break;
      case 'hardware':
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'send_command', command: fullCommand }));
        }
        break;
    }
    this.addSerialLine(command, 'tx');
  }

  private emit(data: SensorData) {
    this.listeners.forEach(cb => cb(data));
  }

  private getChannelValue(channelIndex: number | null): number {
    if (channelIndex === null || channelIndex < 0 || channelIndex >= this.channels.length) return 0;
    return this.channels[channelIndex].currentValue;
  }

  private transformRawToSensorData(rawChannels: number[]): SensorData {
    const getVal = (fn: CPRFunction): number => {
      const idx = this.assignments[fn];
      if (idx === null || idx < 0) return 0;
      const ch = this.channels.find(c => c.index === idx);
      if (ch) return ch.currentValue;
      if (idx >= rawChannels.length) return 0;
      return rawChannels[idx] || 0;
    };

    const depthIdx = this.assignments.compressionDepth;
    const forceIdx = this.assignments.compressionForce;
    const rawDepthStandoff = depthIdx !== null ? this.lastRawChannels[depthIdx] ?? 0 : 0;
    const rawForceReading = forceIdx !== null ? this.lastRawChannels[forceIdx] ?? 0 : 0;
    const depthVal = this.computeCompressionDepthCm(rawDepthStandoff);
    const forceVal = this.computeForceN(rawForceReading);

    const rawPressure = getVal('breathPressure');
    const pressureForDetection = Math.max(0, rawPressure - this.breathOffset);
    const profile = getHardwareProfile(this.profileId);
    const pressureVal = profile.breathInput === 'voltage' && profile.breathVoltageToCmH2O
      ? pressureForDetection * profile.breathVoltageToCmH2O
      : pressureForDetection;

    let compressionDetected = false;
    let emitDepthPeak = 0;
    let emitForcePeak = 0;
    let breathDetected = false;
    let emitCycleCompressionCount = this.cycleCompressionCount;
    let emitBreathCount = this.cycleBreathCount;
    let emitPhase: 'COMPRESSION' | 'BREATH' = this.phase;

    if (this.phase === 'COMPRESSION') {
      this.updateCompressionDetectionGate();
      const detectionAllowed = this.compressionDetectionEnabled && !this.baselineCaptureActive;
      if (detectionAllowed) {
        const detectResult = this.detectCompressionCycle(depthVal, forceVal);
        compressionDetected = detectResult.detected;
        emitDepthPeak = detectResult.depthPeak;
        emitForcePeak = detectResult.forcePeak;

        if (compressionDetected) {
          const now = Date.now();
          if (now - this.lastCompressionDetectedAt < COMPRESSION_DEBOUNCE_MS) {
            compressionDetected = false;
          } else {
            this.lastCompressionDetectedAt = now;
          }
        }

        if (compressionDetected) {
          this.cycleCompressionCount++;
          emitCycleCompressionCount = this.cycleCompressionCount;
          emitPhase = 'COMPRESSION';

          if (this.cycleCompressionCount >= COMPRESSIONS_PER_CYCLE) {
            emitCycleCompressionCount = COMPRESSIONS_PER_CYCLE;
            emitPhase = 'BREATH';
            this.phase = 'BREATH';
            this.cycleCompressionCount = 0;
            this.breathState = 'IDLE';
            this.peakPressure = 0;
          }
        }
      }
    } else if (this.phase === 'BREATH') {
      breathDetected = this.detectBreathCycle(pressureForDetection);

      if (breathDetected) {
        this.cycleBreathCount++;
        emitBreathCount = this.cycleBreathCount;
        emitPhase = 'BREATH';

        if (this.cycleBreathCount >= BREATHS_PER_CYCLE) {
          emitBreathCount = BREATHS_PER_CYCLE;
          emitPhase = 'BREATH';
          this.phase = 'COMPRESSION';
          this.cycleBreathCount = 0;
          this.compressionState = 'IDLE';
          this.peakDepth = 0;
        }
      }
    }

    return {
      touchSensors: {
        leftShoulder: getVal('leftShoulder') > 0,
        rightShoulder: getVal('rightShoulder') > 0,
        aedPadUpper: getVal('aedPadUpper') > 0,
        aedPadLower: getVal('aedPadLower') > 0,
        neckTilt: getVal('neckTilt') > 0,
      },
      compressionDepth: depthVal,
      compressionForce: forceVal,
      compressionRate: this.compressionRate,

      // satya IMPORTANT OUTPUT
      compressionDetected,
      compressionPeak: compressionDetected ? emitDepthPeak : undefined,
      compressionForcePeak: compressionDetected ? emitForcePeak : undefined,
      breathDetected: breathDetected,
      breathCount: emitBreathCount,
      cycleCompressionCount: emitCycleCompressionCount,

      airPressure: pressureVal,
      phase: emitPhase,
      timestamp: Date.now(),
    };
  }

  private applyInversion(ch: SensorChannel, val: number): number {
    if (!ch.inverted) return val;
    if (ch.type === 'i2c_touch' || ch.type === 'digital' || ch.type === 'analog_touch') {
      return val > 0 ? 0 : 1;
    }
    const maxVal = ch.type === 'ultrasonic' ? 400 : ch.type === 'force' ? 600 : ch.type === 'analog' ? 5 : 1;
    return Math.max(0, maxVal - val);
  }

  private normalizeChannelValue(ch: SensorChannel, rawVal: number): number {
    if (ch.type === 'analog_touch' && rawVal > 1) {
      const threshold = getHardwareProfile(this.profileId).analogTouchThreshold ?? 512;
      return rawVal >= threshold ? 1 : 0;
    }
    return rawVal;
  }

  private updateChannelsFromRaw(rawChannels: number[]) {
    const filtered = [...rawChannels];
    const depthIdx = this.assignments.compressionDepth;
    if (this.profileId === 'analog_v2' && depthIdx !== null && depthIdx < filtered.length) {
      filtered[depthIdx] = this.filterUltrasonicStandoff(filtered[depthIdx]);
    }

    for (let i = 0; i < 12; i++) {
      this.lastRawChannels[i] = i < filtered.length ? filtered[i] : 0;
    }

    this.channels = this.channels.map((ch, i) => {
      const rawVal = i < filtered.length ? filtered[i] : 0;
      const normalized = this.normalizeChannelValue(ch, rawVal);
      const isBinary = ch.type === 'i2c_touch' || ch.type === 'digital' || ch.type === 'analog_touch';
      const skipInvert = ch.type === 'ultrasonic' && this.profileId === 'analog_v2';

      let val: number;
      if (isBinary) {
        const rawActive = normalized > 0;
        if (rawActive) {
          this.touchOnStreak[i]++;
          this.touchOffStreak[i] = 0;
        } else {
          this.touchOffStreak[i]++;
          this.touchOnStreak[i] = 0;
        }
        if (!this.debouncedTouch[i] && this.touchOnStreak[i] >= TOUCH_ON_SAMPLES) {
          this.debouncedTouch[i] = true;
        }
        if (this.debouncedTouch[i] && this.touchOffStreak[i] >= TOUCH_OFF_SAMPLES) {
          this.debouncedTouch[i] = false;
        }
        val = this.debouncedTouch[i] ? 1 : 0;
        if (ch.inverted) {
          val = val > 0 ? 0 : 1;
        }
      } else {
        val = skipInvert ? normalized : this.applyInversion(ch, normalized);
      }

      return {
        ...ch,
        currentValue: val,
        active: isBinary ? val > 0 : val > 0,
      };
    });

    if (this.baselineCaptureActive) {
      this.collectBaselineSamples();
    }
  }

  setChannelInverted(channelIndex: number, inverted: boolean) {
    this.channels = this.channels.map(ch =>
      ch.index === channelIndex ? { ...ch, inverted } : ch
    );
    if (channelIndex >= 0 && channelIndex < 12) {
      this.channelInverts[channelIndex] = inverted;
      this.invertListeners.forEach(cb => cb([...this.channelInverts]));
      AsyncStorage.setItem(INVERT_STORAGE_KEY, JSON.stringify(this.channelInverts)).catch(() => { });
    }
  }

  getChannelInverted(channelIndex: number): boolean {
    const ch = this.channels.find(c => c.index === channelIndex);
    return ch ? ch.inverted : false;
  }

  getUltrasonicOffset(): number {
    return this.ultrasonicOffset;
  }

  getBreathOffset(): number {
    return this.breathOffset;
  }

  setUltrasonicOffset(v: number, manual = false) {
    this.ultrasonicOffset = v;
    if (manual) {
      this.ultrasonicManuallyCalibrated = true;
      AsyncStorage.setItem(ULTRASONIC_MANUAL_CALIB_KEY, '1').catch(() => { });
    }
    this.offsetListeners.forEach(cb => cb(this.ultrasonicOffset, this.breathOffset));
    AsyncStorage.setItem(ULTRASONIC_OFFSET_KEY, String(v)).catch(() => { });
  }

  setBreathOffset(v: number) {
    this.breathOffset = v;
    this.offsetListeners.forEach(cb => cb(this.ultrasonicOffset, this.breathOffset));
    AsyncStorage.setItem(BREATH_OFFSET_KEY, String(v)).catch(() => { });
  }

  //Satya Code
  private compressionState: 'IDLE' | 'COMPRESSING' | 'RELEASING' = 'IDLE';
  private forceCompressionState: 'IDLE' | 'COMPRESSING' | 'RELEASING' = 'IDLE';
  private lastDepthForDepth = 0;
  private lastForceForDepth = 0;
  private lastForceForForce = 0;
  private peakDepth = 0;
  private peakForce = 0;

  private breathState: 'IDLE' | 'INHALE' | 'EXHALE' = 'IDLE';
  private lastPressure = 0;
  private peakPressure = 0;

  private phase: 'COMPRESSION' | 'BREATH' = 'COMPRESSION';

  private cycleCompressionCount = 0;
  private cycleBreathCount = 0;

  setPhase(phase: 'COMPRESSION' | 'BREATH') {
    this.phase = phase;

    // 🔥 Reset states when switching
    this.compressionState = 'IDLE';
    this.forceCompressionState = 'IDLE';
    this.breathState = 'IDLE';
    this.peakDepth = 0;
    this.peakForce = 0;
    this.peakPressure = 0;
  }

  resetCycleDetection() {
    this.compressionState = 'IDLE';
    this.forceCompressionState = 'IDLE';
    this.lastDepthForDepth = 0;
    this.lastForceForDepth = 0;
    this.lastForceForForce = 0;
    this.peakDepth = 0;
    this.peakForce = 0;
    this.forceCycleStartAt = 0;
    this.cycleCompressionCount = 0;
  }

  prepareCompressionStep() {
    this.resetCycleDetection();
    this.compressionDetectionEnabled = false;
    if (this.ultrasonicManuallyCalibrated && this.forceManuallyCalibrated) {
      this.compressionDetectionEnableAt = Date.now() + COMPRESSION_DETECTION_GRACE_MS;
    } else {
      this.startBaselineCapture(COMPRESSION_STEP_BASELINE_MS, COMPRESSION_DETECTION_GRACE_MS);
    }
  }

  isBaselineCapturing(): boolean {
    return this.baselineCaptureActive;
  }

  isCompressionDetectionPending(): boolean {
    return !this.compressionDetectionEnabled || this.baselineCaptureActive;
  }

  getCompressionSetupRemainingMs(): number {
    if (this.baselineCaptureActive) {
      return Math.max(0, this.baselineCaptureDeadline - Date.now());
    }
    if (!this.compressionDetectionEnabled && this.compressionDetectionEnableAt > Date.now()) {
      return this.compressionDetectionEnableAt - Date.now();
    }
    return 0;
  }

  private filterUltrasonicStandoff(raw: number): number {
    let value = raw;
    const ref = this.lastValidDepthRaw > 0 ? this.lastValidDepthRaw : this.ultrasonicOffset;
    const jumpLimit = Math.max(ref * 0.5, 2);

    if (value <= 0 && ref > 0) {
      value = ref;
    } else if (ref > 0 && Math.abs(value - ref) > jumpLimit) {
      value = ref;
    }

    this.depthRawHistory.push(value);
    if (this.depthRawHistory.length > ULTRASONIC_MEDIAN_WINDOW) {
      this.depthRawHistory.shift();
    }

    const filtered = this.median(this.depthRawHistory);
    if (filtered > 0) {
      this.lastValidDepthRaw = filtered;
    }
    return filtered;
  }

  private usesBaselineDepth(): boolean {
    return this.profileId === 'analog_v2' && this.assignments.compressionDepth !== null;
  }

  private computeCompressionDepthCm(rawStandoff: number): number {
    if (this.usesBaselineDepth()) {
      return Math.max(0, Math.min(COMPRESSION_DEPTH_MAX_CM, this.ultrasonicOffset - rawStandoff));
    }
    return Math.max(0, rawStandoff - this.ultrasonicOffset);
  }

  private computeForceN(rawForce: number): number {
    return Math.min(FORCE_DISPLAY_MAX_N, Math.max(0, rawForce - this.forceOffset));
  }

  private median(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  private pendingDetectionGraceMs = 0;

  startBaselineCapture(durationMs: number, graceAfterMs = 0) {
    this.baselineCaptureActive = true;
    this.baselineCaptureDeadline = Date.now() + durationMs;
    this.depthBaselineSamples = [];
    this.forceBaselineSamples = [];
    this.pendingDetectionGraceMs = graceAfterMs;
    this.compressionDetectionEnabled = false;
  }

  private collectBaselineSamples() {
    const depthIdx = this.assignments.compressionDepth;
    const forceIdx = this.assignments.compressionForce;
    if (depthIdx !== null && depthIdx < this.lastRawChannels.length) {
      this.depthBaselineSamples.push(this.lastRawChannels[depthIdx]);
    }
    if (forceIdx !== null && forceIdx < this.lastRawChannels.length) {
      this.forceBaselineSamples.push(this.lastRawChannels[forceIdx]);
    }
    if (Date.now() >= this.baselineCaptureDeadline) {
      this.finishBaselineCapture();
    }
  }

  private finishBaselineCapture() {
    this.baselineCaptureActive = false;
    if (this.depthBaselineSamples.length > 0 && !this.ultrasonicManuallyCalibrated) {
      this.setUltrasonicOffset(this.median(this.depthBaselineSamples));
    }
    if (this.forceBaselineSamples.length > 0 && !this.forceManuallyCalibrated) {
      this.setForceOffset(this.median(this.forceBaselineSamples));
    }
    const grace = this.pendingDetectionGraceMs;
    this.pendingDetectionGraceMs = 0;
    if (grace > 0) {
      this.resetCycleDetection();
      this.compressionDetectionEnabled = false;
      this.compressionDetectionEnableAt = Date.now() + grace;
    } else {
      this.compressionDetectionEnabled = true;
    }
  }

  private updateCompressionDetectionGate() {
    if (!this.compressionDetectionEnabled && Date.now() >= this.compressionDetectionEnableAt) {
      this.compressionDetectionEnabled = true;
    }
  }

  isDedicatedForceChannel(): boolean {
    const forceIdx = this.assignments.compressionForce;
    if (forceIdx === null) return false;
    return (
      forceIdx !== this.assignments.breathPressure &&
      forceIdx !== this.assignments.compressionDepth
    );
  }

  isForceChannelAssigned(): boolean {
    return this.isDedicatedForceChannel();
  }

  getForceOffset(): number {
    return this.forceOffset;
  }

  getForceMinPeak(): number {
    return this.forceMinPeak;
  }

  setForceOffset(v: number, manual = false) {
    this.forceOffset = v;
    if (manual) {
      this.forceManuallyCalibrated = true;
      AsyncStorage.setItem(FORCE_MANUAL_CALIB_KEY, '1').catch(() => { });
    }
    AsyncStorage.setItem(FORCE_OFFSET_KEY, String(v)).catch(() => { });
  }

  setForceMinPeak(v: number) {
    this.forceMinPeak = Math.max(0.1, v);
    AsyncStorage.setItem(this.forceMinPeakStorageKey(), String(this.forceMinPeak)).catch(() => { });
  }

  calibrateForce() {
    const idx = this.assignments.compressionForce;
    if (idx === null) return;
    const raw = this.lastRawChannels[idx] ?? this.channels[idx]?.currentValue ?? 0;
    this.setForceOffset(raw, true);
  }

  private detectCompressionCycle(depthVal: number, forceVal: number): {
    detected: boolean;
    depthPeak: number;
    forcePeak: number;
  } {
    const forceDedicated = this.isDedicatedForceChannel();
    const depthAssigned = this.assignments.compressionDepth !== null;

    if (forceDedicated && depthAssigned) {
      const forceResult = this.detectForceOnlyCycle(forceVal);
      const depthResult = this.detectDepthOnlyCycle(depthVal, forceVal);
      if (forceResult.detected) {
        return {
          detected: true,
          depthPeak: Math.max(depthResult.depthPeak, this.peakDepth, depthVal),
          forcePeak: forceResult.forcePeak,
        };
      }
      return { detected: false, depthPeak: 0, forcePeak: 0 };
    }

    if (forceDedicated) {
      return this.detectForceOnlyCycle(forceVal);
    }

    if (!depthAssigned) {
      return { detected: false, depthPeak: 0, forcePeak: 0 };
    }

    return this.detectDepthOnlyCycle(depthVal, forceVal);
  }

  private detectDepthOnlyCycle(depthVal: number, forceVal: number): {
    detected: boolean;
    depthPeak: number;
    forcePeak: number;
  } {
    const thresholdStart = this.usesBaselineDepth() ? DEPTH_CYCLE_START_CM : 6;
    const thresholdEnd = this.usesBaselineDepth() ? DEPTH_CYCLE_END_CM : 5.2;
    let detected = false;
    let savedDepthPeak = 0;
    let savedForcePeak = 0;

    switch (this.compressionState) {
      case 'IDLE':
        if (depthVal >= thresholdStart && this.lastDepthForDepth < thresholdStart) {
          this.compressionState = 'COMPRESSING';
          this.peakDepth = depthVal;
          this.peakForce = forceVal;
        }
        break;

      case 'COMPRESSING':
        if (depthVal > this.peakDepth) {
          this.peakDepth = depthVal;
        }
        if (depthVal < this.lastDepthForDepth) {
          this.compressionState = 'RELEASING';
        }
        break;

      case 'RELEASING':
        if (depthVal <= thresholdEnd) {
          const now = Date.now();
          if (this.lastCompressionTime > 0) {
            const interval = now - this.lastCompressionTime;
            if (interval > 300 && interval < 2000) {
              this.compressionRate = 60000 / interval;
            }
          }
          this.lastCompressionTime = now;

          savedDepthPeak = this.peakDepth;
          savedForcePeak = this.peakForce;
          detected = true;

          this.compressionState = 'IDLE';
          this.peakDepth = 0;
          this.peakForce = 0;
        }
        break;
    }

    this.lastDepthForDepth = depthVal;
    this.lastForceForDepth = forceVal;

    return { detected, depthPeak: savedDepthPeak, forcePeak: savedForcePeak };
  }

  private detectForceOnlyCycle(forceVal: number): {
    detected: boolean;
    depthPeak: number;
    forcePeak: number;
  } {
    const thresholdStart = this.forceMinPeak;
    const thresholdEnd = this.forceMinPeak * 0.7;
    let detected = false;
    let savedForcePeak = 0;

    switch (this.forceCompressionState) {
      case 'IDLE':
        if (forceVal >= thresholdStart && this.lastForceForForce < thresholdStart) {
          this.forceCompressionState = 'COMPRESSING';
          this.peakForce = forceVal;
          this.forceCycleStartAt = Date.now();
        }
        break;

      case 'COMPRESSING':
        if (forceVal > this.peakForce) {
          this.peakForce = forceVal;
        }
        if (forceVal < this.lastForceForForce) {
          this.forceCompressionState = 'RELEASING';
        }
        break;

      case 'RELEASING':
        if (forceVal <= thresholdEnd) {
          const now = Date.now();
          const cycleDuration = this.forceCycleStartAt > 0 ? now - this.forceCycleStartAt : MIN_COMPRESSION_CYCLE_MS;
          if (cycleDuration >= MIN_COMPRESSION_CYCLE_MS) {
            if (this.lastCompressionTime > 0) {
              const interval = now - this.lastCompressionTime;
              if (interval > 300 && interval < 2000) {
                this.compressionRate = 60000 / interval;
              }
            }
            this.lastCompressionTime = now;
            savedForcePeak = this.peakForce;
            detected = savedForcePeak >= this.forceMinPeak;
          }
          this.forceCompressionState = 'IDLE';
          this.peakForce = 0;
          this.forceCycleStartAt = 0;
        }
        break;
    }

    this.lastForceForForce = forceVal;
    return { detected, depthPeak: 0, forcePeak: savedForcePeak };
  }



  private detectBreathCycle(pressureVal: number): boolean {

    const startThreshold = 0.25;
    const peakThreshold = 0.40;
    const endThreshold = 0.22;

    let detected = false;

    console.log("Breath Detection - Pressure:", pressureVal, "State:", this.breathState);

    switch (this.breathState) {

      case 'IDLE':
        if (pressureVal > startThreshold && this.lastPressure <= startThreshold) {
          this.breathState = 'INHALE';
          this.peakPressure = pressureVal;
        }
        break;

      case 'INHALE':
        if (pressureVal > this.peakPressure) {
          this.peakPressure = pressureVal;
        }

        // 🔥 smoother transition
        if (pressureVal < this.lastPressure - 0.05) {
          this.breathState = 'EXHALE';
        }
        break;

      case 'EXHALE':
        if (pressureVal < endThreshold && this.peakPressure > peakThreshold) {

          console.log("🌬️ ONE Breath Detected:", this.peakPressure);

          detected = true;

          this.breathState = 'IDLE';
          this.peakPressure = 0;
        } else if (pressureVal < endThreshold && this.peakPressure <= peakThreshold) {
          console.log("⚠️ Resetting invalid EXHALE");

          this.breathState = 'IDLE';
          this.peakPressure = 0;
        }
        break;

    }

    this.lastPressure = pressureVal;

    return detected;
  }

  //End of Satya Code
  calibrateUltrasonic() {
    const idx = this.assignments['compressionDepth'];
    if (idx === null) return;
    const raw = this.lastRawChannels[idx] ?? this.channels[idx]?.currentValue ?? 0;
    this.setUltrasonicOffset(raw, true);
  }

  calibrateBreath() {
    const idx = this.assignments['breathPressure'];
    if (idx === null) return;
    const raw = this.channels[idx]?.currentValue ?? 0;
    this.setBreathOffset(raw);
  }

  calibrateForceSensor() {
    this.calibrateForce();
  }

  onOffsetChange(callback: (ultrasonicOffset: number, breathOffset: number) => void): () => void {
    this.offsetListeners.add(callback);
    return () => this.offsetListeners.delete(callback);
  }

  async loadOffsets(): Promise<void> {
    try {
      const [uRaw, bRaw, fRaw, uManual, fManual] = await Promise.all([
        AsyncStorage.getItem(ULTRASONIC_OFFSET_KEY),
        AsyncStorage.getItem(BREATH_OFFSET_KEY),
        AsyncStorage.getItem(FORCE_OFFSET_KEY),
        AsyncStorage.getItem(ULTRASONIC_MANUAL_CALIB_KEY),
        AsyncStorage.getItem(FORCE_MANUAL_CALIB_KEY),
      ]);
      if (uRaw !== null) this.ultrasonicOffset = parseFloat(uRaw) || 0;
      if (bRaw !== null) this.breathOffset = parseFloat(bRaw) || 0;
      if (fRaw !== null) this.forceOffset = parseFloat(fRaw) || 0;
      this.ultrasonicManuallyCalibrated = uManual === '1';
      this.forceManuallyCalibrated = fManual === '1';
      await this.loadForceMinPeakForProfile();
      this.offsetListeners.forEach(cb => cb(this.ultrasonicOffset, this.breathOffset));
    } catch { }
  }

  private connectWebSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const wsUrl = getWsUrl();
        this.ws = new WebSocket(wsUrl);

        const timeout = setTimeout(() => {
          if (!this.wsConnected) {
            console.log('[Arduino WS] Connection timeout, falling back to simulation');
            this.ws?.close();
            resolve(false);
          }
        }, 5000);

        this.ws.onopen = () => {
          this.wsConnected = true;
          clearTimeout(timeout);
          console.log('[Arduino WS] Connected to backend');
          this.requestPortList();
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
            this.handleWsMessage(msg);
          } catch (e) {
          }
        };

        this.ws.onerror = () => {
          clearTimeout(timeout);
          this.wsConnected = false;
          resolve(false);
        };

        this.ws.onclose = () => {
          this.wsConnected = false;
          if (this.mode === 'hardware') {
            this.scheduleReconnect();
          }
        };
      } catch {
        resolve(false);
      }
    });
  }

  private handleWsMessage(msg: any) {
    switch (msg.type) {
      case 'init':
        if (msg.config) {
          this.config = { ...this.config, ...msg.config };
          this.configListeners.forEach(cb => cb(this.config));
        }
        if (msg.status) {
          this.setStatus(msg.status);
        }
        break;

      case 'sensor_data':
        if (msg.data && msg.data.channels) {
          const rawChannels: number[] = msg.data.channels;
          console.log(rawChannels);

          this.updateChannelsFromRaw(rawChannels);
          const sensorData = this.transformRawToSensorData(rawChannels);
          console.log(sensorData);
          this.emit(sensorData);
        }
        break;

      case 'serial_line':
        if (msg.line !== undefined) {
          if (!this.tryApplyProfileBanner(msg.line.trim())) {
            this.addSerialLine(msg.line, 'rx');
          }
        }
        break;

      case 'serial_log':
        if (msg.log && Array.isArray(msg.log)) {
          msg.log.forEach((entry: any) => {
            this.addSerialLine(entry.line, 'rx');
          });
        }
        break;

      case 'serial_log_cleared':
        this.serialLog = [];
        break;

      case 'status':
        if (this.mode === 'simulation' && this.status === 'connected') {
          break;
        }
        this.setStatus(msg.status);
        break;

      case 'config_updated':
        if (msg.config) {
          this.config = { ...this.config, ...msg.config };
          this.configListeners.forEach(cb => cb(this.config));
        }
        break;

      case 'connect_result':
        if (!msg.success) {
          if (this._hardwareOnly) {
            console.log('[Arduino] Hardware connection failed, hardware-only mode — no simulation fallback');
            this.setStatus('error');
          } else {
            console.log('[Arduino] Hardware connection failed, falling back to simulation');
            this.setMode('simulation');
            if (this.ws) {
              this.ws.close();
              this.ws = null;
              this.wsConnected = false;
            }
            this.setStatus('connected');
            this.startSimulation();
          }
        }
        break;

      case 'ports_list':
        if (msg.ports) {
          this.availablePorts = msg.ports;
        }
        break;
    }
  }

  private scheduleReconnect() {
    if (this.wsReconnectTimer) return;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      if (this.mode === 'hardware' && !this.wsConnected) {
        this.connectWebSocket();
      }
    }, 3000);
  }

  private requestPortList() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'list_ports' }));
    }
  }

  private async connectUsb(): Promise<boolean> {
    if (!nativeUsbSerial.isAvailable()) return false;

    try {
      const devices = await nativeUsbSerial.listDevices();
      this.usbDevices = devices;

      if (devices.length === 0) {
        console.log('[Arduino] No USB devices found');
        this.setConnectionError('No USB devices found — check OTG cable and power');
        return false;
      }

      const device = pickPreferredUsbDevice(devices, this.selectedUsbDeviceId);
      if (!device) {
        this.setConnectionError('No USB devices found');
        return false;
      }
      console.log('[Arduino] Found USB device:', device.name, 'id:', device.deviceId);

      this.usbDataUnsub = nativeUsbSerial.onData((line: string) => {
        this.handleArduinoLine(line);
      });

      this.usbStatusUnsub = nativeUsbSerial.onStatusChange((status, message) => {
        if (status === 'disconnected' || status === 'error') {
          console.log('[Arduino USB] Status:', status, message);
          if (message) {
            this.setConnectionError(message);
          }
          this.setStatus(status === 'error' ? 'error' : 'disconnected');
          this.cleanupUsb();
        }
      });

      const ok = await nativeUsbSerial.connect(device.deviceId, this.config.baudRate);
      if (ok) {
        return await this.finalizeTransportConnect('usb');
      }

      this.setConnectionError(nativeUsbSerial.getLastError() || 'USB connection failed');
      this.cleanupUsb();
      return false;
    } catch (e) {
      console.log('[Arduino] USB connection error:', e);
      this.setConnectionError('USB connection error');
      this.cleanupUsb();
      return false;
    }
  }

  private cleanupUsb() {
    if (this.usbDataUnsub) { this.usbDataUnsub(); this.usbDataUnsub = null; }
    if (this.usbStatusUnsub) { this.usbStatusUnsub(); this.usbStatusUnsub = null; }
  }

  private cleanupBle() {
    if (this.bleDataUnsub) { this.bleDataUnsub(); this.bleDataUnsub = null; }
    if (this.bleStatusUnsub) { this.bleStatusUnsub(); this.bleStatusUnsub = null; }
  }

  private cleanupTcp() {
    if (this.tcpDataUnsub) { this.tcpDataUnsub(); this.tcpDataUnsub = null; }
    if (this.tcpStatusUnsub) { this.tcpStatusUnsub(); this.tcpStatusUnsub = null; }
  }

  private async connectBle(): Promise<boolean> {
    if (!bleSerial.isAvailable()) return false;

    try {
      if (!this.selectedBleDeviceId) {
        const devices = await bleSerial.scan(4000);
        this.bleDevices = devices;
        if (devices.length === 0) return false;
        this.selectedBleDeviceId = devices[0].id;
      }

      this.bleDataUnsub = bleSerial.onData((line) => this.handleArduinoLine(line));
      this.bleStatusUnsub = bleSerial.onStatusChange((status, message) => {
        if (status === 'disconnected' || status === 'error') {
          if (message) this.setConnectionError(message);
          this.setStatus(status === 'error' ? 'error' : 'disconnected');
          this.cleanupBle();
        }
      });

      const ok = await bleSerial.connect(this.selectedBleDeviceId);
      if (ok) {
        return await this.finalizeTransportConnect('ble');
      }

      this.cleanupBle();
      return false;
    } catch (e) {
      console.log('[Arduino] BLE connection error:', e);
      this.cleanupBle();
      return false;
    }
  }

  private async connectTcpMode(): Promise<boolean> {
    try {
      this.tcpDataUnsub = tcpSerial.onData((line) => this.handleArduinoLine(line));
      this.tcpStatusUnsub = tcpSerial.onStatusChange((status, message) => {
        if (status === 'disconnected' || status === 'error') {
          if (message) this.setConnectionError(message);
          this.setStatus(status === 'error' ? 'error' : 'disconnected');
          this.cleanupTcp();
        }
      });

      const ok = await tcpSerial.connect();
      if (ok) {
        return await this.finalizeTransportConnect('tcp');
      }

      this.cleanupTcp();
      return false;
    } catch (e) {
      console.log('[Arduino] TCP connection error:', e);
      this.cleanupTcp();
      return false;
    }
  }

  private async connectWebSerialMode(): Promise<boolean> {
    if (!webSerial.isAvailable()) return false;

    let unsubData: (() => void) | null = null;
    let unsubStatus: (() => void) | null = null;

    try {
      unsubData = webSerial.onData((line) => this.handleArduinoLine(line));
      unsubStatus = webSerial.onStatusChange((status, message) => {
        if (status === 'disconnected' || status === 'error') {
          if (message) this.setConnectionError(message);
          this.setStatus(status === 'error' ? 'error' : 'disconnected');
          unsubData?.();
          unsubStatus?.();
        }
      });

      let ok = await webSerial.connect(this.config.baudRate, {
        promptPort: Platform.OS === 'web',
      });
      if (ok) {
        let finalized = await this.finalizeTransportConnect('webserial');
        if (!finalized && await webSerial.tryNextGrantedPort(this.config.baudRate)) {
          this.rxSinceConnect = false;
          finalized = await this.waitForInitialRx(RX_WATCHDOG_MS);
          if (!finalized) {
            this.setConnectionError(NO_RX_ERROR);
            this.setStatus('error');
            webSerial.disconnect();
            unsubData?.();
            unsubStatus?.();
            return false;
          }
          this.setMode('webserial');
          this.setStatus('connected');
          return true;
        }
        if (!finalized) {
          unsubData?.();
          unsubStatus?.();
          return false;
        }
        return true;
      }

      this.setConnectionError(webSerial.getLastError() || 'Web Serial connection failed');
      unsubData?.();
      unsubStatus?.();
      return false;
    } catch (e) {
      console.log('[Arduino] WebSerial connection error:', e);
      unsubData?.();
      unsubStatus?.();
      return false;
    }
  }

  private tryApplyProfileBanner(trimmed: string): boolean {
    if (!trimmed.startsWith('# PROFILE ')) return false;
    this.markRxReceived();
    this.addSerialLine(trimmed, 'rx');
    const detectedId = trimmed.slice('# PROFILE '.length).trim();
    if (isHardwareProfileId(detectedId) && detectedId !== this.profileId) {
      const wasLive = this.status === 'connecting' || this.status === 'connected';
      this.setHardwareProfile(detectedId, true).catch(() => { });
      if (wasLive) {
        this.autoProfileSwitchNotice = detectedId;
      }
    }
    this.pendingProfileDetect = null;
    return true;
  }

  //this funcation is handling Arduino Data
  private handleArduinoLine(line: string) {
    this.markRxReceived();
    const trimmed = line.trim();
    if (this.tryApplyProfileBanner(trimmed)) {
      return;
    }
    this.addSerialLine(line, 'rx');
    const parts = line.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 7 && !parts.some(isNaN)) {
      const rawChannels: number[] = [];
      for (let i = 0; i < 12; i++) {
        rawChannels.push(i < parts.length ? parts[i] : 0);
      }
      this.updateChannelsFromRaw(rawChannels);
      const sensorData = this.transformRawToSensorData(rawChannels);
      this.emit(sensorData);
    }
  }

  async connect(): Promise<boolean> {
    this.setStatus('connecting');
    this.clearConnectionError();
    const pref = this.preferredConnection;

    if (Platform.OS === 'web') {
      if (this.shouldUseWebSerial(pref)) {
        const ok = await this.connectWebSerialMode();
        if (ok) return true;
        return this.fallbackSimulationOrError();
      }
      if (pref === 'websocket') {
        return this.connectWsFallback();
      }
      if (pref === 'tcp') {
        const ok = await this.connectTcpMode();
        if (ok) return true;
        return this.fallbackSimulationOrError();
      }
      return this.fallbackSimulationOrError();
    }

    if (pref === 'webserial') {
      const ok = await this.connectWebSerialMode();
      if (ok) return true;
    }

    if (pref === 'tcp') {
      const ok = await this.connectTcpMode();
      if (ok) return true;
    }

    if (pref === 'ble') {
      const ok = await this.connectBle();
      if (ok) return true;
    }

    if (pref === 'websocket') {
      return this.connectWsFallback();
    }

    if ((pref === 'auto' || pref === 'usb') && Platform.OS === 'android' && nativeUsbSerial.isAvailable()) {
      const usbOk = await this.connectUsb();
      if (usbOk) return true;
      console.log('[Arduino] USB OTG failed, trying next transport...');
    }

    if (pref === 'auto') {
      if (bleSerial.isAvailable()) {
        const bleOk = await this.connectBle();
        if (bleOk) return true;
        console.log('[Arduino] BLE failed, trying TCP...');
      }
      const tcpOk = await this.connectTcpMode();
      if (tcpOk) return true;
      console.log('[Arduino] TCP failed, trying WebSocket...');
      return this.connectWsFallback();
    }

    return this.fallbackSimulationOrError();
  }

  private async connectWsFallback(): Promise<boolean> {
    const wsOk = await this.connectWebSocket();
    if (wsOk) {
      this.setMode('hardware');
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'connect' }));
      }
      return true;
    } else if (this._hardwareOnly) {
      console.log('[Arduino] No connection available — hardware-only mode');
      this.setStatus('error');
      return false;
    } else {
      console.log('[Arduino] No hardware — simulation mode');
      this.setMode('simulation');
      await new Promise(r => setTimeout(r, 300));
      this.setStatus('connected');
      this.startSimulation();
      return true;
    }
  }

  disconnect() {
    if (this.mode === 'usb') {
      nativeUsbSerial.disconnect();
      this.cleanupUsb();
    }

    if (this.mode === 'ble') {
      bleSerial.disconnect();
      this.cleanupBle();
    }

    if (this.mode === 'tcp') {
      tcpSerial.disconnect();
      this.cleanupTcp();
    }

    if (this.mode === 'webserial') {
      webSerial.disconnect();
    }

    if (this.mode === 'hardware' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'disconnect' }));
      this.ws.close();
      this.ws = null;
      this.wsConnected = false;
    }

    this.stopSimulation();
    this.setStatus('disconnected');
    this.channels = buildRuntimeChannels(getHardwareProfile(this.profileId).channels);
    this.setMode('simulation');
    this.lastCompressionTime = 0;
    this.compressionRate = 0;

    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
  }

  isHardwareMode(): boolean {
    return this.mode !== 'simulation';
  }

  private startSimulation() {
    if (this._hardwareOnly) return;
    if (this.simulationInterval) return;

    this.simulationInterval = setInterval(() => {
      const depthIdx = this.assignments.compressionDepth ?? 5;
      const forceIdx = this.assignments.compressionForce;
      const breathIdx = this.assignments.breathPressure ?? 6;
      const rawChannels: number[] = [
        this.simState.shoulderLeft ? 1 : 0,
        this.simState.shoulderRight ? 1 : 0,
        this.simState.aedUpper ? 1 : 0,
        this.simState.aedLower ? 1 : 0,
        this.simState.neckTilt ? 1 : 0,
        0, 0, 0, 0, 0, 0, 0,
      ];
      if (depthIdx >= 0 && depthIdx < rawChannels.length) {
        rawChannels[depthIdx] = this.simState.simDepth;
      }
      if (this.simState.breathing && breathIdx >= 0 && breathIdx < rawChannels.length) {
        rawChannels[breathIdx] = 2.5 + Math.random() * 1.5;
      }
      if (this.isDedicatedForceChannel() && forceIdx !== null && forceIdx >= 0 && forceIdx < rawChannels.length) {
        rawChannels[forceIdx] = this.simState.simForce;
      }
      this.updateChannelsFromRaw(rawChannels);
      const sensorData = this.transformRawToSensorData(rawChannels);
      this.emit(sensorData);
      this.addSerialLine(rawChannels.join(','), 'rx');
    }, 100);
  }

  private stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  simulateTouchSensor(sensor: 'leftShoulder' | 'rightShoulder' | 'aedUpper' | 'aedLower' | 'neckTilt', active: boolean) {
    const keyMap: Record<string, keyof typeof this.simState> = {
      leftShoulder: 'shoulderLeft',
      rightShoulder: 'shoulderRight',
      aedUpper: 'aedUpper',
      aedLower: 'aedLower',
      neckTilt: 'neckTilt',
    };
    const key = keyMap[sensor];
    if (key) {
      (this.simState as any)[key] = active;
    }
  }

  simulateCompression(_active?: boolean) {
    if (this.mode !== 'simulation') return;
    if (this.simCompressionWaveTimer) return;

    const cycleCountBefore = this.cycleCompressionCount;
    const wave = [0, 3, 5.5, 6.5, 6.5, 5, 2, 0];
    const forceWave = this.profileId === 'analog_v2'
      ? [0, 80, 150, 220, 220, 120, 40, 0]
      : [0, 0.8, 1.5, 2.2, 2.2, 1.2, 0.4, 0];
    let step = 0;

    const runStep = () => {
      if (step >= wave.length) {
        this.simCompressionWaveTimer = null;
        this.simState.simDepth = 0;
        this.simState.simForce = 0;
        if (this.cycleCompressionCount === cycleCountBefore) {
          this.injectSimulatedCompression();
        }
        return;
      }
      this.simState.simDepth = wave[step];
      if (this.isDedicatedForceChannel()) {
        this.simState.simForce = forceWave[step] ?? 0;
      }
      step += 1;
      this.simCompressionWaveTimer = setTimeout(runStep, 80);
    };

    this.simState.compressionCount++;
    runStep();
  }

  private injectSimulatedCompression(): void {
    if (this.mode !== 'simulation' || this.phase !== 'COMPRESSION') return;

    const now = Date.now();
    if (this.lastCompressionTime > 0) {
      const interval = now - this.lastCompressionTime;
      if (interval > 300 && interval < 2000) {
        this.compressionRate = 60000 / interval;
      }
    }
    this.lastCompressionTime = now;

    this.cycleCompressionCount++;
    let emitCycleCompressionCount = this.cycleCompressionCount;
    let emitPhase: 'COMPRESSION' | 'BREATH' = 'COMPRESSION';

    if (this.cycleCompressionCount >= COMPRESSIONS_PER_CYCLE) {
      emitCycleCompressionCount = COMPRESSIONS_PER_CYCLE;
      emitPhase = 'BREATH';
      this.phase = 'BREATH';
      this.cycleCompressionCount = 0;
      this.breathState = 'IDLE';
      this.peakPressure = 0;
    }

    this.compressionState = 'IDLE';
    this.forceCompressionState = 'IDLE';
    this.peakDepth = 0;
    this.peakForce = 0;
    this.lastDepthForDepth = 0;
    this.lastForceForDepth = 0;
    this.lastForceForForce = 0;

    this.emit({
      touchSensors: {
        leftShoulder: this.simState.shoulderLeft,
        rightShoulder: this.simState.shoulderRight,
        aedPadUpper: this.simState.aedUpper,
        aedPadLower: this.simState.aedLower,
        neckTilt: this.simState.neckTilt,
      },
      compressionDepth: 0,
      compressionForce: 0,
      compressionRate: this.compressionRate || 110,
      compressionDetected: true,
      compressionPeak: 5.5,
      compressionForcePeak: this.isDedicatedForceChannel()
        ? (this.profileId === 'analog_v2' ? 220 : 2.2)
        : undefined,
      breathDetected: false,
      breathCount: this.cycleBreathCount,
      cycleCompressionCount: emitCycleCompressionCount,
      airPressure: 0,
      phase: emitPhase,
      timestamp: Date.now(),
    });
  }

  private buildSimRawChannels(): number[] {
    const depthIdx = this.assignments.compressionDepth ?? 5;
    const breathIdx = this.assignments.breathPressure ?? 6;
    const forceIdx = this.assignments.compressionForce;
    const rawChannels: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (this.simState.shoulderLeft) rawChannels[0] = 1;
    if (this.simState.shoulderRight) rawChannels[1] = 1;
    if (this.simState.aedUpper) rawChannels[2] = 1;
    if (this.simState.aedLower) rawChannels[3] = 1;
    if (this.simState.neckTilt) rawChannels[4] = 1;
    if (this.simState.breathing && breathIdx >= 0) rawChannels[breathIdx] = 0.5;
    if (depthIdx >= 0) rawChannels[depthIdx] = this.simState.simDepth;
    if (this.isDedicatedForceChannel() && forceIdx !== null && forceIdx >= 0) {
      rawChannels[forceIdx] = this.simState.simForce;
    }
    return rawChannels;
  }

  simulateBreath(active: boolean) {
    this.simState.breathing = active;
    if (active) {
      this.simState.breathCount++;
    }
  }

  getSimState() {
    return { ...this.simState };
  }

  resetSimState() {
    if (this.simCompressionWaveTimer) {
      clearTimeout(this.simCompressionWaveTimer);
      this.simCompressionWaveTimer = null;
    }
    this.simState = {
      simDepth: 0,
      simForce: 0,
      compressionCount: 0,
      breathing: false,
      breathCount: 0,
      shoulderLeft: false,
      shoulderRight: false,
      aedUpper: false,
      aedLower: false,
      neckTilt: false,
    };
  }
}

export const arduinoSerial = new ArduinoSerialManager();
export {
  DEFAULT_SENSOR_DATA,
  DEFAULT_CONFIG,
  DEFAULT_BAUD_RATE,
  ARDUINO_CHANNELS,
  DEFAULT_ASSIGNMENTS,
};
export type { HardwareProfileId } from './hardware-profiles';
export { HARDWARE_PROFILE_LIST, getHardwareProfile } from './hardware-profiles';
