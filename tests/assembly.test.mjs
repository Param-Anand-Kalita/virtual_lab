import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PART_IDS, PREREQUISITES } from '../lib/components-data.ts';
import { BUILD_ORDER, INSTALL_REQUIREMENTS, MOUNT_SITES, canInstall, missingRequirements, nextBuildStep, partLocation, releaseUnavailableLoose, resolveDrop, trayParts, uninstallWithDependents, withoutLoose } from '../lib/assembly.ts';
import { centerHold, clusterBoxes, dragPosition, meshBoxes, rayHitsZone, restAboveFloor } from '../lib/drop-targets.ts';
import { createTower } from '../lib/tower.ts';

/** A build is physically valid when every missing part's removal prerequisites are missing too. */
function assertValidBuild(installed) {
  assert.equal(new Set(installed).size, installed.length, 'no duplicate installs');
  if (installed.length) assert(installed.includes('case'), 'nothing is installed without the chassis');
  for (const id of PART_IDS) {
    if (installed.includes(id)) continue;
    for (const dep of PREREQUISITES[id]) assert(!installed.includes(dep), `${dep} cannot be installed while ${id} is missing`);
  }
}

test('guided assembly follows the documented build order', () => {
  let installed = [];
  const order = [];
  for (let next = nextBuildStep(installed); next; next = nextBuildStep(installed)) {
    order.push(next); installed = [...installed, next]; assertValidBuild(installed);
  }
  assert.deepEqual(order, BUILD_ORDER);
  assert.equal(installed.length, PART_IDS.length);
});

test('locked parts stay locked until their mounting parts are in', () => {
  for (const id of PART_IDS.filter((part) => part !== 'case')) assert(!canInstall(id, []), `${id} needs the chassis first`);
  assert.deepEqual(missingRequirements('cpu', ['case']), ['motherboard']);
  assert(!canInstall('cooler', ['case', 'motherboard']), 'the cooler mounts over an installed CPU');
  assert(canInstall('cooler', ['case', 'motherboard', 'cpu']));
  assert(!canInstall('gpu', ['case', 'motherboard']), 'the GPU covers the M.2 drive, so the SSD goes first');
  assert(!canInstall('panel', BUILD_ORDER.slice(0, -2)), 'the side panel closes the case last');
  assert(canInstall('panel', BUILD_ORDER.slice(0, -1)));
  assert.deepEqual(INSTALL_REQUIREMENTS.case, []);
});

test('random install and removal walks never reach an impossible build', () => {
  let installed = []; let seed = 31337;
  for (let step = 0; step < 1000; step++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const id = PART_IDS[seed % PART_IDS.length];
    if (seed & 256) { if (!installed.includes(id) && canInstall(id, installed)) installed = [...installed, id]; }
    else installed = uninstallWithDependents(id, installed);
    assertValidBuild(installed);
  }
});

test('removing a part also removes what sits on top of it, but never the chassis', () => {
  const full = [...BUILD_ORDER];
  assert.deepEqual(new Set(uninstallWithDependents('cpu', full)), new Set(['case', 'fans', 'psu', 'motherboard', 'ram', 'ssd', 'gpu']));
  assert.deepEqual(uninstallWithDependents('case', full), full);
  assert.deepEqual(uninstallWithDependents('psu', ['case', 'fans']), ['case', 'fans'], 'removing an absent part changes nothing');
});

test('only a ready part released over its own target installs', () => {
  const installed = ['case', 'fans', 'psu', 'motherboard'];
  assert.deepEqual(resolveDrop('cpu', installed, { inside: true, onTarget: true }), { kind: 'install' });
  assert.deepEqual(resolveDrop('cpu', installed, { inside: true, onTarget: false }), { kind: 'missed' });
  assert.deepEqual(resolveDrop('cpu', installed, { inside: false, onTarget: false }), { kind: 'cancelled' });
  assert.deepEqual(resolveDrop('cooler', installed, { inside: true, onTarget: true }), { kind: 'locked', missing: ['cpu'] });
  assert.deepEqual(resolveDrop('psu', installed, { inside: true, onTarget: true }), { kind: 'already-installed' });
  for (const id of PART_IDS) assert(MOUNT_SITES[id], `${id} has drop guidance`);
});

