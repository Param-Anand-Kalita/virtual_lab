'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Box, BookOpen, ArrowRight, ArrowLeft, Check, CircleMinus, CircuitBoard, Cpu, Eye, EyeOff, Fan, Focus, HardDrive, Layers, Maximize, MemoryStick, Monitor, MousePointer2, PanelLeft, Power, RotateCcw, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { COMPONENTS, REMOVAL_ORDER, removeWithDependencies, reinstallWithDependencies, type PartId } from '@/lib/components-data';
import PCViewport, { type ViewportHandle } from './pc-viewport';
import { makeLabTools, registerLabTools } from '@/lib/webmcp';
import { AppHeader, ContextStrip, type Mode } from './app-header';
import ViewportToolbar from './viewport-toolbar';
import PanelTabs, { type Panel } from './panel-tabs';
import { revealInList } from './reveal-in-list';
import PartInspector from './part-inspector';
import AssemblyRail, { railSteps } from './assembly-rail';

const ICONS = { case: Box, panel: PanelLeft, motherboard: CircuitBoard, cpu: Cpu, cooler: Fan, ram: MemoryStick, gpu: Monitor, ssd: HardDrive, psu: Power, fans: Fan };
const groups = ['Enclosure', 'Core components', 'Power & cooling'];
const nameOf = (id: PartId) => COMPONENTS.find((part) => part.id === id)!.name;

