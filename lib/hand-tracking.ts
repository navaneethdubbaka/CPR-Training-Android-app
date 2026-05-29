import { Platform } from 'react-native';

export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
  name: string;
}

export interface HandLandmarks {
  landmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
  score: number;
}

export interface PlacementResult {
  inZone: boolean;
  hands: HandLandmarks[];
  directionHint?: 'up' | 'down' | 'left' | 'right' | 'center';
}

type LandmarksCallback = (result: PlacementResult) => void;

const WRIST_IDX = 0;
const MIDDLE_MCP_IDX = 9;
const RING_MCP_IDX = 13;

export class HandTrackingEngine {
  private static instance: HandTrackingEngine;
  private callbacks: Set<LandmarksCallback> = new Set();
  private running = false;
  private animFrameId: ReturnType<typeof setTimeout> | null = null;
  private simulatedPhase = 0;
  private _isReady = false;

  static getInstance(): HandTrackingEngine {
    if (!HandTrackingEngine.instance) {
      HandTrackingEngine.instance = new HandTrackingEngine();
    }
    return HandTrackingEngine.instance;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 600));
    this._isReady = true;
  }

  start(callback: LandmarksCallback): void {
    this.callbacks.add(callback);
    if (!this.running) {
      this.running = true;
      this.loop();
    }
  }

  stop(callback: LandmarksCallback): void {
    this.callbacks.delete(callback);
    if (this.callbacks.size === 0) {
      this.running = false;
      if (this.animFrameId !== null) {
        clearTimeout(this.animFrameId);
        this.animFrameId = null;
      }
    }
  }

  stopAll(): void {
    this.running = false;
    this.callbacks.clear();
    if (this.animFrameId !== null) {
      clearTimeout(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private loop(): void {
    if (!this.running) return;
    this.tick();
    this.animFrameId = setTimeout(() => this.loop(), 66);
  }

  private tick(): void {
    this.simulatedPhase += 0.04;
    const result = this.generateSimulatedLandmarks();
    this.callbacks.forEach(cb => cb(result));
  }

  private generateSimulatedLandmarks(): PlacementResult {
    const phase = this.simulatedPhase;
    const cx = 0.5 + Math.sin(phase * 0.7) * 0.12;
    const cy = 0.5 + Math.cos(phase * 0.5) * 0.10;

    const ZONE = { x: 0.35, y: 0.3, w: 0.3, h: 0.35 };
    const inZone =
      cx >= ZONE.x && cx <= ZONE.x + ZONE.w &&
      cy >= ZONE.y && cy <= ZONE.y + ZONE.h;

    const landmarks = this.buildHandLandmarks(cx, cy);

    let directionHint: PlacementResult['directionHint'] = 'center';
    if (!inZone) {
      const zoneCx = ZONE.x + ZONE.w / 2;
      const zoneCy = ZONE.y + ZONE.h / 2;
      const dx = zoneCx - cx;
      const dy = zoneCy - cy;
      if (Math.abs(dx) > Math.abs(dy)) {
        directionHint = dx > 0 ? 'right' : 'left';
      } else {
        directionHint = dy > 0 ? 'down' : 'up';
      }
    }

    return {
      inZone,
      directionHint,
      hands: [{
        landmarks,
        handedness: 'Right',
        score: 0.92,
      }],
    };
  }

  private buildHandLandmarks(wristX: number, wristY: number): HandLandmark[] {
    const scale = 0.07;
    const LANDMARK_NAMES = [
      'WRIST',
      'THUMB_CMC', 'THUMB_MCP', 'THUMB_IP', 'THUMB_TIP',
      'INDEX_FINGER_MCP', 'INDEX_FINGER_PIP', 'INDEX_FINGER_DIP', 'INDEX_FINGER_TIP',
      'MIDDLE_FINGER_MCP', 'MIDDLE_FINGER_PIP', 'MIDDLE_FINGER_DIP', 'MIDDLE_FINGER_TIP',
      'RING_FINGER_MCP', 'RING_FINGER_PIP', 'RING_FINGER_DIP', 'RING_FINGER_TIP',
      'PINKY_MCP', 'PINKY_PIP', 'PINKY_DIP', 'PINKY_TIP',
    ];

    const offsets: [number, number][] = [
      [0, 0],
      [-0.4, -0.3], [-0.45, -0.6], [-0.5, -0.85], [-0.52, -1.05],
      [-0.15, -0.55], [-0.15, -0.9], [-0.15, -1.1], [-0.15, -1.3],
      [0.05, -0.6], [0.05, -1.0], [0.05, -1.2], [0.05, -1.4],
      [0.25, -0.55], [0.25, -0.9], [0.25, -1.1], [0.25, -1.3],
      [0.43, -0.45], [0.43, -0.75], [0.43, -0.95], [0.43, -1.1],
    ];

    return offsets.map(([ox, oy], i) => ({
      x: wristX + ox * scale,
      y: wristY + oy * scale,
      z: 0,
      name: LANDMARK_NAMES[i] || `LANDMARK_${i}`,
    }));
  }
}

export const handTrackingEngine = HandTrackingEngine.getInstance();

export function isHandTrackingSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web';
}