test('mount zones come from each part’s installed geometry and line up with its slot', () => {
  const { parts } = createTower();
  const zones = Object.fromEntries(PART_IDS.map((id) => [id, clusterBoxes(meshBoxes(parts[id]), .03)]));
  const chassis = zones.case[0].clone().expandByScalar(.1);
  for (const id of PART_IDS) {
    assert(zones[id].length >= 1 && zones[id].length <= 2, `${id} has a specific target, not scattered fragments`);
    if (id !== 'case' && id !== 'panel') for (const zone of zones[id]) assert(chassis.containsBox(zone), `${id} mounts inside the chassis`);
  }
  // Motherboard-local slot positions from the tower model, converted to world space.
  const board = parts.motherboard.position;
  const center = (box) => box.getCenter(new THREE.Vector3());
  const dimms = zones.ram.map(center).sort((a, b) => a.z - b.z);
  assert.equal(dimms.length, 2, 'each memory module highlights its own slot');
  assert(Math.abs(dimms[0].z - (board.z + .63)) < .01 && Math.abs(dimms[1].z - (board.z + 1.13)) < .01, 'modules target slots A2 and B2');
  for (const dimm of dimms) assert(Math.abs(dimm.y - (board.y + .68)) < .02);
  const cpu = center(zones.cpu[0]);
  // The pin-1 marker overhangs one corner slightly, so allow 2 cm of offset.
  assert(Math.abs(cpu.y - (board.y + .68)) < .02 && Math.abs(cpu.z - (board.z - .25)) < .02, 'CPU target is centred on the socket');
  const card = zones.gpu.find((zone) => zone.max.z - zone.min.z > 1);
  assert(card.min.x <= board.x + .175 && card.max.y >= board.y - .79, 'GPU target reaches the primary PCIe slot');
  assert(zones.cooler[0].min.x <= zones.cpu[0].max.x + .01, 'cooler target sits directly on the CPU');
});

test('box clustering merges touching pieces and keeps separate ones apart', () => {
  const box = (x0, x1) => new THREE.Box3(new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x1, 1, 1));
  assert.equal(clusterBoxes([box(0, 1), box(1.02, 2), box(5, 6)], .03).length, 2);
  // A later box can bridge two earlier zones.
  assert.equal(clusterBoxes([box(0, 1), box(2, 3), box(.99, 2.01)], .03).length, 1);
  assert.equal(clusterBoxes([new THREE.Box3()], .03).length, 0);
});

test('drag placement snaps over the target and follows the pointer elsewhere', () => {
  const installed = new THREE.Box3(new THREE.Vector3(-.5, 2, -.5), new THREE.Vector3(.5, 3, .5));
  const origin = new THREE.Vector3(0, 2.4, 0);
  const forward = new THREE.Vector3(0, 0, -1);
  const ray = (x, y) => new THREE.Ray(new THREE.Vector3(x, y, 10), forward.clone());
  const hit = dragPosition(ray(0, 2.5), forward, installed, origin, .1);
  assert.equal(hit.onTarget, true);
  assert(hit.position.equals(origin), 'the preview snaps to the exact install transform');
  const near = dragPosition(ray(.58, 2.5), forward, installed, origin, .1);
  assert.equal(near.onTarget, true, 'the margin keeps small targets reachable');
  const away = dragPosition(ray(3, 2.5), forward, installed, origin, .1);
  assert.equal(away.onTarget, false);
  assert(away.position.distanceTo(new THREE.Vector3(3, 2.4, 0)) < 1e-9, 'the part centre tracks the pointer at its installed depth');
  const parallel = dragPosition(new THREE.Ray(new THREE.Vector3(3, 2.5, 10), new THREE.Vector3(1, 0, 0)), forward, installed, origin, .1);
  assert.deepEqual(parallel, { onTarget: false, position: null });
  assert(!rayHitsZone(ray(.7, 2.5), installed, .1));
});

test('every part starts in the tray, so the workspace is empty at 0/10', () => {
  for (const id of PART_IDS) assert.equal(partLocation(id, [], {}), 'tray');
  assert.deepEqual(trayParts([], {}), PART_IDS);
  assert.equal(nextBuildStep([]), 'case', 'guidance still starts at the chassis');
});

test('a part is in exactly one place, and only installed parts count toward progress', () => {
  const installed = ['case', 'fans'];
  const loose = { psu: [1, 2, 3] };
  assert.equal(partLocation('case', installed, loose), 'installed');
  assert.equal(partLocation('psu', installed, loose), 'loose');
  assert.equal(partLocation('motherboard', installed, loose), 'tray');
  assert.deepEqual(trayParts(installed, loose).sort(), PART_IDS.filter((id) => !['case', 'fans', 'psu'].includes(id)).sort());
  // A loose part is still uninstalled: it neither unlocks its dependents nor moves the guided step on.
  assert.equal(canInstall('motherboard', installed), true);
  assert.equal(nextBuildStep(installed), 'psu');
  assert.equal(nextBuildStep([...installed, 'psu']), 'motherboard');
  assert.equal(partLocation('psu', [...installed, 'psu'], loose), 'installed', 'installing wins over a stale loose record');
});

