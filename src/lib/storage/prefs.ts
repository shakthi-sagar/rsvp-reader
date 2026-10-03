import { useCallback, useEffect, useSyncExternalStore } from 'react';

/** Lightweight preferences in localStorage. */

export type Theme = 'light' | 'dark' | 'sepia';
export type FontChoice = 'serif' | 'sans' | 'mono';
export type Spacing = 'tight' | 'normal' | 'wide';
/** When to show surrounding sentences under the RSVP word. */
export type ContextMode = 'off' | 'paused' | 'always';

export interface Prefs {
  theme?: Theme;
  font: FontChoice;
  /** RSVP word size in px (desktop baseline; scales down on small screens). */
  fontSize: number;
  spacing: Spacing;
  /** WPM used for books without saved progress. */
  wpm: number;
  contextMode: ContextMode;
}

const KEY = 'rsvp:prefs';
const DEFAULTS: Prefs = { font: 'serif', fontSize: 64, spacing: 'normal', wpm: 300, contextMode: 'paused' };

function read(): Prefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Migrate the old boolean preference.
    if (stored.contextMode === undefined && stored.showContext === false) stored.contextMode = 'off';
    delete stored.showContext;
    return { ...DEFAULTS, ...stored };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function systemTheme(): Theme {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, getPrefs);
  return [prefs, useCallback(setPrefs, [])];
}

/** Keeps <html data-theme> in sync with the preference (or the OS when unset). */
export function useApplyTheme(): Theme {
  const [prefs] = usePrefs();
  const sys = useSyncExternalStore(
    (fn) => {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    systemTheme,
  );
  const theme = prefs.theme ?? sys;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]') ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
    meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  }, [theme]);
  return theme;
}

export const FONT_STACKS: Record<FontChoice, string> = {
  serif: "'Literata Variable', 'Iowan Old Style', Charter, Georgia, serif",
  sans: "'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
};

export const LETTER_SPACING: Record<Spacing, string> = { tight: '-0.01em', normal: '0.01em', wide: '0.06em' };
