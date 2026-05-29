import { Platform } from 'react-native';

export interface UsbDevice {
  deviceId: number;
  vendorId: number;
  productId: number;
  name: string;
}

export type UsbDataCallback = (line: string) => void;
export type UsbStatusCallback = (status: 'connected' | 'disconnected' | 'error', message?: string) => void;

const ARDUINO_VENDOR_IDS = [0x2341, 0x2A03, 0x1A86, 0x0403, 0x10C4, 0x067B];

const ARDUINO_PRODUCT_NAMES: Record<number, Record<number, string>> = {
  0x2341: {
    0x0010: 'Arduino Mega 2560',
    0x0042: 'Arduino Mega 2560 R3',
    0x0043: 'Arduino Uno R3',
    0x0001: 'Arduino Uno',
    0x003B: 'Arduino Leonardo',
    0x003D: 'Arduino Due (Prog)',
    0x003E: 'Arduino Due (Native)',
    0x8036: 'Arduino Leonardo (bootloader)',
    0x8037: 'Arduino Micro',
  },
  0x2A03: {
    0x0010: 'Arduino Mega 2560 (org)',
    0x0042: 'Arduino Mega 2560 R3 (org)',
    0x0043: 'Arduino Uno R3 (org)',
  },
  0x1A86: {
    0x7523: 'CH340 (Arduino Clone)',
    0x5523: 'CH341 (Arduino Clone)',
  },
  0x0403: {
    0x6001: 'FTDI FT232R',
    0x6010: 'FTDI FT2232',
    0x6015: 'FTDI FT231X',
  },
  0x10C4: {
    0xEA60: 'CP2102 (NodeMCU/ESP32)',
    0xEA70: 'CP2105',
  },
  0x067B: {
    0x2303: 'PL2303 (Prolific)',
  },
};

function getDeviceName(vendorId: number, productId: number): string {
  const vendor = ARDUINO_PRODUCT_NAMES[vendorId];
  if (vendor && vendor[productId]) {
    return vendor[productId];
  }
  if (ARDUINO_VENDOR_IDS.includes(vendorId)) {
    return `Arduino Device (${vendorId.toString(16)}:${productId.toString(16)})`;
  }
  return `USB Device (${vendorId.toString(16)}:${productId.toString(16)})`;
}

function hexToString(hex: string): string {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substring(i, i + 2), 16);
    if (charCode > 0) {
      str += String.fromCharCode(charCode);
    }
  }
  return str;
}

function stringToHex(str: string): string {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

class NativeUsbSerialManager {
  private usbSerial: any = null;
  private dataSubscription: any = null;
  private lineBuffer = '';
  private dataCallbacks: Set<UsbDataCallback> = new Set();
  private statusCallbacks: Set<UsbStatusCallback> = new Set();
  private connectedDeviceId: number | null = null;
  private _isAvailable = Platform.OS === 'android';
  private UsbSerialManagerModule: any = null;
  private ParityEnum: any = null;

  isAvailable(): boolean {
    return this._isAvailable;
  }

  private async loadModule(): Promise<boolean> {
    if (this.UsbSerialManagerModule) return true;
    if (!this._isAvailable) return false;

    try {
      const mod = await import('react-native-usb-serialport-for-android');
      this.UsbSerialManagerModule = mod.UsbSerialManager;
      this.ParityEnum = mod.Parity;
      return true;
    } catch (e) {
      console.log('[USB Serial] Module not available:', e);
      this._isAvailable = false;
      return false;
    }
  }

  async listDevices(): Promise<UsbDevice[]> {
    if (!await this.loadModule()) return [];

    try {
      const devices = await this.UsbSerialManagerModule.list();
      return devices.map((d: any) => ({
        deviceId: d.deviceId,
        vendorId: d.vendorId,
        productId: d.productId,
        name: getDeviceName(d.vendorId, d.productId),
      }));
    } catch (e) {
      console.log('[USB Serial] Error listing devices:', e);
      return [];
    }
  }

  async connect(deviceId: number, baudRate: number = 115200): Promise<boolean> {
    if (!await this.loadModule()) return false;

    try {
      this.disconnect();

      const hasPermission = await this.UsbSerialManagerModule.tryRequestPermission(deviceId);
      if (!hasPermission) {
        console.log('[USB Serial] Permission request sent, waiting for user approval');
        this.emitStatus('disconnected', 'Permission required');
        return false;
      }

      this.usbSerial = await this.UsbSerialManagerModule.open(deviceId, {
        baudRate,
        parity: this.ParityEnum.None,
        dataBits: 8,
        stopBits: 1,
      });

      this.connectedDeviceId = deviceId;
      this.lineBuffer = '';

      this.dataSubscription = this.usbSerial.onReceived((event: any) => {
        const text = hexToString(event.data);
        this.processIncomingData(text);
      });

      this.emitStatus('connected');
      console.log('[USB Serial] Connected to device:', deviceId);
      return true;
    } catch (e: any) {
      console.log('[USB Serial] Connection error:', e);
      this.emitStatus('error', e.message || 'Connection failed');
      return false;
    }
  }

  private processIncomingData(text: string) {
    this.lineBuffer += text;

    let newlineIndex: number;
    while ((newlineIndex = this.lineBuffer.indexOf('\n')) !== -1) {
      const line = this.lineBuffer.substring(0, newlineIndex).replace(/\r$/, '');
      this.lineBuffer = this.lineBuffer.substring(newlineIndex + 1);

      if (line.length > 0) {
        this.dataCallbacks.forEach(cb => cb(line));
      }
    }
  }

  async send(text: string): Promise<boolean> {
    if (!this.usbSerial) return false;

    try {
      const hex = stringToHex(text);
      await this.usbSerial.send(hex);
      return true;
    } catch (e) {
      console.log('[USB Serial] Send error:', e);
      return false;
    }
  }

  disconnect() {
    if (this.dataSubscription) {
      this.dataSubscription.remove();
      this.dataSubscription = null;
    }

    if (this.usbSerial) {
      try {
        this.usbSerial.close();
      } catch (e) {
        console.log('[USB Serial] Error closing:', e);
      }
      this.usbSerial = null;
    }

    this.connectedDeviceId = null;
    this.lineBuffer = '';
    this.emitStatus('disconnected');
  }

  isConnected(): boolean {
    return this.usbSerial !== null && this.connectedDeviceId !== null;
  }

  getConnectedDeviceId(): number | null {
    return this.connectedDeviceId;
  }

  onData(callback: UsbDataCallback): () => void {
    this.dataCallbacks.add(callback);
    return () => this.dataCallbacks.delete(callback);
  }

  onStatusChange(callback: UsbStatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  private emitStatus(status: 'connected' | 'disconnected' | 'error', message?: string) {
    this.statusCallbacks.forEach(cb => cb(status, message));
  }
}

export const nativeUsbSerial = new NativeUsbSerialManager();
