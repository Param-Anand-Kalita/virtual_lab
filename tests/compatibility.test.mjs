import test from 'node:test';
import assert from 'node:assert/strict';
import { CPUS, MOTHERBOARDS, RAM_KITS, CASES } from '../lib/compatibility-catalogue.ts';
import { checkCpuMotherboard, checkRamMotherboard, checkMotherboardCase, checkCompatibility } from '../lib/compatibility.ts';

// Inline fixtures keep the rule tests independent of catalogue edits.
const sources = [{ kind: 'demo', note: 'test fixture' }];
const cpu = (socket) => ({ id: 'f-cpu', brand: 'Test', model: 'CPU', sources, socket });
const board = (fields) => ({ id: 'f-board', brand: 'Test', model: 'Board', sources, ...fields });
const ram = (memoryType) => ({ id: 'f-ram', brand: 'Test', model: 'RAM', sources, memoryType });
const pcCase = (supportedFormFactors, maxBoardWidthMm) => ({ id: 'f-case', brand: 'Test', model: 'Case', sources, supportedFormFactors, maxBoardWidthMm });
const text = (check) => `${check.explanation} ${check.evidence.join(' ')}`;

const byId = (list, id) => { const found = list.find((item) => item.id === id); assert(found, `catalogue has ${id}`); return found; };
const part = { cpu: (id) => byId(CPUS, id), board: (id) => byId(MOTHERBOARDS, id), ram: (id) => byId(RAM_KITS, id), pcCase: (id) => byId(CASES, id) };
const statuses = (report) => report.checks.map((check) => check.status);

test('1–2: CPU socket must match the motherboard socket', () => {
  const pass = checkCpuMotherboard(cpu('AM5'), board({ socket: 'AM5' }));
  assert.equal(pass.status, 'PASSED');
  assert.equal(pass.rule, 'cpu-motherboard');
  const fail = checkCpuMotherboard(cpu('AM5'), board({ socket: 'AM4' }));
  assert.equal(fail.status, 'FAILED');
  assert(text(fail).includes('AM5') && text(fail).includes('AM4'));
});

test('3–4: RAM type must match the motherboard memory type', () => {
  assert.equal(checkRamMotherboard(ram('DDR5'), board({ memoryType: 'DDR5' })).status, 'PASSED');
  const fail = checkRamMotherboard(ram('DDR4'), board({ memoryType: 'DDR5' }));
  assert.equal(fail.status, 'FAILED');
  assert(text(fail).includes('DDR4') && text(fail).includes('DDR5'));
});

test('5: a standard form factor the case documents passes without any width value', () => {
  const check = checkMotherboardCase(board({ formFactor: 'Micro-ATX' }), pcCase(['ATX', 'Micro-ATX', 'Mini-ITX']));
  assert.equal(check.status, 'PASSED');
  assert(text(check).includes('Micro-ATX'));
});

test('5b: a documented limit for the board form factor is applied (boundary passes)', () => {
  assert.equal(checkMotherboardCase(board({ formFactor: 'ATX', widthMm: 244 }), pcCase(['ATX'], { ATX: 244 })).status, 'PASSED');
  assert.equal(checkMotherboardCase(board({ formFactor: 'ATX', widthMm: 245 }), pcCase(['ATX'], { ATX: 244 })).status, 'FAILED');
});

test('6: a form factor the case does not list fails, even when widths are missing', () => {
  for (const fields of [{ formFactor: 'ATX' }, { formFactor: 'ATX', widthMm: 244 }]) {
    const check = checkMotherboardCase(board(fields), pcCase(['Micro-ATX', 'Mini-ITX']));
    assert.equal(check.status, 'FAILED');
    assert(text(check).includes('ATX') && text(check).includes('Mini-ITX'));
  }
  assert.equal(checkMotherboardCase(board({ formFactor: 'E-ATX' }), pcCase(['ATX'], { 'E-ATX': 272 })).status, 'FAILED');
});

