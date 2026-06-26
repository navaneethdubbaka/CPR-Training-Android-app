import {
  ELBOW_STRAIGHT_MIN_DEG,
  ELBOW_STRAIGHT_MIN_DEG_LEGACY,
  isInsideZone,
  isLowAnglePostureGood,
  LOOK_DOWN_NOSE_ABOVE_WRIST_Y,
  LOOK_DOWN_NOSE_BELOW_EAR_Y,
  LOOK_DOWN_NOSE_WRIST_X_MAX,
  LOW_ANGLE_FRAMING_ZONE,
  POSE_CONF_DEFAULT,
  POSE_CONF_EAR,
  POSE_CONF_NOSE,
  type FramingZone,
  type PoseAnalysisProfile,
  type PoseCheckMode,
  TRIANGLE_ELBOW_LINE_MAX_DIST,
  TRIANGLE_WRIST_BELOW_SHOULDER_Y,
  TRIANGLE_WRIST_NARROWER_RATIO,
} from './cpr-pose-constants';

export interface PoseKeypoint {
  y: number;
  x: number;
  score: number;
}

export const KEYPOINT_NAMES = [
  'nose',
  'left_eye', 'right_eye',
  'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
] as const;

export const KP = {
  NOSE: 0,
  LEFT_EYE: 1, RIGHT_EYE: 2,
  LEFT_EAR: 3, RIGHT_EAR: 4,
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
  LEFT_WRIST: 9, RIGHT_WRIST: 10,
  LEFT_HIP: 11, RIGHT_HIP: 12,
  LEFT_KNEE: 13, RIGHT_KNEE: 14,
  LEFT_ANKLE: 15, RIGHT_ANKLE: 16,
} as const;

export const SKELETON_CONNECTIONS: [number, number][] = [
  [KP.NOSE, KP.LEFT_EYE], [KP.NOSE, KP.RIGHT_EYE],
  [KP.LEFT_EYE, KP.LEFT_EAR], [KP.RIGHT_EYE, KP.RIGHT_EAR],
  [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER, KP.LEFT_ELBOW], [KP.LEFT_ELBOW, KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW], [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  [KP.LEFT_SHOULDER, KP.LEFT_HIP], [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.LEFT_KNEE], [KP.LEFT_KNEE, KP.LEFT_ANKLE],
  [KP.RIGHT_HIP, KP.RIGHT_KNEE], [KP.RIGHT_KNEE, KP.RIGHT_ANKLE],
];

export const CPR_KEYPOINT_INDICES: number[] = [
  KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER,
  KP.LEFT_ELBOW, KP.RIGHT_ELBOW,
  KP.LEFT_WRIST, KP.RIGHT_WRIST,
  KP.LEFT_HIP, KP.RIGHT_HIP,
];

export interface CPRPostureResult {
  quality: 'good' | 'fair' | 'poor' | 'none';
  leftArmAngle: number;
  rightArmAngle: number;
  armsVisible: boolean;
  armsAreStraight: boolean;
  shouldersOverWrists: boolean;
  earsVisible: boolean;
  lookingDown: boolean;
  triangleFormed: boolean;
  framingOk: boolean;
  elbowBent: boolean;
  tips: string[];
}

export const EMPTY_POSTURE_RESULT: CPRPostureResult = {
  quality: 'none',
  leftArmAngle: 0,
  rightArmAngle: 0,
  armsVisible: false,
  armsAreStraight: false,
  shouldersOverWrists: false,
  earsVisible: false,
  lookingDown: false,
  triangleFormed: false,
  framingOk: false,
  elbowBent: false,
  tips: ['No pose detected'],
};

function calcAngle(a: PoseKeypoint, b: PoseKeypoint, c: PoseKeypoint): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag = Math.sqrt((v1x * v1x + v1y * v1y) * (v2x * v2x + v2y * v2y));
  if (mag < 0.0001) return 0;
  const cos = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.0001) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function checkFraming(keypoints: PoseKeypoint[], zone: FramingZone): boolean {
  const le = keypoints[KP.LEFT_EAR];
  const re = keypoints[KP.RIGHT_EAR];
  const ls = keypoints[KP.LEFT_SHOULDER];
  const rs = keypoints[KP.RIGHT_SHOULDER];
  const lw = keypoints[KP.LEFT_WRIST];
  const rw = keypoints[KP.RIGHT_WRIST];

  const earsOk =
    le.score > POSE_CONF_EAR && re.score > POSE_CONF_EAR &&
    isInsideZone(le.x, le.y, zone) &&
    isInsideZone(re.x, re.y, zone);

  const shouldersOk =
    ls.score > POSE_CONF_DEFAULT && rs.score > POSE_CONF_DEFAULT &&
    isInsideZone(ls.x, ls.y, zone) &&
    isInsideZone(rs.x, rs.y, zone);

  const wristsOk =
    lw.score > POSE_CONF_DEFAULT && rw.score > POSE_CONF_DEFAULT &&
    isInsideZone(lw.x, lw.y, zone) &&
    isInsideZone(rw.x, rw.y, zone);

  return earsOk && shouldersOk && wristsOk;
}

