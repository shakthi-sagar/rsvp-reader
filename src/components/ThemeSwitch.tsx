import { systemTheme, usePrefs, type Theme } from '../lib/storage/prefs';

const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: 'light', label: 'Light', swatch: '#f8f7f3' },
  { id: 'sepia', label: 'Sepia', swatch: '#f2e9d8' },
  { id: 'dark', label: 'Dark', swatch: '#131312' },
];

/** Three swatches. Selecting the active one again returns to "follow the system". */
export function ThemeSwitch({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const [prefs, setPrefs] = usePrefs();
  const active = prefs.theme ?? systemTheme();
  const dim = size === 'md' ? 'h-8 w-8' : 'h-6 w-6';
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={active === t.id}
          title={`${t.label}${prefs.theme === undefined && active === t.id ? ' (system)' : ''}`}
          aria-label={t.label}
          onClick={() => setPrefs({ theme: prefs.theme === t.id ? undefined : t.id })}
          className={`${dim} rounded-full border transition-[box-shadow,border-color] ${
            active === t.id ? 'border-fg/60 shadow-[0_0_0_2px_var(--bg),0_0_0_3px_var(--subtle)]' : 'border-subtle/70 hover:border-muted'
          }`}
          style={{ background: t.swatch }}
        />
      ))}
    </div>
  );
}
