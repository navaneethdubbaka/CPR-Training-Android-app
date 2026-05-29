import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { CPR_STEPS } from '@/constants/cpr-protocol';

interface StepIndicatorProps {
  currentStepIndex: number;
  onStepPress?: (index: number) => void;
}

const STEP_ICONS: Record<string, string> = {
  scene_safety: 'shield-check',
  check_responsiveness: 'hand-wave',
  call_911: 'phone',
  check_breathing: 'weather-windy',
  hand_placement: 'hand-back-right',
  compressions: 'heart-pulse',
  open_airway: 'head-side',
  rescue_breaths: 'lungs',
  aed_pads: 'flash',
  aed_analyze: 'monitor-shimmer',
  aed_shock: 'lightning-bolt',
  post_aed_compressions: 'heart-pulse',
  post_shock: 'restart',
};

export function StepIndicator({ currentStepIndex, onStepPress }: StepIndicatorProps) {
  const { theme } = useTheme();
  const Colors = getColors(theme);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scrollWrapper, { backgroundColor: Colors.surface, borderRadius: 12 }]}
      contentContainerStyle={styles.container}
    >
      {CPR_STEPS.map((step, index) => {
        const isActive = index === currentStepIndex;
        const isComplete = index < currentStepIndex;
        const isFuture = index > currentStepIndex;

        return (
          <Pressable
            key={step.id}
            style={[
              styles.step,
              isActive && { backgroundColor: Colors.surfaceHighlight, paddingHorizontal: 8 },
            ]}
            onPress={() => onStepPress?.(index)}
            testID={`step-${step.id}`}
          >
            <View style={[
              styles.iconContainer,
              { backgroundColor: Colors.surfaceLight },
              isActive && { backgroundColor: Colors.accent },
              isComplete && { backgroundColor: Colors.success },
              isFuture && { opacity: 0.5 },
            ]}>
              {isComplete ? (
                <MaterialCommunityIcons name="check" size={14} color={Colors.text} />
              ) : (
                <Text style={[
                  styles.stepNumber,
                  { color: isFuture ? Colors.textMuted : Colors.text },
                ]}>
                  {step.number}
                </Text>
              )}
            </View>
            {isActive && (
              <Text style={[styles.stepLabel, { color: Colors.text }]} numberOfLines={1}>
                {step.title}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollWrapper: {
    flexGrow: 0,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '700',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 80,
  },
});
