import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

export type VoiceState = 'idle' | 'listening' | 'recognized' | 'failed';

export interface VoiceRecognitionCallbacks {
  onStart?: () => void;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

let speechModule: typeof import('expo-speech-recognition') | null = null;

async function getSpeechRecognitionModule() {
  if (Platform.OS === 'web') return null;
  if (speechModule) return speechModule;
  try {
    speechModule = await import('expo-speech-recognition');
    return speechModule;
  } catch {
    return null;
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z\s]/g, '').trim();
}

export function matchesPhrase(transcript: string, targetPhrase: string): boolean {
  const t = normalizeText(transcript);
  const p = normalizeText(targetPhrase);
  return t.includes(p);
}

export function matchesHelpPhrase(transcript: string, minCount: number = 2): boolean {
  const t = normalizeText(transcript);
  const matches = t.match(/\bhelp\b/g);
  return !!matches && matches.length >= minCount;
}

export function matchesSceneSafe(transcript: string): boolean {
  const t = normalizeText(transcript);
  const phrases = [
    'scene is safe', 'the scene is safe', 'area is secure', 'the area is secure',
    'safe to approach', 'it is safe', 'its safe', "environment is clear",
    'all clear', 'scene clear', 'scene is clear', 'area is safe',
    'is safe', 'looks safe', 'looks clear', 'we are safe', 'safe',
  ];
  return phrases.some(p => t.includes(normalizeText(p)));
}

export function matchesResponsiveness(transcript: string): boolean {
  const t = normalizeText(transcript);
  const phrases = [
    'are you alright', 'are you okay', 'are you ok',
    'can you hear me', 'hey wake up', 'wake up',
    'are you conscious', 'hello can you hear', 'respond',
    'you okay', 'alright', 'can you respond', 'are you there',
    'hello wake', 'hey you', 'open your eyes', 'speak to me',
  ];
  return phrases.some(p => t.includes(normalizeText(p)));
}

export function matchesHelpShout(transcript: string): boolean {
  const t = normalizeText(transcript);
  const phrases = [
    'help', 'someone help', 'help me', 'call for help',
    'please help', 'anybody help', 'need help', 'get help',
    'call ambulance', 'emergency', 'call 911', 'call 112', 'call 108',
  ];
  return phrases.some(p => t.includes(normalizeText(p)));
}

type ListenerSubscription = { remove: () => void };

class VoiceRecognitionManager {
  private webRecognition: any = null;
  private isListening = false;
  private sessionId = 0;
  private nativeListeners: ListenerSubscription[] = [];
  private startChain: Promise<void> = Promise.resolve();
  private lastNativeStopAt = 0;

  private bumpSession(): number {
    this.sessionId += 1;
    return this.sessionId;
  }

  private isStaleSession(id: number): boolean {
    return id !== this.sessionId;
  }

  private clearNativeListeners(): void {
    for (const sub of this.nativeListeners) {
      try {
        sub.remove();
      } catch {}
    }
    this.nativeListeners = [];
  }

  async startListening(callbacks: VoiceRecognitionCallbacks): Promise<void> {
    // Serialize starts so Android SpeechRecognizer is never stop/start thrashed.
    this.startChain = this.startChain
      .catch(() => {})
      .then(() => this.startListeningInternal(callbacks));
    return this.startChain;
  }

  private async startListeningInternal(callbacks: VoiceRecognitionCallbacks): Promise<void> {
    if (this.isListening) {
      await this.stopListening();
    }

    // Debounce after native stop so the OS recognizer can settle.
    if (Platform.OS !== 'web' && this.lastNativeStopAt > 0) {
      const elapsed = Date.now() - this.lastNativeStopAt;
      const settleMs = 400;
      if (elapsed < settleMs) {
        await new Promise((r) => setTimeout(r, settleMs - elapsed));
      }
    }

    this.isListening = true;
    const session = this.bumpSession();

    Speech.stop();

    if (Platform.OS === 'web') {
      this.startWebListening(callbacks, session);
    } else {
      await this.startNativeListening(callbacks, session);
    }
  }

  async stopListening(): Promise<void> {
    const wasListening = this.isListening;
    this.bumpSession();
    this.isListening = false;

    if (Platform.OS === 'web') {
      this.clearNativeListeners();
      if (this.webRecognition) {
        try {
          this.webRecognition.stop();
        } catch {}
        this.webRecognition = null;
      }
      return;
    }

    const speech = await getSpeechRecognitionModule();
    if (speech && wasListening) {
      // Listen for native `end` before clearing session listeners so stop→start can serialize.
      const endPromise = new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        try {
          const sub = speech.ExpoSpeechRecognitionModule.addListener('end', () => {
            try {
              sub.remove();
            } catch {}
            done();
          });
          setTimeout(() => {
            try {
              sub.remove();
            } catch {}
            done();
          }, 800);
        } catch {
          done();
        }
      });

