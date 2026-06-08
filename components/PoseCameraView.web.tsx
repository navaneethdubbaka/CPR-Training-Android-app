import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Button,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { useWebPoseDetector } from '@/lib/pose-detection-web';
import { EMPTY_POSTURE_RESULT, type CPRPostureResult, type PoseKeypoint } from '@/lib/pose-analysis';
import {
  HAND_PLACEMENT_HOLD_MS,
  isLowAnglePostureGood,
  type PoseCheckMode,
} from '@/lib/cpr-pose-constants';
import { PoseSkeletonOverlay } from '@/components/PoseSkeletonOverlay';
import { PoseCueChips } from '@/components/PoseCueChips';
import { usePoseVoiceCues } from '@/lib/use-pose-voice-cues';
import { captureVideoFrame } from '@/lib/capture-video-snapshot';
import { sessionRecorder } from '@/lib/session-recorder';

export const CAMERA_DEVICE_KEY = 'cpr_camera_device_id';

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

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const goodSinceRef = useRef<number | null>(null);
  const handDetectedFiredRef = useRef(false);

  const [webError, setWebError] = useState<string | null>(null);
  const [webLoading, setWebLoading] = useState(true);
  const [keypoints, setKeypoints] = useState<PoseKeypoint[]>([]);
  const [postureResult, setPostureResult] = useState<CPRPostureResult>(EMPTY_POSTURE_RESULT);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  const attachStreamToVideo = useCallback((video: HTMLVideoElement | null) => {
    if (!video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {});
  }, []);

  const syncVideoSize = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w > 0 && h > 0) {
      setVideoSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    }
  }, []);

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    attachStreamToVideo(node);
    syncVideoSize(node);
    if (node) {
      node.onloadedmetadata = () => syncVideoSize(node);
    }
  }, [attachStreamToVideo, syncVideoSize]);

  const stopWebStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startWebCamera = useCallback(async () => {
    setWebLoading(true);
    setWebError(null);
    stopWebStream();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setWebError('Camera not supported in this browser');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      attachStreamToVideo(videoRef.current);
    } catch (err: unknown) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setWebError('Camera blocked — allow camera access for this site');
      } else if (name === 'NotFoundError') {
        setWebError('No camera found');
      } else {
        setWebError('Could not start camera');
      }
    } finally {
      setWebLoading(false);
    }
  }, [attachStreamToVideo, stopWebStream]);

  useEffect(() => {
    void startWebCamera();
    return () => stopWebStream();
  }, [startWebCamera, stopWebStream]);

  const handlePostureResult = useCallback((kps: PoseKeypoint[], result: CPRPostureResult) => {
    setKeypoints(kps);
    setPostureResult(result);
    onPoseQuality?.(result.quality);
    onPostureResult?.(result);

    if (currentStepId) {
      const snap = captureVideoFrame(videoRef.current);
      sessionRecorder.tryCaptureSnapshot(currentStepId, snap);
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
  }, [onHandDetected, onPoseQuality, onPostureResult, isPaused, enableHandTracking, poseCheckMode, currentStepId]);

  const detectorEnabled = enableHandTracking && !isPaused;
  const { state: modelState, errorMessage: modelError, backend: tfBackend, retry: retryModel } =
    useWebPoseDetector(videoRef, detectorEnabled, handlePostureResult, false, poseCheckMode);

  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    setViewSize({ width, height });
  }, []);

  const modelReady = modelState === 'loaded';
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

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <View style={styles.videoFrame}>
        {webError ? (
          <View style={styles.center}>
            <Text style={styles.statusText}>{webError}</Text>
            <Button title="Allow camera & retry" onPress={() => void startWebCamera()} />
          </View>
        ) : webLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.statusText}>Starting camera…</Text>
          </View>
        ) : (
          <video
            ref={setVideoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scaleX(-1)',
            }}
          />
        )}
      </View>

      {enableHandTracking && viewSize.width > 0 && (
        <View style={styles.overlayLayer} pointerEvents="none" collapsable={false}>
          <PoseSkeletonOverlay
            keypoints={keypoints}
            result={postureResult}
            width={viewSize.width}
            height={viewSize.height}
            videoWidth={videoSize.width}
            videoHeight={videoSize.height}
            Colors={Colors}
            mirrorX
            displayMode="cpr_triangle"
            poseCheckMode={poseCheckMode}
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
                  {modelError ? (
                    <Text style={styles.errorDetail} numberOfLines={3}>
                      {modelError}
                    </Text>
                  ) : null}
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
              {postureResult.tips.length > 0 && (
                <View style={styles.feedbackRow}>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={14} color="#FFD600" />
                  <Text style={[styles.tipsText, { color: '#FFD600' }]}>
                    {postureResult.tips[0]}
                  </Text>
                </View>
              )}
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

      <View style={styles.badge}>
        <MaterialCommunityIcons
          name="eye-circle"
          size={10}
          color={modelReady ? '#00E676' : Colors.textMuted}
        />
        <Text style={[styles.badgeText, { color: Colors.text }]}>
          POSE{tfBackend ? ` · ${tfBackend}` : ''}
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
  videoFrame: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
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
  },
  modelStatusBlock: {
    gap: 6,
  },
  errorDetail: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    lineHeight: 12,
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
    bottom: 36,
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
