import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Image } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import type { CoachingEvent, SessionSnapshot } from '@/lib/session-recorder';
import type { SessionAnalyticsSummary } from '@/lib/session-analytics';
import { sessionRecorder } from '@/lib/session-recorder';
import { COMPRESS_TO_BREATH_TARGET_MS } from '@/constants/cpr-protocol';

interface CompletionScreenProps {
  overallScore: number;
  sessionAnalytics: SessionAnalyticsSummary;
  coachingEvents?: CoachingEvent[];
  snapshots?: SessionSnapshot[];
  onRestart: () => void;
}

function AnimatedStat({ label, value, unit, sublabel, delay, color, surfaceColor, mutedColor }: {
  label: string; value: string; unit?: string; sublabel?: string; delay: number; color: string;
  surfaceColor: string; mutedColor: string;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
    translateY.value = withDelay(delay, withSpring(0));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.stat, { backgroundColor: surfaceColor }, style]}>
      <Text style={[styles.statLabel, { color: mutedColor }]}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        {unit ? <Text style={[styles.statUnit, { color: mutedColor }]}>{unit}</Text> : null}
      </View>
      {sublabel ? (
        <Text style={[styles.statSublabel, { color: mutedColor }]}>{sublabel}</Text>
      ) : null}
    </Animated.View>
  );
}

function formatGapSeconds(ms: number): string {
  if (ms <= 0) return '--';
  return (ms / 1000).toFixed(1);
}

