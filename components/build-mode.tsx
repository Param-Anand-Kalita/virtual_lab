'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  CircuitBoard,
  Cpu,
  Fan,
  GripVertical,
  HardDrive,
  Layers,
  Lock,
  Maximize,
  MemoryStick,
  Monitor,
  Move,
  Package,
  PanelLeft,
  PartyPopper,
  Power,
  RotateCcw,
} from 'lucide-react';
import { COMPONENTS, PART_IDS, type PartId } from '@/lib/components-data';
import { BUILD_ORDER, MOUNT_SITES, canInstall, missingRequirements, nextBuildStep, partLocation, releaseUnavailableLoose, resolveDrop, trayParts, uninstallWithDependents, withoutLoose, type DropPoint, type LoosePlacements } from '@/lib/assembly';
import PCViewport, { type ViewportHandle } from './pc-viewport';
import { AppHeader, ContextStrip, type Mode } from './app-header';
import ViewportToolbar from './viewport-toolbar';
import PanelTabs, { type Panel } from './panel-tabs';
import { revealInList } from './reveal-in-list';
import PartInspector, { type PartState } from './part-inspector';
import InstallGuidance from './install-guidance';
import AssemblyRail, { railSteps } from './assembly-rail';

const ICONS: Record<PartId, typeof Box> = {
  case: Box, panel: PanelLeft, motherboard: CircuitBoard, cpu: Cpu,
  cooler: Fan, ram: MemoryStick, gpu: Monitor, ssd: HardDrive, psu: Power, fans: Fan,
};

/** Pointer travel (px) before a press on a tray card becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4;
/** Finger travel (px) across the tray before a touch becomes a part drag: a finger is less precise than a mouse. */
const TOUCH_DRAG_SLOP = 8;

const nameOf = (id: PartId) => COMPONENTS.find((part) => part.id === id)!.name;
const shortOf = (id: PartId) => COMPONENTS.find((part) => part.id === id)!.short;
/** "Needs A, B +3": as many prerequisite names as fit on one line, then a count. The full list is in the tooltip and the screen-reader text. */
const needsLabel = (needs: string[]) => {
  const label = (count: number) => `Needs ${needs.slice(0, count).join(', ')}${needs.length > count ? ` +${needs.length - count}` : ''}`;
  let count = 1;
  while (count < needs.length && label(count + 1).length <= 25) count++;
  return label(count);
};

type DragSession = { id: PartId; pointerId: number; startX: number; startY: number; active: boolean; card: HTMLElement };
type DragZone = 'outside' | 'viewport' | 'target';

