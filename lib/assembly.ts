import { PART_IDS, PREREQUISITES, removeWithDependencies, type PartId } from './components-data';

/** Assembly order is the reverse of the disassembly removal order. */
export const BUILD_ORDER: PartId[] = ['case', 'fans', 'psu', 'motherboard', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'panel'];

/**
 * PREREQUISITES lists what must come out before a part can be removed, so installation is its inverse:
 * a part can go in once the chassis and every part that must be removed before it are installed.
 */
export const INSTALL_REQUIREMENTS = Object.fromEntries(PART_IDS.map((id) => [
  id,
  id === 'case' ? [] : ['case', ...PART_IDS.filter((other) => PREREQUISITES[other].includes(id))],
])) as Record<PartId, PartId[]>;

/** Where each part is mounted, phrased for drop guidance. */
export const MOUNT_SITES: Record<PartId, string> = {
  case: 'workbench position', panel: 'open side of the chassis', motherboard: 'standoffs on the chassis tray',
  cpu: 'CPU socket', cooler: 'cooler mount over the CPU', ram: 'DIMM slots A2 and B2', gpu: 'primary PCIe ×16 slot',
  ssd: 'M.2 position on the motherboard', psu: 'bottom PSU bay', fans: 'front intake mounts',
};

export function missingRequirements(id: PartId, installed: PartId[]): PartId[] {
  return INSTALL_REQUIREMENTS[id].filter((dep) => !installed.includes(dep));
}

/** Returns true when all prerequisites for `id` are already installed. */
export function canInstall(id: PartId, installed: PartId[]): boolean {
  return missingRequirements(id, installed).length === 0;
}

/** Returns the next part in BUILD_ORDER that can be installed. */
export function nextBuildStep(installed: PartId[]): PartId | null {
  return BUILD_ORDER.find((id) => !installed.includes(id) && canInstall(id, installed)) ?? null;
}

/** Removes `id` along with every installed part that must come out before it. The chassis stays. */
export function uninstallWithDependents(id: PartId, installed: PartId[]): PartId[] {
  if (id === 'case') return installed;
  const removed = removeWithDependencies(id, PART_IDS.filter((part) => !installed.includes(part)));
  return installed.filter((part) => !removed.includes(part));
}

export type Vec3 = [number, number, number];
/** World position of each part that was released away from its mount and is waiting in the workspace. */
export type LoosePlacements = Partial<Record<PartId, Vec3>>;
export type PartLocation = 'tray' | 'loose' | 'installed';

/** Where a part currently lives. Only `installed` counts toward progress. */
export function partLocation(id: PartId, installed: PartId[], loose: LoosePlacements): PartLocation {
  if (installed.includes(id)) return 'installed';
  return loose[id] ? 'loose' : 'tray';
}

/** Parts that are still in the tray, and so hidden in the 3D workspace. */
export function trayParts(installed: PartId[], loose: LoosePlacements): PartId[] {
  return PART_IDS.filter((id) => partLocation(id, installed, loose) === 'tray');
}

export function withoutLoose(loose: LoosePlacements, id: PartId): LoosePlacements {
  if (!loose[id]) return loose;
  const { [id]: _released, ...rest } = loose;
  return rest;
}

/**
 * After an uninstall cascade, a loose part can lose a requirement (a loose cooler whose CPU was removed). Those parts
 * return to the tray, so a loose part is always one that can be installed right now. Returns the same object when
 * nothing changes, so state setters can bail out.
 */
export function releaseUnavailableLoose(installed: PartId[], loose: LoosePlacements): LoosePlacements {
  const kept = PART_IDS.filter((id) => loose[id] && !installed.includes(id) && canInstall(id, installed));
  if (kept.length === PART_IDS.filter((id) => loose[id]).length) return loose;
  return Object.fromEntries(kept.map((id) => [id, loose[id]])) as LoosePlacements;
}

export type DropPoint = { inside: boolean; onTarget: boolean };
export type DropOutcome =
  | { kind: 'install' }
  | { kind: 'missed' }
  | { kind: 'locked'; missing: PartId[] }
  | { kind: 'cancelled' }
  | { kind: 'already-installed' };

/** Decides what a drop of `id` means: only a ready part released over its own mount target installs. */
export function resolveDrop(id: PartId, installed: PartId[], drop: DropPoint): DropOutcome {
  if (installed.includes(id)) return { kind: 'already-installed' };
  if (!drop.inside) return { kind: 'cancelled' };
  const missing = missingRequirements(id, installed);
  if (missing.length) return { kind: 'locked', missing };
  return drop.onTarget ? { kind: 'install' } : { kind: 'missed' };
}
