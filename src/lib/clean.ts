// src/lib/clean.ts
// Cleans OCR text before summarization: removes department/KUET headers, “References” blocks,
// book/publisher lines, fancy bullets, and near-duplicate noise. Keeps meaningful lines only.

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','for','to','of','in','on','at','by','with','from','as','is','are','was','were','be','been','being',
  'that','this','these','those','it','its','into','about','over','under','after','before','between','through','during','without','within',
  'i','you','he','she','we','they','them','his','her','their','our','your','my','me','us',
  'do','does','did','doing','done','can','could','should','would','may','might','must','will','shall',
  'not','no','yes','up','down','out','so','than','too','very','just','also','only','both','each','more','most','such','own','same'
]);

function toks(s: string) {
  const ascii = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ascii.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function contentToks(s: string) {
  return toks(s).filter(t => !STOPWORDS.has(t) && t.length > 2);
}
function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0; for (const x of a) if (b.has(x)) inter++; return inter / (a.size + b.size - inter + 1e-9);
}

// Domain terms (don’t drop short lines if they contain these)
const TELECOM_TERMS = new Set([
  'cell','cells','hexagonal','frequency','reuse','capacity','interference','co','channel','co-channel','adjacent',
  'sectoring','splitting','umbrella','microcell','femtocell','qos','sinr','ratio','distance',
  'path','loss','neighbor','cluster','assignment','method','definition','concept','coverage','power','antenna','base','station',
  'problem','solution','zone'
]);

// Obvious header/noise patterns
const HEADLINE_RE: RegExp[] = [
  /\bdepartment\b|\bdept\b|\bfaculty\b|\binstitute\b|\buniversity\b/i,
  /\bkuet\b/i,
  /\bcourse\b|\bcode\b|\broll\b|\bstudent\b|\bid\b|\bname\b|\bsection\b|\bsemester\b|\bsession\b|\bpage\b|\bexam\b/i,
  /^\s*(of\s+)?electrical( and)? (electronic|electronics)\b.*(kuet|department|faculty)\b/i
];

// Publisher/Book cues for bibliography lines
const PUBLISHERS = /\b(wiley|mcgraw[- ]hill|pearson|prentice|elsevier|springer|addison[- ]wesley|academic press|cambridge|oxford|artech|crc press)\b/i;

// Common slide heading words (to exit “references” mode)
const HEADING_CUES = /\b(definition|frequency reuse|interference|types of|co[-\s]?channel|adjacent channel|capacity|distance|method|approach|concept|cell splitting|sectoring|microcell|femtocell|advantages|improving coverage|signal to interference|umbrella cell|problem|solution)\b/i;

const BULLET_CHARS = /[•●▪■◦‣∙·➤▶❖■]/g;

function looksHeaderish(line: string): boolean {
  const s = line.trim();
  if (!s) return true;
  if (HEADLINE_RE.some(re => re.test(s))) return true;
  if (/^\s*of\s+electrical\b/i.test(s)) return true; // tails like "of Electrical ..."
  // Very short with no numbers or "?" — normally noise, BUT keep if it has domain terms
  const c = contentToks(s);
  if (c.length < 4 && !/[0-9?]/.test(s)) {
    const hasDomain = c.some(w => TELECOM_TERMS.has(w));
    if (!hasDomain) return true; // drop only if not a domain heading
  }
  // Mostly uppercase tokens and contains KUET-like text
  if (/[A-Z]{2,}/.test(s) && /kuet/i.test(s)) return true;
  return false;
}

function isReferenceHeading(s: string) {
  return /^\s*(references?|bibliography)\b/i.test(s);
}
function isReferenceItem(s: string) {
  // Typical “book line”: contains “by <Name>” or a publisher, or ends with a year, or “edition”
  if (/\bby\s+[A-Z][a-z]+/.test(s)) return true;
  if (PUBLISHERS.test(s)) return true;
  if (/\b(19|20)\d{2}\b/.test(s)) return true;
  if (/\bedition\b/i.test(s)) return true;
  // Looks like a title case line with many Caps and few content words
  const words = s.trim().split(/\s+/);
  const caps = words.filter(w => /^[A-Z][A-Za-z0-9-]*$/.test(w)).length;
  const cont = contentToks(s).length;
  if (caps >= 3 && cont < 6) return true;
  return false;
}

function normalizeLine(line: string): string {
  let s = line.replace(BULLET_CHARS, '-'); // fancy bullets -> '-'
  s = s.replace(/[–—]/g, '-');            // dashes
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function cleanForSummary(raw: string): string {
  if (!raw) return '';
  // Normalize bullets globally
  const text = raw.replace(BULLET_CHARS, '-');

  const lines = text.split(/\r?\n/);
  const keep: string[] = [];

  let inRefs = false;

  for (const ln of lines) {
    let s = normalizeLine(ln);
    if (!s) continue;

    // Enter/exit “References” block
    if (isReferenceHeading(s)) { inRefs = true; continue; }
    if (inRefs) {
      // If we hit a new topic heading, exit references mode
      if (HEADING_CUES.test(s)) { inRefs = false; /* fall through to normal handling */ }
      else {
        // Skip typical ref items
        if (isReferenceItem(s)) continue;
        // If line is light on content while in refs, skip it
        const ct = contentToks(s).length;
        if (ct < 6) continue;
        // else allow and also exit refs
        inRefs = false;
      }
    }

    // Regular noise filters
    if (looksHeaderish(s)) continue;
    // Remove trailing dept tails like “… KUET 14”
    s = s.replace(/\b(Dept\.?|Department|Faculty|KUET)\b.*$/i, '').trim();
    if (!s) continue;

    keep.push(s);
  }

  // Deduplicate near-identical lines
  const deduped: string[] = [];
  const seen: Set<string>[] = [];
  for (const l of keep) {
    const vec = new Set(contentToks(l));
    let dup = false;
    for (const prev of seen) { if (jaccard(vec, prev) >= 0.92) { dup = true; break; } }
    if (!dup) { deduped.push(l); seen.push(vec); }
  }

  return deduped.join('\n');
}