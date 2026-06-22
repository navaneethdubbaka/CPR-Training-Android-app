export type WebSerialDataCallback = (line: string) => void;
export type WebSerialStatusCallback = (status: 'connected' | 'disconnected' | 'error', message?: string) => void;

class WebSerialManager {
  private port: any = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private lineBuffer = '';
  private reading = false;
  private dataCallbacks: Set<WebSerialDataCallback> = new Set();
  private statusCallbacks: Set<WebSerialStatusCallback> = new Set();
  private textDecoder = new TextDecoder();

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
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

  async connect(baudRate: number = 115200): Promise<boolean> {
    if (!this.isAvailable()) {
      this.emitStatus('error', 'Web Serial not supported. Use Chrome on desktop.');
      return false;
    }

    try {
      await this.disconnect();

      const nav = navigator as any;
      const grantedPorts: any[] = await nav.serial.getPorts();
      if (grantedPorts.length > 0) {
        this.port = grantedPorts[0];
      } else {
        this.port = await nav.serial.requestPort({
          filters: [
            { usbVendorId: 0x2341 },
            { usbVendorId: 0x2A03 },
            { usbVendorId: 0x1A86 },
            { usbVendorId: 0x0403 },
            { usbVendorId: 0x10C4 },
            { usbVendorId: 0x067B },
          ],
        });
      }

      await this.port.open({ baudRate });

      this.writer = this.port.writable.getWriter();
      this.emitStatus('connected');
      console.log('[WebSerial] Connected at', baudRate, 'baud');

      this.startReading();
      return true;
    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        this.emitStatus('error', 'No port selected');
      } else {
        this.emitStatus('error', e.message);
      }
      return false;
    }
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
        this.emitStatus('error', e.message);
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

  async disconnect() {
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
    this.emitStatus('disconnected');
  }

  isConnected(): boolean {
    return !!this.port;
  }
}

export const webSerial = new WebSerialManager();
