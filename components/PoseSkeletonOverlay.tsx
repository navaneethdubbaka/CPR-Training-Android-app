import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { getColors } from '@/constants/colors';
import {
  KP,
  SKELETON_CONNECTIONS,
  type PoseKeypoint,
  type CPRPostureResult,
} from '@/lib/pose-analysis';
import {
  CPR_GUIDE_CONNECTIONS,
  CPR_TRIANGLE_CONNECTIONS,
  CPR_TRIANGLE_KEYPOINT_INDICES,
  LOW_ANGLE_FRAMING_ZONE,
  type PoseCheckMode,
} from '@/lib/cpr-pose-constants';
import { videoNormToViewPx } from '@/lib/video-view-mapping';

export const STERNAL_ZONE = LOW_ANGLE_FRAMING_ZONE;

const DRAW_SCORE_MIN = 0.1;
const CPR_STROKE = Platform.OS === 'android' ? 5 : 3;
const RING_OUTER = Platform.OS === 'android' ? 28 : 24;
const RING_INNER = Platform.OS === 'android' ? 10 : 8;
const EAR_RING_OUTER = Platform.OS === 'android' ? 22 : 18;
const EAR_RING_INNER = Platform.OS === 'android' ? 8 : 6;

export type PoseOverlayDisplayMode = 'full' | 'cpr_triangle' | 'frame_only';

interface Props {
  keypoints: PoseKeypoint[];
  result: CPRPostureResult;
  width: number;
  height: number;
  Colors: ReturnType<typeof getColors>;
  mirrorX?: boolean;
  videoWidth?: number;
  videoHeight?: number;
  displayMode?: PoseOverlayDisplayMode;
  poseCheckMode?: PoseCheckMode;
}

function bonePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function RingDot({
  left,
  top,
  outer,
  inner,
  ringColor,
}: {
  left: number;
  top: number;
  outer: number;
  inner: number;
  ringColor: string;
}) {
  const outerHalf = outer / 2;
  const innerHalf = inner / 2;
  const innerOffset = (outer - inner) / 2;
  return (
    <View
      style={{
        position: 'absolute',
        left: left - outerHalf,
        top: top - outerHalf,
        width: outer,
        height: outer,
        borderRadius: outerHalf,
        borderWidth: 3,
        borderColor: ringColor,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: innerHalf,
          backgroundColor: '#FFFFFF',
        }}
      />
    </View>
  );
}

function JointDots({
  keypoints,
  width,
  height,
  mirrorX,
  boneColor,
  videoWidth,
  videoHeight,
  displayMode,
}: {
  keypoints: PoseKeypoint[];
  width: number;
  height: number;
  mirrorX: boolean;
  boneColor: string;
  videoWidth?: number;
  videoHeight?: number;
  displayMode: PoseOverlayDisplayMode;
}) {
  const toPx = (x: number, y: number) =>
    videoNormToViewPx(x, y, videoWidth ?? 0, videoHeight ?? 0, width, height, mirrorX);

  if (displayMode === 'frame_only') {
    const nose = keypoints[KP.NOSE];
    if (!nose || nose.score < DRAW_SCORE_MIN) return null;
    const pos = toPx(nose.x, nose.y);
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <RingDot
          left={pos.px}
          top={pos.py}
          outer={EAR_RING_OUTER}
          inner={EAR_RING_INNER}
          ringColor={boneColor}
        />
      </View>
    );
  }

  const indices =
    displayMode === 'cpr_triangle'
      ? CPR_TRIANGLE_KEYPOINT_INDICES
      : keypoints.map((_, i) => i);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {indices.map(i => {
        const kp = keypoints[i];
        if (!kp || kp.score < DRAW_SCORE_MIN) return null;
        const isEar = i === KP.LEFT_EAR || i === KP.RIGHT_EAR;
        const isCprJoint = CPR_TRIANGLE_KEYPOINT_INDICES.includes(i);
        const outer = isEar ? EAR_RING_OUTER : isCprJoint ? RING_OUTER : 16;
        const inner = isEar ? EAR_RING_INNER : isCprJoint ? RING_INNER : 6;
        const color = isCprJoint ? boneColor : 'rgba(255,255,255,0.9)';
        const pos = toPx(kp.x, kp.y);
        return (
          <RingDot
            key={`dot-${i}`}
            left={pos.px}
            top={pos.py}
            outer={outer}
            inner={inner}
            ringColor={color}
          />
        );
      })}
    </View>
  );
}

