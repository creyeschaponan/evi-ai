import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { JarvisGateway } from './jarvis.gateway';
import { RagService } from './rag.service';

@Controller('api')
export class JarvisController {
  private readonly logger = new Logger(JarvisController.name);

  constructor(
    private readonly jarvisGateway: JarvisGateway,
    private readonly ragService: RagService,
  ) {}

  @Post('wakeword/trigger')
  triggerWakeWord(@Body() payload: { model?: string; score?: number }) {
    const model = payload?.model || 'hey_evi';
    const score = payload?.score !== undefined ? payload.score : 1.0;
    this.logger.log(`⚡ [HTTP POST /api/wakeword/trigger] Model: ${model} (Score: ${score})`);
    this.jarvisGateway.broadcastWakeWord(model, score);
    return { success: true, model, score, timestamp: Date.now() };
  }

  @Get('memories')
  async getMemories() {
    try {
      return await this.ragService.getAllMemories();
    } catch (err: any) {
      this.logger.warn(`Could not get memories: ${err.message}`);
      return [];
    }
  }
}
