import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WyomingClient } from './wyoming.client';

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private readonly nativeWhisperUrl = process.env.NATIVE_WHISPER_URL || 'http://127.0.0.1:10305/api/stt';
  private readonly whisperHost = process.env.WYOMING_WHISPER_HOST || 'localhost';
  private readonly whisperPort = parseInt(process.env.WYOMING_WHISPER_PORT || '10300', 10);

  async transcribeAudio(pcmAudio: Buffer, rate = 16000): Promise<string> {
    const base64Audio = pcmAudio.toString('base64');

    // 1. Intentar con el microservicio nativo Faster-Whisper CUDA (ultrarrápido con VAD y forzado en español)
    try {
      const response = await axios.post(
        this.nativeWhisperUrl,
        { buffer: base64Audio, rate },
        { timeout: 4000 },
      );
      if (response.data && typeof response.data.text === 'string') {
        const text = response.data.text.trim();
        this.logger.log(`⚡ [CUDA Faster-Whisper STT]: "${text}"`);
        return text;
      }
    } catch (err) {
      this.logger.warn(`Native CUDA Whisper unreachable (${err.message}). Falling back to Wyoming...`);
    }

    // 2. Fallback a Wyoming Whisper
    try {
      this.logger.log(`Transcribing ${pcmAudio.length} bytes of audio via Wyoming Whisper...`);
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

