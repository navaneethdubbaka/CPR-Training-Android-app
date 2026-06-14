import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getColors } from '@/constants/colors';
import type { CPRPostureResult } from '@/lib/pose-analysis';
import type { PoseCheckMode } from '@/lib/cpr-pose-constants';
import { getPoseCueChips } from '@/lib/coaching-cues';
import { sessionRecorder } from '@/lib/session-recorder';
import { sessionAnalytics } from '@/lib/session-analytics';

interface Props {
  result: CPRPostureResult;
  Colors: ReturnType<typeof getColors>;
  compact?: boolean;
  checkMode?: PoseCheckMode;
  stepId?: string;
}

export function PoseCueChips({ result, Colors, compact = false, checkMode = 'full_cpr', stepId }: Props) {
  const chips = getPoseCueChips(result, checkMode);
  const prevOkRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!stepId) return;
    sessionAnalytics.recordPoseFrame(stepId, result, checkMode);
    for (const chip of chips) {
      const wasOk = prevOkRef.current[chip.id];
      if (wasOk === false && chip.ok) {
        sessionRecorder.clearChipFailure(chip.id, stepId);
      }
      if (chip.ok === false && wasOk !== false) {
        sessionRecorder.logChipFailure(stepId, chip.id, chip.label);
      }
      prevOkRef.current[chip.id] = chip.ok;
    }
  }, [chips, stepId, result, checkMode]);

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {chips.map(chip => (
        <View
          key={chip.id}
          style={[
            styles.chip,
            compact && styles.chipCompact,
            {
              backgroundColor: chip.ok ? 'rgba(0,230,118,0.12)' : 'rgba(229,57,53,0.12)',
              borderColor: chip.ok ? Colors.feedbackGood : Colors.feedbackBad,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={chip.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={compact ? 11 : 13}
            color={chip.ok ? Colors.feedbackGood : Colors.feedbackBad}
          />
          <Text
            style={[
              styles.chipText,
              compact && styles.chipTextCompact,
              { color: chip.ok ? Colors.feedbackGood : Colors.feedbackBad },
            ]}
            numberOfLines={1}
          >
            {chip.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rowCompact: {
    gap: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  chipCompact: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  chipTextCompact: {
    fontSize: 9,
  },
});
