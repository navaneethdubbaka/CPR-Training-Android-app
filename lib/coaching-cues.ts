import * as Speech from 'expo-speech';
import type { CPRPostureResult } from '@/lib/pose-analysis';
import type { PoseCheckMode } from '@/lib/cpr-pose-constants';
import { COMPRESSION_TARGET_RATE, COMPRESSION_TARGET_DEPTH } from '@/constants/cpr-protocol';
import { sessionRecorder } from '@/lib/session-recorder';

let lastSpokenAt = 0;

export function speakCoachingCue(text: string, source: 'pose' | 'sensor' = 'pose', stepId?: string): void {
  try {
    const now = Date.now();
    if (now - lastSpokenAt < 3000) return;
    lastSpokenAt = now;
    if (stepId) {
      sessionRecorder.logCoachingEvent(stepId, source, text);
    }
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.95,
    });
  } catch (_) {}
}

export function pickSensorCue(currentRate: number, currentDepth: number): string | null {
  if (currentRate === 0 && currentDepth === 0) return null;

  const rateTooSlow = currentRate > 0 && currentRate < COMPRESSION_TARGET_RATE.min;
  const rateTooFast = currentRate > 0 && currentRate > COMPRESSION_TARGET_RATE.max;
  const depthTooShallow = currentDepth > 0 && currentDepth < COMPRESSION_TARGET_DEPTH.min;
  const depthTooDeep = currentDepth > 0 && currentDepth > COMPRESSION_TARGET_DEPTH.max;

  if (depthTooShallow) return 'Press harder';
  if (depthTooDeep) return 'Press less deeply';
  if (rateTooSlow) return 'Speed up';
  if (rateTooFast) return 'Slow down';
  return null;
}

export function pickPoseCue(result: CPRPostureResult, mode: PoseCheckMode = 'full_cpr'): string | null {
  if (!result.framingOk) return 'Move into the frame';
  if (!result.lookingDown) return 'Look down at the chest';
  if (mode === 'framing_only') return null;

  if (!result.earsVisible) return 'Show both ears in frame';
  if (result.elbowBent || !result.armsAreStraight) return 'Keep the elbow straight';
  if (!result.triangleFormed) return 'Stack shoulders over hands';
  return null;
}

export type PoseCueChip = {
  id: string;
  label: string;
  ok: boolean;
  icon: string;
};

export function getPoseCueChips(result: CPRPostureResult, mode: PoseCheckMode = 'full_cpr'): PoseCueChip[] {
  const base: PoseCueChip[] = [
    {
      id: 'frame',
      label: result.framingOk ? 'In frame' : 'Move into frame',
      ok: result.framingOk,
      icon: 'crop-free',
    },
    {
      id: 'look',
      label: result.lookingDown ? 'Looking down' : 'Look at chest',
      ok: result.lookingDown,
      icon: 'eye-outline',
    },
  ];

  if (mode === 'framing_only') return base;

  return [
    ...base,
    {
      id: 'ears',
      label: result.earsVisible ? 'Ears visible' : 'Show both ears',
      ok: result.earsVisible,
      icon: 'ear-hearing',
    },
    {
      id: 'elbow',
      label: result.armsAreStraight ? 'Elbows straight' : 'Keep the elbow straight',
      ok: result.armsAreStraight && !result.elbowBent,
      icon: 'arm-flex',
    },
    {
      id: 'triangle',
      label: result.triangleFormed ? 'Triangle formed' : 'Stack over hands',
      ok: result.triangleFormed,
      icon: 'triangle-outline',
    },
  ];
}
