import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';

export interface McpToolResponse {
  success: boolean;
  text: string;
  source: 'gmail' | 'calendar' | 'drive' | 'none';
  raw?: any;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessageDetail {
  id: string;
  snippet: string;
  internalDate: string;
  payload?: {
    headers: GmailHeader[];
  };
}

@Injectable()
export class GoogleMcpService {
  private readonly logger = new Logger(GoogleMcpService.name);

  constructor(private readonly googleAuth: GoogleAuthService) {}

  /**
   * Consulta Gmail directamente mediante la API oficial de Google (100% Nativo, sin intermediarios)
   */
  async queryGmail(userQuery: string, isRetry = false): Promise<McpToolResponse> {
    const token = await this.googleAuth.getAccessToken();

    if (!token) {
      return {
        success: false,
        text: 'Aún no has configurado tus credenciales de Google Workspace en el archivo .env.',
        source: 'gmail',
      };
    }

    try {
      this.logger.log(`📬 [GMAIL API DIRECTA] Consultando bandeja de entrada para: "${userQuery}"...`);

      // 1. Obtener lista de mensajes (máximo 8 más recientes)
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8`;
      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!listRes.ok) {
        // Si el token expiró (401), renovar y reintentar una vez
        if (listRes.status === 401 && !isRetry) {
          this.logger.warn('🔄 Token expirado en Gmail API. Renovando automáticamente vía API...');
          const freshToken = await this.googleAuth.forceRefreshToken();
          if (freshToken) {
            return this.queryGmail(userQuery, true);
          }
        }
        const errText = await listRes.text();
        this.logger.error(`Error al listar mensajes de Gmail (${listRes.status}): ${errText}`);
        return {
          success: false,
          text: 'No se pudo acceder a tu bandeja de Gmail.',
          source: 'gmail',
        };
      }

      const listData = await listRes.json();
      const messages: Array<{ id: string }> = listData.messages || [];

      if (messages.length === 0) {
        return {
          success: true,
          text: 'No tienes correos nuevos o recientes en tu bandeja de entrada.',
          source: 'gmail',
        };
      }

      // 2. Obtener detalles de cada correo en paralelo (Subject, From, Date, Snippet)
      const detailsPromises = messages.slice(0, 6).map(async (msg) => {
        try {
          const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
          const detailRes = await fetch(detailUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (detailRes.ok) {
            return (await detailRes.json()) as GmailMessageDetail;
          }
        } catch {
          // Ignorar fallo individual
        }
        return null;
      });

      const details = (await Promise.all(detailsPromises)).filter((d): d is GmailMessageDetail => d !== null);

      // 3. Formatear los correos para la voz de EVI
      const emailSummaries = details.map((d, index) => {
        const headers = d.payload?.headers || [];
        const fromHeader = headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Remitente desconocido';
        const subjectHeader = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || 'Sin asunto';
        
        // Limpiar el remitente (ej. "GitHub <notifications@github.com>" -> "GitHub")
        const cleanFrom = fromHeader.replace(/<.*?>/, '').trim().replace(/"/g, '');
        const snippet = (d.snippet || '').slice(0, 140).replace(/&[a-z]+;/gi, ' ').trim();

        // Extraer hora local aproximada
        let timeStr = '';
        if (d.internalDate) {
          const emailDate = new Date(parseInt(d.internalDate, 10));
          timeStr = emailDate.toLocaleTimeString('es-PE', {
            timeZone: 'America/Lima',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        }

        return `Correo ${index + 1}: De ${cleanFrom}. Asunto: "${subjectHeader}". ${timeStr ? `Llegó a las ${timeStr}. ` : ''}Resumen: ${snippet}`;
      });

      const totalCount = messages.length;
      const formattedResponse = 
        `Tienes ${totalCount} correos recientes en tu bandeja de entrada. ` +
        emailSummaries.join(' | ');

      this.logger.log(`✅ [GMAIL API DIRECTA]: ${details.length} correos procesados con éxito.`);

      return {
        success: true,
        text: formattedResponse,
        source: 'gmail',
        raw: details,
      };
    } catch (error: any) {
      this.logger.error(`Excepción en Gmail API Directa: ${error.message}`);
      return {
        success: false,
        text: `Ocurrió un error al consultar tus correos: ${error.message}`,
        source: 'gmail',
      };
    }
  }

  /**
   * Alias de compatibilidad
   */
  async getRecentEmailsSummary(count: number = 10, customPrompt?: string): Promise<McpToolResponse> {
    return this.queryGmail(customPrompt || `Resume todos los correos más recientes`);
  }

  /**
   * Consulta Google Calendar directamente mediante la API oficial de Google
   */
  async getTodayCalendarSummary(isRetry = false): Promise<McpToolResponse> {
    const token = await this.googleAuth.getAccessToken();

    if (!token) {
      return {
        success: false,
        text: 'Aún no has configurado tus credenciales de Google Workspace en .env.',
        source: 'calendar',
      };
    }

    try {
      this.logger.log('📅 [CALENDAR API DIRECTA] Consultando agenda de hoy...');
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startOfDay)}&timeMax=${encodeURIComponent(endOfDay)}&singleEvents=true&orderBy=startTime`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 401 && !isRetry) {
          this.logger.warn('🔄 Token expirado en Calendar API. Renovando...');
          const freshToken = await this.googleAuth.forceRefreshToken();
          if (freshToken) {
            return this.getTodayCalendarSummary(true);
          }
        }
        return {
          success: false,
          text: 'No se pudo acceder a Google Calendar.',
          source: 'calendar',
        };
      }