test('6b–6c: an E-ATX board wider than the documented limit fails; at the limit it passes', () => {
  const wide = checkMotherboardCase(board({ formFactor: 'E-ATX', widthMm: 280 }), pcCase(['E-ATX', 'ATX'], { 'E-ATX': 272 }));
  assert.equal(wide.status, 'FAILED');
  assert(text(wide).includes('280') && text(wide).includes('272'));
  const exact = checkMotherboardCase(board({ formFactor: 'E-ATX', widthMm: 272 }), pcCase(['E-ATX', 'ATX'], { 'E-ATX': 272 }));
  assert.equal(exact.status, 'PASSED');
  assert(text(exact).includes('272'));
});

test('7a–7b: a missing CPU or motherboard socket is UNVERIFIED and names the missing field', () => {
  const noCpuSocket = checkCpuMotherboard(cpu(undefined), board({ socket: 'AM5' }));
  assert.equal(noCpuSocket.status, 'UNVERIFIED');
  assert(/socket of Test CPU/.test(noCpuSocket.explanation));
  const noBoardSocket = checkCpuMotherboard(cpu('AM5'), board({}));
  assert.equal(noBoardSocket.status, 'UNVERIFIED');
  assert(/socket of Test Board/.test(noBoardSocket.explanation));
  const neither = checkCpuMotherboard(cpu(undefined), board({}));
  assert.equal(neither.status, 'UNVERIFIED');
  assert(/CPU/.test(neither.explanation) && /Board/.test(neither.explanation));
});

test('8a–8e: missing RAM type, case list or width data is UNVERIFIED only where that data is needed', () => {
  assert.equal(checkRamMotherboard(ram(undefined), board({ memoryType: 'DDR5' })).status, 'UNVERIFIED');
  assert.equal(checkRamMotherboard(ram('DDR5'), board({})).status, 'UNVERIFIED');
  assert.equal(checkMotherboardCase(board({ formFactor: 'ATX' }), pcCase(undefined)).status, 'UNVERIFIED');
  assert.equal(checkMotherboardCase(board({ formFactor: 'ATX' }), pcCase([])).status, 'UNVERIFIED');
  assert.equal(checkMotherboardCase(board({}), pcCase(['ATX'])).status, 'UNVERIFIED');
  // 8c: E-ATX listed, no documented E-ATX limit
  const noLimit = checkMotherboardCase(board({ formFactor: 'E-ATX', widthMm: 272 }), pcCase(['E-ATX', 'ATX']));
  assert.equal(noLimit.status, 'UNVERIFIED');
  assert(/maximum board width/.test(noLimit.explanation));
  // 8d: a documented E-ATX limit but the board's width is not documented
  assert.equal(checkMotherboardCase(board({ formFactor: 'E-ATX' }), pcCase(['E-ATX'], { 'E-ATX': 285 })).status, 'UNVERIFIED');
  // 8e: a limit documented only for E-ATX does not apply to an ATX board
  assert.equal(checkMotherboardCase(board({ formFactor: 'ATX' }), pcCase(['E-ATX', 'ATX'], { 'E-ATX': 285 })).status, 'PASSED');
});