      this.clearNativeListeners();
      try {
        speech.ExpoSpeechRecognitionModule.stop();
      } catch {}
      this.lastNativeStopAt = Date.now();
      await endPromise;
    } else {
      this.clearNativeListeners();
    }
  }

  async destroy(): Promise<void> {
    await this.stopListening();
    if (Platform.OS === 'web') return;

    const speech = await getSpeechRecognitionModule();
    if (speech) {
      try {
        speech.ExpoSpeechRecognitionModule.abort();
      } catch {}
    }
  }

  async prewarm(): Promise<void> {
    if (Platform.OS === 'web') return;
    await getSpeechRecognitionModule();
  }

  async isAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' &&
        (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);
    }

    const speech = await getSpeechRecognitionModule();
    if (!speech) return false;

    try {
      if (!speech.ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        return false;
      }
      if (Platform.OS === 'android') {
        const services = speech.ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
        return services.length > 0;
      }
      return true;
    } catch {
      return false;
    }
  }

  private startWebListening(callbacks: VoiceRecognitionCallbacks, session: number): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      callbacks.onError?.('Speech recognition not supported in this browser');
      callbacks.onEnd?.();
      this.isListening = false;
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    this.webRecognition = recognition;

    recognition.onstart = () => {
      if (this.isStaleSession(session)) return;
      callbacks.onStart?.();
    };

    recognition.onresult = (event: any) => {
      if (this.isStaleSession(session)) return;
      let bestTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result[0].transcript.length > bestTranscript.length) {
          bestTranscript = result[0].transcript;
        }
      }
      callbacks.onResult?.(bestTranscript);
    };

    recognition.onerror = (event: any) => {
      if (this.isStaleSession(session)) return;
      const errMsg = event.error === 'no-speech' ? 'No speech detected' : `Error: ${event.error}`;
      callbacks.onError?.(errMsg);
    };

    recognition.onend = () => {
      if (this.isStaleSession(session)) return;
      this.webRecognition = null;
      this.isListening = false;
      callbacks.onEnd?.();
    };

    try {
      recognition.start();
    } catch (e: any) {
      callbacks.onError?.(e.message || 'Failed to start recognition');
      callbacks.onEnd?.();
      this.isListening = false;
    }
  }

  private async startNativeListening(callbacks: VoiceRecognitionCallbacks, session: number): Promise<void> {
    const speech = await getSpeechRecognitionModule();
    if (!speech) {
      callbacks.onError?.('Voice recognition not available on this device');
      callbacks.onEnd?.();
      this.isListening = false;
      return;
    }

    const { ExpoSpeechRecognitionModule } = speech;

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      callbacks.onError?.('Speech recognition not available on this device');
      callbacks.onEnd?.();
      this.isListening = false;
      return;
    }

    if (Platform.OS === 'android') {
      const services = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
      if (!services.length) {
        callbacks.onError?.('No speech recognition service found. Install Google app.');
        callbacks.onEnd?.();
        this.isListening = false;
        return;
      }
    }

    this.clearNativeListeners();

    this.nativeListeners.push(
      ExpoSpeechRecognitionModule.addListener('start', () => {
        if (this.isStaleSession(session)) return;
        callbacks.onStart?.();
      }),
    );

    this.nativeListeners.push(
      ExpoSpeechRecognitionModule.addListener('result', (event: { results?: { transcript: string }[] }) => {
        if (this.isStaleSession(session)) return;
        const results = event.results ?? [];
        let bestTranscript = '';
        for (const result of results) {
          const transcript = result.transcript ?? '';
          if (transcript.length > bestTranscript.length) {
            bestTranscript = transcript;
          }
        }
        if (bestTranscript) {
          callbacks.onResult?.(bestTranscript);
        }
      }),
    );

    this.nativeListeners.push(
      ExpoSpeechRecognitionModule.addListener('error', (event: { error?: string; message?: string }) => {
        if (this.isStaleSession(session)) return;
        const msg = event.message ?? event.error ?? 'Recognition error';
        callbacks.onError?.(msg);
      }),
    );

    this.nativeListeners.push(
      ExpoSpeechRecognitionModule.addListener('end', () => {
        if (this.isStaleSession(session)) return;
        this.isListening = false;
        callbacks.onEnd?.();
      }),
    );

    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        maxAlternatives: 3,
      });
    } catch (e: any) {
      callbacks.onError?.(e.message || 'Failed to start recognition');
      callbacks.onEnd?.();
      this.isListening = false;
    }
  }
}

export const voiceRecognition = new VoiceRecognitionManager();
