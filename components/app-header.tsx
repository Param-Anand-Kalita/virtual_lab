'use client';

import type { ReactNode } from 'react';
import { Box, Compass, Hammer, ListChecks } from 'lucide-react';

export type Mode = 'explore' | 'build' | 'compatibility';

const MODES: { mode: Mode; label: string; Icon: typeof Box }[] = [
  { mode: 'explore', label: 'Explore', Icon: Compass },
  { mode: 'build', label: 'Build', Icon: Hammer },
  { mode: 'compatibility', label: 'Compatibility', Icon: ListChecks },
];

/** The header every mode shares. `mode` is owned by app/page.tsx: this only asks for a change and never holds state. */
export function AppHeader({ mode, onModeChange, actions }: { mode: Mode; onModeChange: (mode: Mode) => void; actions?: ReactNode }) {
  return (
    <header className="app-header">
      <span className="brand">
        <span className="brand-mark"><Box size={20} strokeWidth={1.7} /></span>
        <span className="brand-name">Build<span className="brand-accent">Bench</span></span>
      </span>
      <nav className="mode-nav" aria-label="Lab modes">
        {MODES.map(({ mode: id, label, Icon }) => (
          <button key={id} aria-current={id === mode ? 'page' : undefined} onClick={() => { if (id !== mode) onModeChange(id); }}>
            <Icon size={15} strokeWidth={1.8} />{label}
          </button>
        ))}
      </nav>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

/** The compact strip under the header: the one h1 of the page, what this mode is for, and an optional action. */
export function ContextStrip({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <section className="context-strip">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions}
    </section>
  );
}
