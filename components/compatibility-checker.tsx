'use client';

import { Box, CircleCheck, CircleHelp, CircleX, CircuitBoard, Cpu, Info, MemoryStick, Play, RotateCcw } from 'lucide-react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { CASES, CPUS, MOTHERBOARDS, RAM_KITS, type Cpu as CpuPart, type Motherboard, type PcCase, type RamKit, type Source } from '@/lib/compatibility-catalogue';
import { checkCompatibility, type CheckResult, type CheckStatus, type CompatibilityReport, type OverallStatus, type RuleId } from '@/lib/compatibility';
import { useRememberedState } from '@/lib/remembered-state';
import { AppHeader, ContextStrip, type Mode } from './app-header';

type PartKind = 'cpu' | 'motherboard' | 'ram' | 'pcCase';
type Choice = Record<PartKind, string>; // product id, or '' when nothing is selected
const EMPTY: Choice = { cpu: '', motherboard: '', ram: '', pcCase: '' };

type Product = { id: string; brand: string; model: string; sources: Source[] };
type Field<T extends Product> = {
  kind: PartKind;
  label: string;
  Icon: typeof Box;
  list: T[];
  specs: (part: T) => [string, string | undefined][];
};

const productName = (part: Product) => (part.model.startsWith(part.brand) ? part.model : `${part.brand} ${part.model}`);
const isDemo = (part: Product) => part.sources.some((source) => source.kind === 'demo');
const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

const CPU_FIELD: Field<CpuPart> = {
  kind: 'cpu', label: 'CPU', Icon: Cpu, list: CPUS,
  specs: (part) => [['Socket', part.socket]],
};
const BOARD_FIELD: Field<Motherboard> = {
  kind: 'motherboard', label: 'Motherboard', Icon: CircuitBoard, list: MOTHERBOARDS,
  specs: (part) => [['Socket', part.socket], ['Memory type', part.memoryType], ['Form factor', part.formFactor], ['Width', part.widthMm === undefined ? undefined : `${part.widthMm} mm`]],
};
const RAM_FIELD: Field<RamKit> = {
  kind: 'ram', label: 'RAM kit', Icon: MemoryStick, list: RAM_KITS,
  specs: (part) => [['Memory type', part.memoryType]],
};
const CASE_FIELD: Field<PcCase> = {
  kind: 'pcCase', label: 'Case', Icon: Box, list: CASES,
  specs: (part) => {
    const limits = Object.entries(part.maxBoardWidthMm ?? {}).map(([formFactor, width]) => `${formFactor} ${width} mm`);
    return [['Supported form factors', part.supportedFormFactors?.length ? part.supportedFormFactors.join(', ') : undefined], ['Maximum board width', limits.length ? limits.join(', ') : undefined]];
  },
};

const STATUS_ICON: Record<CheckStatus, typeof CircleCheck> = { PASSED: CircleCheck, FAILED: CircleX, UNVERIFIED: CircleHelp };
const OVERALL: Record<OverallStatus, { tone: 'passed' | 'failed' | 'unverified'; Icon: typeof CircleCheck; headline: string }> = {
  ALL_CHECKS_PASSED: { tone: 'passed', Icon: CircleCheck, headline: 'All 3 checked rules passed' },
  FAILED: { tone: 'failed', Icon: CircleX, headline: 'At least one checked rule failed' },
  UNVERIFIED: { tone: 'unverified', Icon: CircleHelp, headline: 'Some checks could not be confirmed' },
};

function SourceNote({ part }: { part: Product }) {
  if (isDemo(part)) {
    const notes = part.sources.flatMap((source) => (source.kind === 'demo' ? [source.note] : []));
    return <p className="compat-source"><span className="compat-demo-tag">Demo data</span> {notes.join(' ')}</p>;
  }
  const manufacturer = part.sources.flatMap((source) => (source.kind === 'manufacturer' ? [source] : []));
  return (
    <p className="compat-source">
      Source: {manufacturer.map((source, index) => <span key={source.url}>{index > 0 && ', '}<a href={source.url} target="_blank" rel="noreferrer">{hostOf(source.url)}</a></span>)}
    </p>
  );
}

