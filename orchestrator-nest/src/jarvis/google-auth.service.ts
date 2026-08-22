import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAuthService.name);
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  async onModuleInit() {
    if (this.hasRefreshTokenConfig()) {
      this.logger.log('🔑 Obteniendo Google OAuth2 Access Token inicial via API...');
      await this.forceRefreshToken();
    } else if (process.env.GOOGLE_ACCESS_TOKEN) {
      this.cachedAccessToken = process.env.GOOGLE_ACCESS_TOKEN.trim();
      this.tokenExpiresAt = Date.now() + 1800 * 1000;
      this.logger.log('Google Access Token cargado desde variables de entorno.');
    }
  }

  hasRefreshTokenConfig(): boolean {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
  }

  isConfigured(): boolean {
    return Boolean(this.cachedAccessToken || this.hasRefreshTokenConfig());
  }

  /**
   * Genera la URL de autorización de Google para el flujo 1-Click Login
   */
  getAuthUrl(redirectOrigin?: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID no está configurado en .env');
    }

    const baseOrigin = redirectOrigin || process.env.APP_URL || 'https://evi.lambak.lat';
    const redirectUri = `${baseOrigin}/api/auth/google/callback`;

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline', // Obligatorio para recibir Refresh Token
      prompt: 'consent',     // Obligatorio para asegurar nuevo Refresh Token
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Procesa el código de autorización recibido de Google y guarda el Refresh Token
   */
  async handleOAuthCallback(code: string, redirectOrigin?: string): Promise<{ success: boolean; message: string }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { success: false, message: 'Faltan credenciales de Google Client en el servidor.' };
    }

    const baseOrigin = redirectOrigin || process.env.APP_URL || 'https://evi.lambak.lat';
    const redirectUri = `${baseOrigin}/api/auth/google/callback`;

    try {
      this.logger.log(`Canjeando Authorization Code con Google OAuth2 (Redirect URI: ${redirectUri})...`);
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code.trim(),
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Error al canjear código OAuth (${response.status}): ${errText}`);
        return { success: false, message: `Error de Google (${response.status}): ${errText}` };
      }

      const data = await response.json();
      if (data.access_token) {
        this.cachedAccessToken = data.access_token;
        const expiresIn = data.expires_in || 3600;
        this.tokenExpiresAt = Date.now() + expiresIn * 1000;

        if (data.refresh_token) {
          process.env.GOOGLE_REFRESH_TOKEN = data.refresh_token;
          this.persistRefreshTokenToEnv(data.refresh_token);
          this.logger.log('🎉 [GOOGLE OAUTH2] ¡Nuevo Refresh Token obtenido y guardado permanentemente en .env!');
        }

        return { success: true, message: 'Cuenta de Google vinculada exitosamente.' };
      }

      return { success: false, message: 'Google no devolvió un access_token válido.' };
    } catch (err: any) {
      this.logger.error(`Excepción en OAuth Callback: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * Persiste el Refresh Token en el archivo .env del proyecto para que sobreviva reinicios
   */
  private persistRefreshTokenToEnv(newRefreshToken: string) {
    try {
      const rootEnvPath = path.resolve(process.cwd(), '..', '.env');
      const localEnvPath = path.resolve(process.cwd(), '.env');
      const targetPaths = [rootEnvPath, localEnvPath];

      for (const envFile of targetPaths) {
        if (fs.existsSync(envFile)) {
          let content = fs.readFileSync(envFile, 'utf8');
          if (content.includes('GOOGLE_REFRESH_TOKEN=')) {
            content = content.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${newRefreshToken}`);
          } else {
            content += `\nGOOGLE_REFRESH_TOKEN=${newRefreshToken}\n`;
          }
          fs.writeFileSync(envFile, content, 'utf8');
          this.logger.log(`Archivo .env actualizado: ${envFile}`);
        }
      }
    } catch (e: any) {
      this.logger.warn(`No se pudo escribir en el archivo .env: ${e.message}`);
    }
  }

  /**
   * Obtiene un Access Token válido, renovándolo automáticamente si está vencido o por vencer
   */
  async getAccessToken(): Promise<string | null> {
    const now = Date.now();

    if (this.cachedAccessToken && this.tokenExpiresAt > now + 180 * 1000) {
      return this.cachedAccessToken;
    }

    if (this.hasRefreshTokenConfig()) {
      const refreshedToken = await this.forceRefreshToken();
      if (refreshedToken) {
        return refreshedToken;
      }
    }

    return this.cachedAccessToken || process.env.GOOGLE_ACCESS_TOKEN || null;
  }

  /**
   * Fuerza la renovación del Access Token contactando directamente con Google OAuth2 API
   */
  async forceRefreshToken(): Promise<string | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      return this.cachedAccessToken;
    }

    try {
      this.logger.log('🔄 Renovando Google OAuth2 Access Token vía API de Google...');
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`❌ Error al renovar Google Access Token (${response.status}): ${errText}`);
        return this.cachedAccessToken;
      }

      const data = await response.json();
      if (data.access_token) {
        this.cachedAccessToken = data.access_token;
        const expiresIn = data.expires_in || 3600;
        this.tokenExpiresAt = Date.now() + expiresIn * 1000;
        this.logger.log(`✅ [GOOGLE OAUTH2] Nuevo Access Token obtenido exitosamente (Válido por ${expiresIn}s).`);
        return this.cachedAccessToken;
      }
    } catch (err: any) {
      this.logger.error(`❌ Error de red al conectar con Google OAuth2: ${err.message}`);
    }

    return this.cachedAccessToken;
  }

  setAccessToken(token: string, expiresInSeconds: number = 3600): void {
    this.cachedAccessToken = token.trim();
    this.tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
    this.logger.log(`Google Access Token establecido manualmente (Válido por ${expiresInSeconds}s).`);
  }
}
