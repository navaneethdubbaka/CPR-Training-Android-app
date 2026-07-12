import { Platform, PermissionsAndroid, Linking } from 'react-native';

export type MicPermissionStatus = 'granted' | 'denied' | 'blocked';

export async function checkMicPermission(): Promise<MicPermissionStatus> {
  if (Platform.OS === 'web') return 'granted';

  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return granted ? 'granted' : 'denied';
  }

  try {
    const { ExpoSpeechRecognitionModule } = await import('expo-speech-recognition');
    const result = await ExpoSpeechRecognitionModule.getMicrophonePermissionsAsync();
    return result.granted ? 'granted' : result.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'denied';
  }
}

export async function ensureMicPermission(): Promise<MicPermissionStatus> {
  if (Platform.OS === 'web') return 'granted';

  if (Platform.OS === 'android') {
    const current = await checkMicPermission();
    if (current === 'granted') return 'granted';

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );

    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      return 'granted';
    }
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      return 'blocked';
    }
    return 'denied';
  }

  try {
    const { ExpoSpeechRecognitionModule } = await import('expo-speech-recognition');
    let result = await ExpoSpeechRecognitionModule.getMicrophonePermissionsAsync();
    if (result.granted) return 'granted';
    if (result.canAskAgain) {
      result = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
    }
    if (result.granted) return 'granted';
    return result.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'denied';
  }
}

export function openAppSettings(): void {
  void Linking.openSettings();
}
