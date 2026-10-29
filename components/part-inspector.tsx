'use client';

import type { ReactNode } from 'react';
import { Lightbulb, type LucideIcon } from 'lucide-react';
import type { ComponentInfo } from '@/lib/components-data';

export type PartState = { tone: 'neutral' | 'ok' | 'caution'; Icon: LucideIcon; label: string };

/**
 * The selected-part view of the inspector, shared by Explore and Build so both read the same way:
 * identity and state, optional guidance, role, analogy, connections, specifications, the fact to remember, then actions.
 * It renders the scrolling body and the pinned action footer; the parent supplies the `aside` and its top bar.
 */
export default function PartInspector({ info, Icon, state, guidance, actions }: { info: ComponentInfo; Icon: LucideIcon; state: PartState; guidance?: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <div className="inspector-body">
        <div className="component-detail">
          <header className="part-header">
            <div className="detail-icon"><Icon size={28} strokeWidth={1.4} /></div>
            <div className="part-header-text">
              <h2>{info.name}</h2>
              <span className="detail-category">{info.category}</span>
              <span className={`state-chip state-chip--${state.tone}`}><state.Icon size={13} aria-hidden="true" />{state.label}</span>
            </div>
          </header>
          {guidance}
          <section className="part-section"><h3>What it does</h3><p className="component-role">{info.role}</p></section>
          <div className="analogy"><Lightbulb size={16} aria-hidden="true" /><p>{info.analogy}</p></div>
          <section className="part-section"><h3>How it connects</h3><p>{info.connection}</p></section>
          <section className="part-section">
            <h3>Specifications</h3>
            <dl className="spec-list">{info.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <p className="example-note">Illustrative hardware. Example specifications vary between real computers.</p>
          </section>
          <section className="part-section did-you-know"><h3>One thing to remember</h3><p>{info.fact}</p></section>
        </div>
      </div>
      {actions && <div className="inspector-actions">{actions}</div>}
    </>
  );
}
