import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { COMPRESSION_TARGET_RATE, COMPRESSION_TARGET_DEPTH, COMPRESSIONS_PER_SET, COMPRESSION_SETS_REQUIRED } from '@/constants/cpr-protocol';
import type { CPRPostureResult } from '@/lib/pose-analysis';
import { pickPoseCue, pickSensorCue, speakCoachingCue } from '@/lib/coaching-cues';

interface CompressionSet {
  count: number;
  goodCount: number;
  complete: boolean;
  passed: boolean;
}

interface CompressionFeedbackProps {
  count: number;
  currentRate: number;
  currentDepth: number;
  avgRate: number;
  avgDepth: number;
  goodCount: number;
  totalCount: number;
  postureResult?: CPRPostureResult | null;
  enablePoseVoiceCues?: boolean;
  sets?: CompressionSet[];
  currentSetIndex?: number;
  setsRequired?: number;
  showSets?: boolean;
}

function getRateColor(rate: number, Colors: ReturnType<typeof getColors>): string {
  if (rate === 0) return Colors.textMuted;
  if (rate >= COMPRESSION_TARGET_RATE.min && rate <= COMPRESSION_TARGET_RATE.max) return Colors.feedbackGood;
  if (rate >= 90 && rate <= 130) return Colors.feedbackOk;
  return Colors.feedbackBad;
}

function getDepthColor(depth: number, Colors: ReturnType<typeof getColors>): string {
  if (depth === 0) return Colors.textMuted;
  if (depth >= COMPRESSION_TARGET_DEPTH.min && depth <= COMPRESSION_TARGET_DEPTH.max) return Colors.feedbackGood;
  if (depth >= 4 && depth <= 7) return Colors.feedbackOk;
  return Colors.feedbackBad;
}

function getRateLabel(rate: number): string {
  if (rate === 0) return 'Waiting...';
  if (rate < COMPRESSION_TARGET_RATE.min) return 'Too Slow';
  if (rate > COMPRESSION_TARGET_RATE.max) return 'Too Fast';
  return 'Good Rate';
}

function getDepthLabel(depth: number): string {
  if (depth === 0) return 'Waiting...';
  if (depth < COMPRESSION_TARGET_DEPTH.min) return 'Push Harder';
  if (depth > COMPRESSION_TARGET_DEPTH.max) return 'Too Deep';
  return 'Good Depth';
}