export function PoseSkeletonOverlay({
  keypoints,
  result,
  width,
  height,
  Colors,
  mirrorX = false,
  videoWidth,
  videoHeight,
  displayMode = 'full',
  poseCheckMode = 'full_cpr',
}: Props) {
  if (!width || !height) return null;

  const effectiveDisplay: PoseOverlayDisplayMode =
    poseCheckMode === 'framing_only' ? 'frame_only' : displayMode;

  const hasKeypoints = keypoints.length >= 17;
  const visibleJoints = keypoints.filter(kp => kp.score >= DRAW_SCORE_MIN).length;
  const isTriangleMode = effectiveDisplay === 'cpr_triangle';
  const isFrameOnly = effectiveDisplay === 'frame_only';

  const toPx = (x: number, y: number) =>
    videoNormToViewPx(x, y, videoWidth ?? 0, videoHeight ?? 0, width, height, mirrorX);
  const px = (x: number, y: number) => toPx(x, y).px;
  const py = (x: number, y: number) => toPx(x, y).py;

  const zone = LOW_ANGLE_FRAMING_ZONE;
  const zoneX = zone.x * width;
  const zoneY = zone.y * height;
  const zoneW = zone.w * width;
  const zoneH = zone.h * height;
  const inZone = result.framingOk;
  const zoneColor = inZone ? '#00E676' : Colors.accent;
  const zoneFill = inZone ? 'rgba(0,230,118,0.12)' : 'rgba(229,57,53,0.10)';
  const zoneLabel = inZone ? 'READY TO START' : 'ALIGN IN FRAME';

  const boneColor =
    result.quality === 'good' ? '#00E676' :
    result.quality === 'fair' ? '#FFD600' : '#E53935';

  const connections = isFrameOnly ? [] : isTriangleMode ? CPR_TRIANGLE_CONNECTIONS : SKELETON_CONNECTIONS;
  const guideConnections = isTriangleMode && result.elbowBent ? CPR_GUIDE_CONNECTIONS : [];

  const lineColor = (a: number, b: number, isGuide = false): string => {
    const ka = keypoints[a];
    const kb = keypoints[b];
    if (!ka || !kb) return 'rgba(255,255,255,0.15)';
    const isCprBone = CPR_TRIANGLE_KEYPOINT_INDICES.includes(a) && CPR_TRIANGLE_KEYPOINT_INDICES.includes(b);
    if (isGuide) return 'rgba(255,255,255,0.25)';
    if (isCprBone && (ka.score >= DRAW_SCORE_MIN || kb.score >= DRAW_SCORE_MIN)) {
      return boneColor;
    }
    if (ka.score >= DRAW_SCORE_MIN && kb.score >= DRAW_SCORE_MIN) {
      return 'rgba(255,255,255,0.55)';
    }
    return 'rgba(255,255,255,0.15)';
  };

  const w = Math.round(width);
  const h = Math.round(height);

  const renderConnection = ([a, b]: [number, number], i: number, isGuide = false) => {
    const ka = keypoints[a];
    const kb = keypoints[b];
    if (!ka || !kb) return null;
    if (ka.score < DRAW_SCORE_MIN && kb.score < DRAW_SCORE_MIN) return null;
    const isCprBone = CPR_TRIANGLE_KEYPOINT_INDICES.includes(a) && CPR_TRIANGLE_KEYPOINT_INDICES.includes(b);
    return (
      <Path
        key={`${isGuide ? 'guide' : 'bone'}-${i}`}
        d={bonePath(px(ka.x, ka.y), py(ka.x, ka.y), px(kb.x, kb.y), py(kb.x, kb.y))}
        stroke={lineColor(a, b, isGuide)}
        strokeWidth={isGuide ? 1.5 : isCprBone ? CPR_STROKE : 2}
        strokeDasharray={isGuide ? '6 4' : undefined}
        strokeLinecap="round"
        fill="none"
      />
    );
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      collapsable={false}
      renderToHardwareTextureAndroid
    >
      <Svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      >
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
          {zoneLabel}
        </SvgText>

        {hasKeypoints && guideConnections.map((conn, i) => renderConnection(conn, i, true))}
        {hasKeypoints && connections.map((conn, i) => renderConnection(conn, i))}
      </Svg>

      {hasKeypoints && visibleJoints > 0 && (
        <JointDots
          keypoints={keypoints}
          width={width}
          height={height}
          mirrorX={mirrorX}
          boneColor={boneColor}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          displayMode={effectiveDisplay}
        />
      )}
    </View>
  );
}
