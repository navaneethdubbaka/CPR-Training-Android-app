import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { getColors } from '@/constants/colors';
import {
  SKELETON_CONNECTIONS,
  CPR_KEYPOINT_INDICES,
  type PoseKeypoint,
  type CPRPostureResult,
} from '@/lib/pose-analysis';
import { videoNormToViewPx } from '@/lib/video-view-mapping';

export const STERNAL_ZONE = { x: 0.35, y: 0.3, w: 0.3, h: 0.35 } as const;

const DRAW_SCORE_MIN = 0.1;
const CPR_STROKE = Platform.OS === 'android' ? 5 : 3;
const JOINT_SIZE = Platform.OS === 'android' ? 14 : 10;

interface Props {
  keypoints: PoseKeypoint[];
  result: CPRPostureResult;
  width: number;
  height: number;
  Colors: ReturnType<typeof getColors>;
  mirrorX?: boolean;
  /** Intrinsic video size — enables object-fit:cover alignment on web. */
  videoWidth?: number;
  videoHeight?: number;
}

function bonePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** View-based joint dots — reliable on Android when SVG Line/Circle fail. */
function JointDots({
  keypoints,
  width,
  height,
  mirrorX,
  boneColor,
  videoWidth,
  videoHeight,
}: {
  keypoints: PoseKeypoint[];
  width: number;
  height: number;
  mirrorX: boolean;
  boneColor: string;
  videoWidth?: number;
  videoHeight?: number;
}) {
  const toPx = (x: number, y: number) =>
    videoNormToViewPx(x, y, videoWidth ?? 0, videoHeight ?? 0, width, height, mirrorX);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {keypoints.map((kp, i) => {
        if (kp.score < DRAW_SCORE_MIN) return null;
        const isKey = CPR_KEYPOINT_INDICES.includes(i);
        const size = isKey ? JOINT_SIZE : 8;
        const half = size / 2;
        const color = isKey ? boneColor : 'rgba(255,255,255,0.9)';
        return (
          <View
            key={`dot-${i}`}
            style={{
              position: 'absolute',
              left: toPx(kp.x, kp.y).px - half,
              top: toPx(kp.x, kp.y).py - half,
              width: size,
              height: size,
              borderRadius: half,
              backgroundColor: color,
              borderWidth: isKey ? 2 : 1,
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
}: Props) {
  if (!width || !height) return null;

  const hasKeypoints = keypoints.length >= 17;
  const visibleJoints = keypoints.filter(kp => kp.score >= DRAW_SCORE_MIN).length;

  const toPx = (x: number, y: number) =>
    videoNormToViewPx(x, y, videoWidth ?? 0, videoHeight ?? 0, width, height, mirrorX);
  const px = (x: number, y: number) => toPx(x, y).px;
  const py = (x: number, y: number) => toPx(x, y).py;

  const zoneX = STERNAL_ZONE.x * width;
  const zoneY = STERNAL_ZONE.y * height;
  const zoneW = STERNAL_ZONE.w * width;
  const zoneH = STERNAL_ZONE.h * height;
  const inZone = result.shouldersOverWrists && result.quality === 'good';
  const zoneColor = inZone ? '#00E676' : Colors.accent;
  const zoneFill = inZone ? 'rgba(0,230,118,0.12)' : 'rgba(229,57,53,0.10)';

  const boneColor =
    result.quality === 'good' ? '#00E676' :
    result.quality === 'fair' ? '#FFD600' : '#E53935';

  const lineColor = (a: number, b: number): string => {
    const ka = keypoints[a];
    const kb = keypoints[b];
    if (!ka || !kb) return 'rgba(255,255,255,0.15)';
    const isCprBone = CPR_KEYPOINT_INDICES.includes(a) && CPR_KEYPOINT_INDICES.includes(b);
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
          {inZone ? 'CORRECT POSITION' : 'STERNAL TARGET'}
        </SvgText>

        {hasKeypoints && SKELETON_CONNECTIONS.map(([a, b], i) => {
          const ka = keypoints[a];
          const kb = keypoints[b];
          if (!ka || !kb) return null;
          if (ka.score < DRAW_SCORE_MIN && kb.score < DRAW_SCORE_MIN) return null;
          const isCprBone = CPR_KEYPOINT_INDICES.includes(a) && CPR_KEYPOINT_INDICES.includes(b);
          return (
            <Path
              key={`bone-${i}`}
              d={bonePath(px(ka.x, ka.y), py(ka.x, ka.y), px(kb.x, kb.y), py(kb.x, kb.y))}
              stroke={lineColor(a, b)}
              strokeWidth={isCprBone ? CPR_STROKE : 2}
              strokeLinecap="round"
              fill="none"
            />
          );
        })}
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
        />
      )}
    </View>
  );
}
