'use client';

import { ArrowRight, Check, Circle, Lock, Move } from 'lucide-react';
import { COMPONENTS, type PartId } from '@/lib/components-data';
import { BUILD_ORDER, INSTALL_REQUIREMENTS, MOUNT_SITES, missingRequirements, nextBuildStep, partLocation, uninstallWithDependents, type LoosePlacements } from '@/lib/assembly';

const shortOf = (id: PartId) => COMPONENTS.find((part) => part.id === id)!.short;
const inBuildOrder = (a: PartId, b: PartId) => BUILD_ORDER.indexOf(a) - BUILD_ORDER.indexOf(b);
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type Tone = 'ready' | 'loose' | 'locked' | 'done';

/**
 * Where a part belongs, what it needs and what to do next, derived only from the build state and the existing
 * assembly exports. Nothing here is stored: it is recomputed from `installed` and `loose` on every render.
 */
export default function InstallGuidance({ id, installed, loose, heading = 'Installation' }: { id: PartId; installed: PartId[]; loose: LoosePlacements; heading?: string }) {
  const location = partLocation(id, installed, loose);
  const requirements = [...INSTALL_REQUIREMENTS[id]].sort(inBuildOrder);
  const missing = missingRequirements(id, installed).sort(inBuildOrder);
  const mount = MOUNT_SITES[id];
  const isNext = nextBuildStep(installed) === id;

  let tone: Tone; let Icon = ArrowRight; let text: string;
  if (location === 'installed') {
    tone = 'done'; Icon = Check;
    const alsoRemoved = installed.filter((part) => part !== id && !uninstallWithDependents(id, installed).includes(part)).map(shortOf);
    text = id === 'case' ? 'Installed. The chassis stays in place: every other part requires it.'
      : alsoRemoved.length ? `Installed. Removing it also removes ${alsoRemoved.join(', ')}.`
      : 'Installed. Remove it to take it out again.';
  } else if (missing.length) {
    tone = 'locked'; Icon = Lock;
    text = `Locked. Install ${missing.map(shortOf).join(', ')} first.`;
  } else if (location === 'loose') {
    tone = 'loose'; Icon = Move;
    text = `Loose in the workspace and not installed. Pick it up in the 3D view or from its tray card and drop it on the ${mount}, or press Install.`;
  } else {
    tone = 'ready';
    text = `${isNext ? 'Next step. ' : ''}Drag it from the tray onto the highlighted ${mount}, or press Install.`;
  }

  return (
    <section className="install-guide" aria-label={heading}>
      <h3>{heading}{heading === 'Next step' ? `: ${shortOf(id)}` : ''}</h3>
      <p className={`guide-next guide-next--${tone}`}><Icon size={16} aria-hidden="true" /><span>{text}</span></p>
      <dl className="guide-facts"><div><dt>Belongs at</dt><dd>{capitalise(mount)}</dd></div></dl>
      <h4>Requires</h4>
      {requirements.length === 0
        ? <p className="req-none">No prerequisites: this part goes in first.</p>
        : <ul className="req-list">{requirements.map((req) => {
            const met = installed.includes(req);
            return <li key={req} className={met ? 'req-met' : 'req-missing'}>{met ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}<span>{shortOf(req)}</span><em>{met ? 'Installed' : 'Missing'}</em></li>;
          })}</ul>}
    </section>
  );
}