export default function HardwareLab({ onModeChange }: { onModeChange: (mode: Mode) => void }) {
  const [selected, setSelected] = useState<PartId | null>(null);
  const [removed, setRemoved] = useState<PartId[]>([]);
  const [hidden, setHidden] = useState<PartId[]>([]);
  const [explode, setExplode] = useState(0);
  const [labels, setLabels] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [guided, setGuided] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [toast, setToast] = useState('');
  const [view, setView] = useState('perspective');
  const [panel, setPanel] = useState<Panel>('parts');
  const viewport = useRef<ViewportHandle>(null);
  const libraryList = useRef<HTMLDivElement>(null);
  const info = COMPONENTS.find((part) => part.id === selected);
  const InfoIcon = info ? ICONS[info.id] : Box;
  const nextStep = REMOVAL_ORDER.find((id) => !removed.includes(id));

  const select = useCallback((id: PartId | null) => {
    setSelected(id);
    if (id) {
      setHidden((old) => old.filter((part) => part !== id));
    } else setIsolate(false);
  }, []);
  const reset = useCallback(() => {
    setRemoved([]); setHidden([]); setExplode(0); setIsolate(false); setSelected(null);
    setAutoRotate(false); setGuided(false); setView('perspective'); viewport.current?.view('perspective');
    setToast('The computer is assembled again.');
  }, []);
  const snapshot = useRef({ selected, removed, hidden, explode, isolate, labels });
  snapshot.current = { selected, removed, hidden, explode, isolate, labels };
  useEffect(() => registerLabTools(makeLabTools({
    read: () => ({ ...snapshot.current }),
    inspect: (id, isolated) => flushSync(() => { select(id); setIsolate(isolated); }),
    assemble: (spacing) => flushSync(() => { setRemoved([]); setHidden([]); setIsolate(false); setGuided(false); setExplode(spacing); }),
  })), [select]);
  // Keep the selected part in view in the library. Only the library scrolls (sideways as a strip on narrow screens), never the page.
  useEffect(() => {
    const list = libraryList.current;
    const row = selected ? list?.querySelector<HTMLElement>(`[data-part="${selected}"]`) : null;
    if (list && row) revealInList(list, row);
  }, [selected]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,button,[role="slider"]') || event.target.isContentEditable)) return;
      if (event.key === 'Escape') { setIsolate(false); setFocusMode(false); }
      if (event.key.toLowerCase() === 'r') reset();
      if (event.key.toLowerCase() === 'l') setLabels((old) => !old);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [reset]);

  const removePart = (id: PartId) => {
    const next = removeWithDependencies(id, removed);
    const extra = next.filter((part) => part !== id && !removed.includes(part));
    setRemoved(next); setExplode(0); setIsolate(false); select(id);
    setToast(extra.length ? `${nameOf(id)} removed. ${extra.map(nameOf).join(', ')} moved aside first.` : `${nameOf(id)} removed.`);
  };
  const startGuide = () => {
    setGuided(true); setRemoved([]); setHidden([]); setExplode(0); setIsolate(false); setAutoRotate(false);
    select('panel'); setView('perspective'); viewport.current?.view('perspective');
  };
  const changeView = (value: string) => { setView(value); viewport.current?.view(value); };
  const toggleHidden = (id: PartId) => { setHidden((old) => old.includes(id) ? old.filter((part) => part !== id) : [...old, id]); };

  return (
    <div className={`lab-app lab-app--workbench ${focusMode ? 'focus-mode' : ''}`}>
      <AppHeader mode="explore" onModeChange={onModeChange} />
      <ContextStrip title="Explore the PC" actions={focusMode ? <button className="outlined-button active" onClick={() => setFocusMode(false)}><Maximize size={16} /> Exit focus mode</button> : undefined} />

      <main className="workbench" data-panel={panel}>
        <aside className="component-sidebar" aria-label="Computer components">
          <div className="sidebar-heading"><h2>Components</h2></div>
          <div ref={libraryList} className="component-list">
            {groups.map((group) => {
              const matches = COMPONENTS.filter((part) => part.category === group);
              return matches.length > 0 && <section className="component-group" key={group}><h3>{group}</h3>{matches.map((part) => {
                const Icon = ICONS[part.id]; const isHidden = hidden.includes(part.id); const state = removed.includes(part.id) ? { tone: 'removed', StatusIcon: CircleMinus, label: 'Removed from the PC' } : isHidden ? { tone: 'hidden', StatusIcon: EyeOff, label: 'Hidden in 3D view' } : null;
                return <div className={`component-row ${selected === part.id ? 'selected' : ''} ${isHidden ? 'is-hidden' : ''}`} key={part.id} data-part={part.id}>
                  <button className="component-select" onClick={() => select(part.id)} aria-pressed={selected === part.id}><span className="part-tile"><Icon size={18} strokeWidth={1.6} /></span><span className="part-info"><span className="part-name">{part.name}</span>{state && <span className={`part-status part-status--${state.tone}`}><state.StatusIcon size={12} aria-hidden="true" />{state.label}</span>}</span></button>
                  <button className="visibility-button" title={`${isHidden ? 'Show' : 'Hide'} ${part.name.toLowerCase()}`} aria-label={`${isHidden ? 'Show' : 'Hide'} ${part.name.toLowerCase()}`} aria-pressed={isHidden} onClick={() => toggleHidden(part.id)}>{isHidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>;
              })}</section>;
            })}
          </div>
        </aside>

        <section className="viewport-panel" aria-label="Interactive 3D computer">
          <ViewportToolbar view={view} onView={changeView} labels={labels} onLabels={setLabels} autoRotate={autoRotate} onAutoRotate={setAutoRotate} onZoom={(factor) => viewport.current?.zoom(factor)} onFit={() => viewport.current?.fit()} />
          <div className="viewport-stage">
            <PCViewport ref={viewport} selected={selected} removed={removed} hidden={hidden} explode={explode / 100} isolate={isolate} labels={labels} autoRotate={autoRotate} onSelect={(id) => { select(id); if (id) setPanel('details'); }} />
            {(isolate || explode > 0 || removed.length > 0) && <div className="model-caption"><span className="status-dot" /> {isolate && info ? `Inspecting ${info.short}` : explode > 0 ? 'Exploded assembly' : removed.length ? `${removed.length} ${removed.length === 1 ? 'part' : 'parts'} removed` : null}</div>}
            {isolate && <button className="exit-isolate" onClick={() => setIsolate(false)}><ArrowLeft size={14} /> Back to computer</button>}
            {toast && <div className="lab-toast" role="status"><Check size={16} />{toast}</div>}
          </div>
          <div className="viewport-bottom">
            <div className="assembly-controls">
              {guided ? <><button className="outlined-button compact" disabled={!removed.length} aria-label="Previous disassembly step" onClick={() => { const last = REMOVAL_ORDER.filter((id) => removed.includes(id)).at(-1); if (last) { setRemoved(removed.filter((id) => id !== last)); select(last); } }}><ArrowLeft size={16} /></button><div className="guided-progress"><span>{nextStep ? `Step ${removed.length + 1} of 9 · Next: ${nameOf(nextStep)}` : 'All 9 parts removed · Ready to rebuild?'}</span><AssemblyRail label="Disassembly progress" steps={railSteps(REMOVAL_ORDER, (id) => removed.includes(id), nextStep ?? null, nameOf)} doneWord="removed" /></div><button className="primary-button" onClick={() => nextStep ? removePart(nextStep) : reset()}>{nextStep ? `Remove ${COMPONENTS.find((part) => part.id === nextStep)!.short.toLowerCase()}` : 'Reassemble'}<ArrowRight size={15} /></button><button className="outlined-button compact" aria-label="Exit guided disassembly" title="Exit guided disassembly" onClick={() => setGuided(false)}><X size={16} /></button></> : <><div className="explode-slider"><div><label id="explode-label">Component spacing</label><output>{explode}%</output></div><Slider aria-labelledby="explode-label" value={[explode]} min={0} max={100} step={1} onValueChange={(values) => { setExplode(Array.isArray(values) ? values[0] : values); setRemoved([]); setIsolate(false); }} /></div><button className="reset-button" onClick={reset} title="Reset assembly (R)"><RotateCcw size={16} /><span>Reset</span></button></>}
            </div>
          </div>
        </section>

        <PanelTabs panel={panel} onPanel={setPanel} detail={info?.short ?? null} />

        <aside className="inspector" aria-label="Component information">
          {info && <button className="icon-button inspector-close" aria-label="Close component details" onClick={() => select(null)}><X size={16} /></button>}
          {info ? <PartInspector key={info.id} info={info} Icon={InfoIcon} state={removed.includes(info.id) ? { tone: 'neutral', Icon: CircleMinus, label: 'Removed from the PC' } : hidden.includes(info.id) ? { tone: 'neutral', Icon: EyeOff, label: 'Hidden in 3D view' } : { tone: 'neutral', Icon: Box, label: 'In the PC' }} actions={<><button className="primary-button full-width" aria-pressed={isolate} onClick={() => { setIsolate(!isolate); setHidden((old) => old.filter((id) => id !== info.id)); }}><Focus size={16} />{isolate ? 'Show full computer' : 'Inspect in isolation'}</button>{info.id !== 'case' && !guided && <button className="outlined-button full-width" onClick={() => { if (removed.includes(info.id)) { setRemoved(reinstallWithDependencies(info.id, removed)); setIsolate(false); setToast(info.id === 'panel' ? 'The computer is assembled again.' : `${info.name} reinstalled with its required supports.`); } else removePart(info.id); }}><Layers size={16} />{removed.includes(info.id) ? info.id === 'panel' ? 'Reassemble computer' : 'Reinstall component' : 'Remove component'}</button>}</>} /> : <div className="inspector-body"><div className="overview-detail">
            <div className="panel-hint"><span className="panel-hint-icon"><MousePointer2 size={20} strokeWidth={1.7} /></span><p>Select a part in the 3D view or the components list to see what it does.</p></div>
            <div className="start-lesson"><div><BookOpen size={19} /><span>A little guidance?</span></div><p>Take the computer apart, one step at a time.</p><button className="primary-button full-width" onClick={startGuide}>Start guided disassembly <ArrowRight size={15} /></button></div>
            <div className="start-lesson"><div><Layers size={19} /><span>Explode view</span></div><p>Spread the parts apart to see how they fit together.</p><button className="outlined-button full-width" aria-pressed={explode > 0} onClick={() => { setIsolate(false); setRemoved([]); setExplode(explode > 0 ? 0 : 100); }}><Layers size={15} /> {explode > 0 ? 'Assemble' : 'Explode view'}</button></div>
            <div className="start-lesson"><div><Maximize size={19} /><span>Focus mode</span></div><p>Hide the side panels so the 3D view fills the screen.</p><button className="outlined-button full-width" aria-pressed={focusMode} onClick={() => setFocusMode(!focusMode)}><Maximize size={15} /> {focusMode ? 'Exit focus mode' : 'Focus mode'}</button></div>
          </div></div>}
        </aside>
      </main>
    </div>
  );
}
