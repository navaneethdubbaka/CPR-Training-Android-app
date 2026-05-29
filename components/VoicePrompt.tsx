import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import {
  voiceRecognition,
  matchesPhrase,
  matchesHelpPhrase,
  matchesSceneSafe,
  matchesResponsiveness,
  matchesHelpShout,
} from '@/lib/voice-recognition';

export type VoiceMatchMode = 'phrase' | 'help_repeat' | 'scene_safe' | 'responsive_check' | 'help_shout';

interface VoicePromptProps {
  targetPhrase: string;
  matchMode?: VoiceMatchMode;
  helpMinCount?: number;
  showHint?: boolean;
  onSuccess: () => void;
  onFailure?: (heard: string) => void;
  autoStart?: boolean;
  disabled?: boolean;
}

type MicState = 'idle' | 'listening' | 'recognized' | 'failed';

const HINT_TEXT: Record<VoiceMatchMode, string> = {
  phrase: '',
  help_repeat: '"Help!" (x2)',
  scene_safe: '"Scene is safe" / "All clear" / "Safe to approach"',
  responsive_check: '"Are you okay?" / "Can you hear me?" / "Wake up"',
  help_shout: '"Help!" / "Someone help!" / "Emergency!"',
};

const WaveBar = ({ index, isListening }: { index: number; isListening: boolean }) => {
  const height = useSharedValue(4);

  useEffect(() => {
    if (isListening) {
      const delay = index * 120;
      const minH = 4 + Math.random() * 8;
      const maxH = 16 + Math.random() * 20;
      const duration = 300 + Math.random() * 300;

      const start = () => {
        height.value = withRepeat(
          withSequence(
            withTiming(maxH, { duration }),
            withTiming(minH, { duration }),
          ),
          -1,
        );
      };

      const timeout = setTimeout(start, delay);
      return () => {
        clearTimeout(timeout);
        cancelAnimation(height);
        height.value = withTiming(4, { duration: 200 });
      };
    } else {
      cancelAnimation(height);
      height.value = withTiming(4, { duration: 200 });
    }
  }, [isListening, index]);

  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return <Animated.View style={[styles.waveBar, barStyle]} />;
};

const WAVE_BAR_COUNT = 7;