test('9: one rule failing and the others passing makes the overall result FAILED', () => {
  const report = checkCompatibility({ cpu: cpu('AM5'), motherboard: board({ socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX' }), ram: ram('DDR4'), pcCase: pcCase(['ATX']) });
  assert.deepEqual(statuses(report), ['PASSED', 'FAILED', 'PASSED']);
  assert.equal(report.overall, 'FAILED');
  assert.match(report.summary, /1 of 3 checked rules failed/);
});

test('10a: an empty selection is three UNVERIFIED "Select" results and does not throw', () => {
  const report = checkCompatibility({});
  assert.deepEqual(statuses(report), ['UNVERIFIED', 'UNVERIFIED', 'UNVERIFIED']);
  assert.equal(report.overall, 'UNVERIFIED');
  for (const check of report.checks) assert.match(check.explanation, /^Select /);
});

test('10b: an incomplete selection is never reported as passing', () => {
  const report = checkCompatibility({ cpu: cpu('AM5'), motherboard: board({ socket: 'AM5' }) });
  assert.deepEqual(statuses(report), ['PASSED', 'UNVERIFIED', 'UNVERIFIED']);
  assert.equal(report.overall, 'UNVERIFIED');
  assert.equal(checkCompatibility({ ram: ram('DDR5') }).overall, 'UNVERIFIED');
});

test('11: all three rules passing gives ALL_CHECKS_PASSED with a non-overclaiming summary', () => {
  const report = checkCompatibility({ cpu: cpu('AM5'), motherboard: board({ socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX' }), ram: ram('DDR5'), pcCase: pcCase(['ATX']) });
  assert.deepEqual(statuses(report), ['PASSED', 'PASSED', 'PASSED']);
  assert.equal(report.overall, 'ALL_CHECKS_PASSED');
  assert.match(report.summary, /does not confirm/);
});

test('12: a failure takes precedence over an unverified check', () => {
  const report = checkCompatibility({ cpu: cpu('AM5'), motherboard: board({ socket: 'AM4', memoryType: 'DDR5' }), ram: ram('DDR5') });
  assert.deepEqual(statuses(report), ['FAILED', 'PASSED', 'UNVERIFIED']);
  assert.equal(report.overall, 'FAILED');
});

test('13: catalogue integrity and source traceability', () => {
  const all = [...CPUS, ...MOTHERBOARDS, ...RAM_KITS, ...CASES];
  assert.equal(new Set(all.map((item) => item.id)).size, all.length, 'ids are unique');
  const demos = all.filter((item) => item.sources.some((source) => source.kind === 'demo'));
  assert.deepEqual(demos.map((item) => item.id).sort(), ['demo-case-no-width-limit', 'demo-motherboard-no-socket']);
  for (const item of all) {
    assert(item.sources.length > 0, `${item.id} has a source`);
    const kinds = new Set(item.sources.map((source) => source.kind));
    assert.equal(kinds.size, 1, `${item.id} does not mix demo and manufacturer sources`);
    for (const source of item.sources) {
      if (source.kind === 'manufacturer') {
        assert(source.url.startsWith('https://'), `${item.id} source is an https URL`);
        assert(/^\d{4}-\d{2}-\d{2}$/.test(source.checked) && !Number.isNaN(Date.parse(source.checked)), `${item.id} has an ISO verification date`);
      } else {
        assert(source.note.length > 0);
      }
    }
    if (kinds.has('demo')) assert(item.model.includes('Demo') && item.brand === 'Demo', `${item.id} is visibly labelled as demo`);
  }
  for (const item of MOTHERBOARDS) if (item.widthMm !== undefined) assert(Number.isFinite(item.widthMm) && item.widthMm > 0);
  for (const item of CASES) for (const [formFactor, width] of Object.entries(item.maxBoardWidthMm ?? {})) {
    assert(item.supportedFormFactors?.includes(formFactor), `${item.id} limit is for a supported form factor`);
    assert(Number.isFinite(width) && width > 0);
  }
});

test('14: every report has three checks, each with an explanation and evidence, and inputs are not mutated', () => {
  const before = structuredClone({ CPUS, MOTHERBOARDS, RAM_KITS, CASES });
  let combinations = 0;
  for (const c of [undefined, ...CPUS]) for (const b of [undefined, ...MOTHERBOARDS]) for (const r of [undefined, ...RAM_KITS]) for (const k of [undefined, ...CASES]) {
    const report = checkCompatibility({ cpu: c, motherboard: b, ram: r, pcCase: k });
    combinations++;
    assert.equal(report.checks.length, 3);
    for (const check of report.checks) {
      assert(check.explanation.length > 0);
      assert(check.evidence.length > 0);
      assert(['PASSED', 'FAILED', 'UNVERIFIED'].includes(check.status));
    }
    // The overall status is exactly the reduction of the three checks.
    const expected = statuses(report).includes('FAILED') ? 'FAILED' : statuses(report).includes('UNVERIFIED') ? 'UNVERIFIED' : 'ALL_CHECKS_PASSED';
    assert.equal(report.overall, expected);
  }
  // Every list plus the "nothing selected" option. The RAM list grew from 2 to 4 kits when the budget planner's kits were added.
  assert.equal(combinations, (CPUS.length + 1) * (MOTHERBOARDS.length + 1) * (RAM_KITS.length + 1) * (CASES.length + 1));
  assert.deepEqual({ CPUS, MOTHERBOARDS, RAM_KITS, CASES }, before);
});

test('15: removing any rule field from real catalogue data gives UNVERIFIED, never PASSED', () => {
  const strip = (item, field) => ({ ...item, [field]: undefined });
  const okBoard = part.board('asus-rog-strix-b650-a-gaming-wifi');
  const okCpu = part.cpu('amd-ryzen-5-7600');
  const okRam = part.ram('corsair-cmk32gx5m2b6000c30');
  const okCase = part.pcCase('nzxt-h5-flow-2024');
  const real = (list) => list.filter((item) => item.sources.every((source) => source.kind === 'manufacturer'));
  for (const item of real(CPUS)) {
    assert.notEqual(item.socket, undefined, `${item.id} has a socket`);
    assert.equal(checkCpuMotherboard(strip(item, 'socket'), okBoard).status, 'UNVERIFIED');
  }
  for (const item of real(MOTHERBOARDS)) {
    for (const field of ['socket', 'memoryType', 'formFactor', 'widthMm']) assert.notEqual(item[field], undefined, `${item.id} has ${field}`);
    assert.equal(checkCpuMotherboard(okCpu, strip(item, 'socket')).status, 'UNVERIFIED');
    assert.equal(checkRamMotherboard(okRam, strip(item, 'memoryType')).status, 'UNVERIFIED');
    assert.equal(checkMotherboardCase(strip(item, 'formFactor'), okCase).status, 'UNVERIFIED');
  }
  for (const item of real(RAM_KITS)) {
    assert.notEqual(item.memoryType, undefined);
    assert.equal(checkRamMotherboard(strip(item, 'memoryType'), okBoard).status, 'UNVERIFIED');
  }
  for (const item of real(CASES)) {
    assert(item.supportedFormFactors?.length > 0, `${item.id} lists form factors`);
    assert.equal(checkMotherboardCase(okBoard, strip(item, 'supportedFormFactors')).status, 'UNVERIFIED');
  }
});

test('catalogue: the Q300L documents no width limit and never needs one', () => {
  const q300l = part.pcCase('cooler-master-masterbox-q300l');
  assert.equal(q300l.maxBoardWidthMm, undefined);
  const expected = { 'ATX': 'FAILED', 'E-ATX': 'FAILED', 'Micro-ATX': 'PASSED', 'Mini-ITX': 'PASSED' };
  for (const item of MOTHERBOARDS.filter((entry) => entry.sources.every((source) => source.kind === 'manufacturer'))) {
    assert.equal(checkMotherboardCase(item, q300l).status, expected[item.formFactor], `${item.id} in the Q300L`);
  }
});

test('catalogue: Z790 EXTREME (277 mm E-ATX) in the NZXT H5 Flow (2024) is the exact width boundary and passes', () => {
  const z790 = part.board('asus-rog-maximus-z790-extreme');
  const h5 = part.pcCase('nzxt-h5-flow-2024');
  assert.equal(z790.widthMm, 277);
  assert.equal(h5.maxBoardWidthMm['E-ATX'], 277);
  const check = checkMotherboardCase(z790, h5);
  assert.equal(check.status, 'PASSED');
  assert(text(check).includes('277'));
  assert(/\(ASUS source\)/.test(text(check)) && /\(NZXT source\)/.test(text(check)), 'evidence names the manufacturer source of each fact');
  assert(!/checked \d{4}-\d{2}-\d{2}/.test(text(check)), 'evidence no longer shows a checked date');
  assert.equal(checkMotherboardCase(z790, part.pcCase('fractal-design-define-7')).status, 'PASSED');
});

test('catalogue: the reviewed demonstration combinations give the documented results', () => {
  const combos = [
    // [cpu, board, ram, case, [rule 1, rule 2, rule 3], overall]
    ['amd-ryzen-5-7600', 'asus-rog-strix-b650-a-gaming-wifi', 'corsair-cmk32gx5m2b6000c30', 'nzxt-h5-flow-2024', ['PASSED', 'PASSED', 'PASSED'], 'ALL_CHECKS_PASSED'],
    ['intel-core-i5-13400f', 'msi-pro-b760m-a-wifi-ddr4', 'corsair-cmk16gx4m2b3200c16', 'cooler-master-masterbox-q300l', ['PASSED', 'PASSED', 'PASSED'], 'ALL_CHECKS_PASSED'],
    ['amd-ryzen-5-5600x', 'msi-mag-b550-tomahawk', 'corsair-cmk16gx4m2b3200c16', 'fractal-design-define-7', ['PASSED', 'PASSED', 'PASSED'], 'ALL_CHECKS_PASSED'],
    ['intel-core-i5-13400f', 'asus-rog-maximus-z790-extreme', 'corsair-cmk32gx5m2b6000c30', 'nzxt-h5-flow-2024', ['PASSED', 'PASSED', 'PASSED'], 'ALL_CHECKS_PASSED'],
    ['intel-core-i5-13400f', 'asus-rog-maximus-z790-extreme', 'corsair-cmk32gx5m2b6000c30', 'fractal-design-define-7', ['PASSED', 'PASSED', 'PASSED'], 'ALL_CHECKS_PASSED'],
    ['amd-ryzen-5-7600', 'msi-mag-b550-tomahawk', 'corsair-cmk16gx4m2b3200c16', 'fractal-design-define-7', ['FAILED', 'PASSED', 'PASSED'], 'FAILED'],
    ['amd-ryzen-5-7600', 'asus-rog-strix-b650-a-gaming-wifi', 'corsair-cmk16gx4m2b3200c16', 'nzxt-h5-flow-2024', ['PASSED', 'FAILED', 'PASSED'], 'FAILED'],
    ['intel-core-i5-13400f', 'asus-rog-maximus-z790-extreme', 'corsair-cmk32gx5m2b6000c30', 'cooler-master-masterbox-q300l', ['PASSED', 'PASSED', 'FAILED'], 'FAILED'],
    ['amd-ryzen-5-7600', 'asus-rog-strix-b650-a-gaming-wifi', 'corsair-cmk32gx5m2b6000c30', 'cooler-master-masterbox-q300l', ['PASSED', 'PASSED', 'FAILED'], 'FAILED'],
    ['amd-ryzen-5-5600x', 'asus-rog-strix-b650-a-gaming-wifi', 'corsair-cmk32gx5m2b6000c30', 'cooler-master-masterbox-q300l', ['FAILED', 'PASSED', 'FAILED'], 'FAILED'],
    ['amd-ryzen-5-7600', 'demo-motherboard-no-socket', 'corsair-cmk32gx5m2b6000c30', 'nzxt-h5-flow-2024', ['UNVERIFIED', 'PASSED', 'PASSED'], 'UNVERIFIED'],
    ['intel-core-i5-13400f', 'asus-rog-maximus-z790-extreme', 'corsair-cmk32gx5m2b6000c30', 'demo-case-no-width-limit', ['PASSED', 'PASSED', 'UNVERIFIED'], 'UNVERIFIED'],
  ];
  for (const [cpuId, boardId, ramId, caseId, expectedStatuses, overall] of combos) {
    const report = checkCompatibility({ cpu: part.cpu(cpuId), motherboard: part.board(boardId), ram: part.ram(ramId), pcCase: part.pcCase(caseId) });
    assert.deepEqual(statuses(report), expectedStatuses, [cpuId, boardId, ramId, caseId].join(' + '));
    assert.equal(report.overall, overall);
  }
});