/** Steps 1–3: head + shoulders in frame, no wrists required. */
function checkFramingLite(keypoints: PoseKeypoint[], zone: FramingZone): boolean {
  const nose = keypoints[KP.NOSE];
  const le = keypoints[KP.LEFT_EAR];
  const re = keypoints[KP.RIGHT_EAR];
  const ls = keypoints[KP.LEFT_SHOULDER];
  const rs = keypoints[KP.RIGHT_SHOULDER];

  const shouldersOk =
    ls.score > POSE_CONF_DEFAULT && rs.score > POSE_CONF_DEFAULT &&
    isInsideZone(ls.x, ls.y, zone) &&
    isInsideZone(rs.x, rs.y, zone);

  const bothEarsOk =
    le.score > POSE_CONF_EAR && re.score > POSE_CONF_EAR &&
    isInsideZone(le.x, le.y, zone) &&
    isInsideZone(re.x, re.y, zone);

  const noseOk =
    nose.score > POSE_CONF_NOSE &&
    isInsideZone(nose.x, nose.y, zone);

  const headOk = bothEarsOk || noseOk;
  return shouldersOk && headOk;
}

function checkLookingDown(
  nose: PoseKeypoint,
  leftEar: PoseKeypoint,
  rightEar: PoseKeypoint,
  lw: PoseKeypoint,
  rw: PoseKeypoint,
): boolean {
  if (nose.score < POSE_CONF_NOSE) return false;
  if (leftEar.score < POSE_CONF_EAR || rightEar.score < POSE_CONF_EAR) return false;
  if (lw.score < POSE_CONF_DEFAULT || rw.score < POSE_CONF_DEFAULT) return false;

  const midEarY = (leftEar.y + rightEar.y) / 2;
  const midWristX = (lw.x + rw.x) / 2;
  const midWristY = (lw.y + rw.y) / 2;

  const noseBelowEars = nose.y > midEarY + LOOK_DOWN_NOSE_BELOW_EAR_Y;
  const noseNearHands = Math.abs(nose.x - midWristX) < LOOK_DOWN_NOSE_WRIST_X_MAX;
  const noseAboveWrists = nose.y < midWristY - LOOK_DOWN_NOSE_ABOVE_WRIST_Y;

  return noseBelowEars && noseNearHands && noseAboveWrists;
}

/** Early steps: nose below ear midpoint (no wrists needed). */
function checkLookingDownLite(
  nose: PoseKeypoint,
  leftEar: PoseKeypoint,
  rightEar: PoseKeypoint,
): boolean {
  if (nose.score < POSE_CONF_NOSE) return false;
  if (leftEar.score < POSE_CONF_EAR && rightEar.score < POSE_CONF_EAR) return false;

  const midEarY =
    leftEar.score > POSE_CONF_EAR && rightEar.score > POSE_CONF_EAR
      ? (leftEar.y + rightEar.y) / 2
      : leftEar.score > rightEar.score ? leftEar.y : rightEar.y;

  return nose.y > midEarY + LOOK_DOWN_NOSE_BELOW_EAR_Y * 0.5;
}

function checkTriangle(
  ls: PoseKeypoint,
  rs: PoseKeypoint,
  le: PoseKeypoint,
  re: PoseKeypoint,
  lw: PoseKeypoint,
  rw: PoseKeypoint,
): boolean {
  const midShoulderY = (ls.y + rs.y) / 2;
  const midWristY = (lw.y + rw.y) / 2;
  const wristsBelow = midWristY > midShoulderY + TRIANGLE_WRIST_BELOW_SHOULDER_Y;

  const shoulderSpan = Math.abs(ls.x - rs.x);
  const wristSpan = Math.abs(lw.x - rw.x);
  const wristsNarrower = wristSpan < shoulderSpan * TRIANGLE_WRIST_NARROWER_RATIO;

  const leftElbowOnLine = pointToSegmentDist(le.x, le.y, ls.x, ls.y, lw.x, lw.y) < TRIANGLE_ELBOW_LINE_MAX_DIST;
  const rightElbowOnLine = pointToSegmentDist(re.x, re.y, rs.x, rs.y, rw.x, rw.y) < TRIANGLE_ELBOW_LINE_MAX_DIST;

  return wristsBelow && wristsNarrower && leftElbowOnLine && rightElbowOnLine;
}

