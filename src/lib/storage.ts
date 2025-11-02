// src/lib/storage.ts
// LocalStorage utilities for persisting app state

const STORAGE_PREFIX = 'topictorch_';

export interface StoredState {
  text: string;
  lang: 'eng' | 'ben';
  questions: string[];
  answers: Record<string, string>;
  bookmarks: Array<{
    id: string;
    title: string;
    channel: string;
    thumb?: string;
    url: string;
  }>;
  keywords: string[];
  timestamp: number;
}

export function saveState(state: Partial<StoredState>): void {
  try {
    const merged = { ...state, timestamp: Date.now() };
    localStorage.setItem(STORAGE_PREFIX + 'state', JSON.stringify(merged));
  } catch (error) {
    console.warn('Failed to save state to localStorage:', error);
  }
}

export function loadState(): Partial<StoredState> {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + 'state');
    if (!stored) return {};
    return JSON.parse(stored) as Partial<StoredState>;
  } catch (error) {
    console.warn('Failed to load state from localStorage:', error);
    return {};
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + 'state');
  } catch (error) {
    console.warn('Failed to clear state from localStorage:', error);
  }
}

export function getStateAge(): number | null {
  const state = loadState();
  if (!state.timestamp) return null;
  return Date.now() - state.timestamp;
}

export function hasStoredState(): boolean {
  const state = loadState();
  return !!(state.text || state.questions?.length || state.bookmarks?.length);
}
