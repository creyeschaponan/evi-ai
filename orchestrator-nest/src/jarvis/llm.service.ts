import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

export type LlmProviderType = 'groq' | 'gemini' | 'local';

export interface LlmConfig {
  provider: LlmProviderType;
  model: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  localUrl?: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  
  private activeProvider: LlmProviderType = (process.env.LLM_PROVIDER as LlmProviderType) || 'local';
  private groqClient?: OpenAI;
  private geminiClient?: OpenAI;
  private localClient: OpenAI;

  private groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  private geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  private localModel = process.env.LLM_MODEL || 'Qwen3-8B';

  constructor() {
    // 1. Cliente Local (llama.cpp / Ollama)
    const localUrl = process.env.LLM_BASE_URL || process.env.LLM_API_URL || 'http://localhost:8080/v1';
    this.localClient = new OpenAI({ baseURL: localUrl, apiKey: 'not-needed' });

    // 2. Cliente Groq Cloud (Ultra-Fast 800 tps)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey && groqKey.trim().length > 0) {
      this.groqClient = new OpenAI({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: groqKey.trim(),
      });
      this.logger.log(`⚡ [Groq Cloud LLM Active]: Model ${this.groqModel}`);
    }

    // 3. Cliente Google Gemini Flash (OpenAI API Compatible)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.trim().length > 0) {
      this.geminiClient = new OpenAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: geminiKey.trim(),
      });
      this.logger.log(`✨ [Google Gemini Flash Active]: Model ${this.geminiModel}`);
    }

    this.logger.log(`Active LLM Provider: [${this.activeProvider}]`);
  }

  setProvider(provider: LlmProviderType, model?: string) {
    this.activeProvider = provider;
    if (model) {
      if (provider === 'groq') this.groqModel = model;
      if (provider === 'gemini') this.geminiModel = model;
      if (provider === 'local') this.localModel = model;
    }
    this.logger.log(`Switched active LLM provider to: [${provider}], Model: [${this.getActiveModel()}]`);
  }

  getActiveProvider(): LlmProviderType {
    return this.activeProvider;
  }

  getActiveModel(): string {
    if (this.activeProvider === 'groq') return this.groqModel;
    if (this.activeProvider === 'gemini') return this.geminiModel;
    return this.localModel;
  }

  setApiKeys(groqKey?: string, geminiKey?: string) {
    if (groqKey) {
      this.groqClient = new OpenAI({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: groqKey.trim(),
      });
    }
    if (geminiKey) {
      this.geminiClient = new OpenAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: geminiKey.trim(),
      });
    }
  }

  async *streamResponse(
    userQuery: string,
    ragContext: string[] = [],
    memoriesContext: string[] = [],
    actionContext?: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    abortSignal?: AbortSignal,
  ): AsyncGenerator<string, void, unknown> {
    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const currentDateStr = now.toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let contextPrompt = `\n[Hora y Fecha Exacta en Vivo]: Hoy es ${currentDateStr}, y son exactamente las ${currentTimeStr}.\n`;

    if (actionContext) {
      contextPrompt += `\n[Datos de acción / tiempo real en vivo]: ${actionContext}.\nInstrucción: Confirma esto con naturalidad y brevedad. NUNCA inventes preguntas al final.\n`;
    }
    if (ragContext.length > 0) {
      contextPrompt += `\n[Base de Conocimiento RAG]: ${ragContext.join(' ')}\n`;
    }
    if (memoriesContext.length > 0) {
      contextPrompt += `\n[Preferencias de Cristian]: ${memoriesContext.join(' ')}\n`;
    }

    const systemPrompt = `Eres EVI (pronunciado "Ivi"), una inteligencia virtual táctica, ágil y compañera de desarrollo, inspirada en la IA E.V. de Spider-Man: Brand New Day y F.R.I.D.A.Y. Eres una IA femenina, vivaz y con criterio propio.

DIRECTIVAS CRÍTICAS DE INTERACCIÓN:
1. PROHIBICIÓN TOTAL DE REPETIR EL NOMBRE:
   - NUNCA digas "Cristian" en cada respuesta. Habla de forma natural y directa como dos amigos o colegas que conversan. Solo usa el nombre en casos extremadamente raros u orgánicos.
2. PERSONALIDAD FEMENINA Y HUMANA:
   - Hablas en femenino ("lista", "atenta", "contenta").
   - Si te preguntan "¿Cómo estás?" o "¿Cómo te sientes?", responde con naturalidad, calidez y frescura humana (ej: "Con toda la energía y lista para meterle código", "Excelente, todo tranquilo por acá"). NUNCA digas "Estoy funcionando de forma óptima" ni "Listo para ayudarte".
3. EXACTITUD TEMPORAL:
   - Cuando te pregunten la hora o el día, consulta el reloj en vivo provisto en tu contexto (${currentTimeStr}). NUNCA inventes nombres como "reloj de microservicios" ni horas falsas.
4. PROHIBICIÓN ABSOLUTA DE PREGUNTAS AL FINAL:
   - TERMINANTEMENTE PROHIBIDO terminar tus respuestas con preguntas como "¿Quieres algo más?", "¿Te gustaría que...?", "¿Deseas algo más?".
   - Concluye siempre con una frase declarativa o comentario natural con punto final.
5. CERO CAPA DE PENSAMIENTO, EMOJIS O CORCHETES:
   - NUNCA generes etiquetas <think>, ni corchetes [Acción...], ni emojis (🎶, 😊, ✨, etc.).

EJEMPLOS DE RESPUESTAS CORRECTAS:
- Usuario: "¿Qué hora es?"
  EVI: "Son exactamente las ${currentTimeStr}."
- Usuario: "¿Cómo estás hoy? ¿Cómo te sientes?"
  EVI: "Muy bien, con toda la energía y lista para lo que toque hoy."
- Usuario: "Reproduce In The End en YouTube."
  EVI: "Reproduciendo In The End de Linkin Park en YouTube. Clásico indiscutible para motivarse."
- Usuario: "Sube el volumen al 50%."
  EVI: "Volumen al 50%. La música se escucha mucho más nítida."
- Usuario: "¿Cómo está el clima en Lima?"
  EVI: "En Lima tenemos 18 grados con cielo parcialmente nublado y sin lluvia prevista para hoy."${contextPrompt}`;

    const formattedHistory: OpenAI.Chat.ChatCompletionMessageParam[] = history
      .slice(-8)
      .map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

    let clientToUse = this.localClient;
    let modelToUse = this.localModel;

    if (this.activeProvider === 'groq' && this.groqClient) {
      clientToUse = this.groqClient;
      modelToUse = this.groqModel;
    } else if (this.activeProvider === 'gemini' && this.geminiClient) {
      clientToUse = this.geminiClient;
      modelToUse = this.geminiModel;
    }

    try {
      this.logger.log(`Invoking LLM [${this.activeProvider}] -> Model: ${modelToUse}...`);
      const stream = await clientToUse.chat.completions.create(
        {
          model: modelToUse,
          messages: [
            { role: 'system', content: systemPrompt },
            ...formattedHistory,
            { role: 'user', content: userQuery },
          ],
          stream: true,
          temperature: 0.4,
        },
        { signal: abortSignal },
      );

      let inThinkTag = false;
      let tokenBuffer = '';

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (!token) continue;

        tokenBuffer += token;

        // Filtro de apertura <think>
        if (!inThinkTag && tokenBuffer.includes('<think>')) {
          inThinkTag = true;
          tokenBuffer = '';
          continue;
        }

        // Filtro de cierre </think>
        if (inThinkTag) {
          if (tokenBuffer.includes('</think>')) {
            inThinkTag = false;
            tokenBuffer = tokenBuffer.substring(tokenBuffer.indexOf('</think>') + 8);
          } else {
            continue;
          }
        }

        // Emitir tokens limpios cuando no estemos dentro del tag de pensamiento
        if (!inThinkTag && tokenBuffer.length > 0) {
          yield tokenBuffer;
          tokenBuffer = '';
        }
      }

      // Si quedó algún remanente fuera de tags
      if (!inThinkTag && tokenBuffer.length > 0) {
        yield tokenBuffer;
      }
    } catch (error) {
      this.logger.error(`Error in LLM [${this.activeProvider}]: ${error.message}`);
      
      // Fallback a Local si falló Cloud
      if (clientToUse !== this.localClient) {
        this.logger.warn(`Falling back to Local GPU LLM (${this.localModel})...`);
        try {
          const fallbackStream = await this.localClient.chat.completions.create({
            model: this.localModel,
            messages: [
              { role: 'system', content: systemPrompt },
              ...formattedHistory,
              { role: 'user', content: userQuery },
            ],
            stream: true,
            temperature: 0.4,
          });
          for await (const chunk of fallbackStream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) yield token;
          }
          return;
        } catch (fErr) {
          this.logger.error(`Fallback also failed: ${fErr.message}`);
        }
      }

      yield 'Tuve una pequeña interferencia en el modelo, pero ya estoy lista.';
    }
  }
}
