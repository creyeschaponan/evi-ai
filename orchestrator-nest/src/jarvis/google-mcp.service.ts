import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';

export interface McpToolResponse {
  success: boolean;
  text: string;
  source: 'gmail' | 'calendar' | 'drive' | 'none';
  raw?: any;
}

@Injectable()
export class GoogleMcpService {
  private readonly logger = new Logger(GoogleMcpService.name);
  private readonly GROQ_RESPONSES_URL = 'https://api.groq.com/openai/v1/responses';

  constructor(private readonly googleAuth: GoogleAuthService) {}

  /**
   * Consulta Gmail de forma dinámica y exhaustiva según la petición del usuario
   */
  async queryGmail(userQuery: string): Promise<McpToolResponse> {
    const token = await this.googleAuth.getAccessToken();

    if (!token) {
      return {
        success: false,
        text: 'Aún no has configurado tu token de Google Workspace en el archivo .env.',
        source: 'gmail',
      };
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return {
        success: false,
        text: 'La clave de API de Groq Cloud (GROQ_API_KEY) no está configurada.',
        source: 'gmail',
      };
    }

    const now = new Date();
    const currentTimeLima = now.toLocaleTimeString('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const currentDateLima = now.toLocaleDateString('es-PE', {
      timeZone: 'America/Lima',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const prompt =
      `Hora actual del usuario en Lima, Perú: ${currentTimeLima} (${currentDateLima}). ` +
      `Consulta la bandeja de Gmail del usuario para responder con precisión a su consulta: "${userQuery}". ` +
      `\n\nINSTRUCCIONES CLAVE DE BÚSQUEDA MCP:` +
      `\n- Si el usuario pregunta por un remitente específico (ejemplo: LinkedIn, GitHub, Google, bancos, reclutadores, etc.) o un tema particular, realiza una búsqueda exhaustiva usando los filtros y herramientas de búsqueda de Gmail para encontrar TODOS los correos pertinentes.` +
      `\n- Si pide "los correos de hoy" o "todos mis correos", busca y lista todos los correos recibidos hoy sin cortarlos ni limitarte a unos pocos.` +
      `\n- Revisa la bandeja con atención para no omitir correos existentes.` +
      `\n\nREGLAS OBLIGATORIAS DE FORMATO PARA VOZ (EVI):` +
      `\n1. NUNCA uses tablas Markdown (|---|---|) ni bloques de código.` +
      `\n2. NO menciones fechas completas en formato ISO/UTC ni segundos. Convierte las marcas de tiempo a la hora local de Perú (UTC-5) y menciona solo la hora y minutos (ejemplo: "a las 9:38 de la noche", "a las 8:35 p.m.", "a las 7:51 p.m.").` +
      `\n3. Para cada correo encontrado, di en una frase fluida y concisa: quién lo envía, a qué hora llegó y de qué trata.` +
      `\n4. Sé directa, clara y natural para síntesis de voz.`;

    try {
      this.logger.log(`Conectando con Groq MCP Gmail Connector para consulta: "${userQuery}"...`);
      const response = await fetch(this.GROQ_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          tools: [
            {
              type: 'mcp',
              server_label: 'Gmail',
              connector_id: 'connector_gmail',
              authorization: token,
              require_approval: 'never',
            },
          ],
          input: prompt,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        this.logger.error(`Error en Groq MCP Responses API (${response.status}): ${errBody}`);
        return {
          success: false,
          text: `Hubo un inconveniente al consultar Gmail a través del conector MCP: ${response.statusText}.`,
          source: 'gmail',
        };
      }

      const data = await response.json();
      let outputText = data.output_text;

      if (!outputText && Array.isArray(data.output)) {
        const assistantMsg = data.output.find((item: any) => item.type === 'message' && item.role === 'assistant');
        if (assistantMsg && Array.isArray(assistantMsg.content)) {
          const textObj = assistantMsg.content.find((c: any) => c.type === 'output_text' || typeof c.text === 'string');
          if (textObj) {
            outputText = textObj.text;
          }
        }
      }

      if (!outputText && data.choices?.[0]?.message?.content) {
        outputText = data.choices[0].message.content;
      }

      if (!outputText) {
        outputText = typeof data === 'string' ? data : JSON.stringify(data);
      }

      this.logger.log(`✅ [GROQ MCP GMAIL]: Respuesta obtenida (${outputText.length} caracteres).`);

      return {
        success: true,
        text: outputText,
        source: 'gmail',
        raw: data,
      };
    } catch (error: any) {
      this.logger.error(`Excepción al invocar Groq MCP Gmail: ${error.message}`);
      return {
        success: false,
        text: `Ocurrió un error de conexión con el conector de Gmail: ${error.message}`,
        source: 'gmail',
      };
    }
  }

  /**
   * Alias de compatibilidad
   */
  async getRecentEmailsSummary(count: number = 10, customPrompt?: string): Promise<McpToolResponse> {
    return this.queryGmail(customPrompt || `Resume todos los correos más recientes recibidos hoy`);
  }

  /**
   * Consulta la agenda de Google Calendar del día de hoy usando Groq MCP
   */
  async getTodayCalendarSummary(): Promise<McpToolResponse> {
    const token = await this.googleAuth.getAccessToken();

    if (!token) {
      return {
        success: false,
        text: 'Aún no has configurado tu token de Google Workspace en .env.',
        source: 'calendar',
      };
    }

    const groqKey = process.env.GROQ_API_KEY;
    const prompt = 'Revisa mi calendario de Google para el día de hoy y resume todas las reuniones, eventos o citas agendadas con su hora de inicio.';

    try {
      this.logger.log('Conectando con Groq MCP Google Calendar Connector...');
      const response = await fetch(this.GROQ_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          tools: [
            {
              type: 'mcp',
              server_label: 'Google Calendar',
              connector_id: 'connector_googlecalendar',
              authorization: token,
              require_approval: 'never',
            },
          ],
          input: prompt,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        this.logger.error(`Error en Groq MCP Calendar API: ${errBody}`);
        return {
          success: false,
          text: `No se pudo acceder a Google Calendar mediante MCP: ${response.statusText}`,
          source: 'calendar',
        };
      }

      const data = await response.json();
      let outputText = data.output_text;

      if (!outputText && Array.isArray(data.output)) {
        const assistantMsg = data.output.find((item: any) => item.type === 'message' && item.role === 'assistant');
        if (assistantMsg && Array.isArray(assistantMsg.content)) {
          const textObj = assistantMsg.content.find((c: any) => c.type === 'output_text' || typeof c.text === 'string');
          if (textObj) {
            outputText = textObj.text;
          }
        }
      }

      if (!outputText && data.choices?.[0]?.message?.content) {
        outputText = data.choices[0].message.content;
      }

      if (!outputText) {
        outputText = typeof data === 'string' ? data : JSON.stringify(data);
      }

      return {
        success: true,
        text: outputText,
        source: 'calendar',
        raw: data,
      };
    } catch (error: any) {
      return {
        success: false,
        text: `Error de red al consultar Google Calendar: ${error.message}`,
        source: 'calendar',
      };
    }
  }

  /**
   * Ejecuta una consulta genérica a cualquier conector de Google Workspace
   */
  async queryWorkspaceMcp(
    connectorId: 'connector_gmail' | 'connector_googlecalendar' | 'connector_googledrive',
    serverLabel: string,
    userInput: string
  ): Promise<McpToolResponse> {
    const token = await this.googleAuth.getAccessToken();
    const groqKey = process.env.GROQ_API_KEY;

    if (!token || !groqKey) {
      return {
        success: false,
        text: 'Faltan credenciales de Google o de Groq Cloud para ejecutar el conector MCP.',
        source: connectorId.includes('gmail') ? 'gmail' : connectorId.includes('calendar') ? 'calendar' : 'drive',
      };
    }

    try {
      const response = await fetch(this.GROQ_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          tools: [
            {
              type: 'mcp',
              server_label: serverLabel,
              connector_id: connectorId,
              authorization: token,
              require_approval: 'never',
            },
          ],
          input: userInput,
        }),
      });

      const data = await response.json();
      let outputText = data.output_text;

      if (!outputText && Array.isArray(data.output)) {
        const assistantMsg = data.output.find((item: any) => item.type === 'message' && item.role === 'assistant');
        if (assistantMsg && Array.isArray(assistantMsg.content)) {
          const textObj = assistantMsg.content.find((c: any) => c.type === 'output_text' || typeof c.text === 'string');
          if (textObj) {
            outputText = textObj.text;
          }
        }
      }

      if (!outputText && data.choices?.[0]?.message?.content) {
        outputText = data.choices[0].message.content;
      }

      if (!outputText) {
        outputText = typeof data === 'string' ? data : JSON.stringify(data);
      }

      return {
        success: response.ok,
        text: outputText,
        source: connectorId.includes('gmail') ? 'gmail' : connectorId.includes('calendar') ? 'calendar' : 'drive',
        raw: data,
      };
    } catch (err: any) {
      return {
        success: false,
        text: `Error ejecutando conector MCP: ${err.message}`,
        source: 'none',
      };
    }
  }
}
