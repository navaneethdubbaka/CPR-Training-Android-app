/** MoveNet keypoint indices (matches KEYPOINT_NAMES in pose-analysis). */
const KP = {
  LEFT_EAR: 3,
  RIGHT_EAR: 4,
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
} as const;

/** Tall framing zone for front camera at ~45° on the ground. */
export const LOW_ANGLE_FRAMING_ZONE = { x: 0.18, y: 0.08, w: 0.64, h: 0.82 } as const;

/** Expanded framing zone for Android portrait phones (matches cover preview). */
export const ANDROID_PORTRAIT_FRAMING_ZONE = { x: 0.08, y: 0.05, w: 0.84, h: 0.90 } as const;

export type FramingZone = { x: number; y: number; w: number; h: number };

export function getFramingZone(platform: string, viewWidth: number, viewHeight: number): FramingZone {
  if (platform === 'android' && viewHeight > viewWidth) {
    return ANDROID_PORTRAIT_FRAMING_ZONE;
  }
  return LOW_ANGLE_FRAMING_ZONE;
}

export const POSE_CONF_DEFAULT = 0.25;
export const POSE_CONF_EAR = 0.18;
export const POSE_CONF_NOSE = 0.2;
export const ELBOW_STRAIGHT_MIN_DEG = 170;
export const ELBOW_STRAIGHT_MIN_DEG_LEGACY = 160;

/** Head-pitch heuristic thresholds (normalized 0–1, y increases downward). */
export const LOOK_DOWN_NOSE_BELOW_EAR_Y = 0.03;
export const LOOK_DOWN_NOSE_WRIST_X_MAX = 0.18;
export const LOOK_DOWN_NOSE_ABOVE_WRIST_Y = 0.02;

/** Triangle geometry thresholds. */
export const TRIANGLE_WRIST_BELOW_SHOULDER_Y = 0.08;
export const TRIANGLE_WRIST_NARROWER_RATIO = 0.95;
export const TRIANGLE_ELBOW_LINE_MAX_DIST = 0.06;

export const FRAMING_HOLD_MS = 1000;
export const HAND_PLACEMENT_HOLD_MS = 1500;

export type PoseAnalysisProfile = 'legacy' | 'low_angle_45';
export type PoseCheckMode = 'framing_only' | 'full_cpr';

const FRAMING_ONLY_STEPS = new Set([
  'scene_safety',
  'check_responsiveness',
  'call_911',
]);

const FULL_CPR_STEPS = new Set([
  'hand_placement',
  'compressions',
  'post_aed_compressions',
]);

export function getPoseCheckModeForStep(stepId: string): PoseCheckMode | null {
  if (FRAMING_ONLY_STEPS.has(stepId)) return 'framing_only';
  if (FULL_CPR_STEPS.has(stepId)) return 'full_cpr';
  return null;
}

/** Gate ready: framing_only needs frame + look down; full_cpr needs framingOk. */
export function isFramingGateReady(
  result: { framingOk: boolean; lookingDown: boolean },
  mode: PoseCheckMode,
): boolean {
  if (mode === 'framing_only') return result.framingOk && result.lookingDown;
  return result.framingOk;
}

/** CPR triangle overlay connections only. */
export const CPR_TRIANGLE_CONNECTIONS: [number, number][] = [
  [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER, KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW, KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  [KP.LEFT_WRIST, KP.RIGHT_WRIST],
];

/** Shoulder-to-wrist guide lines (shown when elbows bent). */
export const CPR_GUIDE_CONNECTIONS: [number, number][] = [
  [KP.LEFT_SHOULDER, KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_WRIST],
];

export const CPR_DISPLAY_KEYPOINTS: number[] = [
  KP.LEFT_EAR, KP.RIGHT_EAR,
  KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER,
  KP.LEFT_ELBOW, KP.RIGHT_ELBOW,
  KP.LEFT_WRIST, KP.RIGHT_WRIST,
];

export const CPR_TRIANGLE_KEYPOINT_INDICES: number[] = [
  KP.LEFT_EAR, KP.RIGHT_EAR,
  KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER,
  KP.LEFT_ELBOW, KP.RIGHT_ELBOW,
  KP.LEFT_WRIST, KP.RIGHT_WRIST,
];

export function isInsideZone(
  x: number,
  y: number,
  zone: { x: number; y: number; w: number; h: number },
  margin = 0.02,
): boolean {
  return (
    x >= zone.x - margin &&
    x <= zone.x + zone.w + margin &&
    y >= zone.y - margin &&
    y <= zone.y + zone.h + margin
  );
}

/** Full low-angle posture pass (hand placement verify + quality good). */
export function isLowAnglePostureGood(result: {
  framingOk: boolean;
  earsVisible: boolean;
  lookingDown: boolean;
  armsAreStraight: boolean;
  triangleFormed: boolean;
}): boolean {
  return (
    result.framingOk &&
    result.earsVisible &&
    result.lookingDown &&
    result.armsAreStraight &&
    result.triangleFormed
  );
}
