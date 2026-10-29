'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import type { PartId } from '@/lib/components-data';
import type { Vec3 } from '@/lib/assembly';
import type { DragEnd, DragFeedback, DragOrigin, SceneController, SceneHooks, SceneState } from '@/lib/pc-scene-engine';

export type ViewportHandle = {
  view: (name: string) => void; zoom: (factor: number) => void; fit: () => void;
  beginDrag: (id: PartId, origin?: DragOrigin) => void; dragTo: (clientX: number, clientY: number) => DragFeedback; endDrag: (end: DragEnd) => Vec3 | null;
};
/** `onGrab`, `onDragFeedback` and `onDrop` report a loose part picked up in the 3D scene; Explore mode never sets them. */
type Props = SceneState & { onSelect: (id: PartId | null) => void } & Partial<SceneHooks>;
const PCViewport = forwardRef<ViewportHandle, Props>(function PCViewport(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SceneController | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useImperativeHandle(ref, () => ({
    view: (name) => engine.current?.view(name), zoom: (factor) => engine.current?.zoom(factor), fit: () => engine.current?.fit(),
    beginDrag: (id, origin) => engine.current?.beginDrag(id, origin),
    // Without a running scene there is no target to drop on, so every drop reads as outside the workspace.
    dragTo: (clientX, clientY) => engine.current?.dragTo(clientX, clientY) ?? { inside: false, onTarget: false },
    endDrag: (end) => engine.current?.endDrag(end) ?? null,
  }), []);
  useEffect(() => {
    let disposed = false;
    import('@/lib/pc-scene-engine').then(({ createPCScene }) => {
      if (disposed || !host.current) return;
      try {
        // Callbacks read the latest props, so the scene never holds a stale closure from the render it was created in.
        const hooks: SceneHooks = {
          onGrab: (id) => latest.current.onGrab?.(id),
          onDragFeedback: (feedback) => latest.current.onDragFeedback?.(feedback),
          onDrop: (id, feedback) => latest.current.onDrop?.(id, feedback),
        };
        engine.current = createPCScene(host.current, (id) => latest.current.onSelect(id), () => setError(true), hooks);
        engine.current.setState(latest.current);
        setReady(true);
      } catch (error) { console.error('3D scene initialization failed', error); setError(true); }
    }).catch((error) => { console.error('3D scene module failed to load', error); if (!disposed) setError(true); });
    return () => { disposed = true; engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { engine.current?.setState(props); }, [props.selected, props.removed, props.hidden, props.explode, props.isolate, props.labels, props.autoRotate, props.loose, props.frame]);
  return <div className="pc-viewport" ref={host}>
    {!ready && !error && <div className="scene-loading" role="status"><div className="scene-loading-mark"><Box size={29} strokeWidth={1.3} /></div><span>Preparing your 3D workbench…</span></div>}
    {error && <div className="scene-error" role="alert"><Box size={36} /><h3>The 3D view couldn’t start.</h3><p>This model needs WebGL 2. Try enabling hardware acceleration or opening it in a recent Chrome, Edge, Firefox or Safari browser. You can still explore the component explanations.</p><button className="outlined-button" onClick={() => window.location.reload()}>Reload 3D view</button></div>}
  </div>;
});
export default PCViewport;
