import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';

import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';

import {

  Camera,

  useCameraDevice,

  useCameraDevices,

  useCameraFormat,

  useCameraPermission,

  useFrameProcessor,

  type Orientation,

} from 'react-native-vision-camera';

import { useTensorflowModel } from 'react-native-fast-tflite';

import { useResizePlugin } from 'vision-camera-resize-plugin';

import { useSharedValue } from 'react-native-reanimated';
import { useRunOnJS } from 'react-native-worklets-core';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getColors } from '@/constants/colors';

import { useTheme } from '@/contexts/ThemeContext';

import {

  MOVENET_MODEL,

  swapDimensionsForOrientation,

  type FrameMeta,

  type PoseKeypoint,

} from '@/lib/pose-detection';

import { analyzeCPRPosture, EMPTY_POSTURE_RESULT, parseKeypointsFromFlat, type CPRPostureResult } from '@/lib/pose-analysis';

import {

  HAND_PLACEMENT_HOLD_MS,

  isLowAnglePostureGood,

  getFramingZone,

  LOW_ANGLE_FRAMING_ZONE,

  type FramingZone,

  type PoseCheckMode,

} from '@/lib/cpr-pose-constants';

import { PoseSkeletonOverlay } from '@/components/PoseSkeletonOverlay';

import { PoseCueChips } from '@/components/PoseCueChips';

import { usePoseVoiceCues } from '@/lib/use-pose-voice-cues';

import { captureFrameSnapshot } from '@/lib/capture-frame-snapshot';

import { sessionRecorder } from '@/lib/session-recorder';



export const CAMERA_DEVICE_KEY = 'cpr_camera_device_id';



const ERROR_LOG_INTERVAL_MS = 5000;

const INFERENCE_STALL_MS = 2000;



interface Props {

  onHandDetected?: () => void;

  onPoseQuality?: (quality: CPRPostureResult['quality']) => void;

  onPostureResult?: (result: CPRPostureResult) => void;

  enableHandTracking?: boolean;

  showOverlay?: boolean;

  overlayText?: string;

  isPaused?: boolean;

  poseCheckMode?: PoseCheckMode;

  currentStepId?: string;

}



