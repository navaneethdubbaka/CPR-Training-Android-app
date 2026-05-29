import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice, useCameraDevices, useCameraFormat, useCameraPermission } from 'react-native-vision-camera';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import {
  SKELETON_CONNECTIONS,
  CPR_KEYPOINT_INDICES,
  usePoseDetector,
  type PoseKeypoint,
  type CPRPostureResult,
} from '@/lib/pose-detection';

export const CAMERA_DEVICE_KEY = 'cpr_camera_device_id';
const GOOD_QUALITY_HOLD_MS = 1500;

const STERNAL_ZONE = { x: 0.35, y: 0.3, w: 0.3, h: 0.35 } as const;

interface SkeletonOverlayProps {
  keypoints: PoseKeypoint[];
  result: CPRPostureResult;
  width: number;
  height: number;
  Colors: ReturnType<typeof getColors>;
}

function SkeletonOverlay({ keypoints, result, width, height, Colors }: SkeletonOverlayProps) {
  if (!width || !height) return null;

  const hasKeypoints = keypoints.length >= 17;

  const zoneX = STERNAL_ZONE.x * width;
  const zoneY = STERNAL_ZONE.y * height;
  const zoneW = STERNAL_ZONE.w * width;
  const zoneH = STERNAL_ZONE.h * height;
  const inZone = result.shouldersOverWrists && result.quality === 'good';
  const zoneColor = inZone ? '#00E676' : Colors.accent;
  const zoneFill = inZone ? 'rgba(0,230,118,0.12)' : 'rgba(229,57,53,0.10)';

  const kpColor = (kpIdx: number): string => {
    const kp = keypoints[kpIdx];
    if (!kp || kp.score < 0.25) return 'rgba(255,255,255,0.2)';
    if (CPR_KEYPOINT_INDICES.includes(kpIdx)) {
      return result.quality === 'good'
        ? '#00E676'
        : result.quality === 'fair'
        ? '#FFD600'
        : '#E53935';
    }
    return 'rgba(255,255,255,0.7)';
  };

  const lineColor = (a: number, b: number): string => {
    const ka = keypoints[a];
    const kb = keypoints[b];
    if (!ka || !kb || ka.score < 0.2 || kb.score < 0.2) return 'rgba(255,255,255,0.1)';
    const isCprBone = CPR_KEYPOINT_INDICES.includes(a) && CPR_KEYPOINT_INDICES.includes(b);
    if (!isCprBone) return 'rgba(255,255,255,0.4)';
    return result.quality === 'good' ? '#00E676' : result.quality === 'fair' ? '#FFD600' : '#E53935';
  };

  return (
    <Svg style={StyleSheet.absoluteFillObject} width={width} height={height} pointerEvents="none">
      {/* Sternal target zone — always visible */}
      <Rect
        x={zoneX}
        y={zoneY}
        width={zoneW}
        height={zoneH}
        fill={zoneFill}
        stroke={zoneColor}
        strokeWidth={2.5}
        rx={8}
        opacity={0.9}
      />
      <SvgText
        x={zoneX + zoneW / 2}
        y={zoneY + 18}
        textAnchor="middle"
        fill={zoneColor}
        fontSize={10}
        fontWeight="bold"
      >
        {inZone ? 'CORRECT POSITION' : 'STERNAL TARGET'}
      </SvgText>

      {/* Skeleton — only when pose is detected */}
      {hasKeypoints && SKELETON_CONNECTIONS.map(([a, b], i) => {
        const ka = keypoints[a];
        const kb = keypoints[b];
        if (!ka || !kb || ka.score < 0.2 || kb.score < 0.2) return null;
        const isCprBone = CPR_KEYPOINT_INDICES.includes(a) && CPR_KEYPOINT_INDICES.includes(b);
        return (
          <Line
            key={i}
            x1={ka.x * width}
            y1={ka.y * height}
            x2={kb.x * width}
            y2={kb.y * height}
            stroke={lineColor(a, b)}
            strokeWidth={isCprBone ? 3 : 2}
          />
        );
      })}
      {hasKeypoints && keypoints.map((kp, i) => {
        if (kp.score < 0.2) return null;
        const isKey = CPR_KEYPOINT_INDICES.includes(i);
        return (
          <Circle
            key={i}
            cx={kp.x * width}
            cy={kp.y * height}
            r={isKey ? 6 : 4}
            fill={kpColor(i)}
          />
        );
      })}
    </Svg>
  );
}

interface Props {
  onHandDetected?: () => void;
  onPoseQuality?: (quality: CPRPostureResult['quality']) => void;
  enableHandTracking?: boolean;
  showOverlay?: boolean;
  overlayText?: string;
}

export function PoseCameraView({
  onHandDetected,
  onPoseQuality,
  enableHandTracking = true,
  showOverlay,
  overlayText,
}: Props) {
  const { theme } = useTheme();
  const Colors = getColors(theme);
  const { hasPermission, requestPermission } = useCameraPermission();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [keypoints, setKeypoints] = useState<PoseKeypoint[]>([]);
  const [postureResult, setPostureResult] = useState<CPRPostureResult>({
    quality: 'none', leftArmAngle: 0, rightArmAngle: 0,
    armsVisible: false, armsAreStraight: false, shouldersOverWrists: false, tips: [],
  });
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');

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
  }, [onHandDetected, onPoseQuality]);

  const { state: modelState, frameProcessor } = usePoseDetector(
    enableHandTracking,
    handlePostureResult,
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
      />

      {enableHandTracking && viewSize.width > 0 && (
        <SkeletonOverlay
          keypoints={keypoints}
          result={postureResult}
          width={viewSize.width}
          height={viewSize.height}
          Colors={Colors}
        />
      )}

      {enableHandTracking && (
        <View style={styles.feedbackPanel}>
          {!modelReady ? (
            <View style={styles.feedbackRow}>
              <ActivityIndicator size="small" color="#FFD600" />
              <Text style={[styles.feedbackText, { color: '#FFD600' }]}>
                {modelState === 'loading' ? 'Loading pose model…' : 'Model unavailable'}
              </Text>
            </View>
          ) : (
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
            </>
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
          color={modelReady ? '#00E676' : Colors.textMuted}
        />
        <Text style={[styles.badgeText, { color: Colors.text }]}>POSE</Text>
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
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
