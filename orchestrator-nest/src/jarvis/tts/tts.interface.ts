export type TtsEngineType = 'piper' | 'edge' | 'chatterbox' | 'cosyvoice';

export interface TtsVoiceOption {
  id: string;
  name: string;
  lang: string;
  gender: 'female' | 'male';
  description: string;
}

export interface TtsAudioResult {
  buffer: Buffer;
  format: 'wav' | 'mp3';
  sampleRate: number;
}

export interface TtsConfig {
  engine: TtsEngineType;
  voice: string;
  rate: string; // e.g. "+20%", "0.85", "1.0"
}

export interface ITtsProvider {
  readonly id: TtsEngineType;
  readonly displayName: string;
  getAvailableVoices(): TtsVoiceOption[];
  synthesize(text: string, voiceId?: string, rate?: string): Promise<TtsAudioResult>;
}