export function PoseCameraView({

  onHandDetected,

  onPoseQuality,

  onPostureResult,

  enableHandTracking = true,

  showOverlay,

  overlayText,

  isPaused = false,

  poseCheckMode = 'full_cpr',

  currentStepId,

}: Props) {

  const { theme } = useTheme();

  const Colors = getColors(theme);

  const { hasPermission, requestPermission } = useCameraPermission();



  const cameraRef = useRef<Camera>(null);

  const goodSinceRef = useRef<number | null>(null);

  const handDetectedFiredRef = useRef(false);

  const snapshotInFlightRef = useRef(false);

  const modelLoggedRef = useRef(false);

  const [detectorKey, setDetectorKey] = useState(0);



  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [keypoints, setKeypoints] = useState<PoseKeypoint[]>([]);

  const [postureResult, setPostureResult] = useState<CPRPostureResult>(EMPTY_POSTURE_RESULT);

  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });

  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  const [frameOrientation, setFrameOrientation] = useState<Orientation>('portrait');

  const [inferenceError, setInferenceError] = useState(false);

  const [inferenceTickCount, setInferenceTickCount] = useState(0);

  const [frameMetaTickCount, setFrameMetaTickCount] = useState(0);

  const [fpEnterTickCount, setFpEnterTickCount] = useState(0);

  const [modelNullTickCount, setModelNullTickCount] = useState(0);

  const [waitingForFrames, setWaitingForFrames] = useState(false);

  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');



  const plugin = useTensorflowModel(MOVENET_MODEL);

  const tfModel = plugin.state === 'loaded' ? plugin.model : undefined;

  const modelState = plugin.state as 'loading' | 'loaded' | 'error';

  const { resize } = useResizePlugin();

  const lastErrorAt = useSharedValue<number>(0);

  const frameCounter = useSharedValue(0);



  const allDevices = useCameraDevices();

  const backDevice = useCameraDevice('back');

  const frontDevice = useCameraDevice('front');

  const faceDevice = cameraFacing === 'front' ? frontDevice : backDevice;

  const activeDevice =

    (selectedDeviceId ? allDevices.find(d => d.id === selectedDeviceId) ?? null : null)

    ?? faceDevice

    ?? allDevices[0]

    ?? null;



  const format = useCameraFormat(activeDevice ?? undefined, [

    { videoResolution: { width: 720, height: 480 } },

    { fps: 30 },

  ]);



  const framingZone: FramingZone = useMemo(() => {

    if (viewSize.width > 0 && viewSize.height > 0) {

      return getFramingZone(Platform.OS, viewSize.width, viewSize.height);

    }

    return LOW_ANGLE_FRAMING_ZONE;

  }, [viewSize.width, viewSize.height]);



  useEffect(() => {

    AsyncStorage.getItem(CAMERA_DEVICE_KEY).then(id => {

      if (id) setSelectedDeviceId(id);

    });

  }, []);



  useEffect(() => {

    goodSinceRef.current = null;

    handDetectedFiredRef.current = false;

  }, [currentStepId, poseCheckMode]);



  useEffect(() => {

    if (plugin.state !== 'loaded' || !plugin.model || modelLoggedRef.current) return;

    modelLoggedRef.current = true;

    const m = plugin.model;

    console.log('[PoseCamera] model loaded', {

      inputs: m.inputs.map(t => ({ name: t.name, shape: t.shape, dataType: t.dataType })),

      outputs: m.outputs.map(t => ({ name: t.name, shape: t.shape, dataType: t.dataType })),

    });

  }, [plugin.state, plugin.model]);



  const captureSnapshotsIfNeeded = useCallback(async (stepId: string) => {

    if (!sessionRecorder.shouldCaptureSnapshot(stepId)) return;

    if (snapshotInFlightRef.current || !cameraRef.current) return;

    snapshotInFlightRef.current = true;

    try {

      const photo = await cameraRef.current.takeSnapshot({ quality: 60 });

      const dataUrl = await captureFrameSnapshot(photo.path);

      sessionRecorder.tryCaptureGuaranteedSnapshot(stepId, dataUrl);

      sessionRecorder.tryCaptureSnapshot(stepId, dataUrl);

    } catch {

      // Snapshot capture is best-effort during live training.

    } finally {

      snapshotInFlightRef.current = false;

    }

  }, []);



  const handlePostureResult = useCallback((kps: PoseKeypoint[], result: CPRPostureResult) => {

    setKeypoints(kps);

    setPostureResult(result);

    setWaitingForFrames(false);

    onPoseQuality?.(result.quality);

    onPostureResult?.(result);



    if (currentStepId) {

      void captureSnapshotsIfNeeded(currentStepId);

    }



    if (isPaused || !enableHandTracking || !onHandDetected) return;

    if (poseCheckMode !== 'full_cpr') return;



    if (isLowAnglePostureGood(result)) {

      if (goodSinceRef.current === null) {

        goodSinceRef.current = Date.now();

      } else if (!handDetectedFiredRef.current && Date.now() - goodSinceRef.current >= HAND_PLACEMENT_HOLD_MS) {

        handDetectedFiredRef.current = true;

        onHandDetected();

      }

    } else {

      goodSinceRef.current = null;

      handDetectedFiredRef.current = false;

    }

  }, [

    onHandDetected,

    onPoseQuality,

    onPostureResult,

    isPaused,

    enableHandTracking,

    poseCheckMode,

    currentStepId,

    captureSnapshotsIfNeeded,

  ]);



  const bumpFpEnter = useCallback(() => {

    setFpEnterTickCount(c => c + 1);

  }, []);



  const bumpModelNull = useCallback(() => {

    setModelNullTickCount(c => c + 1);

  }, []);



  const bumpFrameMetaTick = useCallback(() => {

    setFrameMetaTickCount(c => c + 1);

    setInferenceError(false);

  }, []);



  const handleFrameMeta = useCallback((meta: FrameMeta) => {

    setFrameSize(prev =>

      prev.width === meta.width && prev.height === meta.height ? prev : { width: meta.width, height: meta.height },

    );

    setFrameOrientation(meta.orientation);

  }, []);



  const handleInferenceTick = useCallback((flat: number[], maxScore: number) => {

    const kps = parseKeypointsFromFlat(flat);

    const result = analyzeCPRPosture(kps, 'low_angle_45', poseCheckMode, framingZone);

    setInferenceTickCount(c => c + 1);

    setWaitingForFrames(false);

    handlePostureResult(kps, result);

    if (__DEV__ && maxScore > 0) {

      console.log('[PoseCamera] inference maxScore', maxScore.toFixed(3));

    }

  }, [poseCheckMode, framingZone, handlePostureResult]);



  const handleInferenceError = useCallback((msg: string) => {

    setInferenceError(true);

    console.warn('[PoseDetector] Frame inference error:', msg);

  }, []);



  const runBumpFpEnter = useRunOnJS(bumpFpEnter, [bumpFpEnter]);

  const runBumpModelNull = useRunOnJS(bumpModelNull, [bumpModelNull]);

  const runBumpFrameMetaTick = useRunOnJS(bumpFrameMetaTick, [bumpFrameMetaTick]);

  const runHandleFrameMeta = useRunOnJS(handleFrameMeta, [handleFrameMeta]);

  const runHandleInferenceTick = useRunOnJS(handleInferenceTick, [handleInferenceTick]);

  const runHandleInferenceError = useRunOnJS(handleInferenceError, [handleInferenceError]);



  const detectorEnabled = enableHandTracking && !isPaused;



  const frameProcessor = useFrameProcessor((frame) => {

    'worklet';



    if (!detectorEnabled) return;



    runBumpFpEnter();



    const model = tfModel;

    if (model == null) {

      runBumpModelNull();

      return;

    }



    frameCounter.value += 1;

    if (frameCounter.value % 4 !== 0) return;



    runBumpFrameMetaTick();

    runHandleFrameMeta({

      width: frame.width,

      height: frame.height,

      orientation: frame.orientation,

      mirrored: frame.isMirrored,

    });



    try {

      const rotation = frame.orientation === 'landscape-left'

        ? '90deg'

        : frame.orientation === 'landscape-right'

        ? '270deg'

        : frame.orientation === 'portrait-upside-down'

        ? '180deg'

        : '0deg';



      const resized = resize(frame, {

        scale: { width: 192, height: 192 },

        pixelFormat: 'rgb',

        dataType: 'uint8',

        rotation: rotation,

        mirror: frame.isMirrored,

      });



      const outputs = model.runSync([resized]);

      const raw = outputs[0];

      if (raw == null) return;



      const arr: number[] = [];

      let maxScore = 0;

      for (let i = 0; i < 51; i++) {

        const v = Number((raw as Float32Array)[i] ?? 0);

        arr.push(v);

        if (i % 3 === 2 && v > maxScore) maxScore = v;

      }

      runHandleInferenceTick(arr, maxScore);

    } catch (e) {

      const now = Date.now();

      if (now - lastErrorAt.value > ERROR_LOG_INTERVAL_MS) {

        lastErrorAt.value = now;

        runHandleInferenceError(String(e));

      }

    }



  }, [

    tfModel,

    plugin.model,

    detectorEnabled,

    resize,

    runBumpFpEnter,

    runBumpModelNull,

    runBumpFrameMetaTick,

    runHandleFrameMeta,

    runHandleInferenceTick,

    runHandleInferenceError,

    lastErrorAt,

    frameCounter,

  ]);



  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {

    const { width, height } = e.nativeEvent.layout;

    setViewSize({ width, height });

  }, []);



  const toggleFacing = useCallback(() => {

    setSelectedDeviceId(null);

    setCameraFacing(f => f === 'back' ? 'front' : 'back');

  }, []);



  const cycleExternalCamera = useCallback(async () => {

    const externalDevices = allDevices.filter(d => d.position === 'external');

    if (externalDevices.length === 0) return;

    const currentIdx = selectedDeviceId

      ? externalDevices.findIndex(d => d.id === selectedDeviceId)

      : -1;

    const nextDevice = externalDevices[(currentIdx + 1) % externalDevices.length];

    setSelectedDeviceId(nextDevice.id);

    await AsyncStorage.setItem(CAMERA_DEVICE_KEY, nextDevice.id);

  }, [allDevices, selectedDeviceId]);



  const retryModel = useCallback(() => {

    modelLoggedRef.current = false;

    setInferenceTickCount(0);

    setFrameMetaTickCount(0);

    setFpEnterTickCount(0);

    setModelNullTickCount(0);

    frameCounter.value = 0;

    setDetectorKey(k => k + 1);

  }, []);



  const modelReady = modelState === 'loaded';



  useEffect(() => {

    if (!modelReady || !detectorEnabled) {

      setWaitingForFrames(false);

      return;

    }

    const timer = setTimeout(() => {

      if (inferenceTickCount === 0) {

        setWaitingForFrames(true);

      }

    }, INFERENCE_STALL_MS);

    return () => clearTimeout(timer);

  }, [modelReady, detectorEnabled, inferenceTickCount, detectorKey]);



  usePoseVoiceCues(

    postureResult,

    enableHandTracking && modelReady && !isPaused,

    poseCheckMode,

    currentStepId,

  );



  const qualityColor =

    postureResult.quality === 'good' ? '#00E676' :

    postureResult.quality === 'fair' ? '#FFD600' :

    postureResult.quality === 'poor' ? '#E53935' :

    Colors.textMuted;



  if (!hasPermission) {

    return (

      <View style={styles.container}>

        <View style={[styles.center, { backgroundColor: Colors.surface }]}>

          <MaterialCommunityIcons name="camera-lock" size={40} color={Colors.textMuted} />

          <Text style={[styles.label, { color: Colors.textSecondary }]}>Camera permission needed</Text>

          <Pressable style={[styles.btn, { backgroundColor: Colors.accent }]} onPress={requestPermission}>

            <Text style={styles.btnText}>Grant Camera Access</Text>

          </Pressable>

        </View>

      </View>

    );

  }



  if (!activeDevice) {

    return (

      <View style={styles.container}>

        <View style={[styles.center, { backgroundColor: Colors.surface }]}>

          <MaterialCommunityIcons name="camera-off" size={40} color={Colors.textMuted} />

          <Text style={[styles.label, { color: Colors.textSecondary }]}>No camera found</Text>

        </View>

      </View>

    );

  }



  const swapped = swapDimensionsForOrientation(

    frameSize.width || format?.videoWidth || 720,

    frameSize.height || format?.videoHeight || 480,

    frameOrientation,

  );

  const videoWidth = swapped.width;

  const videoHeight = swapped.height;

  const externalDevices = allDevices.filter(d => d.position === 'external');

  const hasExternalCameras = externalDevices.length > 0;

  const mirrorX = false;

  const visibleJoints = keypoints.filter(kp => kp.score >= 0.1).length;



  const badgeCounters = `F:${frameMetaTickCount} I:${inferenceTickCount}`;



  const badgeLabel = (() => {

    if (modelState === 'loading') return 'POSE · loading';

    if (modelState === 'error' || inferenceError) return `POSE · ERR · ${badgeCounters}`;

    if (visibleJoints > 0) return `POSE · ${visibleJoints} · ${badgeCounters}`;

    if (modelReady && inferenceTickCount > 0) return `POSE · 0 · ${badgeCounters}`;

    if (modelReady) return `POSE · ready · ${badgeCounters}`;

    return 'POSE';

  })();



  const feedbackTip = (() => {

    if (waitingForFrames && modelReady && inferenceTickCount === 0) {

      if (fpEnterTickCount === 0) return 'No camera frames (FP not running)';

      if (modelNullTickCount > 0 && frameMetaTickCount === 0) return 'Model not in worklet (check logcat)';

      if (frameMetaTickCount === 0) return 'No camera frames (FP not running)';

      return 'Inference failing (check logcat)';

    }

    if (postureResult.tips.length > 0) return postureResult.tips[0];

    return null;

  })();



  const activeFrameProcessor = detectorEnabled ? frameProcessor : undefined;



  return (

    <View style={styles.container} onLayout={handleLayout}>

      <Camera

        key={`${activeDevice.id}-${detectorKey}`}

        ref={cameraRef}

        style={StyleSheet.absoluteFillObject}

        device={activeDevice}

        format={format}

        isActive={true}

        pixelFormat="yuv"

        resizeMode="cover"

        frameProcessor={activeFrameProcessor}

        androidPreviewViewType={Platform.OS === 'android' ? 'texture-view' : undefined}

      />



      {enableHandTracking && viewSize.width > 0 && (

        <View style={styles.overlayLayer} pointerEvents="none" collapsable={false}>

          <PoseSkeletonOverlay

            keypoints={keypoints}

            result={postureResult}

            width={viewSize.width}

            height={viewSize.height}

            videoWidth={videoWidth}

            videoHeight={videoHeight}

            Colors={Colors}

            mirrorX={mirrorX}

            displayMode="cpr_triangle"

            poseCheckMode={poseCheckMode}

            framingZone={framingZone}

          />

        </View>

      )}



      {enableHandTracking && (

        <View style={styles.feedbackPanel}>

          {!modelReady ? (

            <View style={styles.modelStatusBlock}>

              {modelState === 'loading' ? (

                <View style={styles.feedbackRow}>

                  <ActivityIndicator size="small" color="#FFD600" />

                  <Text style={[styles.feedbackText, { color: '#FFD600' }]}>

                    Loading pose model…

                  </Text>

                </View>

              ) : (

                <>

                  <Text style={[styles.feedbackText, { color: '#E53935' }]}>

                    Model unavailable

                  </Text>

                  <Pressable style={styles.retryBtn} onPress={retryModel}>

                    <Text style={styles.retryBtnText}>Retry model load</Text>

                  </Pressable>

                </>

              )}

            </View>

          ) : (

            <>

              <PoseCueChips

                result={postureResult}

                Colors={Colors}

                compact

                checkMode={poseCheckMode}

                stepId={currentStepId}

              />

              {feedbackTip ? (

                <View style={styles.feedbackRow}>

                  <MaterialCommunityIcons name="lightbulb-on-outline" size={14} color="#FFD600" />

                  <Text style={[styles.tipsText, { color: '#FFD600' }]}>

                    {feedbackTip}

                  </Text>

                </View>

              ) : null}

            </>

          )}

        </View>

      )}



      {enableHandTracking && modelReady && postureResult.quality !== 'none' && (

        <View style={[styles.qualityBadge, { backgroundColor: qualityColor + '25', borderColor: qualityColor }]}>

          <View style={[styles.qualityDot, { backgroundColor: qualityColor }]} />

          <Text style={[styles.qualityText, { color: qualityColor }]}>

            {postureResult.quality === 'good' ? 'CORRECT POSTURE' :

             postureResult.quality === 'fair' ? 'ADJUST POSTURE' : 'FIX POSTURE'}

          </Text>

        </View>

      )}



      {showOverlay && overlayText ? (

        <View style={styles.overlayBanner}>

          <Text style={styles.overlayText}>{overlayText}</Text>

        </View>

      ) : null}



      <View style={styles.cameraControls}>

        <Pressable style={styles.cameraBtn} onPress={toggleFacing}>

          <MaterialCommunityIcons name="camera-flip-outline" size={20} color="#fff" />

        </Pressable>

        {hasExternalCameras && (

          <Pressable style={styles.cameraBtn} onPress={cycleExternalCamera}>

            <MaterialCommunityIcons name="usb" size={20} color="#fff" />

          </Pressable>

        )}

      </View>



      <View style={styles.badge}>

        <MaterialCommunityIcons

          name="eye-circle"

          size={10}

          color={modelReady && !inferenceError ? '#00E676' : Colors.textMuted}

        />

        <Text style={[styles.badgeText, { color: Colors.text }]}>

          {badgeLabel}

        </Text>

      </View>

    </View>

  );

}



