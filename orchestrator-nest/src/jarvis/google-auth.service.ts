import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    if (process.env.GOOGLE_ACCESS_TOKEN) {
      this.cachedAccessToken = process.env.GOOGLE_ACCESS_TOKEN.trim();
      // Assume 1 hour validity from startup if provided directly
      this.tokenExpiresAt = Date.now() + 3600 * 1000;
      this.logger.log('Google Access Token cargado desde variables de entorno.');
    }
  }

  isConfigured(): boolean {
    const hasDirectToken = Boolean(this.cachedAccessToken || process.env.GOOGLE_ACCESS_TOKEN);
    const hasRefreshToken = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
    return hasDirectToken || hasRefreshToken;
  }

  async getAccessToken(): Promise<string | null> {
    const now = Date.now();

    // Si tenemos un token en caché y aún no vence (con margen de 2 minutos)
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 120 * 1000) {
      return this.cachedAccessToken;
    }

    // Si hay token directo en process.env que fue actualizado recientemente
    if (process.env.GOOGLE_ACCESS_TOKEN && !this.cachedAccessToken) {
      this.cachedAccessToken = process.env.GOOGLE_ACCESS_TOKEN.trim();
      this.tokenExpiresAt = now + 3600 * 1000;
      return this.cachedAccessToken;
    }

    // Intentar renovar con Refresh Token
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (clientId && clientSecret && refreshToken) {
      try {
        this.logger.log('Renovando Google OAuth2 Access Token automáticamente...');
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
          this.logger.error(`Error al renovar Google Access Token: ${errText}`);
          return this.cachedAccessToken; // Fallback
        }

        const data = await response.json();
        if (data.access_token) {
          this.cachedAccessToken = data.access_token;
          const expiresIn = data.expires_in || 3600;
          this.tokenExpiresAt = Date.now() + expiresIn * 1000;
          this.logger.log(`Google Access Token renovado exitosamente (Expira en ${expiresIn}s).`);
          return this.cachedAccessToken;
        }
      } catch (err: any) {
        this.logger.error(`Error de red al conectar con Google OAuth2: ${err.message}`);
      }
    }

    return this.cachedAccessToken || process.env.GOOGLE_ACCESS_TOKEN || null;
  }

  setAccessToken(token: string, expiresInSeconds: number = 3600): void {
    this.cachedAccessToken = token.trim();
    this.tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
    this.logger.log(`Google Access Token establecido manualmente (Válido por ${expiresInSeconds}s).`);
  }
}
