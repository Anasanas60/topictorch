// src/lib/exportDocx.ts
// Build a .docx QnA document in the browser.

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveFile } from './save';

export type QnaItem = { question: string; answer?: string };

function runsFromInline(text: string): TextRun[] {
  // Parse **bold** and `code` into runs
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  const runs: TextRun[] = [];
  for (const part of parts) {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (/^`[^`]+`$/.test(part)) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: 'Consolas', color: '222222' }));
    } else {
      runs.push(new TextRun(part));
    }
  }
  return runs;
}

function paragraphFromLine(line: string): Paragraph {
  const l = line.trim();

  // Bullet-like lines (- or * items or numbered like "1. ")
  if (/^[-*•]\s+/.test(l)) {
    return new Paragraph({
      children: runsFromInline(l.replace(/^[-*•]\s+/, '')),
      bullet: { level: 0 }
    });
  }
  if (/^\d+\.\s+/.test(l)) {
    // Use bullet for simplicity (docx numbering config is heavier)
    return new Paragraph({
      children: runsFromInline(l.replace(/^\d+\.\s+/, '')),
      bullet: { level: 0 }
    });
  }
  return new Paragraph({ children: runsFromInline(l) });
}

function paragraphsFromAnswer(answer?: string): Paragraph[] {
  if (!answer) return [new Paragraph('')];
  const lines = answer.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return [new Paragraph('')];

  const paras: Paragraph[] = [];
  for (const line of lines) {
    paras.push(paragraphFromLine(line));
  }
  return paras;
}

export async function exportQnaDocx(
  opts: {
    title: string;
    qna: QnaItem[];
    meta?: Record<string, string | number | boolean>;
  },
  filenameBase: string
) {
  const { title, qna, meta } = opts;

  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE
    })
  );

  // Meta (date etc.)
  if (meta && Object.keys(meta).length) {
    const metaLine = Object.entries(meta)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join('  •  ');
    children.push(new Paragraph({ spacing: { after: 200 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: metaLine, italics: true, color: '555555' })] }));
    children.push(new Paragraph({ spacing: { after: 200 } }));
  } else {
    children.push(new Paragraph({ spacing: { after: 200 } }));
  }

  // QnA
  qna.forEach((item, idx) => {
    children.push(
      new Paragraph({
        text: `Q${idx + 1}. ${item.question}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 120 }
      })
    );

    const ansParas = paragraphsFromAnswer(item.answer);
    ansParas.forEach(p => children.push(p));
  });

  const doc = new Document({
    sections: [{ properties: {}, children }]
  });

  const blob = await Packer.toBlob(doc);
  saveFile(`${filenameBase}.docx`, blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}