const styles = StyleSheet.create({

  container: {

    flex: 1,

    width: '100%',

    height: '100%',

    minHeight: 120,

    backgroundColor: '#000',

    borderRadius: 12,

    overflow: 'hidden',

  },

  overlayLayer: {

    ...StyleSheet.absoluteFillObject,

    zIndex: 20,

    elevation: 20,

  },

  center: {

    flex: 1,

    alignItems: 'center',

    justifyContent: 'center',

    gap: 12,

    padding: 16,

  },

  label: {

    fontSize: 13,

    textAlign: 'center',

  },

  btn: {

    paddingHorizontal: 20,

    paddingVertical: 10,

    borderRadius: 8,

  },

  btnText: {

    color: '#fff',

    fontWeight: '600',

    fontSize: 13,

  },

  feedbackPanel: {

    position: 'absolute',

    top: 8,

    left: 8,

    gap: 6,

    backgroundColor: 'rgba(0,0,0,0.7)',

    borderRadius: 10,

    paddingHorizontal: 12,

    paddingVertical: 8,

    maxWidth: '95%',

    zIndex: 30,

    elevation: 30,

  },

  modelStatusBlock: {

    gap: 6,

  },

  retryBtn: {

    alignSelf: 'flex-start',

    backgroundColor: 'rgba(229,57,53,0.35)',

    borderRadius: 6,

    paddingHorizontal: 10,

    paddingVertical: 5,

    marginTop: 2,

  },

  retryBtnText: {

    color: '#fff',

    fontSize: 10,

    fontWeight: '700',

  },

  feedbackRow: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

  },

  feedbackText: {

    fontSize: 11,

    fontWeight: '700',

    letterSpacing: 0.2,

  },

  tipsText: {

    fontSize: 10,

    fontWeight: '600',

    flex: 1,

    flexWrap: 'wrap',

  },

  qualityBadge: {

    position: 'absolute',

    bottom: 44,

    left: 8,

    right: 8,

    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

    borderRadius: 8,

    borderWidth: 1,

    paddingHorizontal: 10,

    paddingVertical: 6,

  },

  qualityDot: {

    width: 7,

    height: 7,

    borderRadius: 4,

  },

  qualityText: {

    fontSize: 10,

    fontWeight: '700',

    letterSpacing: 0.4,

  },

  overlayBanner: {

    position: 'absolute',

    bottom: 0,

    left: 0,

    right: 0,

    backgroundColor: 'rgba(0,0,0,0.6)',

    padding: 8,

  },

  overlayText: {

    color: '#fff',

    fontSize: 12,

    fontWeight: '600',

    textAlign: 'center',

  },

  cameraControls: {

    position: 'absolute',

    bottom: 8,

    right: 8,

    flexDirection: 'column',

    gap: 6,

  },

  cameraBtn: {

    width: 36,

    height: 36,

    borderRadius: 18,

    backgroundColor: 'rgba(0,0,0,0.6)',

    alignItems: 'center',

    justifyContent: 'center',

  },

  badge: {

    position: 'absolute',

    top: 8,

    right: 8,

    flexDirection: 'row',

    alignItems: 'center',

    gap: 3,

    backgroundColor: 'rgba(0,0,0,0.6)',

    borderRadius: 10,

    paddingHorizontal: 7,

    paddingVertical: 3,

    zIndex: 30,

    elevation: 30,

  },

  badgeText: {

    fontSize: 9,

    fontWeight: '700',

    letterSpacing: 0.5,

  },

});


