import { useSyncExternalStore } from 'react';

// Light or dark. A choice made with the switch is saved; otherwise the system setting is used.
export type Theme = 'light' | 'dark';

const KEY = 'notes.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

export const currentTheme = (): Theme => saved() ?? (media.matches ? 'dark' : 'light');

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // still applies for this visit
  }
  document.documentElement.dataset.theme = t;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  media.addEventListener('change', l);
  return () => {
    listeners.delete(l);
    media.removeEventListener('change', l);
  };
};

export const useTheme = () => useSyncExternalStore(subscribe, currentTheme);
