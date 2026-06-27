export * from './pose-analysis';

import type { Frame, Orientation } from 'react-native-vision-camera';
import type { Options as ResizeOptions } from 'vision-camera-resize-plugin';
import { parseKeypointsFromFlat, type PoseKeypoint } from './pose-analysis';

export const MOVENET_MODEL = require('../assets/models/movenet_lightning.tflite');
export const POSE_INPUT_SIZE = 192;

export type PoseDetectorState = 'loading' | 'loaded' | 'error';

export interface FrameMeta {
  width: number;
  height: number;
  orientation: Orientation;
  mirrored: boolean;
}

export function orientationToRotation(
  orientation: Orientation,
): ResizeOptions<'uint8'>['rotation'] {
  'worklet';
  switch (orientation) {
    case 'landscape-left':
      return '90deg';
    case 'landscape-right':
      return '270deg';
    case 'portrait-upside-down':
      return '180deg';
    default:
      return '0deg';
  }
}

function isSidewaysOrientation(orientation: Orientation): boolean {
  'worklet';
  return orientation === 'landscape-left' || orientation === 'landscape-right';
}

export function buildResizeOptions(
  frame: Frame,
  mirrorInResize = true,
): ResizeOptions<'uint8'> {
  'worklet';
  return {
    scale: { width: POSE_INPUT_SIZE, height: POSE_INPUT_SIZE },
    pixelFormat: 'rgb',
    dataType: 'uint8',
    rotation: orientationToRotation(frame.orientation),
    mirror: mirrorInResize ? frame.isMirrored : false,
  };
}

export function flatOutputToKeypoints(raw: Float32Array | Uint8Array): PoseKeypoint[] {
  const flat: number[] = [];
  for (let i = 0; i < 51; i++) {
    flat.push(Number(raw[i] ?? 0));
  }
  return parseKeypointsFromFlat(flat);
}

export function maxKeypointScore(keypoints: PoseKeypoint[]): number {
  let max = 0;
  for (const kp of keypoints) {
    if (kp.score > max) max = kp.score;
  }
  return max;
}

export function swapDimensionsForOrientation(
  width: number,
  height: number,
  orientation: Orientation,
): { width: number; height: number } {
  if (!width || !height) return { width, height };
  if (orientation === 'portrait' || orientation === 'portrait-upside-down') {
    return { width: height, height: width };
  }
  return { width, height };
}