function SetIndicator({
  sets, currentSetIndex, setsRequired, Colors,
}: {
  sets: CompressionSet[];
  currentSetIndex: number;
  setsRequired: number;
  Colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={setStyles.container}>
      <Text style={[setStyles.label, { color: Colors.textSecondary }]}>Set {currentSetIndex + 1} of {setsRequired}</Text>
      <View style={setStyles.dots}>
        {Array.from({ length: setsRequired }).map((_, i) => {
          const set = sets[i];
          console.log(set)
          const isActive = i === currentSetIndex;
          const isComplete = set?.complete;
          const isPassed = set?.passed;
          const pct = set ? Math.min(set.count / COMPRESSIONS_PER_SET, 1) : 0;

          
          
          const bgColor = isComplete
            ? (isPassed ? Colors.feedbackGood : Colors.feedbackBad)
            : isActive ? Colors.accent : Colors.surfaceLight;
          const icon: 'check-circle' | 'close-circle' | null = isComplete
            ? (isPassed ? 'check-circle' : 'close-circle')
            : null;

          return (
            <View key={i} style={setStyles.setItem}>
              <View style={setStyles.setRing}>
                <View style={[setStyles.setRingBg, { backgroundColor: Colors.surfaceLight }]}>
                  <View style={[setStyles.setRingFill, {
                    height: `${pct * 100}%`,
                    backgroundColor: isComplete ? bgColor : isActive ? Colors.accent : 'transparent',
                  }]} />
                </View>
                <View style={setStyles.setRingLabel}>
                  {icon ? (
                    <MaterialCommunityIcons name={icon} size={14} color={isPassed ? Colors.feedbackGood : Colors.feedbackBad} />
                  ) : (
                    <Text style={[setStyles.setNum, { color: isActive ? Colors.accent : Colors.textMuted }]}>{i + 1}</Text>
                  )}
                </View>
              </View>
              {isActive && !isComplete && (
                <Text style={[setStyles.setCount, { color: Colors.textMuted }]}>{set?.count ?? 0}/{COMPRESSIONS_PER_SET}</Text>
              )}
              {isComplete && (
                <Text style={[setStyles.setCount, { color: isPassed ? Colors.feedbackGood : Colors.feedbackBad }]}>
                  {isPassed ? 'Pass' : 'Retry'}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function GaugeBar({
  value,
  min,
  max,
  targetMin,
  targetMax,
  color,
  label,
  unit,
  Colors,
}: {
  value: number;
  min: number;
  max: number;
  targetMin: number;
  targetMax: number;
  color: string;
  label: string;
  unit: string;
  Colors: ReturnType<typeof getColors>;
}) {
  const range = max - min;
  const targetLeft = `${((targetMin - min) / range) * 100}%` as any;
  const targetWidth = `${((targetMax - targetMin) / range) * 100}%` as any;
  const indicatorLeft = `${Math.min(Math.max((value - min) / range, 0), 1) * 100}%` as any;

  return (
    <View style={gaugeStyles.container}>
      <Text style={[gaugeStyles.label, { color: Colors.textMuted }]}>{label}</Text>
      <View style={gaugeStyles.row}>
        <Text style={[gaugeStyles.value, { color }]}>
          {value > 0 ? (Number.isInteger(value) ? value : value.toFixed(1)) : '--'}
        </Text>
        <Text style={[gaugeStyles.unit, { color: Colors.textMuted }]}>{unit}</Text>
      </View>
      <View style={[gaugeStyles.bar, { backgroundColor: Colors.surfaceLight }]}>
        <View style={[gaugeStyles.targetZone, { left: targetLeft, width: targetWidth }]} />
        {value > 0 && (
          <View style={[gaugeStyles.indicator, { left: indicatorLeft, backgroundColor: color }]} />
        )}
      </View>
    </View>
  );
}

function CorrectionSidebar({
  currentRate,
  currentDepth,
  postureResult,
  Colors,
}: {
  currentRate: number;
  currentDepth: number;
  postureResult?: CPRPostureResult | null;
  Colors: ReturnType<typeof getColors>;
}) {
  const rateOk = currentRate >= COMPRESSION_TARGET_RATE.min && currentRate <= COMPRESSION_TARGET_RATE.max;
  const depthOk = currentDepth >= COMPRESSION_TARGET_DEPTH.min && currentDepth <= COMPRESSION_TARGET_DEPTH.max;
  const rateColor = getRateColor(currentRate, Colors);
  const depthColor = getDepthColor(currentDepth, Colors);

  const positionOk = rateOk && depthOk;
  const postureOk = postureResult?.quality === 'good';
  const overallOk = postureResult ? (positionOk && postureOk) : positionOk;
  const poseTip =
    postureResult?.tips?.length ? postureResult.tips[0] : undefined;

  return (
    <View style={[sidebarStyles.container, { backgroundColor: Colors.surfaceLight, borderColor: Colors.border }]}>
      <Text style={[sidebarStyles.title, { color: Colors.textMuted }]}>LIVE FEEDBACK</Text>

      <View style={sidebarStyles.metricsRow}>
        <GaugeBar
          value={currentRate > 0 ? Math.round(currentRate) : 0}
          min={60}
          max={160}
          targetMin={COMPRESSION_TARGET_RATE.min}
          targetMax={COMPRESSION_TARGET_RATE.max}
          color={rateColor}
          label="Rate"
          unit="BPM"
          Colors={Colors}
        />
        <View style={[sidebarStyles.divider, { backgroundColor: Colors.border }]} />
        <GaugeBar
          value={currentDepth}
          min={0}
          max={10}
          targetMin={COMPRESSION_TARGET_DEPTH.min}
          targetMax={COMPRESSION_TARGET_DEPTH.max}
          color={depthColor}
          label="Depth"
          unit="cm"
          Colors={Colors}
        />
      </View>

      <View style={sidebarStyles.cueRow}>
        <View style={[sidebarStyles.cueChip, {
          backgroundColor: rateOk ? 'rgba(0,230,118,0.12)' : 'rgba(229,57,53,0.12)',
          borderColor: rateOk ? Colors.feedbackGood : rateColor,
        }]}>
          <MaterialCommunityIcons
            name={rateOk ? 'speedometer' : currentRate < COMPRESSION_TARGET_RATE.min ? 'speedometer-slow' : 'speedometer'}
            size={13}
            color={rateColor}
          />
          <Text style={[sidebarStyles.cueText, { color: rateColor }]}>
            {getRateLabel(currentRate)}
          </Text>
        </View>

        <View style={[sidebarStyles.cueChip, {
          backgroundColor: depthOk ? 'rgba(0,230,118,0.12)' : 'rgba(229,57,53,0.12)',
          borderColor: depthOk ? Colors.feedbackGood : depthColor,
        }]}>
          <MaterialCommunityIcons
            name={depthOk ? 'arrow-collapse-vertical' : 'arrow-expand-vertical'}
            size={13}
            color={depthColor}
          />
          <Text style={[sidebarStyles.cueText, { color: depthColor }]}>
            {getDepthLabel(currentDepth)}
          </Text>
        </View>
      </View>

      {postureResult ? (
        postureResult.quality === 'none' ? (
          <View style={sidebarStyles.cueRow}>
            <View style={[sidebarStyles.cueChip, {
              flex: 1,
              backgroundColor: 'rgba(255,214,0,0.12)',
              borderColor: Colors.warning,
            }]}>
              <MaterialCommunityIcons name="camera-outline" size={13} color={Colors.warning} />
              <Text style={[sidebarStyles.cueText, { color: Colors.warning }]}>
                {poseTip ?? 'Raise hands into camera view'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={sidebarStyles.cueRow}>
            <View style={[sidebarStyles.cueChip, {
              backgroundColor: postureResult.armsAreStraight ? 'rgba(0,230,118,0.12)' : 'rgba(229,57,53,0.12)',
              borderColor: postureResult.armsAreStraight ? Colors.feedbackGood : Colors.feedbackBad,
            }]}>
              <MaterialCommunityIcons
                name={postureResult.armsAreStraight ? 'arm-flex' : 'arm-flex-outline'}
                size={13}
                color={postureResult.armsAreStraight ? Colors.feedbackGood : Colors.feedbackBad}
              />
              <Text style={[sidebarStyles.cueText, { color: postureResult.armsAreStraight ? Colors.feedbackGood : Colors.feedbackBad }]}>
                {postureResult.armsAreStraight ? 'Arms straight' : 'Straighten arms'}
              </Text>
            </View>

            <View style={[sidebarStyles.cueChip, {
              backgroundColor: postureResult.shouldersOverWrists ? 'rgba(0,230,118,0.12)' : 'rgba(229,57,53,0.12)',
              borderColor: postureResult.shouldersOverWrists ? Colors.feedbackGood : Colors.feedbackBad,
            }]}>
              <MaterialCommunityIcons
                name="human-handsdown"
                size={13}
                color={postureResult.shouldersOverWrists ? Colors.feedbackGood : Colors.feedbackBad}
              />
              <Text style={[sidebarStyles.cueText, { color: postureResult.shouldersOverWrists ? Colors.feedbackGood : Colors.feedbackBad }]}>
                {postureResult.shouldersOverWrists ? 'Shoulders stacked' : 'Lean forward'}
              </Text>
            </View>
          </View>
        )
      ) : null}

      <View style={[sidebarStyles.positionIndicator, {
        backgroundColor: overallOk ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.06)',
        borderColor: overallOk ? Colors.feedbackGood : Colors.border,
      }]}>
        <MaterialCommunityIcons
          name={overallOk ? 'hand-heart' : 'hand-pointing-down'}
          size={14}
          color={overallOk ? Colors.feedbackGood : Colors.textMuted}
        />
        <Text style={[sidebarStyles.positionText, { color: overallOk ? Colors.feedbackGood : Colors.textMuted }]}>
          {overallOk
            ? 'Technique optimal'
            : currentRate === 0 && currentDepth === 0
              ? 'Begin compressions'
              : poseTip
                ? poseTip
                : 'Adjust technique'}
        </Text>
      </View>
    </View>
  );
}

export function CompressionFeedback({
  count, currentRate, currentDepth, avgRate, avgDepth, goodCount, totalCount,
  postureResult,
  enablePoseVoiceCues = false,
  sets, currentSetIndex = 0, setsRequired = COMPRESSION_SETS_REQUIRED, showSets = true,
}: CompressionFeedbackProps) {
  const { theme } = useTheme();
  const Colors = getColors(theme);
  const pulseScale = useSharedValue(1);
  const progressWidth = useSharedValue(0);
  const lastCueTime = useRef(0);
  const lastRateRef = useRef(currentRate);
  const lastDepthRef = useRef(currentDepth);
  const poseCueRef = useRef<string | null>(null);
  const poseCueSinceRef = useRef<number | null>(null);

  const currentSet = sets?.[currentSetIndex];
  const displayCount = currentSet ? currentSet.count : count;
  const perSetTarget = COMPRESSIONS_PER_SET;

  useEffect(() => {
    const pct = Math.min(displayCount / perSetTarget, 1);
    progressWidth.value = withTiming(pct * 100, { duration: 200 });
  }, [displayCount]);

  useEffect(() => {
    if (currentRate > 0) {
      const interval = 60000 / currentRate;
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: interval * 0.3 }),
          withTiming(1, { duration: interval * 0.7 }),
        ),
        -1,
      );
    }
  }, [currentRate]);

  useEffect(() => {
    lastRateRef.current = currentRate;
    lastDepthRef.current = currentDepth;

    const now = Date.now();
    if (now - lastCueTime.current < 3000) return;

    const sensorCue = pickSensorCue(currentRate, currentDepth);
    if (sensorCue) {
      lastCueTime.current = now;
      speakCoachingCue(sensorCue);
      poseCueRef.current = null;
      poseCueSinceRef.current = null;
      return;
    }

    if (!enablePoseVoiceCues || !postureResult) return;

    const poseCue = pickPoseCue(postureResult);
    if (!poseCue) {
      poseCueRef.current = null;
      poseCueSinceRef.current = null;
      return;
    }

    if (poseCueRef.current !== poseCue) {
      poseCueRef.current = poseCue;
      poseCueSinceRef.current = now;
      return;
    }

    if (poseCueSinceRef.current && now - poseCueSinceRef.current >= 1500) {
      lastCueTime.current = now;
      speakCoachingCue(poseCue);
      poseCueSinceRef.current = now;
    }
  }, [currentRate, currentDepth, enablePoseVoiceCues, postureResult]);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const qualityPct = totalCount > 0 ? Math.round((goodCount / totalCount) * 100) : 0;

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <View style={styles.header}>
        <Animated.View style={heartStyle}>
          <MaterialCommunityIcons name="heart-pulse" size={28} color={Colors.accent} />
        </Animated.View>
        <Text style={[styles.countText, { color: Colors.text }]}>{displayCount}/{perSetTarget}</Text>
      </View>

      <View style={[styles.progressBar, { backgroundColor: Colors.surfaceLight }]}>
        <Animated.View style={[styles.progressFill, progressStyle, {
          backgroundColor: displayCount >= perSetTarget ? Colors.feedbackGood : Colors.accent,
        }]} />
      </View>

      {showSets && sets && sets.length > 0 && (
        <SetIndicator sets={sets} currentSetIndex={currentSetIndex} setsRequired={setsRequired} Colors={Colors} />
      )}

  <CorrectionSidebar currentRate={currentRate} currentDepth={currentDepth} postureResult={postureResult} Colors={Colors} />

      <View style={styles.qualityRow}>
        <MaterialCommunityIcons name="star" size={16} color={Colors.warning} />
        <Text style={[styles.qualityText, { color: Colors.textSecondary }]}>Accuracy: {qualityPct}%</Text>
        <View style={[styles.qualityBarBg, { backgroundColor: Colors.surfaceLight }]}>
          <View style={[styles.qualityBarFill, {
            width: `${qualityPct}%`,
            backgroundColor: qualityPct >= 80 ? Colors.feedbackGood : qualityPct >= 50 ? Colors.feedbackOk : Colors.feedbackBad,
          }]} />
        </View>
        <Text style={[styles.gateLabel, { color: qualityPct >= 80 ? Colors.feedbackGood : Colors.feedbackBad }]}>
          {qualityPct >= 80 ? '≥80% ✓' : '<80%'}
        </Text>
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
  },
  unit: {
    fontSize: 11,
    fontWeight: '600',
  },
  bar: {
    height: 6,
    borderRadius: 3,
    position: 'relative',
    overflow: 'visible',
    marginTop: 2,
  },
  targetZone: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'rgba(0, 230, 118, 0.35)',
    borderRadius: 3,
  },
  indicator: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    top: -2,
    marginLeft: -5,
  },
});

const sidebarStyles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
  },
  title: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  divider: {
    width: 1,
    height: 40,
    alignSelf: 'center',
  },
  cueRow: {
    flexDirection: 'row',
    gap: 6,
  },
  cueChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  cueText: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  positionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  positionText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

const setStyles = StyleSheet.create({
  container: {
    gap: 6,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-end',
  },
  setItem: {
    alignItems: 'center',
    gap: 3,
  },
  setRing: {
    width: 36,
    height: 36,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setRingBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'absolute',
  },
  setRingFill: {
    width: '100%',
    borderRadius: 18,
  },
  setRingLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNum: {
    fontSize: 13,
    fontWeight: '800',
  },
  setCount: {
    fontSize: 9,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  countText: {
    fontSize: 28,
    fontWeight: '800',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qualityText: {
    fontSize: 12,
    fontWeight: '600',
    width: 90,
  },
  qualityBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  qualityBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  gateLabel: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
});
