import Tesseract from 'tesseract.js';

export async function ocrImage(
  file: File,
  lang: 'eng' | 'ben' = 'eng',
  onProgress?: (p: number, status: string) => void
) {
  const { data } = await Tesseract.recognize(file, lang, {
    logger: (m) => onProgress?.(m.progress ?? 0, m.status ?? ''),
  });
  return {
    text: data.text ?? '',
    avgConfidence: (data as any).confidence ?? null,
  };
}