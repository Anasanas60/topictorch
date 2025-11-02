// src/lib/youtube.ts
// BAREBONES VERSION to fix the 400 Bad Request error.
// This version is super simple and removes all optional parameters.

const API = 'https://www.googleapis.com/youtube/v3';
const KEY = (import.meta.env.VITE_YT_API_KEY as string | undefined)?.trim();

export type YTVideo = {
  id: string;
  title: string;
  channel: string;
  thumb?: string;
  url: string;
};

// This is still needed by App.tsx, but is not used in this simplified search
export type SearchOptions = {
  langPref?: 'auto' | 'any' | 'en' | 'hi' | 'bn';
  ocrLang?: 'eng' | 'ben';
  maxResults?: number;
};

if (!KEY) console.warn('[YT] Missing VITE_YT_API_KEY.');

// Simplified Search - just the essentials
async function ytSearch(q: string, maxResults = 15) {
  const url = new URL(`${API}/search`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('q', q);
  url.searchParams.set('key', KEY!);

  console.log(`[YT] Calling Search API: ${url.toString()}`); // Debug log

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error('[YT] Search Error Response:', await res.text());
    throw new Error(`YouTube search failed with status: ${res.status}`);
  }
  const data = await res.json();
  return (data.items ?? []) as YouTubeSearchItem[];
}

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
    };
  };
}

function dedupeById(items: YouTubeSearchItem[]): YouTubeSearchItem[] {
  const byId = new Map<string, YouTubeSearchItem>();
  for (const item of items) {
    if (item.id?.videoId && !byId.has(item.id.videoId)) {
      byId.set(item.id.videoId, item);
    }
  }
  return Array.from(byId.values());
}

export async function searchTutorials(queries: string[], _keywords : string[], opts: SearchOptions = {}): Promise<YTVideo[]> {
  if (!KEY) throw new Error('YouTube API key is missing.');
  if (!queries || queries.length === 0) return [];

  const { maxResults = 12 } = opts;
  console.info('[YT] Using simple search with queries:', queries);

  const allItems: YouTubeSearchItem[] = [];
  for (const q of queries) {
    const items = await ytSearch(q);
    allItems.push(...items);
  }

  const uniqueItems = dedupeById(allItems);

  return uniqueItems
    .map((item: YouTubeSearchItem) => ({
      id: item.id.videoId,
      title: item.snippet.title || '',
      channel: item.snippet.channelTitle || '',
      thumb: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }))
    .slice(0, maxResults);
}

// This function is still needed for the fallback link in App.tsx
export function youtubeSearchURL(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}