import type { CPRStepId } from '@/constants/cpr-protocol';
import {
  COMPRESSION_INTERRUPTION_THRESHOLD_MS,
  COMPRESS_TO_BREATH_TARGET_MS,
} from '@/constants/cpr-protocol';
import type { CPRPostureResult } from '@/lib/pose-analysis';
import type { PoseCheckMode } from '@/lib/cpr-pose-constants';

export interface SessionAnalyticsSummary {
  elbowFoldCount: number;
  lookDownFailCount: number;
  compressionInterruptions: number;
  maxCompressToBreathGapMs: number;
  compressToBreathGapCount: number;
  compressToBreathTargetMs: number;
  avgRate: number;
  avgDepth: number;
}

export const DEFAULT_SESSION_ANALYTICS: SessionAnalyticsSummary = {
  elbowFoldCount: 0,
  lookDownFailCount: 0,
  compressionInterruptions: 0,
  maxCompressToBreathGapMs: 0,
  compressToBreathGapCount: 0,
  compressToBreathTargetMs: COMPRESS_TO_BREATH_TARGET_MS,
  avgRate: 0,
  avgDepth: 0,
};

const CPR_POSE_STEPS = new Set<CPRStepId>([
  'hand_placement',
  'compressions',
  'post_aed_compressions',
]);

const CPR_CYCLE_STEPS = new Set<CPRStepId>(['compressions', 'post_aed_compressions']);

class SessionAnalytics {
  private elbowFoldCount = 0;
  private lookDownFailCount = 0;
  private compressionInterruptions = 0;
  private maxCompressToBreathGapMs = 0;
  private compressToBreathGapCount = 0;

  private prevElbowOk: boolean | null = null;
  private prevLookOk: boolean | null = null;
  private lastCompressionAt = 0;
  private lastCycleCompressionAt: number | null = null;
  private pendingCompressToBreath = false;

  reset(): void {
    this.elbowFoldCount = 0;
    this.lookDownFailCount = 0;
    this.compressionInterruptions = 0;
    this.maxCompressToBreathGapMs = 0;
    this.compressToBreathGapCount = 0;
    this.prevElbowOk = null;
    this.prevLookOk = null;
    this.lastCompressionAt = 0;
    this.lastCycleCompressionAt = null;
    this.pendingCompressToBreath = false;
  }

  recordPoseFrame(
    stepId: string,
    result: CPRPostureResult,
    checkMode: PoseCheckMode = 'full_cpr',
  ): void {
    if (checkMode !== 'full_cpr') return;
    if (!CPR_POSE_STEPS.has(stepId as CPRStepId)) return;

    const elbowOk = result.armsVisible && result.armsAreStraight && !result.elbowBent;
    const lookOk = result.lookingDown;

    if (this.prevElbowOk === true && !elbowOk) {
      this.elbowFoldCount += 1;
    }
    if (this.prevLookOk === true && !lookOk) {
      this.lookDownFailCount += 1;
    }

    if (result.armsVisible) {
      this.prevElbowOk = elbowOk;
    }
    this.prevLookOk = lookOk;
  }

  /** Compression during COMPRESSION phase — count gaps >= 10s between consecutive compressions. */
  recordCompressionInPhase(stepId: string, now: number): void {
    if (!CPR_CYCLE_STEPS.has(stepId as CPRStepId)) return;

    if (this.lastCompressionAt > 0 && now - this.lastCompressionAt >= COMPRESSION_INTERRUPTION_THRESHOLD_MS) {
      this.compressionInterruptions += 1;
    }
    this.lastCompressionAt = now;
  }

  /** 30th compression — start measuring time until first breath. */
  markCycleCompressionsComplete(stepId: string, now: number): void {
    if (!CPR_CYCLE_STEPS.has(stepId as CPRStepId)) return;

    this.lastCycleCompressionAt = now;
    this.pendingCompressToBreath = true;
    this.lastCompressionAt = 0;
  }

  /** First breath of cycle — record compress-to-breath gap. */
  recordFirstBreathOfCycle(stepId: string, now: number, breathCount: number): void {
    if (!CPR_CYCLE_STEPS.has(stepId as CPRStepId)) return;
    if (!this.pendingCompressToBreath || breathCount !== 1 || this.lastCycleCompressionAt === null) return;

    const gap = now - this.lastCycleCompressionAt;
    this.maxCompressToBreathGapMs = Math.max(this.maxCompressToBreathGapMs, gap);
    this.compressToBreathGapCount += 1;
    this.pendingCompressToBreath = false;
    this.lastCycleCompressionAt = null;
  }

  /** After full 30:2 cycle — do not count breath-to-compression pause as interruption. */
  resetCompressionTimingForNewCycle(): void {
    this.lastCompressionAt = 0;
    this.pendingCompressToBreath = false;
    this.lastCycleCompressionAt = null;
  }

  finalize(avgRate: number, avgDepth: number): SessionAnalyticsSummary {
    return {
      elbowFoldCount: this.elbowFoldCount,
      lookDownFailCount: this.lookDownFailCount,
      compressionInterruptions: this.compressionInterruptions,
      maxCompressToBreathGapMs: this.maxCompressToBreathGapMs,
      compressToBreathGapCount: this.compressToBreathGapCount,
      compressToBreathTargetMs: COMPRESS_TO_BREATH_TARGET_MS,
      avgRate,
      avgDepth,
    };
  }

  getSummary(): SessionAnalyticsSummary {
    return this.finalize(0, 0);
  }
}

export const sessionAnalytics = new SessionAnalytics();
