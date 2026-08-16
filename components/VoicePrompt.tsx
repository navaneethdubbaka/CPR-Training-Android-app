import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
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
import {
  ensureMicPermission,
  openAppSettings,
  type MicPermissionStatus,
} from '@/lib/microphone-permissions';
import { useVoiceListening } from '@/contexts/VoiceListeningContext';

export type VoiceMatchMode = 'phrase' | 'help_repeat' | 'scene_safe' | 'responsive_check' | 'help_shout';

interface VoicePromptProps {
  targetPhrase: string;
  matchMode?: VoiceMatchMode;
  helpMinCount?: number;
  showHint?: boolean;
  allowManualConfirm?: boolean;
  onSuccess: () => void;
  onFailure?: (heard: string) => void;
  autoStart?: boolean;
  disabled?: boolean;
}

type MicState = 'idle' | 'starting' | 'listening' | 'recognized' | 'failed' | 'permission_denied';

const HINT_TEXT: Record<VoiceMatchMode, string> = {
  phrase: '',
  help_repeat: '"Help!" (x2)',
  scene_safe: '"Scene is safe" / "All clear" / "Safe to approach"',
  responsive_check: '"Are you okay?" / "Can you hear me?" / "Wake up"',
  help_shout: '"Help!" / "Someone help!" / "Emergency!"',
};

const RESTART_DELAY_MS = 250;
const AUTO_START_DELAY_MS = 150;

