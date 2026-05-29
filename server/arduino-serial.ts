import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export interface RawSensorData {
  channels: number[];
  timestamp: number;
}

export interface ArduinoConfig {
  baudRate: number;
  port: string;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: 'none' | 'even' | 'odd';
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const DEFAULT_CONFIG: ArduinoConfig = {
  baudRate: 115200,
  port: '/dev/ttyUSB0',
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
};

type SensorCallback = (data: RawSensorData) => void;
type StatusCallback = (status: ConnectionStatus, error?: string) => void;
type RawLineCallback = (line: string, timestamp: number) => void;

class BackendArduinoSerial {
  private serialPort: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private config: ArduinoConfig = { ...DEFAULT_CONFIG };
  private status: ConnectionStatus = 'disconnected';
  private sensorCallbacks: Set<SensorCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private rawLineCallbacks: Set<RawLineCallback> = new Set();
  private serialLog: { line: string; timestamp: number }[] = [];
  private maxLogLines = 500;
  private lastRawData: RawSensorData = {
    channels: new Array(12).fill(0),
    timestamp: Date.now(),
  };

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getConfig(): ArduinoConfig {
    return { ...this.config };
  }

  getLastRawData(): RawSensorData {
    return { channels: [...this.lastRawData.channels], timestamp: this.lastRawData.timestamp };
  }

  setConfig(config: Partial<ArduinoConfig>) {
    this.config = { ...this.config, ...config };
  }

  onSensorData(cb: SensorCallback): () => void {
    this.sensorCallbacks.add(cb);
    return () => this.sensorCallbacks.delete(cb);
  }

  onStatusChange(cb: StatusCallback): () => void {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  onRawLine(cb: RawLineCallback): () => void {
    this.rawLineCallbacks.add(cb);
    return () => this.rawLineCallbacks.delete(cb);
  }

  getSerialLog(): { line: string; timestamp: number }[] {
    return [...this.serialLog];
  }

  clearSerialLog() {
    this.serialLog = [];
  }

  private emitRawLine(line: string) {
    const timestamp = Date.now();
    this.serialLog.push({ line, timestamp });
    if (this.serialLog.length > this.maxLogLines) {
      this.serialLog = this.serialLog.slice(-this.maxLogLines);
    }
    this.rawLineCallbacks.forEach(cb => cb(line, timestamp));
  }

  async sendCommand(command: string): Promise<boolean> {
    if (!this.serialPort || !this.serialPort.isOpen) return false;
    return new Promise((resolve) => {
      this.serialPort!.write(command, (err) => {
        if (err) {
          console.error('[Arduino] Write error:', err.message);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  private setStatus(status: ConnectionStatus, error?: string) {
    this.status = status;
    this.statusCallbacks.forEach(cb => cb(status, error));
  }

  private emitSensorData(data: RawSensorData) {
    this.lastRawData = data;
    this.sensorCallbacks.forEach(cb => cb(data));
  }

  async connect(): Promise<boolean> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return this.status === 'connected';
    }

    this.setStatus('connecting');

    try {
      this.serialPort = new SerialPort({
        path: this.config.port,
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity,
        autoOpen: false,
      });

      this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

      this.parser.on('data', (line: string) => {
        try {
          const trimmed = line.trim();
          this.emitRawLine(trimmed);
          const parsed = this.parseSensorLine(trimmed);
          if (parsed) {
            this.emitSensorData(parsed);
          }
        } catch (e) {
        }
      });

      this.serialPort.on('error', (err) => {
        console.error('[Arduino] Serial error:', err.message);
        this.setStatus('error', err.message);
      });

      this.serialPort.on('close', () => {
        console.log('[Arduino] Port closed');
        this.setStatus('disconnected');
      });

      return new Promise<boolean>((resolve) => {
        this.serialPort!.open((err) => {
          if (err) {
            console.error('[Arduino] Failed to open port:', err.message);
            this.setStatus('error', err.message);
            resolve(false);
          } else {
            console.log(`[Arduino] Connected on ${this.config.port} at ${this.config.baudRate} baud`);
            this.setStatus('connected');
            resolve(true);
          }
        });
      });
    } catch (err: any) {
      console.error('[Arduino] Connection error:', err.message);
      this.setStatus('error', err.message);
      return false;
    }
  }

  disconnect() {
    if (this.serialPort && this.serialPort.isOpen) {
      this.serialPort.close((err) => {
        if (err) {
          console.error('[Arduino] Error closing port:', err.message);
        }
      });
    }
    this.serialPort = null;
    this.parser = null;
    this.setStatus('disconnected');
  }

  private parseSensorLine(line: string): RawSensorData | null {
    const parts = line.split(',').map(p => p.trim()).filter(p => p !== '');
    if (parts.length >= 7) {
      const channels: number[] = parts.map(p => parseFloat(p) || 0);
      while (channels.length < 12) {
        channels.push(0);
      }
      return {
        channels: channels.slice(0, 12),
        timestamp: Date.now(),
      };
    }

    return null;
  }

  async listPorts(): Promise<{ path: string; manufacturer?: string }[]> {
    try {
      const ports = await SerialPort.list();
      return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer }));
    } catch (err: any) {
      console.error('[Arduino] Error listing ports:', err.message);
      return [];
    }
  }
}

export const backendArduino = new BackendArduinoSerial();
