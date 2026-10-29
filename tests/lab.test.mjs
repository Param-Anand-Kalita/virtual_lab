import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COMPONENTS, PART_IDS, REMOVAL_ORDER, removeWithDependencies, reinstallWithDependencies } from '../lib/components-data.ts';
import { createTower } from '../lib/tower.ts';
import { makeLabTools } from '../lib/webmcp.ts';

function assertValidAssembly(removed) {
  assert.equal(new Set(removed).size, removed.length, 'no duplicate parts');
  assert(!removed.includes('case'), 'the chassis remains in place');
  if (!removed.includes('panel')) assert.equal(removed.length, 0, 'internal removals require an open side');
  if (removed.includes('motherboard')) for (const part of ['cpu', 'cooler', 'gpu', 'ram', 'ssd']) assert(removed.includes(part), `${part} cannot float in an absent motherboard`);
  if (removed.includes('cpu')) assert(removed.includes('cooler'), 'cooler cannot remain on an absent CPU');
}

test('guided teardown and reverse assembly preserve physical support relationships', () => {
  let removed = [];
  for (const part of REMOVAL_ORDER) { removed = removeWithDependencies(part, removed); assertValidAssembly(removed); }
  assert.equal(removed.length, 9);
  for (const part of [...REMOVAL_ORDER].reverse()) { removed = reinstallWithDependencies(part, removed); assertValidAssembly(removed); }
  assert.deepEqual(removed, []);
});

test('arbitrary inspection removals and reinstalls preserve support relationships', () => {
  let removed = []; let seed = 27183;
  for (let step = 0; step < 1000; step++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const part = PART_IDS[seed % PART_IDS.length];
    removed = seed & 256 ? removeWithDependencies(part, removed) : reinstallWithDependencies(part, removed);
    assertValidAssembly(removed);
  }
});

test('CPU extraction moves its cooler and panel; motherboard extraction releases attached parts', () => {
  assert.deepEqual(new Set(removeWithDependencies('cpu', [])), new Set(['panel', 'cooler', 'cpu']));
  assert.deepEqual(new Set(removeWithDependencies('motherboard', [])), new Set(['panel', 'gpu', 'cooler', 'ram', 'ssd', 'cpu', 'motherboard']));
});

test('the render asset has every teaching part, finite geometry, pick tags and local label anchors', () => {
  const { root, parts, anchors } = createTower();
  assert.equal(root.children.length, 10);
  assert.deepEqual(Object.keys(parts).sort(), [...PART_IDS].sort());
  let triangles = 0, meshes = 0;
  for (const id of PART_IDS) {
    assert.equal(parts[id].parent, root);
    assert(anchors[id].isVector3);
    const box = new THREE.Box3().setFromObject(parts[id]);
    assert(!box.isEmpty());
    assert([...box.min, ...box.max].every(Number.isFinite));
    parts[id].traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      assert.equal(object.userData.partId, id);
      const positions = object.geometry.getAttribute('position');
      assert(positions.count > 0);
      for (let i = 0; i < positions.array.length; i++) assert(Number.isFinite(positions.array[i]));
      triangles += (object.geometry.index?.count || positions.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    });
  }
  assert(meshes < 500, 'mesh count stays bounded for classroom devices');
  assert(triangles < 160000, 'triangle count stays bounded for classroom devices');
  assert(parts.cpu.position.x < parts.cooler.position.x, 'cooler projects out from CPU');
  assert(parts.psu.position.y < parts.gpu.position.y, 'PSU below graphics card');
  assert(parts.fans.position.z > parts.motherboard.position.z, 'intake fans in front');
});

test('agent actions validate input before updating the same visible lab state', () => {
  let snapshot = { selected: null, removed: [], hidden: [], explode: 0, isolate: false, labels: false };
  const tools = makeLabTools({ read: () => snapshot, inspect: (id, isolate) => { snapshot = { ...snapshot, selected: id, isolate }; }, assemble: (explode) => { snapshot = { ...snapshot, explode, removed: [], isolate: false }; } });
  const inspect = tools.find((tool) => tool.name === 'inspect_pc_component');
  const space = tools.find((tool) => tool.name === 'set_pc_assembly_spacing');
  assert.equal(inspect.execute({ component: 'cpu', isolate: true }).selected, 'cpu');
  assert.equal(snapshot.isolate, true);
  const before = { ...snapshot };
  for (const input of [null, [], { component: 'invalid' }, { component: 'cpu', isolate: 'yes' }, { component: 'cpu', extra: true }]) assert.throws(() => inspect.execute(input));
  assert.deepEqual(snapshot, before);
  assert.equal(space.execute({ spacing: 85 }).explode, 85);
  for (const spacing of [-1, 101, NaN, Infinity, '50']) assert.throws(() => space.execute({ spacing }));
  assert.equal(snapshot.explode, 85);
  const read = tools.find((tool) => tool.name === 'read_pc_lab').execute({});
  assert.equal(read.components.length, COMPONENTS.length);
});
