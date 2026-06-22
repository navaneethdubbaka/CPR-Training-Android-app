import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions, ScrollView, Switch } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, withDelay } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { getColors } from '@/constants/colors';
import { type ArduinoConnectionStatus } from '@/lib/arduino-serial';
import { type TrainingMode } from '@/contexts/CPRTrainingContext';
import { useTheme } from '@/contexts/ThemeContext';

interface StartScreenProps {
  connectionStatus: ArduinoConnectionStatus;
  onConnect: () => void;
  onStart: () => void;
  onOpenSettings: () => void;
  selectedMode: TrainingMode;
  onSelectMode: (mode: TrainingMode) => void;
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const MODE_OPTIONS: { mode: TrainingMode; label: string; desc: string; icon: IconName }[] = [
  { mode: 'training', label: 'Training', desc: 'Guided with hints', icon: 'school-outline' },
  { mode: 'testing', label: 'Testing', desc: 'Evaluated, no hints', icon: 'clipboard-check-outline' },
  { mode: 'cols', label: 'C.O.L.S.', desc: 'Compression Only Life Support', icon: 'heart-pulse' },
];

export function StartScreen({ connectionStatus, onConnect, onStart, onOpenSettings, selectedMode, onSelectMode }: StartScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const isNarrow = width < 600;
  const isLandscape = width > height;
  const { theme, toggleTheme } = useTheme();
  const C = getColors(theme);

  const heartScale = useSharedValue(1);
  const titleOpacity = useSharedValue(0);
  const btnOpacity = useSharedValue(0);

  useEffect(() => {
    heartScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 600 }),
        withTiming(1, { duration: 600 }),
      ),
      -1,
    );
    titleOpacity.value = withDelay(300, withTiming(1, { duration: 800 }));
    btnOpacity.value = withDelay(600, withTiming(1, { duration: 800 }));
  }, []);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
  }));

  const btnStyle = useAnimatedStyle(() => ({
    opacity: btnOpacity.value,
  }));

  const isConnected = connectionStatus === 'connected';
  const isWeb = Platform.OS === 'web';
  const heartSize = isNarrow ? 72 : 100;
  const heartIconSize = isNarrow ? 44 : 64;
  const titleSize = isNarrow ? 26 : 36;
  const isDark = theme === 'dark';

  return (
    <LinearGradient
      colors={isDark ? [C.background, C.primary, '#142240'] : [C.background, C.primaryLight, '#EDE7DA']}
      style={[styles.container, { paddingTop: topInset + 12, paddingBottom: bottomInset || 16 }]}
    >
      <Pressable
        style={[styles.settingsBtn, { top: topInset + 8 }]}
        onPress={onOpenSettings}
        testID="settings-button"
      >
        <MaterialCommunityIcons name="cog" size={24} color={C.textSecondary} />
      </Pressable>

      <View style={[styles.themeBtn, { top: topInset + 8 }]}>
        <MaterialCommunityIcons name={isDark ? 'weather-night' : 'weather-sunny'} size={16} color={C.textSecondary} />
        <Switch
          value={isDark}
          onValueChange={toggleTheme}
          thumbColor={isDark ? C.accent : C.primary}
          trackColor={{ false: C.surfaceHighlight, true: C.primary }}
          style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isLandscape && !isNarrow && styles.scrollContentLandscape,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={heartStyle}>
          <View style={[styles.heartContainer, { width: heartSize, height: heartSize, borderRadius: heartSize / 2, borderColor: 'rgba(229, 57, 53, 0.3)' }]}>
            <MaterialCommunityIcons name="heart-pulse" size={heartIconSize} color={C.accent} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.titleBlock, titleStyle]}>
          <Text style={[styles.title, { fontSize: titleSize, color: C.text }]}>CPR Trainer</Text>
          <Text style={[styles.subtitle, isNarrow && { fontSize: 13 }, { color: C.textSecondary }]}>Complete Emergency Response Training</Text>
        </Animated.View>

        <Animated.View style={[styles.modeSection, btnStyle]}>
          <Text style={[styles.modeLabel, { color: C.textMuted }]}>SELECT MODE</Text>
          <View style={styles.modeGrid}>
            {MODE_OPTIONS.map(opt => (
              <Pressable
                key={opt.mode}
                style={[
                  styles.modeBtn,
                  { backgroundColor: C.surface, borderColor: C.border },
                  selectedMode === opt.mode && { borderColor: C.accent, backgroundColor: `${C.accent}15` },
                ]}
                onPress={() => onSelectMode(opt.mode)}
                testID={`mode-${opt.mode}`}
              >
                <MaterialCommunityIcons
                  name={opt.icon}
                  size={22}
                  color={selectedMode === opt.mode ? C.accent : C.textMuted}
                />
                <Text style={[styles.modeBtnLabel, { color: selectedMode === opt.mode ? C.accent : C.text }]}>{opt.label}</Text>
                <Text style={[styles.modeBtnDesc, { color: C.textMuted }]}>{opt.desc}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View style={[styles.actions, btnStyle, isNarrow && { maxWidth: '100%', paddingHorizontal: 12 }]}>
          <Pressable
            style={[styles.connectBtn, { backgroundColor: C.surface }, isConnected && styles.connectBtnActive]}
            onPress={onConnect}
          >
            <MaterialCommunityIcons
              name={isConnected ? 'check-circle' : 'usb'}
              size={20}
              color={isConnected ? C.feedbackGood : C.text}
            />
            <Text style={[styles.connectText, { color: C.text }, isConnected && { color: C.feedbackGood }, connectionStatus === 'error' && { color: C.feedbackBad }]}>
              {connectionStatus === 'connecting' ? 'Connecting...' :
               isConnected ? (isWeb ? 'USB Connected' : 'Arduino Connected') :
               connectionStatus === 'error' ? 'Connection Failed — Retry' :
               isWeb ? 'Connect Arduino (USB)' : 'Connect Arduino'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            onPress={onStart}
            testID="start-training-button"
          >
            <MaterialCommunityIcons name="play" size={24} color="#FFFFFF" />
            <Text style={styles.startText}>Begin {selectedMode === 'cols' ? 'C.O.L.S.' : selectedMode === 'testing' ? 'Assessment' : 'Training'}</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  settingsBtn: {
    position: 'absolute',
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  themeBtn: {
    position: 'absolute',
    right: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 16,
  },
  scrollContentLandscape: {
    gap: 14,
    paddingVertical: 8,
  },
  heartContainer: {
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontWeight: '900',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  modeSection: {
    gap: 8,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  modeGrid: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  modeBtnLabel: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  modeBtnDesc: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },
  actions: {
    gap: 12,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    width: '100%',
    justifyContent: 'center',
  },
  connectBtnActive: {
    backgroundColor: 'rgba(0, 200, 83, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.3)',
  },
  connectText: {
    fontSize: 14,
    fontWeight: '600',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E53935',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
    justifyContent: 'center',
  },
  startText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
