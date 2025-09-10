import { saveFile, saveMarkdownNote, saveJSONNote } from './lib/save';
import { useState } from 'react';
import { ocrImage } from './lib/ocr';
import { summarizeText, keyPhrases } from './lib/summarize';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState<'eng' | 'ben'>('eng');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const filenameBase = `${(file?.name?.replace(/\.[^/.]+$/, '') || 'notes')
  .replace(/[^a-z0-9-_]+/gi, '-')}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}`;

  async function handleOCR() {
    if (!file) return;
    setLoading(true);
    setText('');
    setSummary([]); setKeywords([]);
    setProgress(0);
    setStatus('starting…');
    try {
      const res = await ocrImage(file, lang, (p, s) => { setProgress(p); setStatus(s); });
      setText(res.text.trim());
    } catch (e) {
      alert((e as Error).message);
      console.error(e);
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  function handleAnalyze() {
    if (!text) return;
    setAnalyzing(true);
    try {
      const { summary } = summarizeText(text, 5);
      setSummary(summary);
      const kp = keyPhrases(text, 8);
      setKeywords(kp);
    } catch (e) {
      alert((e as Error).message);
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1>TopicTorch — OCR → Summary → Topics</h1>
      <p style={{ color: '#666' }}>Step 1: OCR typed notes. Step 2: Analyze for summary and key topics.</p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <select value={lang} onChange={(e) => setLang(e.target.value as any)}>
          <option value="eng">English (typed)</option>
          <option value="ben">Bangla (typed)</option>
        </select>
        <button onClick={handleOCR} disabled={!file || loading}>
          {loading ? `Recognizing… ${Math.round(progress * 100)}% (${status})` : 'Recognize'}
        </button>
        <button onClick={handleAnalyze} disabled={!text || analyzing}>
          {analyzing ? 'Analyzing…' : 'Analyze'}
        </button>
        <button
  onClick={() => text && saveFile(`${filenameBase}.txt`, text)}
  disabled={!text}
>
  Download OCR (.txt)
</button>

<button
  onClick={() => text && saveMarkdownNote(
    { title: 'TopicTorch Note', lang, text, summary, keywords, videos: [] },
    filenameBase
  )}
  disabled={!text}
>
  Download (.md)
</button>

<button
  onClick={() => text && saveJSONNote(
    { lang, text, summary, keywords, videos: [] },
    filenameBase
  )}
  disabled={!text}
>
  Download (.json)
</button>
      </div>

      {text && (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <h3>Summary</h3>
            {summary.length ? (
              <ol style={{ paddingLeft: 18 }}>
                {summary.map((s, i) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}
              </ol>
            ) : (
              <p style={{ color: '#888' }}>No summary yet. Click “Analyze”.</p>
            )}

            {keywords.length > 0 && (
              <>
                <h4>Key Topics</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {keywords.map(k => (
                    <span
                      key={k}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #c7d2fe',
                        borderRadius: 8,
                        background: '#eef2ff',
                        color: '#111',
                        fontWeight: 500,
                      }}
                    >
                      #{k}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div>
            <h3>Extracted Text</h3>
            <pre
              style={{
                padding: 12,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#f9fafb',
                whiteSpace: 'pre-wrap' as any,
                wordWrap: 'break-word' as any,
                maxHeight: 400,
                overflowY: 'auto' as any,
              }}
            >
              {text}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}