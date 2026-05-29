import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { type ArduinoConnectionStatus, type ArduinoConnectionMode } from '@/lib/arduino-serial';

const MODE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  usb:       { label: 'USB',       color: '#00C853', bg: 'rgba(0,200,83,0.2)' },
  ble:       { label: 'BLE',       color: '#2196F3', bg: 'rgba(33,150,243,0.2)' },
  tcp:       { label: 'WiFi',      color: '#FF9800', bg: 'rgba(255,152,0,0.2)' },
  webserial: { label: 'SERIAL',    color: '#9C27B0', bg: 'rgba(156,39,176,0.2)' },
  hardware:  { label: 'HW',        color: '#FF6D00', bg: 'rgba(255,109,0,0.2)' },
};

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const MODE_ICON: Record<string, IconName> = {
  usb:       'usb',
  ble:       'bluetooth',
  tcp:       'wifi',
  webserial: 'serial-port',
  hardware:  'lan-connect',
  simulation:'play-circle-outline',
};

interface SensorStatusProps {
  connectionStatus: ArduinoConnectionStatus;
  hardwareOnly?: boolean;
  connectionMode?: ArduinoConnectionMode;
  onConnect: () => void;
  onDisconnect: () => void;
  touchSensors: {
    leftShoulder: boolean;
    rightShoulder: boolean;
    aedPadUpper: boolean;
    aedPadLower: boolean;
  };
}

export function SensorStatus({ connectionStatus, hardwareOnly, connectionMode, onConnect, onDisconnect, touchSensors }: SensorStatusProps) {
  const { theme } = useTheme();
  const Colors = getColors(theme);
  const isConnected = connectionStatus === 'connected';
  const isError = connectionStatus === 'error';
  const badge = connectionMode ? MODE_BADGE[connectionMode] : null;
  const iconName = (connectionMode ? MODE_ICON[connectionMode] : null) || 'usb-flash-drive-outline';

  const modeLabel = connectionMode === 'usb' ? 'USB'
    : connectionMode === 'ble' ? 'Bluetooth'
    : connectionMode === 'tcp' ? 'WiFi/TCP'
    : connectionMode === 'webserial' ? 'Web Serial'
    : connectionMode === 'hardware' ? 'WebSocket'
    : 'Simulation';

  const statusColor = isConnected ? Colors.feedbackGood : isError ? Colors.feedbackBad : Colors.textMuted;
  const statusText = connectionStatus === 'connecting' ? 'Connecting...'
    : isConnected ? `${modeLabel} Connected`
    : isError ? 'Connection Error'
    : 'Connect Arduino';

  const disconnectedBg = theme === 'light' ? 'rgba(10,22,40,0.08)' : Colors.surfaceLight;

  return (
    <View style={styles.container}>
      <Pressable
        style={[
          styles.connectionBtn,
          isConnected ? styles.connectedBtn : isError ? styles.errorBtn : { backgroundColor: disconnectedBg },
        ]}
        onPress={isConnected ? onDisconnect : onConnect}
      >
        <MaterialCommunityIcons
          name={isConnected ? iconName : isError ? 'alert-circle-outline' : 'usb-flash-drive-outline'}
          size={16}
          color={statusColor}
        />
        <Text style={[styles.connectionText, { color: statusColor }]}>
          {statusText}
        </Text>
        {isConnected && badge && (
          <View style={[styles.hwBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.hwBadgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        )}
        {hardwareOnly && !isConnected && !badge && (
          <View style={[styles.hwBadge, { backgroundColor: 'rgba(229,115,26,0.2)' }]}>
            <Text style={[styles.hwBadgeText, { color: Colors.accent }]}>HW</Text>
          </View>
        )}
      </Pressable>

      {isConnected && (
        <View style={styles.sensorRow}>
          <SensorDot label="L Shoulder" active={touchSensors.leftShoulder} Colors={Colors} />
          <SensorDot label="R Shoulder" active={touchSensors.rightShoulder} Colors={Colors} />
          <SensorDot label="AED Upper" active={touchSensors.aedPadUpper} Colors={Colors} />
          <SensorDot label="AED Lower" active={touchSensors.aedPadLower} Colors={Colors} />
        </View>
      )}
    </View>
  );
}

function SensorDot({ label, active, Colors }: { label: string; active: boolean; Colors: ReturnType<typeof getColors> }) {
  return (
    <View style={styles.sensorDot}>
      <View style={[styles.dot, { backgroundColor: active ? Colors.feedbackGood : Colors.surfaceLight }]} />
      <Text style={[styles.sensorLabel, { color: active ? Colors.feedbackGood : Colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  connectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  connectedBtn: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
  },
  errorBtn: {
    backgroundColor: 'rgba(229, 57, 53, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
  },
  hwBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hwBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sensorRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sensorDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sensorLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
