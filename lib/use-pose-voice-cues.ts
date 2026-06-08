import { useEffect, useRef } from 'react';
import type { CPRPostureResult } from '@/lib/pose-analysis';
import type { PoseCheckMode } from '@/lib/cpr-pose-constants';
import { pickPoseCue, speakCoachingCue } from '@/lib/coaching-cues';

export function usePoseVoiceCues(
  postureResult: CPRPostureResult | null | undefined,
  enabled: boolean,
  checkMode: PoseCheckMode = 'full_cpr',
  stepId?: string,
): void {
  const lastCueTime = useRef(0);
  const poseCueRef = useRef<string | null>(null);
  const poseCueSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !postureResult) return;

    const now = Date.now();
    if (now - lastCueTime.current < 3000) return;

    const poseCue = pickPoseCue(postureResult, checkMode);
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
      speakCoachingCue(poseCue, 'pose', stepId);
      poseCueSinceRef.current = now;
    }
  }, [enabled, postureResult, checkMode, stepId]);
}
