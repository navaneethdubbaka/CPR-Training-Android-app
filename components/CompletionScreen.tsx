import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';

interface CompletionScreenProps {
  elapsedTime: number;
  compressionCount: number;
  goodCompressions: number;
  avgRate: number;
  avgDepth: number;
  breathCount: number;
  goodBreaths: number;
  overallScore: number;
  onRestart: () => void;
}

function AnimatedStat({ label, value, unit, delay, color, surfaceColor, mutedColor }: {
  label: string; value: string; unit?: string; delay: number; color: string;
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
    </Animated.View>
  );
}

export function CompletionScreen({
  elapsedTime, compressionCount, goodCompressions,
  avgRate, avgDepth, breathCount, goodBreaths,
  overallScore, onRestart,
}: CompletionScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 40 : insets.top;
  const { theme } = useTheme();
  const Colors = getColors(theme);
  const scoreScale = useSharedValue(0);

  useEffect(() => {
    scoreScale.value = withDelay(200, withSpring(1, { damping: 12 }));
  }, []);

  const scoreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scoreScale.value }],
  }));

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const scoreColor = overallScore >= 80 ? Colors.feedbackGood :
                     overallScore >= 50 ? Colors.feedbackOk : Colors.feedbackBad;
  const scoreGrade = overallScore >= 90 ? 'Excellent' :
                     overallScore >= 80 ? 'Good' :
                     overallScore >= 60 ? 'Needs Practice' : 'Keep Trying';

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

      <View style={styles.statsGrid}>
        <AnimatedStat label="Duration" value={formatTime(elapsedTime)} delay={300} color={Colors.info} surfaceColor={Colors.surface} mutedColor={Colors.textMuted} />
        <AnimatedStat label="Compressions" value={`${goodCompressions}/${compressionCount}`} delay={400} color={Colors.accent} surfaceColor={Colors.surface} mutedColor={Colors.textMuted} />
        <AnimatedStat label="Avg Rate" value={avgRate > 0 ? Math.round(avgRate).toString() : '--'} unit="BPM" delay={500} color={Colors.feedbackGood} surfaceColor={Colors.surface} mutedColor={Colors.textMuted} />
        <AnimatedStat label="Avg Depth" value={avgDepth > 0 ? avgDepth.toFixed(1) : '--'} unit="cm" delay={600} color={Colors.feedbackGood} surfaceColor={Colors.surface} mutedColor={Colors.textMuted} />
        <AnimatedStat label="Breaths" value={`${goodBreaths}/${breathCount}`} delay={700} color={Colors.info} surfaceColor={Colors.surface} mutedColor={Colors.textMuted} />
        <AnimatedStat label="Quality" value={`${overallScore}%`} delay={800} color={scoreColor} surfaceColor={Colors.surface} mutedColor={Colors.textMuted} />
      </View>

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
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
