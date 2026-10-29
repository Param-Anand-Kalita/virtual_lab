// Budget planner: a backtracking search over the existing compatibility catalogue and rules.
// Scope: CPU, motherboard, RAM kit and case only. It ranks by estimated cost and makes no performance claim.
// No React, Three.js or '@/' imports so the Node test runner can load this file directly.
import { CASES, CPUS, MOTHERBOARDS, RAM_KITS, type Cpu, type Motherboard, type PcCase, type RamKit } from './compatibility-catalogue';
import { checkCpuMotherboard, checkMotherboardCase, checkRamMotherboard, type CheckStatus } from './compatibility';
import { APPROVED_RETAILERS, PRICE_RECORDS, type PriceRecord, type PriceStats, type Retailer, type UnverifiedReason, type VerifiedPrice } from './price-catalogue';

/* ── Price statistics ── */

/** Minimum, maximum and median of observed prices. An even count takes the mean of the two middle values. */
export function priceStats(prices: number[]): PriceStats {
  if (prices.length === 0) throw new RangeError('priceStats needs at least one price');
  const sorted = [...prices].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { min: sorted[0], median, max: sorted[sorted.length - 1] };
}

/**
 * Which approved retailers supplied at least one counted (in-stock) observation, and which were only checked, so the
 * page and README can say exactly that. Derived from the price records, so it cannot drift from the data.
 */
export function retailerCoverage(records: PriceRecord[] = PRICE_RECORDS, approved: readonly Retailer[] = APPROVED_RETAILERS): { counted: Retailer[]; checkedOnly: Retailer[] } {
  const supplied = new Set(records.flatMap((record) => (record.status === 'verified' ? record.observations.map((observation) => observation.retailer) : [])));
  return { counted: approved.filter((retailer) => supplied.has(retailer)), checkedOnly: approved.filter((retailer) => !supplied.has(retailer)) };
}

/* ── Generic backtracking engine ── */

/** One choice in one slot, with the price range it contributes. `part` is whatever the rules need to look at. */
export type Candidate<T> = { id: string; part: T; min: number; median: number; max: number };
/** A rule needs the parts in `slots`. `check` is called only once every one of those slots has a part. */
export type SearchRule<T> = { id: string; slots: string[]; check: (parts: Record<string, T>) => CheckStatus };

export type SearchStats = {
  nodesVisited: number; // every candidate tried at every depth
  prunedByRule: Record<string, { failed: number; unverified: number }>;
  prunedByBudget: number;
  builds: number; // complete combinations that passed every rule and the budget bound
};
export type FoundBuild<T> = { picks: Candidate<T>[]; min: number; median: number; max: number };
export type SearchSpec<T> = {
  slots: string[]; // search order
  candidates: Record<string, Candidate<T>[]>;
  rules: SearchRule<T>[];
  /** Upper bound for the minimum total. `undefined` turns budget pruning off. */
  budget?: number;
};

/**
 * Depth-first backtracking: choose a part for each slot in order and, as soon as a rule has every slot it needs,
 * run it. A rule that does not PASS ends that branch at once (UNVERIFIED is treated the same as FAILED, because a
 * build must pass every rule). The budget bound drops a branch only when its chosen minimum prices plus the cheapest
 * remaining minimum in every unchosen slot already exceed the budget. No build under that branch could have a
 * minimum total within the budget, so the bound never removes a build that qualifies.
 */
