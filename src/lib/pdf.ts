import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
// PDF.js types
type TextContent = { items: Array<{ str: string }> };
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Vite/ESM worker setup
GlobalWorkerOptions.workerSrc = pdfWorker;

export type PdfOptions = {
  scale?: number;            // render scale for scanned OCR (1.5–3)
  pageRange?: string;        // e.g., "1-3,5,8"
  onStage?: (msg: string) => void;
  onProgress?: (done: number, total: number) => void;
  lang?: 'eng' | 'ben';
};

export async function loadPdf(file: File): Promise<PDFDocumentProxy> {
  const buf = await file.arrayBuffer();
  return getDocument({ data: buf }).promise;
}

export function parsePageRange(range: string | undefined, total: number): number[] {
  if (!range || !range.trim()) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>();
  for (const part of range.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Math.max(1, Math.min(total, parseInt(m[1], 10)));
    const b = m[2] ? Math.max(1, Math.min(total, parseInt(m[2], 10))) : a;
    const [s, e] = a <= b ? [a, b] : [b, a];
    for (let i = s; i <= e; i++) set.add(i);
  }
  return Array.from(set).sort((x, y) => x - y);
}

export async function isDigitalPdf(pdf: PDFDocumentProxy, samplePages = 2): Promise<boolean> {
  const take = Math.min(samplePages, pdf.numPages);
  for (let i = 1; i <= take; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    // Only count items with a 'str' property
    const chars = tc.items.reduce((acc: number, it: any) => acc + (typeof it.str === 'string' ? it.str.length : 0), 0);
    page.cleanup?.();
    if (chars > 50) return true;
  }
  return false;
}

async function renderPageToBlob(pdf: PDFDocumentProxy, pageNum: number, scale = 2): Promise<Blob> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png', 0.92)
  );
  page.cleanup?.();
  return blob;
}

export async function extractPdfText(
  pdf: PDFDocumentProxy,
  selPages?: number[],
  onProgress?: (done: number, total: number) => void
) {
  const pages = selPages ?? Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  const chunks: string[] = [];
  let done = 0;
  for (const p of pages) {
    const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  // Only extract items with a 'str' property
  const text = (tc.items as any[]).map((it) => typeof it.str === 'string' ? it.str : '').join(' ');
  chunks.push(text.trim());
    page.cleanup?.();
    done++; onProgress?.(done, pages.length);
  }
  return chunks.join('\n\n');
}

export async function pdfToOcrImages(
  pdf: PDFDocumentProxy,
  selPages: number[],
  scale = 2,
  onProgress?: (done: number, total: number) => void
): Promise<File[]> {
  const files: File[] = [];
  let done = 0;
  for (const p of selPages) {
    const blob = await renderPageToBlob(pdf, p, scale);
    files.push(new File([blob], `page-${p}.png`, { type: 'image/png' }));
    done++; onProgress?.(done, selPages.length);
  }
  return files;
}
