import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, Platform, FlatList, Switch, useWindowDimensions, Alert } from 'react-native';
import { CameraSourcePicker } from '@/components/CameraSourcePicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Colors, { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import {
  arduinoSerial,
  type ArduinoConfig,
  type ArduinoConnectionStatus,
  type SensorInfo,
  type SensorChannel,
  type SensorAssignments,
  type CPRFunction,
  type SerialLogEntry,
  type PreferredConnection,
  CPR_FUNCTION_LABELS,
  CPR_FUNCTION_ICONS,
  CPR_FUNCTION_DESCRIPTIONS,
  DEFAULT_BAUD_RATE,
  ARDUINO_CHANNELS,
  type AvailablePort,
} from '@/lib/arduino-serial';
import type { BleDevice } from '@/lib/ble-serial';
import { videoAssignments, type VideoAssignments } from '@/lib/video-assignments';
import { getBundledVideoList, isBundledKey, bundledLabel } from '@/lib/bundled-videos';
import { CPR_STEPS } from '@/constants/cpr-protocol';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  connectionStatus: ArduinoConnectionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
}

const COMMON_BAUD_RATES = [9600, 14400, 19200, 28800, 38400, 57600, 115200, 250000];

const ARDUINO_BOARDS = [
  { name: 'Arduino Uno', baudRate: 115200, mcu: 'ATmega328P', icon: 'chip' },
  { name: 'Arduino Mega 2560', baudRate: 115200, mcu: 'ATmega2560', icon: 'chip' },
  { name: 'Arduino Nano', baudRate: 115200, mcu: 'ATmega328P', icon: 'chip' },
  { name: 'Arduino Leonardo', baudRate: 115200, mcu: 'ATmega32U4', icon: 'chip' },
  { name: 'Arduino Due', baudRate: 115200, mcu: 'SAM3X8E', icon: 'chip' },
  { name: 'Arduino Micro', baudRate: 115200, mcu: 'ATmega32U4', icon: 'chip' },
  { name: 'Arduino Pro Mini', baudRate: 57600, mcu: 'ATmega328P', icon: 'chip' },
  { name: 'ESP32', baudRate: 115200, mcu: 'ESP32', icon: 'wifi' },
  { name: 'ESP8266 (NodeMCU)', baudRate: 115200, mcu: 'ESP8266', icon: 'wifi' },
  { name: 'Raspberry Pi Pico', baudRate: 115200, mcu: 'RP2040', icon: 'raspberry-pi' },
  { name: 'Teensy 4.0', baudRate: 115200, mcu: 'ARM Cortex-M7', icon: 'chip' },
  { name: 'STM32 (Blue Pill)', baudRate: 115200, mcu: 'STM32F103', icon: 'chip' },
  { name: 'Custom', baudRate: 115200, mcu: 'Custom', icon: 'tune-variant' },
];

const LINE_ENDINGS = [
  { label: 'No line ending', value: '' },
  { label: 'Newline (\\n)', value: '\n' },
  { label: 'Carriage Return (\\r)', value: '\r' },
  { label: 'Both (\\r\\n)', value: '\r\n' },
];

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const CHANNEL_TYPE_ICONS: Record<string, IconName> = {
  i2c_touch: 'gesture-tap',
  ultrasonic: 'signal-distance-variant',
  analog: 'sine-wave',
  digital: 'toggle-switch-outline',
};

function getChannelTypeColors(C: ReturnType<typeof getColors>): Record<string, string> {
  return {
    i2c_touch: C.info,
    ultrasonic: C.accent,
    analog: C.feedbackGood,
    digital: C.warning,
  };
}

const CPR_FUNCTIONS: CPRFunction[] = [
  'leftShoulder',
  'rightShoulder',
  'compressionDepth',
  'compressionForce',
  'breathPressure',
  'aedPadUpper',
  'aedPadLower',
  'neckTilt',
];

let ARDUINO_CODE_CONTENT: string | null = null;

interface ChannelCardProps {
  channel: SensorInfo;
  isConnected: boolean;
  channelIndex: number;
  offset?: number;
  onOffsetChange?: (v: number) => void;
  onCalibrate?: () => void;
}

