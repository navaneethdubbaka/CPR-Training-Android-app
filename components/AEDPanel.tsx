import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import Colors, { getColors } from '@/constants/colors';

type AEDState = 'off' | 'powered' | 'analyzing' | 'charged' | 'shocked';

interface AEDPanelProps {
  upperPadPlaced: boolean;
  lowerPadPlaced: boolean;
  analyzing: boolean;
  shockAdvised: boolean;
  onShockPress: () => void;
  shockDelivered: boolean;
  onShockComplete?: () => void;
}


const ECG_POINTS = (() => {
  const pts: { x: number; y: number }[] = [];
  const W = 200;
  const H = 40;
  const cycles = 4;
  for (let i = 0; i <= W; i++) {
    const t = (i / W) * cycles * Math.PI * 2;
    const base = Math.sin(t) * 3;
    const spike = Math.abs(Math.sin(t * 3)) > 0.97 ? (Math.sin(t * 3) > 0 ? -H * 0.8 : H * 0.3) : 0;
    const noise = Math.sin(t * 17) * 1.5 + Math.sin(t * 31) * 0.8;
    pts.push({ x: i, y: H / 2 + base + spike + noise });
  }
  return pts;
})();

function EcgWaveform({ active }: { active: boolean }) {
  const scrollX = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      opacity.value = withTiming(1, { duration: 400 });
      scrollX.value = withRepeat(
        withTiming(-200, { duration: 1200, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(scrollX);
      opacity.value = withTiming(0, { duration: 300 });
      scrollX.value = 0;
    }
  }, [active]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scrollX.value }],
    opacity: opacity.value,
  }));

  const svgPoints = ECG_POINTS.map(p => `${p.x},${p.y}`).join(' ');
  const svgPoints2 = ECG_POINTS.map(p => `${p.x + 200},${p.y}`).join(' ');
  const svgPoints3 = ECG_POINTS.map(p => `${p.x + 400},${p.y}`).join(' ');

  if (Platform.OS === 'web') {
    return (
      <Animated.View style={[styles.ecgContainer, animStyle]}>
        <svg width="600" height="50" style={{ display: 'block' }}>
          <polyline points={`${svgPoints} ${svgPoints2} ${svgPoints3}`} fill="none" stroke="#00E676" strokeWidth="1.5" />
        </svg>
      </Animated.View>
    );
  }

  const segments: React.ReactElement[] = [];
  const allPts = [
    ...ECG_POINTS.map(p => ({ x: p.x, y: p.y })),
    ...ECG_POINTS.map(p => ({ x: p.x + 200, y: p.y })),
    ...ECG_POINTS.map(p => ({ x: p.x + 400, y: p.y })),
  ];
  for (let i = 0; i < allPts.length - 1; i++) {
    const a = allPts[i];
    const b = allPts[i + 1];
    const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    segments.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: midX - len / 2,
          top: midY - 0.75,
          width: len,
          height: 1.5,
          backgroundColor: '#00E676',
          transform: [{ rotate: `${angle}deg` }],
        }}
      />
    );
  }

  return (
    <Animated.View style={[styles.ecgContainer, animStyle]}>
      <View style={{ width: 600, height: 50 }}>{segments}</View>
    </Animated.View>
  );
}

