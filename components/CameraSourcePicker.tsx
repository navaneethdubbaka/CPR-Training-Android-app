import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useCameraDevices } from 'react-native-vision-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { CAMERA_DEVICE_KEY } from '@/components/PoseCameraView';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function CameraSourcePicker() {
  const { theme } = useTheme();
  const C = getColors(theme);
  const devices = useCameraDevices();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CAMERA_DEVICE_KEY).then(id => {
      if (id) setSelectedId(id);
    });
  }, []);

  if (devices.length === 0) return null;

  const selectDevice = async (id: string | null) => {
    setSelectedId(id);
    if (id) {
      await AsyncStorage.setItem(CAMERA_DEVICE_KEY, id);
    } else {
      await AsyncStorage.removeItem(CAMERA_DEVICE_KEY);
    }
  };

  const positionLabel = (pos: string) => {
    if (pos === 'back') return 'Built-in Back';
    if (pos === 'front') return 'Built-in Front';
    if (pos === 'external') return 'USB / External';
    return pos;
  };

  const positionIcon = (pos: string): IconName => {
    if (pos === 'back') return 'camera';
    if (pos === 'front') return 'camera-flip';
    return 'usb';
  };

  const externalDevices = devices.filter(d => d.position === 'external');
  const hasExternal = externalDevices.length > 0;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="eye-circle-outline" size={15} color={C.accent} />
        <Text style={[styles.title, { color: C.text }]}>Pose Camera Source</Text>
        {hasExternal && (
          <View style={[styles.badge, { backgroundColor: 'rgba(0,230,118,0.15)' }]}>
            <Text style={[styles.badgeText, { color: C.feedbackGood }]}>USB detected</Text>
          </View>
        )}
      </View>

      <View style={styles.list}>
        {devices.map(device => {
          const isSelected = selectedId === device.id || (!selectedId && device.position === 'back');
          return (
            <Pressable
              key={device.id}
              style={[styles.item, isSelected && { borderColor: C.accent, backgroundColor: `${C.accent}18` }]}
              onPress={() => selectDevice(device.id)}
            >
              <MaterialCommunityIcons
                name={positionIcon(device.position)}
                size={16}
                color={isSelected ? C.accent : C.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemLabel, { color: isSelected ? C.accent : C.text }]}>
                  {positionLabel(device.position)}
                </Text>
                <Text style={[styles.itemSub, { color: C.textMuted }]} numberOfLines={1}>
                  {device.name ?? device.id}
                </Text>
              </View>
              {isSelected && (
                <MaterialCommunityIcons name="check-circle" size={14} color={C.accent} />
              )}
            </Pressable>
          );
        })}
      </View>

      {!hasExternal && (
        <Text style={[styles.hint, { color: C.textMuted }]}>
          Connect a USB camera via OTG adapter — it will appear here as an external source.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    flex: 1,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  list: {
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 10,
    marginTop: 1,
  },
  hint: {
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
    lineHeight: 16,
  },
});