export default function BuildMode({ onModeChange }: { onModeChange: (mode: Mode) => void }) {
  const [installed, setInstalled] = useState<PartId[]>([]);
  // Parts released away from their mount stay in the workspace, uninstalled, until they are installed or reset.
  const [loose, setLoose] = useState<LoosePlacements>({});
  // Selection (which part is active) and dragging (a part is in flight) are separate states.
  const [selected, setSelected] = useState<PartId | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [labels, setLabels] = useState(false);
  const [view, setView] = useState('perspective');
  const [panel, setPanel] = useState<Panel>('parts');
  const [toast, setToast] = useState('');
  const [dragging, setDragging] = useState<PartId | null>(null);
  const [dragZone, setDragZone] = useState<DragZone>('outside');
  // True while the drag is a loose part carried in the 3D scene rather than a card carried from the tray.
  const [sceneDrag, setSceneDrag] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [completed, setCompleted] = useState(false);
  const viewport = useRef<ViewportHandle>(null);
  const dragSession = useRef<DragSession | null>(null);
  const dragChip = useRef<HTMLDivElement>(null);
  const trayList = useRef<HTMLDivElement>(null);
  const next = nextBuildStep(installed);

  // The 3D viewport shows "removed" = everything NOT installed, but only loose parts are drawn: parts still in the tray are hidden.
  const removed = PART_IDS.filter((id) => !installed.includes(id));
  const hidden = trayParts(installed, loose);
  const selectedInfo = COMPONENTS.find((part) => part.id === selected);
  // With nothing selected the details tab shows the part to install next (the chassis on an empty bench).
  const info = selectedInfo ?? COMPONENTS.find((part) => part.id === (next ?? 'case'))!;
  const InfoIcon = ICONS[info.id];
  // What the inspector says about the selected part comes from the same state as the tray: installed, loose in the workspace, or still in the tray.
  const location = partLocation(info.id, installed, loose);
  const inspectorState: PartState = location === 'installed' ? { tone: 'ok', Icon: Check, label: 'Installed' } : location === 'loose' ? { tone: 'caution', Icon: Move, label: 'Loose in workspace' } : { tone: 'neutral', Icon: Package, label: 'In the parts tray' };
  const showActions = installed.includes(info.id) && info.id !== 'case';
  // One rail segment per part in BUILD_ORDER, derived from `installed`: the rail keeps no progress of its own.
  const steps = railSteps(BUILD_ORDER, (id) => installed.includes(id), next, nameOf);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const installPart = useCallback((id: PartId) => {
    if (installed.includes(id)) return;
    if (!canInstall(id, installed)) {
      setToast(`Install ${missingRequirements(id, installed).map(nameOf).join(', ')} first.`);
      return;
    }
    setInstalled((prev) => [...prev, id]);
    setLoose((prev) => withoutLoose(prev, id));
    setSelected(id);
    setToast(`${nameOf(id)} installed!`);
    if (installed.length + 1 === PART_IDS.length) {
      setCompleted(true);
      setToast('🎉 Your PC is fully assembled!');
    }
  }, [installed]);

  const uninstallPart = useCallback((id: PartId) => {
    if (id === 'case') return;
    // Anything that must come out before this part comes out with it.
    const remaining = uninstallWithDependents(id, installed);
    setInstalled(remaining);
    // Removed parts go back to the tray; a loose part that just lost a requirement goes with them.
    setLoose((prev) => releaseUnavailableLoose(remaining, prev));
    setCompleted(false);
    const extras = installed.filter((pid) => pid !== id && !remaining.includes(pid));
    setToast(extras.length
      ? `${nameOf(id)} removed, along with ${extras.map(nameOf).join(', ')}.`
      : `${nameOf(id)} removed.`
    );
  }, [installed]);

  /**
   * Abandons any drag, from the tray or in the scene: target highlights clear and capture is released. A part that came
   * from the tray goes back to it; a loose part returns to where it was resting. Does nothing when nothing is in flight.
   */
  const cancelDrag = useCallback(() => {
    const session = dragSession.current;
    dragSession.current = null;
    if (session?.card.hasPointerCapture(session.pointerId)) session.card.releasePointerCapture(session.pointerId);
    if (!session || session.active) viewport.current?.endDrag('cancel');
    setDragging(null);
    setSceneDrag(false);
    setDragZone('outside');
  }, []);

  const reset = useCallback(() => {
    cancelDrag();
    setInstalled([]);
    setLoose({});
    setSelected(null);
    setCompleted(false);
    setAutoRotate(false);
    setView('perspective');
    viewport.current?.view('perspective');
    setToast('Starting fresh. Drag components to build!');
  }, [cancelDrag]);

  const changeView = (value: string) => {
    setView(value);
    viewport.current?.view(value);
  };

  // ── Drag-and-drop: the tray card captures the pointer, and the 3D scene moves the real part ──
  // Capture keeps the gesture away from the canvas, so OrbitControls never orbits or pans during a drag.
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, id: PartId) => {
    if (event.button !== 0 || !event.isPrimary || dragSession.current) return;
    if ((event.target as HTMLElement).closest('button')) return;
    if (installed.includes(id) || !canInstall(id, installed)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragSession.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, card: event.currentTarget };
  };

  /** True when a touch has moved mostly across the tray's scroll axis: up or down on a horizontal strip, sideways on a vertical list. */
  const startsAcrossTray = (dx: number, dy: number) => {
    const strip = trayList.current ? getComputedStyle(trayList.current).flexDirection === 'row' : false;
    const along = strip ? Math.abs(dx) : Math.abs(dy);
    const across = strip ? Math.abs(dy) : Math.abs(dx);
    return across >= TOUCH_DRAG_SLOP && across > along;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.active) {
      const dx = event.clientX - session.startX, dy = event.clientY - session.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // Touch: the browser pans the tray along its own axis (see touch-action in the CSS), so a drag only begins once the finger
      // moves across that axis. Otherwise a swipe along the tray would flash a part into the scene just before the browser takes over.
      if (event.pointerType === 'touch' && !startsAcrossTray(dx, dy)) return;
      session.active = true;
      // A loose part's card picks up the same model that is already in the workspace.
      viewport.current?.beginDrag(session.id, loose[session.id] ? 'loose' : 'tray');
      // Selection waits for the drop. Changing it here would swap the inspector, which can resize the workbench and
      // the canvas with it, re-framing the camera in the middle of the gesture. The dragged card is highlighted instead.
      setDragging(session.id);
    }
    if (dragChip.current) dragChip.current.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 12}px)`;
    showDragZone(viewport.current?.dragTo(event.clientX, event.clientY) ?? { inside: false, onTarget: false });
  };

  /**
   * Resolves the end of any drag, from the tray or in the scene. Only a drop on the part's own target installs it. A drop
   * elsewhere in the workspace leaves the part loose, exactly where it was released, uninstalled and not counted in
   * progress, so it can be picked up and tried again. A drop outside the workspace cancels.
   */
  const completeDrop = (id: PartId, drop: DropPoint) => {
    const outcome = resolveDrop(id, installed, drop);
    const scene = viewport.current;
    if (outcome.kind === 'install') {
      scene?.endDrag('install');
      installPart(id);
    } else if (outcome.kind === 'missed') {
      const left = scene?.endDrag('loose');
      if (left) setLoose((prev) => ({ ...prev, [id]: left }));
      setSelected(id);
      setToast(`Not installed. The ${nameOf(id).toLowerCase()} stays in the workspace. Drag it onto the highlighted ${MOUNT_SITES[id]}.`);
    } else {
      scene?.endDrag('cancel');
      if (outcome.kind === 'locked') setToast(`Install ${outcome.missing.map(nameOf).join(', ')} first.`);
    }
    setDragging(null);
    setSceneDrag(false);
    setDragZone('outside');
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragSession.current = null;
    if (!session.active) return;
    completeDrop(session.id, viewport.current?.dragTo(event.clientX, event.clientY) ?? { inside: false, onTarget: false });
  };

  const showDragZone = (feedback: { inside: boolean; onTarget: boolean }) =>
    setDragZone(feedback.onTarget ? 'target' : feedback.inside ? 'viewport' : 'outside');

  const handlePointerAbort = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragSession.current?.pointerId === event.pointerId) cancelDrag();
  };

  // A press inside an existing text selection would otherwise start the browser's native text drag, which
  // cancels the pointer (dragstart, then pointercancel) and takes the gesture away from the part drag.
  // One delegated listener on the tray keeps ready cards for the part drag; their install buttons stay normal.
  useEffect(() => {
    const list = trayList.current;
    if (!list) return;
    const keepPressForPartDrag = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.build-part-card.ready') && !target.closest('button')) event.preventDefault();
    };
    const blockNativeDrag = (event: DragEvent) => event.preventDefault();
    // Clicking any card, whatever its state, makes that part the active component. Dragging does not need this: it selects at drag start.
    const selectClickedCard = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest<HTMLElement>('[data-part]');
      if (card && !target?.closest('button')) setSelected(card.dataset.part as PartId);
    };
    list.addEventListener('mousedown', keepPressForPartDrag);
    list.addEventListener('dragstart', blockNativeDrag);
    list.addEventListener('click', selectClickedCard);
    return () => {
      list.removeEventListener('mousedown', keepPressForPartDrag);
      list.removeEventListener('dragstart', blockNativeDrag);
      list.removeEventListener('click', selectClickedCard);
    };
  }, []);

  // Keep the selected card in view inside the tray. Only the tray scrolls (sideways as a strip, vertically as a list): scrolling the page mid-gesture would move the 3D view under the pointer.
  useEffect(() => {
    const list = trayList.current;
    const card = selected ? list?.querySelector<HTMLElement>(`[data-part="${selected}"]`) : null;
    if (list && card) revealInList(list, card);
  }, [selected]);

  // While a part is in flight, Escape cancels it and other shortcuts wait, so nothing changes underneath the drag.
  useEffect(() => {
    if (!dragging) return;
    const keydown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelDrag();
      setToast('Placement cancelled.');
    };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('blur', cancelDrag);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('blur', cancelDrag);
    };
  }, [dragging, cancelDrag]);

  // Keyboard shortcut
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,button,[role="slider"]') || event.target.isContentEditable)) return;
      if (event.key === 'Escape') setFocusMode(false);
      if (event.key.toLowerCase() === 'r') reset();
      if (event.key.toLowerCase() === 'l') setLabels((old) => !old);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [reset]);

  return (
    <div className={`lab-app lab-app--workbench ${focusMode ? 'focus-mode' : ''} ${dragging ? 'part-dragging' : ''}`}>
      <AppHeader mode="build" onModeChange={onModeChange} />
      <ContextStrip
        title="Build a PC"
        actions={
          <button className={`outlined-button ${focusMode ? 'active' : ''}`} aria-pressed={focusMode} onClick={() => setFocusMode(!focusMode)}>
            <Maximize size={16} /> {focusMode ? 'Exit focus mode' : 'Focus mode'}
          </button>
        }
      />

      <main className="workbench" data-panel={panel}>
        {/* ── Parts tray (left sidebar) ── */}
        <aside className="component-sidebar build-sidebar" aria-label="Parts tray">
          <div className="sidebar-heading">
            <h2>Parts tray</h2>
            <span className="count-badge">{PART_IDS.length - installed.length} left</span>
          </div>

          <div ref={trayList} className="component-list build-parts-list">
            {BUILD_ORDER.map((id) => {
              const isInstalled = installed.includes(id);
              const isReady = canInstall(id, installed) && !isInstalled;
              const isLocked = !isReady && !isInstalled;
              const isLoose = partLocation(id, installed, loose) === 'loose';
              const Icon = ICONS[id];
              const isCurrentDrag = dragging === id;
              // Prerequisites in build order, so the first name is the part that unlocks this one soonest.
              const needs = missingRequirements(id, installed).sort((a, b) => BUILD_ORDER.indexOf(a) - BUILD_ORDER.indexOf(b)).map(shortOf);
              const StatusIcon = isCurrentDrag || isLoose ? Move : isInstalled ? null : isReady ? GripVertical : Lock;
              const statusText = isCurrentDrag ? 'Being placed…' : isInstalled ? 'Installed' : isLoose ? 'Not installed — pick it up again' : isReady ? 'Ready to install' : needsLabel(needs);

              return (
                <div
                  key={id}
                  data-part={id}
                  aria-current={selected === id ? 'true' : undefined}
                  className={`build-part-card ${isInstalled ? 'installed' : ''} ${isReady ? 'ready' : ''} ${isLocked ? 'locked' : ''} ${isLoose ? 'loose' : ''} ${selected === id ? 'selected' : ''} ${isCurrentDrag ? 'dragging' : ''} ${id === next ? 'next-up' : ''}`}
                  onPointerDown={(event) => handlePointerDown(event, id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerAbort}
                  onLostPointerCapture={handlePointerAbort}
                  aria-disabled={!isReady}
                >
                  <span className="part-step" aria-hidden="true">
                    {isInstalled ? <Check size={14} strokeWidth={2.4} /> : String(BUILD_ORDER.indexOf(id) + 1).padStart(2, '0')}
                  </span>
                  <div className="part-tile"><Icon size={18} strokeWidth={1.6} /></div>
                  <div className="part-info">
                    <span className="part-name">
                      {shortOf(id)}
                      {isLoose ? <span className="part-tag part-tag--loose">Loose</span> : null}
                    </span>
                    <span className="part-status" title={isLocked ? `Needs ${needs.join(', ')} first` : undefined}>
                      {StatusIcon && <StatusIcon size={12} aria-hidden="true" />}
                      {isLocked ? <><span aria-hidden="true">{statusText}</span><span className="sr-only">Needs {needs.join(', ')}</span></> : statusText}
                    </span>
                  </div>
                  {isReady && (
                    <button className="build-part-add" onClick={() => installPart(id)} aria-label={`Install ${nameOf(id)}`} title={`Install ${nameOf(id)}`}>
                      <ArrowDownToLine size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── 3D viewport: drops land on the dragged part's own mount target ── */}
        <section className="viewport-panel" aria-label="3D workspace">
          <ViewportToolbar view={view} onView={changeView} labels={labels} onLabels={setLabels} autoRotate={autoRotate} onAutoRotate={setAutoRotate} onZoom={(factor) => viewport.current?.zoom(factor)} onFit={() => viewport.current?.fit()} />

          <div className="viewport-stage">
            <PCViewport
              ref={viewport}
              selected={selected}
              removed={removed}
              hidden={hidden}
              loose={loose}
              frame="assembly"
              explode={0}
              isolate={false}
              labels={labels}
              autoRotate={autoRotate}
              onSelect={(id) => { if (id) setSelected(id); }}
              onGrab={(id) => { setDragging(id); setSceneDrag(true); }}
              onDragFeedback={showDragZone}
              onDrop={completeDrop}
            />
            {installed.length === 0 && Object.keys(loose).length === 0 && dragZone === 'outside' && !sceneDrag && (
              <div className="empty-stage-hint">Drag and drop a part here to start building</div>
            )}

            {dragging && (dragZone !== 'outside' || sceneDrag) && (
              <output className={`drag-target-hint ${dragZone === 'target' ? 'on-target' : ''}`}>
                {dragZone === 'target' ? `Release to install the ${shortOf(dragging)}`
                  : dragZone === 'viewport' ? `Drop on the highlighted ${MOUNT_SITES[dragging]}`
                  : `Release to leave the ${shortOf(dragging)} where it was`}
              </output>
            )}
            {toast && <div className="lab-toast" role="status"><Check size={16} />{toast}</div>}
          </div>

          <div className="viewport-bottom">
            <div className="assembly-controls build-controls">
              <div className="build-progress">
                <div className="build-progress-head">
                  {completed
                    ? <strong className="build-progress-done"><PartyPopper size={16} /> PC assembled!</strong>
                    : <strong>{next ? `Install: ${nameOf(next)}` : 'All done!'}</strong>}
                  <span className="build-progress-count">{installed.length} / {PART_IDS.length} installed</span>
                </div>
                <AssemblyRail label="Assembly progress" steps={steps} doneWord="installed" />
              </div>
              {completed ? (
                <>
                  <button key="again" className="outlined-button" onClick={reset}><RotateCcw size={16} /> Build again</button>
                  <button key="explore" className="primary-button" onClick={() => onModeChange('explore')}>Explore your PC <ArrowRight size={15} /></button>
                </>
              ) : (
                <>
                  {next && (
                    <button key="install" className="primary-button" onClick={() => installPart(next)}>
                      Install {shortOf(next)} <ArrowRight size={15} />
                    </button>
                  )}
                  <button key="reset" className="reset-button" onClick={reset} title="Reset build (R)"><RotateCcw size={16} /><span>Reset</span></button>
                </>
              )}
            </div>
          </div>
        </section>

        <PanelTabs panel={panel} onPanel={setPanel} detail={selectedInfo?.short ?? null} />

        {/* ── Inspector (right sidebar) ── */}
        <aside className="inspector" aria-label="Component information">
          <PartInspector
            key={info.id}
            info={info}
            Icon={InfoIcon}
            state={inspectorState}
            guidance={<InstallGuidance id={info.id} installed={installed} loose={loose} nextId={next} />}
            actions={showActions ? (
              <>
                {installed.includes(info.id) && info.id !== 'case' && (
                  <button className="outlined-button full-width" onClick={() => uninstallPart(info.id)}>
                    <Layers size={16} /> Remove component
                  </button>
                )}
              </>
            ) : undefined}
          />
        </aside>
      </main>

      {/* Shown only while the pointer is outside the 3D view, where the part itself cannot follow. */}
      <div ref={dragChip} className={`drag-chip ${dragging && dragZone === 'outside' && !sceneDrag ? 'visible' : ''}`} aria-hidden="true">
        {dragging && `Placing ${shortOf(dragging)}`}
      </div>

    </div>
  );
}
