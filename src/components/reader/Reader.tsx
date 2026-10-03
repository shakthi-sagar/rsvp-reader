import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { BookContent, BookMeta, ReadingProgress } from '../../lib/book/types';
import { TokenFlag } from '../../lib/book/types';
import { loadContent, type ProcessStatus } from '../../lib/book/process';
import * as db from '../../lib/storage/db';
import { PlaybackEngine } from '../../lib/rsvp/engine';
import { computeTimings, remainingMs, TIMING } from '../../lib/rsvp/timing';
import { floorIndex } from '../../lib/rsvp/navigation';
import { usePrefs } from '../../lib/storage/prefs';
import { enterFullscreen, exitFullscreen, useIsFullscreen, usePointerActivity } from '../../hooks/misc';
import { RsvpWord } from './RsvpWord';
import { ContextView } from './ContextView';
import { Scrubber } from './Scrubber';
import { ChapterDrawer } from './ChapterDrawer';
import { SettingsPanel } from './SettingsPanel';
import { ShortcutsSheet } from './ShortcutsSheet';
import { WpmControl } from './WpmControl';
import {
  IconBack,
  IconCollapse,
  IconExpand,
  IconForward,
  IconList,
  IconPause,
  IconPlay,
  IconRewind,
  IconSentenceNext,
  IconSentencePrev,
  IconSettings,
} from '../icons';

const STEP_WORDS = 5;
const REWIND_WORDS = 10;
const SAVE_INTERVAL_MS = 3000;

export function Reader({ bookId, onExit }: { bookId: string; onExit: () => void }) {
  const [data, setData] = useState<{ meta: BookMeta; content: BookContent; progress?: ReadingProgress } | null>(null);
  const [status, setStatus] = useState<ProcessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { meta, content } = await loadContent(bookId, setStatus);
        const progress = await db.getProgress(bookId);
        db.touchBook(bookId).catch(() => {});
        if (!cancelled) setData({ meta, content, progress });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'This book could not be opened.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="font-serif text-xl">{error}</p>
        <button onClick={onExit} className="text-sm text-muted hover:text-fg underline underline-offset-4">
          Back to library
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="h-full flex items-center justify-center" aria-live="polite">
        <div className="w-40 h-px bg-faint overflow-hidden">
          <div className="h-full w-1/3 bg-muted" style={{ animation: 'indeterminate 1.1s ease-in-out infinite' }} />
        </div>
        {status && <span className="sr-only">Preparing book…</span>}
      </div>
    );
  }
  return <ReaderView {...data} onExit={onExit} />;
}