function isRecoverableRecognitionIssue(error?: string): boolean {
  if (!error) return true;
  const e = error.toLowerCase();
  return (
    e.includes('no speech') ||
    e.includes('no-speech') ||
    e.includes('phrase not recognized') ||
    e.includes('aborted') ||
    e.includes('client')
  );
}

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
  allowManualConfirm = true,
  onSuccess,
  onFailure,
  autoStart = true,
  disabled = false,
}: VoicePromptProps) {
  const [micState, setMicState] = useState<MicState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [heardText, setHeardText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [permissionStatus, setPermissionStatus] = useState<MicPermissionStatus | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const micPulse = useSharedValue(1);
  const isMounted = useRef(true);
  const lastTranscriptRef = useRef('');
  const successFiredRef = useRef(false);
  const isMutedRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micStateRef = useRef<MicState>('idle');
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const { setVoiceListening } = useVoiceListening();

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const scheduleRestart = useCallback((fn: () => void) => {
    if (isMutedRef.current) return;
    clearRestartTimer();
    restartTimerRef.current = setTimeout(fn, RESTART_DELAY_MS);
  }, [clearRestartTimer]);

  useEffect(() => {
    isMounted.current = true;
    void voiceRecognition.isAvailable().then((available) => {
      if (isMounted.current) setSpeechAvailable(available);
    });
    return () => {
      isMounted.current = false;
      clearRestartTimer();
      setVoiceListening(false);
      void voiceRecognition.stopListening();
    };
  }, [clearRestartTimer, setVoiceListening]);

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

  const setMicStateSafe = useCallback((state: MicState) => {
    micStateRef.current = state;
    setMicState(state);
    setVoiceListening(state === 'starting');
  }, [setVoiceListening]);

  const handleManualConfirm = useCallback(() => {
    if (disabled || successFiredRef.current) return;
    successFiredRef.current = true;
    clearRestartTimer();
    cancelAnimation(micPulse);
    micPulse.value = withTiming(1, { duration: 200 });
    setMicStateSafe('recognized');
    setVoiceListening(false);
    void voiceRecognition.stopListening();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      if (isMounted.current) onSuccess();
    }, 400);
  }, [disabled, clearRestartTimer, setMicStateSafe, setVoiceListening, micPulse, onSuccess]);

  const handlePermissionDenied = useCallback((status: MicPermissionStatus) => {
    setPermissionStatus(status);
    cancelAnimation(micPulse);
    micPulse.value = withTiming(1, { duration: 200 });
    setMicStateSafe('permission_denied');
    setErrorMessage(
      status === 'blocked'
        ? 'Microphone blocked — enable in Settings'
        : 'Microphone permission required',
    );
  }, [micPulse, setMicStateSafe]);

  const quietRestart = useCallback(() => {
    if (!isMounted.current || successFiredRef.current || isMutedRef.current) return;
    setErrorMessage('');
    setHeardText('');
    // Drop to idle so startListening's anti-thrash guard allows a controlled restart.
    micStateRef.current = 'idle';
    setMicState('idle');
    setVoiceListening(false);
    scheduleRestart(() => {
      if (isMounted.current && !successFiredRef.current && !isMutedRef.current) {
        void startListeningRef.current();
      }
    });
  }, [scheduleRestart, setVoiceListening]);

  const startListening = useCallback(async () => {
    if (!isMounted.current || disabled || successFiredRef.current || isMutedRef.current) return;

    // Avoid thrashing Android SpeechRecognizer when parent re-renders.
    const current = micStateRef.current;
    if (current === 'starting' || current === 'listening' || current === 'recognized') {
      return;
    }

    clearRestartTimer();
    setErrorMessage('');
    setPermissionStatus(null);

    if (Platform.OS !== 'web') {
      const perm = await ensureMicPermission();
      if (perm !== 'granted') {
        handlePermissionDenied(perm);
        return;
      }
    }

    const available = await voiceRecognition.isAvailable();
    setSpeechAvailable(available);
    if (!available) {
      setMicStateSafe('failed');
      setErrorMessage(
        Platform.OS === 'android'
          ? 'Speech recognition unavailable — install Google app or tap "I said it"'
          : 'Speech recognition not available on this device',
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setMicStateSafe('starting');
    setTranscript('');
    lastTranscriptRef.current = '';

    micPulse.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
    );

    void voiceRecognition.startListening({
      onStart: () => {
        if (!isMounted.current) return;
        setMicStateSafe('listening');
      },
      onResult: (text) => {
        if (!isMounted.current || successFiredRef.current) return;
        lastTranscriptRef.current = text;
        setTranscript(text);

        if (checkMatch(text)) {
          successFiredRef.current = true;
          clearRestartTimer();
          cancelAnimation(micPulse);
          micPulse.value = withTiming(1, { duration: 200 });
          setMicStateSafe('recognized');
          setVoiceListening(false);
          void voiceRecognition.stopListening();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => {
            if (isMounted.current) onSuccess();
          }, 600);
        }
      },
      onError: (error) => {
        if (!isMounted.current || successFiredRef.current || isMutedRef.current) return;
        if (__DEV__) {
          console.warn('[VoicePrompt] recognition error:', error);
        }

        if (isRecoverableRecognitionIssue(error)) {
          quietRestart();
          return;
        }

        cancelAnimation(micPulse);
        micPulse.value = withTiming(1, { duration: 200 });
        setMicStateSafe('failed');
        setErrorMessage(error);
        const heard = lastTranscriptRef.current;
        setHeardText(heard);
        onFailure?.(heard);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
      onEnd: () => {
        if (!isMounted.current || successFiredRef.current || isMutedRef.current) return;
        setVoiceListening(false);
        const heard = lastTranscriptRef.current;
        if (checkMatch(heard)) return;

        if (isRecoverableRecognitionIssue(heard ? 'phrase not recognized' : 'no speech detected')) {
          quietRestart();
        }
      },
    });
  }, [
    disabled,
    checkMatch,
    onSuccess,
    onFailure,
    clearRestartTimer,
    quietRestart,
    handlePermissionDenied,
    setMicStateSafe,
    setVoiceListening,
    micPulse,
  ]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Stable deps only — do not depend on startListening identity (changes every parent render).
  useEffect(() => {
    if (autoStart && !disabled && !isMuted) {
      const t = setTimeout(() => {
        void startListeningRef.current();
      }, AUTO_START_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [autoStart, disabled, isMuted]);

  const micPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
  }));

  const micColor =
    micState === 'recognized' ? Colors.success :
    micState === 'failed' ? Colors.danger :
    micState === 'permission_denied' ? Colors.danger :
    micState === 'listening' || micState === 'starting' ? Colors.accentLight :
    Colors.textMuted;

  const micBgColor =
    micState === 'recognized' ? 'rgba(0, 200, 83, 0.15)' :
    micState === 'failed' || micState === 'permission_denied' ? 'rgba(255, 23, 68, 0.15)' :
    micState === 'listening' || micState === 'starting' ? 'rgba(229, 57, 53, 0.2)' :
    isMuted ? 'rgba(255,255,255,0.03)' :
    'rgba(255,255,255,0.05)';

  const isListening = micState === 'listening';
  const hintText = matchMode !== 'phrase' ? HINT_TEXT[matchMode] : `"${targetPhrase}"`;

  const idleBadgeText = isMuted
    ? 'Mic muted — tap to resume'
    : 'Listening will start automatically';

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        {(micState === 'starting' || micState === 'listening') && (
          <View style={styles.listeningBadge}>
            <View style={styles.listeningDot} />
            <Text style={styles.listeningBadgeText}>
              {micState === 'starting' ? 'Starting mic...' : 'Listening...'}
            </Text>
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
            <Text style={[styles.listeningBadgeText, { color: Colors.danger }]}>
              {errorMessage || 'Not recognized — try again'}
            </Text>
          </View>
        )}
        {micState === 'permission_denied' && (
          <View style={[styles.listeningBadge, styles.failedBadge]}>
            <MaterialCommunityIcons name="microphone-off" size={14} color={Colors.danger} />
            <Text style={[styles.listeningBadgeText, { color: Colors.danger }]}>
              {errorMessage}
            </Text>
          </View>
        )}
        {micState === 'idle' && (
          <View style={[styles.listeningBadge, styles.idleBadge]}>
            <MaterialCommunityIcons
              name={isMuted ? 'microphone-off' : 'microphone-outline'}
              size={14}
              color={Colors.textMuted}
            />
            <Text style={[styles.listeningBadgeText, { color: Colors.textMuted }]}>{idleBadgeText}</Text>
          </View>
        )}
      </View>

      {(micState === 'failed' || speechAvailable === false) && allowManualConfirm && (
        <Pressable style={styles.settingsBtn} onPress={handleManualConfirm}>
          <MaterialCommunityIcons name="check-circle-outline" size={16} color={Colors.accentLight} />
          <Text style={styles.settingsBtnText}>I said it — continue</Text>
        </Pressable>
      )}

      {micState === 'permission_denied' && (
        <Pressable
          style={styles.settingsBtn}
          onPress={() => {
            if (permissionStatus === 'blocked') {
              openAppSettings();
            } else {
              void startListening();
            }
          }}
        >
          <MaterialCommunityIcons name="cog-outline" size={16} color={Colors.accentLight} />
          <Text style={styles.settingsBtnText}>
            {permissionStatus === 'blocked' ? 'Open Settings' : 'Grant microphone access'}
          </Text>
        </Pressable>
      )}

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
            if (micState === 'listening' || micState === 'starting') {
              isMutedRef.current = true;
              setIsMuted(true);
              clearRestartTimer();
              void voiceRecognition.stopListening();
              cancelAnimation(micPulse);
              micPulse.value = withTiming(1, { duration: 200 });
              setMicStateSafe('idle');
              setVoiceListening(false);
            } else {
              isMutedRef.current = false;
              setIsMuted(false);
              clearRestartTimer();
              void startListening();
            }
          }}
          disabled={disabled || micState === 'recognized'}
        >
          <Animated.View style={[styles.micButton, { backgroundColor: micBgColor }, micPulseStyle]}>
            <MaterialCommunityIcons
              name={isMuted || micState === 'idle' ? 'microphone-off' : 'microphone'}
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
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(229, 57, 53, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.25)',
  },
  settingsBtnText: {
    fontSize: 13,
    fontWeight: '600',
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
