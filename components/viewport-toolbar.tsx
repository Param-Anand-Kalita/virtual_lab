'use client';

import { Box, Focus, Rotate3d, ZoomIn, ZoomOut } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const VIEWS = [['perspective', '3D view'], ['side', 'Side'], ['front', 'Front']] as const;

type Props = {
  view: string; onView: (view: string) => void;
  labels: boolean; onLabels: (labels: boolean) => void;
  autoRotate: boolean; onAutoRotate: (autoRotate: boolean) => void;
  onZoom: (factor: number) => void; onFit: () => void;
};

/**
 * The row above the 3D canvas: camera views, zoom and framing, and the labels switch. It sits outside the canvas
 * (a grid row of the viewport panel), so none of it can intercept a pointer that is dragging a part in the scene.
 */
export default function ViewportToolbar({ view, onView, labels, onLabels, autoRotate, onAutoRotate, onZoom, onFit }: Props) {
  return (
    <div className="viewport-toolbar">
      <div className="view-presets" role="group" aria-label="Camera view">
        {VIEWS.map(([value, label]) => (
          <button key={value} className={view === value ? 'active' : ''} aria-pressed={view === value} onClick={() => onView(value)}>
            {value === 'perspective' && <Box size={14} />}{label}
          </button>
        ))}
      </div>
      <div className="canvas-tools" role="group" aria-label="3D view controls">
        <button aria-label="Zoom in" title="Zoom in" onClick={() => onZoom(0.8)}><ZoomIn size={18} /></button>
        <button aria-label="Zoom out" title="Zoom out" onClick={() => onZoom(1.25)}><ZoomOut size={18} /></button>
        <span />
        <button className={autoRotate ? 'active' : ''} aria-label="Auto rotate" title="Auto rotate" aria-pressed={autoRotate} onClick={() => onAutoRotate(!autoRotate)}><Rotate3d size={18} /></button>
        <button aria-label="Fit model in view" title="Fit model in view" onClick={onFit}><Focus size={18} /></button>
      </div>
      <label className="labels-control">
        <Switch size="sm" checked={labels} onCheckedChange={onLabels} aria-label="Component labels" /> Labels
      </label>
    </div>
  );
}
