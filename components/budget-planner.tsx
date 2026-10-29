'use client';

import { useMemo, useState } from 'react';
import { CircleCheck, Info } from 'lucide-react';
import { planBuilds, retailerCoverage, SLOT_LABEL, SLOT_ORDER, type ExcludedModel, type PartSlot, type PlannedBuild, type PricedPart } from '@/lib/build-planner';
import { RESEARCHED } from '@/lib/price-catalogue';
import { AppHeader, ContextStrip, type Mode } from './app-header';

const MAX_BUDGET = 10_000_000;
const ALL_BUDGETS = Number.MAX_SAFE_INTEGER;
const COVERAGE = retailerCoverage();

const rupees = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const range = (min: number, max: number) => (min === max ? rupees(min) : `${rupees(min)} – ${rupees(max)}`);
// Slot labels read mid-sentence: 'CPU' stays upper case, the others are lower case.
const inSentence = (slot: PartSlot) => (slot === 'cpu' ? 'CPU' : SLOT_LABEL[slot].toLowerCase());
const joinList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const dateLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Whole rupees only; commas and spaces are ignored. Returns null for anything else, including an empty box. */
function parseBudget(text: string): number | null {
  const digits = text.replace(/[,\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return value > 0 && value <= MAX_BUDGET ? value : null;
}

function PartRow({ part }: { part: PricedPart }) {
  return (
    <li className="plan-part">
      <span className="plan-part-slot">{SLOT_LABEL[part.slot]}</span>
      <div className="plan-part-main">
        <strong>{part.name}</strong>
        {part.variant && <span className="plan-part-variant">Variant priced: {part.variant}</span>}
        <span className="plan-part-meta">
          {plural(part.sources, 'source')}
        </span>
      </div>
      <div className="plan-part-price">
        <strong>{range(part.min, part.max)}</strong>
        {part.min !== part.max && <span>median {rupees(part.median)}</span>}
      </div>
    </li>
  );
}

function BuildCard({ build, rank }: { build: PlannedBuild; rank: number }) {
  return (
    <li className={`plan-card plan-card--${build.budgetStatus}`}>
      <div className="plan-card-head">
        <span className="plan-rank" aria-label={`Rank ${rank}`}>{rank}</span>
        <div className="plan-card-total">
          <strong>Median estimated total {rupees(build.median)}</strong>
          <span>Price range {range(build.min, build.max)}</span>
        </div>
      </div>
      <ul className="plan-parts">{build.parts.map((part) => <PartRow key={part.id} part={part} />)}</ul>
      <details className="plan-sources">
        <summary>Price sources</summary>
        {build.parts.map((part) => (
          <div key={part.id} className="plan-source-group">
            <h4>{SLOT_LABEL[part.slot]}: {part.name}</h4>
            <ul>
              {part.price.observations.map((o) => (
                <li key={o.url}><a href={o.url} target="_blank" rel="noreferrer">{o.retailer}</a> · {rupees(o.priceInr)}</li>
              ))}
            </ul>
          </div>
        ))}
      </details>
    </li>
  );
}

function BuildSection({ title, intro, builds }: { title: string; intro: string; builds: PlannedBuild[] }) {
  return (
    <section className="plan-section" aria-label={title}>
      <h3 className="plan-heading">{title} <span className="plan-count">{builds.length}</span></h3>
      <p className="compat-intro">{intro}</p>
      {builds.length > 0 && <ol className="plan-list">{builds.map((build, index) => <BuildCard key={build.parts.map((p) => p.id).join('+')} build={build} rank={index + 1} />)}</ol>}
    </section>
  );
}

function ExcludedList({ excluded }: { excluded: ExcludedModel[] }) {
  return (
    <details className="compat-limits">
      <summary><Info size={14} /> Models excluded from pricing ({excluded.length})</summary>
      <p>These models have no verified price from an approved retailer, so they are left out of the plan instead of being given a guessed price.</p>
      {SLOT_ORDER.map((slot) => {
        const models = excluded.filter((model) => model.slot === slot);
        if (models.length === 0) return null;
        return (
          <div key={slot} className="plan-source-group">
            <h4>{SLOT_LABEL[slot]}</h4>
            <ul>
              {models.map((model) => (
                <li key={model.id}>
                  <strong>{model.name}</strong>: {model.explanation}
                  {model.record && model.record.rejected.length > 0 && (
                    <ul className="plan-rejected">
                      {model.record.rejected.map((listing) => (
                        <li key={listing.url}><a href={listing.url} target="_blank" rel="noreferrer">{listing.retailer}</a>{listing.priceInr !== undefined && ` · ${rupees(listing.priceInr)}`}{listing.availability === 'in-stock' && <> · not counted: {listing.reason}</>}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}

export default function BudgetPlanner({ onModeChange }: { onModeChange: (mode: Mode) => void }) {
  const [text, setText] = useState('60000');
  const budget = parseBudget(text);
  const blank = text.trim() === '';
  const invalid = budget === null && !blank; // an empty box is just waiting for input, not an error
  const plan = useMemo(() => (budget === null ? null : planBuilds(budget)), [budget]);
  const everything = useMemo(() => planBuilds(ALL_BUDGETS), []);
  const cheapest = useMemo(() => [...everything.within, ...everything.mayExceed].sort((a, b) => a.min - b.min)[0], [everything]);
  const found = plan ? plan.within.length + plan.mayExceed.length : 0;

  return (
    <div className="lab-app">
      <AppHeader mode="planner" onModeChange={onModeChange} />
      <ContextStrip title="Budget planner" />

      <main className="compat-layout">
        <section className="compat-panel plan-panel" aria-label="Budget">
          <label className="plan-label" htmlFor="plan-budget">Budget</label>
          <div className={`plan-input${invalid ? ' plan-input--invalid' : ''}`}>
            <span aria-hidden="true">₹</span>
            <input id="plan-budget" inputMode="numeric" autoComplete="off" placeholder="Enter your budget here" value={text} onChange={(event) => setText(event.target.value)} aria-invalid={invalid} aria-describedby={invalid ? 'plan-budget-error' : undefined} />
          </div>
          {invalid && <p id="plan-budget-error" className="plan-error" role="alert">Enter a whole number of rupees between 1 and {MAX_BUDGET.toLocaleString('en-IN')}, for example 60000.</p>}

          <div className="plan-prices">
            <h3>Price data</h3>
            <p>Estimated retailer prices, last researched {dateLabel(RESEARCHED)}. Shipping and bank offers are not included.</p>
            <details className="plan-retailers">
              <summary>Retailers checked</summary>
              <ul>
                <li><strong>Counted from:</strong> {joinList(COVERAGE.counted)}.</li>
                {COVERAGE.checkedOnly.length > 0 && <li><strong>Also checked, none counted:</strong> {joinList(COVERAGE.checkedOnly)} (out of stock, or a different variant or model).</li>}
              </ul>
            </details>
          </div>

          <details className="compat-limits">
            <summary><Info size={14} /> How the plan is made</summary>
            <p>The planner puts together combinations of a CPU, a motherboard, a RAM kit and a case from the parts we have prices for. It keeps the ones that pass basic compatibility checks and fit your budget.</p>
            <p>Each part’s price is a range based on the retailer listings we found. A build is <strong>within budget</strong> when even its highest estimate fits, and <strong>may exceed budget</strong> when only its lowest estimate fits.</p>
            <p>Builds are ranked by estimated cost, cheapest first. Cheapest doesn’t mean best or fastest, and the plan covers four parts, not a complete PC.</p>
          </details>
        </section>

        <section className="compat-results" aria-labelledby="plan-results-title">
          <h2 id="plan-results-title">Planned builds</h2>
          <p className="plan-scope">Covers CPU, motherboard, RAM kit and case only. Not a complete PC, and ranked by estimated cost, not performance.</p>
          <div aria-live="polite">
            {plan === null && <div className="compat-empty"><p>{blank ? 'Enter a budget to see planned builds.' : 'Enter a valid budget to see planned builds.'}</p></div>}
            {plan && plan.emptySlots.length > 0 && (
              <div className="compat-empty"><p>No {plan.emptySlots.map((slot) => inSentence(slot)).join(' or ')} has a verified price, so no build can be priced.</p></div>
            )}
            {plan && plan.emptySlots.length === 0 && (
              <>
                {found > 0 && <p className="plan-status"><CircleCheck size={15} aria-hidden="true" />Basic compatibility checks passed for the listed components.</p>}
                {plan.within.length > 0 && <BuildSection title="Within budget" intro={`Highest estimated total is ${rupees(plan.budget)} or less. Ranked by median estimated total, cheapest first.`} builds={plan.within} />}
                {plan.mayExceed.length > 0 && <BuildSection title="May exceed budget" intro={`Lowest estimated total fits ${rupees(plan.budget)}, but the highest does not. Ranked by median estimated total, cheapest first.`} builds={plan.mayExceed} />}
                {found === 0 && (
                  <div className="compat-empty">
                    <p>No priced build fits {rupees(plan.budget)}.{cheapest && ` The lowest estimated total among all priced builds is ${rupees(cheapest.min)}.`}</p>
                  </div>
                )}
              </>
            )}
          </div>
          {plan && <ExcludedList excluded={plan.excluded} />}
        </section>
      </main>
    </div>
  );
}
