import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import axios from 'axios';

@Injectable()
export class RagService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RagService.name);
  private pool: Pool;
  private readonly embeddingUrl = process.env.EMBEDDING_BASE_URL || 'http://localhost:8081/embedding';

  async onModuleInit() {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'jarvis_secret_local_db_pass_2026'}@localhost:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'postgres'}`;

    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
    });

    this.logger.log('Connected to PostgreSQL (pgvector) database.');

    // Asegurar que la tabla de historial conversacional exista
    await this.ensureConversationTable();
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Crear la tabla conversation_turns si no existe
   */
  private async ensureConversationTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS conversation_turns (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL DEFAULT 'default',
        role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_conv_session_time ON conversation_turns (session_id, created_at);
    `;
    try {
      await this.pool.query(sql);
      this.logger.log('Conversation history table ensured.');
    } catch (err) {
      this.logger.warn(`Could not create conversation_turns table: ${err.message}`);
    }
  }

  // =========================================================
  // Conversation History (Persistent Multi-Turn)
  // =========================================================

  /**
   * Guardar un turno de conversación en la base de datos
   */
  async saveConversationTurn(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    const sql = `INSERT INTO conversation_turns (session_id, role, content) VALUES ($1, $2, $3)`;
    try {
      await this.pool.query(sql, [sessionId, role, content]);
    } catch (err) {
      this.logger.error(`Error saving conversation turn: ${err.message}`);
    }
  }

  /**
   * Cargar los últimos N turnos de conversación de una sesión
   */
  async loadConversationHistory(
    sessionId: string,
    limit = 12,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const sql = `
      SELECT role, content FROM (
        SELECT role, content, created_at
        FROM conversation_turns
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      ) sub ORDER BY created_at ASC
    `;
    try {
      const result = await this.pool.query(sql, [sessionId, limit]);
      return result.rows.map((row) => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
      }));
    } catch (err) {
      this.logger.error(`Error loading conversation history: ${err.message}`);
      return [];
    }
  }

  /**
   * Limpiar el historial de conversación de una sesión
   */
  async clearConversationHistory(sessionId: string): Promise<void> {
    const sql = `DELETE FROM conversation_turns WHERE session_id = $1`;
    try {
      await this.pool.query(sql, [sessionId]);
      this.logger.log(`Cleared conversation history for session: ${sessionId}`);
    } catch (err) {
      this.logger.error(`Error clearing conversation history: ${err.message}`);
    }
  }

  // =========================================================
  // Embeddings
  // =========================================================

  /**
   * Request embedding vector from local llama.cpp embedding server (port 8081)
   */
  async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        this.embeddingUrl,
        { content: text },
        { headers: { 'Content-Type': 'application/json' }, timeout: 8000 },
      );
      const data = response.data;
      if (!data) return [];

      // Caso 1: Array de resultados [{ embedding: [[...]] }]
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        if (first && Array.isArray(first.embedding)) {
          if (Array.isArray(first.embedding[0])) {
            return first.embedding[0];
          }
          return first.embedding;
        }
        if (Array.isArray(first) && typeof first[0] === 'number') {
          return first;
        }
      }

      // Caso 2: Objeto { embedding: [[...]] } o { embedding: [...] }
      if (data && Array.isArray(data.embedding)) {
        if (Array.isArray(data.embedding[0])) {
          return data.embedding[0];
        }
        return data.embedding;
      }

      // Caso 3: Array plano de números [0.1, 0.2, ...]
      if (Array.isArray(data) && typeof data[0] === 'number') {
        return data;
      }

      return [];
    } catch (error) {
      this.logger.warn(`Could not reach embedding server at ${this.embeddingUrl}: ${error.message}`);
      return [];
    }
  }

  // =========================================================
  // Knowledge Base (RAG)
  // =========================================================

  /**
   * Search relevant context in knowledge base using pgvector similarity
   */
  async searchKnowledge(query: string, matchThreshold = 0.6, limit = 3): Promise<string[]> {
    const embedding = (await this.getEmbedding(query)) || [];
    if (!embedding || embedding.length === 0) {
      return [];
    }

    const vectorStr = `[${embedding.join(',')}]`;
    const sql = `
      SELECT content, similarity 
      FROM match_knowledge($1::vector, $2, $3);
    `;

    try {
      const result = await this.pool.query(sql, [vectorStr, matchThreshold, limit]);
      return result.rows.map((row) => row.content);
    } catch (err) {
      this.logger.error(`Error querying match_knowledge: ${err.message}`);
      return [];
    }
  }

  /**
   * Search episodic user memories
   */
  async searchMemories(query: string, matchThreshold = 0.6, limit = 3): Promise<string[]> {
    const embedding = (await this.getEmbedding(query)) || [];
    if (!embedding || embedding.length === 0) {
      return [];
    }

    const vectorStr = `[${embedding.join(',')}]`;
    const sql = `
      SELECT memory_text, category, similarity 
      FROM match_memories($1::vector, $2, $3);
    `;

    try {
      const result = await this.pool.query(sql, [vectorStr, matchThreshold, limit]);
      return result.rows.map((row) => `[${row.category}] ${row.memory_text}`);
    } catch (err) {
      this.logger.error(`Error querying match_memories: ${err.message}`);
      return [];
    }
  }

  /**
   * Store a new episodic memory
   */
  async saveMemory(memoryText: string, category = 'general'): Promise<void> {
    const embedding = (await this.getEmbedding(memoryText)) || [];
    const vectorStr = (embedding && embedding.length > 0) ? `[${embedding.join(',')}]` : null;

    const sql = `
      INSERT INTO jarvis_memories (memory_text, category, embedding)
      VALUES ($1, $2, $3::vector);
    `;

    try {
      await this.pool.query(sql, [memoryText, category, vectorStr]);
      this.logger.log(`Saved memory: "${memoryText}"`);
    } catch (err) {
      this.logger.error(`Error saving memory: ${err.message}`);
    }
  }

  /**
   * Store knowledge document
   */
  async saveKnowledge(content: string, metadata = {}): Promise<void> {
    const embedding = (await this.getEmbedding(content)) || [];
    const vectorStr = (embedding && embedding.length > 0) ? `[${embedding.join(',')}]` : null;

    const sql = `
      INSERT INTO jarvis_knowledge (content, metadata, embedding)
      VALUES ($1, $2::jsonb, $3::vector);
    `;

    try {
      await this.pool.query(sql, [content, JSON.stringify(metadata), vectorStr]);
      this.logger.log(`Saved knowledge: "${content.substring(0, 50)}..."`);
    } catch (err) {
      this.logger.error(`Error saving knowledge: ${err.message}`);
    }
  }

  /**
   * Get all stored memories for UI management
   */
  async getAllMemories(): Promise<Array<{ id: number; content: string; category: string; created_at: Date }>> {
    if (!this.pool) return [];
    try {
      const result = await this.pool.query(
        'SELECT id, memory_text as content, category, created_at FROM jarvis_memories ORDER BY created_at DESC LIMIT 50',
      );
      return result.rows;
    } catch (err: any) {
      this.logger.warn(`Could not get all memories: ${err.message}`);
      return [];
    }
  }
}

