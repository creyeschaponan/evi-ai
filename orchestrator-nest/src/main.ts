import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const logger = new Logger('EviBootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Servir archivos estáticos del frontend futurista en http://localhost:3000
  const publicPath = join(__dirname, '..', 'public');
  app.useStaticAssets(publicPath);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 EVI Web Dashboard & Orchestrator running on http://localhost:${port}`);
  logger.log(`📡 WebSocket Gateway ready for connections`);
}

bootstrap();
