import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { COMPRESSION_TARGET_RATE, COMPRESSION_TARGET_DEPTH } from '@/constants/cpr-protocol';

interface DataPoint {
  time: number;
  rate: number;
  depth: number;
  isGood: boolean;
}

interface EnduranceScreenProps {
  compressionCount: number;
  goodCompressions: number;
  totalCompressions: number;
  currentRate: number;
  currentDepth: number;
  elapsedTime: number;
  rateHistory: number[];
  depthHistory: number[];
  isPaused: boolean;
  hardwareOnly: boolean;
  onSimulateCompression: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function MiniRateBar({ value, max, color }: { value: number; max: number; color: string }) {
  const heightPct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={{ height: 32, width: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, justifyContent: 'flex-end', overflow: 'hidden' }}>
      <View style={{ height: `${heightPct}%`, width: '100%', backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

export function EnduranceScreen({
  compressionCount, goodCompressions, totalCompressions,
  currentRate, currentDepth, elapsedTime, rateHistory, depthHistory,
  isPaused, hardwareOnly, onSimulateCompression, onPause, onResume, onStop,
}: EnduranceScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { theme } = useTheme();
  const Colors = getColors(theme);

  const accuracy = totalCompressions > 0 ? Math.round((goodCompressions / totalCompressions) * 100) : 0;
  const isGoodRate = currentRate >= COMPRESSION_TARGET_RATE.min && currentRate <= COMPRESSION_TARGET_RATE.max;
  const isGoodDepth = currentDepth >= COMPRESSION_TARGET_DEPTH.min && currentDepth <= COMPRESSION_TARGET_DEPTH.max;
  const rateColor = currentRate === 0 ? Colors.textMuted
    : isGoodRate ? Colors.feedbackGood
    : currentRate >= 90 && currentRate <= 130 ? Colors.feedbackOk : Colors.feedbackBad;
  const depthColor = currentDepth === 0 ? Colors.textMuted
    : isGoodDepth ? Colors.feedbackGood
    : currentDepth >= 4 && currentDepth <= 7 ? Colors.feedbackOk : Colors.feedbackBad;

  const pulseScale = useSharedValue(1);
  useEffect(() => {
    if (!isPaused && currentRate > 0) {
      const interval = 60000 / Math.max(currentRate, 1);
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: interval * 0.3 }),
          withTiming(1, { duration: interval * 0.7 }),
        ),
        -1,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
    }
  }, [currentRate, isPaused]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const styles = makeStyles(Colors);

  const displayRate = currentRate > 0 ? Math.round(currentRate) : '--';
  const displayDepth = currentDepth > 0 ? currentDepth.toFixed(1) : '--';

  const recentRates = rateHistory.slice(-20);
  const maxRate = Math.max(160, ...recentRates);

  return (
    <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset || 12 }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="timer-outline" size={18} color={Colors.accent} />
          <Text style={styles.modeLabel}>C.O.L.S.</Text>
        </View>
        <Text style={styles.elapsed}>{formatTime(elapsedTime)}</Text>
        <Pressable
          style={styles.stopBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onStop(); }}
        >
          <MaterialCommunityIcons name="stop-circle-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.stopBtnText}>Stop</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.bigMetrics}>
          <Animated.View style={[styles.heartCircle, pulseStyle, { borderColor: rateColor }]}>
            <MaterialCommunityIcons name="heart-pulse" size={32} color={rateColor} />
            <Text style={[styles.bigRateNum, { color: rateColor }]}>{displayRate}</Text>
            <Text style={styles.bigRateUnit}>BPM</Text>
          </Animated.View>
          <View style={styles.bigMetricsSide}>
            <View style={styles.metricCard}>
              <Text style={styles.metricCardValue}>{totalCompressions}</Text>
              <Text style={styles.metricCardLabel}>Total</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={[styles.metricCardValue, { color: Colors.feedbackGood }]}>{accuracy}%</Text>
              <Text style={styles.metricCardLabel}>Accuracy</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={[styles.metricCardValue, { color: depthColor }]}>{displayDepth}</Text>
              <Text style={styles.metricCardLabel}>Depth cm</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rate History</Text>
          <View style={styles.barChart}>
            {recentRates.length === 0 ? (
              <Text style={styles.noData}>Start compressing to see history</Text>
            ) : (
              recentRates.map((r, i) => {
                const isGood = r >= COMPRESSION_TARGET_RATE.min && r <= COMPRESSION_TARGET_RATE.max;
                const barColor = isGood ? Colors.feedbackGood
                  : r >= 90 && r <= 130 ? Colors.feedbackOk : Colors.feedbackBad;
                return <MiniRateBar key={i} value={r} max={maxRate} color={barColor} />;
              })
            )}
          </View>
          <View style={styles.chartLegend}>
            <Text style={styles.legendText}>Target: {COMPRESSION_TARGET_RATE.min}–{COMPRESSION_TARGET_RATE.max} BPM</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { flex: 1 }]}>
            <MaterialCommunityIcons name="check-circle-outline" size={20} color={Colors.feedbackGood} />
            <Text style={styles.statNum}>{goodCompressions}</Text>
            <Text style={styles.statLabel}>Good</Text>
          </View>
          <View style={[styles.statCard, { flex: 1 }]}>
            <MaterialCommunityIcons name="close-circle-outline" size={20} color={Colors.feedbackBad} />
            <Text style={styles.statNum}>{totalCompressions - goodCompressions}</Text>
            <Text style={styles.statLabel}>Poor</Text>
          </View>
          <View style={[styles.statCard, { flex: 1 }]}>
            <MaterialCommunityIcons name="arrow-collapse-down" size={20} color={depthColor} />
            <Text style={[styles.statNum, { color: depthColor }]}>{displayDepth}</Text>
            <Text style={styles.statLabel}>cm Depth</Text>
          </View>
        </View>

        {!hardwareOnly && (
          <View style={styles.simSection}>
            <Text style={styles.simLabel}>Simulation</Text>
            <Pressable
              style={({ pressed }) => [styles.simBtn, pressed && styles.simBtnPressed]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onSimulateCompression(); }}
            >
              <MaterialCommunityIcons name="arrow-down-bold" size={24} color={Colors.text} />
              <Text style={styles.simBtnText}>Push Down</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={styles.pauseRow}>
        <Pressable
          style={[styles.pauseBtn, isPaused && styles.pauseBtnActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            isPaused ? onResume() : onPause();
          }}
        >
          <MaterialCommunityIcons
            name={isPaused ? 'play-circle-outline' : 'pause-circle-outline'}
            size={22}
            color={Colors.text}
          />
          <Text style={styles.pauseBtnText}>{isPaused ? 'Resume' : 'Pause'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(Colors: ReturnType<typeof getColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      paddingHorizontal: 16,
      gap: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    modeLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: Colors.accent,
      letterSpacing: 1,
    },
    elapsed: {
      fontSize: 22,
      fontWeight: '800',
      color: Colors.text,
      fontVariant: ['tabular-nums'],
    },
    stopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: Colors.surface,
    },
    stopBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: Colors.textMuted,
    },
    scrollContent: {
      gap: 12,
      paddingBottom: 8,
    },
    bigMetrics: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    heartCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 3,
      backgroundColor: Colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    bigRateNum: {
      fontSize: 28,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
    },
    bigRateUnit: {
      fontSize: 11,
      color: Colors.textMuted,
      fontWeight: '700',
    },
    bigMetricsSide: {
      flex: 1,
      gap: 8,
    },
    metricCard: {
      backgroundColor: Colors.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    metricCardValue: {
      fontSize: 20,
      fontWeight: '800',
      color: Colors.text,
    },
    metricCardLabel: {
      fontSize: 11,
      color: Colors.textMuted,
      fontWeight: '600',
    },
    section: {
      backgroundColor: Colors.surface,
      borderRadius: 14,
      padding: 14,
      gap: 10,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: Colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    barChart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3,
      height: 48,
    },
    noData: {
      fontSize: 12,
      color: Colors.textMuted,
      fontStyle: 'italic',
    },
    chartLegend: {
      alignItems: 'flex-end',
    },
    legendText: {
      fontSize: 10,
      color: Colors.textMuted,
      fontWeight: '500',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    statCard: {
      backgroundColor: Colors.surface,
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
      gap: 4,
    },
    statNum: {
      fontSize: 20,
      fontWeight: '800',
      color: Colors.text,
    },
    statLabel: {
      fontSize: 10,
      color: Colors.textMuted,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    simSection: {
      gap: 8,
      alignItems: 'center',
    },
    simLabel: {
      fontSize: 11,
      color: Colors.textMuted,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    simBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Colors.accent,
      paddingHorizontal: 28,
      paddingVertical: 16,
      borderRadius: 14,
    },
    simBtnPressed: {
      opacity: 0.8,
    },
    simBtnText: {
      fontSize: 16,
      fontWeight: '800',
      color: Colors.text,
    },
    pauseRow: {
      paddingTop: 4,
    },
    pauseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: Colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
    },
    pauseBtnActive: {
      backgroundColor: Colors.accent,
    },
    pauseBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: Colors.text,
    },
  });
}
