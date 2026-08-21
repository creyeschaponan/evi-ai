import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RagService } from './rag.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class KnowledgeIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeIngestService.name);
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(private readonly ragService: RagService) {}

  async onModuleInit() {
    // Ingestar automáticamente en segundo plano al arrancar el orquestador
    this.syncTimer = setTimeout(() => {
      this.syncKnowledgeDirectory().catch((err) => {
        this.logger.error(`Error during initial knowledge sync: ${err.message}`);
      });
    }, 2500);
  }

  onModuleDestroy() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
  }

  /**
   * Sincroniza todos los archivos markdown de la carpeta knowledge/ con pgvector
   */
  async syncKnowledgeDirectory(dirPath?: string): Promise<{ added: number; skipped: number; total: number }> {
    const knowledgeRoot = dirPath || path.resolve(process.cwd(), '..', 'knowledge');
    
    if (!fs.existsSync(knowledgeRoot)) {
      this.logger.warn(`Knowledge directory not found at ${knowledgeRoot}`);
      return { added: 0, skipped: 0, total: 0 };
    }

    this.logger.log(`Starting knowledge sync from directory: ${knowledgeRoot}`);
    const mdFiles = this.getMarkdownFilesRecursive(knowledgeRoot);
    let addedCount = 0;
    let skippedCount = 0;
    let totalChunks = 0;

    for (const filePath of mdFiles) {
      const relativePath = path.relative(knowledgeRoot, filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const chunks = this.splitIntoSemanticChunks(content, relativePath);

      for (const chunk of chunks) {
        totalChunks++;
        const hash = crypto.createHash('sha256').update(chunk.text).digest('hex');
        
        // Verificar si el chunk ya existe en pgvector usando el hash
        const isDuplicate = await this.checkChunkExists(hash);
        if (isDuplicate) {
          skippedCount++;
          continue;
        }

        // Obtener vector embedding e insertar
        await this.ragService.saveKnowledge(chunk.text, {
          source: relativePath,
          section: chunk.section,
          hash: hash,
          updated_at: new Date().toISOString(),
        });
        addedCount++;
      }
    }

    this.logger.log(`Knowledge sync finished: ${addedCount} added, ${skippedCount} existing/skipped, ${totalChunks} total chunks.`);
    return { added: addedCount, skipped: skippedCount, total: totalChunks };
  }

  /**
   * Divide el archivo Markdown en secciones semánticas preservando el contexto del título
   */
  private splitIntoSemanticChunks(fileContent: string, filename: string): Array<{ text: string; section: string }> {
    const lines = fileContent.split('\n');
    const chunks: Array<{ text: string; section: string }> = [];
    let currentSection = filename;
    let currentLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('# ') || line.startsWith('## ')) {
        if (currentLines.length > 0) {
          const chunkText = currentLines.join('\n').trim();
          if (chunkText.length > 30) {
            chunks.push({ text: `[Documento: ${filename} | Sección: ${currentSection}]\n${chunkText}`, section: currentSection });
          }
          currentLines = [];
        }
        currentSection = line.replace(/^#+\s*/, '').trim();
      }
      currentLines.push(line);
    }

    if (currentLines.length > 0) {
      const chunkText = currentLines.join('\n').trim();
      if (chunkText.length > 30) {
        chunks.push({ text: `[Documento: ${filename} | Sección: ${currentSection}]\n${chunkText}`, section: currentSection });
      }
    }

    return chunks;
  }

  /**
   * Revisa si un chunk con el mismo hash ya existe en la base de datos
   */
  private async checkChunkExists(hash: string): Promise<boolean> {
    const pool = (this.ragService as any).pool;
    if (!pool) return false;

    try {
      const res = await pool.query(
        `SELECT id FROM jarvis_knowledge WHERE metadata->>'hash' = $1 LIMIT 1;`,
        [hash]
      );
      return (res.rowCount || 0) > 0;
    } catch {
      return false;
    }
  }

  private getMarkdownFilesRecursive(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);

    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat && stat.isDirectory()) {
        results = results.concat(this.getMarkdownFilesRecursive(fullPath));
      } else if (file.endsWith('.md')) {
        results.push(fullPath);
      }
    }

    return results;
  }
}
