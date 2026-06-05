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
  if (!result.armsVisible) return null;
  if (!result.armsAreStraight) return 'Straighten your arms';
  if (!result.shouldersOverWrists) return 'Lean forward';
  return null;
}

