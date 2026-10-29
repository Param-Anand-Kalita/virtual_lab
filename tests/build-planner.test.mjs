import test from 'node:test';
import assert from 'node:assert/strict';
import { CPUS, MOTHERBOARDS, RAM_KITS, CASES } from '../lib/compatibility-catalogue.ts';
import { checkCompatibility } from '../lib/compatibility.ts';
import { APPROVED_RETAILERS, PRICE_RECORDS, RESEARCHED } from '../lib/price-catalogue.ts';
import { planBuilds, priceStats, retailerCoverage, searchBuilds, DEFAULT_INPUTS, PLANNER_RULES, SLOT_ORDER } from '../lib/build-planner.ts';

/* ── Fixtures: small made-up catalogues. Their prices are test values, not research. ── */

const sources = [{ kind: 'manufacturer', url: 'https://example.test/spec', checked: '2026-01-01' }];
const cpu = (id, socket) => ({ id, brand: 'T', model: id, sources, socket });
const board = (id, fields) => ({ id, brand: 'T', model: id, sources, ...fields });
const ram = (id, memoryType) => ({ id, brand: 'T', model: id, sources, memoryType });
const pcCase = (id, supportedFormFactors, maxBoardWidthMm) => ({ id, brand: 'T', model: id, sources, supportedFormFactors, maxBoardWidthMm });
const verified = (productId, prices) => ({
  status: 'verified', productId,
  observations: prices.map((priceInr, index) => ({ retailer: APPROVED_RETAILERS[index % APPROVED_RETAILERS.length], url: `https://example.test/${productId}/${index}`, listing: productId, priceInr, availability: 'in-stock', observed: '2026-01-01' })),
  stats: priceStats(prices), rejected: [],
});
const unverified = (productId) => ({ status: 'unverified', productId, reason: 'not-listed', explanation: 'test', rejected: [] });
const catalogue = (cpus, motherboards, ramKits, cases) => ({ cpus, motherboards, ramKits, cases });
const ids = (build) => build.parts.map((part) => part.id).join('+');
const byText = (a, b) => a.localeCompare(b);

/* ── Price statistics ── */

test('priceStats: one, odd and even numbers of prices, in any order', () => {
  assert.deepEqual(priceStats([7270]), { min: 7270, median: 7270, max: 7270 });
  assert.deepEqual(priceStats([30, 10, 20]), { min: 10, median: 20, max: 30 });
  assert.deepEqual(priceStats([19995, 19800]), { min: 19800, median: 19897.5, max: 19995 });
  assert.deepEqual(priceStats([14550, 15200, 15033, 15195]), { min: 14550, median: 15114, max: 15200 });
  assert.throws(() => priceStats([]), RangeError);
});

test('price catalogue: every stored statistic matches its observations', () => {
  const verifiedRecords = PRICE_RECORDS.filter((record) => record.status === 'verified');
  assert(verifiedRecords.length > 0);
  for (const record of verifiedRecords) {
    assert(record.observations.length > 0, `${record.productId} has observations`);
    assert.deepEqual(record.stats, priceStats(record.observations.map((o) => o.priceInr)), `${record.productId} statistics`);
    for (const o of record.observations) {
      assert(APPROVED_RETAILERS.includes(o.retailer), `${record.productId}: ${o.retailer} is approved`);
      assert.equal(o.availability, 'in-stock');
      assert.equal(o.observed, RESEARCHED);
      assert(o.url.startsWith('https://') && o.priceInr > 0 && o.listing.length > 0);
    }
    assert.equal(new Set(record.observations.map((o) => o.url)).size, record.observations.length, `${record.productId}: no listing counted twice`);
  }
});

