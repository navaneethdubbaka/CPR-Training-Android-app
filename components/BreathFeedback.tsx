import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { BREATHS_PER_CYCLE } from '@/constants/cpr-protocol';

interface BreathFeedbackProps {
  count: number;
  currentPressure: number;
  goodBreaths: number;
  totalBreaths: number;
}

function getPressureColor(pressure: number, Colors: ReturnType<typeof getColors>): string {
  if (pressure === 0) return Colors.textMuted;
  if (pressure >= 15 && pressure <= 25) return Colors.feedbackGood;
  if (pressure >= 10 && pressure <= 30) return Colors.feedbackOk;
  return Colors.feedbackBad;
}

function getPressureLabel(pressure: number): string {
  if (pressure === 0) return 'Waiting...';
  if (pressure < 15) return 'Too Weak';
  if (pressure > 25) return 'Too Strong';
  return 'Good Breath';
}

export function BreathFeedback({ count, currentPressure, goodBreaths, totalBreaths }: BreathFeedbackProps) {
  const { theme } = useTheme();
  const Colors = getColors(theme);
  const lungScale = useSharedValue(1);
  const breathIndicator = useSharedValue(0);

  useEffect(() => {
    if (currentPressure > 5) {
      const fillPct = Math.min(currentPressure / 25, 1);
      breathIndicator.value = withTiming(fillPct * 100, { duration: 300 });
      lungScale.value = withSequence(
        withTiming(1 + fillPct * 0.3, { duration: 500 }),
        withTiming(1, { duration: 800 }),
      );
    } else {
      breathIndicator.value = withTiming(0, { duration: 500 });
    }
  }, [currentPressure]);

  const lungStyle = useAnimatedStyle(() => ({
    transform: [{ scale: lungScale.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    height: `${breathIndicator.value}%`,
  }));

  const pressureColor = getPressureColor(currentPressure, Colors);

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <View style={styles.header}>
        <Animated.View style={lungStyle}>
          <MaterialCommunityIcons name="lungs" size={32} color={Colors.info} />
        </Animated.View>
        <Text style={[styles.title, { color: Colors.text }]}>Rescue Breaths</Text>
        <Text style={[styles.countText, { color: Colors.info }]}>{count}/{BREATHS_PER_CYCLE}</Text>
      </View>

      <View style={styles.breathRow}>
        {Array.from({ length: BREATHS_PER_CYCLE }).map((_, i) => (
          <View key={i} style={[
            styles.breathDot,
            i < count
              ? { backgroundColor: Colors.success }
              : { backgroundColor: Colors.surfaceLight, borderWidth: 2, borderColor: Colors.border },
          ]}>
            {i < count ? (
              <MaterialCommunityIcons name="check" size={20} color={Colors.text} />
            ) : (
              <Text style={[styles.breathDotText, { color: Colors.textMuted }]}>{i + 1}</Text>
            )}
          </View>
        ))}
      </View>

      <View style={styles.pressureContainer}>
        <Text style={[styles.pressureLabel, { color: Colors.textMuted }]}>Air Pressure</Text>
        <View style={[styles.pressureBarBg, { backgroundColor: Colors.surfaceLight }]}>
          <View style={[styles.pressureZone, {
            bottom: `${(15 / 35) * 100}%`,
            height: `${((25 - 15) / 35) * 100}%`,
          }]} />
          <Animated.View style={[styles.pressureFill, fillStyle, {
            backgroundColor: pressureColor,
          }]} />
        </View>
        <Text style={[styles.pressureValue, { color: pressureColor }]}>
          {currentPressure > 0 ? `${currentPressure.toFixed(0)} cmH2O` : '--'}
        </Text>
        <Text style={[styles.pressureStatus, { color: pressureColor }]}>
          {getPressureLabel(currentPressure)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  countText: {
    fontSize: 22,
    fontWeight: '800',
  },
  breathRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  breathDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathDotText: {
    fontSize: 16,
    fontWeight: '700',
  },
  pressureContainer: {
    alignItems: 'center',
    gap: 4,
  },
  pressureLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  pressureBarBg: {
    width: '100%',
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  pressureZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
  },
  pressureFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 12,
  },
  pressureValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  pressureStatus: {
    fontSize: 13,
    fontWeight: '700',
  },
});
