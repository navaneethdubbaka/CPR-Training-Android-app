export type WebSerialDataCallback = (line: string) => void;
export type WebSerialStatusCallback = (status: 'connected' | 'disconnected' | 'error', message?: string) => void;

const ARDUINO_VENDOR_IDS = [0x2341, 0x2A03, 0x1A86, 0x0403, 0x10C4, 0x067B];

class WebSerialManager {
  private port: any = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private lineBuffer = '';
  private reading = false;
  private dataCallbacks: Set<WebSerialDataCallback> = new Set();
  private statusCallbacks: Set<WebSerialStatusCallback> = new Set();
  private textDecoder = new TextDecoder();
  private grantedPortIndex = 0;
  private lastError = '';

  isAvailable(): boolean {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return false;
    if (typeof window !== 'undefined' && !window.isSecureContext) return false;
    return true;
  }

  getSecureContextHint(): string | null {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return 'Web Serial requires HTTPS or localhost — open the app via http://localhost, not a LAN IP.';
    }
    if (!('serial' in navigator)) {
      return 'Web Serial not supported. Use Chrome or Edge on desktop (not mobile).';
    }
    return null;
  }

  getLastError(): string {
    return this.lastError;
  }

  onData(cb: WebSerialDataCallback): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  onStatusChange(cb: WebSerialStatusCallback): () => void {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  private emitStatus(status: 'connected' | 'disconnected' | 'error', message?: string) {
    this.statusCallbacks.forEach(cb => cb(status, message));
  }

  private processIncomingText(text: string) {
    this.lineBuffer += text;
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() || '';
    lines.forEach(line => {
      const trimmed = line.replace(/\r$/, '').trim();
      if (trimmed) this.dataCallbacks.forEach(cb => cb(trimmed));
    });
  }

  private orderPortsByPreference(ports: any[]): any[] {
    return [...ports].sort((a, b) => {
      const aVid = a.getInfo?.()?.usbVendorId ?? -1;
      const bVid = b.getInfo?.()?.usbVendorId ?? -1;
      const aScore = ARDUINO_VENDOR_IDS.includes(aVid) ? 1 : 0;
      const bScore = ARDUINO_VENDOR_IDS.includes(bVid) ? 1 : 0;
      return bScore - aScore;
    });
  }

  private pickPreferredPort(ports: any[]): any | null {
    if (ports.length === 0) return null;
    const ordered = this.orderPortsByPreference(ports);
    return ordered[this.grantedPortIndex] ?? ordered[0];
  }

  private async openCurrentPort(baudRate: number): Promise<boolean> {
    if (!this.port) return false;

    await this.port.open({ baudRate });
    this.writer = this.port.writable.getWriter();
    this.emitStatus('connected');
    console.log('[WebSerial] Connected at', baudRate, 'baud');
    this.startReading();
    return true;
  }

  async connect(
    baudRate: number = 115200,
    options?: { promptPort?: boolean },
  ): Promise<boolean> {
    const secureHint = this.getSecureContextHint();
    if (secureHint) {
      this.lastError = secureHint;
      this.emitStatus('error', this.lastError);
      return false;
    }

    const promptPort = options?.promptPort ?? false;

    try {
      await this.disconnectInternal();

      const nav = navigator as any;
      const grantedPorts: any[] = await nav.serial.getPorts();

      if (promptPort || grantedPorts.length === 0) {
        this.port = await nav.serial.requestPort({
          filters: ARDUINO_VENDOR_IDS.map(usbVendorId => ({ usbVendorId })),
        });
        this.grantedPortIndex = 0;
      } else {
        const ordered = this.orderPortsByPreference(grantedPorts);
        this.grantedPortIndex = Math.min(this.grantedPortIndex, ordered.length - 1);
        this.port = ordered[this.grantedPortIndex];
      }

      return await this.openCurrentPort(baudRate);
    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        this.lastError = 'No port selected';
        this.emitStatus('error', this.lastError);
      } else if (
        e.message?.includes('Failed to open serial port') ||
        e.message?.toLowerCase().includes('busy') ||
        e.name === 'InvalidStateError'
      ) {
        this.lastError =
          'Serial port in use — close Arduino IDE Serial Monitor, unplug/replug USB, then Connect again';
        this.emitStatus('error', this.lastError);
      } else {
        this.lastError = e.message || 'Web Serial connection failed';
        this.emitStatus('error', this.lastError);
      }
      return false;
    }
  }

  async tryNextGrantedPort(baudRate: number = 115200): Promise<boolean> {
    if (!this.isAvailable()) return false;

    const nav = navigator as any;
    const grantedPorts: any[] = await nav.serial.getPorts();
    if (grantedPorts.length <= 1) return false;

    const ordered = this.orderPortsByPreference(grantedPorts);
    const startIndex = this.grantedPortIndex;

    for (let i = 1; i < ordered.length; i++) {
      const nextIndex = (startIndex + i) % ordered.length;
      await this.disconnectInternal();
      this.grantedPortIndex = nextIndex;
      this.port = ordered[nextIndex];
      try {
        return await this.openCurrentPort(baudRate);
      } catch (e: any) {
        console.log('[WebSerial] Port rotation failed:', e);
        this.lastError = e.message || 'Failed to open serial port';
      }
    }
    return false;
  }

  private async startReading() {
    if (!this.port?.readable || this.reading) return;
    this.reading = true;

    try {
      this.reader = this.port.readable.getReader();

      while (this.reading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.processIncomingText(this.textDecoder.decode(value, { stream: true }));
        }
      }
    } catch (e: any) {
      if (this.reading) {
        this.lastError = e.message || 'Serial read error';
        this.emitStatus('error', this.lastError);
      }
    } finally {
      if (this.reader) {
        try { this.reader.releaseLock(); } catch { }
        this.reader = null;
      }
      this.reading = false;
    }
  }

  async send(data: string): Promise<boolean> {
    if (!this.writer) return false;
    try {
      const encoder = new TextEncoder();
      await this.writer.write(encoder.encode(data));
      return true;
    } catch {
      return false;
    }
  }

  private async disconnectInternal() {
    this.reading = false;

    if (this.reader) {
      try { await this.reader.cancel(); } catch { }
      try { this.reader.releaseLock(); } catch { }
      this.reader = null;
    }

    if (this.writer) {
      try { await this.writer.close(); } catch { }
      try { this.writer.releaseLock(); } catch { }
      this.writer = null;
    }

    if (this.port) {
      try { await this.port.close(); } catch { }
      this.port = null;
    }

    this.lineBuffer = '';
    this.textDecoder = new TextDecoder();
  }

  async disconnect() {
    await this.disconnectInternal();
    this.grantedPortIndex = 0;
    this.emitStatus('disconnected');
  }

  isConnected(): boolean {
    return !!this.port;
  }
}

export const webSerial = new WebSerialManager();
