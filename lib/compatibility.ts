// Rule-based PC compatibility checker: three independent, pure rules and a reducer.
// No React, Three.js or '@/' imports so the Node test runner can load this file directly.
import type { Cpu, FormFactor, Motherboard, PcCase, RamKit, Source } from './compatibility-catalogue';

export type CheckStatus = 'PASSED' | 'FAILED' | 'UNVERIFIED';
export type RuleId = 'cpu-motherboard' | 'ram-motherboard' | 'motherboard-case';
export type CheckResult = {
  rule: RuleId;
  title: string;
  status: CheckStatus;
  explanation: string; // why this status was given
  evidence: string[]; // the specific facts used, each with its source
};
export type OverallStatus = 'ALL_CHECKS_PASSED' | 'FAILED' | 'UNVERIFIED';
export type CompatibilityReport = { overall: OverallStatus; summary: string; checks: CheckResult[] };
export type Selection = { cpu?: Cpu; motherboard?: Motherboard; ram?: RamKit; pcCase?: PcCase };

/** Form factors with no single standard width: a case listing one of these does not by itself prove a given board fits. */
export const VARIABLE_WIDTH_FORM_FACTORS: FormFactor[] = ['E-ATX'];

type Product = { brand: string; model: string; sources: Source[] };

const nameOf = (product: Product) => (product.model.startsWith(product.brand) ? product.model : `${product.brand} ${product.model}`);

function sourceOf(product: Product): string {
  return product.sources.some((source) => source.kind === 'manufacturer') ? `${product.brand} source` : 'demo data, not manufacturer-verified';
}

const fact = (product: Product, label: string, value: string | number | undefined, unit = '') =>
  value === undefined ? `${nameOf(product)}: ${label} not documented` : `${nameOf(product)}: ${label} ${value}${unit} (${sourceOf(product)})`;

const result = (rule: RuleId, title: string, status: CheckStatus, explanation: string, evidence: string[]): CheckResult => ({ rule, title, status, explanation, evidence });

function notSelected(rule: RuleId, title: string, needs: string, parts: [string, unknown][]): CheckResult {
  const missing = parts.filter(([, value]) => !value).map(([label]) => label);
  return result(rule, title, 'UNVERIFIED', `Select ${needs} to run this check.`, missing.map((label) => `No ${label} selected`));
}

const CPU_TITLE = 'CPU – motherboard socket';
export function checkCpuMotherboard(cpu?: Cpu, board?: Motherboard): CheckResult {
  if (!cpu || !board) return notSelected('cpu-motherboard', CPU_TITLE, 'a CPU and a motherboard', [['CPU', cpu], ['motherboard', board]]);
  const evidence = [fact(cpu, 'socket', cpu.socket), fact(board, 'socket', board.socket)];
  if (cpu.socket === undefined || board.socket === undefined) {
    const missing = [cpu.socket === undefined && `socket of ${nameOf(cpu)}`, board.socket === undefined && `socket of ${nameOf(board)}`].filter(Boolean);
    return result('cpu-motherboard', CPU_TITLE, 'UNVERIFIED', `The ${missing.join(' and the ')} is not documented in the catalogue, so this cannot be confirmed.`, evidence);
  }
  if (cpu.socket !== board.socket) {
    return result('cpu-motherboard', CPU_TITLE, 'FAILED', `${nameOf(cpu)} uses socket ${cpu.socket}, but ${nameOf(board)} has a ${board.socket} socket. The CPU will not fit.`, evidence);
  }
  return result('cpu-motherboard', CPU_TITLE, 'PASSED', `Both the CPU and the motherboard use socket ${cpu.socket}.`, evidence);
}

const RAM_TITLE = 'RAM – motherboard memory type';
export function checkRamMotherboard(ram?: RamKit, board?: Motherboard): CheckResult {
  if (!ram || !board) return notSelected('ram-motherboard', RAM_TITLE, 'a RAM kit and a motherboard', [['RAM kit', ram], ['motherboard', board]]);
  const evidence = [fact(ram, 'memory type', ram.memoryType), fact(board, 'memory type', board.memoryType)];
  if (ram.memoryType === undefined || board.memoryType === undefined) {
    const missing = [ram.memoryType === undefined && `memory type of ${nameOf(ram)}`, board.memoryType === undefined && `memory type of ${nameOf(board)}`].filter(Boolean);
    return result('ram-motherboard', RAM_TITLE, 'UNVERIFIED', `The ${missing.join(' and the ')} is not documented in the catalogue, so this cannot be confirmed.`, evidence);
  }
  if (ram.memoryType !== board.memoryType) {
    return result('ram-motherboard', RAM_TITLE, 'FAILED', `${nameOf(ram)} is ${ram.memoryType} memory, but ${nameOf(board)} has ${board.memoryType} memory slots. The module will not fit.`, evidence);
  }
  return result('ram-motherboard', RAM_TITLE, 'PASSED', `Both the RAM kit and the motherboard use ${ram.memoryType}.`, evidence);
}

