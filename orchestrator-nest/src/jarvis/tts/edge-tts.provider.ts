import { Injectable, Logger } from '@nestjs/common';
import { ITtsProvider, TtsAudioResult, TtsVoiceOption } from './tts.interface';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

@Injectable()
export class EdgeTtsProvider implements ITtsProvider {
  readonly id = 'edge';
  readonly displayName = 'Microsoft Neural (Edge-TTS)';
  private readonly logger = new Logger(EdgeTtsProvider.name);

  private readonly defaultVoice = process.env.EDGE_TTS_VOICE || 'es-MX-DaliaNeural';
  private readonly defaultFormat = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
  private readonly defaultRate = process.env.EDGE_TTS_RATE || '+20%';

  getAvailableVoices(): TtsVoiceOption[] {
    return [
      {
        id: 'es-MX-DaliaNeural',
        name: 'Dalia (México / Latino)',
        lang: 'es-MX',
        gender: 'female',
        description: 'Voz femenina juvenil, dinámica y altamente expresiva (Recomendada para EVI)',
      },
      {
        id: 'es-US-PalomaNeural',
        name: 'Paloma (Latinoamérica)',
        lang: 'es-US',
        gender: 'female',
        description: 'Voz femenina moderna, clara y fluida',
      },
      {
        id: 'es-PE-CamilaNeural',
        name: 'Camila (Perú)',
        lang: 'es-PE',
        gender: 'female',
        description: 'Voz femenina peruana cálida, educada y profesional',
      },
      {
        id: 'es-CO-SalomeNeural',
        name: 'Salomé (Colombia)',
        lang: 'es-CO',
        gender: 'female',
        description: 'Voz femenina colombiana melodiosa y agradable',
      },
      {
        id: 'es-ES-ElviraNeural',
        name: 'Elvira (España)',
        lang: 'es-ES',
        gender: 'female',
        description: 'Voz femenina castellana europea',
      },
      {
        id: 'es-AR-ElenaNeural',
        name: 'Elena (Argentina)',
        lang: 'es-AR',
        gender: 'female',
        description: 'Voz femenina rioplatense',
      },
    ];
  }

  async synthesize(text: string, voiceId?: string, rate?: string): Promise<TtsAudioResult> {
    const selectedVoice = voiceId || this.defaultVoice;
    let selectedRate = rate || this.defaultRate;
    if (!selectedRate.includes('%')) {
      // Si viene como factor '1.2' -> '+20%'
      const factor = parseFloat(selectedRate);
      if (!isNaN(factor) && factor !== 1.0) {
        const pct = Math.round((factor - 1) * 100);
        selectedRate = pct >= 0 ? `+${pct}%` : `${pct}%`;
      } else {
        selectedRate = '+0%';
      }
    }

    this.logger.log(`Synthesizing with Edge-TTS (${selectedVoice} ${selectedRate}): "${text}"`);
    const tts = new MsEdgeTTS();
    await tts.setMetadata(selectedVoice, this.defaultFormat);

    const { audioStream } = await tts.toStream(text, { rate: selectedRate });

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('end', () => resolve(Buffer.concat(chunks)));
      audioStream.on('error', (err: any) => reject(err));
    });

    return {
      buffer,
      format: 'mp3',
      sampleRate: 24000,
    };
  }
}