function buildLowAngleTips(
  result: {
    framingOk: boolean;
    earsVisible: boolean;
    lookingDown: boolean;
    armsAreStraight: boolean;
    triangleFormed: boolean;
    armsVisible: boolean;
  },
  mode: PoseCheckMode,
): string[] {
  const tips: string[] = [];
  if (!result.framingOk) tips.push('Move into the frame');
  if (!result.lookingDown) tips.push('Look down at the chest');
  if (mode === 'framing_only') return tips;

  if (!result.earsVisible) tips.push('Show both ears in frame');
  if (result.armsVisible && !result.armsAreStraight) tips.push('Keep the elbow straight');
  if (!result.triangleFormed) tips.push('Stack shoulders over hands');
  if (!result.armsVisible) tips.push('Raise hands into camera view');
  return tips;
}

function analyzeFramingOnly(keypoints: PoseKeypoint[], zone: FramingZone): CPRPostureResult {
  const nose = keypoints[KP.NOSE];
  const leEar = keypoints[KP.LEFT_EAR];
  const reEar = keypoints[KP.RIGHT_EAR];

  const framingOk = checkFramingLite(keypoints, zone);
  const lookingDown = checkLookingDownLite(nose, leEar, reEar);
  const tips = buildLowAngleTips({
    framingOk,
    earsVisible: false,
    lookingDown,
    armsAreStraight: true,
    triangleFormed: true,
    armsVisible: false,
  }, 'framing_only');

  let quality: 'good' | 'fair' | 'poor' | 'none';
  if (framingOk && lookingDown) {
    quality = 'good';
  } else if (framingOk || lookingDown) {
    quality = 'fair';
  } else {
    quality = 'none';
  }

  return {
    quality,
    leftArmAngle: 0,
    rightArmAngle: 0,
    armsVisible: false,
    armsAreStraight: true,
    shouldersOverWrists: false,
    earsVisible: false,
    lookingDown,
    triangleFormed: true,
    framingOk,
    elbowBent: false,
    tips,
  };
}

function analyzeLegacy(keypoints: PoseKeypoint[]): CPRPostureResult {
  const ls = keypoints[KP.LEFT_SHOULDER];
  const rs = keypoints[KP.RIGHT_SHOULDER];
  const le = keypoints[KP.LEFT_ELBOW];
  const re = keypoints[KP.RIGHT_ELBOW];
  const lw = keypoints[KP.LEFT_WRIST];
  const rw = keypoints[KP.RIGHT_WRIST];

  const armsVisible =
    ls.score > POSE_CONF_DEFAULT && rs.score > POSE_CONF_DEFAULT &&
    le.score > POSE_CONF_DEFAULT && re.score > POSE_CONF_DEFAULT &&
    lw.score > POSE_CONF_DEFAULT && rw.score > POSE_CONF_DEFAULT;

  if (!armsVisible) {
    return { ...EMPTY_POSTURE_RESULT, tips: ['Raise hands into camera view'] };
  }

  const leftAngle = calcAngle(ls, le, lw);
  const rightAngle = calcAngle(rs, re, rw);
  const leftStraight = leftAngle > ELBOW_STRAIGHT_MIN_DEG_LEGACY;
  const rightStraight = rightAngle > ELBOW_STRAIGHT_MIN_DEG_LEGACY;
  const armsAreStraight = leftStraight && rightStraight;

  const midWristX = (lw.x + rw.x) / 2;
  const midShoulderX = (ls.x + rs.x) / 2;
  const shouldersOverWrists = Math.abs(midShoulderX - midWristX) < 0.15;

  const tips: string[] = [];
  if (!armsAreStraight) tips.push('Keep the elbow straight');
  if (!shouldersOverWrists) tips.push('Lean forward — shoulders over wrists');

  let quality: 'good' | 'fair' | 'poor';
  if (armsAreStraight && shouldersOverWrists) {
    quality = 'good';
  } else if (leftStraight || rightStraight) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }

  return {
    quality,
    leftArmAngle: leftAngle,
    rightArmAngle: rightAngle,
    armsVisible,
    armsAreStraight,
    shouldersOverWrists,
    earsVisible: true,
    lookingDown: true,
    triangleFormed: shouldersOverWrists,
    framingOk: true,
    elbowBent: !armsAreStraight,
    tips,
  };
}

