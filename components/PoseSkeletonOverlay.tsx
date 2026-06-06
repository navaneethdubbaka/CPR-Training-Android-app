import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { getColors } from '@/constants/colors';
import {
  SKELETON_CONNECTIONS,
  type PoseKeypoint,
  type CPRPostureResult,
} from '@/lib/pose-analysis';
import {
  CPR_GUIDE_CONNECTIONS,
  CPR_TRIANGLE_CONNECTIONS,
  CPR_TRIANGLE_KEYPOINT_INDICES,
  LOW_ANGLE_FRAMING_ZONE,
} from '@/lib/cpr-pose-constants';
import { videoNormToViewPx } from '@/lib/video-view-mapping';

/** @deprecated Use LOW_ANGLE_FRAMING_ZONE — kept for backward compatibility. */
export const STERNAL_ZONE = LOW_ANGLE_FRAMING_ZONE;

const DRAW_SCORE_MIN = 0.1;
const CPR_STROKE = Platform.OS === 'android' ? 5 : 3;
const JOINT_SIZE = Platform.OS === 'android' ? 14 : 10;
const EAR_SIZE = Platform.OS === 'android' ? 12 : 9;

export type PoseOverlayDisplayMode = 'full' | 'cpr_triangle';

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
}

function bonePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
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

  const indices =
    displayMode === 'cpr_triangle'
      ? CPR_TRIANGLE_KEYPOINT_INDICES
      : keypoints.map((_, i) => i);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {indices.map(i => {
        const kp = keypoints[i];
        if (!kp || kp.score < DRAW_SCORE_MIN) return null;
        const isEar = i === 3 || i === 4;
        const isCprJoint = CPR_TRIANGLE_KEYPOINT_INDICES.includes(i);
        const size = isEar ? EAR_SIZE : isCprJoint ? JOINT_SIZE : 8;
        const half = size / 2;
        const color = isCprJoint ? boneColor : 'rgba(255,255,255,0.9)';
        const pos = toPx(kp.x, kp.y);
        return (
          <View
            key={`dot-${i}`}
            style={{
              position: 'absolute',
              left: pos.px - half,
              top: pos.py - half,
              width: size,
              height: size,
              borderRadius: half,
              backgroundColor: color,
              borderWidth: isCprJoint ? 2 : 1,
              borderColor: '#FFFFFF',
            }}
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
}: Props) {
  if (!width || !height) return null;

  const hasKeypoints = keypoints.length >= 17;
  const visibleJoints = keypoints.filter(kp => kp.score >= DRAW_SCORE_MIN).length;
  const isTriangleMode = displayMode === 'cpr_triangle';

  const toPx = (x: number, y: number) =>
    videoNormToViewPx(x, y, videoWidth ?? 0, videoHeight ?? 0, width, height, mirrorX);
  const px = (x: number, y: number) => toPx(x, y).px;
  const py = (x: number, y: number) => toPx(x, y).py;

  const zone = LOW_ANGLE_FRAMING_ZONE;
  const zoneX = zone.x * width;
  const zoneY = zone.y * height;
  const zoneW = zone.w * width;
  const zoneH = zone.h * height;
  const inZone = isTriangleMode ? result.framingOk : result.shouldersOverWrists && result.quality === 'good';
  const zoneColor = inZone ? '#00E676' : Colors.accent;
  const zoneFill = inZone ? 'rgba(0,230,118,0.12)' : 'rgba(229,57,53,0.10)';
  const zoneLabel = isTriangleMode
    ? (inZone ? 'READY TO START' : 'ALIGN IN FRAME')
    : (inZone ? 'CORRECT POSITION' : 'STERNAL TARGET');

  const boneColor =
    result.quality === 'good' ? '#00E676' :
    result.quality === 'fair' ? '#FFD600' : '#E53935';

  const connections = isTriangleMode ? CPR_TRIANGLE_CONNECTIONS : SKELETON_CONNECTIONS;
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
          displayMode={displayMode}
        />
      )}
    </View>
  );
}
