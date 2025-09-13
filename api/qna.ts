// api/qna.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const ALLOWED_ORIGIN = process.env.DEV_ORIGIN || 'http://localhost:5173';

type QnaRequest = {
  action: 'generate' | 'answer' | 'generate_yt_queries'; // NEW ACTION
  context?: string;
  count?: number;
  question?: string;
  useWeb?: boolean;
};

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
    const body: QnaRequest = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { action } = body;
    if (!action) return res.status(400).send('Missing action');

    const genAI = new GoogleGenerativeAI(apiKey);

    if (action === 'generate_yt_queries') {
      const context = (body.context || '').slice(0, 12000);
      if (!context) return res.status(400).send('Missing context');

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
You are an expert academic tutor and YouTube content curator.
From the provided NOTES, identify the main technical topics.
Generate 3-5 concise, high-quality YouTube search queries that would find excellent video tutorials for these topics.
Examples of good queries: "satellite communication basics lecture", "frequency division multiple access (FDMA) explained", "LEO MEO GEO satellite orbits tutorial".
Return ONLY a JSON object with this structure: { "queries": ["query1", "query2"] }

NOTES:
${context}
`;
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500,
          responseMimeType: 'application/json'
        } as any
      });

      let queries: string[] = [];
      try {
        const json = JSON.parse(result.response.text() || '{}');
        queries = Array.isArray(json.queries) ? json.queries : [];
      } catch {
        queries = (result.response.text() || '').split('\n').map(s => s.trim()).filter(Boolean);
      }
      return res.status(200).json({ queries });
    }

    if (action === 'generate') {
      const context = (body.context || '').slice(0, 12000);
      const count = Math.max(1, Math.min(body.count ?? 10, 30));
      if (!context) return res.status(400).send('Missing context');

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `
You are an expert exam setter. From the NOTES below, generate ${count} concise, technically precise study questions.
Return JSON only: { "questions": [ "Q1", "Q2", ... ] }

NOTES:
${context}
`;
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 800,
          responseMimeType: 'application/json'
        } as any
      });

      let qs: string[] = [];
      try {
        const json = JSON.parse(result.response.text() || '{}');
        qs = Array.isArray(json.questions) ? json.questions : [];
      } catch {
        qs = (result.response.text() || '').split('\n').map(s => s.replace(/^\s*\d+\s*[.)-]?\s*/, '').trim()).filter(Boolean).slice(0, count);
      }
      return res.status(200).json({ questions: qs });
    }

    if (action === 'answer') {
      const context = (body.context || '').slice(0, 12000);
      const question = (body.question || '').trim();
      const useWeb = !!body.useWeb;
      if (!question) return res.status(400).send('Missing question');

      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
       
        tools: useWeb ? [{ googleSearchRetrieval: {} }] : undefined
      });

      const sys = `You are a concise study tutor. Use NOTES first. If notes are insufficient and web access is allowed, use general knowledge. Format answers with 3–8 short bullets or numbered steps. Use \`code\` for formulas. Mark lines with (notes) or (web).`;
      const user = `NOTES:\n${context || '(none)'}\n\nQUESTION:\n${question}`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: sys }] }, { role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 } as any
      });

      const answer = result.response.text() || 'No answer.';
      return res.status(200).json({ answer });
    }

    return res.status(400).send('Unknown action');
  } catch (e: any) {
    console.error('[qna] error:', e?.message || e);
    return res.status(500).send(e?.message || 'Server error');
  }
}