export function CompletionScreen({
  overallScore,
  sessionAnalytics,
  coachingEvents = [],
  snapshots = [],
  onRestart,
}: CompletionScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 40 : insets.top;
  const { theme } = useTheme();
  const Colors = getColors(theme);
  const scoreScale = useSharedValue(0);
  const [logExpanded, setLogExpanded] = useState(false);

  useEffect(() => {
    scoreScale.value = withDelay(200, withSpring(1, { damping: 12 }));
  }, []);

  const scoreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scoreScale.value }],
  }));

  const formatEventTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  const scoreColor = overallScore >= 80 ? Colors.feedbackGood :
                     overallScore >= 50 ? Colors.feedbackOk : Colors.feedbackBad;
  const scoreGrade = overallScore >= 90 ? 'Excellent' :
                     overallScore >= 80 ? 'Good' :
                     overallScore >= 60 ? 'Needs Practice' : 'Keep Trying';

  const maxGapMs = sessionAnalytics.maxCompressToBreathGapMs;
  const gapOk = maxGapMs === 0 || maxGapMs <= COMPRESS_TO_BREATH_TARGET_MS;
  const gapColor = maxGapMs === 0 ? Colors.textMuted : gapOk ? Colors.feedbackGood : Colors.feedbackBad;

  const handleDownloadReport = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const report = sessionRecorder.exportReport({
      overallScore,
      sessionAnalytics,
    });
    const blob = new Blob([report], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cpr-session-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: Colors.background, paddingTop: topInset }]}
      contentContainerStyle={styles.content}
    >
      <Animated.View style={[styles.scoreCircle, scoreStyle, { borderColor: scoreColor, backgroundColor: Colors.surface }]}>
        <Text style={[styles.scoreValue, { color: scoreColor }]}>{overallScore}</Text>
        <Text style={[styles.scorePercent, { color: Colors.textMuted }]}>%</Text>
      </Animated.View>

      <Text style={[styles.grade, { color: scoreColor }]}>{scoreGrade}</Text>
      <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>Training Session Complete</Text>
      <Text style={[styles.scoreCaption, { color: Colors.textMuted }]}>
        Quality based on compression depth, rate, and force
      </Text>

      <View style={styles.statsGrid}>
        <AnimatedStat
          label="Elbow folds"
          value={String(sessionAnalytics.elbowFoldCount)}
          delay={300}
          color={sessionAnalytics.elbowFoldCount === 0 ? Colors.feedbackGood : Colors.feedbackOk}
          surfaceColor={Colors.surface}
          mutedColor={Colors.textMuted}
        />
        <AnimatedStat
          label="Interruptions"
          value={String(sessionAnalytics.compressionInterruptions)}
          sublabel="≥10s between compressions"
          delay={400}
          color={sessionAnalytics.compressionInterruptions === 0 ? Colors.feedbackGood : Colors.feedbackBad}
          surfaceColor={Colors.surface}
          mutedColor={Colors.textMuted}
        />
        <AnimatedStat
          label="Max compress→breath"
          value={formatGapSeconds(maxGapMs)}
          unit="s"
          sublabel={`Target ≤ ${COMPRESS_TO_BREATH_TARGET_MS / 1000}s`}
          delay={500}
          color={gapColor}
          surfaceColor={Colors.surface}
          mutedColor={Colors.textMuted}
        />
        <AnimatedStat
          label="Didn't look down"
          value={String(sessionAnalytics.lookDownFailCount)}
          delay={600}
          color={sessionAnalytics.lookDownFailCount === 0 ? Colors.feedbackGood : Colors.feedbackOk}
          surfaceColor={Colors.surface}
          mutedColor={Colors.textMuted}
        />
        <AnimatedStat
          label="Avg rate"
          value={sessionAnalytics.avgRate > 0 ? Math.round(sessionAnalytics.avgRate).toString() : '--'}
          unit="BPM"
          delay={700}
          color={Colors.feedbackGood}
          surfaceColor={Colors.surface}
          mutedColor={Colors.textMuted}
        />
        <AnimatedStat
          label="Avg depth"
          value={sessionAnalytics.avgDepth > 0 ? sessionAnalytics.avgDepth.toFixed(1) : '--'}
          unit="cm"
          delay={800}
          color={Colors.feedbackGood}
          surfaceColor={Colors.surface}
          mutedColor={Colors.textMuted}
        />
      </View>

      <View style={[styles.logSection, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Pressable style={styles.logHeader} onPress={() => setLogExpanded(v => !v)}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={18} color={Colors.info} />
            <Text style={[styles.logTitle, { color: Colors.text }]}>
              Session Log — {coachingEvents.length} alert{coachingEvents.length !== 1 ? 's' : ''}, {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
            </Text>
            <MaterialCommunityIcons
              name={logExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={Colors.textMuted}
            />
          </Pressable>

          {logExpanded && (
            <View style={styles.logBody}>
              {coachingEvents.length === 0 && snapshots.length === 0 && (
                <Text style={[styles.emptyLog, { color: Colors.textMuted }]}>
                  No coaching alerts or snapshots were captured this session.
                </Text>
              )}
              {snapshots.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbStrip}>
                  {snapshots.map(snap => (
                    <View key={snap.id} style={styles.thumbWrap}>
                      {Platform.OS === 'web' ? (
                        <img src={snap.dataUrl} alt={`Snapshot ${snap.id}`} style={{ width: 80, height: 60, borderRadius: 6, objectFit: 'cover' } as React.CSSProperties} />
                      ) : (
                        <Image source={{ uri: snap.dataUrl }} style={styles.thumb} />
                      )}
                      <Text style={[styles.thumbLabel, { color: Colors.textMuted }]}>{snap.stepId}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              <ScrollView style={styles.logScroll} nestedScrollEnabled>
                {coachingEvents.map(evt => (
                  <View key={evt.id} style={styles.logRow}>
                    <Text style={[styles.logTime, { color: Colors.textMuted }]}>{formatEventTime(evt.timestamp)}</Text>
                    <Text style={[styles.logMsg, { color: Colors.textSecondary }]} numberOfLines={2}>
                      [{evt.source}] {evt.message}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

      {Platform.OS === 'web' && (
        <Pressable
          style={({ pressed }) => [styles.downloadBtn, { backgroundColor: Colors.surface, borderColor: Colors.border }, pressed && { opacity: 0.8 }]}
          onPress={handleDownloadReport}
        >
          <MaterialCommunityIcons name="download" size={20} color={Colors.info} />
          <Text style={[styles.downloadText, { color: Colors.info }]}>Download Report (JSON)</Text>
        </Pressable>
      )}

      <Pressable
        style={({ pressed }) => [styles.restartBtn, { backgroundColor: Colors.accent }, pressed && { opacity: 0.8 }]}
        onPress={onRestart}
      >
        <MaterialCommunityIcons name="restart" size={22} color={Colors.text} />
        <Text style={[styles.restartText, { color: Colors.text }]}>Start New Session</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  scoreValue: {
    fontSize: 44,
    fontWeight: '900',
  },
  scorePercent: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  grade: {
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
  },
  scoreCaption: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: -8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    maxWidth: 500,
  },
  stat: {
    borderRadius: 12,
    padding: 14,
    width: 140,
    alignItems: 'center',
    gap: 4,
    minHeight: 88,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  statUnit: {
    fontSize: 12,
    fontWeight: '600',
  },
  statSublabel: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2,
  },
  logSection: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
  },
  logTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  logBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  emptyLog: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
  thumbStrip: {
    marginBottom: 8,
  },
  thumbWrap: {
    marginRight: 8,
    alignItems: 'center',
    gap: 4,
  },
  thumb: {
    width: 80,
    height: 60,
    borderRadius: 6,
  },
  thumbLabel: {
    fontSize: 9,
  },
  logScroll: {
    maxHeight: 220,
  },
  logRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  logTime: {
    fontSize: 10,
    fontWeight: '600',
    width: 52,
  },
  logMsg: {
    flex: 1,
    fontSize: 11,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  downloadText: {
    fontSize: 14,
    fontWeight: '700',
  },
  restartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  restartText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
