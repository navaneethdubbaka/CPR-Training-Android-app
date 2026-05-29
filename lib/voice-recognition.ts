import { Platform } from 'react-native';

export type VoiceState = 'idle' | 'listening' | 'recognized' | 'failed';

export interface VoiceRecognitionCallbacks {
  onStart?: () => void;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

let voiceModule: any = null;

async function getVoiceModule() {
  if (Platform.OS === 'web') return null;
  if (voiceModule) return voiceModule;
  try {
    const m = await import('@react-native-voice/voice');
    voiceModule = m.default ?? m;
    return voiceModule;
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

class VoiceRecognitionManager {
  private webRecognition: any = null;
  private isListening = false;

  async startListening(callbacks: VoiceRecognitionCallbacks): Promise<void> {
    if (this.isListening) {
      await this.stopListening();
    }
    this.isListening = true;

    if (Platform.OS === 'web') {
      this.startWebListening(callbacks);
    } else {
      await this.startNativeListening(callbacks);
    }
  }

  async stopListening(): Promise<void> {
    this.isListening = false;
    if (Platform.OS === 'web') {
      if (this.webRecognition) {
        try {
          this.webRecognition.stop();
        } catch {}
        this.webRecognition = null;
      }
    } else {
      const Voice = await getVoiceModule();
      if (Voice) {
        try {
          await Voice.stop();
        } catch {}
      }
    }
  }

  async destroy(): Promise<void> {
    await this.stopListening();
    if (Platform.OS !== 'web') {
      const Voice = await getVoiceModule();
      if (Voice) {
        try {
          await Voice.destroy();
        } catch {}
      }
    }
  }

  isAvailable(): boolean {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' &&
        (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);
    }
    return true;
  }

  private startWebListening(callbacks: VoiceRecognitionCallbacks): void {
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
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    this.webRecognition = recognition;

    recognition.onstart = () => {
      callbacks.onStart?.();
    };

    recognition.onresult = (event: any) => {
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
      const errMsg = event.error === 'no-speech' ? 'No speech detected' : `Error: ${event.error}`;
      callbacks.onError?.(errMsg);
    };

    recognition.onend = () => {
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

  private async startNativeListening(callbacks: VoiceRecognitionCallbacks): Promise<void> {
    const Voice = await getVoiceModule();
    if (!Voice) {
      callbacks.onError?.('Voice recognition not available on this device');
      callbacks.onEnd?.();
      this.isListening = false;
      return;
    }

    Voice.onSpeechStart = () => callbacks.onStart?.();
    Voice.onSpeechResults = (e: any) => {
      const results: string[] = e?.value ?? [];
      if (results.length > 0) {
        callbacks.onResult?.(results[0]);
      }
    };
    Voice.onSpeechPartialResults = (e: any) => {
      const results: string[] = e?.value ?? [];
      if (results.length > 0) {
        callbacks.onResult?.(results[0]);
      }
    };
    Voice.onSpeechError = (e: any) => {
      callbacks.onError?.(e?.error?.message ?? 'Recognition error');
    };
    Voice.onSpeechEnd = () => {
      this.isListening = false;
      callbacks.onEnd?.();
    };

    try {
      await Voice.start('en-US');
    } catch (e: any) {
      callbacks.onError?.(e.message || 'Failed to start recognition');
      callbacks.onEnd?.();
      this.isListening = false;
    }
  }
}

export const voiceRecognition = new VoiceRecognitionManager();
