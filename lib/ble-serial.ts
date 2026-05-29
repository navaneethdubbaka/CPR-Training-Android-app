import { Platform } from 'react-native';

export interface BleDevice {
  id: string;
  name: string;
  rssi: number;
}

export type BleDataCallback = (line: string) => void;
export type BleStatusCallback = (status: 'connected' | 'disconnected' | 'error' | 'scanning', message?: string) => void;

const NORDIC_UART_SERVICE = '6e400001-b5b3-f393-e0a9-e50e24dcca9e';
const NORDIC_UART_RX_CHAR  = '6e400002-b5b3-f393-e0a9-e50e24dcca9e';
const NORDIC_UART_TX_CHAR  = '6e400003-b5b3-f393-e0a9-e50e24dcca9e';

const HC05_NAME_PREFIXES = ['HC-', 'BT0', 'BT1', 'BOLUTEK', 'RNBT', 'Arduino'];

class BleSerialManager {
  private ble: any = null;
  private device: any = null;
  private txChar: any = null;
  private rxSubscription: any = null;
  private lineBuffer = '';
  private dataCallbacks: Set<BleDataCallback> = new Set();
  private statusCallbacks: Set<BleStatusCallback> = new Set();
  private scanning = false;
  private _isAvailable = Platform.OS === 'android' || Platform.OS === 'ios';

  isAvailable(): boolean {
    return this._isAvailable;
  }

  private async loadModule(): Promise<boolean> {
    if (this.ble) return true;
    if (!this._isAvailable) return false;
    try {
      const { BleManager } = await import('react-native-ble-plx');
      this.ble = new BleManager();
      return true;
    } catch (e) {
      console.log('[BLE] Module not available:', e);
      this._isAvailable = false;
      return false;
    }
  }

  onData(cb: BleDataCallback): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  onStatusChange(cb: BleStatusCallback): () => void {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  private emitStatus(status: 'connected' | 'disconnected' | 'error' | 'scanning', message?: string) {
    this.statusCallbacks.forEach(cb => cb(status, message));
  }

  private handleData(data: string) {
    this.lineBuffer += data;
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() || '';
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed) this.dataCallbacks.forEach(cb => cb(trimmed));
    });
  }

  async scan(timeoutMs: number = 5000): Promise<BleDevice[]> {
    if (!await this.loadModule()) return [];
    const found = new Map<string, BleDevice>();
    this.scanning = true;
    this.emitStatus('scanning');

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.ble.stopDeviceScan();
        this.scanning = false;
        resolve(Array.from(found.values()));
      }, timeoutMs);

      this.ble.startDeviceScan(null, null, (error: any, device: any) => {
        if (error) {
          clearTimeout(timer);
          this.scanning = false;
          this.emitStatus('error', error.message);
          resolve(Array.from(found.values()));
          return;
        }
        if (device && device.name) {
          found.set(device.id, {
            id: device.id,
            name: device.name || 'Unknown',
            rssi: device.rssi || -99,
          });
        }
      });
    });
  }

  stopScan() {
    if (this.ble && this.scanning) {
      this.ble.stopDeviceScan();
      this.scanning = false;
    }
  }

  async connect(deviceId: string): Promise<boolean> {
    if (!await this.loadModule()) return false;

    try {
      this.disconnect();
      console.log('[BLE] Connecting to', deviceId);

      this.device = await this.ble.connectToDevice(deviceId);
      await this.device.discoverAllServicesAndCharacteristics();

      const services = await this.device.services();
      let connected = false;

      for (const service of services) {
        const chars = await service.characteristics();
        const txChar = chars.find((c: any) =>
          c.uuid.toLowerCase() === NORDIC_UART_TX_CHAR ||
          c.isNotifiable || c.isIndicatable
        );
        const rxChar = chars.find((c: any) =>
          c.uuid.toLowerCase() === NORDIC_UART_RX_CHAR ||
          c.isWritableWithResponse || c.isWritableWithoutResponse
        );

        if (txChar && rxChar) {
          this.txChar = rxChar;
          txChar.monitor((error: any, char: any) => {
            if (error) return;
            if (char?.value) {
              const decoded = atob(char.value);
              this.handleData(decoded);
            }
          });
          connected = true;
          break;
        }
      }

      if (connected) {
        this.device.onDisconnected(() => {
          console.log('[BLE] Disconnected');
          this.emitStatus('disconnected');
          this.device = null;
          this.txChar = null;
        });
        this.emitStatus('connected');
        console.log('[BLE] Connected via Bluetooth LE');
        return true;
      }

      this.emitStatus('error', 'No UART service found on device');
      return false;
    } catch (e: any) {
      console.log('[BLE] Connection error:', e);
      this.emitStatus('error', e.message);
      return false;
    }
  }

  async send(data: string): Promise<boolean> {
    if (!this.txChar || !this.device) return false;
    try {
      const encoded = btoa(data);
      await this.txChar.writeWithResponse(encoded);
      return true;
    } catch (e) {
      return false;
    }
  }

  disconnect() {
    if (this.rxSubscription) {
      this.rxSubscription.remove();
      this.rxSubscription = null;
    }
    if (this.device) {
      try { this.device.cancelConnection(); } catch {}
      this.device = null;
    }
    this.txChar = null;
    this.lineBuffer = '';
  }

  isConnected(): boolean {
    return !!this.device;
  }
}

export const bleSerial = new BleSerialManager();
