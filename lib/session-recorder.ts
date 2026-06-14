import type { CPRStepId } from '@/constants/cpr-protocol';

export type CoachingEvent = {
  id: string;
  timestamp: number;
  stepId: CPRStepId | string;
  source: 'pose' | 'sensor';
  message: string;
};

export type SessionSnapshot = {
  id: string;
  timestamp: number;
  stepId: CPRStepId | string;
  dataUrl: string;
};

let eventCounter = 0;
let snapshotCounter = 0;

class SessionRecorder {
  private events: CoachingEvent[] = [];
  private snapshots: SessionSnapshot[] = [];
  private loggedChipFailures = new Set<string>();
  private snapshotSchedule: number[] = [];
  private sessionStart = 0;
  private nextSnapshotIdx = 0;
  private guaranteedSnapshotTaken = false;

  reset(): void {
    this.events = [];
    this.snapshots = [];
    this.loggedChipFailures.clear();
    this.snapshotSchedule = [];
    this.sessionStart = 0;
    this.nextSnapshotIdx = 0;
    this.guaranteedSnapshotTaken = false;
    eventCounter = 0;
    snapshotCounter = 0;
  }

  startSession(): void {
    this.reset();
    this.sessionStart = Date.now();
    const durationMs = 8 * 60 * 1000;
    const count = 6;
    const minGap = 30_000;
    const times: number[] = [];
    let last = this.sessionStart + 15_000;
    for (let i = 0; i < count; i++) {
      const maxT = this.sessionStart + durationMs - 10_000;
      const t = i === 0
        ? last
        : last + minGap + Math.random() * (maxT - last - minGap * (count - i));
      times.push(Math.min(t, maxT));
      last = t;
    }
    this.snapshotSchedule = times.sort((a, b) => a - b);
    this.nextSnapshotIdx = 0;
  }

  logCoachingEvent(stepId: string, source: 'pose' | 'sensor', message: string): void {
    const key = `${stepId}:${source}:${message}`;
    const recent = this.events.find(
      e => e.message === message && Date.now() - e.timestamp < 5000,
    );
    if (recent) return;

    eventCounter += 1;
    this.events.push({
      id: `evt-${eventCounter}`,
      timestamp: Date.now(),
      stepId,
      source,
      message,
    });
  }

  logChipFailure(stepId: string, chipId: string, label: string): void {
    const key = `${stepId}:${chipId}`;
    if (this.loggedChipFailures.has(key)) return;
    this.loggedChipFailures.add(key);
    this.logCoachingEvent(stepId, 'pose', label);
  }

  clearChipFailure(chipId: string, stepId: string): void {
    this.loggedChipFailures.delete(`${stepId}:${chipId}`);
  }

  tryCaptureGuaranteedSnapshot(stepId: string, dataUrl: string | null): void {
    if (!dataUrl || this.guaranteedSnapshotTaken) return;
    const cprCameraSteps = new Set(['hand_placement', 'compressions', 'post_aed_compressions']);
    if (!cprCameraSteps.has(stepId)) return;

    snapshotCounter += 1;
    this.snapshots.push({
      id: `snap-${snapshotCounter}`,
      timestamp: Date.now(),
      stepId,
      dataUrl,
    });
    this.guaranteedSnapshotTaken = true;
  }

  tryCaptureSnapshot(stepId: string, dataUrl: string | null): void {
    if (!dataUrl || this.nextSnapshotIdx >= this.snapshotSchedule.length) return;
    const now = Date.now();
    if (now < this.snapshotSchedule[this.nextSnapshotIdx]) return;

    snapshotCounter += 1;
    this.snapshots.push({
      id: `snap-${snapshotCounter}`,
      timestamp: now,
      stepId,
      dataUrl,
    });
    this.nextSnapshotIdx += 1;
  }

  getEvents(): CoachingEvent[] {
    return [...this.events];
  }

  getSnapshots(): SessionSnapshot[] {
    return [...this.snapshots];
  }

  exportReport(metrics: Record<string, unknown>): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      metrics,
      sessionAnalytics: metrics.sessionAnalytics ?? null,
      coachingEvents: this.events,
      snapshots: this.snapshots.map(s => ({
        id: s.id,
        timestamp: s.timestamp,
        stepId: s.stepId,
        dataUrl: s.dataUrl,
      })),
    }, null, 2);
  }
}

export const sessionRecorder = new SessionRecorder();