function ChannelCard({ channel, isConnected, channelIndex, offset, onOffsetChange, onCalibrate }: ChannelCardProps) {
  const { theme } = useTheme();
  const C = getColors(theme);
  const typeIcon = CHANNEL_TYPE_ICONS[channel.type] || 'chip';
  const typeColor = getChannelTypeColors(C)[channel.type] || C.textMuted;
  const isActive = isConnected && channel.active;
  const [inverted, setInverted] = useState(arduinoSerial.getChannelInverted(channelIndex));
  const [offsetInput, setOffsetInput] = useState(offset !== undefined ? String(offset) : '0');
  const [zeroFeedback, setZeroFeedback] = useState(false);
  const showOffset = offset !== undefined && onOffsetChange !== undefined;

  useEffect(() => {
    if (offset !== undefined) {
      setOffsetInput(String(offset));
    }
  }, [offset]);

  const displayValue = () => {
    if (!isConnected) return '--';
    if (typeof channel.currentValue === 'boolean') {
      return channel.currentValue ? 'ON' : 'OFF';
    }
    if (typeof channel.currentValue === 'number') {
      return channel.currentValue > 0 ? channel.currentValue.toFixed(1) : '0';
    }
    return '--';
  };

  const handleInvertToggle = (val: boolean) => {
    setInverted(val);
    arduinoSerial.setChannelInverted(channelIndex, val);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOffsetInput = (text: string) => {
    setOffsetInput(text);
    const num = parseFloat(text);
    if (!isNaN(num) && onOffsetChange) onOffsetChange(num);
  };

  const adjustOffset = (delta: number) => {
    const current = parseFloat(offsetInput) || 0;
    const next = Math.round((current + delta) * 10) / 10;
    setOffsetInput(String(next));
    if (onOffsetChange) onOffsetChange(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCalibrate = () => {
    if (onCalibrate) {
      onCalibrate();
      setZeroFeedback(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setZeroFeedback(false), 1500);
    }
  };

  const rawVal = typeof channel.currentValue === 'number' ? channel.currentValue : 0;
  const adjustedVal = offset !== undefined ? Math.max(0, rawVal - offset) : rawVal;

  return (
    <View style={[styles.sensorCard, { backgroundColor: C.surfaceLight }, isActive && { borderColor: `${C.feedbackGood}40` }]}>
      <View style={styles.sensorCardHeader}>
        <View style={[styles.sensorTypeIcon, { backgroundColor: `${typeColor}20` }]}>
          <MaterialCommunityIcons name={typeIcon} size={18} color={typeColor} />
        </View>
        <View style={styles.sensorCardInfo}>
          <Text style={[styles.sensorName, { color: C.text }]}>{channel.name}</Text>
          <View style={styles.sensorMetaRow}>
            <View style={[styles.sensorTypeBadge, { backgroundColor: `${typeColor}20` }]}>
              <Text style={[styles.sensorTypeText, { color: typeColor }]}>{channel.type.toUpperCase()}</Text>
            </View>
            <Text style={[styles.sensorPin, { color: C.textMuted }]}>Pin: {channel.pin}</Text>
          </View>
        </View>
        <View style={styles.sensorValueContainer}>
          <View style={[styles.statusDot, { backgroundColor: isActive ? C.feedbackGood : C.surfaceLight }]} />
          <Text style={[styles.sensorValue, { color: C.textMuted }, isActive && { color: C.feedbackGood }]}>
            {displayValue()}
          </Text>
          <Text style={[styles.sensorUnit, { color: C.textMuted }]}>{channel.unit}</Text>
        </View>
      </View>
      <Text style={[styles.sensorDescription, { color: C.textSecondary }]}>{channel.description}</Text>
      <View style={styles.invertRow}>
        <View style={styles.invertInfo}>
          <MaterialCommunityIcons name="swap-horizontal" size={14} color={inverted ? C.warning : C.textMuted} />
          <Text style={[styles.invertLabel, { color: C.textMuted }, inverted && { color: C.warning }]}>Invert Output</Text>
        </View>
        <Switch
          value={inverted}
          onValueChange={handleInvertToggle}
          thumbColor={inverted ? C.warning : C.textMuted}
          trackColor={{ false: C.surfaceLight, true: `${C.warning}50` }}
        />
      </View>
      {showOffset && (
        <View style={styles.offsetSection}>
          <View style={styles.offsetHeader}>
            <MaterialCommunityIcons name="tune-vertical" size={13} color={C.info} />
            <Text style={[styles.offsetTitle, { color: C.info }]}>Offset / Zero Calibration</Text>
          </View>
          <View style={styles.offsetControls}>
            <Pressable style={[styles.offsetStepBtn, { backgroundColor: C.surface }]} onPress={() => adjustOffset(-0.5)}>
              <MaterialCommunityIcons name="minus" size={16} color={C.text} />
            </Pressable>
            <TextInput
              style={[styles.offsetInput, { color: C.text, backgroundColor: C.surface, borderColor: C.border }]}
              value={offsetInput}
              onChangeText={handleOffsetInput}
              keyboardType="numeric"
              selectTextOnFocus
            />
            <Pressable style={[styles.offsetStepBtn, { backgroundColor: C.surface }]} onPress={() => adjustOffset(0.5)}>
              <MaterialCommunityIcons name="plus" size={16} color={C.text} />
            </Pressable>
            <Pressable
              style={[styles.offsetZeroBtn, { backgroundColor: zeroFeedback ? `${C.feedbackGood}30` : `${C.accent}20` }]}
              onPress={handleCalibrate}
            >
              <MaterialCommunityIcons
                name={zeroFeedback ? 'check-circle-outline' : 'crosshairs-gps'}
                size={14}
                color={zeroFeedback ? C.feedbackGood : C.accent}
              />
              <Text style={[styles.offsetZeroBtnText, { color: zeroFeedback ? C.feedbackGood : C.accent }]}>
                {zeroFeedback ? 'Zeroed!' : 'Set Zero'}
              </Text>
            </Pressable>
          </View>
          {isConnected && (
            <Text style={[styles.offsetPreview, { color: C.textMuted }]}>
              Raw: {rawVal.toFixed(1)} {channel.unit}{'  →  '}Effective: {adjustedVal.toFixed(1)} {channel.unit}
            </Text>
          )}
        </View>
      )}
      {channel.minValue !== undefined && channel.maxValue !== undefined && isConnected && (
        <View style={styles.sensorRange}>
          <View style={[styles.rangeBarBg, { backgroundColor: C.surfaceLight }]}>
            <View style={[styles.rangeBarFill, {
              width: `${typeof channel.currentValue === 'number' ? Math.min((channel.currentValue / channel.maxValue) * 100, 100) : 0}%`,
              backgroundColor: isActive ? typeColor : C.surfaceLight,
            }]} />
          </View>
          <Text style={[styles.rangeText, { color: C.textMuted }]}>{channel.minValue} - {channel.maxValue} {channel.unit}</Text>
        </View>
      )}
    </View>
  );
}

function AssignmentRow({
  fn,
  assignments,
  channels,
  isConnected,
  onPickerOpen,
}: {
  fn: CPRFunction;
  assignments: SensorAssignments;
  channels: SensorChannel[];
  isConnected: boolean;
  onPickerOpen: (fn: CPRFunction) => void;
}) {
  const { theme } = useTheme();
  const C = getColors(theme);
  const assignedIndex = assignments[fn];
  const assignedChannel = assignedIndex !== null ? channels.find(c => c.index === assignedIndex) : null;
  const icon = CPR_FUNCTION_ICONS[fn];
  const liveValue = assignedChannel ? assignedChannel.currentValue : 0;
  const isActive = isConnected && assignedChannel && liveValue > 0;

  return (
    <Pressable style={[styles.assignmentRow, { backgroundColor: C.surfaceLight }, isActive && { borderColor: `${C.feedbackGood}40` }]} onPress={() => onPickerOpen(fn)}>
      <View style={styles.assignmentLeft}>
        <View style={[styles.assignmentIcon, { backgroundColor: `${C.textMuted}20` }, isActive && { backgroundColor: `${C.feedbackGood}20` }]}>
          <MaterialCommunityIcons name={icon as IconName} size={18} color={isActive ? C.feedbackGood : C.textMuted} />
        </View>
        <View style={styles.assignmentInfo}>
          <Text style={[styles.assignmentLabel, { color: C.text }]}>{CPR_FUNCTION_LABELS[fn]}</Text>
          <Text style={[styles.assignmentDesc, { color: C.textMuted }]}>{CPR_FUNCTION_DESCRIPTIONS[fn]}</Text>
        </View>
      </View>
      <View style={styles.assignmentRight}>
        {isConnected && assignedChannel && (
          <Text style={[styles.assignmentLiveValue, { color: C.textMuted }, isActive && { color: C.feedbackGood }]}>
            {liveValue > 0 ? (typeof liveValue === 'number' && liveValue % 1 !== 0 ? liveValue.toFixed(1) : liveValue) : '0'}
          </Text>
        )}
        <View style={[styles.channelPickerBtn, { backgroundColor: C.surface }]}>
          <Text style={[styles.channelPickerText, { color: C.textSecondary }]} numberOfLines={1}>
            {assignedChannel ? `CH${assignedIndex}: ${assignedChannel.name}` : 'Not assigned'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={16} color={C.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

function ChannelPickerModal({
  visible,
  onClose,
  fn,
  channels,
  currentIndex,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  fn: CPRFunction | null;
  channels: SensorChannel[];
  currentIndex: number | null;
  onSelect: (fn: CPRFunction, channelIndex: number | null) => void;
}) {
  const { theme } = useTheme();
  const C = getColors(theme);
  if (!fn) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.pickerOverlay} onPress={onClose}>
        <Pressable style={[styles.pickerModal, { backgroundColor: C.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: C.text }]}>Assign Channel</Text>
            <Text style={[styles.pickerSubtitle, { color: C.textSecondary }]}>{CPR_FUNCTION_LABELS[fn]}</Text>
          </View>
          <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
            <Pressable
              style={[styles.pickerOption, { backgroundColor: C.surfaceLight }, currentIndex === null && { backgroundColor: `${C.accent}20` }]}
              onPress={() => { onSelect(fn, null); onClose(); }}
            >
              <MaterialCommunityIcons name="close-circle-outline" size={20} color={C.textMuted} />
              <Text style={[styles.pickerOptionText, { color: C.text }, currentIndex === null && { color: C.accent }]}>
                Not Assigned
              </Text>
            </Pressable>
            {channels.map((ch) => {
              const isSelected = currentIndex === ch.index;
              const typeColor = getChannelTypeColors(C)[ch.type] || C.textMuted;
              const typeIcon = CHANNEL_TYPE_ICONS[ch.type] || 'chip';
              return (
                <Pressable
                  key={ch.index}
                  style={[styles.pickerOption, { backgroundColor: C.surfaceLight }, isSelected && { backgroundColor: `${C.accent}20` }]}
                  onPress={() => {
                    onSelect(fn, ch.index);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onClose();
                  }}
                >
                  <View style={[styles.pickerOptionIcon, { backgroundColor: `${typeColor}20` }]}>
                    <MaterialCommunityIcons name={typeIcon} size={16} color={typeColor} />
                  </View>
                  <View style={styles.pickerOptionInfo}>
                    <Text style={[styles.pickerOptionText, { color: C.text }, isSelected && { color: C.accent }]}>
                      CH{ch.index}: {ch.name}
                    </Text>
                    <Text style={[styles.pickerOptionMeta, { color: C.textMuted }]}>{ch.type.toUpperCase()} | {ch.pin}</Text>
                  </View>
                  {isSelected && (
                    <MaterialCommunityIcons name="check-circle" size={20} color={C.feedbackGood} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function SerialMonitorTab({ isConnected }: { isConnected: boolean }) {
  const { theme } = useTheme();
  const C = getColors(theme);
  const [serialLines, setSerialLines] = useState<SerialLogEntry[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [lineEnding, setLineEnding] = useState('\n');
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [arduinoCode, setArduinoCode] = useState<string | null>(ARDUINO_CODE_CONTENT);
  const [showLineEndingPicker, setShowLineEndingPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!arduinoCode) {
      fetch('/attached_assets/final_arduino_code_1771601973155.ino')
        .then(r => r.ok ? r.text() : null)
        .catch(() => null)
        .then(text => {
          if (text) {
            ARDUINO_CODE_CONTENT = text;
            setArduinoCode(text);
          }
        });
    }
  }, []);

  useEffect(() => {
    const existing = arduinoSerial.getSerialLog();
    setSerialLines(existing.slice(-200));

    const unsub = arduinoSerial.onSerialLine((entry) => {
      if (!pausedRef.current) {
        setSerialLines(prev => {
          const next = [...prev, entry];
          return next.length > 200 ? next.slice(-200) : next;
        });
      }
    });

    return unsub;
  }, []);

  useEffect(() => {
    if (autoScroll && flatListRef.current && serialLines.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 50);
    }
  }, [serialLines.length, autoScroll]);

  const handleSend = () => {
    if (!commandInput.trim()) return;
    arduinoSerial.sendCommand(commandInput, lineEnding);
    setCommandInput('');
  };

  const handleClear = () => {
    arduinoSerial.clearSerialLog();
    setSerialLines([]);
  };

  const renderSerialLine = useCallback(({ item }: { item: SerialLogEntry }) => (
    <View style={[styles.serialLine, item.direction === 'tx' && styles.serialLineTx]}>
      <Text style={[styles.serialTimestamp, { color: C.textMuted }]}>{formatTimestamp(item.timestamp)}</Text>
      <Text style={[styles.serialDirection, { color: C.textSecondary }]}>{item.direction === 'tx' ? 'TX' : 'RX'}</Text>
      <Text style={[styles.serialText, { color: C.text }, item.direction === 'tx' && { color: C.info }]} numberOfLines={1}>
        {item.line}
      </Text>
    </View>
  ), [C]);

  const keyExtractor = useCallback((item: SerialLogEntry, index: number) =>
    `${item.timestamp}-${index}`, []);

  const currentLineEnding = LINE_ENDINGS.find(le => le.value === lineEnding);

  if (showCode) {
    return (
      <View style={{ flex: 1 }}>
        <View style={[styles.serialToolbar, { backgroundColor: C.surfaceLight }]}>
          <Pressable style={[styles.serialToolBtn, { backgroundColor: `${C.accent}20` }]} onPress={() => setShowCode(false)}>
            <MaterialCommunityIcons name="console" size={14} color={C.text} />
            <Text style={[styles.serialToolText, { color: C.text }]}>Monitor</Text>
          </Pressable>
          <Pressable style={styles.serialToolBtn} onPress={() => setShowCode(true)}>
            <MaterialCommunityIcons name="code-tags" size={14} color={C.accent} />
            <Text style={[styles.serialToolText, { color: C.accent }]}>Arduino Code</Text>
          </Pressable>
        </View>
        <ScrollView style={[styles.codeContainer, { backgroundColor: C.surfaceLight }]} showsVerticalScrollIndicator>
          <Text style={[styles.codeText, { color: C.text }]}>{arduinoCode || 'Arduino code file not found.'}</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.serialToolbar, { backgroundColor: C.surfaceLight }]}>
        <Pressable style={[styles.serialToolBtn, !showCode && { backgroundColor: `${C.accent}20` }]} onPress={() => setShowCode(false)}>
          <MaterialCommunityIcons name="console" size={14} color={!showCode ? C.accent : C.textMuted} />
          <Text style={[styles.serialToolText, { color: C.textMuted }, !showCode && { color: C.accent }]}>Monitor</Text>
        </Pressable>
        {arduinoCode && (
          <Pressable style={styles.serialToolBtn} onPress={() => setShowCode(true)}>
            <MaterialCommunityIcons name="code-tags" size={14} color={C.textMuted} />
            <Text style={[styles.serialToolText, { color: C.textMuted }]}>Arduino Code</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable
          style={[styles.serialToolBtn, paused && { backgroundColor: C.warning + '30' }]}
          onPress={() => setPaused(!paused)}
        >
          <MaterialCommunityIcons name={paused ? 'play' : 'pause'} size={14} color={paused ? C.warning : C.textMuted} />
        </Pressable>
        <Pressable
          style={[styles.serialToolBtn, autoScroll && { backgroundColor: C.info + '20' }]}
          onPress={() => setAutoScroll(!autoScroll)}
        >
          <MaterialCommunityIcons name="arrow-collapse-down" size={14} color={autoScroll ? C.info : C.textMuted} />
        </Pressable>
        <Pressable style={styles.serialToolBtn} onPress={handleClear}>
          <MaterialCommunityIcons name="delete-outline" size={14} color={C.textMuted} />
        </Pressable>
        <Text style={[styles.lineCountText, { color: C.textMuted }]}>{serialLines.length} lines</Text>
      </View>

      <View style={styles.serialOutput}>
        {serialLines.length === 0 ? (
          <View style={styles.serialEmpty}>
            <MaterialCommunityIcons name="console" size={40} color={C.surfaceHighlight} />
            <Text style={[styles.serialEmptyText, { color: C.textMuted }]}>
              {isConnected ? 'Waiting for serial data...' : 'Connect to see serial output'}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={serialLines}
            renderItem={renderSerialLine}
            keyExtractor={keyExtractor}
            style={styles.serialList}
            initialNumToRender={50}
            maxToRenderPerBatch={30}
            windowSize={10}
            getItemLayout={(_, index) => ({ length: 24, offset: 24 * index, index })}
          />
        )}
      </View>

      <View style={[styles.serialInputRow, { backgroundColor: C.surfaceLight }]}>
        <TextInput
          style={[styles.serialInput, { color: C.text, backgroundColor: C.surface }]}
          value={commandInput}
          onChangeText={setCommandInput}
          placeholder="Send command..."
          placeholderTextColor={C.textMuted}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable style={[styles.lineEndingBtn, { backgroundColor: C.surface }]} onPress={() => setShowLineEndingPicker(!showLineEndingPicker)}>
          <Text style={[styles.lineEndingText, { color: C.textSecondary }]} numberOfLines={1}>{currentLineEnding?.label || 'NL'}</Text>
          <MaterialCommunityIcons name="chevron-down" size={12} color={C.textMuted} />
        </Pressable>
        <Pressable style={[styles.sendBtn, { backgroundColor: C.accent }]} onPress={handleSend}>
          <MaterialCommunityIcons name="send" size={18} color={C.text} />
        </Pressable>
      </View>

      {showLineEndingPicker && (
        <View style={[styles.lineEndingDropdown, { backgroundColor: C.surface }]}>
          {LINE_ENDINGS.map((le) => (
            <Pressable
              key={le.value}
              style={[styles.lineEndingOption, lineEnding === le.value && { backgroundColor: `${C.accent}20` }]}
              onPress={() => {
                setLineEnding(le.value);
                setShowLineEndingPicker(false);
              }}
            >
              <Text style={[styles.lineEndingOptionText, { color: C.textSecondary }, lineEnding === le.value && { color: C.accent }]}>
                {le.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function SettingsModal({ visible, onClose, connectionStatus, onConnect, onDisconnect }: SettingsModalProps) {
  const { theme } = useTheme();
  const C = getColors(theme);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isNarrow = screenWidth < 600;
  const isPortrait = screenHeight > screenWidth;

  const [config, setConfig] = useState<ArduinoConfig>(arduinoSerial.getConfig());
  const [baudInput, setBaudInput] = useState(config.baudRate.toString());
  const [sensors, setSensors] = useState<SensorInfo[]>(arduinoSerial.getSensorDirectory());
  const [channels, setChannels] = useState<SensorChannel[]>(arduinoSerial.getChannels());
  const [assignments, setAssignments] = useState<SensorAssignments>(arduinoSerial.getAssignments());
  const [activeTab, setActiveTab] = useState<'connection' | 'assignments' | 'sensors' | 'monitor' | 'videos'>('connection');
  const [pickerFn, setPickerFn] = useState<CPRFunction | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<string>('Arduino Uno');
  const [showBoardPicker, setShowBoardPicker] = useState(false);
  const [availablePorts, setAvailablePorts] = useState<AvailablePort[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const [usbDevices, setUsbDevices] = useState<any[]>([]);
  const [loadingUsb, setLoadingUsb] = useState(false);
  const [hardwareOnly, setHardwareOnly] = useState(arduinoSerial.getHardwareOnly());
  const [channelInverts, setChannelInverts] = useState<boolean[]>(arduinoSerial.getChannelInverts());
  const [ultrasonicOffset, setUltrasonicOffset] = useState(arduinoSerial.getUltrasonicOffset());
  const [breathOffset, setBreathOffset] = useState(arduinoSerial.getBreathOffset());
  const [videos, setVideos] = useState<VideoAssignments>(videoAssignments.getAll());
  const [bundledPickerStep, setBundledPickerStep] = useState<string | null>(null);
  const sensorPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [connectionMode, setConnectionMode] = useState(arduinoSerial.getMode());
  const [preferredConnection, setPreferredConnection] = useState<PreferredConnection>(arduinoSerial.getPreferredConnection());
  const [bleDevices, setBleDevices] = useState<BleDevice[]>(arduinoSerial.getBleDevices());
  const [loadingBle, setLoadingBle] = useState(false);
  const [selectedBleId, setSelectedBleId] = useState<string | null>(null);
  const [tcpConfig, setTcpConfig] = useState(arduinoSerial.getTcpConfig());
  const isConnected = connectionStatus === 'connected';

  useEffect(() => {
    if (!visible) return;

    const unsubConfig = arduinoSerial.onConfigChange((newConfig) => {
      setConfig(newConfig);
      setBaudInput(newConfig.baudRate.toString());
    });

    const unsubAssign = arduinoSerial.onAssignmentChange((newAssignments) => {
      setAssignments(newAssignments);
    });

    const unsubHwOnly = arduinoSerial.onHardwareOnlyChange((val) => {
      setHardwareOnly(val);
    });

    const unsubMode = arduinoSerial.onModeChange((mode) => {
      setConnectionMode(mode);
    });

    const unsubInvert = arduinoSerial.onInvertChange((inverts) => {
      setChannelInverts([...inverts]);
    });

    const unsubOffset = arduinoSerial.onOffsetChange((uOffset, bOffset) => {
      setUltrasonicOffset(uOffset);
      setBreathOffset(bOffset);
    });

    const unsubVideos = videoAssignments.onChange((newVideos) => {
      setVideos({ ...newVideos });
    });

    videoAssignments.load().then(loaded => setVideos({ ...loaded }));

    if (isConnected) {
      sensorPollRef.current = setInterval(() => {
        setSensors(arduinoSerial.getSensorDirectory());
        setChannels(arduinoSerial.getChannels());
      }, 200);
    }

    refreshPorts();
    refreshUsbDevices();

    return () => {
      unsubConfig();
      unsubAssign();
      unsubHwOnly();
      unsubMode();
      unsubInvert();
      unsubOffset();
      unsubVideos();
      if (sensorPollRef.current) {
        clearInterval(sensorPollRef.current);
        sensorPollRef.current = null;
      }
    };
  }, [visible, isConnected]);

  const refreshPorts = async () => {
    setLoadingPorts(true);
    try {
      const ports = arduinoSerial.getAvailablePorts();
      setAvailablePorts(ports);
      const baseUrl = Platform.OS === 'web'
        ? window.location.origin.replace(':8081', ':5000')
        : 'http://localhost:5000';
      const res = await fetch(`${baseUrl}/api/arduino/ports`);
      if (res.ok) {
        const data = await res.json();
        if (data.ports) setAvailablePorts(data.ports);
      }
    } catch {}
    setLoadingPorts(false);
  };

  const refreshUsbDevices = async () => {
    if (!arduinoSerial.isUsbAvailable()) return;
    setLoadingUsb(true);
    try {
      const devices = await arduinoSerial.refreshUsbDevices();
      setUsbDevices(devices);
    } catch {}
    setLoadingUsb(false);
  };

  const scanBleDevices = async () => {
    if (!arduinoSerial.isBleAvailable()) return;
    setLoadingBle(true);
    try {
      const devices = await arduinoSerial.scanBleDevices(5000);
      setBleDevices(devices);
    } catch {}
    setLoadingBle(false);
  };

  const handlePreferredConnection = (pref: PreferredConnection) => {
    setPreferredConnection(pref);
    arduinoSerial.setPreferredConnection(pref);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleTcpHostChange = (host: string) => {
    const updated = { ...tcpConfig, host };
    setTcpConfig(updated);
    arduinoSerial.setTcpConfig({ host });
  };

  const handleTcpPortChange = (text: string) => {
    const port = parseInt(text, 10);
    if (!isNaN(port)) {
      const updated = { ...tcpConfig, port };
      setTcpConfig(updated);
      arduinoSerial.setTcpConfig({ port });
    }
  };

  const handleBaudRateChange = (text: string) => {
    setBaudInput(text);
    const num = parseInt(text, 10);
    if (!isNaN(num) && num > 0) {
      arduinoSerial.setBaudRate(num);
    }
  };

  const handleSelectBaudRate = (rate: number) => {
    setBaudInput(rate.toString());
    arduinoSerial.setBaudRate(rate);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePortChange = (text: string) => {
    arduinoSerial.setConfig({ port: text });
  };

  const handleSelectPort = (path: string) => {
    arduinoSerial.setConfig({ port: path });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectBoard = (boardName: string) => {
    setSelectedBoard(boardName);
    const board = ARDUINO_BOARDS.find(b => b.name === boardName);
    if (board && board.name !== 'Custom') {
      handleSelectBaudRate(board.baudRate);
    }
    setShowBoardPicker(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAssignmentSelect = (fn: CPRFunction, channelIndex: number | null) => {
    arduinoSerial.setAssignment(fn, channelIndex);
  };

  const openPicker = (fn: CPRFunction) => {
    setPickerFn(fn);
    setPickerVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const i2cTouchCount = sensors.filter(s => s.type === 'i2c_touch').length;
  const digitalCount = sensors.filter(s => s.type === 'digital').length;
  const analogCount = sensors.filter(s => s.type === 'analog' || s.type === 'ultrasonic').length;
  const activeSensorCount = sensors.filter(s => s.active).length;
  const currentBoard = ARDUINO_BOARDS.find(b => b.name === selectedBoard);

  const isLargeTablet = screenWidth >= 900;
  const modalStyle = isNarrow
    ? { width: '100%' as const, height: '100%' as const, borderRadius: 0, maxWidth: undefined as undefined, maxHeight: undefined as undefined }
    : isLargeTablet
      ? { width: '92%' as const, maxWidth: 820, maxHeight: '92%' as const, minHeight: 520 }
      : { width: '92%' as const, maxWidth: 700, maxHeight: '92%' as const, minHeight: 480 };

  return (
    <Modal visible={visible} transparent animationType={isNarrow ? 'slide' : 'fade'} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom || 16, backgroundColor: C.primary }, modalStyle]}>
          <View style={[styles.modalHeader, { backgroundColor: C.surface, borderBottomColor: C.border }, Platform.OS === 'web' && { paddingTop: isNarrow ? 67 + 8 : 18 }]}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="cog" size={22} color={C.accent} />
              <Text style={[styles.modalTitle, { color: C.text }]}>Settings</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color={C.text} />
            </Pressable>
          </View>

          <View style={[styles.tabBar, { borderBottomColor: C.border }, !isNarrow && { padding: 4 }]}>
            {[
              { id: 'connection' as const, icon: 'usb' as IconName, label: 'Connect' },
              { id: 'assignments' as const, icon: 'swap-horizontal' as IconName, label: 'Assign' },
              { id: 'sensors' as const, icon: 'chip' as IconName, label: 'Channels' },
              { id: 'videos' as const, icon: 'play-circle-outline' as IconName, label: 'Videos' },
              { id: 'monitor' as const, icon: 'console' as IconName, label: 'Serial' },
            ].map(tab => (
              <Pressable
                key={tab.id}
                style={[styles.tab, !isNarrow && { paddingVertical: 10 }, activeTab === tab.id && [styles.tabActive, { borderBottomColor: C.accent }]]}
                onPress={() => setActiveTab(tab.id)}
              >
                <MaterialCommunityIcons name={tab.icon} size={16} color={activeTab === tab.id ? C.accent : C.textMuted} />
                <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]} numberOfLines={1}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>

          {activeTab === 'monitor' ? (
            <SerialMonitorTab isConnected={isConnected} />
          ) : activeTab === 'videos' ? (
            <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
              <View style={styles.assignmentHeader}>
                <MaterialCommunityIcons name="information-outline" size={16} color={Colors.info} />
                <Text style={styles.assignmentHeaderText}>
                  Assign a video to each CPR step. During training, the video plays above the step instructions.
                  {' Tap '}
                  <Text style={{ fontWeight: '700' }}>Bundled</Text>
                  {' to use an MP4 from assets/videos/, or '}
                  {Platform.OS === 'web' ? 'paste a URL.' : 'tap Gallery to pick from your device.'}
                </Text>
              </View>
              <View style={styles.section}>
                {(() => {
                  return CPR_STEPS.map((step) => {
                  const uri = videos[step.id];
                  const filename = uri
                    ? isBundledKey(uri)
                      ? bundledLabel(uri.slice('bundled:'.length))
                      : uri.split('/').pop()?.split('?')[0] ?? uri
                    : null;
                  return (
                    <View key={step.id} style={styles.videoRow}>
                      <View style={styles.videoRowInfo}>
                        <Text style={styles.videoRowTitle}>{step.number}. {step.title}</Text>
                        {filename ? (
                          <View style={styles.videoRowFilenameRow}>
                            {uri && isBundledKey(uri) && (
                              <MaterialCommunityIcons name="package-variant-closed" size={11} color={C.accent} />
                            )}
                            <Text style={styles.videoRowUri} numberOfLines={1}>{filename}</Text>
                          </View>
                        ) : (
                          <Text style={styles.videoRowEmpty}>No video assigned</Text>
                        )}
                      </View>
                      <View style={styles.videoRowActions}>
                        {/* Bundled video picker — always available */}
                        <Pressable
                          style={[styles.videoAssignBtn, { backgroundColor: `${C.accent}22` }]}
                          onPress={() => setBundledPickerStep(step.id)}
                        >
                          <MaterialCommunityIcons name="package-variant-closed" size={14} color={C.accent} />
                          <Text style={[styles.videoAssignBtnText, { color: C.accent }]}>Bundled</Text>
                        </Pressable>

                        {/* Gallery picker (Android/iOS) or URL input (web) */}
                        {Platform.OS === 'web' ? (
                          <TextInput
                            style={styles.videoUrlInput}
                            value={uri && !isBundledKey(uri) ? uri : ''}
                            onChangeText={async (text) => {
                              if (text.trim()) {
                                await videoAssignments.set(step.id, text.trim());
                              } else {
                                await videoAssignments.remove(step.id);
                              }
                            }}
                            placeholder="or paste URL…"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="url"
                            autoCapitalize="none"
                          />
                        ) : (
                          <Pressable
                            style={styles.videoAssignBtn}
                            onPress={async () => {
                              try {
                                const result = await ImagePicker.launchImageLibraryAsync({
                                  mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                                  allowsEditing: false,
                                  quality: 1,
                                });
                                if (!result.canceled && result.assets[0]) {
                                  await videoAssignments.set(step.id, result.assets[0].uri);
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                              } catch {
                                Alert.alert('Error', 'Could not open video picker.');
                              }
                            }}
                          >
                            <MaterialCommunityIcons name="image-multiple-outline" size={14} color={Colors.text} />
                            <Text style={styles.videoAssignBtnText}>Gallery</Text>
                          </Pressable>
                        )}

                        {uri && (
                          <Pressable
                            style={styles.videoRemoveBtn}
                            onPress={async () => {
                              await videoAssignments.remove(step.id);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                          >
                            <MaterialCommunityIcons name="close" size={14} color={Colors.feedbackBad} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                  });
                })()}
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
              {activeTab === 'connection' ? (
                <>
                  <View style={styles.section}>
                    <View style={styles.hardwareOnlyRow}>
                      <View style={styles.hardwareOnlyInfo}>
                        <View style={styles.hardwareOnlyHeader}>
                          <MaterialCommunityIcons name="chip" size={18} color={hardwareOnly ? C.accent : C.textMuted} />
                          <Text style={styles.hardwareOnlyLabel}>Hardware Only Mode</Text>
                        </View>
                        <Text style={styles.hardwareOnlyDesc}>
                          {hardwareOnly
                            ? 'All inputs from physical Arduino only'
                            : 'Simulation fallback enabled when hardware unavailable'}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.toggleTrack, hardwareOnly && styles.toggleTrackActive]}
                        onPress={() => {
                          const next = !hardwareOnly;
                          arduinoSerial.setHardwareOnly(next);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        }}
                      >
                        <View style={[styles.toggleThumb, hardwareOnly && styles.toggleThumbActive]} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Connection Status</Text>
                    <View style={[styles.statusCard, isNarrow && { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: isNarrow ? undefined : 1 }}>
                        <View style={[styles.bigStatusDot, {
                          backgroundColor: isConnected ? C.feedbackGood : connectionStatus === 'connecting' ? C.warning : connectionStatus === 'error' ? C.feedbackBad : C.textMuted,
                        }]} />
                        <View style={[styles.statusInfo, { flex: 1 }]}>
                          <Text style={styles.statusLabel}>
                            {isConnected ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : connectionStatus === 'error' ? 'Connection Failed' : 'Disconnected'}
                          </Text>
                          <Text style={styles.statusDetail}>
                            {isConnected
                              ? `${connectionMode === 'usb' ? 'USB OTG' : connectionMode === 'ble' ? 'Bluetooth LE' : connectionMode === 'tcp' ? 'WiFi/TCP' : connectionMode === 'webserial' ? 'Web Serial' : 'WebSocket'} | ${config.baudRate} baud`
                              : connectionStatus === 'error'
                                ? (hardwareOnly ? `Hardware-only mode — connect via ${preferredConnection === 'auto' ? 'USB/BLE/TCP' : preferredConnection}` : 'No device found')
                                : 'No device detected'}
                          </Text>
                        </View>
                      </View>
                      <Pressable
                        style={[styles.connectActionBtn, isConnected ? styles.disconnectBtn : styles.connectBtn2]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          isConnected ? onDisconnect() : onConnect();
                        }}
                      >
                        <MaterialCommunityIcons
                          name={isConnected ? 'usb-flash-drive-outline' : 'usb'}
                          size={18}
                          color={C.text}
                        />
                        <Text style={styles.connectActionText}>{isConnected ? 'Disconnect' : 'Connect'}</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Connection Type</Text>
                    <View style={styles.connTypeGrid}>
                      {([
                        { key: 'auto',      label: 'Auto',      icon: 'auto-fix',        desc: 'USB → BLE → WiFi → WS' },
                        { key: 'usb',       label: 'USB OTG',   icon: 'usb',             desc: 'Direct Android USB' },
                        { key: 'ble',       label: 'Bluetooth', icon: 'bluetooth',        desc: 'BLE serial module' },
                        { key: 'tcp',       label: 'WiFi/TCP',  icon: 'wifi',             desc: 'ESP32 or network' },
                        { key: 'webserial', label: 'Web Serial',icon: 'serial-port',      desc: 'Chrome browser USB' },
                        { key: 'websocket', label: 'WebSocket', icon: 'lan-connect',      desc: 'Via backend server' },
                      ] as { key: PreferredConnection; label: string; icon: IconName; desc: string }[]).map(opt => (
                        <Pressable
                          key={opt.key}
                          style={[styles.connTypeBtn, preferredConnection === opt.key && styles.connTypeBtnActive]}
                          onPress={() => handlePreferredConnection(opt.key)}
                        >
                          <MaterialCommunityIcons name={opt.icon} size={20} color={preferredConnection === opt.key ? C.accent : C.textMuted} />
                          <Text style={[styles.connTypeLabel, preferredConnection === opt.key && { color: C.accent }]}>{opt.label}</Text>
                          <Text style={styles.connTypeDesc}>{opt.desc}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {(preferredConnection === 'ble' || preferredConnection === 'auto') && arduinoSerial.isBleAvailable() && (
                    <View style={styles.section}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.sectionTitle}>Bluetooth Devices</Text>
                        <Pressable style={styles.refreshBtn} onPress={scanBleDevices}>
                          <MaterialCommunityIcons name={loadingBle ? 'loading' : 'bluetooth'} size={16} color={C.info} />
                          <Text style={[styles.refreshBtnText, { color: C.info }]}>{loadingBle ? 'Scanning...' : 'Scan'}</Text>
                        </Pressable>
                      </View>
                      {bleDevices.length > 0 ? (
                        <View style={styles.portList}>
                          {bleDevices.map(dev => (
                            <Pressable
                              key={dev.id}
                              style={[styles.portItem, selectedBleId === dev.id && styles.portItemActive]}
                              onPress={() => {
                                setSelectedBleId(dev.id);
                                arduinoSerial.selectBleDevice(dev.id);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                            >
                              <MaterialCommunityIcons name="bluetooth" size={16} color={selectedBleId === dev.id ? C.info : C.textMuted} />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.portPath, selectedBleId === dev.id && { color: C.info }]}>{dev.name}</Text>
                                <Text style={styles.portMfg}>RSSI: {dev.rssi} dBm | {dev.id.slice(0, 17)}</Text>
                              </View>
                              {selectedBleId === dev.id && <MaterialCommunityIcons name="check-circle" size={14} color={C.info} />}
                            </Pressable>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.noPortsCard}>
                          <MaterialCommunityIcons name="bluetooth-off" size={20} color={C.textMuted} />
                          <Text style={styles.noPortsText}>No BLE devices found. Tap Scan to search (HC-05, HM-10, ESP32 BLE).</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {(preferredConnection === 'tcp' || preferredConnection === 'auto') && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>WiFi / TCP Connection</Text>
                      <View style={styles.tcpRow}>
                        <View style={{ flex: 2 }}>
                          <Text style={styles.inputLabel}>IP Address</Text>
                          <TextInput
                            style={styles.portInput}
                            value={tcpConfig.host}
                            onChangeText={handleTcpHostChange}
                            placeholder="192.168.1.100"
                            placeholderTextColor={C.textMuted}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.inputLabel}>Port</Text>
                          <TextInput
                            style={styles.portInput}
                            value={tcpConfig.port.toString()}
                            onChangeText={handleTcpPortChange}
                            placeholder="23"
                            placeholderTextColor={C.textMuted}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                      <Text style={[styles.portMfg, { marginTop: 6 }]}>
                        Use for ESP32/ESP8266 with WiFi, or any Arduino with Ethernet shield using a TCP socket server.
                      </Text>
                    </View>
                  )}

                  {preferredConnection === 'webserial' && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Web Serial (Chrome)</Text>
                      <View style={styles.noPortsCard}>
                        <MaterialCommunityIcons name="google-chrome" size={20} color={C.textMuted} />
                        <Text style={styles.noPortsText}>
                          Web Serial connects Chrome to a USB Arduino directly. Click Connect and Chrome will show a port picker.
                          {!arduinoSerial.isWebSerialAvailable() ? '\n\nNot available in this browser — use Chrome on desktop.' : '\n\nWeb Serial API is available.'}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Arduino Board</Text>
                    <Pressable style={styles.boardSelector} onPress={() => setShowBoardPicker(!showBoardPicker)}>
                      <MaterialCommunityIcons name={(currentBoard?.icon || 'chip') as IconName} size={20} color={C.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.boardName}>{selectedBoard}</Text>
                        <Text style={styles.boardMcu}>{currentBoard?.mcu || ''} | {config.baudRate} baud</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-down" size={18} color={C.textMuted} />
                    </Pressable>
                    {showBoardPicker && (
                      <View style={styles.boardList}>
                        {ARDUINO_BOARDS.map(board => (
                          <Pressable
                            key={board.name}
                            style={[styles.boardOption, selectedBoard === board.name && styles.boardOptionActive]}
                            onPress={() => handleSelectBoard(board.name)}
                          >
                            <MaterialCommunityIcons name={board.icon as IconName} size={16} color={selectedBoard === board.name ? C.accent : C.textMuted} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.boardOptionName, selectedBoard === board.name && { color: C.accent }]}>{board.name}</Text>
                              <Text style={styles.boardOptionMeta}>{board.mcu} | {board.baudRate} baud</Text>
                            </View>
                            {selectedBoard === board.name && (
                              <MaterialCommunityIcons name="check" size={16} color={C.feedbackGood} />
                            )}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                  {arduinoSerial.isUsbAvailable() && (
                    <View style={styles.section}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.sectionTitle}>USB Devices (OTG)</Text>
                        <Pressable style={styles.refreshBtn} onPress={refreshUsbDevices}>
                          <MaterialCommunityIcons name={loadingUsb ? 'loading' : 'refresh'} size={16} color={C.accent} />
                          <Text style={styles.refreshBtnText}>Scan</Text>
                        </Pressable>
                      </View>
                      {usbDevices.length > 0 ? (
                        <View style={styles.portList}>
                          {usbDevices.map((dev) => (
                            <Pressable
                              key={dev.deviceId}
                              style={[styles.portItem, connectionMode === 'usb' && styles.portItemActive]}
                              onPress={() => {
                                arduinoSerial.selectUsbDevice(dev.deviceId);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                            >
                              <MaterialCommunityIcons name="usb" size={16} color={connectionMode === 'usb' ? C.feedbackGood : C.accent} />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.portPath, connectionMode === 'usb' && { color: C.feedbackGood }]}>{dev.name}</Text>
                                <Text style={styles.portMfg}>ID: {dev.deviceId} | VID: 0x{dev.vendorId.toString(16).toUpperCase()} PID: 0x{dev.productId.toString(16).toUpperCase()}</Text>
                              </View>
                              {connectionMode === 'usb' && (
                                <MaterialCommunityIcons name="check-circle" size={14} color={C.feedbackGood} />
                              )}
                            </Pressable>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.noPortsCard}>
                          <MaterialCommunityIcons name="usb-flash-drive-outline" size={20} color={C.textMuted} />
                          <Text style={styles.noPortsText}>No USB devices detected. Connect Arduino via OTG cable.</Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.section}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.sectionTitle}>Serial Ports (Server)</Text>
                      <Pressable style={styles.refreshBtn} onPress={refreshPorts}>
                        <MaterialCommunityIcons name={loadingPorts ? 'loading' : 'refresh'} size={16} color={C.accent} />
                        <Text style={styles.refreshBtnText}>Refresh</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      style={styles.portInput}
                      value={config.port}
                      onChangeText={handlePortChange}
                      placeholder="/dev/ttyUSB0"
                      placeholderTextColor={C.textMuted}
                    />
                    {availablePorts.length > 0 ? (
                      <View style={styles.portList}>
                        {availablePorts.map((port) => (
                          <Pressable
                            key={port.path}
                            style={[styles.portItem, config.port === port.path && styles.portItemActive]}
                            onPress={() => handleSelectPort(port.path)}
                          >
                            <MaterialCommunityIcons name="serial-port" size={16} color={config.port === port.path ? C.accent : C.textMuted} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.portPath, config.port === port.path && { color: C.accent }]}>{port.path}</Text>
                              {port.manufacturer && <Text style={styles.portMfg}>{port.manufacturer}</Text>}
                            </View>
                            {config.port === port.path && (
                              <MaterialCommunityIcons name="check" size={14} color={C.feedbackGood} />
                            )}
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <View style={styles.noPortsCard}>
                        <MaterialCommunityIcons name="usb-flash-drive-outline" size={20} color={C.textMuted} />
                        <Text style={styles.noPortsText}>No serial ports detected. Connect an Arduino via USB.</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Baud Rate</Text>
                    <View style={styles.baudInputRow}>
                      <TextInput
                        style={styles.baudInput}
                        value={baudInput}
                        onChangeText={handleBaudRateChange}
                        keyboardType="numeric"
                        placeholder="115200"
                        placeholderTextColor={C.textMuted}
                      />
                      <Text style={styles.baudUnit}>bps</Text>
                    </View>
                    <View style={styles.baudPresets}>
                      {COMMON_BAUD_RATES.map(rate => (
                        <Pressable
                          key={rate}
                          style={[
                            styles.baudPresetBtn,
                            config.baudRate === rate && styles.baudPresetBtnActive,
                          ]}
                          onPress={() => handleSelectBaudRate(rate)}
                        >
                          <Text style={[
                            styles.baudPresetText,
                            config.baudRate === rate && styles.baudPresetTextActive,
                          ]}>{rate}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Serial Parameters</Text>
                    <View style={styles.paramRow}>
                      <Text style={styles.paramLabel}>Data Bits</Text>
                      <Text style={styles.paramValue}>{config.dataBits}</Text>
                    </View>
                    <View style={styles.paramRow}>
                      <Text style={styles.paramLabel}>Stop Bits</Text>
                      <Text style={styles.paramValue}>{config.stopBits}</Text>
                    </View>
                    <View style={styles.paramRow}>
                      <Text style={styles.paramLabel}>Parity</Text>
                      <Text style={styles.paramValue}>{config.parity}</Text>
                    </View>
                  </View>

                  {Platform.OS === 'android' && (
                    <View style={styles.section}>
                      <CameraSourcePicker />
                    </View>
                  )}
                </>
              ) : activeTab === 'assignments' ? (
                <>
                  <View style={styles.assignmentHeader}>
                    <MaterialCommunityIcons name="information-outline" size={16} color={C.info} />
                    <Text style={styles.assignmentHeaderText}>
                      Map each CPR training function to an Arduino sensor channel. Tap a row to change its channel assignment.
                    </Text>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Responsiveness Check</Text>
                    {(['leftShoulder', 'rightShoulder'] as CPRFunction[]).map(fn => (
                      <AssignmentRow
                        key={fn}
                        fn={fn}
                        assignments={assignments}
                        channels={ARDUINO_CHANNELS}
                        isConnected={isConnected}
                        onPickerOpen={openPicker}
                      />
                    ))}
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Compressions & Breathing</Text>
                    {(['compressionDepth', 'compressionForce', 'breathPressure'] as CPRFunction[]).map(fn => (
                      <AssignmentRow
                        key={fn}
                        fn={fn}
                        assignments={assignments}
                        channels={ARDUINO_CHANNELS}
                        isConnected={isConnected}
                        onPickerOpen={openPicker}
                      />
                    ))}
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>AED Pad Placement</Text>
                    {(['aedPadUpper', 'aedPadLower'] as CPRFunction[]).map(fn => (
                      <AssignmentRow
                        key={fn}
                        fn={fn}
                        assignments={assignments}
                        channels={ARDUINO_CHANNELS}
                        isConnected={isConnected}
                        onPickerOpen={openPicker}
                      />
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <View style={[styles.sensorSummary, isNarrow && { flexWrap: 'wrap' }]}>
                    <View style={[styles.summaryCard, isNarrow && { minWidth: '30%' }]}>
                      <Text style={styles.summaryValue}>{sensors.length}</Text>
                      <Text style={styles.summaryLabel}>Total</Text>
                    </View>
                    <View style={[styles.summaryCard, isNarrow && { minWidth: '30%' }]}>
                      <Text style={[styles.summaryValue, { color: C.info }]}>{i2cTouchCount}</Text>
                      <Text style={styles.summaryLabel}>I2C Touch</Text>
                    </View>
                    <View style={[styles.summaryCard, isNarrow && { minWidth: '30%' }]}>
                      <Text style={[styles.summaryValue, { color: C.warning }]}>{digitalCount}</Text>
                      <Text style={styles.summaryLabel}>Digital</Text>
                    </View>
                    <View style={[styles.summaryCard, isNarrow && { minWidth: '30%' }]}>
                      <Text style={[styles.summaryValue, { color: C.feedbackGood }]}>{analogCount}</Text>
                      <Text style={styles.summaryLabel}>Analog</Text>
                    </View>
                    <View style={[styles.summaryCard, isNarrow && { minWidth: '30%' }]}>
                      <Text style={[styles.summaryValue, { color: isConnected ? C.feedbackGood : C.textMuted }]}>{isConnected ? activeSensorCount : '--'}</Text>
                      <Text style={styles.summaryLabel}>Active</Text>
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>I2C Capacitive Touch (MPR121)</Text>
                    {sensors.filter(s => s.type === 'i2c_touch').map((sensor) => (
                      <ChannelCard key={sensor.id} channel={sensor} isConnected={isConnected} channelIndex={parseInt(sensor.id.replace('channel_', ''), 10)} />
                    ))}
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Ultrasonic / Analog Sensors</Text>
                    {sensors.filter(s => s.type === 'ultrasonic' || s.type === 'analog').map((sensor) => {
                      const chIdx = parseInt(sensor.id.replace('channel_', ''), 10);
                      const isDepthChannel = chIdx === assignments['compressionDepth'];
                      const isBreathChannel = chIdx === assignments['breathPressure'];
                      return (
                        <ChannelCard
                          key={sensor.id}
                          channel={sensor}
                          isConnected={isConnected}
                          channelIndex={chIdx}
                          offset={isDepthChannel ? ultrasonicOffset : isBreathChannel ? breathOffset : undefined}
                          onOffsetChange={isDepthChannel
                            ? (v) => arduinoSerial.setUltrasonicOffset(v)
                            : isBreathChannel
                              ? (v) => arduinoSerial.setBreathOffset(v)
                              : undefined
                          }
                          onCalibrate={isDepthChannel
                            ? () => arduinoSerial.calibrateUltrasonic()
                            : isBreathChannel
                              ? () => arduinoSerial.calibrateBreath()
                              : undefined
                          }
                        />
                      );
                    })}
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Digital Buttons</Text>
                    {sensors.filter(s => s.type === 'digital').map((sensor) => (
                      <ChannelCard key={sensor.id} channel={sensor} isConnected={isConnected} channelIndex={parseInt(sensor.id.replace('channel_', ''), 10)} />
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>

      <ChannelPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        fn={pickerFn}
        channels={ARDUINO_CHANNELS}
        currentIndex={pickerFn ? assignments[pickerFn] : null}
        onSelect={handleAssignmentSelect}
      />

      {/* Bundled video picker modal */}
      <Modal
        visible={bundledPickerStep !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setBundledPickerStep(null)}
      >
        <Pressable
          style={styles.bundledPickerBackdrop}
          onPress={() => setBundledPickerStep(null)}
        >
          <Pressable style={[styles.bundledPickerSheet, { backgroundColor: C.surface }]} onPress={() => {}}>
            <View style={styles.bundledPickerHeader}>
              <MaterialCommunityIcons name="package-variant-closed" size={18} color={C.accent} />
              <Text style={[styles.bundledPickerTitle, { color: C.text }]}>Select Bundled Video</Text>
              <Pressable onPress={() => setBundledPickerStep(null)}>
                <MaterialCommunityIcons name="close" size={20} color={C.textMuted} />
              </Pressable>
            </View>
            {(() => {
              const list = getBundledVideoList();
              if (list.length === 0) {
                return (
                  <View style={styles.bundledPickerEmpty}>
                    <MaterialCommunityIcons name="folder-open-outline" size={36} color={C.textMuted} />
                    <Text style={[styles.bundledPickerEmptyText, { color: C.textMuted }]}>
                      No bundled videos found.
                    </Text>
                    <Text style={[styles.bundledPickerEmptyHint, { color: C.textMuted }]}>
                      Place MP4 files in assets/videos/ and add them to lib/bundled-videos.ts, then rebuild.
                    </Text>
                  </View>
                );
              }
              return (
                <ScrollView style={styles.bundledPickerList} showsVerticalScrollIndicator>
                  {list.map((entry) => {
                    const isAssigned = bundledPickerStep ? videos[bundledPickerStep] === entry.key : false;
                    return (
                      <Pressable
                        key={entry.filename}
                        style={[
                          styles.bundledPickerItem,
                          { borderColor: isAssigned ? C.accent : C.border },
                          isAssigned && { backgroundColor: `${C.accent}15` },
                        ]}
                        onPress={async () => {
                          if (!bundledPickerStep) return;
                          await videoAssignments.set(bundledPickerStep, entry.key);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setBundledPickerStep(null);
                        }}
                      >
                        <MaterialCommunityIcons
                          name="file-video-outline"
                          size={20}
                          color={isAssigned ? C.accent : C.textSecondary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.bundledPickerItemLabel, { color: isAssigned ? C.accent : C.text }]}>
                            {entry.label || entry.filename}
                          </Text>
                          <Text style={[styles.bundledPickerItemFile, { color: C.textMuted }]}>
                            {entry.filename}
                          </Text>
                        </View>
                        {isAssigned && (
                          <MaterialCommunityIcons name="check-circle" size={16} color={C.accent} />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              );
            })()}
            <Pressable
              style={[styles.bundledPickerCancel, { borderColor: C.border }]}
              onPress={() => setBundledPickerStep(null)}
            >
              <Text style={[styles.bundledPickerCancelText, { color: C.textSecondary }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '90%',
    maxWidth: 640,
    maxHeight: '92%',
    backgroundColor: Colors.background,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: Colors.surfaceHighlight,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.text,
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 16,
    gap: 20,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
  },
  bigStatusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  statusInfo: {
    flex: 1,
    gap: 2,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  statusDetail: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  connectActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  connectBtn2: {
    backgroundColor: Colors.accent,
  },
  disconnectBtn: {
    backgroundColor: Colors.surfaceHighlight,
  },
  connectActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  connTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  connTypeBtn: {
    flex: 1,
    minWidth: 90,
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  connTypeBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: `${Colors.accent}15`,
  },
  connTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  connTypeDesc: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'center',
    opacity: 0.7,
  },
  tcpRow: {
    flexDirection: 'row',
    gap: 0,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 4,
    marginLeft: 2,
  },
  boardSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  boardName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  boardMcu: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  boardList: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  boardOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  boardOptionActive: {
    backgroundColor: `${Colors.accent}10`,
  },
  boardOptionName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  boardOptionMeta: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.accent,
  },
  portList: {
    gap: 4,
  },
  portItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  portItemActive: {
    borderColor: Colors.accent,
    backgroundColor: `${Colors.accent}10`,
  },
  portPath: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  portMfg: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  noPortsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 10,
  },
  noPortsText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
  },
  baudInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  baudInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  baudUnit: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  baudPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  baudPresetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  baudPresetBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  baudPresetText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  baudPresetTextActive: {
    color: Colors.text,
  },
  portInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  paramLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  paramValue: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '700',
  },
  sensorSummary: {
    flexDirection: 'row',
    gap: 6,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  sensorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sensorCardActive: {
    borderColor: Colors.feedbackGood,
    backgroundColor: 'rgba(0, 230, 118, 0.05)',
  },
  sensorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sensorTypeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensorCardInfo: {
    flex: 1,
    gap: 4,
  },
  sensorName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  sensorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sensorTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sensorTypeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sensorPin: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  sensorValueContainer: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sensorValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  sensorUnit: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  sensorDescription: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  invertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  invertInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  invertLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  sensorRange: {
    gap: 4,
  },
  rangeBarBg: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  rangeBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  rangeText: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  assignmentHeader: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: `${Colors.info}15`,
    borderRadius: 10,
    padding: 12,
    alignItems: 'flex-start',
  },
  assignmentHeaderText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  assignmentRow: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  assignmentRowActive: {
    borderColor: Colors.feedbackGood,
    backgroundColor: 'rgba(0, 230, 118, 0.05)',
  },
  assignmentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  assignmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
  },
  assignmentInfo: {
    flex: 1,
    gap: 2,
  },
  assignmentLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  assignmentDesc: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  assignmentRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 46,
  },
  assignmentLiveValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    minWidth: 32,
    textAlign: 'right',
  },
  channelPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  channelPickerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerModal: {
    width: '80%',
    maxWidth: 440,
    maxHeight: '70%',
    backgroundColor: Colors.background,
    borderRadius: 16,
    overflow: 'hidden',
  },
  pickerHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 2,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  pickerList: {
    flex: 1,
    padding: 8,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
  },
  pickerOptionActive: {
    backgroundColor: Colors.surfaceHighlight,
  },
  pickerOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerOptionInfo: {
    flex: 1,
    gap: 2,
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  pickerOptionTextActive: {
    color: Colors.feedbackGood,
  },
  pickerOptionMeta: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  serialToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  serialToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  serialToolBtnActive: {
    backgroundColor: Colors.surfaceHighlight,
  },
  serialToolText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  lineCountText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500',
    marginLeft: 4,
  },
  serialOutput: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },
  serialEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  serialEmptyText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  serialList: {
    flex: 1,
    paddingHorizontal: 4,
  },
  serialLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 24,
    paddingHorizontal: 8,
  },
  serialLineTx: {
    backgroundColor: 'rgba(41, 121, 255, 0.06)',
  },
  serialTimestamp: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    width: 80,
  },
  serialDirection: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textMuted,
    width: 20,
  },
  serialText: {
    flex: 1,
    fontSize: 12,
    color: Colors.feedbackGood,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  serialInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  serialInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lineEndingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 6,
    maxWidth: 100,
  },
  lineEndingText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  lineEndingDropdown: {
    position: 'absolute',
    bottom: 52,
    right: 60,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    zIndex: 100,
  },
  lineEndingOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  lineEndingOptionActive: {
    backgroundColor: Colors.surfaceHighlight,
  },
  lineEndingOptionText: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeContainer: {
    flex: 1,
    backgroundColor: '#0A0E14',
    padding: 12,
  },
  codeText: {
    fontSize: 12,
    color: Colors.feedbackGood,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    lineHeight: 18,
  },
  videoRow: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  videoRowInfo: {
    flex: 1,
    gap: 2,
  },
  videoRowFilenameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  videoRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  videoRowUri: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '500',
  },
  videoRowEmpty: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  videoRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  videoAssignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  videoAssignBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  videoRemoveBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: `${Colors.feedbackBad}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoUrlInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hardwareOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  hardwareOnlyInfo: {
    flex: 1,
    gap: 4,
    marginRight: 12,
  },
  hardwareOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hardwareOnlyLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  hardwareOnlyDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleTrackActive: {
    backgroundColor: Colors.accent,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.text,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  bundledPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  bundledPickerSheet: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    maxHeight: '80%',
  },
  bundledPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bundledPickerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  bundledPickerList: {
    maxHeight: 340,
  },
  bundledPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  bundledPickerItemLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  bundledPickerItemFile: {
    fontSize: 11,
    marginTop: 1,
  },
  bundledPickerEmpty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  bundledPickerEmptyText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  bundledPickerEmptyHint: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  bundledPickerCancel: {
    borderTopWidth: 1,
    paddingTop: 12,
    alignItems: 'center',
  },
  bundledPickerCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  offsetSection: {
    marginTop: 8,
    padding: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: `${Colors.info}30`,
  },
  offsetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offsetTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  offsetControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offsetStepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offsetInput: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  offsetZeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  offsetZeroBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  offsetPreview: {
    fontSize: 11,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
