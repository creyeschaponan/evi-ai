import { Injectable, Logger } from '@nestjs/common';
import { ITtsProvider, TtsAudioResult, TtsVoiceOption } from './tts.interface';

@Injectable()
export class CosyvoiceTtsProvider implements ITtsProvider {
  readonly id = 'cosyvoice';
  readonly displayName = 'CosyVoice 3 (Alibaba FunAudioLLM)';
  private readonly logger = new Logger(CosyvoiceTtsProvider.name);

  private readonly serverUrl = process.env.COSYVOICE_TTS_URL || 'http://localhost:50000/api/tts';
  private readonly defaultVoice = process.env.COSYVOICE_DEFAULT_VOICE || 'evi-cosy-latina';

  getAvailableVoices(): TtsVoiceOption[] {
    return [
      {
        id: 'evi-cosy-latina',
        name: 'E.V.I. CosyVoice (Español Latino)',
        lang: 'es-MX',
        gender: 'female',
        description: 'Voz clonada de alta fidelidad, natural, ágil y con entonación expresiva',
      },
      {
        id: 'cosy-es-natural',
        name: 'CosyVoice Español Natural',
        lang: 'es',
        gender: 'female',
        description: 'Voz neuronal fluida con modulación de respiración realista',
      },
      {
        id: 'cosy-es-expressive',
        name: 'CosyVoice Emocional / Táctico',
        lang: 'es',
        gender: 'female',
        description: 'Voz con dinamismo emocional y entonación conversacional',
      },
      {
        id: 'cosy-cross-lingual-male',
        name: 'CosyVoice Masculino Multilingüe',
        lang: 'es',
        gender: 'male',
        description: 'Voz masculina con síntesis cross-lingual y timbre tecnológico',
      },
    ];
  }

  async synthesize(text: string, voiceId?: string, rate?: string): Promise<TtsAudioResult> {
    const selectedVoice = voiceId || this.defaultVoice;
    this.logger.log(`Synthesizing with CosyVoice 3 (${selectedVoice}) at ${this.serverUrl}: "${text}"`);

    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: selectedVoice,
          language: 'es',
          speed: rate ? parseFloat(rate.replace('%', '').replace('+', '')) / 100 + 1 || 1.0 : 1.0,
        }),
      });

      if (!response.ok) {
        throw new Error(`CosyVoice server returned HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return {
        buffer,
        format: 'wav',
        sampleRate: 24000,
      };
    } catch (err) {
      this.logger.error(`CosyVoice synthesis failed: ${err.message}. Ensure CosyVoice microservice is running.`);
      throw err;
    }
  }
}