test('removing a loose placement is immutable and a no-op when absent', () => {
  const loose = { psu: [1, 2, 3], fans: [4, 5, 6] };
  const next = withoutLoose(loose, 'psu');
  assert.deepEqual(next, { fans: [4, 5, 6] });
  assert.deepEqual(loose, { psu: [1, 2, 3], fans: [4, 5, 6] });
  assert.equal(withoutLoose(loose, 'gpu'), loose);
});

test('a loose part that loses a requirement, or gets installed, returns to the tray', () => {
  const base = ['case', 'fans', 'psu', 'motherboard', 'cpu'];
  const loose = { cooler: [0, 3, 1] };
  assert.equal(releaseUnavailableLoose(base, loose), loose, 'a still-installable loose part stays, same object');
  const afterRemoval = uninstallWithDependents('cpu', base);
  assert.deepEqual(releaseUnavailableLoose(afterRemoval, loose), {}, 'the cooler needs the CPU, so it goes back to the tray');
  assert.deepEqual(releaseUnavailableLoose([...base, 'cooler'], loose), {}, 'an installed part is no longer loose');
  const mixed = releaseUnavailableLoose(afterRemoval, { cooler: [0, 3, 1], ram: [1, 1, 1] });
  assert.deepEqual(Object.keys(mixed), ['ram'], 'only the part that lost its requirement is released');
});

test('a loose part dropped on its target installs, and elsewhere stays loose', () => {
  const installed = ['case', 'fans', 'psu', 'motherboard', 'cpu'];
  assert.deepEqual(resolveDrop('cooler', installed, { inside: true, onTarget: false }), { kind: 'missed' }, 'a retry that misses stays loose');
  assert.deepEqual(resolveDrop('cooler', installed, { inside: true, onTarget: true }), { kind: 'install' }, 'the retry on target installs');
  assert.deepEqual(resolveDrop('cooler', installed, { inside: false, onTarget: false }), { kind: 'cancelled' }, 'releasing outside the workspace leaves it where it was');
});

test('a released part rests on the workbench instead of sinking through it', () => {
  const floor = .015;
  const lifted = restAboveFloor(new THREE.Vector3(1, .2, 3), -.32, floor);
  assert.equal(lifted.y, floor + .32, 'its lowest point lands exactly on the floor');
  assert.deepEqual([lifted.x, lifted.z], [1, 3], 'only the height changes');
  const high = new THREE.Vector3(1, 4, 3);
  assert.equal(restAboveFloor(high, -.32, floor).y, 4, 'a part already above the floor is left exactly where it was released');
  assert.notEqual(restAboveFloor(high, -.32, floor), high, 'the input is not mutated');
  assert.equal(high.y, 4);
});

test('a grabbed part keeps the spot you grabbed under the pointer, with no jump on pick-up', () => {
  const installed = new THREE.Box3(new THREE.Vector3(-.5, 2, -.5), new THREE.Vector3(.5, 3, .5));
  const origin = new THREE.Vector3(0, 2.4, 0);
  const forward = new THREE.Vector3(0, 0, -1);
  // The part is loose at (5, 1, 2) and the user grabs it 0.3 right of and 0.2 above its origin.
  const resting = new THREE.Vector3(5, 1, 2);
  const grip = resting.clone().add(new THREE.Vector3(.3, .2, 0));
  const hold = { point: grip, offset: grip.clone().sub(resting) };
  const ray = (x, y) => new THREE.Ray(new THREE.Vector3(x, y, 10), forward.clone());
  const same = dragPosition(ray(grip.x, grip.y), forward, installed, origin, .1, hold);
  assert.equal(same.onTarget, false);
  assert(same.position.distanceTo(resting) < 1e-9, 'pressing and not moving leaves the part exactly where it was');
  const moved = dragPosition(ray(grip.x + 1, grip.y - .5), forward, installed, origin, .1, hold);
  assert(moved.position.distanceTo(new THREE.Vector3(6, .5, 2)) < 1e-9, 'it then follows the pointer by exactly the pointer’s travel');
  const centred = centerHold(installed, origin, origin);
  assert(centred.point.distanceTo(new THREE.Vector3(0, 2.5, 0)) < 1e-9, 'a tray drag holds the part by the centre of its installed bounds');
  assert(centred.offset.distanceTo(new THREE.Vector3(0, .1, 0)) < 1e-9);
  const onTarget = dragPosition(ray(0, 2.5), forward, installed, origin, .1, hold);
  assert.equal(onTarget.onTarget, true, 'pointing at the target snaps a grabbed part into the mount');
  assert(onTarget.position.equals(origin));
});
