export * from './pose-analysis';

import { useTensorflowModel } from 'react-native-fast-tflite';
import { useRunOnJS } from 'react-native-worklets-core';
import { useSharedValue } from 'react-native-reanimated';
import { useFrameProcessor, runAtTargetFps, type Frame, type ReadonlyFrameProcessor } from 'react-native-vision-camera';
import { analyzeCPRPosture, parseKeypointsFromFlat, type PoseKeypoint, type CPRPostureResult } from './pose-analysis';

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
  onInferenceTick?: () => void,
): PoseDetectorHook {
  const plugin = useTensorflowModel(LOCAL_MODEL);
  const modelReady = plugin.state === 'loaded';
  const lastErrorAt = useSharedValue<number>(0);

  const handleResult = useRunOnJS((flat: number[]) => {
    const kps = parseKeypointsFromFlat(flat);
    const result = analyzeCPRPosture(kps);
    onInferenceTick?.();
    onPostureResult(kps, result);
  }, [onPostureResult, onInferenceTick]);

  const handleError = useRunOnJS((msg: string) => {
    console.warn('[PoseDetector] Frame inference error:', msg);
  }, []);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!enabled) return;
    runAtTargetFps(7, () => {
      'worklet';
      try {
        const model = plugin.model;
        if (model == null) return;
        const buffer = frame.toArrayBuffer();
        const input = preprocessRGBFrame(buffer, frame.width, frame.height);
        const outputs = model.runSync([input]);
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
  }, [plugin.model, plugin.state, enabled, handleResult, handleError, lastErrorAt]);

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
