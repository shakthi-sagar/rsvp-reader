import { usePrefs, type ContextMode, type FontChoice, type Spacing } from '../../lib/storage/prefs';
import { ThemeSwitch } from '../ThemeSwitch';

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; style?: React.CSSProperties }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-lg bg-faint p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 h-8 rounded-md text-sm transition-colors ${value === o.id ? 'bg-raised text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
          style={o.style}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[0.7rem] uppercase tracking-[0.16em] text-subtle">{label}</p>
      {children}
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = usePrefs();
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="fixed z-50 right-3 sm:right-6 top-14 w-[min(19rem,calc(100vw-1.5rem))] rounded-xl bg-raised border border-line shadow-[0_12px_40px_-12px_rgb(0_0_0/0.35)] p-5 space-y-5 animate-in" role="dialog" aria-label="Reading settings">
        <Row label="Theme">
          <ThemeSwitch size="md" />
        </Row>
        <Row label="Typeface">
          <Segmented<FontChoice>
            label="Typeface"
            value={prefs.font}
            onChange={(font) => setPrefs({ font })}
            options={[
              { id: 'serif', label: 'Serif', style: { fontFamily: "'Literata Variable', Georgia, serif" } },
              { id: 'sans', label: 'Sans', style: { fontFamily: "'Inter Variable', system-ui, sans-serif" } },
              { id: 'mono', label: 'Mono', style: { fontFamily: 'ui-monospace, Menlo, monospace' } },
            ]}
          />
        </Row>
        <Row label="Size">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">A</span>
            <input
              type="range"
              min={36}
              max={120}
              step={2}
              value={prefs.fontSize}
              onChange={(e) => setPrefs({ fontSize: Number(e.target.value) })}
              className="flex-1 accent-[var(--accent)]"
              aria-label="Word size"
            />
            <span className="text-lg text-muted">A</span>
          </div>
        </Row>
        <Row label="Letter spacing">
          <Segmented<Spacing>
            label="Letter spacing"
            value={prefs.spacing}
            onChange={(spacing) => setPrefs({ spacing })}
            options={[
              { id: 'tight', label: 'Tight' },
              { id: 'normal', label: 'Normal' },
              { id: 'wide', label: 'Wide' },
            ]}
          />
        </Row>
        <Row label="Context text">
          <Segmented<ContextMode>
            label="Context text"
            value={prefs.contextMode}
            onChange={(contextMode) => setPrefs({ contextMode })}
            options={[
              { id: 'off', label: 'Off' },
              { id: 'paused', label: 'Paused' },
              { id: 'always', label: 'Always' },
            ]}
          />
        </Row>
      </div>
    </>
  );
}
