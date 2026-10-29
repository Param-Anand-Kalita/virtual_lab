'use client';

export type Panel = 'parts' | 'details';

/**
 * Below 640px the parts panel and the details panel share the space under the 3D view, one at a time. The tabs are
 * plain buttons and only show on narrow screens (CSS); the `data-panel` attribute on the workbench does the hiding, so
 * nothing about the panels' contents changes. `detail` names the selected part so it is visible from the Parts tab.
 */
export default function PanelTabs({ panel, onPanel, detail }: { panel: Panel; onPanel: (panel: Panel) => void; detail?: string | null }) {
  return (
    <nav className="panel-tabs" aria-label="Workbench panels">
      <button aria-pressed={panel === 'parts'} onClick={() => onPanel('parts')}>Parts</button>
      <button aria-pressed={panel === 'details'} onClick={() => onPanel('details')}>Details{detail && <span className="panel-tab-detail">{detail}</span>}</button>
    </nav>
  );
}
