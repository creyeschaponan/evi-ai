import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { LlmService } from './llm.service';
import { TtsService } from './tts.service';
import { RagService } from './rag.service';
import { SttService } from './stt.service';
import { KnowledgeIngestService } from './knowledge-ingest.service';
import { WindowsService } from './windows.service';
import { WeatherService } from './weather.service';

@WebSocketGateway({
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8, // 100 MB for large audio payloads
})
export class JarvisGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(JarvisGateway.name);
  private readonly SESSION_ID = 'evi_main';

  constructor(
    private readonly llmService: LlmService,
    private readonly ttsService: TtsService,
    private readonly ragService: RagService,
    private readonly sttService: SttService,
    private readonly knowledgeIngestService: KnowledgeIngestService,
    private readonly windowsService: WindowsService,
    private readonly weatherService: WeatherService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    // Enviar catálogo completo de motores, voces y configuración activa al conectarse
    client.emit('tts_catalog', this.ttsService.getCatalog());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('get_tts_catalog')
  handleGetTtsCatalog() {
    return this.ttsService.getCatalog();
  }

  @SubscribeMessage('update_tts_settings')
  handleUpdateTtsSettings(
    @MessageBody() settings: { engine?: any; voice?: string; rate?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const updated = this.ttsService.updateConfig(settings);
    client.emit('tts_config_updated', updated);
    this.logger.log(`TTS Settings updated from client ${client.id}: Engine=[${updated.engine}], Voice=[${updated.voice}], Rate=[${updated.rate}]`);
    return updated;
  }

  /**
   * Handle text query with RAG + Windows Actions + Multi-Turn History + Streaming LLM + Sentence-by-sentence TTS
   */
  @SubscribeMessage('voice_command_text')
  async handleVoiceText(
    @MessageBody() queryText: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (!queryText || typeof queryText !== 'string' || queryText.trim().length === 0) {
      return;
    }

    this.logger.log(`\n========================================\n📥 [USER QUERY RECEIVED]: "${queryText}"`);

    // 1. Verificar si es una orden directa del sistema operativo (Windows Actions)
    let actionResultContext = '';
    try {
      const actionResult = await this.windowsService.handlePotentialIntent(queryText);
      if (actionResult && actionResult.executed) {
        actionResultContext = actionResult.output || actionResult.action;
        this.logger.log(`✅ [ACTION EXECUTED]: ${actionResult.action} -> ${actionResult.output}`);
      } else {
        this.logger.log(`ℹ️ [NO OS ACTION]: Mensaje tratado puramente como diálogo conversacional.`);
      }
    } catch (actErr) {
      this.logger.error(`❌ [ACTION FAILED]: ${actErr.message}`);
    }

    // 2. Si no es una acción de Windows, verificar si es una consulta de clima en tiempo real
    if (!actionResultContext) {
      try {
        const weatherInfo = await this.weatherService.getWeatherContext(queryText);
        if (weatherInfo) {
          actionResultContext = weatherInfo;
          this.logger.log(`🌦️ [WEATHER CONTEXT RETRIEVED]: ${weatherInfo}`);
        }
      } catch (wErr) {
        this.logger.warn(`Could not retrieve weather context: ${wErr.message}`);
      }
    }

    // 2. Retrieve RAG context & memories in parallel
    const [knowledge, memories] = await Promise.all([
      this.ragService.searchKnowledge(queryText).catch(() => []),
      this.ragService.searchMemories(queryText).catch(() => []),
    ]);

    // 3. Cargar historial de conversación persistido desde PostgreSQL
    const clientHistory = await this.ragService.loadConversationHistory(this.SESSION_ID, 12);

    // 4. Stream tokens con pipeline paralelo de TTS en tiempo real
    //    - Umbral agresivo: primera frase se despacha con apenas 10 chars + puntuación
    //    - Comas siempre cortan para mantener la latencia baja
    //    - Pre-fetch: se sintetiza el siguiente chunk MIENTRAS el actual se emite
    let sentenceBuffer = '';
    let fullAssistantResponse = '';
    let chunkIndex = 0;

    // Pipeline de pre-fetch: sintetiza hasta 2 frases en paralelo manteniendo el orden FIFO
    const pendingAudioSlots: Promise<{ idx: number; audio: Buffer | null; text: string }>[] = [];
    let emitQueue = Promise.resolve();

    const dispatchAudioChunk = (sentence: string) => {
      const cleanSentence = sentence.trim();
      if (cleanSentence.length < 2) return;

      const myIdx = chunkIndex++;

      // Lanzar síntesis inmediatamente (pre-fetch paralelo)
      const synthesisPromise = this.ttsService
        .synthesizeSentence(cleanSentence)
        .then((buf) => ({ idx: myIdx, audio: buf, text: cleanSentence }))
        .catch((err) => {
          this.logger.warn(`TTS chunk #${myIdx} failed: ${err.message}`);
          return { idx: myIdx, audio: null as Buffer | null, text: cleanSentence };
        });

      pendingAudioSlots.push(synthesisPromise);

      // Emitir en orden FIFO estricto, pero la síntesis ya corre en paralelo
      emitQueue = emitQueue.then(async () => {
        const result = await synthesisPromise;
        if (result.audio && result.audio.length > 0) {
          this.logger.log(`🔊 [TTS #${result.idx}] (${result.audio.length} bytes) -> "${result.text}"`);
          client.emit('audio_chunk', result.audio.toString('base64'));
        }
      });
    };

    const stream = this.llmService.streamResponse(
      queryText,
      knowledge,
      memories,
      actionResultContext,
      clientHistory,
    );

    for await (const token of stream) {
      sentenceBuffer += token;
      fullAssistantResponse += token;
      client.emit('text_token', token);

      // Corte agresivo: siempre usar comas como delimitadores para mantener baja la latencia
      // Para el primerísimo chunk, cortar con apenas 10 chars + cualquier puntuación
      const minLength = chunkIndex === 0 ? 10 : 20;

      if (sentenceBuffer.length > minLength) {
        const splitRegex = /([,;:.?!\n]+)/;
        const match = splitRegex.exec(sentenceBuffer);
        if (match) {
          const sentenceEndIndex = match.index + match[0].length;
          const completeSentence = sentenceBuffer.substring(0, sentenceEndIndex).trim();
          sentenceBuffer = sentenceBuffer.substring(sentenceEndIndex);

          dispatchAudioChunk(completeSentence);
        }
      }
    }

    // Procesar cualquier remanente del buffer
    if (sentenceBuffer.trim().length >= 2) {
      dispatchAudioChunk(sentenceBuffer.trim());
    }

    // Esperar a que toda la cola de emisión en orden termine
    await emitQueue;

    // 5. Persistir turnos de conversación en PostgreSQL
    await this.ragService.saveConversationTurn(this.SESSION_ID, 'user', queryText);
    if (fullAssistantResponse.trim()) {
      await this.ragService.saveConversationTurn(this.SESSION_ID, 'assistant', fullAssistantResponse.trim());
    }

    // Notify client that response generation finished
    client.emit('response_finished');
  }

  /**
   * Reset conversation history
   */
  @SubscribeMessage('clear_history')
  async handleClearHistory(@ConnectedSocket() client: Socket) {
    await this.ragService.clearConversationHistory(this.SESSION_ID);
    this.logger.log(`Cleared persistent conversation history for session: ${this.SESSION_ID}`);
    return { success: true };
  }

  /**
   * Handle raw audio from client microphone, transcribe with Whisper STT and process
   */
  @SubscribeMessage('voice_command_audio')
  async handleVoiceAudio(
    @MessageBody() audioPayload: { buffer: string | Buffer; rate?: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const rawBuffer =
        typeof audioPayload.buffer === 'string'
          ? Buffer.from(audioPayload.buffer, 'base64')
          : Buffer.from(audioPayload.buffer);

      const rate = audioPayload.rate || 16000;
      const transcript = await this.sttService.transcribeAudio(rawBuffer, rate);

      if (transcript && transcript.trim().length > 0) {
        client.emit('stt_transcription', transcript);
        await this.handleVoiceText(transcript, client);
      } else {
        client.emit('stt_transcription', '');
        client.emit('response_finished');
      }
    } catch (err) {
      this.logger.error(`Error processing voice audio: ${err.message}`);
      client.emit('error', { message: 'Error transcribiendo audio' });
    }
  }

  /**
   * Save user memory
   */
  @SubscribeMessage('save_memory')
  async handleSaveMemory(@MessageBody() payload: { text: string; category?: string }) {
    if (payload?.text) {
      await this.ragService.saveMemory(payload.text, payload.category || 'general');
      return { success: true };
    }
    return { success: false };
  }

  /**
   * Save knowledge document
   */
  @SubscribeMessage('save_knowledge')
  async handleSaveKnowledge(@MessageBody() payload: { content: string; metadata?: any }) {
    if (payload?.content) {
      await this.ragService.saveKnowledge(payload.content, payload.metadata || {});
      return { success: true };
    }
    return { success: false };
  }

  /**
   * Re-sync all markdown files from knowledge/ directory
   */
  @SubscribeMessage('sync_knowledge')
  async handleSyncKnowledge() {
    this.logger.log('Received manual request to sync knowledge base.');
    const result = await this.knowledgeIngestService.syncKnowledgeDirectory();
    return { success: true, ...result };
  }
}