function BodyDiagram({ upperPlaced, lowerPlaced }: { upperPlaced: boolean; lowerPlaced: boolean }) {
  return (
    <View style={styles.bodyDiagram}>
      <View style={styles.bodyOutline}>
        <View style={styles.bodyHead} />
        <View style={styles.bodyTorso}>
          <View style={[
            styles.padZoneUpper,
            { backgroundColor: upperPlaced ? 'rgba(0,200,83,0.4)' : 'rgba(255,109,0,0.3)', borderColor: upperPlaced ? Colors.aedGreen : Colors.aedOrange }
          ]}>
            <Text style={[styles.padZoneLabel, { color: upperPlaced ? Colors.aedGreen : Colors.aedOrange }]}>R</Text>
          </View>
          <View style={[
            styles.padZoneLower,
            { backgroundColor: lowerPlaced ? 'rgba(0,200,83,0.4)' : 'rgba(255,109,0,0.3)', borderColor: lowerPlaced ? Colors.aedGreen : Colors.aedOrange }
          ]}>
            <Text style={[styles.padZoneLabel, { color: lowerPlaced ? Colors.aedGreen : Colors.aedOrange }]}>L</Text>
          </View>
        </View>
        <View style={styles.bodyLegs}>
          <View style={styles.bodyLeg} />
          <View style={styles.bodyLeg} />
        </View>
      </View>
      <View style={styles.padLegend}>
        <Text style={styles.padLegendTitle}>PAD PLACEMENT</Text>
        <View style={styles.padLegendItem}>
          <View style={[styles.padLegendDot, { backgroundColor: upperPlaced ? Colors.aedGreen : Colors.aedOrange }]} />
          <Text style={[styles.padLegendText, { color: upperPlaced ? Colors.aedGreen : Colors.textSecondary }]}>
            Upper R {upperPlaced ? '✓' : '— Apply now'}
          </Text>
        </View>
        <View style={styles.padLegendItem}>
          <View style={[styles.padLegendDot, { backgroundColor: lowerPlaced ? Colors.aedGreen : Colors.aedOrange }]} />
          <Text style={[styles.padLegendText, { color: lowerPlaced ? Colors.aedGreen : Colors.textSecondary }]}>
            Lower L {lowerPlaced ? '✓' : '— Apply now'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function AEDPanel({
  upperPadPlaced,
  lowerPadPlaced,
  analyzing,
  shockAdvised,
  onShockPress,
  shockDelivered,
  onShockComplete,
}: AEDPanelProps) {
  const { theme } = useTheme();
  const ThemedColors = getColors(theme);
  const padsPlaced = upperPadPlaced && lowerPadPlaced;
  const screenFlash = useSharedValue(0);
  const shockBtnScale = useSharedValue(1);
  const shockBtnGlow = useSharedValue(0);
  const standClearBlink = useSharedValue(0);
  const chargingBarWidth = useSharedValue(0);
  const powerLedOpacity = useSharedValue(1);

  const aedState: AEDState = shockDelivered
    ? 'shocked'
    : shockAdvised
    ? 'charged'
    : analyzing
    ? 'analyzing'
    : 'powered';

  useEffect(() => {
    powerLedOpacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 800 }), withTiming(0.3, { duration: 800 })),
      -1,
      false,
    );
    return () => { cancelAnimation(powerLedOpacity); };
  }, []);

  useEffect(() => {
    if (analyzing) {
      chargingBarWidth.value = withTiming(100, { duration: 5000 });
    } else {
      chargingBarWidth.value = 0;
    }
  }, [analyzing]);

  useEffect(() => {
    if (aedState === 'charged') {
      shockBtnGlow.value = withRepeat(
        withSequence(withTiming(1, { duration: 500 }), withTiming(0.3, { duration: 500 })),
        -1,
        false,
      );
      shockBtnScale.value = withRepeat(
        withSequence(withTiming(1.06, { duration: 600 }), withTiming(1, { duration: 600 })),
        -1,
        false,
      );
      standClearBlink.value = withRepeat(
        withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })),
        -1,
        false,
      );
    } else {
      cancelAnimation(shockBtnGlow);
      cancelAnimation(shockBtnScale);
      cancelAnimation(standClearBlink);
      shockBtnGlow.value = 0;
      shockBtnScale.value = 1;
      standClearBlink.value = 0;
    }
  }, [aedState]);

  const handleShock = useCallback(() => {
    if (aedState !== 'charged') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    screenFlash.value = withSequence(
      withTiming(1, { duration: 60 }),
      withTiming(0.8, { duration: 60 }),
      withTiming(1, { duration: 60 }),
      withTiming(0, { duration: 400 }),
    );
    onShockPress();
    if (onShockComplete) {
      setTimeout(() => onShockComplete(), 2000);
    }
  }, [aedState, onShockPress, onShockComplete]);

  const screenFlashStyle = useAnimatedStyle(() => ({
    opacity: screenFlash.value,
  }));

  const shockBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shockBtnScale.value }],
  }));

  const shockBtnGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: shockBtnGlow.value * 0.9,
    shadowRadius: 16 * shockBtnGlow.value,
  }));

  const standClearStyle = useAnimatedStyle(() => ({
    opacity: standClearBlink.value,
  }));

  const chargingBarStyle = useAnimatedStyle(() => ({
    width: `${chargingBarWidth.value}%` as any,
  }));

  const powerLedStyle = useAnimatedStyle(() => ({
    opacity: powerLedOpacity.value,
  }));

  const getLCDContent = () => {
    if (aedState === 'shocked') {
      return {
        title: 'ENERGY DELIVERED',
        subtitle: `Resume CPR immediately`,
        color: ThemedColors.aedGreen,
        icon: 'check-circle' as const,
      };
    }
    if (aedState === 'charged') {
      return {
        title: 'SHOCK ADVISED',
        subtitle: 'Press SHOCK — Everyone stand clear!',
        color: ThemedColors.aedOrange,
        icon: 'flash-alert' as const,
      };
    }
    if (aedState === 'analyzing') {
      return {
        title: 'ANALYZING RHYTHM',
        subtitle: 'Stand clear — Do not touch patient',
        color: ThemedColors.info,
        icon: 'monitor-shimmer' as const,
      };
    }
    if (padsPlaced) {
      return {
        title: 'AED READY',
        subtitle: 'Pads connected — Do not touch patient',
        color: ThemedColors.aedGreen,
        icon: 'heart-pulse' as const,
      };
    }
    return {
      title: 'ATTACH PADS',
      subtitle: 'Place electrode pads on bare chest',
      color: ThemedColors.aedOrange,
      icon: 'alert-circle' as const,
    };
  };

  const lcd = getLCDContent();
  const canShock = aedState === 'charged';
  const showBodyDiagram = !analyzing && !shockAdvised && !shockDelivered;
  const showEcg = analyzing || (aedState === 'charged' && !shockDelivered);

  return (
    <View style={styles.deviceBody}>
      <View style={styles.deviceTopStrip}>
        <View style={styles.brandRow}>
          <Text style={styles.brandText}>LIFESAVER AED</Text>
          <Animated.View style={[styles.powerLed, powerLedStyle]} />
        </View>
        <Text style={styles.modelText}>Model LS-450 · Automated External Defibrillator</Text>
      </View>

      <View style={styles.lcdWrapper}>
        <View style={styles.lcdScreen}>
          <Animated.View
            pointerEvents="none"
            style={[styles.screenFlashOverlay, screenFlashStyle]}
          />

          <View style={styles.lcdHeader}>
            <View style={[styles.lcdStatusDot, { backgroundColor: lcd.color }]} />
            <Text style={[styles.lcdHeaderText, { color: lcd.color }]}>{lcd.title}</Text>
          </View>

          <Text style={styles.lcdSubtext}>{lcd.subtitle}</Text>

          {showEcg && (
            <View style={styles.ecgViewport}>
              <EcgWaveform active={showEcg} />
            </View>
          )}

          {(aedState === 'analyzing') && (
            <View style={styles.chargeBarWrapper}>
              <Text style={styles.chargeBarLabel}>ANALYZING...</Text>
              <View style={styles.chargeBarTrack}>
                <Animated.View style={[styles.chargeBarFill, chargingBarStyle]} />
              </View>
            </View>
          )}

          {aedState === 'charged' && (
            <Animated.View style={[styles.standClearBanner, standClearStyle]}>
              <Text style={styles.standClearText}>⚠  STAND CLEAR!</Text>
            </Animated.View>
          )}

          {aedState === 'shocked' && (
            <View style={styles.shockResultBanner}>
              <Text style={styles.shockResultText}>RESUME CPR NOW</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.leftControls}>
          <View style={styles.padSection}>
            <Text style={styles.sectionLabel}>ELECTRODE STATUS</Text>
            <View style={styles.padIndicatorRow}>
              <View style={styles.padIndicator}>
                <View style={[styles.padIndicatorLed, {
                  backgroundColor: upperPadPlaced ? ThemedColors.aedGreen : ThemedColors.feedbackBad,
                  shadowColor: upperPadPlaced ? ThemedColors.aedGreen : ThemedColors.feedbackBad,
                  shadowOpacity: 0.7,
                  shadowRadius: 6,
                }]} />
                <Text style={styles.padIndicatorLabel}>UPPER</Text>
                <Text style={[styles.padIndicatorStatus, { color: upperPadPlaced ? ThemedColors.aedGreen : ThemedColors.feedbackBad }]}>
                  {upperPadPlaced ? 'OK' : '--'}
                </Text>
              </View>
              <View style={styles.padConnectorLine} />
              <View style={styles.padIndicator}>
                <View style={[styles.padIndicatorLed, {
                  backgroundColor: lowerPadPlaced ? ThemedColors.aedGreen : ThemedColors.feedbackBad,
                  shadowColor: lowerPadPlaced ? ThemedColors.aedGreen : ThemedColors.feedbackBad,
                  shadowOpacity: 0.7,
                  shadowRadius: 6,
                }]} />
                <Text style={styles.padIndicatorLabel}>LOWER</Text>
                <Text style={[styles.padIndicatorStatus, { color: lowerPadPlaced ? ThemedColors.aedGreen : ThemedColors.feedbackBad }]}>
                  {lowerPadPlaced ? 'OK' : '--'}
                </Text>
              </View>
            </View>
          </View>

          {showBodyDiagram && (
            <BodyDiagram upperPlaced={upperPadPlaced} lowerPlaced={lowerPadPlaced} />
          )}
        </View>

        <View style={styles.shockColumn}>
          <Animated.View style={[styles.shockBtnOuter, canShock && shockBtnGlowStyle, shockBtnAnimStyle, {
            shadowColor: ThemedColors.aedOrange,
            shadowOffset: { width: 0, height: 0 },
            elevation: canShock ? 12 : 0,
          }]}>
            <Pressable
              style={[styles.shockButton, canShock ? styles.shockButtonActive : styles.shockButtonInactive]}
              onPress={handleShock}
              disabled={!canShock}
              testID="aed-shock-button"
            >
              <MaterialCommunityIcons
                name="flash"
                size={32}
                color={canShock ? '#FFFFFF' : ThemedColors.textMuted}
              />
              <Text style={[styles.shockBtnLabel, { color: canShock ? '#FFFFFF' : ThemedColors.textMuted }]}>
                SHOCK
              </Text>
            </Pressable>
          </Animated.View>

          <View style={styles.powerBtnWrapper}>
            <View style={[styles.powerButton, { borderColor: ThemedColors.aedGreen }]}>
              <MaterialCommunityIcons name="power" size={16} color={ThemedColors.aedGreen} />
            </View>
            <Text style={[styles.powerBtnLabel, { color: ThemedColors.aedGreen }]}>ON</Text>
          </View>
        </View>
      </View>

      <View style={styles.deviceBottomRidge} />
    </View>
  );
}