test('price catalogue: rejected listings give a reason and never come from a marketplace seller', () => {
  for (const record of PRICE_RECORDS) {
    for (const rejected of record.rejected) {
      assert(rejected.reason.length > 0, `${record.productId} rejection has a reason`);
      assert.notEqual(rejected.retailer, 'Amazon.in');
      assert(rejected.availability === 'out-of-stock' || /different|ambiguous|OEM|variant/i.test(rejected.reason), `${record.productId}: an in-stock listing is only rejected for identity`);
    }
    if (record.status === 'unverified') assert(record.explanation.length > 0);
  }
});

test('price catalogue: keyed by real catalogue ids, one record per real product, none for demo entries', () => {
  const all = [...CPUS, ...MOTHERBOARDS, ...RAM_KITS, ...CASES];
  const byId = new Map(all.map((part) => [part.id, part]));
  assert.equal(new Set(PRICE_RECORDS.map((r) => r.productId)).size, PRICE_RECORDS.length, 'one record per product');
  for (const record of PRICE_RECORDS) assert(byId.has(record.productId), `${record.productId} is a catalogue product`);
  for (const part of all) {
    const demo = part.sources.some((s) => s.kind === 'demo');
    assert.equal(PRICE_RECORDS.some((r) => r.productId === part.id), !demo, `${part.id}: price record iff real`);
  }
});

test('price catalogue: the single-source and variant decisions are recorded', () => {
  const record = (id) => PRICE_RECORDS.find((r) => r.productId === id);
  const h5 = record('nzxt-h5-flow-2024');
  assert.equal(h5.status, 'verified');
  assert(h5.variant.includes('CC-H52FW-01') && h5.variant.includes('White'));
  assert.equal(h5.observations.length, 1);
  assert.equal(record('amd-ryzen-5-5600x').observations.length, 4);
  assert(record('amd-ryzen-5-5600x').rejected.some((r) => /OEM/.test(r.reason)), 'OEM pack is rejected');
  assert.equal(record('msi-mag-b550-tomahawk').status, 'unverified');
  assert.equal(record('msi-mag-b550-tomahawk').reason, 'variant-ambiguous');
  assert.equal(record('fractal-design-define-7').status, 'unverified');
});

/* ── The generic backtracking engine ── */

const unit = (id, min, part = id) => ({ id, part, min, median: min, max: min });

