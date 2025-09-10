// src/lib/summarize.ts

// Minimal English stopwords (good enough for MVP)
const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','for','to','of','in','on','at','by','with','from','as','is','are','was','were','be','been','being',
  'that','this','these','those','it','its','into','about','over','under','after','before','between','through','during','without','within',
  'i','you','he','she','we','they','them','his','her','their','our','your','my','me','us',
  'do','does','did','doing','done','can','could','should','would','may','might','must','will','shall',
  'not','no','yes','up','down','out','so','than','too','very','just','also','only','both','each','more','most','such','own','same'
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function removeStop(tokens: string[]) {
  return tokens.filter(t => !STOPWORDS.has(t) && t.length > 2);
}
function dedup<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// Similarity of two sentences using overlap of content words
function sentenceSimilarity(a: string, b: string): number {
  const ta = new Set(removeStop(tokenize(a)));
  const tb = new Set(removeStop(tokenize(b)));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const tok of ta) if (tb.has(tok)) overlap++;
  return overlap / Math.min(ta.size, tb.size); // overlap coefficient
}

export function summarizeText(text: string, maxSentences = 5): { summary: string[]; sentences: string[] } {
  // Split into sentences (English)
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length <= maxSentences) return { summary: sentences, sentences };

  const n = sentences.length;
  const scores = new Array(n).fill(1 / n);
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  // Build similarity matrix
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const s = sentenceSimilarity(sentences[i], sentences[j]);
    sim[i][j] = s; sim[j][i] = s;
  }

  // PageRank iterations
  const d = 0.85, iters = 30, eps = 1e-4;
  for (let it = 0; it < iters; it++) {
    const next = new Array(n).fill((1 - d) / n);
    for (let i = 0; i < n; i++) {
      const norm = sim[i].reduce((a, b) => a + b, 0);
      if (norm === 0) continue;
      for (let j = 0; j < n; j++) if (i !== j) next[j] += d * (sim[i][j] / norm) * scores[i];
    }
    let diff = 0; for (let i = 0; i < n; i++) diff += Math.abs(next[i] - scores[i]);
    for (let i = 0; i < n; i++) scores[i] = next[i];
    if (diff < eps) break;
  }

  const idx = scores.map((s, i) => [s, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, maxSentences)
    .map(x => x[1])
    .sort((a, b) => a - b);

  return { summary: idx.map(i => sentences[i]), sentences };
}

export function keyPhrases(text: string, topK = 8): string[] {
  const toks = removeStop(tokenize(text));
  const counts = new Map<string, number>();

  for (let i = 0; i < toks.length; i++) {
    const u = toks[i];
    counts.set(u, (counts.get(u) ?? 0) + 1); // unigram weight 1
    if (i + 1 < toks.length) {
      const bi = `${toks[i]} ${toks[i + 1]}`;
      counts.set(bi, (counts.get(bi) ?? 0) + 2); // bigram weight 2
    }
    if (i + 2 < toks.length) {
      const tri = `${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`;
      counts.set(tri, (counts.get(tri) ?? 0) + 3); // trigram weight 3
    }
  }

  const ranked = Array.from(counts.entries())
    .filter(([k]) => k.length > 2 && k.length <= 40) // filter too short/long
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  // Deduplicate overlapping phrases (keep longer ones)
  const out: string[] = [];
  for (const p of ranked) {
    if (!out.some(q => q.includes(p) || p.includes(q))) out.push(p);
    if (out.length >= topK) break;
  }
  return dedup(out);
}