export function VoicePrompt({
  targetPhrase,
  matchMode = 'phrase',
  helpMinCount = 2,
  showHint = true,
  onSuccess,
  onFailure,
  autoStart = true,
  disabled = false,
}: VoicePromptProps) {
  const [micState, setMicState] = useState<MicState>('idle');
  const [transcript, setTranscript] = useState('');
  const [heardText, setHeardText] = useState('');
  const micPulse = useSharedValue(1);
  const isMounted = useRef(true);
  const lastTranscriptRef = useRef('');
  const successFiredRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micStateRef = useRef<MicState>('idle');

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      voiceRecognition.destroy();
    };
  }, []);

  const checkMatch = useCallback((text: string): boolean => {
    switch (matchMode) {
      case 'help_repeat':
        return matchesHelpPhrase(text, helpMinCount);
      case 'scene_safe':
        return matchesSceneSafe(text);
      case 'responsive_check':
        return matchesResponsiveness(text);
      case 'help_shout':
        return matchesHelpShout(text);
      default:
        return matchesPhrase(text, targetPhrase);
    }
  }, [matchMode, targetPhrase, helpMinCount]);

  const startListening = useCallback(() => {
    if (!isMounted.current || disabled || successFiredRef.current) return;

    micStateRef.current = 'listening';
    setMicState('listening');
    setTranscript('');
    lastTranscriptRef.current = '';

    micPulse.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
    );

    voiceRecognition.startListening({
      onStart: () => {
        if (!isMounted.current) return;
        micStateRef.current = 'listening';
        setMicState('listening');
      },
      onResult: (text) => {
        if (!isMounted.current || successFiredRef.current) return;
        lastTranscriptRef.current = text;
        setTranscript(text);

        if (checkMatch(text)) {
          successFiredRef.current = true;
          cancelAnimation(micPulse);
          micPulse.value = withTiming(1, { duration: 200 });
          micStateRef.current = 'recognized';
          setMicState('recognized');
          voiceRecognition.stopListening();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => {
            if (isMounted.current) onSuccess();
          }, 600);
        }
      },
      onError: (_error) => {
        if (!isMounted.current || successFiredRef.current) return;
        cancelAnimation(micPulse);
        micPulse.value = withTiming(1, { duration: 200 });
        micStateRef.current = 'failed';
        setMicState('failed');
        const heard = lastTranscriptRef.current;
        setHeardText(heard);
        onFailure?.(heard);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        restartTimerRef.current = setTimeout(() => {
          if (isMounted.current && !successFiredRef.current) {
            startListening();
          }
        }, 2500);
      },
      onEnd: () => {
        if (!isMounted.current || successFiredRef.current) return;
        const heard = lastTranscriptRef.current;
        if (!checkMatch(heard) && micStateRef.current !== 'failed') {
          cancelAnimation(micPulse);
          micPulse.value = withTiming(1, { duration: 200 });
          micStateRef.current = 'failed';
          setMicState('failed');
          setHeardText(heard);
          onFailure?.(heard);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          restartTimerRef.current = setTimeout(() => {
            if (isMounted.current && !successFiredRef.current) {
              startListening();
            }
          }, 2500);
        }
      },
    });
  }, [disabled, checkMatch, onSuccess, onFailure]);

  useEffect(() => {
    if (autoStart && !disabled) {
      const t = setTimeout(startListening, 400);
      return () => clearTimeout(t);
    }
  }, [autoStart, disabled]);

  const micPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
  }));

  const micColor =
    micState === 'recognized' ? Colors.success :
    micState === 'failed' ? Colors.danger :
    micState === 'listening' ? Colors.accentLight :
    Colors.textMuted;

  const micBgColor =
    micState === 'recognized' ? 'rgba(0, 200, 83, 0.15)' :
    micState === 'failed' ? 'rgba(255, 23, 68, 0.15)' :
    micState === 'listening' ? 'rgba(229, 57, 53, 0.2)' :
    'rgba(255,255,255,0.05)';

  const isListening = micState === 'listening';
  const hintText = matchMode !== 'phrase' ? HINT_TEXT[matchMode] : `"${targetPhrase}"`;

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        {micState === 'listening' && (
          <View style={styles.listeningBadge}>
            <View style={styles.listeningDot} />
            <Text style={styles.listeningBadgeText}>Listening...</Text>
          </View>
        )}
        {micState === 'recognized' && (
          <View style={[styles.listeningBadge, styles.recognizedBadge]}>
            <MaterialCommunityIcons name="check-circle" size={14} color={Colors.success} />
            <Text style={[styles.listeningBadgeText, { color: Colors.success }]}>Recognized!</Text>
          </View>
        )}
        {micState === 'failed' && (
          <View style={[styles.listeningBadge, styles.failedBadge]}>
            <MaterialCommunityIcons name="microphone-off" size={14} color={Colors.danger} />
            <Text style={[styles.listeningBadgeText, { color: Colors.danger }]}>Not recognized — try again</Text>
          </View>
        )}
        {micState === 'idle' && (
          <View style={[styles.listeningBadge, styles.idleBadge]}>
            <MaterialCommunityIcons name="microphone-outline" size={14} color={Colors.textMuted} />
            <Text style={[styles.listeningBadgeText, { color: Colors.textMuted }]}>Tap mic to start</Text>
          </View>
        )}
      </View>

      <View style={styles.micRow}>
        <View style={styles.waveContainer}>
          {Array.from({ length: WAVE_BAR_COUNT }).map((_, i) => (
            <WaveBar key={i} index={i} isListening={isListening} />
          ))}
        </View>

        <Pressable
          onPress={() => {
            if (disabled || successFiredRef.current) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (micState === 'listening') {
              voiceRecognition.stopListening();
            } else {
              if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
              startListening();
            }
          }}
          disabled={disabled || micState === 'recognized'}
        >
          <Animated.View style={[styles.micButton, { backgroundColor: micBgColor }, micPulseStyle]}>
            <MaterialCommunityIcons
              name={micState === 'listening' ? 'microphone' : 'microphone-outline'}
              size={28}
              color={micColor}
            />
          </Animated.View>
        </Pressable>

        <View style={styles.waveContainer}>
          {Array.from({ length: WAVE_BAR_COUNT }).map((_, i) => (
            <WaveBar key={i} index={WAVE_BAR_COUNT - 1 - i} isListening={isListening} />
          ))}
        </View>
      </View>

      {showHint && (
        <View style={styles.hintRow}>
          <MaterialCommunityIcons name="information-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.hintText}>Say: {hintText}</Text>
        </View>
      )}

      {(transcript.length > 0 || heardText.length > 0) && (
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel}>Heard:</Text>
          <Text style={styles.transcriptText} numberOfLines={2}>
            {micState === 'failed' ? (heardText || '(nothing)') : (transcript || '...')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statusRow: {
    alignItems: 'center',
  },
  listeningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
  },
  recognizedBadge: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    borderColor: 'rgba(0, 200, 83, 0.3)',
  },
  failedBadge: {
    backgroundColor: 'rgba(255, 23, 68, 0.12)',
    borderColor: 'rgba(255, 23, 68, 0.3)',
  },
  idleBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accentLight,
  },
  listeningBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accentLight,
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    width: 60,
    height: 40,
    justifyContent: 'center',
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: Colors.accentLight,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(229, 57, 53, 0.3)',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  hintText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  transcriptBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 280,
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  transcriptText: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
    fontStyle: 'italic',
  },
});