      const data = await response.json();
      const items: any[] = data.items || [];

      if (items.length === 0) {
        return {
          success: true,
          text: 'No tienes eventos ni reuniones agendadas en tu calendario para hoy.',
          source: 'calendar',
        };
      }

      const eventsSummary = items.map((ev, i) => {
        const summary = ev.summary || 'Evento sin título';
        const start = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'todo el día';
        return `Evento ${i + 1}: "${summary}" a las ${start}.`;
      }).join(' ');

      return {
        success: true,
        text: `Tienes ${items.length} eventos para hoy: ${eventsSummary}`,
        source: 'calendar',
        raw: items,
      };
    } catch (error: any) {
      return {
        success: false,
        text: `Error al consultar tu calendario: ${error.message}`,
        source: 'calendar',
      };
    }
  }

  /**
   * Consulta Google Drive directamente mediante la API oficial de Google
   */
  async queryDrive(userQuery: string, isRetry = false): Promise<McpToolResponse> {
    const token = await this.googleAuth.getAccessToken();

    if (!token) {
      return {
        success: false,
        text: 'Aún no has configurado tus credenciales de Google Workspace en .env.',
        source: 'drive',
      };
    }

    try {
      this.logger.log(`📁 [GOOGLE DRIVE API] Consultando archivos para: "${userQuery}"...`);
      const url = `https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=modifiedTime%20desc`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 401 && !isRetry) {
          this.logger.warn('🔄 Token expirado en Drive API. Renovando...');
          const freshToken = await this.googleAuth.forceRefreshToken();
          if (freshToken) {
            return this.queryDrive(userQuery, true);
          }
        }
        return {
          success: false,
          text: 'No se pudo acceder a tus archivos de Google Drive.',
          source: 'drive',
        };
      }

      const data = await response.json();
      const files: any[] = data.files || [];

      if (files.length === 0) {
        return {
          success: true,
          text: 'No tienes archivos recientes en tu Google Drive.',
          source: 'drive',
        };
      }

      const filesSummary = files.slice(0, 5).map((f, i) => {
        const name = f.name || 'Archivo sin nombre';
        const date = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('es-PE') : '';
        return `Archivo ${i + 1}: "${name}" (${date}).`;
      }).join(' ');

      return {
        success: true,
        text: `Tienes ${files.length} archivos recientes en Google Drive: ${filesSummary}`,
        source: 'drive',
        raw: files,
      };
    } catch (error: any) {
      return {
        success: false,
        text: `Error al consultar Google Drive: ${error.message}`,
        source: 'drive',
      };
    }
  }

  /**
   * Ejecuta una consulta genérica con fallback inteligente a API nativa o Groq MCP
   */
  async queryWorkspaceMcp(
    connectorId: 'connector_gmail' | 'connector_googlecalendar' | 'connector_googledrive',
    serverLabel: string,
    userInput: string
  ): Promise<McpToolResponse> {
    if (connectorId === 'connector_gmail') {
      return this.queryGmail(userInput);
    }
    if (connectorId === 'connector_googlecalendar') {
      return this.getTodayCalendarSummary();
    }
    if (connectorId === 'connector_googledrive') {
      return this.queryDrive(userInput);
    }
    return {
      success: false,
      text: 'Conector no soportado.',
      source: 'none',
    };
  }
}