/** One slot on the parts bench: the component type, its selector and, once chosen, the product's documented facts as chips. */
function PartSelect<T extends Product>({ field, value, onChange }: { field: Field<T>; value: string; onChange: (id: string) => void }) {
  const id = `compat-${field.kind}`;
  const part = field.list.find((item) => item.id === value);
  return (
    <div className={`compat-slot${part ? ' compat-slot--filled' : ''}${part && isDemo(part) ? ' compat-slot--demo' : ''}`}>
      <div className="compat-slot-head">
        <span className="compat-slot-icon"><field.Icon size={18} strokeWidth={1.65} /></span>
        <label className="compat-label" htmlFor={id}>{field.label}</label>
      </div>
      <NativeSelect id={id} className="compat-select" value={value} onChange={(event) => onChange(event.target.value)}>
        <NativeSelectOption value="">— Not selected —</NativeSelectOption>
        {field.list.map((item) => <NativeSelectOption key={item.id} value={item.id}>{productName(item)}{isDemo(item) ? ' (demo data)' : ''}</NativeSelectOption>)}
      </NativeSelect>
      {part && (
        <>
          <p className="compat-picked">{productName(part)}</p>
          <dl className="compat-specs">
            {field.specs(part).map(([label, spec]) => <div key={label} className={spec === undefined ? 'is-missing' : undefined}><dt>{label}</dt><dd className={spec === undefined ? 'compat-undocumented' : undefined}>{spec ?? 'Not documented'}</dd></div>)}
          </dl>
          <SourceNote part={part} />
        </>
      )}
    </div>
  );
}

/** The motherboard is the hub: each rule is one relationship between it and another part, matched to its result by `RuleId`. */
const BRANCHES: { rule: RuleId; kind: PartKind; label: string; Icon: typeof Box }[] = [
  { rule: 'cpu-motherboard', kind: 'cpu', label: 'CPU', Icon: Cpu },
  { rule: 'ram-motherboard', kind: 'ram', label: 'RAM kit', Icon: MemoryStick },
  { rule: 'motherboard-case', kind: 'pcCase', label: 'Case', Icon: Box },
];

function MapNode({ Icon, label, name }: { Icon: typeof Box; label: string; name: string | null }) {
  return (
    <div className="rule-map-node">
      <span className="rule-map-node-icon"><Icon size={16} strokeWidth={1.65} /></span>
      <span className="rule-map-node-text">
        <span className="rule-map-node-kind">{label}</span>
        <span className="rule-map-node-name" title={name ?? undefined}>{name ?? 'Not selected'}</span>
      </span>
    </div>
  );
}

/**
 * A compact picture of the three relationships. Every connector carries its status as words and an icon, and
 * UNVERIFIED is dashed, so colour is never the only cue. The cards below say the same thing in full, so the
 * diagram is hidden from assistive technology and the live-region announcement is unchanged.
 */