function analyzeLowAngle45(
  keypoints: PoseKeypoint[],
  mode: PoseCheckMode,
  zone: FramingZone,
): CPRPostureResult {
  if (mode === 'framing_only') {
    return analyzeFramingOnly(keypoints, zone);
  }

  const nose = keypoints[KP.NOSE];
  const leEar = keypoints[KP.LEFT_EAR];
  const reEar = keypoints[KP.RIGHT_EAR];
  const ls = keypoints[KP.LEFT_SHOULDER];
  const rs = keypoints[KP.RIGHT_SHOULDER];
  const le = keypoints[KP.LEFT_ELBOW];
  const re = keypoints[KP.RIGHT_ELBOW];
  const lw = keypoints[KP.LEFT_WRIST];
  const rw = keypoints[KP.RIGHT_WRIST];

  const framingOk = checkFraming(keypoints, zone);

  const earsVisible =
    leEar.score > POSE_CONF_EAR && reEar.score > POSE_CONF_EAR;

  const armsVisible =
    ls.score > POSE_CONF_DEFAULT && rs.score > POSE_CONF_DEFAULT &&
    le.score > POSE_CONF_DEFAULT && re.score > POSE_CONF_DEFAULT &&
    lw.score > POSE_CONF_DEFAULT && rw.score > POSE_CONF_DEFAULT;

  if (!armsVisible && !earsVisible) {
    return {
      ...EMPTY_POSTURE_RESULT,
      framingOk,
      tips: framingOk ? ['Raise hands into camera view'] : ['Move into the frame'],
    };
  }

  const leftAngle = armsVisible ? calcAngle(ls, le, lw) : 0;
  const rightAngle = armsVisible ? calcAngle(rs, re, rw) : 0;
  const leftStraight = leftAngle >= ELBOW_STRAIGHT_MIN_DEG;
  const rightStraight = rightAngle >= ELBOW_STRAIGHT_MIN_DEG;
  const armsAreStraight = armsVisible && leftStraight && rightStraight;
  const elbowBent = armsVisible && !armsAreStraight;

  const midWristX = (lw.x + rw.x) / 2;
  const midShoulderX = (ls.x + rs.x) / 2;
  const shouldersOverWrists = armsVisible && Math.abs(midShoulderX - midWristX) < 0.15;

  const lookingDown = checkLookingDown(nose, leEar, reEar, lw, rw);
  const triangleFormed = armsVisible && checkTriangle(ls, rs, le, re, lw, rw);

  const partial = {
    framingOk,
    earsVisible,
    lookingDown,
    armsAreStraight,
    triangleFormed,
    armsVisible,
  };
  const tips = buildLowAngleTips(partial, 'full_cpr');

  let quality: 'good' | 'fair' | 'poor' | 'none';
  if (isLowAnglePostureGood(partial)) {
    quality = 'good';
  } else if (framingOk && (earsVisible || armsVisible)) {
    const passCount = [earsVisible, lookingDown, armsAreStraight, triangleFormed].filter(Boolean).length;
    quality = passCount >= 2 ? 'fair' : 'poor';
  } else {
    quality = 'none';
  }

  return {
    quality,
    leftArmAngle: leftAngle,
    rightArmAngle: rightAngle,
    armsVisible,
    armsAreStraight,
    shouldersOverWrists,
    earsVisible,
    lookingDown,
    triangleFormed,
    framingOk,
    elbowBent,
    tips,
  };
}

export function parseKeypointsFromFlat(flat: number[], flipX = false): PoseKeypoint[] {
  const kps: PoseKeypoint[] = [];
  for (let i = 0; i < 17; i++) {
    kps.push({
      y: flat[i * 3] ?? 0,
      x: flat[i * 3 + 1] ?? 0,
      score: flat[i * 3 + 2] ?? 0,
    });
  }

  const maxCoord = kps.reduce((m, k) => Math.max(m, k.x, k.y), 0);
  let scale = 1;
  if (maxCoord > 1) {
    scale = maxCoord > 20 ? 192 : maxCoord;
  }

  return kps.map(k => {
    let score = k.score;
    if (score > 1) {
      score = 1 / (1 + Math.exp(-score));
    }
    let x = Math.min(1, Math.max(0, k.x / scale));
    if (flipX) x = 1 - x;
    return {
      x,
      y: Math.min(1, Math.max(0, k.y / scale)),
      score: Math.min(1, Math.max(0, score)),
    };
  });
}

export function analyzeCPRPosture(
  keypoints: PoseKeypoint[],
  profile: PoseAnalysisProfile = 'legacy',
  checkMode: PoseCheckMode = 'full_cpr',
  framingZone: FramingZone = LOW_ANGLE_FRAMING_ZONE,
): CPRPostureResult {
  if (keypoints.length < 17) {
    return { ...EMPTY_POSTURE_RESULT };
  }

  if (profile === 'low_angle_45') {
    return analyzeLowAngle45(keypoints, checkMode, framingZone);
  }
  return analyzeLegacy(keypoints);
}
