import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'cpr_video_assignments';

export type VideoAssignments = Record<string, string>;

let cache: VideoAssignments | null = null;
let listeners: Array<(assignments: VideoAssignments) => void> = [];

export const videoAssignments = {
  async load(): Promise<VideoAssignments> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      cache = raw ? JSON.parse(raw) : {};
    } catch {
      cache = {};
    }
    return { ...cache! };
  },

  async get(stepId: string): Promise<string | null> {
    if (cache === null) await this.load();
    return cache![stepId] ?? null;
  },

  async set(stepId: string, uri: string): Promise<void> {
    if (cache === null) await this.load();
    cache![stepId] = uri;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    listeners.forEach(cb => cb({ ...cache! }));
  },

  async remove(stepId: string): Promise<void> {
    if (cache === null) await this.load();
    delete cache![stepId];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    listeners.forEach(cb => cb({ ...cache! }));
  },

  async clear(): Promise<void> {
    cache = {};
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    listeners.forEach(cb => cb({}));
  },

  getAll(): VideoAssignments {
    return { ...(cache ?? {}) };
  },

  onChange(callback: (assignments: VideoAssignments) => void): () => void {
    listeners.push(callback);
    return () => {
      listeners = listeners.filter(cb => cb !== callback);
    };
  },
};
