import { Platform } from 'react-native';

export interface TcpConfig {
  host: string;
  port: number;
}

export type TcpDataCallback = (line: string) => void;
export type TcpStatusCallback = (status: 'connected' | 'disconnected' | 'error', message?: string) => void;

const DEFAULT_CONFIG: TcpConfig = {
  host: '192.168.1.100',
  port: 23,
};

class TcpSerialManager {
  private socket: any = null;
  private lineBuffer = '';
  private dataCallbacks: Set<TcpDataCallback> = new Set();
  private statusCallbacks: Set<TcpStatusCallback> = new Set();
  private config: TcpConfig = { ...DEFAULT_CONFIG };
  private _isAvailable = Platform.OS !== 'web';

  isAvailable(): boolean {
    return true;
  }

  setConfig(config: Partial<TcpConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TcpConfig {
    return { ...this.config };
  }

  onData(cb: TcpDataCallback): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  onStatusChange(cb: TcpStatusCallback): () => void {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  private emitStatus(status: 'connected' | 'disconnected' | 'error', message?: string) {
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

  async connect(host?: string, port?: number): Promise<boolean> {
    if (host) this.config.host = host;
    if (port) this.config.port = port;

    this.disconnect();

    if (Platform.OS === 'web') {
      return this.connectWebSocket();
    }

    return this.connectTcp();
  }

  private async connectTcp(): Promise<boolean> {
    try {
      const TcpSocket = (await import('react-native-tcp-socket')).default;

      return new Promise((resolve) => {
        const sock = TcpSocket.createConnection(
          { host: this.config.host, port: this.config.port },
          () => {
            console.log(`[TCP] Connected to ${this.config.host}:${this.config.port}`);
            this.emitStatus('connected');
            resolve(true);
          }
        );

        sock.on('data', (data: any) => {
          const str = typeof data === 'string' ? data : data.toString('utf8');
          this.handleData(str);
        });

        sock.on('error', (err: any) => {
          console.log('[TCP] Error:', err.message);
          this.emitStatus('error', err.message);
          resolve(false);
        });

        sock.on('close', () => {
          console.log('[TCP] Disconnected');
          this.emitStatus('disconnected');
          this.socket = null;
        });

        this.socket = sock;
      });
    } catch (e: any) {
      console.log('[TCP] Module error:', e);
      this.emitStatus('error', e.message);
      return false;
    }
  }

  private wsSocket: WebSocket | null = null;

  private connectWebSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      const url = `ws://${this.config.host}:${this.config.port}`;
      console.log('[TCP/WS] Connecting to', url);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[TCP/WS] Connected');
        this.emitStatus('connected');
        resolve(true);
      };

      ws.onmessage = (e) => {
        this.handleData(typeof e.data === 'string' ? e.data : '');
      };

      ws.onerror = () => {
        this.emitStatus('error', `Cannot connect to ${url}`);
        resolve(false);
      };

      ws.onclose = () => {
        this.emitStatus('disconnected');
        this.wsSocket = null;
      };

      this.wsSocket = ws;
    });
  }

  send(data: string): boolean {
    if (Platform.OS === 'web') {
      if (this.wsSocket && this.wsSocket.readyState === WebSocket.OPEN) {
        this.wsSocket.send(data);
        return true;
      }
      return false;
    }
    if (!this.socket) return false;
    try {
      this.socket.write(data);
      return true;
    } catch {
      return false;
    }
  }

  disconnect() {
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
    if (this.wsSocket) {
      try { this.wsSocket.close(); } catch {}
      this.wsSocket = null;
    }
    this.lineBuffer = '';
  }

  isConnected(): boolean {
    if (Platform.OS === 'web') return this.wsSocket?.readyState === WebSocket.OPEN;
    return !!this.socket;
  }
}

export const tcpSerial = new TcpSerialManager();
