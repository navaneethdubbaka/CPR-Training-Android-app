import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { CPR_STEPS, COMPRESSIONS_PER_CYCLE, BREATHS_PER_CYCLE } from '@/constants/cpr-protocol';
import { VoicePrompt } from '@/components/VoicePrompt';

interface InstructionPanelProps {
  stepIndex: number;
  stepTimer: number;
  onAdvance: () => void;
  canAdvance: boolean;
  autoAdvanceText?: string;
  hardwareOnly?: boolean;
  hideHints?: boolean;
  voiceCompleted?: boolean;
  onVoiceSuccess?: () => void;
  shoulderTapDone?: boolean;
  cyclePhase?: 'compress' | 'breathe';
  cycleCompressionCount?: number;
  cycleBreathCount?: number;
  completedCycles?: number;
  totalCycles?: number;
}

const STEP_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  scene_safety: 'shield-check-outline',
  check_responsiveness: 'hand-wave',
  call_911: 'bullhorn-outline',
  hand_placement: 'hand-back-right-outline',
  compressions: 'heart-pulse',
  aed_pads: 'flash-outline',
  aed_analyze: 'monitor-shimmer',
  aed_shock: 'flash-alert',
  post_aed_compressions: 'heart-pulse',
  post_shock: 'restart',
};