const styles = StyleSheet.create({
  deviceBody: {
    backgroundColor: '#1C2026',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#36404A',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  deviceTopStrip: {
    backgroundColor: '#131820',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3340',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  modelText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  powerLed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00C853',
    shadowColor: '#00C853',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 2,
  },
  lcdWrapper: {
    padding: 10,
    paddingBottom: 6,
  },
  lcdScreen: {
    backgroundColor: '#050D0A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1A3020',
    padding: 10,
    minHeight: 110,
    overflow: 'hidden',
    position: 'relative',
  },
  screenFlashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    zIndex: 10,
  },
  lcdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  lcdStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  lcdHeaderText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  lcdSubtext: {
    fontSize: 10,
    color: 'rgba(0,230,120,0.6)',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 6,
  },
  ecgViewport: {
    height: 50,
    overflow: 'hidden',
    borderRadius: 3,
    marginBottom: 4,
  },
  ecgContainer: {
    flexDirection: 'row',
  },
  chargeBarWrapper: {
    marginTop: 4,
  },
  chargeBarLabel: {
    fontSize: 9,
    color: '#2979FF',
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 3,
  },
  chargeBarTrack: {
    height: 5,
    backgroundColor: '#0D2040',
    borderRadius: 3,
    overflow: 'hidden',
  },
  chargeBarFill: {
    height: '100%',
    backgroundColor: '#2979FF',
    borderRadius: 3,
  },
  standClearBanner: {
    marginTop: 6,
    backgroundColor: 'rgba(255,23,68,0.2)',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#FF1744',
    alignItems: 'center',
  },
  standClearText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FF1744',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  shockResultBanner: {
    marginTop: 6,
    backgroundColor: 'rgba(0,200,83,0.15)',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#00C853',
    alignItems: 'center',
  },
  shockResultText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#00C853',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  leftControls: {
    flex: 1,
    gap: 8,
  },
  energySection: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
  },
  energyRow: {
    flexDirection: 'row',
    gap: 4,
  },
  energyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2A3340',
    backgroundColor: '#141A22',
  },
  energyBtnActive: {
    backgroundColor: '#1E3A5A',
    borderColor: '#2979FF',
  },
  energyBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
  },
  energyBtnTextActive: {
    color: '#2979FF',
  },
  padSection: {
    gap: 4,
  },
  padIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  padIndicator: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  padIndicatorLed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    elevation: 3,
  },
  padIndicatorLabel: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  padIndicatorStatus: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  padConnectorLine: {
    width: 20,
    height: 1,
    backgroundColor: '#2A3340',
    marginBottom: 10,
  },
  bodyDiagram: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 2,
  },
  bodyOutline: {
    alignItems: 'center',
    gap: 0,
  },
  bodyHead: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#243040',
    borderWidth: 1,
    borderColor: '#36404A',
  },
  bodyTorso: {
    width: 44,
    height: 52,
    backgroundColor: '#1A2530',
    borderWidth: 1,
    borderColor: '#36404A',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  padZoneUpper: {
    position: 'absolute',
    top: 4,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padZoneLower: {
    position: 'absolute',
    bottom: 4,
    left: 3,
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padZoneLabel: {
    fontSize: 8,
    fontWeight: '900',
  },
  bodyLegs: {
    flexDirection: 'row',
    gap: 4,
  },
  bodyLeg: {
    width: 16,
    height: 24,
    backgroundColor: '#1A2530',
    borderWidth: 1,
    borderColor: '#36404A',
    borderRadius: 3,
  },
  padLegend: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  padLegendTitle: {
    fontSize: 7,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1,
    marginBottom: 2,
  },
  padLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  padLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  padLegendText: {
    fontSize: 9,
    fontWeight: '600',
  },
  shockColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 4,
  },
  shockBtnOuter: {
    borderRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  shockButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    gap: 2,
  },
  shockButtonActive: {
    backgroundColor: '#FF6D00',
    borderColor: '#FF9500',
    shadowColor: '#FF6D00',
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 10,
  },
  shockButtonInactive: {
    backgroundColor: '#1C2630',
    borderColor: '#2A3340',
  },
  shockBtnLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  powerBtnWrapper: {
    alignItems: 'center',
    gap: 2,
  },
  powerButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0D1A10',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerBtnLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  deviceBottomRidge: {
    height: 6,
    backgroundColor: '#141A22',
    borderTopWidth: 1,
    borderTopColor: '#2A3340',
  },
});
