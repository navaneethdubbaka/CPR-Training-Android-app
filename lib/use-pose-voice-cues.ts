import { useEffect, useRef } from 'react';
import type { CPRPostureResult } from '@/lib/pose-analysis';
import { pickPoseCue, speakCoachingCue } from '@/lib/coaching-cues';

/** Debounced voice coaching for pose feedback (web + compressions sidebar). */
export function usePoseVoiceCues(
  postureResult: CPRPostureResult | null | undefined,
  enabled: boolean,
): void {
  const lastCueTime = useRef(0);
  const poseCueRef = useRef<string | null>(null);
  const poseCueSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !postureResult) return;

    const now = Date.now();
    if (now - lastCueTime.current < 3000) return;

    const poseCue = pickPoseCue(postureResult);
    if (!poseCue) {
      poseCueRef.current = null;
      poseCueSinceRef.current = null;
      return;
    }

    if (poseCueRef.current !== poseCue) {
      poseCueRef.current = poseCue;
      poseCueSinceRef.current = now;
      return;
    }

    if (poseCueSinceRef.current && now - poseCueSinceRef.current >= 1500) {
      lastCueTime.current = now;
      speakCoachingCue(poseCue);
      poseCueSinceRef.current = now;
    }
  }, [enabled, postureResult]);
}
