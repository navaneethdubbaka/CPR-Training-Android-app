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
