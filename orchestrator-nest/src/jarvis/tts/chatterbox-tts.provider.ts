import { Injectable, Logger } from '@nestjs/common';
import { ITtsProvider, TtsAudioResult, TtsVoiceOption } from './tts.interface';

@Injectable()
export class ChatterboxTtsProvider implements ITtsProvider {
  readonly id = 'chatterbox';
  readonly displayName = 'Chatterbox TTS (Local Neural Voice Clone)';
  private readonly logger = new Logger(ChatterboxTtsProvider.name);

  private readonly serverUrl = process.env.CHATTERBOX_TTS_URL || 'http://localhost:8020/tts';
  private readonly defaultVoice = process.env.CHATTERBOX_VOICE || 'evi-neural-es';

  getAvailableVoices(): TtsVoiceOption[] {
    return [
      {
        id: 'evi-neural-es',
        name: 'E.V.I. Neural Clone (Español)',
        lang: 'es',
        gender: 'female',
        description: 'Voz táctica clonada con entonación expresiva y dinámica',
      },
      {
        id: 'eva-spanish-female',
        name: 'Eva (Español Neutro)',
        lang: 'es',
        gender: 'female',
        description: 'Voz neural con calidez y timbre moderno',
      },
      {
        id: 'jarvis-tactic-male',
        name: 'Jarvis (Español Táctico)',
        lang: 'es',
        gender: 'male',
        description: 'Voz masculina sobria y tecnológica',
      },
    ];
  }

  async synthesize(text: string, voiceId?: string, rate?: string): Promise<TtsAudioResult> {
    const selectedVoice = voiceId || this.defaultVoice;
    this.logger.log(`Synthesizing with Chatterbox TTS (${selectedVoice}) at ${this.serverUrl}: "${text}"`);

    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice_id: selectedVoice,
          language: 'es',
          speed: rate ? parseFloat(rate) || 1.0 : 1.0,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chatterbox server returned HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return {
        buffer,
        format: 'wav',
        sampleRate: 24000,
      };
    } catch (err) {
      this.logger.error(`Chatterbox synthesis failed: ${err.message}. Ensure Chatterbox server is running at ${this.serverUrl}`);
      throw err;
    }
  }
}
