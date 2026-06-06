import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Camera, useCameraDevice, useCameraDevices, useCameraFormat, useCameraPermission } from 'react-native-vision-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { usePoseDetector, type PoseKeypoint, type CPRPostureResult } from '@/lib/pose-detection';
import { EMPTY_POSTURE_RESULT } from '@/lib/pose-analysis';
import { PoseSkeletonOverlay } from '@/components/PoseSkeletonOverlay';

export const CAMERA_DEVICE_KEY = 'cpr_camera_device_id';
const GOOD_QUALITY_HOLD_MS = 1500;

interface Props {
  onHandDetected?: () => void;
  onPoseQuality?: (quality: CPRPostureResult['quality']) => void;
  onPostureResult?: (result: CPRPostureResult) => void;
  enableHandTracking?: boolean;
  showOverlay?: boolean;
  overlayText?: string;
  isPaused?: boolean;
}

export function PoseCameraView({
  onHandDetected,
  onPoseQuality,
  onPostureResult,
  enableHandTracking = true,
  showOverlay,
  overlayText,
  isPaused = false,
}: Props) {
  const { theme } = useTheme();
  const Colors = getColors(theme);
  const { hasPermission, requestPermission } = useCameraPermission();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [keypoints, setKeypoints] = useState<PoseKeypoint[]>([]);
  const [postureResult, setPostureResult] = useState<CPRPostureResult>(EMPTY_POSTURE_RESULT);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');
  const [inferenceCount, setInferenceCount] = useState(0);

  const goodSinceRef = useRef<number | null>(null);
  const handDetectedFiredRef = useRef(false);

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

  useEffect(() => {
    AsyncStorage.getItem(CAMERA_DEVICE_KEY).then(id => {
      if (id) setSelectedDeviceId(id);
    });
  }, []);

  const handlePostureResult = useCallback((kps: PoseKeypoint[], result: CPRPostureResult) => {
    setKeypoints(kps);
    setPostureResult(result);
    onPoseQuality?.(result.quality);
    onPostureResult?.(result);

    if (isPaused) {
      goodSinceRef.current = null;
      handDetectedFiredRef.current = false;
      return;
    }

    if (result.quality === 'good') {
      if (goodSinceRef.current === null) {
        goodSinceRef.current = Date.now();
      } else if (!handDetectedFiredRef.current && Date.now() - goodSinceRef.current >= GOOD_QUALITY_HOLD_MS) {
        handDetectedFiredRef.current = true;
        onHandDetected?.();
      }
    } else {
      goodSinceRef.current = null;
      handDetectedFiredRef.current = false;
    }
  }, [onHandDetected, onPoseQuality, onPostureResult, isPaused]);

  const detectorEnabled = enableHandTracking && !isPaused;

  const handleInferenceTick = useCallback(() => {
    setInferenceCount(c => c + 1);
  }, []);

  const { state: modelState, frameProcessor } = usePoseDetector(
    detectorEnabled,
    handlePostureResult,
    handleInferenceTick,
  );

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

  const modelReady = modelState === 'loaded';
  const poseTracking = inferenceCount > 0;
  const visibleJoints = keypoints.filter(kp => kp.score >= 0.1).length;

  const statusLabel =
    modelState === 'loading' ? 'Loading model…' :
    modelState === 'error' ? 'Model error' :
    !modelReady ? 'Model unavailable' :
    !poseTracking ? 'Waiting for body…' :
    `Tracking · ${visibleJoints} joints`;

  const qualityColor =
    postureResult.quality === 'good' ? '#00E676' :
    postureResult.quality === 'fair' ? '#FFD600' :
    postureResult.quality === 'poor' ? '#E53935' :
    Colors.textMuted;

  const externalDevices = allDevices.filter(d => d.position === 'external');
  const hasExternalCameras = externalDevices.length > 0;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Camera
        style={StyleSheet.absoluteFillObject}
        device={activeDevice}
        format={format}
        isActive={true}
        pixelFormat="rgb"
        frameProcessor={frameProcessor}
        androidPreviewViewType={Platform.OS === 'android' ? 'texture-view' : undefined}
      />

      {enableHandTracking && viewSize.width > 0 && (
        <View style={styles.overlayLayer} pointerEvents="none" collapsable={false}>
          <PoseSkeletonOverlay
            keypoints={keypoints}
            result={postureResult}
            width={viewSize.width}
            height={viewSize.height}
            Colors={Colors}
            mirrorX={cameraFacing === 'front'}
          />
        </View>
      )}

      {enableHandTracking && (
        <View style={styles.feedbackPanel}>
          <View style={styles.feedbackRow}>
            {!modelReady && <ActivityIndicator size="small" color="#FFD600" />}
            <Text style={[styles.feedbackText, { color: '#FFD600' }]}>
              {statusLabel}
            </Text>
          </View>
          {modelReady && poseTracking && (
            <>
              <View style={styles.feedbackRow}>
                <Text style={[styles.feedbackText, { color: postureResult.armsAreStraight ? '#00E676' : '#E53935' }]}>
                  Arms {postureResult.armsAreStraight ? 'STRAIGHT ✓' : 'bent — straighten ✗'}
                </Text>
              </View>
              <View style={styles.feedbackRow}>
                <Text style={[styles.feedbackText, { color: postureResult.shouldersOverWrists ? '#00E676' : '#E53935' }]}>
                  Position {postureResult.shouldersOverWrists ? 'GOOD ✓' : '— lean forward ✗'}
                </Text>
              </View>
              {postureResult.tips.length > 0 && (
                <View style={styles.feedbackRow}>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={14} color="#FFD600" />
                  <Text style={[styles.tipsText, { color: '#FFD600' }]}>
                    {postureResult.tips.join(' · ')}
                  </Text>
                </View>
              )}
            </>
          )}
          {modelReady && !poseTracking && (
            <Text style={[styles.tipsText, { color: Colors.textSecondary }]}>
              Stand back so shoulders, arms, and hands are in frame
            </Text>
          )}
        </View>
      )}

      {enableHandTracking && modelReady && postureResult.quality !== 'none' && (
        <View style={[styles.qualityBadge, { backgroundColor: qualityColor + '25', borderColor: qualityColor }]}>
          <View style={[styles.qualityDot, { backgroundColor: qualityColor }]} />
          <Text style={[styles.qualityText, { color: qualityColor }]}>
            {postureResult.quality === 'good' ? 'CORRECT POSTURE' :
             postureResult.quality === 'fair' ? 'ADJUST ARMS' : 'FIX POSTURE'}
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
          color={poseTracking ? '#00E676' : modelState === 'loading' ? '#FFD600' : Colors.textMuted}
        />
        <Text style={[styles.badgeText, { color: Colors.text }]}>
          {modelState === 'loading' ? 'POSE · …' :
           modelState === 'error' ? 'POSE · ERR' :
           poseTracking ? 'POSE · ON' : 'POSE · idle'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 30,
    elevation: 30,
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
