export type WebSerialDataCallback = (line: string) => void;
export type WebSerialStatusCallback = (status: 'connected' | 'disconnected' | 'error', message?: string) => void;

class WebSerialManager {
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private lineBuffer = '';
  private reading = false;
  private dataCallbacks: Set<WebSerialDataCallback> = new Set();
  private statusCallbacks: Set<WebSerialStatusCallback> = new Set();

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

  async connect(baudRate: number = 115200): Promise<boolean> {
    if (!this.isAvailable()) {
      this.emitStatus('error', 'Web Serial not supported. Use Chrome on desktop.');
      return false;
    }

    try {
      this.disconnect();

      const nav = navigator as any;
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
    if (!this.port || this.reading) return;
    this.reading = true;

    try {
      const textDecoder = new TextDecoderStream();
      this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      while (this.reading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.lineBuffer += value;
          const lines = this.lineBuffer.split('\n');
          this.lineBuffer = lines.pop() || '';
          lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed) this.dataCallbacks.forEach(cb => cb(trimmed));
          });
        }
      }
    } catch (e: any) {
      if (this.reading) {
        this.emitStatus('error', e.message);
      }
    }
    this.reading = false;
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
      try { await this.reader.cancel(); } catch {}
      this.reader = null;
    }
    if (this.writer) {
      try { await this.writer.close(); } catch {}
      this.writer = null;
    }
    if (this.port) {
      try { await this.port.close(); } catch {}
      this.port = null;
    }
    this.lineBuffer = '';
    this.emitStatus('disconnected');
  }

  isConnected(): boolean {
    return !!this.port;
  }
}

export const webSerial = new WebSerialManager();
