// api/ask-gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const ALLOWED_ORIGIN = process.env.DEV_ORIGIN || 'http://localhost:5173';

// Tiny tokenizer and overlap scoring for retrieval
const STOP = new Set([
  'a','an','the','and','or','but','if','then','else','for','to','of','in','on','at','by','with','from','as','is','are','was','were','be','been','being',
  'that','this','these','those','it','its','into','about','over','under','after','before','between','through','during','without','within',
  'i','you','he','she','we','they','them','his','her','their','our','your','my','me','us','do','does','did','doing','done','can','could','should','would',
  'may','might','must','will','shall','not','no','yes','up','down','out','so','than','too','very','just','also','only','both','each','more','most','such','own','same'
]);
function toks(s: string) {
  const ascii = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ascii.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t) && t.length > 2);
}
function overlap(a: string, b: string) {
  const A = new Set(toks(a)), B = new Set(toks(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size); // overlap coefficient
}
function splitParas(text: string) {
  // split on blank lines or numbered bullets
  const parts = text.split(/\n\s*\n|(?=^\s*\d{1,3}[.)]\s+)/gm).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return parts.length ? parts : [text.trim()];
}
function topKParas(question: string, context: string, k = 3) {
  const paras = splitParas(context);
  return paras
    .map(p => ({ p, s: overlap(question, p) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(x => x.p);
}

export default async function handler(req: any, res: any) {
  // CORS for dev
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).send('Missing GEMINI_API_KEY');

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { question, context } = body;
    if (!question || !context) return res.status(400).send('Missing question or context');

    const safeContext = String(context).slice(0, 12000);
    const focused = topKParas(question, safeContext, 3).join('\n\n');
    console.log('[ask-gemini] ctxLen=', safeContext.length, 'focusedLen=', focused.length, 'q=', (question || '').slice(0, 80));

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Helpful prompt: use notes primarily, but do not answer "I don't know".
    const prompt = `You are a concise study tutor.
Use the provided notes primarily. If the notes are only questions or lack final results, answer using standard CS/math knowledge.
Do NOT reply "I don't know". If you must rely on general knowledge, add "(based on general knowledge)" at the end.
Answer in 3–6 short bullets or steps. Include simple formulas or small calculations if helpful.

Notes (focused, most relevant first):
${focused || '(none)'}

Additional notes (may be less relevant):
${safeContext.slice(0, 4000)}

Question: ${question}
Answer:`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
    });

    const answer = result.response.text();
    return res.status(200).json({ answer });
  } catch (e: any) {
    console.error('[ask-gemini] error:', e?.message || e);
    return res.status(500).send(e?.message || 'Server error');
  }
}