import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || '',   // empty = in-memory store (no database needed)
  dbName: process.env.MONGODB_DB || 'codemap',
  embeddings: {
    provider: process.env.EMBEDDINGS_PROVIDER || 'local', // local | openai | hash (hash = offline testing only)
    openaiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'groq',          // groq | mock (mock = offline testing only)
    groqKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
  },
  indexTests: process.env.INDEX_TESTS === 'true',  // true = also embed test files
  retrieval: {
    topK: Number(process.env.TOP_K) || 6,
    minVectorScore: Number(process.env.MIN_VECTOR_SCORE ?? 0.2) // below this (and no keyword hit) we answer "not found"
  }
};
