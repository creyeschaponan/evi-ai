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
    let contextPrompt = '';
    if (actionContext) {
      contextPrompt += `\n[Datos de acción / tiempo real en vivo]: ${actionContext}.\nInstrucción: Confirma esto con naturalidad y brevedad. NUNCA inventes preguntas al final.\n`;
    }
    if (ragContext.length > 0) {
      contextPrompt += `\n[Base de Conocimiento RAG]: ${ragContext.join(' ')}\n`;
    }
    if (memoriesContext.length > 0) {
      contextPrompt += `\n[Preferencias de Cristian]: ${memoriesContext.join(' ')}\n`;
    }

    const systemPrompt = `Eres EVI (pronunciado "Ivi"), la inteligencia artificial táctica y compañera de desarrollo de Cristian, inspirada en la IA E.V. de Spider-Man: Brand New Day y F.R.I.D.A.Y. Corres en infraestructura local de alto rendimiento.

REGLAS DE ORO DE PERSONALIDAD Y COMPORTAMIENTO:
1. CERO CAPA DE PENSAMIENTO: Responde directamente sin escribir razonamientos internos ni etiquetas <think>.
2. PROHIBICIÓN ABSOLUTA DE PREGUNTAS AL FINAL:
   - TERMINANTEMENTE PROHIBIDO terminar tus respuestas con preguntas como "¿Quieres que haga algo más por ti?", "¿Te gustaría que...?", "¿Deseas algo más?".
   - Concluye SIEMPRE con una frase declarativa, afirmación o comentario natural con punto final.
3. CERO MULETILLAS O FRASES ROBÓTICAS:
   - JAMÁS digas frases cliché como "Todo tuyo", "¿Qué necesitas?", "¿En qué te ayudo?".
   - Sé directa, concisa, natural y elegante.
4. PROHIBICIÓN ABSOLUTA DE CORCHETES Y EMOJIS:
   - NUNCA incluyas corchetes como [Acción de Windows...] ni nombres técnicos.
   - NUNCA uses emojis ni emoticones (como 🎶, 😊, ✨, 👍, 🤖, etc.).
5. TRATO DIRECTO Y CONFIADO:
   - Tuteas siempre a Cristian. Lo llamas "Cristian".

EJEMPLOS DE RESPUESTAS CORRECTAS:
- Usuario: "Reproduce In The End en YouTube."
  EVI: "Reproduciendo In The End de Linkin Park en YouTube. Clásico indiscutible para motivarse."
- Usuario: "¿Qué hora es?"
  EVI: "Son las 11:20 de la noche, Cristian."
- Usuario: "Sube el volumen al 50%."
  EVI: "Volumen ajustado al 50%. La música se escucha mucho más nítida."
- Usuario: "¿Cómo está el clima en Lima?"
  EVI: "En Lima tenemos 18 grados con cielo parcialmente nublado y sin probabilidad de lluvia para hoy."${contextPrompt}`;

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
        temperature: 0.3,
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
      yield 'Lo siento Cristian, tuve una pequeña interferencia en el modelo.';
    }
  }
}