test('backtracking: a failing rule ends the branch before later slots are tried', () => {
  // One board; two CPUs (one wrong socket); two RAM kits (one wrong type); three cases (one too small).
  const catalogueFixture = catalogue(
    [cpu('cpu-am5', 'AM5'), cpu('cpu-am4', 'AM4')],
    [board('b-am5', { socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX', widthMm: 244 })],
    [ram('ram-ddr5', 'DDR5'), ram('ram-ddr4', 'DDR4')],
    [pcCase('case-a', ['ATX']), pcCase('case-b', ['ATX', 'Micro-ATX']), pcCase('case-small', ['Mini-ITX'])],
  );
  const prices = [...catalogueFixture.cpus, ...catalogueFixture.motherboards, ...catalogueFixture.ramKits, ...catalogueFixture.cases].map((part) => verified(part.id, [100]));
  const { stats, within } = planBuilds(1_000_000, { catalogue: catalogueFixture, prices });
  assert.equal(within.length, 2);
  // 1 board + 2 CPUs + 2 RAM kits (only under the AM5 CPU) + 3 cases (only under the passing RAM kit)
  assert.equal(stats.nodesVisited, 8);
  assert(stats.nodesVisited < 1 * 2 * 2 * 3, 'fewer choices tried than there are combinations');
  assert.deepEqual(stats.prunedByRule['cpu-motherboard'], { failed: 1, unverified: 0 });
  assert.deepEqual(stats.prunedByRule['ram-motherboard'], { failed: 1, unverified: 0 });
  assert.deepEqual(stats.prunedByRule['motherboard-case'], { failed: 1, unverified: 0 });
  assert.equal(stats.prunedByBudget, 0);
});

test('backtracking: a wrong board removes its whole subtree', () => {
  const catalogueFixture = catalogue(
    [cpu('c1', 'AM5'), cpu('c2', 'AM5')],
    [board('b-wrong', { socket: 'LGA1700', memoryType: 'DDR5', formFactor: 'ATX', widthMm: 244 }), board('b-ok', { socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX', widthMm: 244 })],
    [ram('r1', 'DDR5'), ram('r2', 'DDR5')],
    [pcCase('k1', ['ATX']), pcCase('k2', ['ATX'])],
  );
  const prices = [...catalogueFixture.cpus, ...catalogueFixture.motherboards, ...catalogueFixture.ramKits, ...catalogueFixture.cases].map((part) => verified(part.id, [10]));
  const { stats, within } = planBuilds(1000, { catalogue: catalogueFixture, prices });
  assert.equal(within.length, 8); // 2 CPUs x 2 RAM kits x 2 cases under the good board
  // b-wrong: 1 board + 2 CPUs (both fail). b-ok: 1 board + 2 CPUs + 2x2 RAM + 2x2x2 cases.
  assert.equal(stats.nodesVisited, 1 + 2 + 1 + 2 + 4 + 8);
  assert.equal(stats.prunedByRule['cpu-motherboard'].failed, 2);
});

test('UNVERIFIED outcomes end a branch and are counted separately, never treated as a pass', () => {
  const catalogueFixture = catalogue(
    [cpu('c1', 'AM5')],
    [board('b-no-socket', { memoryType: 'DDR5', formFactor: 'ATX', widthMm: 244 })], // socket not documented
    [ram('r1', 'DDR5')],
    [pcCase('k1', ['ATX'])],
  );
  const prices = [...catalogueFixture.cpus, ...catalogueFixture.motherboards, ...catalogueFixture.ramKits, ...catalogueFixture.cases].map((part) => verified(part.id, [10]));
  const result = planBuilds(1000, { catalogue: catalogueFixture, prices });
  assert.equal(result.within.length + result.mayExceed.length, 0);
  assert.deepEqual(result.stats.prunedByRule['cpu-motherboard'], { failed: 0, unverified: 1 });
  assert.equal(result.stats.nodesVisited, 2, 'the RAM and case slots are never tried');
});

test('UNVERIFIED case fit: an E-ATX board in a case with no stated width limit is not planned', () => {
  const catalogueFixture = catalogue(
    [cpu('c1', 'AM5')],
    [board('b-eatx', { socket: 'AM5', memoryType: 'DDR5', formFactor: 'E-ATX', widthMm: 277 })],
    [ram('r1', 'DDR5')],
    [pcCase('k-no-limit', ['E-ATX', 'ATX']), pcCase('k-limit', ['E-ATX', 'ATX'], { 'E-ATX': 277 })],
  );
  const prices = [...catalogueFixture.cpus, ...catalogueFixture.motherboards, ...catalogueFixture.ramKits, ...catalogueFixture.cases].map((part) => verified(part.id, [10]));
  const result = planBuilds(1000, { catalogue: catalogueFixture, prices });
  assert.deepEqual(result.within.map(ids), ['b-eatx+c1+r1+k-limit']);
  assert.deepEqual(result.stats.prunedByRule['motherboard-case'], { failed: 0, unverified: 1 });
});

test('budget pruning: the lower bound drops a branch, and the counters show it', () => {
  const spec = {
    slots: ['a', 'b'],
    candidates: { a: [unit('a10', 10), unit('a50', 50)], b: [unit('b5', 5), unit('b40', 40)] },
    rules: [],
    budget: 20,
  };
  const { builds, stats } = searchBuilds(spec);
  assert.deepEqual(builds.map((b) => b.picks.map((p) => p.id).join('+')), ['a10+b5']);
  assert.equal(stats.prunedByBudget, 2);
  assert.equal(stats.nodesVisited, 4);
  assert.equal(stats.builds, 1);
  // Without a budget the same search finds all four combinations.
  assert.equal(searchBuilds({ ...spec, budget: undefined }).builds.length, 4);
});

test('extensible: a new slot and rule need only data, not a change to the search', () => {
  const spec = {
    slots: ['board', 'cpu', 'psu'],
    candidates: {
      board: [unit('b1', 100, { watts: 200 }), unit('b2', 120, { watts: 400 })],
      cpu: [unit('c1', 50, { tdp: 65 })],
      psu: [unit('p300', 40, { capacity: 300 }), unit('p500', 60, { capacity: 500 })],
    },
    rules: [
      { id: 'psu-covers-board', slots: ['board', 'psu'], check: (p) => (p.psu.capacity >= p.board.watts ? 'PASSED' : 'FAILED') },
    ],
  };
  const { builds, stats } = searchBuilds(spec);
  assert.deepEqual(builds.map((b) => b.picks.map((p) => p.id).join('+')).sort(), ['b1+c1+p300', 'b1+c1+p500', 'b2+c1+p500']);
  assert.deepEqual(stats.prunedByRule['psu-covers-board'], { failed: 1, unverified: 0 });
});

/* ── Budget boundaries ── */

function oneBuildFixture() {
  // Totals: minimum 100, median 115, maximum 130.
  const catalogueFixture = catalogue([cpu('c', 'AM5')], [board('b', { socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX', widthMm: 244 })], [ram('r', 'DDR5')], [pcCase('k', ['ATX'])]);
  const prices = [verified('c', [30, 40]), verified('b', [30, 40]), verified('r', [20, 30]), verified('k', [20, 20])];
  // c: 30..40 (median 35), b: 30..40 (35), r: 20..30 (25), k: 20 (20) -> min 100, median 115, max 130
  return { catalogue: catalogueFixture, prices };
}

test('budget boundaries: within, may exceed and dropped at the exact totals', () => {
  const inputs = oneBuildFixture();
  const at = (budget) => { const r = planBuilds(budget, inputs); return [r.within.length, r.mayExceed.length]; };
  const first = planBuilds(130, inputs).within[0];
  assert.deepEqual([first.min, first.median, first.max], [100, 115, 130]);
  assert.deepEqual(at(130), [1, 0], 'budget equal to the maximum: definitely fits');
  assert.deepEqual(at(131), [1, 0]);
  assert.deepEqual(at(129), [0, 1], 'one rupee under the maximum: may exceed');
  assert.deepEqual(at(115), [0, 1], 'budget at the median: may exceed');
  assert.deepEqual(at(100), [0, 1], 'budget equal to the minimum: may exceed');
  assert.deepEqual(at(99), [0, 0], 'one rupee under the minimum: excluded');
  assert.deepEqual(at(0), [0, 0]);
  assert.equal(planBuilds(99, inputs).stats.prunedByBudget > 0, true, 'the excluded build was pruned by the budget bound');
});

test('budget: invalid values are rejected', () => {
  const inputs = oneBuildFixture();
  for (const bad of [-1, NaN, Infinity]) assert.throws(() => planBuilds(bad, inputs), RangeError);
});

test('ranking: cheapest median first, with a stable tie-break', () => {
  const catalogueFixture = catalogue(
    [cpu('c', 'AM5')],
    [board('b', { socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX', widthMm: 244 })],
    [ram('r-cheap', 'DDR5'), ram('r-mid', 'DDR5'), ram('r-wide', 'DDR5'), ram('r-tie', 'DDR5')],
    [pcCase('k', ['ATX'])],
  );
  const prices = [verified('c', [10]), verified('b', [10]), verified('k', [10]),
    verified('r-cheap', [5]), verified('r-mid', [20]), verified('r-wide', [10, 30]) /* median 20, min 10 */, verified('r-tie', [20])];
  const result = planBuilds(1000, { catalogue: catalogueFixture, prices });
  // r-mid and r-tie tie on median 20 and on minimum 20; r-wide ties on median but has a lower minimum.
  assert.deepEqual(result.within.map((b) => b.parts[2].id), ['r-cheap', 'r-wide', 'r-mid', 'r-tie']);
});

/* ── Exclusions ── */

test('models without a verified price are excluded with a reason, and empty slots are reported', () => {
  const catalogueFixture = catalogue(
    [cpu('c', 'AM5')],
    [board('b', { socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX', widthMm: 244 })],
    [ram('r-unpriced', 'DDR5'), ram('r-no-record', 'DDR5')],
    [pcCase('k', ['ATX'])],
  );
  const prices = [verified('c', [10]), verified('b', [10]), verified('k', [10]), unverified('r-unpriced')];
  const result = planBuilds(1000, { catalogue: catalogueFixture, prices });
  assert.deepEqual(result.emptySlots, ['ram']);
  assert.equal(result.within.length + result.mayExceed.length, 0);
  assert.deepEqual(result.excluded.map((m) => [m.id, m.reason]), [['r-unpriced', 'not-listed'], ['r-no-record', 'no-price-record']]);
  assert.equal(result.stats.nodesVisited, 0, 'no search when a slot has no candidates');
});

/* ── Exhaustive-search correctness ── */

function random(seed) { // small deterministic generator so failures are reproducible
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

function randomInputs(seed) {
  const rand = random(seed);
  const sockets = ['AM4', 'AM5', undefined];
  const memories = ['DDR4', 'DDR5', undefined];
  const forms = ['E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX', undefined];
  const widths = [170, 244, 277, undefined];
  const n = () => 2 + Math.floor(rand() * 3);
  const cpus = Array.from({ length: n() }, (_, i) => cpu(`c${i}`, pick(rand, sockets)));
  const boards = Array.from({ length: n() }, (_, i) => board(`b${i}`, { socket: pick(rand, sockets), memoryType: pick(rand, memories), formFactor: pick(rand, forms), widthMm: pick(rand, widths) }));
  const rams = Array.from({ length: n() }, (_, i) => ram(`r${i}`, pick(rand, memories)));
  const cases = Array.from({ length: n() }, (_, i) => {
    const supported = pick(rand, [undefined, [], ['ATX'], ['ATX', 'Micro-ATX'], ['E-ATX', 'ATX'], ['Mini-ITX', 'Micro-ATX', 'ATX', 'E-ATX']]);
    return pcCase(`k${i}`, supported, supported?.includes('E-ATX') ? pick(rand, [undefined, { 'E-ATX': 277 }, { 'E-ATX': 250 }]) : undefined);
  });
  const prices = [...cpus, ...boards, ...rams, ...cases].map((part) => {
    if (rand() < 0.2) return unverified(part.id);
    return verified(part.id, Array.from({ length: 1 + Math.floor(rand() * 3) }, () => 10 + Math.floor(rand() * 90)));
  });
  return { catalogue: catalogue(cpus, boards, rams, cases), prices };
}

/** Independent reference: enumerate every combination of priced parts and judge it with the existing checker. */
function bruteForce(inputs, budget) {
  const record = new Map(inputs.prices.map((r) => [r.productId, r]));
  const priced = (list) => list.filter((part) => record.get(part.id)?.status === 'verified');
  const within = []; const mayExceed = [];
  for (const m of priced(inputs.catalogue.motherboards)) for (const c of priced(inputs.catalogue.cpus)) for (const r of priced(inputs.catalogue.ramKits)) for (const k of priced(inputs.catalogue.cases)) {
    if (checkCompatibility({ cpu: c, motherboard: m, ram: r, pcCase: k }).overall !== 'ALL_CHECKS_PASSED') continue;
    const parts = [m, c, r, k];
    const stat = (key) => parts.reduce((sum, part) => sum + record.get(part.id).stats[key], 0);
    const total = { min: stat('min'), median: stat('median'), max: stat('max') };
    if (total.min > budget) continue;
    (total.max <= budget ? within : mayExceed).push({ key: parts.map((p) => p.id).join('+'), ...total });
  }
  const order = (a, b) => a.median - b.median || a.min - b.min || a.key.localeCompare(b.key);
  return { within: within.sort(order), mayExceed: mayExceed.sort(order) };
}

test('exhaustive correctness: the search matches brute-force enumeration on random small catalogues', () => {
  let comparedBuilds = 0;
  for (let seed = 1; seed <= 150; seed += 1) {
    const inputs = randomInputs(seed);
    const totals = bruteForce(inputs, Infinity);
    const edges = [...totals.within, ...totals.mayExceed].flatMap((b) => [b.min - 1, b.min, b.median, b.max - 1, b.max, b.max + 1]);
    for (const budget of [0, 25, 60, 120, 200, 400, ...edges.filter((x) => x >= 0)]) {
      const expected = bruteForce(inputs, budget);
      const actual = planBuilds(budget, inputs);
      const view = (builds) => builds.map((b) => ({ key: ids(b), min: b.min, median: b.median, max: b.max }));
      assert.deepEqual(view(actual.within), expected.within, `seed ${seed}, budget ${budget}: within`);
      assert.deepEqual(view(actual.mayExceed), expected.mayExceed, `seed ${seed}, budget ${budget}: may exceed`);
      assert.equal(actual.stats.builds, expected.within.length + expected.mayExceed.length);
      comparedBuilds += expected.within.length + expected.mayExceed.length;
    }
  }
  assert(comparedBuilds > 500, `the random catalogues produced enough builds to be meaningful (${comparedBuilds})`);
});

test('exhaustive correctness: budget pruning never removes a build whose minimum fits', () => {
  for (let seed = 200; seed <= 260; seed += 1) {
    const inputs = randomInputs(seed);
    const all = planBuilds(1e9, inputs); // effectively no pruning
    const everything = [...all.within, ...all.mayExceed];
    for (const budget of [0, 30, 80, 150, 300]) {
      const pruned = planBuilds(budget, inputs);
      const kept = [...pruned.within, ...pruned.mayExceed].map(ids).sort(byText);
      const qualifying = everything.filter((b) => b.min <= budget).map(ids).sort(byText);
      assert.deepEqual(kept, qualifying, `seed ${seed}, budget ${budget}`);
    }
  }
});

test('exhaustive correctness: the planner rules agree with the existing checker on every real combination', () => {
  const rules = Object.fromEntries(PLANNER_RULES.map((rule) => [rule.id, rule]));
  for (const c of [undefined, ...CPUS]) for (const m of [undefined, ...MOTHERBOARDS]) for (const r of [undefined, ...RAM_KITS]) for (const k of [undefined, ...CASES]) {
    const report = checkCompatibility({ cpu: c, motherboard: m, ram: r, pcCase: k });
    const parts = { cpu: c, motherboard: m, ram: r, pcCase: k };
    for (const check of report.checks) assert.equal(rules[check.rule].check(parts), check.status, check.rule);
  }
});

/* ── The real catalogue ── */

test('real catalogue: 180 combinations of real models, 24 of them compatible', () => {
  const real = (list) => list.filter((part) => !part.sources.some((s) => s.kind === 'demo'));
  const [c, m, r, k] = [real(CPUS), real(MOTHERBOARDS), real(RAM_KITS), real(CASES)];
  assert.deepEqual([c.length, m.length, r.length, k.length], [3, 5, 4, 3]);
  assert.equal(c.length * m.length * r.length * k.length, 180);
  let compatible = 0;
  for (const cc of c) for (const mm of m) for (const rr of r) for (const kk of k) {
    if (checkCompatibility({ cpu: cc, motherboard: mm, ram: rr, pcCase: kk }).overall === 'ALL_CHECKS_PASSED') compatible += 1;
  }
  assert.equal(compatible, 24);
  // The engine over the same models, with every part given an equal placeholder price, finds exactly the same 24.
  const candidates = {};
  for (const [slot, list] of [['cpu', c], ['motherboard', m], ['ram', r], ['pcCase', k]]) candidates[slot] = list.map((part) => unit(part.id, 1, part));
  assert.equal(searchBuilds({ slots: SLOT_ORDER, candidates, rules: PLANNER_RULES }).builds.length, 24);
});

test('real catalogue: the two added RAM kits are the approved models with manufacturer sources', () => {
  const ddr4 = RAM_KITS.find((p) => p.id === 'corsair-cmk16gx4m1e3200c16');
  const ddr5 = RAM_KITS.find((p) => p.id === 'corsair-cmk16gx5m1e6000z36');
  assert.equal(ddr4.memoryType, 'DDR4');
  assert.equal(ddr5.memoryType, 'DDR5');
  for (const kit of [ddr4, ddr5]) {
    assert(kit.model.includes(kit.id.replace('corsair-', '').toUpperCase()), `${kit.id} model name carries its part number`);
    assert(kit.sources.every((s) => s.kind === 'manufacturer' && s.url.startsWith('https://www.corsair.com/')));
  }
});

test('real catalogue at 60,000: the Intel configuration is the only priced result', () => {
  const result = planBuilds(60000);
  assert.deepEqual(result.within.map(ids), ['msi-pro-b760m-a-wifi-ddr4+intel-core-i5-13400f+corsair-cmk16gx4m1e3200c16+nzxt-h5-flow-2024']);
  assert.equal(result.mayExceed.length, 0);
  const [intel] = result.within;
  assert.deepEqual([intel.min, intel.median, intel.max], [53460, 53614.5, 53769]);
  assert.equal(intel.budgetStatus, 'within');
  assert.equal(intel.sources, 1);
  assert.equal(intel.lowConfidence, true);
  assert.deepEqual(intel.parts.filter((p) => p.lowConfidence).map((p) => p.id), ['intel-core-i5-13400f', 'nzxt-h5-flow-2024']);
  assert.equal(intel.parts.find((p) => p.slot === 'pcCase').variant, 'White, CC-H52FW-01');
});

test('real catalogue: the Ryzen configuration appears only when the budget permits it', () => {
  const ryzenKey = 'asus-rog-strix-b650-a-gaming-wifi+amd-ryzen-5-7600+corsair-cmk16gx5m1e6000z36+nzxt-h5-flow-2024';
  const intelKey = 'msi-pro-b760m-a-wifi-ddr4+intel-core-i5-13400f+corsair-cmk16gx4m1e3200c16+nzxt-h5-flow-2024';
  const names = (list) => list.map(ids);
  for (const budget of [53459, 53460, 60000, 86606]) {
    const r = planBuilds(budget);
    assert(![...r.within, ...r.mayExceed].some((b) => ids(b) === ryzenKey), `no Ryzen build at ${budget}`);
  }
  const mid = planBuilds(87000);
  assert.deepEqual([names(mid.within), names(mid.mayExceed)], [[intelKey], [ryzenKey]]);
  const justUnder = planBuilds(87354);
  assert.deepEqual(names(justUnder.mayExceed), [ryzenKey]);
  const enough = planBuilds(87355);
  assert.deepEqual(names(enough.within), [intelKey, ryzenKey], 'ranked cheapest median first');
  assert.deepEqual(enough.within.map((b) => [b.min, b.median, b.max])[1], [86607, 87115.5, 87355]);
  assert.equal(names(enough.mayExceed).length, 0);
});

test('real catalogue: budget edges around the Intel configuration', () => {
  const at = (budget) => { const r = planBuilds(budget); return [r.within.length, r.mayExceed.length]; };
  assert.deepEqual(at(53769), [1, 0]);
  assert.deepEqual(at(53768), [0, 1]);
  assert.deepEqual(at(53460), [0, 1]);
  assert.deepEqual(at(53459), [0, 0]);
});

test('real catalogue: unpriced models are excluded and explained; priced ones are not', () => {
  const result = planBuilds(60000);
  const excluded = new Map(result.excluded.map((m) => [m.id, m]));
  assert.deepEqual([...excluded.keys()].sort(), [
    'asus-rog-maximus-z790-extreme', 'asus-rog-strix-b650e-i-gaming-wifi', 'cooler-master-masterbox-q300l', 'corsair-cmk16gx4m2b3200c16',
    'corsair-cmk32gx5m2b6000c30', 'demo-case-no-width-limit', 'demo-motherboard-no-socket', 'fractal-design-define-7', 'msi-mag-b550-tomahawk',
  ].sort());
  for (const model of result.excluded) assert(model.explanation.length > 10, `${model.id} has an explanation`);
  assert.equal(excluded.get('demo-motherboard-no-socket').reason, 'demo');
  assert.equal(excluded.get('msi-mag-b550-tomahawk').reason, 'variant-ambiguous');
  assert.equal(excluded.get('fractal-design-define-7').reason, 'out-of-stock-only');
  assert.deepEqual(result.emptySlots, []);
  // The Ryzen 5 5600X has a verified price but its only compatible board is unpriced, so it is in no build.
  assert(!result.excluded.some((m) => m.id === 'amd-ryzen-5-5600x'));
  const every = [...planBuilds(1e9).within, ...planBuilds(1e9).mayExceed];
  assert(!every.some((b) => b.parts.some((p) => p.id === 'amd-ryzen-5-5600x')));
  assert.equal(every.length, 2);
});

test('real catalogue: the default inputs are the real catalogues and price records', () => {
  assert.equal(DEFAULT_INPUTS.prices, PRICE_RECORDS);
  assert.equal(DEFAULT_INPUTS.catalogue.cpus, CPUS);
  assert.equal(DEFAULT_INPUTS.catalogue.ramKits, RAM_KITS);
});

/* ── Wording that the page and README make about the data ── */

test('retailer coverage: four retailers supplied counted observations, two were only checked', () => {
  assert.deepEqual(retailerCoverage(), { counted: ['MD Computers', 'PrimeABGB', 'Vedant Computers', 'EliteHubs'], checkedOnly: ['Computech Store', 'PC Studio'] });
  // The two that were only checked appear in rejected listings and nowhere among counted observations.
  for (const name of ['Computech Store', 'PC Studio']) {
    assert(PRICE_RECORDS.some((record) => record.rejected.some((listing) => listing.retailer === name)), name + ' has rejected listings');
    assert(!PRICE_RECORDS.some((record) => record.status === 'verified' && record.observations.some((o) => o.retailer === name)), name + ' has no counted observation');
  }
});

test('retailer coverage: derived from the records, so unverified records and rejected listings never count', () => {
  const records = [verified('a', [10]), unverified('b'), { ...verified('c', [20]), observations: verified('c', [20]).observations.map((o) => ({ ...o, retailer: 'EliteHubs' })) }];
  assert.deepEqual(retailerCoverage(records, ['MD Computers', 'EliteHubs', 'PC Studio']), { counted: ['MD Computers', 'EliteHubs'], checkedOnly: ['PC Studio'] });
  assert.deepEqual(retailerCoverage([], ['MD Computers']), { counted: [], checkedOnly: ['MD Computers'] });
});

test("the DDR4 kit's recorded platform-support limitation stays in its catalogue note (cited in the technical notes)", () => {
  const kit = RAM_KITS.find((part) => part.id === 'corsair-cmk16gx4m1e3200c16');
  const note = kit.sources.map((source) => source.note).join(' ');
  assert(note.includes('Intel 300–600 series') && note.includes('AMD 300–500 series'), 'the platform list quoted on the page is in the catalogue note');
  assert(/checker compares memory type only/.test(note), 'the note says the rules do not check platform support');
});
