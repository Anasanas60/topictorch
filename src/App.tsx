import React, { useEffect, useState } from 'react';
import './App.css';
import { exportQnaDocx } from './lib/exportDocx';

import { ocrImage } from './lib/ocr';
import { cleanForSummary } from './lib/clean';
import { keyPhrases } from './lib/topics';
import { searchTutorials, youtubeSearchURL, type YTVideo, type SearchOptions } from './lib/youtube';

type AnswerMap = Record<string, string>;
type BusyMap = Record<string, boolean>;

export default function App() {
  // Core data
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState<'eng' | 'ben'>('eng');
  const [text, setText] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // Tutorials
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytLang, setYtLang] = useState<SearchOptions['langPref']>('auto');
  const [bookmarkedTutorials, setBookmarkedTutorials] = useState<YTVideo[]>([]);

  // PDF options
  const [pdfRange, setPdfRange] = useState<string>('');
  const [pdfScale, setPdfScale] = useState<number>(2);

  // QnA Studio
  const [questions, setQuestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [genCount, setGenCount] = useState<number | string>(10);
  const [genLoading, setGenLoading] = useState(false);
  const [answerBusy, setAnswerBusy] = useState<BusyMap>({});
  const [useWeb, setUseWeb] = useState<boolean>(false);
  const [qaError, setQaError] = useState<string | null>(null);

  const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? (window.location.port === '5173' ? 'http://localhost:3000' : '');

  const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const filenameBase = `${(file?.name?.replace(/\.[^/.]+$/, '') || 'notes').replace(/[^a-z0-9-_]+/gi, '-')}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;

  useEffect(() => {
    const prevent = (e: DragEvent) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  function addBookmark(videoToAdd: YTVideo) {
    if (!bookmarkedTutorials.some(video => video.id === videoToAdd.id)) {
      setBookmarkedTutorials(prev => [...prev, videoToAdd]);
    }
  }
  function removeBookmark(videoIdToRemove: string) {
    setBookmarkedTutorials(prev => prev.filter(video => video.id !== videoIdToRemove));
  }
  function isBookmarked(videoId: string): boolean {
    return bookmarkedTutorials.some(video => video.id === videoId);
  }

  function exportQnaDocxClick() {
    const qna = questions.map((q) => ({ question: q, answer: answers[q] || '' }));
    exportQnaDocx({ title: 'QnA from TopicTorch', qna, meta: { date: new Date().toLocaleString() } }, `${filenameBase}-qna`);
  }

  function buildContext(): string {
    return cleanForSummary(text || '').slice(0, 12000);
  }

  async function handleOCR() {
    if (!file) return;
    setLoading(true);
    setText('');
    setQuestions([]); setSelected({}); setAnswers({}); setQaError(null);
    setVideos([]); setYtError(null);
    setProgress(0);
    setStatus('starting…');

    try {
      if (isPdfFile(file)) {
        try {
          setStatus('Loading PDF…');
          const { loadPdf, parsePageRange, isDigitalPdf, extractPdfText, pdfToOcrImages } = await import('./lib/pdf');
          const pdf = await loadPdf(file);
          const pages = parsePageRange(pdfRange, pdf.numPages);
          setStatus(`Analyzing PDF (${pages.length} pages)…`);

          const digital = await isDigitalPdf(pdf);
          if (digital) {
            let last = 0;
            const combined = await extractPdfText(pdf, pages, (done, total) => {
              const p = Math.round((done / total) * 100);
              if (p !== last) { setProgress(p / 100); setStatus(`Extracting text… ${p}%`); last = p; }
            });
            if (combined.trim().length >= 20) {
              setText(combined.trim());
            } else {
              setStatus('Text empty — switching to OCR…');
              const imgs = await pdfToOcrImages(pdf, pages, pdfScale);
              let stitched = ''; let i = 0;
              for (const f of imgs) {
                i++;
                setStatus(`OCR page ${i}/${imgs.length}…`);
                const res = await ocrImage(f, lang, (p) => setProgress(p));
                stitched += `\n\n[Page ${i}]\n${res.text.trim()}`;
              }
              setText(stitched.trim());
            }
          } else {
            setStatus('Rendering pages…');
            const { pdfToOcrImages } = await import('./lib/pdf');
            let last = 0;
            const imgs = await pdfToOcrImages(pdf, pages, pdfScale, (done, total) => {
              const p = Math.round((done / total) * 100);
              if (p !== last) { setProgress(p / 100); setStatus(`Rendering… ${p}%`); last = p; }
            });
            let combined = ''; let i = 0;
            for (const f of imgs) {
              i++;
              setStatus(`OCR page ${i}/${imgs.length}…`);
              const res = await ocrImage(f, lang, (p) => setProgress(p));
              combined += `\n\n[Page ${i}]\n${res.text.trim()}`;
            }
            setText(combined.trim());
          }
        } catch {
          alert('PDF support not installed. Run `npm i pdfjs-dist` and add src/lib/pdf.ts.');
        }
      } else {
        const res = await ocrImage(file, lang, (p, s) => { setProgress(p); setStatus(s || ''); });
        setText(res.text.trim());
      }
      const cleaned = buildContext();
      const kp = keyPhrases(cleaned, 12);
      setKeywords(kp);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
      setStatus('');
      setProgress(0);
    }
  }

  async function handleFindTutorials() {
    if (!text) return;
    setYtLoading(true);
    setYtError(null);
    setVideos([]);
    try {
      setStatus('Generating smart search queries…');
      const cleaned = buildContext();
      const queriesRes = await fetch(`${API_BASE}/api/qna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_yt_queries', context: cleaned })
      });
      if (!queriesRes.ok) throw new Error(await queriesRes.text());
      const { queries } = await queriesRes.json() as { queries: string[] };
      if (!queries || queries.length === 0) throw new Error('Could not generate search queries.');

      setStatus('Finding relevant tutorials on YouTube…');
      const vids = await searchTutorials(queries, keywords, { langPref: ytLang, ocrLang: lang });
      setVideos(vids);
    } catch (e) {
      setYtError((e as Error).message || 'Failed to find tutorials.');
    } finally {
      setYtLoading(false);
      setStatus('');
    }
  }

  async function generateQuestions() {
    setQaError(null);
    if (!text) { setQaError('Run OCR first.'); return; }
    setGenLoading(true);
    try {
      const cleaned = buildContext();
      const res = await fetch(`${API_BASE}/api/qna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', context: cleaned, count: Number(genCount) || 10 })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { questions: string[] };
      const qs = (data.questions || []).map(q => q.replace(/\s+/g, ' ').trim()).filter(Boolean);
      setQuestions(qs);
      const sel: Record<string, boolean> = {};
      qs.forEach(q => { sel[q] = true; });
      setSelected(sel);
      setAnswers({});
    } catch (e) {
      setQaError((e as Error).message || 'Failed to generate questions');
    } finally {
      setGenLoading(false);
    }
  }

  async function answerOne(q: string) {
    setQaError(null);
    setAnswerBusy(prev => ({ ...prev, [q]: true }));
    try {
      const cleaned = buildContext();
      const res = await fetch(`${API_BASE}/api/qna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', context: cleaned, question: q, useWeb })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { answer: string };
      setAnswers(prev => ({ ...prev, [q]: data.answer || 'No answer.' }));
    } catch (e) {
      setQaError((e as Error).message || 'Failed to answer question');
    } finally {
      setAnswerBusy(prev => ({ ...prev, [q]: false }));
    }
  }

  async function answerSelected() {
    setQaError(null);
    const targets = questions.filter(q => selected[q]);
    if (targets.length === 0) { setQaError('Select at least one question.'); return; }
    for (const q of targets) {
      await answerOne(q);
    }
  }

  function toggleSelectAll(checked: boolean) {
    const sel: Record<string, boolean> = {};
    questions.forEach(q => { sel[q] = checked; });
    setSelected(sel);
  }

  function onDropZoneDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;
    const files: File[] = dt.items
      ? Array.from(dt.items).map(it => (it.kind === 'file' ? it.getAsFile() : null)).filter(Boolean) as File[]
      : Array.from(dt.files);
    if (files?.length) setFile(files[0]);
  }

  return (
    <div className="cool-bg">
      <div className="glass-card">
        <h1 className="title">TopicTorch 🔥</h1>
        <p className="subtitle strong">
          Scan notes, run QnA (generate + answer), and export your study pack — all on your device.
        </p>

        <div className="toolbar">
          <div className="control">
            <div className="label">Upload file</div>
            <input
              id="fileInput"
              type="file"
              accept="image/*,application/pdf"
              className="file-hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="fileInput"
              className={`dropzone ${dragOver ? 'dragover' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={onDropZoneDrop}
            >
              <span className="dz-title">{file ? 'Change file' : 'Click to upload or drop here'}</span>
              <span className="dz-sub">{file ? file.name : 'PNG / JPG / PDF'}</span>
            </label>
          </div>

          <div className="control">
            <div className="label">Language</div>
            <div className="segmented">
              <input type="radio" id="lang-eng" name="lang" checked={lang === 'eng'} onChange={() => setLang('eng')} />
              <label htmlFor="lang-eng">English</label>
              <input type="radio" id="lang-ben" name="lang" checked={lang === 'ben'} onChange={() => setLang('ben')} />
              <label htmlFor="lang-ben">Bengali</label>
            </div>
          </div>
          
          <div className="control">
            <div className="label">Tutorial language</div>
            <div className="segmented">
              <input type="radio" id="ytlang-auto" name="ytlang" checked={ytLang === 'auto'} onChange={() => setYtLang('auto')} />
              <label htmlFor="ytlang-auto">Auto</label>
              <input type="radio" id="ytlang-any" name="ytlang" checked={ytLang === 'any'} onChange={() => setYtLang('any')} />
              <label htmlFor="ytlang-any">Any</label>
              <input type="radio" id="ytlang-en" name="ytlang" checked={ytLang === 'en'} onChange={() => setYtLang('en')} />
              <label htmlFor="ytlang-en">English</label>
              <input type="radio" id="ytlang-hi" name="ytlang" checked={ytLang === 'hi'} onChange={() => setYtLang('hi')} />
              <label htmlFor="ytlang-hi">Hindi</label>
              <input type="radio" id="ytlang-bn" name="ytlang" checked={ytLang === 'bn'} onChange={() => setYtLang('bn')} />
              <label htmlFor="ytlang-bn">Bengali</label>
            </div>
          </div>

          <div className="control wide">
            <div className="label">Actions</div>
            <div className="btn-row">
              <button onClick={handleOCR} disabled={!file || loading} className="main-btn">
                {loading ? `Recognizing… ${Math.round(progress * 100)}%` : 'Run OCR'}
              </button>
              <button onClick={handleFindTutorials} disabled={ytLoading || !text} className="main-btn">
                {ytLoading ? 'Finding…' : 'Find Tutorials'}
              </button>
            </div>
          </div>
        </div>

        {file && isPdfFile(file) && (
          <div className="pdf-options section">
            <h3>PDF options</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="label">Page range
                <input
                  value={pdfRange}
                  onChange={(e) => setPdfRange(e.target.value)}
                  placeholder="e.g., 1-3,5"
                  className="file-input"
                  style={{ minWidth: 160 }}
                />
              </label>
              <label className="label">Scale ({pdfScale}x)
                <input
                  type="range"
                  min={1.5}
                  max={3}
                  step={0.5}
                  value={pdfScale}
                  onChange={(e) => setPdfScale(Number(e.target.value))}
                  style={{ width: 180 }}
                />
              </label>
            </div>
          </div>
        )}

        {(loading || ytLoading || genLoading) && (
          <div className="progress">
            <div className={`progress-bar${(loading || genLoading) ? '' : ' indeterminate'}`} style={loading ? { width: `${Math.round(progress * 100)}%` } : undefined} />
          </div>
        )}
        {status && <div className="status">{status} {progress > 0 && <span>({Math.round(progress * 100)}%)</span>}</div>}

        {text && (
          <div className="section">
            <h2>OCR Text</h2>
            <pre className="ocr-text">{text}</pre>
            <button className="secondary-btn" onClick={() => { navigator.clipboard.writeText(text); alert('OCR text copied!'); }}>
              Copy OCR Text
            </button>
          </div>
        )}

        {text && (
          <div className="section">
            <h2>QnA Studio</h2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="label">Generate
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={genCount}
                  onChange={(e) => setGenCount(e.target.value)}
                  onBlur={() => {
                    const val = Math.max(1, Math.min(30, Number(genCount) || 10));
                    setGenCount(val);
                  }}
                  className="file-input"
                  style={{ width: 90, marginLeft: 8 }}
                />
                <span style={{ marginLeft: 8 }}>questions</span>
              </label>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={useWeb} onChange={(e) => setUseWeb(e.target.checked)} />
                Use web fallback if notes insufficient
              </label>
              <button onClick={generateQuestions} disabled={genLoading} className="main-btn" style={{ maxWidth: 220 }}>
                {genLoading ? 'Generating…' : 'Generate questions'}
              </button>
              <button onClick={answerSelected} disabled={questions.every(q => !selected[q])} className="main-btn" style={{ maxWidth: 220 }}>
                Answer selected
              </button>
              <button onClick={exportQnaDocxClick} disabled={questions.length === 0} className="secondary-btn" style={{ maxWidth: 220 }}>
                Export QnA (.docx)
              </button>
            </div>
            {qaError && <div className="error">{qaError}</div>}
            {questions.length > 0 && (
              <div
                className="scrollable-container"
                style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '10px' }}
              >
                <div style={{ marginTop: 12, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={questions.every(q => selected[q])}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                      Select all
                    </label>
                    <span style={{ color: '#e5e7eb' }}>
                      {Object.values(selected).filter(Boolean).length}/{questions.length} selected
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {questions.map((q, i) => (
                      <div key={i} className="qna-item">
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={!!selected[q]}
                              onChange={(e) => setSelected(prev => ({ ...prev, [q]: e.target.checked }))}
                            />
                            <strong>Q{i + 1}:</strong>
                            <span>{q}</span>
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="secondary-btn"
                              onClick={() => answerOne(q)}
                              disabled={!!answerBusy[q]}
                            >
                              {answerBusy[q] ? 'Answering…' : 'Answer'}
                            </button>
                          </div>
                        </div>
                        {answers[q] && (
                          <div className="answer-box" style={{ marginTop: 8 }}>
                            <div
                              dangerouslySetInnerHTML={{ __html: formatAnswerToHTML(answers[q]) }}
                            />
                            <div style={{ marginTop: 6 }}>
                              <button
                                className="secondary-btn"
                                onClick={() => navigator.clipboard.writeText(answers[q])}
                                style={{ padding: '6px 10px', borderRadius: 8 }}
                              >
                                Copy answer
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- NEW SECTION: MY SAVED TUTORIALS --- */}
        {bookmarkedTutorials.length > 0 && (
          <div className="section">
            <h2>My Saved Tutorials ({bookmarkedTutorials.length})</h2>
            <div
              className="videos"
              style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}
            >
              {bookmarkedTutorials.map((v) => (
                <div key={v.id} className="video-card">
                  <a href={v.url} target="_blank" rel="noreferrer" className="video-link-content">
                    {v.thumb && <img src={v.thumb} alt={v.title} className="video-thumb" />}
                    <div className="video-info">
                      <div className="video-title">{v.title}</div>
                      <div className="video-channel">{v.channel}</div>
                    </div>
                  </a>
                  <button
                    onClick={() => removeBookmark(v.id)}
                    className="bookmark-btn remove"
                    title="Remove from My Tutorials"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- RECOMMENDED TUTORIALS SECTION --- */}
        {videos.length > 0 && (
          <div className="section">
            <h2>Recommended Tutorials</h2>
            <div
              className="videos"
              style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '10px' }}
            >
              {videos.map((v) => (
                <div key={v.id} className="video-card">
                  <a href={v.url} target="_blank" rel="noreferrer" className="video-link-content">
                    {v.thumb && <img src={v.thumb} alt={v.title} className="video-thumb" />}
                    <div className="video-info">
                      <div className="video-title">{v.title}</div>
                      <div className="video-channel">{v.channel}</div>
                    </div>
                  </a>
                  <button
                    onClick={() => {
                      if (isBookmarked(v.id)) {
                        removeBookmark(v.id);
                      } else {
                        addBookmark(v);
                      }
                    }}
                    className={`bookmark-btn ${isBookmarked(v.id) ? 'bookmarked' : ''}`}
                    title={isBookmarked(v.id) ? "Remove from My Tutorials" : "Save to My Tutorials"}
                  >
                    {isBookmarked(v.id) ? 'Saved' : 'Save'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {!ytLoading && !ytError && text && videos.length === 0 && (
          <p className="error" style={{ background: 'transparent', color: '#e5e7eb' }}>
            No videos found yet. Try finding tutorials after generating questions.
          </p>
        )}
        {ytError && (
          <div className="error">
            {ytError}
            <div style={{ marginTop: 6 }}>
              <a href={youtubeSearchURL(keywords.slice(0, 6).join(' ') || buildContext().slice(0, 120))} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#fff' }}>
                Open YouTube
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatAnswerToHTML(ans: string): string {
  if (!ans) return '';
  let s = ans.trim();
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = s.split(/\r?\n/);
  const out: string[] = [];
  let inUL = false, inOL = false;

  const flush = () => {
    if (inUL) { out.push('</ul>'); inUL = false; }
    if (inOL) { out.push('</ol>'); inOL = false; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^[-*•]\s+/.test(line)) {
      if (!inUL) { flush(); out.push('<ul>'); inUL = true; }
      out.push('<li>' + line.replace(/^[-*•]\s+/, '') + '</li>');
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (!inOL) { flush(); out.push('<ol>'); inOL = true; }
      out.push('<li>' + line.replace(/^\d+\.\s+/, '') + '</li>');
      continue;
    }
    flush();
    out.push('<p>' + line + '</p>');
  }
  flush();
  return out.join('\n').replace(/\s+/g, ' ').replace(/>\s+</g, '><');
}