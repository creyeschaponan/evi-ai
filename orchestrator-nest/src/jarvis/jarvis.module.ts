import { Module } from '@nestjs/common';
import { JarvisGateway } from './jarvis.gateway';
import { LlmService } from './llm.service';
import { TtsService } from './tts.service';
import { PiperTtsProvider } from './tts/piper-tts.provider';
import { EdgeTtsProvider } from './tts/edge-tts.provider';
import { ChatterboxTtsProvider } from './tts/chatterbox-tts.provider';
import { CosyvoiceTtsProvider } from './tts/cosyvoice-tts.provider';
import { RagService } from './rag.service';
import { SttService } from './stt.service';
import { KnowledgeIngestService } from './knowledge-ingest.service';
import { WindowsService } from './windows.service';
import { WeatherService } from './weather.service';
import { SystemMetricsService } from './system-metrics.service';

@Module({
  providers: [
    JarvisGateway,
    LlmService,
    TtsService,
    PiperTtsProvider,
    EdgeTtsProvider,
    ChatterboxTtsProvider,
    CosyvoiceTtsProvider,
    RagService,
    SttService,
    KnowledgeIngestService,
    WindowsService,
    WeatherService,
    SystemMetricsService,
  ],
  exports: [
    LlmService,
    TtsService,
    PiperTtsProvider,
    EdgeTtsProvider,
    ChatterboxTtsProvider,
    CosyvoiceTtsProvider,
    RagService,
    SttService,
    KnowledgeIngestService,
    WindowsService,
    WeatherService,
    SystemMetricsService,
  ],
})
export class JarvisModule {}
