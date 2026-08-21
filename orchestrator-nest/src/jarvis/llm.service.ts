import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private openai: OpenAI;
  private readonly modelName = process.env.LLM_MODEL || 'qwen3-8b';

  constructor() {
    const baseURL = process.env.LLM_API_URL || 'http://localhost:8080/v1';
    const apiKey = process.env.LLM_API_KEY || 'not-needed';
    this.openai = new OpenAI({ baseURL, apiKey });
    this.logger.log(`Initialized LLM client pointing to ${baseURL}`);
  }

  async *streamResponse(
    userQuery: string,
    ragContext: string[] = [],
    memoriesContext: string[] = [],
    actionContext?: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
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

    try {
      const stream = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          ...formattedHistory,
          { role: 'user', content: userQuery },
        ],
        stream: true,
        temperature: 0.4,
      });

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
      this.logger.error(`Error streaming LLM response: ${error.message}`);
      yield 'Tuve una pequeña interferencia en el modelo, pero ya estoy lista.';
    }
  }
}
