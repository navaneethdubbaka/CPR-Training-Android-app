import * as Speech from 'expo-speech';
import type { CPRPostureResult } from '@/lib/pose-analysis';
import { COMPRESSION_TARGET_RATE, COMPRESSION_TARGET_DEPTH } from '@/constants/cpr-protocol';

let lastSpokenAt = 0;

export function speakCoachingCue(text: string): void {
  try {
    const now = Date.now();
    if (now - lastSpokenAt < 3000) return;
    lastSpokenAt = now;
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

export function pickPoseCue(result: CPRPostureResult): string | null {
  if (result.quality === 'none' && !result.framingOk) {
    return 'Move into the frame';
  }
  if (!result.framingOk) return 'Move into the frame';
  if (!result.earsVisible) return 'Show both ears in frame';
  if (!result.lookingDown) return 'Look down at the chest';
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

export function getPoseCueChips(result: CPRPostureResult): PoseCueChip[] {
  return [
    {
      id: 'frame',
      label: result.framingOk ? 'In frame' : 'Move into frame',
      ok: result.framingOk,
      icon: 'crop-free',
    },
    {
      id: 'ears',
      label: result.earsVisible ? 'Ears visible' : 'Show both ears',
      ok: result.earsVisible,
      icon: 'ear-hearing',
    },
    {
      id: 'look',
      label: result.lookingDown ? 'Looking down' : 'Look at chest',
      ok: result.lookingDown,
      icon: 'eye-outline',
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
