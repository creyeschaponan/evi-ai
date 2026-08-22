import { Injectable, Logger } from '@nestjs/common';
import { ITtsProvider, TtsConfig, TtsEngineType, TtsVoiceOption } from './tts/tts.interface';
import { PiperTtsProvider } from './tts/piper-tts.provider';
import { EdgeTtsProvider } from './tts/edge-tts.provider';
import { ChatterboxTtsProvider } from './tts/chatterbox-tts.provider';
import { CosyvoiceTtsProvider } from './tts/cosyvoice-tts.provider';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly providers: Map<TtsEngineType, ITtsProvider> = new Map();

  // Configuración activa por defecto: Microsoft Neural (Edge-TTS) Dalia / Camila (Instantánea y Gratuita)
  private currentConfig: TtsConfig = {
    engine: (process.env.TTS_DEFAULT_ENGINE as TtsEngineType) || 'edge',
    voice: process.env.TTS_DEFAULT_VOICE || 'es-MX-DaliaNeural',
    rate: process.env.TTS_DEFAULT_RATE || '+20%',
  };

  constructor(
    private readonly piperProvider: PiperTtsProvider,
    private readonly edgeProvider: EdgeTtsProvider,
    private readonly chatterboxProvider: ChatterboxTtsProvider,
    private readonly cosyvoiceProvider: CosyvoiceTtsProvider,
  ) {
    this.providers.set('piper', this.piperProvider);
    this.providers.set('edge', this.edgeProvider);
    this.providers.set('chatterbox', this.chatterboxProvider);
    this.providers.set('cosyvoice', this.cosyvoiceProvider);
    this.logger.log(`TTS Manager initialized with active engine: [${this.currentConfig.engine}] and voice: [${this.currentConfig.voice}]`);
  }

  /**
   * Obtiene la configuración activa
   */
  getCurrentConfig(): TtsConfig {
    return { ...this.currentConfig };
  }

  /**
   * Actualiza el motor, voz o velocidad activa
   */
  updateConfig(newConfig: Partial<TtsConfig>): TtsConfig {
    if (newConfig.engine && this.providers.has(newConfig.engine)) {
      this.currentConfig.engine = newConfig.engine;
      const provider = this.providers.get(newConfig.engine);
      const voices = provider.getAvailableVoices();
      if (!newConfig.voice || !voices.some(v => v.id === newConfig.voice)) {
        this.currentConfig.voice = voices[0]?.id || '';
      } else {
        this.currentConfig.voice = newConfig.voice;
      }
    } else if (newConfig.voice) {
      this.currentConfig.voice = newConfig.voice;
    }

    if (newConfig.rate) {
      this.currentConfig.rate = newConfig.rate;
    }

    this.logger.log(`TTS Configuration updated -> Engine: [${this.currentConfig.engine}], Voice: [${this.currentConfig.voice}], Rate: [${this.currentConfig.rate}]`);
    return this.getCurrentConfig();
  }

  /**
   * Devuelve el catálogo completo de motores y voces disponibles para la UI
   */
  getCatalog() {
    const engines = Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      voices: p.getAvailableVoices(),
    }));

    return {
      engines,
      active: this.getCurrentConfig(),
    };
  }

  /**
   * Limpia emojis, corchetes de sistema, markdown y URLs para que el habla suene limpia
   */
  cleanTextForSpeech(text: string): string {
    if (!text) return '';
    return text
      .replace(/\[[^\]]*\]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[\p{Extended_Pictographic}\u200d\uFE0F\uD83C-\uDBFF\uDC00-\uDFFF]/gu, '')
      .replace(/[*_`#~()]/g, ' ')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Sintetiza una oración con el motor activo o con fallback automático a Piper
   */
  async synthesizeSentence(text: string, customConfig?: Partial<TtsConfig>): Promise<Buffer> {
    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText || cleanText.length < 2) {
      return Buffer.alloc(0);
    }

    const config: TtsConfig = {
      ...this.currentConfig,
      ...customConfig,
    };

    const provider = this.providers.get(config.engine) || this.cosyvoiceProvider;

    try {
      const result = await provider.synthesize(cleanText, config.voice, config.rate);
      if (result.buffer && result.buffer.length > 0) {
        return result.buffer;
      }
    } catch (err) {
      this.logger.warn(`TTS provider [${config.engine}] failed: ${err.message}. Triggering fallback to local Piper...`);
    }

    // Fallback de seguridad a Piper TTS
    try {
      const fallbackResult = await this.piperProvider.synthesize(cleanText);
      return fallbackResult.buffer;
    } catch (fallbackErr) {
      this.logger.error(`Critical: Piper fallback also failed: ${fallbackErr.message}`);
      throw fallbackErr;
    }
  }
}