function formatRemaining(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'under a minute left';
  if (min < 60) return `${min} min remaining`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${m.toString().padStart(2, '0')} min remaining`;
}

const nf = new Intl.NumberFormat();

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function ReaderView({ meta, content, progress, onExit }: { meta: BookMeta; content: BookContent; progress?: ReadingProgress; onExit: () => void }) {
  const [prefs, setPrefs] = usePrefs();
  const total = content.words.length;

  const timings = useMemo(() => computeTimings(content.words, content.flags), [content]);
  const [engine] = useState(
    () =>
      new PlaybackEngine({
        multipliers: timings.multipliers,
        sentenceStarts: content.sentenceStarts,
        wpm: progress?.wpm ?? prefs.wpm,
        index: progress?.token ?? 0,
      }),
  );
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const { index, playing, wpm, finished } = state;

  // ---- derived navigation data ----------------------------------------
  const tocOrder = useMemo(() => content.toc.map((e, i) => ({ token: e.token, i })).sort((a, b) => a.token - b.token || a.i - b.i), [content]);
  const tocTokens = useMemo(() => Uint32Array.from(tocOrder.map((x) => x.token)), [tocOrder]);
  const chapters = useMemo(() => {
    const top = content.toc.filter((e) => e.depth === 0);
    return (top.length >= 2 ? top : content.toc).map((e) => e.token).sort((a, b) => a - b);
  }, [content]);
  const currentToc = (() => {
    const k = floorIndex(tocTokens, index);
    return k >= 0 ? tocOrder[k].i : -1;
  })();
  const chapterLabel = currentToc >= 0 ? content.toc[currentToc].label : meta.title;
  const chapterNumber = floorIndex(chapters, index) + 1;
  const labelAt = useCallback(
    (token: number) => {
      const k = floorIndex(tocTokens, token);
      return k >= 0 ? content.toc[tocOrder[k].i].label : meta.title;
    },
    [content, tocOrder, tocTokens, meta.title],
  );

  const percent = total > 1 ? Math.round((index / (total - 1)) * 100) : 100;
  const remaining = remainingMs(timings.prefix, index, total, wpm);

  // ---- UI state --------------------------------------------------------
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [focus, setFocus] = useState(false);
  const [prompt, setPrompt] = useState<'resume' | 'intro' | null>(progress && progress.token > 0 ? 'resume' : 'intro');
  const [wpmFlash, setWpmFlash] = useState(0);
  const pointerActive = usePointerActivity();
  const isFullscreen = useIsFullscreen();
  const overlayOpen = drawer || settings || help;
  const chromeVisible = !playing || pointerActive || overlayOpen;

  useEffect(() => {
    if (playing) setPrompt(null);
  }, [playing]);

  // Leaving browser fullscreen (Esc handled by the browser) also leaves focus mode.
  const wasFullscreen = useRef(false);
  useEffect(() => {
    if (wasFullscreen.current && !isFullscreen) setFocus(false);
    wasFullscreen.current = isFullscreen;
  }, [isFullscreen]);

  const toggleFocus = useCallback(() => {
    setFocus((f) => {
      if (f) exitFullscreen();
      else enterFullscreen();
      return !f;
    });
  }, []);

  // ---- persistence -----------------------------------------------------
  const save = useCallback(() => {
    const s = engine.getState();
    db.saveProgress({
      bookId: meta.id,
      token: s.index,
      progress: total > 1 ? s.index / (total - 1) : 1,
      wpm: s.wpm,
      updatedAt: Date.now(),
    }).catch(() => {});
  }, [engine, meta.id, total]);

  useEffect(() => {
    let lastSave = 0;
    let saved = { index: engine.getState().index, wpm: engine.getState().wpm };
    const unsub = engine.subscribe(() => {
      const s = engine.getState();
      if (s.index === saved.index && s.wpm === saved.wpm) return;
      const now = Date.now();
      if (!s.playing || now - lastSave >= SAVE_INTERVAL_MS) {
        lastSave = now;
        saved = { index: s.index, wpm: s.wpm };
        save();
      }
    });
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        engine.pause();
        save();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      engine.pause();
      save();
    };
  }, [engine, save]);

  // Remember the last used speed as the default for other books.
  useEffect(() => {
    const t = setTimeout(() => setPrefs({ wpm }), 400);
    return () => clearTimeout(t);
  }, [wpm, setPrefs]);

  // ---- actions -----------------------------------------------------------
  const changeWpm = useCallback(
    (next: number) => {
      engine.setWpm(next);
      setWpmFlash(Date.now());
    },
    [engine],
  );
  const seek = useCallback(
    (token: number) => {
      setPrompt(null);
      engine.seek(token);
    },
    [engine],
  );
  const jumpToChapter = useCallback(
    (token: number) => {
      setDrawer(false);
      setPrompt(null);
      engine.seek(token);
      engine.play();
    },
    [engine],
  );

  // Scrubbing pauses playback and resumes it on release.
  const resumeAfterScrub = useRef(false);
  const onScrubStart = useCallback(() => {
    resumeAfterScrub.current = engine.getState().playing;
    engine.pause();
  }, [engine]);
  const onScrubEnd = useCallback(
    (token: number) => {
      seek(token);
      if (resumeAfterScrub.current) engine.play();
    },
    [engine, seek],
  );

  // ---- keyboard ----------------------------------------------------------
  const keyState = useRef({ overlayOpen, focus, drawer, settings, help });
  keyState.current = { overlayOpen, focus, drawer, settings, help };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target) && e.key !== 'Escape') return;
      const k = keyState.current;
      const s = engine.getState();
      let handled = true;
      switch (e.key) {
        case ' ':
        case 'Spacebar':
        case 'k':
          (document.activeElement as HTMLElement | null)?.blur?.();
          if (!k.overlayOpen) engine.toggle();
          break;
        case 'ArrowLeft':
          if (e.shiftKey) engine.previousSentence();
          else engine.step(-STEP_WORDS);
          setPrompt(null);
          break;
        case 'ArrowRight':
          if (e.shiftKey) engine.nextSentence();
          else engine.step(STEP_WORDS);
          setPrompt(null);
          break;
        case 'ArrowUp':
          changeWpm(s.wpm + 25);
          break;
        case 'ArrowDown':
          changeWpm(s.wpm - 25);
          break;
        case ']':
          changeWpm(s.wpm + 10);
          break;
        case '[':
          changeWpm(s.wpm - 10);
          break;
        case 'f':
        case 'F':
          toggleFocus();
          break;
        case 'c':
        case 'C':
          engine.pause();
          setDrawer((d) => !d);
          break;
        case '?':
          setHelp((h) => !h);
          break;
        case 'Escape':
          if (k.help) setHelp(false);
          else if (k.settings) setSettings(false);
          else if (k.drawer) setDrawer(false);
          else if (k.focus) {
            setFocus(false);
            exitFullscreen();
          } else handled = false;
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, changeWpm, toggleFocus]);

  // ---- touch / click on the stage ---------------------------------------
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null);
  const onStagePointerDown = (e: React.PointerEvent) => {
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onStagePointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setPrompt(null);
      if (dx < 0) engine.nextSentence();
      else engine.previousSentence();
      return;
    }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - g.t < 600) engine.toggle();
  };

  // ---- render ------------------------------------------------------------
  const word = content.words[index] ?? '';
  const flags = content.flags[index] ?? 0;
  const showWpmFlash = playing && Date.now() - wpmFlash < 1200;
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!wpmFlash) return;
    const t = setTimeout(() => forceTick((n) => n + 1), 1250);
    return () => clearTimeout(t);
  }, [wpmFlash]);

  const headerHidden = focus && !chromeVisible;
  const footerHidden = !chromeVisible;
  const wordsRead = index + 1;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-bg select-none" style={{ cursor: playing && !pointerActive && !overlayOpen ? 'none' : undefined }}>
      {/* Header */}
      <header
        className={`chrome relative z-10 flex items-center justify-between gap-3 px-3 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 ${focus ? '' : playing && !pointerActive ? 'opacity-45' : ''}`}
        data-hidden={headerHidden}
      >
        <div className="flex items-center gap-1 min-w-0">
          <button onClick={onExit} className="p-2 -ml-1 text-muted hover:text-fg rounded-full shrink-0" aria-label="Back to library" title="Library">
            <IconBack size={18} />
          </button>
          <button onClick={() => { engine.pause(); setDrawer(true); }} className="min-w-0 text-left text-sm text-muted hover:text-fg truncate" title="Contents (C)">
            {chapterLabel}
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm text-muted tabular mr-2">{percent}%</span>
          <button onClick={() => { engine.pause(); setDrawer(true); }} className="p-2 text-muted hover:text-fg rounded-full" aria-label="Contents" title="Contents (C)">
            <IconList size={18} />
          </button>
          <button onClick={() => setSettings((s) => !s)} className="p-2 text-muted hover:text-fg rounded-full" aria-label="Reading settings" title="Settings">
            <IconSettings size={18} />
          </button>
          <button onClick={toggleFocus} className="p-2 -mr-1 text-muted hover:text-fg rounded-full" aria-label={focus ? 'Exit focus mode' : 'Focus mode'} title={focus ? 'Exit focus (Esc)' : 'Focus mode (F)'}>
            {focus ? <IconCollapse size={18} /> : <IconExpand size={18} />}
          </button>
        </div>
      </header>

      {/* Stage */}
      <main className="relative flex-1 min-h-0 touch-pan-y [container-type:size]" onPointerDown={onStagePointerDown} onPointerUp={onStagePointerUp} onPointerCancel={() => (gesture.current = null)}>
        <div className="absolute inset-x-0 top-[40%] -translate-y-1/2 px-2" aria-label="Current word">
          <RsvpWord
            word={word}
            heading={(flags & TokenFlag.Heading) !== 0}
            emphasis={(flags & TokenFlag.Emphasis) !== 0}
            font={prefs.font}
            fontSize={prefs.fontSize}
            spacing={prefs.spacing}
          />
          <div className={`absolute left-1/2 -translate-x-1/2 top-full mt-3 text-xs tabular text-muted transition-opacity duration-300 ${showWpmFlash ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">
            {wpm} wpm
          </div>

          <div
            className={`absolute inset-x-0 top-full mt-7 sm:mt-9 px-3 sm:px-6 overflow-hidden transition-opacity duration-300 ${
              !playing ? 'opacity-100' : prefs.contextMode === 'always' && !prompt && !finished ? 'opacity-55' : 'opacity-0 pointer-events-none'
            }`}
            style={{ maxHeight: 'calc(60cqh - 4rem)' }}
          >
          {finished ? (
            <div className="text-center animate-in">
              <p className="font-serif text-xl">The end.</p>
              <p className="text-sm text-muted mt-2">{nf.format(total)} words read with RSVP.</p>
              <div className="mt-5 flex justify-center gap-5 text-sm">
                <button onClick={onExit} className="text-fg hover:text-accent">Back to library</button>
                <button onClick={() => seek(0)} className="text-muted hover:text-fg">Start over</button>
              </div>
            </div>
          ) : prompt === 'resume' ? (
            <div className="text-center animate-in" onPointerUp={(e) => e.stopPropagation()}>
              <button onClick={() => engine.play()} className="inline-flex items-center gap-2.5 h-11 px-6 rounded-full bg-fg text-bg text-[0.95rem] hover:opacity-90 transition-opacity">
                <IconPlay size={16} />
                Continue from {percent}%
              </button>
              <p className="text-sm text-muted mt-3 truncate">{chapterLabel}</p>
              <div className="mt-4 flex justify-center gap-5 text-sm text-muted">
                <button onClick={() => { engine.pause(); setDrawer(true); }} className="hover:text-fg">Choose chapter</button>
                <button onClick={() => seek(0)} className="hover:text-fg">Start from beginning</button>
              </div>
            </div>
          ) : prompt === 'intro' ? (
            <div className="text-center animate-in" onPointerUp={(e) => e.stopPropagation()}>
              <p className="font-serif text-lg">{meta.title}</p>
              <p className="text-sm text-muted mt-1">
                {meta.author} · {nf.format(total)} words · {formatRemaining(remaining).replace(' remaining', '').replace(' left', '')} at {wpm} wpm
              </p>
              <div className="mt-5 flex justify-center items-center gap-5 text-sm">
                <button onClick={() => engine.play()} className="inline-flex items-center gap-2.5 h-11 px-6 rounded-full bg-fg text-bg text-[0.95rem] hover:opacity-90 transition-opacity">
                  <IconPlay size={16} />
                  Start reading
                </button>
                <button onClick={() => { engine.pause(); setDrawer(true); }} className="text-muted hover:text-fg">Choose chapter</button>
              </div>
              <p className="hidden sm:block text-xs text-subtle mt-6">Space to play · arrows to move · ? for shortcuts</p>
            </div>
          ) : prefs.contextMode !== 'off' ? (
            <FadeOverflow onPointerUp={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} deps={index}>
              <ContextView content={content} index={index} onSeek={seek} />
            </FadeOverflow>
          ) : null}
          </div>
        </div>
      </main>

      {/* Controls */}
      <footer className="chrome relative z-10 px-4 sm:px-8 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-hidden={footerHidden}>
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-center gap-1 sm:gap-3">
            <CtrlButton label={`Back ${REWIND_WORDS} words`} hint="←" onClick={() => { setPrompt(null); engine.step(-REWIND_WORDS); }}>
              <IconRewind size={19} />
            </CtrlButton>
            <CtrlButton label="Previous sentence" hint="⇧←" onClick={() => { setPrompt(null); engine.previousSentence(); }}>
              <IconSentencePrev size={19} />
            </CtrlButton>
            <button
              onClick={() => engine.toggle()}
              onMouseDown={(e) => e.preventDefault()}
              className="mx-2 sm:mx-4 h-14 w-14 rounded-full border border-line text-fg flex items-center justify-center hover:bg-faint transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
              title={`${playing ? 'Pause' : 'Play'} (Space)`}
            >
              {playing ? <IconPause size={22} /> : <IconPlay size={22} className="translate-x-[1px]" />}
            </button>
            <CtrlButton label="Next sentence" hint="⇧→" onClick={() => { setPrompt(null); engine.nextSentence(); }}>
              <IconSentenceNext size={19} />
            </CtrlButton>
            <CtrlButton label={`Forward ${REWIND_WORDS} words`} hint="→" onClick={() => { setPrompt(null); engine.step(REWIND_WORDS); }}>
              <IconForward size={19} />
            </CtrlButton>
          </div>

          <div className="mt-2 flex justify-center">
            <WpmControl wpm={wpm} onChange={changeWpm} min={TIMING.minWpm} max={TIMING.maxWpm} />
          </div>

          <div className="mt-2">
            <Scrubber index={index} total={total} ticks={chapters.length <= 120 ? chapters : []} labelAt={labelAt} onScrubStart={onScrubStart} onScrubEnd={onScrubEnd} />
          </div>

          <div className="flex items-center justify-between gap-4 text-xs text-muted tabular -mt-0.5">
            <span className="truncate">{chapters.length > 1 && chapterNumber > 0 ? `Chapter ${chapterNumber} of ${chapters.length}` : meta.title}</span>
            <span className="flex items-center gap-3 shrink-0">
              <span>{formatRemaining(remaining)}</span>
              <span className="hidden sm:inline text-subtle">
                {nf.format(wordsRead)} / {nf.format(total)} words
              </span>
              <button onClick={() => setHelp(true)} className="hidden sm:inline-flex h-5 w-5 items-center justify-center rounded-full border border-line text-subtle hover:text-fg" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
                ?
              </button>
            </span>
          </div>
        </div>
      </footer>

      <ChapterDrawer open={drawer} title={meta.title} author={meta.author} toc={content.toc} current={currentToc} total={total} onClose={() => setDrawer(false)} onSelect={jumpToChapter} />
      {settings && <SettingsPanel onClose={() => setSettings(false)} />}
      {help && <ShortcutsSheet onClose={() => setHelp(false)} />}
    </div>
  );
}

/** Clips to the available height and fades the bottom edge only when content overflows. */
function FadeOverflow({ children, deps, ...rest }: React.HTMLAttributes<HTMLDivElement> & { deps: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    // Keep the current word visible (clipped content can still be scrolled programmatically).
    const cur = el.querySelector<HTMLElement>('[data-current]');
    if (cur) {
      const top = cur.offsetTop - el.offsetTop;
      if (top < el.scrollTop || top + cur.offsetHeight > el.scrollTop + el.clientHeight - 48) {
        el.scrollTop = Math.max(0, top - el.clientHeight / 3);
      }
    }
  }, [deps]);
  return (
    <div
      ref={ref}
      {...rest}
      className="overflow-hidden"
      style={{ maxHeight: 'calc(60cqh - 4rem)', maskImage: overflowing ? 'linear-gradient(to bottom, black calc(100% - 3rem), transparent)' : undefined }}
    >
      {children}
    </div>
  );
}

function CtrlButton({ label, hint, onClick, children }: { label: string; hint: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      className="h-11 w-11 rounded-full text-muted hover:text-fg hover:bg-faint flex items-center justify-center transition-colors"
      aria-label={label}
      title={`${label} (${hint})`}
    >
      {children}
    </button>
  );
}
