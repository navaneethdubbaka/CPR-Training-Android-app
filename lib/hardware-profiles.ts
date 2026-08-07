export type HardwareProfileId = 'mpr121_legacy' | 'analog_v2';

export type SensorChannelType =
  | 'i2c_touch'
  | 'analog_touch'
  | 'ultrasonic'
  | 'analog'
  | 'force'
  | 'digital';

export type CPRFunction =
  | 'leftShoulder'
  | 'rightShoulder'
  | 'compressionDepth'
  | 'compressionForce'
  | 'breathPressure'
  | 'aedPadUpper'
  | 'aedPadLower'
  | 'neckTilt';

export type SensorAssignments = Record<CPRFunction, number | null>;

export interface SensorChannelTemplate {
  index: number;
  name: string;
  type: SensorChannelType;
  pin: string;
  unit: string;
  description: string;
}

export interface HardwareProfile {
  id: HardwareProfileId;
  label: string;
  firmwarePath: string;
  channels: SensorChannelTemplate[];
  defaultAssignments: SensorAssignments;
  forceScale?: { max: number; defaultMinPeak: number };
  breathInput?: 'voltage' | 'cmh2o';
  /** Multiply breath voltage (after offset) for UI display in cmH2O */
  breathVoltageToCmH2O?: number;
  analogTouchThreshold?: number;
}

function channel(
  index: number,
  name: string,
  type: SensorChannelType,
  pin: string,
  unit: string,
  description: string,
): SensorChannelTemplate {
  return { index, name, type, pin, unit, description };
}

const MPR121_CHANNELS: SensorChannelTemplate[] = [
  channel(0, 'I2C Touch Pad 0', 'i2c_touch', 'I2C (Pad 9)', 'on/off', 'MPR121 capacitive touch pad 0 (channel 9)'),
  channel(1, 'I2C Touch Pad 1', 'i2c_touch', 'I2C (Pad 3)', 'on/off', 'MPR121 capacitive touch pad 1 (channel 3)'),
  channel(2, 'I2C Touch Pad 2', 'i2c_touch', 'I2C (Pad 8)', 'on/off', 'MPR121 capacitive touch pad 2 (channel 8)'),
  channel(3, 'I2C Touch Pad 3', 'i2c_touch', 'I2C (Pad 10)', 'on/off', 'MPR121 capacitive touch pad 3 (channel 10)'),
  channel(4, 'I2C Touch Pad 4', 'i2c_touch', 'I2C (Pad 11)', 'on/off', 'MPR121 capacitive touch pad 4 (channel 11)'),
  channel(5, 'Ultrasonic Distance', 'ultrasonic', 'D12/D13', 'cm', 'PING ultrasonic distance sensor'),
  channel(6, 'Analog Voltage', 'analog', 'A0', 'V', 'Analog sensor voltage reading (0-5V)'),
  channel(7, 'Digital Button 0', 'digital', 'D2', 'on/off', 'Digital push button on pin 2'),
  channel(8, 'Digital Button 1', 'digital', 'D4', 'on/off', 'Digital push button on pin 4'),
  channel(9, 'Digital Button 2', 'digital', 'D6', 'on/off', 'Digital push button on pin 6'),
  channel(10, 'Digital Button 3', 'digital', 'D8', 'on/off', 'Digital push button on pin 8'),
  channel(11, 'Digital Button 4', 'digital', 'D10', 'on/off', 'Digital push button on pin 10'),
];

const ANALOG_CHANNELS: SensorChannelTemplate[] = [
  channel(0, 'Shoulder (Left)', 'analog_touch', 'A15', 'on/off', 'Shoulder tap sensor — left channel'),
  channel(1, 'Shoulder (Right)', 'analog_touch', 'A15', 'on/off', 'Shoulder tap sensor — right channel (duplicate)'),
  channel(2, 'AED Pad Upper', 'analog_touch', 'A9', 'on/off', 'Upper AED pad placement sensor'),
  channel(3, 'AED Pad Lower', 'analog_touch', 'A11', 'on/off', 'Lower AED pad placement sensor'),
  channel(4, 'Neck Tilt', 'analog_touch', 'A7', 'on/off', 'Head-tilt / open-airway sensor'),
  channel(5, 'Ultrasonic Distance', 'ultrasonic', 'D12/D13', 'cm', 'PING ultrasonic compression depth'),
  channel(6, 'Breath Pressure', 'analog', 'J5.A1', 'V', 'Rescue breath blow sensor (0-5V)'),
  channel(7, 'Compression Force', 'force', 'A13', 'N', 'Compression force sensor (0-600)'),
  channel(8, 'Spare 0', 'digital', '—', 'on/off', 'Unused channel'),
  channel(9, 'Spare 1', 'digital', '—', 'on/off', 'Unused channel'),
  channel(10, 'Spare 2', 'digital', '—', 'on/off', 'Unused channel'),
  channel(11, 'Spare 3', 'digital', '—', 'on/off', 'Unused channel'),
];

export const HARDWARE_PROFILES: Record<HardwareProfileId, HardwareProfile> = {
  mpr121_legacy: {
    id: 'mpr121_legacy',
    label: 'MPR121 Legacy',
    firmwarePath: '/attached_assets/final_arduino_code_1771601973155/final_arduino_code_1771601973155.ino',
    channels: MPR121_CHANNELS,
    defaultAssignments: {
      leftShoulder: 0,
      rightShoulder: 1,
      compressionDepth: 5,
      compressionForce: null,
      breathPressure: 6,
      aedPadUpper: 2,
      aedPadLower: 3,
      neckTilt: null,
    },
    forceScale: { max: 5, defaultMinPeak: 1.5 },
    breathInput: 'voltage',
    breathVoltageToCmH2O: 50,
  },
  analog_v2: {
    id: 'analog_v2',
    label: 'Analog v2',
    firmwarePath: '/attached_assets/analog_hardware_serial/analog_hardware_serial.ino',
    channels: ANALOG_CHANNELS,
    defaultAssignments: {
      leftShoulder: 0,
      rightShoulder: 1,
      compressionDepth: 5,
      compressionForce: 7,
      breathPressure: 6,
      aedPadUpper: 2,
      aedPadLower: 3,
      neckTilt: 4,
    },
    forceScale: { max: 600, defaultMinPeak: 50 },
    breathInput: 'voltage',
    breathVoltageToCmH2O: 50,
    analogTouchThreshold: 512,
  },
};

export const DEFAULT_HARDWARE_PROFILE_ID: HardwareProfileId = 'analog_v2';

export const HARDWARE_PROFILE_LIST = Object.values(HARDWARE_PROFILES);

export function getHardwareProfile(id: HardwareProfileId): HardwareProfile {
  return HARDWARE_PROFILES[id];
}

export function isHardwareProfileId(value: string): value is HardwareProfileId {
  return value === 'mpr121_legacy' || value === 'analog_v2';
}

export function assignmentsStorageKey(profileId: HardwareProfileId): string {
  return `cpr_assignments_${profileId}`;
}

export const MPR121_LEGACY_CHANNELS = MPR121_CHANNELS;
export const ANALOG_V2_CHANNELS = ANALOG_CHANNELS;

export const MPR121_LEGACY_ASSIGNMENTS = HARDWARE_PROFILES.mpr121_legacy.defaultAssignments;
export const ANALOG_V2_ASSIGNMENTS = HARDWARE_PROFILES.analog_v2.defaultAssignments;
