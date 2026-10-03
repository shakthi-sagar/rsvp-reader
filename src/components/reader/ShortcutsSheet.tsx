import { IconClose } from '../icons';

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Back / forward 5 words'],
  ['⇧ ← / ⇧ →', 'Previous / next sentence'],
  ['↑ / ↓', 'Speed ±25 WPM'],
  ['[ / ]', 'Speed ±10 WPM'],
  ['C', 'Contents'],
  ['F', 'Focus mode (fullscreen)'],
  ['Esc', 'Exit focus mode / close'],
  ['?', 'This list'],
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-in" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-raised border border-line p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="flex items-center justify-between mb-4">
          <p className="font-serif text-lg">Keyboard</p>
          <button onClick={onClose} className="p-1 text-muted hover:text-fg" aria-label="Close">
            <IconClose size={18} />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="font-sans text-xs px-1.5 py-0.5 rounded border border-line bg-faint text-fg whitespace-nowrap">{k}</kbd>
              </dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-subtle mt-5 leading-relaxed">On touch screens: tap the word to play or pause, swipe left or right to move by sentence.</p>
      </div>
    </div>
  );
}