function RuleMap({ checks, names }: { checks: CheckResult[]; names: Record<PartKind, string | null> }) {
  return (
    <figure className="rule-map" aria-hidden="true">
      <figcaption>Rule map</figcaption>
      <div className="rule-map-hub"><MapNode Icon={CircuitBoard} label="Motherboard" name={names.motherboard} /></div>
      <ul className="rule-map-branches">
        {BRANCHES.map((branch) => {
          const check = checks.find((item) => item.rule === branch.rule);
          if (!check) return null;
          const tone = check.status.toLowerCase();
          const Icon = STATUS_ICON[check.status];
          return (
            <li key={branch.rule} className={`rule-map-branch rule-map-branch--${tone}`}>
              <span className="rule-map-link"><Icon size={14} strokeWidth={2} />{check.status}</span>
              <MapNode Icon={branch.Icon} label={branch.label} name={names[branch.kind]} />
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function CheckCard({ check }: { check: CheckResult }) {
  const tone = check.status.toLowerCase();
  const Icon = STATUS_ICON[check.status];
  return (
    <li className={`compat-card compat-card--${tone}`}>
      <div className="compat-card-head">
        <Icon size={18} strokeWidth={1.8} />
        <h3>{check.title}</h3>
        <span className={`compat-pill compat-pill--${tone}`}>{check.status}</span>
      </div>
      <div className="compat-card-body">
        <p className="compat-explanation">{check.explanation}</p>
        <details className="compat-evidence">
          <summary>Based on {check.evidence.length} {check.evidence.length === 1 ? 'source' : 'sources'}</summary>
          <ul>{check.evidence.map((line) => <li key={line}>{line}</li>)}</ul>
        </details>
      </div>
    </li>
  );
}

export default function CompatibilityChecker({ onModeChange }: { onModeChange: (mode: Mode) => void }) {
  const [choice, setChoice] = useRememberedState<Choice>('compat-choice', EMPTY);
  const [report, setReport] = useRememberedState<CompatibilityReport | null>('compat-report', null);
  const [stale, setStale] = useRememberedState('compat-stale', false); // true when a selection changed after a result was shown
  const hasChoice = Object.values(choice).some(Boolean);

  const change = (kind: PartKind, id: string) => {
    setChoice((old) => ({ ...old, [kind]: id }));
    if (report) setStale(true);
    setReport(null);
  };
  const run = () => {
    setReport(checkCompatibility({
      cpu: CPUS.find((part) => part.id === choice.cpu),
      motherboard: MOTHERBOARDS.find((part) => part.id === choice.motherboard),
      ram: RAM_KITS.find((part) => part.id === choice.ram),
      pcCase: CASES.find((part) => part.id === choice.pcCase),
    }));
    setStale(false);
  };
  const clear = () => { setChoice(EMPTY); setReport(null); setStale(false); };
  const overall = report ? OVERALL[report.overall] : null;
  // A report only exists while the selection it was run on is unchanged, so these names always match it.
  const nameFor = <T extends Product>(list: T[], id: string) => { const part = list.find((item) => item.id === id); return part ? productName(part) : null; };
  const names: Record<PartKind, string | null> = { cpu: nameFor(CPUS, choice.cpu), motherboard: nameFor(MOTHERBOARDS, choice.motherboard), ram: nameFor(RAM_KITS, choice.ram), pcCase: nameFor(CASES, choice.pcCase) };

  return (
    <div className="lab-app">
      <AppHeader mode="compatibility" onModeChange={onModeChange} />
      <ContextStrip title="Check compatibility" />

      <main className="compat-layout">
        <section className="compat-panel" aria-labelledby="compat-parts-title">
          <h2 id="compat-parts-title">Parts bench</h2>
          <div className="compat-slots">
            <PartSelect field={CPU_FIELD} value={choice.cpu} onChange={(id) => change('cpu', id)} />
            <PartSelect field={BOARD_FIELD} value={choice.motherboard} onChange={(id) => change('motherboard', id)} />
            <PartSelect field={RAM_FIELD} value={choice.ram} onChange={(id) => change('ram', id)} />
            <PartSelect field={CASE_FIELD} value={choice.pcCase} onChange={(id) => change('pcCase', id)} />
          </div>
          <div className="compat-actions">
            <button className="primary-button" onClick={run}><Play size={15} /> Run compatibility check</button>
            <button className="outlined-button" onClick={clear} disabled={!hasChoice && !report && !stale}><RotateCcw size={15} /> Clear</button>
          </div>
        </section>

        <section className="compat-results" aria-labelledby="compat-results-title">
          <h2 id="compat-results-title">Compatibility report</h2>
          <div aria-live="polite">
            {report && overall ? (
              <>
                <div className={`compat-banner compat-banner--${overall.tone}`}>
                  <overall.Icon size={26} strokeWidth={1.6} />
                  <div>
                    <h3>{report.overall === 'FAILED' ? report.summary : overall.headline}</h3>
                    {report.overall !== 'FAILED' && <p>{report.summary}</p>}
                    {report.overall === 'ALL_CHECKS_PASSED' && <p>Only CPU socket, memory type and motherboard–case fit were checked. This is not a guarantee that the full build is compatible.</p>}
                  </div>
                </div>
                <RuleMap checks={report.checks} names={names} />
                <ul className="compat-cards">{report.checks.map((check) => <CheckCard key={check.rule} check={check} />)}</ul>
              </>
            ) : (
              <div className="compat-empty">
                <p>{stale ? 'Selection changed. Run the check again to see updated results.' : 'No results yet. Choose parts, then run the compatibility check.'}</p>
              </div>
            )}
          </div>

          <details className="compat-limits">
            <summary><Info size={14} /> What this checks</summary>
            <ul>
              <li>CPU socket against the motherboard socket.</li>
              <li>RAM memory type (DDR4 or DDR5) against the motherboard memory type.</li>
              <li>Motherboard form factor, and its width where the case documents a limit, against the case.</li>
            </ul>
          </details>
        </section>
      </main>
    </div>
  );
}
