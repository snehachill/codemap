// Turns text into vectors. Providers: local (free, runs on your PC), openai, hash (offline tests).
import { config } from '../config.js';
import { splitIdentifiers } from '../util/text.js';

const DIMS = { local: 384, openai: 1536, hash: 256 };
export const dimensions = DIMS[config.embeddings.provider];
if (!dimensions) throw new Error(`Unknown EMBEDDINGS_PROVIDER "${config.embeddings.provider}"`);

export const chunkToInput = (c) => `${c.path}\n${c.symbol ?? ''}\n${c.text}`.slice(0, 2000);

let extractorPromise;
async function localEmbed(texts) {
  // First run downloads a ~25 MB model, then it is cached.
  extractorPromise ??= import('@huggingface/transformers').then((m) => m.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2'));
  const extractor = await extractorPromise;
  const out = [];
  for (let i = 0; i < texts.length; i += 16) {
    const t = await extractor(texts.slice(i, i + 16), { pooling: 'mean', normalize: true });
    out.push(...t.tolist());
  }
  return out;
}

async function openaiEmbed(texts) {
  if (!config.embeddings.openaiKey) throw new Error('OPENAI_API_KEY is missing in .env');
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.embeddings.openaiKey}` },
      body: JSON.stringify({ model: config.embeddings.openaiModel, input: texts.slice(i, i + 100) })
    });
    if (!res.ok) throw new Error(`OpenAI embeddings error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    out.push(...(await res.json()).data.map((d) => d.embedding));
  }
  return out;
}

// Bag-of-words hashing. Not smart, but deterministic and needs no network: good for tests.
function hashEmbed(text) {
  const v = new Float32Array(DIMS.hash);
  for (const tok of splitIdentifiers(text)) {
    let h = 2166136261;
    for (const ch of tok) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % DIMS.hash] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return Array.from(v, (x) => x / norm);
}

export async function embedTexts(texts) {
  switch (config.embeddings.provider) {
    case 'local': return localEmbed(texts);
    case 'openai': return openaiEmbed(texts);
    default: return texts.map(hashEmbed);
  }
}
