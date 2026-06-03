import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { getColors } from '@/constants/colors';
import {
  SKELETON_CONNECTIONS,
  CPR_KEYPOINT_INDICES,
  type PoseKeypoint,
  type CPRPostureResult,
} from '@/lib/pose-analysis';

export const STERNAL_ZONE = { x: 0.35, y: 0.3, w: 0.3, h: 0.35 } as const;

interface Props {
  keypoints: PoseKeypoint[];
  result: CPRPostureResult;
  width: number;
  height: number;
  Colors: ReturnType<typeof getColors>;
}

export function PoseSkeletonOverlay({ keypoints, result, width, height, Colors }: Props) {
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
