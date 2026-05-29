import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { type CPRStepId } from '@/constants/cpr-protocol';

interface SimulationControlsProps {
  currentStepId: CPRStepId;
  cyclePhase?: 'compress' | 'breathe';
  onSimulateSensor: (sensor: string, value: boolean) => void;
  onSimulateCompression: () => void;
  onSimulateBreath: () => void;
  onVerifyHands: () => void;
  sensorState: {
    leftShoulder: boolean;
    rightShoulder: boolean;
    aedPadUpper: boolean;
    aedPadLower: boolean;
  };
}

export function SimulationControls({
  currentStepId,
  cyclePhase = 'compress',
  onSimulateSensor,
  onSimulateCompression,
  onSimulateBreath,
  onVerifyHands,
  sensorState,
}: SimulationControlsProps) {
  const { theme } = useTheme();
  const ThemedColors = getColors(theme);
  const renderControls = () => {
    switch (currentStepId) {
      case 'check_responsiveness':
        return (
          <View style={styles.simGroup}>
            <Text style={[styles.simLabel, { color: ThemedColors.textSecondary }]}>
              Simulate Shoulder Tap (either one)
            </Text>
            <View style={styles.simRow}>
              <SimButton
                label="Left Shoulder"
                icon="hand-back-left"
                active={sensorState.leftShoulder}
                // onPressIn={() => onSimulateSensor('leftShoulder', true)}
                // onPressOut={() => onSimulateSensor('leftShoulder', false)}
                  onPressIn={() => onSimulateSensor('leftShoulder', true)}
                  onPressOut={() => {}}
                colors={ThemedColors}
              />
              <SimButton
                label="Right Shoulder"
                icon="hand-back-right"
                active={sensorState.rightShoulder}
                // onPressIn={() => onSimulateSensor('rightShoulder', true)}
                // onPressOut={() => onSimulateSensor('rightShoulder', false)}
                  onPressIn={() => onSimulateSensor('rightShoulder', true)}
                  onPressOut={() => {}}
                colors={ThemedColors}
              />
            </View>
          </View>
        );

      case 'hand_placement':
        return (
          <View style={styles.simGroup}>
            <Text style={[styles.simLabel, { color: ThemedColors.textSecondary }]}>Camera Hand Detection</Text>
            <SimButton
              label="Verify Hands"
              icon="hand-back-right-outline"
              onPress={onVerifyHands}
              colors={ThemedColors}
            />
          </View>
        );

      case 'compressions':
        if (cyclePhase === 'breathe') {
          return (
            <View style={styles.simGroup}>
              <Text style={[styles.simLabel, { color: ThemedColors.textSecondary }]}>Simulate Rescue Breaths</Text>
              <SimButton
                label="Give Breath"
                icon="lungs"
                large
                onPress={onSimulateBreath}
                colors={ThemedColors}
              />
            </View>
          );
        }
        return (
          <View style={styles.simGroup}>
            <Text style={[styles.simLabel, { color: ThemedColors.textSecondary }]}>Simulate Compressions</Text>
            <SimButton
              label="Push Down"
              icon="arrow-down-bold"
              large
              onPress={onSimulateCompression}
              colors={ThemedColors}
            />
          </View>
        );

      case 'aed_pads':
        return (
          <View style={styles.simGroup}>
            <Text style={[styles.simLabel, { color: ThemedColors.textSecondary }]}>Simulate AED Pad Placement</Text>
            <View style={styles.simRow}>
              <SimButton
                label="Upper Pad"
                icon="flash"
                active={sensorState.aedPadUpper}
                onPressIn={() => onSimulateSensor('aedUpper', true)}
                onPressOut={() => {}}
                colors={ThemedColors}
              />
              <SimButton
                label="Lower Pad"
                icon="flash"
                active={sensorState.aedPadLower}
                onPressIn={() => onSimulateSensor('aedLower', true)}
                onPressOut={() => {}}
                colors={ThemedColors}
              />
            </View>
          </View>
        );

      case 'post_aed_compressions':
        return (
          <View style={styles.simGroup}>
            <Text style={[styles.simLabel, { color: ThemedColors.textSecondary }]}>Simulate Post-AED Compressions</Text>
            <SimButton
              label="Push Down"
              icon="arrow-down-bold"
              large
              onPress={onSimulateCompression}
              colors={ThemedColors}
            />
          </View>
        );

      default:
        return null;
    }
  };

  const controls = renderControls();
  if (!controls) return null;

  return (
    <View style={[styles.container, { backgroundColor: ThemedColors.surface, borderColor: ThemedColors.info }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="gamepad-variant-outline" size={14} color={ThemedColors.info} />
        <Text style={[styles.headerText, { color: ThemedColors.info }]}>Simulation Mode</Text>
      </View>
      {controls}
    </View>
  );
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type ColorScheme = ReturnType<typeof getColors>;

function SimButton({ label, icon, active, large, onPress, onPressIn, onPressOut, colors }: {
  label: string;
  icon: IconName;
  active?: boolean;
  large?: boolean;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  colors: ColorScheme;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.simBtn,
        { backgroundColor: colors.surfaceLight },
        large && styles.simBtnLarge,
        active && [styles.simBtnActive, { borderColor: colors.feedbackGood }],
        pressed && styles.simBtnPressed,
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onPress?.();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <MaterialCommunityIcons
        name={icon}
        size={large ? 28 : 20}
        color={active ? colors.feedbackGood : colors.text}
      />
      <Text style={[styles.simBtnText, { color: colors.text }, active && { color: colors.feedbackGood }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  simGroup: {
    gap: 8,
  },
  simLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  simRow: {
    flexDirection: 'row',
    gap: 8,
  },
  simBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  simBtnLarge: {
    paddingVertical: 20,
  },
  simBtnActive: {
    backgroundColor: 'rgba(0, 230, 118, 0.2)',
    borderWidth: 1,
  },
  simBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  simBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
