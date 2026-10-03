import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Object URL for a Blob, revoked on change/unmount. */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** True while the pointer has moved within the last `ms`. */
export function usePointerActivity(ms = 2200): boolean {
  const [active, setActive] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const last = useRef({ x: -1, y: -1 });
  useEffect(() => {
    const poke = (e: Event) => {
      if (e instanceof MouseEvent && e.type === 'mousemove') {
        // Ignore synthetic zero-distance moves (e.g. from layout shifts).
        if (Math.abs(e.clientX - last.current.x) + Math.abs(e.clientY - last.current.y) < 3) return;
        last.current = { x: e.clientX, y: e.clientY };
      }
      setActive(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setActive(false), ms);
    };
    window.addEventListener('mousemove', poke, { passive: true });
    window.addEventListener('pointerdown', poke, { passive: true });
    timer.current = window.setTimeout(() => setActive(false), ms);
    return () => {
      window.removeEventListener('mousemove', poke);
      window.removeEventListener('pointerdown', poke);
      window.clearTimeout(timer.current);
    };
  }, [ms]);
  return active;
}

function subscribeFullscreen(fn: () => void) {
  document.addEventListener('fullscreenchange', fn);
  return () => document.removeEventListener('fullscreenchange', fn);
}

export function useIsFullscreen(): boolean {
  return useSyncExternalStore(subscribeFullscreen, () => document.fullscreenElement != null);
}

export async function enterFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch {
    /* not allowed (e.g. iOS Safari) — focus mode still works without it */
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

/** Width of an element, tracked with ResizeObserver. */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