export function InstructionPanel({
  stepIndex,
  stepTimer,
  onAdvance,
  canAdvance,
  autoAdvanceText,
  hardwareOnly,
  hideHints,
  voiceCompleted,
  onVoiceSuccess,
  shoulderTapDone,
  cyclePhase = 'compress',
  cycleCompressionCount = 0,
  cycleBreathCount = 0,
  completedCycles = 0,
  totalCycles = 5,
}: InstructionPanelProps) {
  const { theme } = useTheme();
  const Colors = getColors(theme);

  const step = CPR_STEPS[stepIndex];
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 1000 }),
        withTiming(1, { duration: 1000 }),
      ),
      -1,
    );
  }, [stepIndex]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  if (!step) return null;

  const iconName = STEP_ICONS[step.id] || 'information-outline';
  const formatTimer = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const showVoiceHint = !hideHints;
  const isSceneSafety = step.id === 'scene_safety';
  const isCheckResponsiveness = step.id === 'check_responsiveness';
  const isCall911 = step.id === 'call_911';
  const isCompressions = step.id === 'compressions';
  const useVoiceForStep = isSceneSafety || isCheckResponsiveness || isCall911;

  const checkResponsivenessAllDone = isCheckResponsiveness && (voiceCompleted ?? false) && (shoulderTapDone ?? false);

  const showAdvanceButton = () => {
    if (isCheckResponsiveness) return false;
    if (!step.autoAdvance || canAdvance) return true;
    return false;
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <View style={styles.stepHeader}>
        <View style={[styles.stepNumberBadge, { backgroundColor: Colors.accent }]}>
          <Text style={[styles.stepNumberText, { color: Colors.text }]}>Step {step.number}</Text>
        </View>
        <Text style={[styles.timer, { color: Colors.textMuted }]}>{formatTimer(stepTimer)}</Text>
      </View>

      <View style={styles.instructionArea}>
        <Animated.View style={[styles.iconCircle, pulseStyle]}>
          <MaterialCommunityIcons name={iconName} size={36} color={Colors.accent} />
        </Animated.View>

        <Text style={[styles.title, { color: Colors.text }]}>{step.title}</Text>
        {!hideHints && (
          <>
            <Text style={[styles.instruction, { color: Colors.accentLight }]}>{step.instruction}</Text>
            <Text style={[styles.detail, { color: Colors.textSecondary }]}>{step.detail}</Text>
          </>
        )}
      </View>

      {autoAdvanceText && !isSceneSafety && !isCheckResponsiveness && !isCall911 && !hideHints ? (
        <View style={styles.autoAdvanceRow}>
          <MaterialCommunityIcons name="timer-sand" size={16} color={Colors.info} />
          <Text style={[styles.autoAdvanceText, { color: Colors.info }]}>{autoAdvanceText}</Text>
        </View>
      ) : null}

      {isSceneSafety && (
        <VoicePrompt
          key={`voice-scene-${stepIndex}`}
          targetPhrase="scene is safe"
          matchMode="scene_safe"
          showHint={showVoiceHint}
          onSuccess={() => {
            onVoiceSuccess?.();
            setTimeout(() => onAdvance(), 300);
          }}
        />
      )}

      {isCheckResponsiveness && (
        <View style={[styles.dualConditionContainer, { backgroundColor: Colors.surfaceLight }]}>
          <Text style={[styles.dualConditionTitle, { color: Colors.textMuted }]}>Complete both to continue:</Text>
          <View style={styles.checkboxRow}>
            <View style={[styles.checkItem, shoulderTapDone && styles.checkItemDone]}>
              <MaterialCommunityIcons
                name={shoulderTapDone ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={20}
                color={shoulderTapDone ? Colors.success : Colors.textMuted}
              />
              <Text style={[styles.checkLabel, { color: Colors.textMuted }, shoulderTapDone && { color: Colors.success, fontWeight: '600' }]}>
                Tap either shoulder
              </Text>
            </View>
            <View style={[styles.checkItem, (voiceCompleted ?? false) && styles.checkItemDone]}>
              <MaterialCommunityIcons
                name={(voiceCompleted ?? false) ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={20}
                color={(voiceCompleted ?? false) ? Colors.success : Colors.textMuted}
              />
              <Text style={[styles.checkLabel, { color: Colors.textMuted }, (voiceCompleted ?? false) && { color: Colors.success, fontWeight: '600' }]}>
                Verbal: "Are you okay?" or similar
              </Text>
            </View>
          </View>
          {!(voiceCompleted ?? false) && (
            <VoicePrompt
              key={`voice-responsiveness-${stepIndex}`}
              targetPhrase="are you okay"
              matchMode="responsive_check"
              showHint={showVoiceHint}
              onSuccess={() => {
                onVoiceSuccess?.();
              }}
              disabled={voiceCompleted ?? false}
            />
          )}
          {(voiceCompleted ?? false) && !(shoulderTapDone ?? false) && (
            <View style={styles.waitingForSensor}>
              <MaterialCommunityIcons name="timer-sand" size={14} color={Colors.info} />
              <Text style={[styles.waitingText, { color: Colors.info }]}>Waiting for shoulder tap...</Text>
            </View>
          )}
          {checkResponsivenessAllDone && (
            <Pressable
              style={[styles.advanceBtn, { backgroundColor: Colors.accent }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onAdvance();
              }}
            >
              <Text style={[styles.advanceBtnText, { color: Colors.text }]}>Continue</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color={Colors.text} />
            </Pressable>
          )}
        </View>
      )}

      {isCall911 && (
        <VoicePrompt
          key={`voice-call-${stepIndex}`}
          targetPhrase="help"
          matchMode="help_shout"
          showHint={showVoiceHint}
          onSuccess={() => {
            onVoiceSuccess?.();
            setTimeout(() => onAdvance(), 400);
          }}
          disabled={voiceCompleted ?? false}
        />
      )}

      {isCompressions && (
        <View style={[styles.cycleTracker, { backgroundColor: Colors.surfaceLight }]}>
          <View style={styles.cycleHeader}>
            <MaterialCommunityIcons
              name={cyclePhase === 'compress' ? 'heart-pulse' : 'lungs'}
              size={16}
              color={cyclePhase === 'compress' ? Colors.accent : Colors.info}
            />
            <Text style={[styles.cyclePhaseLabel, {
              color: cyclePhase === 'compress' ? Colors.accent : Colors.info,
            }]}>
              {cyclePhase === 'compress' ? 'COMPRESSION PHASE' : 'BREATH PHASE'}
            </Text>
            <View style={[styles.cycleBadge, { backgroundColor: `${Colors.feedbackGood}20` }]}>
              <Text style={[styles.cycleBadgeText, { color: Colors.feedbackGood }]}>
                Cycle {completedCycles + 1}/{totalCycles}
              </Text>
            </View>
          </View>

          <View style={styles.cycleCountsRow}>
            {cyclePhase === 'compress' ? (
              <View style={styles.cycleCount}>
                <Text style={[styles.cycleCountNum, { color: Colors.accent }]}>
                  {cycleCompressionCount}/{COMPRESSIONS_PER_CYCLE}
                </Text>
                <Text style={[styles.cycleCountLabel, { color: Colors.textMuted }]}>Compressions</Text>
                <View style={[styles.cycleBar, { backgroundColor: Colors.surfaceHighlight }]}>
                  <View style={[styles.cycleBarFill, {
                    width: `${Math.min((cycleCompressionCount / COMPRESSIONS_PER_CYCLE) * 100, 100)}%` as any,
                    backgroundColor: Colors.accent,
                  }]} />
                </View>
              </View>
            ) : (
              <View style={styles.cycleCount}>
                <Text style={[styles.cycleCountNum, { color: Colors.info }]}>
                  {cycleBreathCount}/{BREATHS_PER_CYCLE}
                </Text>
                <Text style={[styles.cycleCountLabel, { color: Colors.textMuted }]}>Rescue Breaths</Text>
                <Text style={[styles.cycleBreathHint, { color: Colors.textMuted }]}>
                  Open airway — tilt head back, lift chin, seal & breathe
                </Text>
              </View>
            )}
          </View>

          <View style={styles.completedCyclesRow}>
            {Array.from({ length: totalCycles }).map((_, i) => (
              <View
                key={i}
                style={[styles.cycleDot, {
                  backgroundColor: i < completedCycles ? Colors.feedbackGood : Colors.surfaceHighlight,
                  borderColor: i === completedCycles ? Colors.accent : 'transparent',
                }]}
              />
            ))}
          </View>
        </View>
      )}

      {showAdvanceButton() && (
        <Pressable
          style={({ pressed }) => [
            styles.advanceBtn,
            { backgroundColor: Colors.surfaceHighlight },
            canAdvance && { backgroundColor: Colors.accent },
            pressed && styles.advanceBtnPressed,
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onAdvance();
          }}
        >
          <Text style={[styles.advanceBtnText, { color: Colors.text }]}>
            {canAdvance ? 'Continue' : step.autoAdvance ? 'Skip' : 'Confirm & Continue'}
          </Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={Colors.text} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    gap: 14,
    flex: 1,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepNumberBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  timer: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  instructionArea: {
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  instruction: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  detail: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  autoAdvanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  autoAdvanceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  advanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  advanceBtnPressed: {
    opacity: 0.8,
  },
  advanceBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  dualConditionContainer: {
    gap: 10,
    borderRadius: 12,
    padding: 12,
  },
  dualConditionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checkboxRow: {
    gap: 8,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  checkItemDone: {},
  checkLabel: {
    fontSize: 13,
    flex: 1,
  },
  waitingForSensor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  waitingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cycleTracker: {
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  cycleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cyclePhaseLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    flex: 1,
  },
  cycleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cycleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cycleCountsRow: {
    gap: 6,
  },
  cycleCount: {
    gap: 4,
  },
  cycleCountNum: {
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  cycleCountLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  cycleBreathHint: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  cycleBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  cycleBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  completedCyclesRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  cycleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
});
