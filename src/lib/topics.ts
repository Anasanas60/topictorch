// src/lib/topics.ts
// Extracts key phrases (keywords) from cleaned text to be used for highlighting and YouTube search.

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','for','to','of','in','on','at','by','with','from','as','is','are','was','were','be','been','being',
  'that','this','these','those','it','its','into','about','over','under','after','before','between','through','during','without','within',
  'i','you','he','she','we','they','them','his','her','their','our','your','my','me','us',
  'do','does','did','doing','done','can','could','should','would','may','might','must','will','shall',
  'not','no','yes','up','down','out','so','than','too','very','just','also','only','both','each','more','most','such','own','same'
]);

function tokenizeLower(text: string): string[] {
  const ascii = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ascii.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function contentTokens(text: string): string[] {
  return tokenizeLower(text).filter(t => !STOPWORDS.has(t) && t.length > 2);
}

// Key phrases (preserve acronyms like RSA, ECC, QKD)
export function keyPhrases(text: string, topK = 12): string[] {
  const toksArr = contentTokens(text);
  const counts = new Map<string, number>();

  for (let i = 0; i < toksArr.length; i++) {
    const u = toksArr[i];
    counts.set(u, (counts.get(u) ?? 0) + 1);
    if (i + 1 < toksArr.length) {
      const bi = `${toksArr[i]} ${toksArr[i + 1]}`;
      counts.set(bi, (counts.get(bi) ?? 0) + 2);
    }
    if (i + 2 < toksArr.length) {
      const tri = `${toksArr[i]} ${toksArr[i + 1]} ${toksArr[i + 2]}`;
      counts.set(tri, (counts.get(tri) ?? 0) + 3);
    }
  }

  // Boost all-caps acronyms and alpha-number terms from the original (un-tokenized) text
  const acronyms = Array.from(new Set((text.match(/\b[A-Z]{2,6}\b/g) ?? [])));
  for (const a of acronyms) counts.set(a, (counts.get(a) ?? 0) + 6);

  const alnum = Array.from(new Set((text.match(/\b[A-Za-z]\d+\b/g) ?? [])));
  for (const t of alnum) counts.set(t, (counts.get(t) ?? 0) + 4);

  const ranked = Array.from(counts.entries())
    .filter(([k]) => k.length > 2 && k.length <= 50)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  // Deduplicate overlapping phrases (keep longer ones) and cap
  const out: string[] = [];
  for (const p of ranked) {
    if (!out.some(q => q.includes(p) || p.includes(q))) out.push(p);
    if (out.length >= topK) break;
  }
  return out;
}