import { useEffect, useRef, useState, type RefObject } from 'react';
import '@tensorflow/tfjs-backend-wasm';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import {
  analyzeCPRPosture,
  KEYPOINT_NAMES,
  type CPRPostureResult,
  type PoseKeypoint,
} from './pose-analysis';

export type WebPoseDetectorState = 'loading' | 'loaded' | 'error';

const FRAME_INTERVAL_MS = 1000 / 7;
const TFJS_VERSION = '4.22.0';

type TfKeypoint = { name?: string; x: number; y: number; score?: number };

export type PoseDetectorHandle = {
  estimatePoses: (v: HTMLVideoElement) => Promise<{ keypoints: TfKeypoint[] }[]>;
  dispose: () => void;
};

function toNormalizedKeypoints(
  raw: TfKeypoint[],
  width: number,
  height: number,
  mirrorX: boolean,
): PoseKeypoint[] {
  const byName = new Map(raw.map(kp => [kp.name ?? '', kp]));
  return KEYPOINT_NAMES.map(name => {
    const kp = byName.get(name);
    if (!kp || !width || !height) {
      return { x: 0, y: 0, score: 0 };
    }
    let x = kp.x / width;
    const y = kp.y / height;
    if (mirrorX) x = 1 - x;
    return { x, y, score: kp.score ?? 0 };
  });
}

/** Initialize TF backend — try WASM, WebGL, then CPU. */
async function initTensorFlowBackend(): Promise<string> {
  const tf = await import('@tensorflow/tfjs');

  const attempts: Array<{ name: string; init: () => Promise<void> }> = [
    {
      name: 'wasm',
      init: async () => {
        const wasm = await import('@tensorflow/tfjs-backend-wasm');
        wasm.setWasmPaths(
          `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${TFJS_VERSION}/dist/`,
        );
        await tf.setBackend('wasm');
      },
    },
    {
      name: 'webgl',
      init: async () => {
        await import('@tensorflow/tfjs-backend-webgl');
        await tf.setBackend('webgl');
      },
    },
    {
      name: 'cpu',
      init: async () => {
        await import('@tensorflow/tfjs-backend-cpu');
        await tf.setBackend('cpu');
      },
    },
  ];

  const errors: string[] = [];
  for (const { name, init } of attempts) {
    try {
      await init();
      await tf.ready();
      if (tf.getBackend() === name) {
        return name;
      }
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(errors.join(' | ') || 'No TensorFlow backend available');
}

/** Load MoveNet detector (shared by hook + manual retry). */
export async function createWebPoseDetector(): Promise<{
  detector: PoseDetectorHandle;
  backend: string;
}> {
  const backend = await initTensorFlowBackend();
  const poseDetection = await import('@tensorflow-models/pose-detection');
  const detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
  );
  return { detector, backend };
}

export function useWebPoseDetector(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onPostureResult: (keypoints: PoseKeypoint[], result: CPRPostureResult) => void,
  mirrorX = true,
): { state: WebPoseDetectorState; errorMessage: string | null; backend: string | null; retry: () => void } {
  const [state, setState] = useState<WebPoseDetectorState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const detectorRef = useRef<PoseDetectorHandle | null>(null);
  const loadGenRef = useRef(0);
  const rafRef = useRef(0);
  const lastInferRef = useRef(0);
  const inferringRef = useRef(false);

  const retry = () => setRetryCount(c => c + 1);

  useEffect(() => {
    if (!enabled) {
      setState('loading');
      setErrorMessage(null);
      return;
    }

    const gen = ++loadGenRef.current;
    let disposed = false;

    setState('loading');
    setErrorMessage(null);

    void createWebPoseDetector()
      .then(({ detector, backend: bk }) => {
        if (disposed || gen !== loadGenRef.current) {
          detector.dispose();
          return;
        }
        detectorRef.current?.dispose();
        detectorRef.current = detector;
        setBackend(bk);
        setState('loaded');
      })
      .catch((e: unknown) => {
        if (disposed || gen !== loadGenRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[WebPose] Model load failed:', e);
        setErrorMessage(msg);
        setState('error');
      });

    return () => {
      disposed = true;
      detectorRef.current?.dispose();
      detectorRef.current = null;
    };
  }, [enabled, retryCount]);

  useEffect(() => {
    if (!enabled || state !== 'loaded') return;

    const tick = (now: number) => {
      const video = videoRef.current;
      const detector = detectorRef.current;

      if (video && detector && video.readyState >= 2 && !inferringRef.current) {
        if (now - lastInferRef.current >= FRAME_INTERVAL_MS) {
          lastInferRef.current = now;
          inferringRef.current = true;
          void detector
            .estimatePoses(video)
            .then(poses => {
              const pose = poses[0];
              if (pose?.keypoints?.length) {
                const w = video.videoWidth || video.clientWidth || 1;
                const h = video.videoHeight || video.clientHeight || 1;
                const kps = toNormalizedKeypoints(pose.keypoints, w, h, mirrorX);
                onPostureResult(kps, analyzeCPRPosture(kps, 'low_angle_45'));
              }
            })
            .catch(() => {})
            .finally(() => {
              inferringRef.current = false;
            });
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, state, videoRef, onPostureResult, mirrorX]);

  return { state, errorMessage, backend, retry };
}