export function searchBuilds<T>(spec: SearchSpec<T>): { builds: FoundBuild<T>[]; stats: SearchStats } {
  const { slots, candidates, rules, budget } = spec;
  const depthOf = new Map(slots.map((slot, index) => [slot, index]));
  const rulesAt: SearchRule<T>[][] = slots.map(() => []);
  for (const rule of rules) {
    const depths = rule.slots.map((slot) => {
      const depth = depthOf.get(slot);
      if (depth === undefined) throw new RangeError(`rule ${rule.id} needs unknown slot ${slot}`);
      return depth;
    });
    rulesAt[Math.max(...depths)].push(rule); // runs when the last of its slots is chosen
  }
  // cheapestFrom[d] = cheapest possible minimum total of slots d..end, used as the lower bound for budget pruning.
  const cheapestFrom = Array.from({ length: slots.length + 1 }, () => 0);
  for (let d = slots.length - 1; d >= 0; d -= 1) cheapestFrom[d] = cheapestFrom[d + 1] + Math.min(...candidates[slots[d]].map((candidate) => candidate.min));

  const stats: SearchStats = { nodesVisited: 0, prunedByRule: Object.fromEntries(rules.map((rule) => [rule.id, { failed: 0, unverified: 0 }])), prunedByBudget: 0, builds: 0 };
  const builds: FoundBuild<T>[] = [];
  const chosen: Candidate<T>[] = [];
  const parts: Record<string, T> = {};
  const search = (depth: number, min: number, median: number, max: number) => {
    if (depth === slots.length) {
      stats.builds += 1;
      builds.push({ picks: [...chosen], min, median, max });
      return;
    }
    const slot = slots[depth];
    for (const candidate of candidates[slot]) {
      stats.nodesVisited += 1;
      if (budget !== undefined && min + candidate.min + cheapestFrom[depth + 1] > budget) { stats.prunedByBudget += 1; continue; }
      parts[slot] = candidate.part;
      let ok = true;
      for (const rule of rulesAt[depth]) {
        const status = rule.check(parts);
        if (status === 'PASSED') continue;
        stats.prunedByRule[rule.id][status === 'FAILED' ? 'failed' : 'unverified'] += 1;
        ok = false;
        break;
      }
      if (ok) {
        chosen.push(candidate);
        search(depth + 1, min + candidate.min, median + candidate.median, max + candidate.max);
        chosen.pop();
      }
      delete parts[slot];
    }
  };
  if (slots.every((slot) => candidates[slot].length > 0)) search(0, 0, 0, 0);
  return { builds, stats };
}

/* ── The planner over the real catalogue ── */

export type PartSlot = 'motherboard' | 'cpu' | 'ram' | 'pcCase';
/** Motherboard first: two of the three rules involve it, so a wrong board ends a branch before RAM and case are tried. */
export const SLOT_ORDER: PartSlot[] = ['motherboard', 'cpu', 'ram', 'pcCase'];
export const SLOT_LABEL: Record<PartSlot, string> = { cpu: 'CPU', motherboard: 'Motherboard', ram: 'RAM kit', pcCase: 'Case' };

type Product = { id: string; brand: string; model: string; sources: { kind: string }[] };
type AnyPart = Cpu | Motherboard | RamKit | PcCase;
export type PlannerCatalogue = { cpus: Cpu[]; motherboards: Motherboard[]; ramKits: RamKit[]; cases: PcCase[] };
export type PlannerInputs = { catalogue: PlannerCatalogue; prices: PriceRecord[] };
export const DEFAULT_INPUTS: PlannerInputs = { catalogue: { cpus: CPUS, motherboards: MOTHERBOARDS, ramKits: RAM_KITS, cases: CASES }, prices: PRICE_RECORDS };

export const productName = (product: Product) => (product.model.startsWith(product.brand) ? product.model : `${product.brand} ${product.model}`);
const isDemo = (product: Product) => product.sources.some((source) => source.kind === 'demo');

/** The three existing rules, called unchanged. A slot that is somehow empty makes the existing rule answer UNVERIFIED. */
export const PLANNER_RULES: SearchRule<AnyPart>[] = [
  { id: 'cpu-motherboard', slots: ['cpu', 'motherboard'], check: (p) => checkCpuMotherboard(p.cpu as Cpu, p.motherboard as Motherboard).status },
  { id: 'ram-motherboard', slots: ['ram', 'motherboard'], check: (p) => checkRamMotherboard(p.ram as RamKit, p.motherboard as Motherboard).status },
  { id: 'motherboard-case', slots: ['motherboard', 'pcCase'], check: (p) => checkMotherboardCase(p.motherboard as Motherboard, p.pcCase as PcCase).status },
];

