import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';

interface VirtualPhoneProps {
  visible: boolean;
  onClose: () => void;
  onCallComplete: () => void;
}

const CALL_CONNECTED_DELAY = 3000;

export function VirtualPhone({ visible, onClose, onCallComplete }: VirtualPhoneProps) {
  const { theme } = useTheme();
  const Colors = getColors(theme);
  const [callState, setCallState] = useState<'dialing' | 'ringing' | 'connected' | 'ended'>('dialing');
  const [callDuration, setCallDuration] = useState(0);
  const [selectedNumber, setSelectedNumber] = useState<'112' | '108'>('112');
  const pulseScale = useSharedValue(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      setCallState('dialing');
      setCallDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
    );

    const dialTimer = setTimeout(() => {
      setCallState('ringing');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, 1000);

    const connectTimer = setTimeout(() => {
      setCallState('connected');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      timerRef.current = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    }, CALL_CONNECTED_DELAY);

    const endTimer = setTimeout(() => {
      setCallState('ended');
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => {
        onCallComplete();
      }, 1200);
    }, 9000);

    return () => {
      clearTimeout(dialTimer);
      clearTimeout(connectTimer);
      clearTimeout(endTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const getStatusText = () => {
    if (callState === 'dialing') return 'Dialling...';
    if (callState === 'ringing') return 'Ringing...';
    if (callState === 'ended') return 'Call Ended';
    return formatTime(callDuration);
  };

  const getSignalBars = () => (
    <View style={styles.signalBars}>
      {[1, 2, 3, 4].map(i => (
        <View key={i} style={[styles.signalBar, { height: 4 + i * 3, opacity: i <= 3 ? 1 : 0.3 }]} />
      ))}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.phone}>
          <View style={styles.phoneStatusBar}>
            <Text style={styles.carrier}>Jio 4G</Text>
            {getSignalBars()}
            <MaterialCommunityIcons name="battery-80" size={16} color="#FFFFFF" />
          </View>

          <View style={styles.phoneHeader}>
            <View style={styles.callerInfo}>
              <View style={[styles.emergencyIcon, { backgroundColor: Colors.accent }]}>
                <MaterialCommunityIcons name="shield-star" size={36} color="#FFFFFF" />
              </View>
              <Text style={styles.callerName}>
                {selectedNumber === '112' ? 'Emergency Services' : 'Ambulance (108)'}
              </Text>
              <Text style={styles.callerNumber}>{selectedNumber}</Text>
              <Text style={styles.callStatus}>{getStatusText()}</Text>
            </View>
          </View>

          {callState === 'connected' && (
            <View style={[styles.connectedBanner, { borderColor: `${Colors.feedbackGood}33` }]}>
              <MaterialCommunityIcons name="check-circle" size={18} color={Colors.feedbackGood} />
              <Text style={[styles.connectedText, { color: Colors.feedbackGood }]}>Call Connected — Help is on the way</Text>
            </View>
          )}

          {callState === 'dialing' && (
            <View style={styles.numberSelector}>
              <Text style={styles.numberSelectorLabel}>Select Emergency Number</Text>
              <View style={styles.numberBtns}>
                {(['112', '108'] as const).map(num => (
                  <Pressable
                    key={num}
                    style={[
                      styles.numberBtn,
                      selectedNumber === num && { borderColor: Colors.accent, backgroundColor: `${Colors.accent}20` },
                    ]}
                    onPress={() => setSelectedNumber(num)}
                  >
                    <Text style={[styles.numberBtnText, selectedNumber === num && { color: Colors.accent }]}>{num}</Text>
                    <Text style={styles.numberBtnDesc}>
                      {num === '112' ? 'National Emergency' : 'Ambulance'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {callState === 'ended' && (
            <View style={styles.endedContainer}>
              <MaterialCommunityIcons name="check-circle" size={40} color={Colors.feedbackGood} />
              <Text style={[styles.endedTitle, { color: Colors.feedbackGood }]}>Call Complete</Text>
              <Text style={styles.endedSubtitle}>Emergency services have been notified</Text>
            </View>
          )}

          <View style={styles.phoneFooter}>
            {callState === 'ended' ? (
              <View style={styles.endedRow}>
                <MaterialCommunityIcons name="check-circle" size={24} color={Colors.feedbackGood} />
                <Text style={[styles.endedText, { color: Colors.feedbackGood }]}>Proceeding to CPR...</Text>
              </View>
            ) : (
              <View style={styles.callControls}>
                <View style={styles.controlBtn}>
                  <MaterialCommunityIcons name="microphone-off" size={22} color="#FFFFFF" />
                  <Text style={styles.controlLabel}>Mute</Text>
                </View>
                <Animated.View style={pulseStyle}>
                  <Pressable
                    style={[styles.endCallBtn, { backgroundColor: Colors.danger }]}
                    onPress={() => {
                      setCallState('ended');
                      if (timerRef.current) clearInterval(timerRef.current);
                      setTimeout(() => onCallComplete(), 800);
                    }}
                  >
                    <MaterialCommunityIcons name="phone-hangup" size={28} color="#FFFFFF" />
                  </Pressable>
                </Animated.View>
                <View style={styles.controlBtn}>
                  <MaterialCommunityIcons name="volume-high" size={22} color="#FFFFFF" />
                  <Text style={styles.controlLabel}>Speaker</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  phone: {
    width: 340,
    maxWidth: '90%',
    backgroundColor: '#1A1A2E',
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333',
  },
  phoneStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#111',
  },
  carrier: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  signalBar: {
    width: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  phoneHeader: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
  },
  callerInfo: {
    alignItems: 'center',
    gap: 6,
  },
  emergencyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  callerName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  callerNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  callStatus: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    marginTop: 4,
  },
  connectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  connectedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  numberSelector: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  numberSelectorLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  numberBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  numberBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 2,
  },
  numberBtnText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  numberBtnDesc: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  endedContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  endedTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  endedSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  phoneFooter: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#111',
  },
  callControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
  },
  controlBtn: {
    alignItems: 'center',
    gap: 4,
    opacity: 0.5,
  },
  controlLabel: {
    fontSize: 11,
    color: '#FFFFFF',
  },
  endCallBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  endedText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
