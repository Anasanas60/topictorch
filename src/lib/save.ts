// src/lib/save.ts
export function saveFile(filename: string, content: string | Blob, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildMarkdown({
  title, lang, text, summary, keywords, videos,
}: {
  title: string; lang: string; text: string;
  summary: string[]; keywords: string[]; videos: { title: string; url: string; channel?: string }[];
}) {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`title: ${title}`);
  lines.push(`language: ${lang}`);
  lines.push(`date: ${new Date().toISOString()}`);
  lines.push('---\n');
  if (summary?.length) {
    lines.push('## Summary');
    summary.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }
  if (keywords?.length) {
    lines.push('## Key Topics');
    lines.push(keywords.map(k => `\`${k}\``).join(' '));
    lines.push('');
  }
  if (videos?.length) {
    lines.push('## Recommended Tutorials');
    videos.forEach(v => lines.push(`- [${v.title}](${v.url})${v.channel ? ` — ${v.channel}` : ''}`));
    lines.push('');
  }
  lines.push('## Extracted Text\n');
  lines.push(text || '*No text*');
  return lines.join('\n');
}

export function saveMarkdownNote(params: Parameters<typeof buildMarkdown>[0], base: string) {
  const md = buildMarkdown(params);
  saveFile(`${base}.md`, md, 'text/markdown;charset=utf-8');
}

export function saveJSONNote(data: Record<string, unknown>, base: string) {
  saveFile(`${base}.json`, JSON.stringify(data, null, 2), 'application/json');
}