import { Injectable, Logger } from '@nestjs/common';
import { WyomingClient } from './wyoming.client';

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private readonly whisperHost = process.env.WYOMING_WHISPER_HOST || 'localhost';
  private readonly whisperPort = parseInt(process.env.WYOMING_WHISPER_PORT || '10300', 10);

  async transcribeAudio(pcmAudio: Buffer, rate = 16000): Promise<string> {
    try {
      this.logger.log(`Transcribing ${pcmAudio.length} bytes of audio via Whisper...`);
      const transcript = await WyomingClient.transcribeAudio(
        this.whisperHost,
        this.whisperPort,
        pcmAudio,
        rate,
      );
      this.logger.log(`Transcription result: "${transcript}"`);
      return transcript;
    } catch (error) {
      this.logger.error(`Error transcribing audio in Whisper: ${error.message}`);
      throw error;
    }
  }
}
