'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Box, BookOpen, ArrowRight, ArrowLeft, Check, Circle, CircleMinus, CircuitBoard, Cpu, Eye, EyeOff, Fan, Focus, Hammer, HardDrive, Layers, Maximize, MemoryStick, Monitor, MousePointer2, Move, PanelLeft, Power, RotateCcw, Search, Sparkles, X, CircleHelp } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { COMPONENTS, PART_IDS, REMOVAL_ORDER, removeWithDependencies, reinstallWithDependencies, type PartId } from '@/lib/components-data';
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
  const [visited, setVisited] = useState<PartId[]>([]);
  const [removed, setRemoved] = useState<PartId[]>([]);
  const [hidden, setHidden] = useState<PartId[]>([]);
  const [explode, setExplode] = useState(0);
  const [labels, setLabels] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [guided, setGuided] = useState(false);
  const [query, setQuery] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
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
      setVisited((old) => old.includes(id) ? old : [...old, id]);
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
      <AppHeader mode="explore" onModeChange={onModeChange} actions={<button className="quiet-button guide-button" onClick={() => setGuideOpen(true)}><BookOpen size={16} /> Teaching guide</button>} />
      <ContextStrip title="Explore the PC" description="Take apart a finished desktop and learn what each part does." actions={<button className={`outlined-button ${focusMode ? 'active' : ''}`} aria-pressed={focusMode} onClick={() => setFocusMode(!focusMode)}><Maximize size={16} /> {focusMode ? 'Exit focus mode' : 'Focus mode'}</button>} />

      <main className="workbench" data-panel={panel}>
        <aside className="component-sidebar" aria-label="Computer components">
          <div className="sidebar-heading"><h2>Components</h2><span className="count-badge">10</span></div>
          <label className="component-search"><Search size={15} /><input type="search" placeholder="Find a component…" aria-label="Find a component" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div ref={libraryList} className="component-list">
            {groups.map((group) => {
              const matches = COMPONENTS.filter((part) => part.category === group && `${part.name} ${part.short}`.toLowerCase().includes(query.toLowerCase()));
              return matches.length > 0 && <section className="component-group" key={group}><h3>{group}</h3>{matches.map((part) => {
                const Icon = ICONS[part.id]; const isHidden = hidden.includes(part.id); const state = removed.includes(part.id) ? { tone: 'removed', StatusIcon: CircleMinus, label: 'Removed from the PC' } : isHidden ? { tone: 'hidden', StatusIcon: EyeOff, label: 'Hidden in 3D view' } : visited.includes(part.id) ? { tone: 'viewed', StatusIcon: Check, label: 'Viewed' } : { tone: 'new', StatusIcon: Circle, label: 'Not viewed yet' };
                return <div className={`component-row ${selected === part.id ? 'selected' : ''} ${isHidden ? 'is-hidden' : ''}`} key={part.id} data-part={part.id}>
                  <button className="component-select" onClick={() => select(part.id)} aria-pressed={selected === part.id}><span className="part-tile"><Icon size={18} strokeWidth={1.6} /></span><span className="part-info"><span className="part-name">{part.name}</span><span className={`part-status part-status--${state.tone}`}><state.StatusIcon size={12} aria-hidden="true" />{state.label}</span></span></button>
                  <button className="visibility-button" title={`${isHidden ? 'Show' : 'Hide'} ${part.name.toLowerCase()}`} aria-label={`${isHidden ? 'Show' : 'Hide'} ${part.name.toLowerCase()}`} aria-pressed={isHidden} onClick={() => toggleHidden(part.id)}>{isHidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>;
              })}</section>;
            })}
            {COMPONENTS.every((part) => !`${part.name} ${part.short}`.toLowerCase().includes(query.toLowerCase())) && <p className="empty-search">No matching components.<button onClick={() => setQuery('')}>Clear search</button></p>}
          </div>
          <div className="discovery-progress"><div><span>{visited.length === 10 ? 'You explored every part!' : 'Your exploration'}</span><span>{visited.length}<span className="muted"> / 10</span></span></div><div className="progress-track"><span style={{ width: `${visited.length * 10}%` }} /></div><p>A little curiosity goes a long way.</p></div>
        </aside>

        <section className="viewport-panel" aria-label="Interactive 3D computer">
          <ViewportToolbar view={view} onView={changeView} labels={labels} onLabels={setLabels} autoRotate={autoRotate} onAutoRotate={setAutoRotate} onZoom={(factor) => viewport.current?.zoom(factor)} onFit={() => viewport.current?.fit()} />
          <div className="viewport-stage">
            <PCViewport ref={viewport} selected={selected} removed={removed} hidden={hidden} explode={explode / 100} isolate={isolate} labels={labels} autoRotate={autoRotate} onSelect={(id) => { select(id); if (id) setPanel('details'); }} />
            <div className="model-caption"><span className="status-dot" /> {isolate && info ? `Inspecting ${info.short}` : explode > 0 ? 'Exploded assembly' : removed.length ? `${removed.length} ${removed.length === 1 ? 'part' : 'parts'} removed` : 'ATX mid-tower'}<span className="caption-divider">/</span><span>Interactive 3D model</span></div>
            {isolate && <button className="exit-isolate" onClick={() => setIsolate(false)}><ArrowLeft size={14} /> Back to computer</button>}
            {guided && <div className="guided-strip"><div className="guide-step-number">{Math.min(removed.length + 1, 9)}</div><div><strong>{nextStep ? `Next: ${nameOf(nextStep)}` : 'You’ve taken the PC apart.'}</strong><span>{nextStep ? `Step ${removed.length + 1} of 9 · Select the part to learn more` : 'Every component has a role. Ready to rebuild?'}</span></div><button className="icon-button" aria-label="Exit guided disassembly" onClick={() => setGuided(false)}><X size={16} /></button></div>}
            {toast && <div className="lab-toast" role="status"><Check size={16} />{toast}</div>}
          </div>
          <div className="viewport-bottom">
            <div className="assembly-controls">
              {guided ? <><button className="outlined-button compact" disabled={!removed.length} aria-label="Previous disassembly step" onClick={() => { const last = REMOVAL_ORDER.filter((id) => removed.includes(id)).at(-1); if (last) { setRemoved(removed.filter((id) => id !== last)); select(last); } }}><ArrowLeft size={16} /></button><div className="guided-progress"><span>{removed.length} of 9 parts removed</span><AssemblyRail label="Disassembly progress" steps={railSteps(REMOVAL_ORDER, (id) => removed.includes(id), nextStep ?? null, nameOf)} doneWord="removed" /></div><button className="primary-button" onClick={() => nextStep ? removePart(nextStep) : reset()}>{nextStep ? `Remove ${COMPONENTS.find((part) => part.id === nextStep)!.short.toLowerCase()}` : 'Reassemble'}<ArrowRight size={15} /></button></> : <><button className="explode-button" aria-pressed={explode > 0} onClick={() => { setIsolate(false); setRemoved([]); setExplode(explode > 0 ? 0 : 100); }}><Layers size={17} /><span>{explode > 0 ? 'Assemble' : 'Explode view'}</span></button><div className="explode-slider"><div><label id="explode-label">Component spacing</label><output>{explode}%</output></div><Slider aria-labelledby="explode-label" value={[explode]} min={0} max={100} step={1} onValueChange={(values) => { setExplode(Array.isArray(values) ? values[0] : values); setRemoved([]); setIsolate(false); }} /></div><button className="reset-button" onClick={reset} title="Reset assembly (R)"><RotateCcw size={16} /><span>Reset</span></button></>}
            </div>
            <div className="interaction-hints"><span><MousePointer2 size={12} /> Drag to orbit</span><span><Move size={12} /> Right-drag to pan</span><span>Scroll to zoom</span><button onClick={() => setGuideOpen(true)} aria-label="Help with controls"><CircleHelp size={14} /></button></div>
          </div>
        </section>

        <PanelTabs panel={panel} onPanel={setPanel} detail={info?.short ?? null} />

        <aside className="inspector" aria-label="Component information">
          <div className="inspector-top"><span>{info ? 'Component details' : 'Your virtual workbench'}</span>{info && <button className="icon-button" aria-label="Close component details" onClick={() => select(null)}><X size={16} /></button>}</div>
          {info ? <PartInspector key={info.id} info={info} Icon={InfoIcon} state={removed.includes(info.id) ? { tone: 'neutral', Icon: CircleMinus, label: 'Removed from the PC' } : hidden.includes(info.id) ? { tone: 'neutral', Icon: EyeOff, label: 'Hidden in 3D view' } : { tone: 'neutral', Icon: Box, label: 'In the PC' }} actions={<><button className="primary-button full-width" aria-pressed={isolate} onClick={() => { setIsolate(!isolate); setHidden((old) => old.filter((id) => id !== info.id)); }}><Focus size={16} />{isolate ? 'Show full computer' : 'Inspect in isolation'}</button>{info.id !== 'case' && !guided && <button className="outlined-button full-width" onClick={() => { if (removed.includes(info.id)) { setRemoved(reinstallWithDependencies(info.id, removed)); setIsolate(false); setToast(info.id === 'panel' ? 'The computer is assembled again.' : `${info.name} reinstalled with its required supports.`); } else removePart(info.id); }}><Layers size={16} />{removed.includes(info.id) ? info.id === 'panel' ? 'Reassemble computer' : 'Reinstall component' : 'Remove component'}</button>}</>} /> : <div className="inspector-body"><div className="overview-detail">
            <div className="overview-illustration"><Box size={52} strokeWidth={1} /><span className="mini-chip"><Cpu size={21} strokeWidth={1.5} /></span></div>
            <span className="lesson-tag">Built for discovery</span><h2>Big ideas.<br />Small components.</h2><p>Every computer is a team of parts. Get to know each one, and discover what makes the whole system work.</p>
            <div className="how-to-item"><span><MousePointer2 size={17} /></span><div><strong>Pick a component</strong><p>Click the model or choose from the list.</p></div></div><div className="how-to-item"><span><Focus size={17} /></span><div><strong>Get a closer look</strong><p>Isolate any part and explore every angle.</p></div></div><div className="how-to-item"><span><Layers size={17} /></span><div><strong>See how it fits</strong><p>Spread out the assembly or remove parts.</p></div></div>
            <div className="start-lesson"><div><BookOpen size={19} /><span>A little guidance?</span></div><p>Take the computer apart, one step at a time.</p><button className="primary-button full-width" onClick={startGuide}>Start guided disassembly <ArrowRight size={15} /></button></div>
            <div className="start-lesson build-cta"><div><Sparkles size={19} /><span>Ready to build?</span></div><p>Drag and drop components to assemble your own PC from scratch.</p><button className="outlined-button full-width build-cta-button" onClick={() => onModeChange('build')}><Hammer size={15} /> Build your own PC <ArrowRight size={15} /></button></div>
            <p className="example-note">A detailed teaching model of a typical desktop PC. Components and connections are simplified for clarity.</p>
          </div></div>}
        </aside>
      </main>
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}><DialogContent className="teaching-dialog"><DialogTitle>Welcome to BuildBench.</DialogTitle><DialogDescription>A hands-on way to explore what’s inside a desktop computer.</DialogDescription><div className="guide-content"><h3>Make it your own lesson</h3><ol><li><strong>Explore the assembled computer.</strong> Orbit around the tower and identify the enclosure, ventilation and connections.</li><li><strong>Open it up.</strong> Start guided disassembly, or use the spacing slider to reveal every part at once.</li><li><strong>Ask what each part does.</strong> Select a component, read its role and isolate it for a closer look.</li><li><strong>Connect the ideas.</strong> Compare working memory with storage, or explain the path of heat from CPU to room.</li></ol><h3>Controls</h3><dl className="guide-shortcuts"><div><dt>Orbit</dt><dd>Left-drag / one-finger drag</dd></div><div><dt>Pan</dt><dd>Right-drag / two-finger drag</dd></div><div><dt>Zoom</dt><dd>Scroll / pinch / + and − buttons</dd></div><div><dt>Keyboard on 3D view</dt><dd>Arrow keys pan · + / − zoom</dd></div><div><dt>Reset / labels</dt><dd>R / L</dd></div><div><dt>Exit focus or isolation</dt><dd>Escape</dd></div></dl><h3>About the model</h3><p>A generic ATX desktop with ten component groups. The RAM pair and front fan pair are grouped for teaching. Illustrative specifications are not a parts shopping list. Disassembly animations simplify cables, screws and latches; this is not a physical repair procedure.</p><p className="hardware-safety">For real hardware, shut down, unplug mains power, follow the component manuals and use anti-static precautions. Never open the power supply.</p><p className="guide-sources">Further reading: <a href="https://www.intel.com/content/www/us/en/gaming/resources/how-to-build-a-gaming-pc.html" target="_blank" rel="noreferrer">Intel’s PC assembly guide</a> · <a href="https://threejs.org/" target="_blank" rel="noreferrer">Three.js</a></p></div><button className="primary-button" onClick={() => { setGuideOpen(false); startGuide(); }}>Let’s take it apart <ArrowRight size={16} /></button></DialogContent></Dialog>
    </div>
  );
}
