/**
 * Bundled video registry.
 *
 * HOW TO ADD YOUR OWN VIDEOS:
 *   1. Copy your .mp4 file into the assets/videos/ folder
 *   2. Uncomment (or add) the corresponding line below with the exact filename
 *   3. Rebuild the app — Metro will bundle the file into the APK
 *
 * Example:
 *   'scene_safety.mp4': require('../assets/videos/scene_safety.mp4'),
 */

export const BUNDLED_VIDEOS: Record<string, number> = {
  'demo.mp4': require('../assets/videos/demo.mp4'),
   'scene_safety.mp4': require('../assets/videos/scene_safety.mp4'),
  // 'check_responsiveness.mp4': require('../assets/videos/check_responsiveness.mp4'),
  // 'call_911.mp4': require('../assets/videos/call_911.mp4'),
  // 'hand_placement.mp4': require('../assets/videos/hand_placement.mp4'),
  // 'compressions.mp4': require('../assets/videos/compressions.mp4'),
  // 'aed_pad_placement.mp4': require('../assets/videos/aed_pad_placement.mp4'),
  // 'aed_analysis.mp4': require('../assets/videos/aed_analysis.mp4'),
  // 'deliver_shock.mp4': require('../assets/videos/deliver_shock.mp4'),
  // 'post_aed_compressions.mp4': require('../assets/videos/post_aed_compressions.mp4'),
};

const BUNDLED_PREFIX = 'bundled:';

/** Returns the require() number for a bundled video key, or undefined if not found. */
export function getBundledVideoSource(key: string): number | undefined {
  const filename = key.startsWith(BUNDLED_PREFIX) ? key.slice(BUNDLED_PREFIX.length) : key;
  return BUNDLED_VIDEOS[filename];
}

/** Returns true if the stored value is a bundled video key. */
export function isBundledKey(value: string): boolean {
  return value.startsWith(BUNDLED_PREFIX);
}

/** Creates a storage key for a bundled video filename. */
export function makeBundledKey(filename: string): string {
  return `${BUNDLED_PREFIX}${filename}`;
}

/** Returns a human-readable label for a bundled video filename. */
export function bundledLabel(filename: string): string {
  return filename.replace(/\.mp4$/i, '').replace(/[_-]/g, ' ');
}

export interface BundledVideoEntry {
  filename: string;
  key: string;
  label: string;
  source: number;
}

/** Returns all registered bundled videos as a list. */
export function getBundledVideoList(): BundledVideoEntry[] {
  return Object.entries(BUNDLED_VIDEOS).map(([filename, source]) => ({
    filename,
    key: makeBundledKey(filename),
    label: bundledLabel(filename),
    source,
  }));
}
