import { Controller, Post, Get, Body, Query, Res, Req, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { JarvisGateway } from './jarvis.gateway';
import { RagService } from './rag.service';
import { GoogleAuthService } from './google-auth.service';

@Controller('api')
export class JarvisController {
  private readonly logger = new Logger(JarvisController.name);

  constructor(
    private readonly jarvisGateway: JarvisGateway,
    private readonly ragService: RagService,
    private readonly googleAuth: GoogleAuthService,
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

  /**
   * Inicia el flujo de autorización OAuth 2.0 con Google
   */
  @Get('auth/google/login')
  googleLogin(@Req() req: Request, @Res() res: Response) {
    try {
      // Detectar si la petición viene de https://evi.lambak.lat o localhost
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const origin = `${protocol}://${host}`;

      const authUrl = this.googleAuth.getAuthUrl(origin);
      this.logger.log(`Iniciando Google OAuth Login -> Redirigiendo a Google (Origin: ${origin})`);
      return res.redirect(authUrl);
    } catch (err: any) {
      this.logger.error(`Error al generar Auth URL: ${err.message}`);
      return res.status(500).send(`Error al iniciar Google Auth: ${err.message}`);
    }
  }

  /**
   * Callback donde Google devuelve el código de autorización
   */
  @Get('auth/google/callback')
  async googleCallback(@Query('code') code: string, @Query('error') error: string, @Req() req: Request, @Res() res: Response) {
    if (error) {
      this.logger.error(`Google OAuth denegado por el usuario: ${error}`);
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>EVI - Google Auth</title><style>body{background:#0a0c10;color:#ff3366;font-family:sans-serif;text-align:center;padding:50px;}</style></head>
        <body>
          <h2>❌ Autorización cancelada</h2>
          <p>No se concedieron permisos para acceder a Google Workspace.</p>
          <button onclick="window.close()" style="padding:10px 20px;background:#ff3366;color:#fff;border:none;border-radius:4px;cursor:pointer;">Cerrar</button>
        </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send('Código de autorización no proporcionado.');
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const origin = `${protocol}://${host}`;

    const result = await this.googleAuth.handleOAuthCallback(code, origin);

    if (result.success) {
      // Notificar a todos los HUDs conectados vía WebSocket
      this.jarvisGateway.server?.emit('google_workspace_status', { configured: true });

      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>EVI - Google Workspace Conectado</title>
          <style>
            body { background: #07090e; color: #00f0ff; font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: rgba(0,240,255,0.05); border: 1px solid #00f0ff; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 0 30px rgba(0,240,255,0.2); max-width: 450px; }
            h1 { color: #00ff88; margin-top: 0; font-size: 24px; letter-spacing: 2px; }
            p { color: #c0d0e0; font-size: 15px; line-height: 1.5; }
            .btn { margin-top: 20px; background: linear-gradient(135deg, #00f0ff, #00ff88); color: #000; font-weight: bold; border: none; padding: 12px 28px; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✅ GOOGLE WORKSPACE ACTIVO</h1>
            <p>Tu cuenta de Gmail y Google Calendar ha sido vinculada exitosamente con <strong>E.V.I.</strong></p>
            <p style="font-size:12px; color:#708090;">El token se ha guardado permanentemente. Puedes cerrar esta pestaña.</p>
            <a href="${origin}" class="btn">VOLVER AL COCKPIT HUD</a>
          </div>
          <script>
            // Cerrar automáticamente si es un popup o volver tras 3 segundos
            if (window.opener) {
              setTimeout(() => window.close(), 1500);
            }
          </script>
        </body>
        </html>
      `);
    } else {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>EVI - Error</title><style>body{background:#0a0c10;color:#ff3366;font-family:sans-serif;text-align:center;padding:50px;}</style></head>
        <body>
          <h2>❌ Error al canjear el token</h2>
          <p>${result.message}</p>
          <a href="${origin}" style="color:#00f0ff;">Volver a intentarlo</a>
        </body>
        </html>
      `);
    }
  }

  /**
   * Estado de conexión de Google Workspace
   */
  @Get('auth/google/status')
  googleStatus() {
    return {
      configured: this.googleAuth.isConfigured(),
      timestamp: Date.now(),
    };
  }
}
