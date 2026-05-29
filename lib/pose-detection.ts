import { useTensorflowModel } from 'react-native-fast-tflite';
import { useRunOnJS } from 'react-native-worklets-core';
import { useSharedValue } from 'react-native-reanimated';
import { useFrameProcessor, runAtTargetFps, type Frame, type ReadonlyFrameProcessor } from 'react-native-vision-camera';

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
  tips: string[];
}

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

export function parseKeypointsFromFlat(flat: number[]): PoseKeypoint[] {
  const kps: PoseKeypoint[] = [];
  for (let i = 0; i < 17; i++) {
    kps.push({
      y: flat[i * 3] ?? 0,
      x: flat[i * 3 + 1] ?? 0,
      score: flat[i * 3 + 2] ?? 0,
    });
  }
  return kps;
}

export function analyzeCPRPosture(keypoints: PoseKeypoint[]): CPRPostureResult {
  if (keypoints.length < 17) {
    return {
      quality: 'none', leftArmAngle: 0, rightArmAngle: 0,
      armsVisible: false, armsAreStraight: false, shouldersOverWrists: false,
      tips: ['No pose detected'],
    };
  }

  const CONF = 0.25;
  const ls = keypoints[KP.LEFT_SHOULDER];
  const rs = keypoints[KP.RIGHT_SHOULDER];
  const le = keypoints[KP.LEFT_ELBOW];
  const re = keypoints[KP.RIGHT_ELBOW];
  const lw = keypoints[KP.LEFT_WRIST];
  const rw = keypoints[KP.RIGHT_WRIST];

  const armsVisible =
    ls.score > CONF && rs.score > CONF &&
    le.score > CONF && re.score > CONF &&
    lw.score > CONF && rw.score > CONF;

  if (!armsVisible) {
    return {
      quality: 'none', leftArmAngle: 0, rightArmAngle: 0,
      armsVisible: false, armsAreStraight: false, shouldersOverWrists: false,
      tips: ['Raise hands into camera view'],
    };
  }

  const leftAngle = calcAngle(ls, le, lw);
  const rightAngle = calcAngle(rs, re, rw);
  const leftStraight = leftAngle > 160;
  const rightStraight = rightAngle > 160;
  const armsAreStraight = leftStraight && rightStraight;

  const midWristX = (lw.x + rw.x) / 2;
  const midShoulderX = (ls.x + rs.x) / 2;
  const shouldersOverWrists = Math.abs(midShoulderX - midWristX) < 0.15;

  const tips: string[] = [];
  if (!armsAreStraight) tips.push('Straighten arms');
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
    quality, leftArmAngle: leftAngle, rightArmAngle: rightAngle,
    armsVisible, armsAreStraight, shouldersOverWrists, tips,
  };
}

const INPUT_SIZE = 192;

function preprocessRGBFrame(buffer: ArrayBuffer, srcW: number, srcH: number): Uint8Array {
  'worklet';
  const src = new Uint8Array(buffer);
  const dst = new Uint8Array(INPUT_SIZE * INPUT_SIZE * 3);
  const scaleX = srcW / INPUT_SIZE;
  const scaleY = srcH / INPUT_SIZE;
  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      const sx = Math.floor(x * scaleX);
      const sy = Math.floor(y * scaleY);
      const si = (sy * srcW + sx) * 3;
      const di = (y * INPUT_SIZE + x) * 3;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
    }
  }
  return dst;
}

const LOCAL_MODEL = require('../assets/models/movenet_lightning.tflite');

export type PoseDetectorState = 'loading' | 'loaded' | 'error';

export interface PoseDetectorHook {
  state: PoseDetectorState;
  frameProcessor: ReadonlyFrameProcessor | undefined;
}

const ERROR_LOG_INTERVAL_MS = 5000;

export function usePoseDetector(
  enabled: boolean,
  onPostureResult: (keypoints: PoseKeypoint[], result: CPRPostureResult) => void,
): PoseDetectorHook {
  const plugin = useTensorflowModel(LOCAL_MODEL);
  const modelReady = plugin.state === 'loaded';
  const lastErrorAt = useSharedValue<number>(0);

  const handleResult = useRunOnJS((flat: number[]) => {
    const kps = parseKeypointsFromFlat(flat);
    const result = analyzeCPRPosture(kps);
    onPostureResult(kps, result);
  }, [onPostureResult]);

  const handleError = useRunOnJS((msg: string) => {
    console.warn('[PoseDetector] Frame inference error:', msg);
  }, []);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!enabled || plugin.state !== 'loaded') return;
    runAtTargetFps(7, () => {
      'worklet';
      try {
        const buffer = frame.toArrayBuffer();
        const input = preprocessRGBFrame(buffer, frame.width, frame.height);
        const outputs = plugin.model.runSync([input]);
        const raw = outputs[0];
        const arr: number[] = [];
        for (let i = 0; i < 51; i++) {
          arr.push(Number((raw as Float32Array | Uint8Array)[i] ?? 0));
        }
        handleResult(arr);
      } catch (e) {
        const now = Date.now();
        if (now - lastErrorAt.value > ERROR_LOG_INTERVAL_MS) {
          lastErrorAt.value = now;
          handleError(String(e));
        }
      }
    });
  }, [plugin, enabled, handleResult, handleError, lastErrorAt]);

  return {
    state: plugin.state as PoseDetectorState,
    frameProcessor: enabled && modelReady ? frameProcessor : undefined,
  };
}

export function detectPose(
  frame: Frame,
  model: { runSync: (inputs: ArrayBuffer[] | Uint8Array[]) => (Float32Array | Uint8Array)[] },
): PoseKeypoint[] {
  'worklet';
  const buffer = frame.toArrayBuffer();
  const input = preprocessRGBFrame(buffer, frame.width, frame.height);
  const outputs = model.runSync([input]);
  const raw = outputs[0];
  const flat: number[] = [];
  for (let i = 0; i < 51; i++) {
    flat.push(Number(raw[i] ?? 0));
  }
  return parseKeypointsFromFlat(flat);
}