const CASE_TITLE = 'Motherboard – case fit';
export function checkMotherboardCase(board?: Motherboard, pcCase?: PcCase): CheckResult {
  if (!board || !pcCase) return notSelected('motherboard-case', CASE_TITLE, 'a motherboard and a case', [['motherboard', board], ['case', pcCase]]);
  const supported = pcCase.supportedFormFactors;
  const hasList = supported !== undefined && supported.length > 0;
  const formFactor = board.formFactor;
  const formEvidence = [fact(board, 'form factor', formFactor), fact(pcCase, 'supports', hasList ? supported.join(', ') : undefined)];
  const fail = (explanation: string, evidence: string[]) => result('motherboard-case', CASE_TITLE, 'FAILED', explanation, evidence);
  const unverified = (explanation: string, evidence: string[]) => result('motherboard-case', CASE_TITLE, 'UNVERIFIED', explanation, evidence);
  const pass = (explanation: string, evidence: string[]) => result('motherboard-case', CASE_TITLE, 'PASSED', explanation, evidence);

  // Step 2: the form factor and the case's supported list are always required.
  if (formFactor === undefined || !hasList) {
    const missing = [formFactor === undefined && `form factor of ${nameOf(board)}`, !hasList && `supported form factors of ${nameOf(pcCase)}`].filter(Boolean);
    return unverified(`The ${missing.join(' and the ')} is not documented in the catalogue, so this cannot be confirmed.`, formEvidence);
  }
  // Step 3: a form factor the case does not list is a known violation, whatever else is missing.
  if (!supported.includes(formFactor)) {
    return fail(`${nameOf(board)} is a ${formFactor} board, but ${nameOf(pcCase)} supports only ${supported.join(', ')}.`, formEvidence);
  }
  // Steps 4–6: a documented width limit for this form factor applies, so compare it with the board's width.
  const limit = pcCase.maxBoardWidthMm?.[formFactor];
  if (limit !== undefined) {
    const widthEvidence = [...formEvidence, fact(board, 'width', board.widthMm, ' mm'), fact(pcCase, `maximum ${formFactor} board width`, limit, ' mm')];
    if (board.widthMm === undefined) {
      return unverified(`${nameOf(pcCase)} documents a ${limit} mm limit for ${formFactor} boards, but the width of ${nameOf(board)} is not documented, so fit cannot be confirmed.`, widthEvidence);
    }
    if (board.widthMm > limit) {
      return fail(`${formFactor} is supported, but ${nameOf(board)} is ${board.widthMm} mm wide and ${nameOf(pcCase)} accepts ${formFactor} boards up to ${limit} mm.`, widthEvidence);
    }
    return pass(`${formFactor} is supported and the ${board.widthMm} mm board is within the case's ${limit} mm limit.`, widthEvidence);
  }
  // Step 7: no documented limit, and this form factor has no single standard width.
  if (VARIABLE_WIDTH_FORM_FACTORS.includes(formFactor)) {
    return unverified(`${nameOf(pcCase)} lists ${formFactor} but states no maximum board width, and ${formFactor} board widths vary, so fit cannot be confirmed.`, formEvidence);
  }
  // Step 8: a standard form factor the case documents support for; no width value is required.
  return pass(`${nameOf(pcCase)} documents support for ${formFactor} boards, and no width limit applies to this form factor.`, formEvidence);
}

export function checkCompatibility(selection: Selection): CompatibilityReport {
  const checks = [
    checkCpuMotherboard(selection.cpu, selection.motherboard),
    checkRamMotherboard(selection.ram, selection.motherboard),
    checkMotherboardCase(selection.motherboard, selection.pcCase),
  ];
  const failed = checks.filter((check) => check.status === 'FAILED').length;
  const unverified = checks.filter((check) => check.status === 'UNVERIFIED').length;
  if (failed > 0) {
    return { overall: 'FAILED', summary: `${failed} of 3 checked rules failed${unverified ? `; ${unverified} could not be confirmed` : ''}.`, checks };
  }
  if (unverified > 0) return { overall: 'UNVERIFIED', summary: `${unverified} of 3 checks could not be confirmed.`, checks };
  return { overall: 'ALL_CHECKS_PASSED', summary: 'All 3 checked rules passed. This does not confirm that the whole build is compatible.', checks };
}
