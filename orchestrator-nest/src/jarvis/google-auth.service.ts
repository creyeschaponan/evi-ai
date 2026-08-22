import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAuthService.name);
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  async onModuleInit() {
    // Intentar obtener/renovar el token al iniciar el servidor
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
    return Boolean(this.cachedAccessToken || this.hasRefreshTokenConfig() || process.env.GOOGLE_ACCESS_TOKEN);
  }

  /**
   * Obtiene un Access Token válido, renovándolo automáticamente si está vencido o por vencer
   */
  async getAccessToken(): Promise<string | null> {
    const now = Date.now();

    // Si el token en caché es válido por más de 3 minutos
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 180 * 1000) {
      return this.cachedAccessToken;
    }

    // Si podemos renovarlo automáticamente con Refresh Token
    if (this.hasRefreshTokenConfig()) {
      const refreshedToken = await this.forceRefreshToken();
      if (refreshedToken) {
        return refreshedToken;
      }
    }

    // Fallback a variable de entorno directa
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
      this.logger.warn('No se puede renovar token: faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REFRESH_TOKEN.');
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
