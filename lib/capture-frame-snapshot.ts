import * as FileSystem from 'expo-file-system/legacy';

export async function captureFrameSnapshot(filePath: string): Promise<string | null> {
  if (!filePath) return null;
  try {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) return null;
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
}
