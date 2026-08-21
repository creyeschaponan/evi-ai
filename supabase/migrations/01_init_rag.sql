-- 1. Habilitar la extensión vectorial pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla para documentos de conocimiento (RAG a largo plazo)
-- Dimensión 768 correspondiente a nomic-embed-text-v1.5
CREATE TABLE IF NOT EXISTS jarvis_knowledge (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding VECTOR(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla para historial de memorias episódicas (hechos sobre el usuario, preferencias)
CREATE TABLE IF NOT EXISTS jarvis_memories (
    id BIGSERIAL PRIMARY KEY,
    memory_text TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general', -- 'preference', 'project', 'schedule'
    embedding VECTOR(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Índices HNSW para búsqueda por similitud ultrarrápida (distancia coseno)
CREATE INDEX IF NOT EXISTS jarvis_knowledge_embedding_idx 
ON jarvis_knowledge USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS jarvis_memories_embedding_idx 
ON jarvis_memories USING hnsw (embedding vector_cosine_ops);

-- 5. Función RPC para búsqueda semántica de conocimiento
CREATE OR REPLACE FUNCTION match_knowledge (
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.content,
    k.metadata,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM jarvis_knowledge k
  WHERE 1 - (k.embedding <=> query_embedding) > match_threshold
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 6. Función RPC para búsqueda de memorias del usuario
CREATE OR REPLACE FUNCTION match_memories (
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id BIGINT,
  memory_text TEXT,
  category VARCHAR,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.memory_text,
    m.category,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM jarvis_memories m
  WHERE 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