export type BudgetStatus = 'within' | 'may-exceed';
export type PricedPart = {
  slot: PartSlot;
  id: string;
  name: string;
  variant?: string;
  min: number;
  median: number;
  max: number;
  sources: number;
  lowConfidence: boolean; // true for a single-source price
  price: VerifiedPrice;
};
export type PlannedBuild = {
  parts: PricedPart[]; // in SLOT_ORDER
  min: number;
  median: number; // sum of the parts' medians
  max: number;
  sources: number; // the smallest source count among the parts
  lowConfidence: boolean;
  budgetStatus: BudgetStatus;
};
export type ExcludedModel = { slot: PartSlot; id: string; name: string; reason: UnverifiedReason | 'demo' | 'no-price-record'; explanation: string; record?: PriceRecord };
export type PlannerResult = {
  budget: number;
  within: PlannedBuild[]; // maximum total <= budget, cheapest median first
  mayExceed: PlannedBuild[]; // minimum total <= budget < maximum total, cheapest median first
  excluded: ExcludedModel[];
  emptySlots: PartSlot[]; // slots where no model has a verified price, so no build can be priced at all
  stats: SearchStats;
};

const byCost = (a: PlannedBuild, b: PlannedBuild) =>
  a.median - b.median || a.min - b.min || a.parts.map((p) => p.id).join('|').localeCompare(b.parts.map((p) => p.id).join('|'));

/**
 * Plans builds under `budget` (rupees). Only products with a verified price are searched; the rest are returned in
 * `excluded` with the reason. Ranking is by the sum of median prices, cheapest first. It says nothing about performance.
 */
export function planBuilds(budget: number, inputs: PlannerInputs = DEFAULT_INPUTS): PlannerResult {
  if (!Number.isFinite(budget) || budget < 0) throw new RangeError('budget must be a finite, non-negative number');
  const recordOf = new Map(inputs.prices.map((record) => [record.productId, record]));
  const groups: Record<PartSlot, AnyPart[]> = { cpu: inputs.catalogue.cpus, motherboard: inputs.catalogue.motherboards, ram: inputs.catalogue.ramKits, pcCase: inputs.catalogue.cases };

  const candidates = {} as Record<PartSlot, Candidate<AnyPart>[]>;
  const priced = new Map<string, PricedPart>();
  const excluded: ExcludedModel[] = [];
  for (const slot of SLOT_ORDER) {
    candidates[slot] = [];
    for (const part of groups[slot]) {
      const record = recordOf.get(part.id);
      if (isDemo(part)) {
        excluded.push({ slot, id: part.id, name: productName(part), reason: 'demo', explanation: 'Demo data: an illustrative entry that is not a real product, so it has no price.' });
      } else if (!record) {
        excluded.push({ slot, id: part.id, name: productName(part), reason: 'no-price-record', explanation: 'No price research has been recorded for this model.' });
      } else if (record.status === 'unverified') {
        excluded.push({ slot, id: part.id, name: productName(part), reason: record.reason, explanation: record.explanation, record });
      } else {
        candidates[slot].push({ id: part.id, part, min: record.stats.min, median: record.stats.median, max: record.stats.max });
        priced.set(part.id, { slot, id: part.id, name: productName(part), variant: record.variant, min: record.stats.min, median: record.stats.median, max: record.stats.max, sources: record.observations.length, lowConfidence: record.observations.length === 1, price: record });
      }
    }
  }
  const emptySlots = SLOT_ORDER.filter((slot) => candidates[slot].length === 0);
  const { builds, stats } = searchBuilds<AnyPart>({ slots: SLOT_ORDER, candidates, rules: PLANNER_RULES, budget });

  const within: PlannedBuild[] = [];
  const mayExceed: PlannedBuild[] = [];
  for (const found of builds) {
    const parts = found.picks.map((pick) => priced.get(pick.id)!);
    const build: PlannedBuild = {
      parts, min: found.min, median: found.median, max: found.max,
      sources: Math.min(...parts.map((part) => part.sources)),
      lowConfidence: parts.some((part) => part.lowConfidence),
      budgetStatus: found.max <= budget ? 'within' : 'may-exceed',
    };
    (build.budgetStatus === 'within' ? within : mayExceed).push(build);
  }
  within.sort(byCost);
  mayExceed.sort(byCost);
  return { budget, within, mayExceed, excluded, emptySlots, stats };
}
