import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JarvisModule } from './jarvis/jarvis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env', '.env'],
    }),
    JarvisModule,
  ],
})
export class AppModule {}
