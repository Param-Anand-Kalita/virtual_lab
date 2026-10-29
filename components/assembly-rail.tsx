'use client';

export type RailStep = { id: string; label: string; state: 'done' | 'current' | 'todo' };

/**
 * One rail step per part, derived from state the caller already owns (`installed` in Build, `removed` in Explore's
 * guided disassembly). The rail keeps no progress of its own.
 */
export function railSteps<Id extends string>(order: readonly Id[], isDone: (id: Id) => boolean, current: Id | null, label: (id: Id) => string): RailStep[] {
  return order.map((id) => ({ id, label: label(id), state: isDone(id) ? 'done' : id === current ? 'current' : 'todo' }));
}

/** A compact segmented progress rail. State is told by fill, outline and a screen-reader word, not by colour alone. */
export default function AssemblyRail({ steps, label, doneWord }: { steps: RailStep[]; label: string; doneWord: string }) {
  return (
    <ol className="assembly-rail" aria-label={label}>
      {steps.map((step, index) => {
        const word = step.state === 'done' ? doneWord : step.state === 'current' ? 'next' : 'to do';
        return (
          <li key={step.id} className={`assembly-rail-step is-${step.state}`} title={`${String(index + 1).padStart(2, '0')} ${step.label}: ${word}`}>
            <span className="sr-only">{step.label}: {word}</span>
          </li>
        );
      })}
    </ol>
  );
}
