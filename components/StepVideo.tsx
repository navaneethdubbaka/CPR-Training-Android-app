import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import Colors from '@/constants/colors';
import { videoAssignments } from '@/lib/video-assignments';
import { isBundledKey, getBundledVideoSource } from '@/lib/bundled-videos';

interface StepVideoProps {
  stepId: string;
  stepTitle: string;
}

type VideoSource = { uri: string } | number;

type Resolution =
  | { kind: 'uri'; source: VideoSource }
  | { kind: 'missing' }
  | { kind: 'none' };

function resolveStored(stored: string | null): Resolution {
  if (!stored) return { kind: 'none' };
  if (isBundledKey(stored)) {
    const src = getBundledVideoSource(stored);
    if (src !== undefined) return { kind: 'uri', source: src };
    return { kind: 'missing' };
  }
  return { kind: 'uri', source: { uri: stored } };
}

export function StepVideo({ stepId, stepTitle }: StepVideoProps) {
  const [storedValue, setStoredValue] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    let cancelled = false;
    videoAssignments.get(stepId).then(val => {
      if (!cancelled) {
        setStoredValue(val);
        setHasError(false);
        setIsPlaying(false);
      }
    });
    const unsub = videoAssignments.onChange(assignments => {
      if (!cancelled) {
        const val = assignments[stepId] ?? null;
        setStoredValue(val);
        setHasError(false);
        setIsPlaying(false);
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [stepId]);

  const resolution = resolveStored(storedValue);
  if (resolution.kind === 'none') return null;

  if (resolution.kind === 'missing') {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>{stepTitle}</Text>
        <View style={styles.videoCard}>
          <View style={styles.errorState}>
            <MaterialCommunityIcons name="package-variant-closed" size={32} color={Colors.textMuted} />
            <Text style={styles.errorText}>Bundled video not found — rebuild the app</Text>
          </View>
        </View>
      </View>
    );
  }

  const source = resolution.source;

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  const handlePlaybackStatus = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{stepTitle}</Text>
      <View style={styles.videoCard}>
        {hasError ? (
          <View style={styles.errorState}>
            <MaterialCommunityIcons name="video-off-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.errorText}>Unable to load video</Text>
          </View>
        ) : (
          <>
            <Video
              ref={videoRef}
              source={source}
              style={styles.video}
              resizeMode={ResizeMode.COVER}
              onPlaybackStatusUpdate={handlePlaybackStatus}
              onError={() => setHasError(true)}
              shouldPlay={false}
              isLooping={false}
              useNativeControls={Platform.OS !== 'web'}
            />
            {Platform.OS === 'web' && (
              <View style={styles.controls}>
                <Pressable style={styles.playBtn} onPress={togglePlay}>
                  <MaterialCommunityIcons
                    name={isPlaying ? 'pause-circle' : 'play-circle'}
                    size={40}
                    color={Colors.accent}
                  />
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  // videoCard: {
  //   borderRadius: 12,
  //   overflow: 'hidden',
  //   borderWidth: 1.5,
  //   borderColor: Colors.border,
  //   backgroundColor: Colors.surface,
  //   minHeight: 200,
  //   justifyContent: 'center',
  // },
  // video: {
  //   width: '100%',
  //   height: 220,
  // },
   videoCard: {
  borderRadius: 12,
  overflow: 'hidden',
  borderWidth: 1.5,
  borderColor: Colors.border,
  backgroundColor: '#000',
  //minHeight: 200,
  height: 200,
  justifyContent: 'center',
  alignItems: 'center',
},

video: {
  width: '100%',
  height: '100%',
},
  controls: {
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: Colors.surface,
  },
  playBtn: {
    opacity: 0.9,
  },
  errorState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  errorText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
