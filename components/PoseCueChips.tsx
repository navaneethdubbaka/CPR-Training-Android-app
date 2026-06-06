import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getColors } from '@/constants/colors';
import type { CPRPostureResult } from '@/lib/pose-analysis';
import { getPoseCueChips } from '@/lib/coaching-cues';

interface Props {
  result: CPRPostureResult;
  Colors: ReturnType<typeof getColors>;
  compact?: boolean;
}

export function PoseCueChips({ result, Colors, compact = false }: Props) {
  const chips = getPoseCueChips(result);

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
