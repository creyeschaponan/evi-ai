import { Injectable, Logger } from '@nestjs/common';
import { ITtsProvider, TtsAudioResult, TtsVoiceOption } from './tts.interface';
import { WyomingClient } from '../wyoming.client';

@Injectable()
export class PiperTtsProvider implements ITtsProvider {
  readonly id = 'piper';
  readonly displayName = 'Piper TTS (100% Local Docker)';
  private readonly logger = new Logger(PiperTtsProvider.name);

  private readonly host = process.env.WYOMING_PIPER_HOST || 'localhost';
  private readonly port = parseInt(process.env.WYOMING_PIPER_PORT || '10200', 10);
  private readonly defaultVoice = process.env.WYOMING_PIPER_VOICE || 'es_MX-claude-high';
  private readonly defaultLengthScale = 0.85;

  getAvailableVoices(): TtsVoiceOption[] {
    return [
      {
        id: 'es_MX-claude-high',
        name: 'Claude (México / Latino)',
        lang: 'es-MX',
        gender: 'male',
        description: 'Voz masculina nítida, natural y de alta definición',
      },
      {
        id: 'es_ES-davefx-medium',
        name: 'Dave (España)',
        lang: 'es-ES',
        gender: 'male',
        description: 'Voz castellana fluida de tono medio',
      },
      {
        id: 'es_ES-sharvard-medium',
        name: 'Sharvard (España)',
        lang: 'es-ES',
        gender: 'female',
        description: 'Voz femenina castellana clara',
      },
    ];
  }

  async synthesize(text: string, voiceId?: string, rate?: string): Promise<TtsAudioResult> {
    const selectedVoice = voiceId || this.defaultVoice;
    
    // Parse length_scale: rate menor a 1.0 = más rápido
    let lengthScale = this.defaultLengthScale;
    if (rate) {
      const parsedRate = parseFloat(rate.replace('%', '').replace('+', ''));
      if (!isNaN(parsedRate)) {
        if (parsedRate > 5) {
          // formato porcentaje ej: +20% -> 1 / 1.2 = 0.83
          lengthScale = parseFloat((1 / (1 + parsedRate / 100)).toFixed(2));
        } else {
          // formato factor ej: 0.85
          lengthScale = parsedRate;
        }
      }
    }

    this.logger.log(`Synthesizing with Piper TTS (${selectedVoice}, length_scale: ${lengthScale}): "${text}"`);
    const buffer = await WyomingClient.synthesizeText(
      this.host,
      this.port,
      text,
      selectedVoice,
      lengthScale,
    );

    return {
      buffer,
      format: 'wav',
      sampleRate: 22050,
    };
  }
}
