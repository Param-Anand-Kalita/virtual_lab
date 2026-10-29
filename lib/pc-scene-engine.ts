import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createTower } from './tower';
import { COMPONENTS, PART_IDS, type PartId } from './components-data';
import { centerHold, clusterBoxes, dragPosition, meshBoxes, restAboveFloor, type Hold } from './drop-targets';
import type { LoosePlacements, Vec3 } from './assembly';

/**
 * `loose` places parts that were released away from their mount, and `frame: 'assembly'` frames the finished PC instead of
 * whichever parts are visible, so the camera stays put while parts appear, move and vanish. Both are optional: without
 * them the scene behaves exactly as Explore mode expects.
 */
export type SceneState = { selected: PartId | null; removed: PartId[]; hidden: PartId[]; explode: number; isolate: boolean; labels: boolean; autoRotate: boolean; loose?: LoosePlacements; frame?: 'visible' | 'assembly' };
/** Where the pointer is during a part drag: over the canvas at all, and over the part's own mount target. */
export type DragFeedback = { inside: boolean; onTarget: boolean };
/** How a drag ends: snap into the mount, stay loose where released, or go back to where the part came from. */
export type DragEnd = 'install' | 'loose' | 'cancel';
/** A drag starts from the tray (the part was hidden) or from a loose part already in the workspace. */
export type DragOrigin = 'tray' | 'loose';
/** Callbacks for a loose part picked up directly in the 3D scene. */
export type SceneHooks = {
  onGrab: (id: PartId) => void;
  onDragFeedback: (feedback: DragFeedback) => void;
  onDrop: (id: PartId, feedback: DragFeedback) => void;
};
export type SceneController = {
  setState: (state: SceneState) => void; view: (name: string) => void; zoom: (factor: number) => void; fit: () => void;
  beginDrag: (id: PartId, origin?: DragOrigin) => void; dragTo: (clientX: number, clientY: number) => DragFeedback;
  /** Ends the drag. `'loose'` returns the world position the part was left at, or null when there was nothing to leave. */
  endDrag: (end: DragEnd) => Vec3 | null;
  dispose: () => void;
};
/** Pieces of one part closer than this share a mount zone. */
const ZONE_GAP = .03;
/** Extra reach around the installed bounds that still counts as on target, so small parts stay easy to drop. */
const TARGET_MARGIN = .12;
/** Height of the workbench surface; released parts rest on it rather than sinking through. */
const FLOOR_Y = .015;
/** Pointer travel (px) before a press on a loose part becomes a drag rather than a click. */
const GRAB_THRESHOLD = 4;
/**
 * Scene colours follow the Blueprint Bench tokens in app/globals.css. Three.js cannot read CSS variables, so the
 * values are repeated here as hex: keep them in step with --bench, --rule-strong, --rule, --blueprint, --ok and --fault.
 */
const SCENE_COLORS = { background: 0xebf1f6, gridMajor: 0xb9c1ca, gridMinor: 0xd6dbe1, selection: 0x2466c3 };
/** Drop targets: blue while seeking, green over the part's own mount, red after a release away from it. */
const ZONE_COLORS = { seek: 0x2466c3, over: 0x1a763f, miss: 0xba2b28 };
export const EXPLODE_OFFSETS: Record<PartId, [number, number, number]> = {
  case: [0, 0, 0], panel: [4.5, 0, 0.4], motherboard: [-2.8, .45, -.8],
  cpu: [.3, 3.15, -1.6], cooler: [2.15, 1.65, -1.2], ram: [1.25, 1.4, 1.7],
  gpu: [2.6, -.15, .25], ssd: [2.95, .95, -2.4], psu: [1.2, 0, -3.1], fans: [0, .1, 2.7],
};

export function createPCScene(host: HTMLDivElement, onSelect: (id: PartId | null) => void, onContextLost: () => void, hooks?: SceneHooks): SceneController {
  let state: SceneState = { selected: null, removed: [], hidden: [], explode: 0, isolate: false, labels: false, autoRotate: false };
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_COLORS.background);
  const camera = new THREE.PerspectiveCamera(35, 1, .05, 150);
  camera.position.set(9, 6.4, 8);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive 3D desktop computer. Drag to rotate, scroll to zoom, arrow keys to pan, or select components using the component list.');
  host.appendChild(canvas);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2.3, 0);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = .085;
  controls.minDistance = .5;
  controls.maxDistance = 48;
  controls.maxPolarAngle = Math.PI * .94;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .7;
  controls.panSpeed = .7;
  controls.autoRotateSpeed = .55;
  controls.listenToKeyEvents(canvas);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .62;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb4b9ac, 1.65));
  const key = new THREE.DirectionalLight(0xfff7ee, 3.2);
  key.position.set(5, 10, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: .5, far: 35 });
  key.shadow.bias = -.00015; key.shadow.normalBias = .025;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe7efff, 1.8); fill.position.set(-5, 5, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 2.2); rim.position.set(1, 6, -7); scene.add(rim);

  const { root, parts, anchors } = createTower();
  scene.add(root);
  const origins = Object.fromEntries(PART_IDS.map((id) => [id, parts[id].position.clone()])) as Record<PartId, THREE.Vector3>;
  const offsets = Object.fromEntries(PART_IDS.map((id) => [id, new THREE.Vector3(...EXPLODE_OFFSETS[id])])) as Record<PartId, THREE.Vector3>;
  const targets = Object.fromEntries(PART_IDS.map((id) => [id, origins[id].clone()])) as Record<PartId, THREE.Vector3>;
  const localBounds = {} as Record<PartId, THREE.Box3>;
  // Mount targets are measured from each part's own meshes while it sits at its install transform.
  const installedBounds = {} as Record<PartId, THREE.Box3>;
  const mountZones = {} as Record<PartId, THREE.Box3[]>;
  root.updateMatrixWorld(true);
  for (const id of PART_IDS) {
    const boxes = meshBoxes(parts[id]);
    installedBounds[id] = boxes.reduce((all, box) => all.union(box), new THREE.Box3());
    mountZones[id] = clusterBoxes(boxes, ZONE_GAP);
    localBounds[id] = installedBounds[id].clone().translate(origins[id].clone().negate());
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.ShadowMaterial({ opacity: .13 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = FLOOR_Y; ground.receiveShadow = true; scene.add(ground);
  // A restrained measurement grid grounds the model on a virtual work surface.
  const grid = new THREE.GridHelper(30, 60, SCENE_COLORS.gridMajor, SCENE_COLORS.gridMinor);
  grid.position.y = .01;
  const gridMat = grid.material as THREE.Material; gridMat.transparent = true; gridMat.opacity = .19;
  scene.add(grid);

  const highlight = new THREE.Box3Helper(new THREE.Box3(), SCENE_COLORS.selection);
  (highlight.material as THREE.LineBasicMaterial).transparent = true;
  (highlight.material as THREE.LineBasicMaterial).opacity = .55;
  highlight.visible = false;
  scene.add(highlight);
  // Drop targets: a translucent fill per mount zone plus an outline that stays visible through the chassis.
  const zoneGeometry = new THREE.BoxGeometry(1, 1, 1);
  const zoneEdgeGeometry = new THREE.EdgesGeometry(zoneGeometry);
  const zoneFill = new THREE.MeshBasicMaterial({ color: ZONE_COLORS.seek, transparent: true, opacity: .16, depthWrite: false });
  const zoneEdge = new THREE.LineBasicMaterial({ color: ZONE_COLORS.seek, transparent: true, opacity: .8, depthTest: false });
  const targetGroup = new THREE.Group();
  targetGroup.visible = false;
  scene.add(targetGroup);
  const zoneMarkers = Array.from({ length: Math.max(...PART_IDS.map((id) => mountZones[id].length)) }, () => {
    const marker = new THREE.Group();
    const fill = new THREE.Mesh(zoneGeometry, zoneFill); fill.renderOrder = 9;
    const edge = new THREE.LineSegments(zoneEdgeGeometry, zoneEdge); edge.renderOrder = 10;
    marker.add(fill, edge); targetGroup.add(marker);
    return marker;
  });
  function showZones(id: PartId) {
    zoneMarkers.forEach((marker, i) => {
      const zone = mountZones[id][i];
      marker.visible = !!zone;
      if (zone) { zone.getCenter(marker.position); zone.getSize(marker.scale).addScalar(.025); }
    });
    targetGroup.visible = true;
  }
  let zoneMode: keyof typeof ZONE_COLORS = 'seek';
  function styleZones(mode: keyof typeof ZONE_COLORS) {
    zoneMode = mode;
    zoneFill.color.setHex(ZONE_COLORS[mode]); zoneEdge.color.setHex(ZONE_COLORS[mode]);
    zoneFill.opacity = mode === 'over' ? .32 : mode === 'miss' ? .24 : .16;
    zoneEdge.opacity = mode === 'seek' ? .8 : 1;
  }
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const meshes: THREE.Object3D[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object);
  });
  const labelsHost = document.createElement('div');
  labelsHost.className = 'scene-labels';
  host.appendChild(labelsHost);
  const labelElements = {} as Record<PartId, HTMLButtonElement>;
  for (const info of COMPONENTS) {
    const label = document.createElement('button');
    label.className = 'scene-label'; label.textContent = info.short; label.style.display = 'none';
    label.setAttribute('aria-label', `Explore ${info.name.toLowerCase()}`);
    label.addEventListener('click', () => onSelect(info.id));
    labelsHost.appendChild(label); labelElements[info.id] = label;
  }

  let cameraGoal: THREE.Vector3 | null = null;
  let targetGoal: THREE.Vector3 | null = null;
  let width = 1, height = 1;
  let disposed = false;
  let frameId = 0;
  let previousTime = performance.now();
  let dirty = true;
  let settleFrames = 0;
  // The dragged part itself is the preview. `position` is where it is being carried; `shown` is false while a tray drag is
  // off the canvas, so the part disappears there instead of flying back to a parking spot. `hold` is the point of the part
  // that stays under the pointer.
  let drag: { id: PartId; origin: DragOrigin; position: THREE.Vector3 | null; shown: boolean; hold: Hold } | null = null;
  // A just-released part keeps its rest position and stays visible until React delivers the state that accounts for it.
  const limbo = new Map<PartId, THREE.Vector3>();
  // A press on a loose part, from pointer-down until it ends as a click or becomes a drag.
  let grab: { id: PartId; pointerId: number; startX: number; startY: number; point: THREE.Vector3; active: boolean } | null = null;
  let flashUntil = 0;
  const viewDirection = new THREE.Vector3();
  const tempBox = new THREE.Box3();
  const bounds = new THREE.Box3();
  const targetPoint = new THREE.Vector3();
  const desiredDirection = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const corners: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());

  function fittedBounds() {
    bounds.makeEmpty();
    for (const id of PART_IDS) {
      // Assembly framing covers the finished PC, whatever is currently visible, so parts coming and going never move the camera.
      if (state.frame === 'assembly') { bounds.union(installedBounds[id]); continue; }
      if (state.hidden.includes(id) || (state.isolate && state.selected && id !== state.selected)) continue;
      tempBox.copy(localBounds[id]).translate(targets[id]); bounds.union(tempBox);
    }
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, .2, -2), new THREE.Vector3(1, 4.6, 2));
    return bounds;
  }
  function fit(direction?: THREE.Vector3, snap = false) {
    const box = fittedBounds();
    box.getCenter(targetPoint);
    desiredDirection.copy(direction || camera.position.clone().sub(controls.target)).normalize();
    right.crossVectors(new THREE.Vector3(0, 1, 0), desiredDirection).normalize();
    up.crossVectors(desiredDirection, right).normalize();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    for (let i = 0; i < 8; i++) {
      corners[i].set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(targetPoint);
      const depth = corners[i].dot(desiredDirection);
      distance = Math.max(distance, depth + Math.abs(corners[i].dot(right)) / (tan * camera.aspect), depth + Math.abs(corners[i].dot(up)) / tan);
    }
    distance = Math.max(.75, distance * 1.19);
    cameraGoal = targetPoint.clone().addScaledVector(desiredDirection, distance);
    targetGoal = targetPoint.clone();
    if (snap || reducedMotion) { camera.position.copy(cameraGoal); controls.target.copy(targetGoal); cameraGoal = null; targetGoal = null; controls.update(); }
    dirty = true;
  }
  // A resize that arrives while a part is held waits for the gesture to end: re-framing then would shift the scene under the pointer.
  let refitPending = false;
  const flushRefit = () => { if (refitPending && !drag && !grab) { refitPending = false; fit(undefined, true); } };
  const resizeObserver = new ResizeObserver(() => {
    width = host.clientWidth; height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (drag || grab) { refitPending = true; dirty = true; return; }
    fit(undefined, true);
  });
  resizeObserver.observe(host);

  function pick(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      const id = hit.object.userData.partId as PartId | undefined;
      if (!id || !parts[id].visible) continue;
      let ancestor: THREE.Object3D | null = hit.object;
      while (ancestor && ancestor.visible) ancestor = ancestor.parent;
      if (ancestor) continue;
      const material = (hit.object as THREE.Mesh).material;
      if (!Array.isArray(material) && material.transparent && material.opacity < .35) continue;
      return id;
    }
    return null;
  }
  // The ray hits invisible objects too, so a part only counts when it and every ancestor are actually drawn.
  const isRendered = (object: THREE.Object3D) => {
    let ancestor: THREE.Object3D | null = object;
    while (ancestor && ancestor.visible) ancestor = ancestor.parent;
    return !ancestor;
  };
  /** The loose part under the pointer, with the exact world point that was hit (so it can be carried by that point). */
  function pickLoose(event: PointerEvent): { id: PartId; point: THREE.Vector3 } | null {
    const loose = state.loose;
    if (!loose) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    // Only loose parts are candidates, so one can be grabbed even when it sits behind another part or the glass panel.
    const candidates = meshes.filter((mesh) => { const id = mesh.userData.partId as PartId | undefined; return !!id && !!loose[id] && isRendered(mesh); });
    const hit = candidates.length ? raycaster.intersectObjects(candidates, false)[0] : undefined;
    return hit ? { id: hit.object.userData.partId as PartId, point: hit.point.clone() } : null;
  }
  let downX = 0, downY = 0, dragged = false, multiTouch = false;
  const activePointers = new Set<number>();
  const pointerDown = (event: PointerEvent) => {
    activePointers.add(event.pointerId);
    if (activePointers.size === 1) { downX = event.clientX; downY = event.clientY; dragged = false; multiTouch = false; }
    else multiTouch = true;
    cameraGoal = null; targetGoal = null;
  };
  const pointerMove = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) dragged = true;
    if (!event.buttons) canvas.style.cursor = pick(event) ? 'pointer' : 'grab';
  };
  const pointerUp = (event: PointerEvent) => {
    if (activePointers.has(event.pointerId) && activePointers.size === 1 && !multiTouch && !dragged && event.button === 0) { const id = pick(event); if (id) onSelect(id); }
    activePointers.delete(event.pointerId);
  };
  const pointerCancel = (event: PointerEvent) => { activePointers.delete(event.pointerId); dragged = true; };
  // Picking up a loose part. This listens in the capture phase on the host, which runs before OrbitControls' own canvas
  // listener; stopping the event there, and disabling the controls, keeps the press from also orbiting the camera.
  const grabDown = (event: PointerEvent) => {
    // The selected part's label floats over it, so a press on a label still picks up the loose part underneath.
    const overScene = event.target === canvas || (event.target instanceof Element && !!event.target.closest('.scene-label'));
    if (!hooks || !overScene || event.button !== 0 || !event.isPrimary || drag || grab || !state.loose) return;
    const hit = pickLoose(event);
    if (!hit) return;
    event.stopPropagation();
    event.preventDefault();
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    grab = { id: hit.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, point: hit.point, active: false };
  };
  const grabMove = (event: PointerEvent) => {
    if (!grab || event.pointerId !== grab.pointerId) return;
    if (!grab.active) {
      if (Math.hypot(event.clientX - grab.startX, event.clientY - grab.startY) < GRAB_THRESHOLD) return;
      grab.active = true;
      startDrag(grab.id, 'loose', grab.point);
      hooks?.onGrab(grab.id);
    }
    hooks?.onDragFeedback(dragTo(event.clientX, event.clientY));
  };
  /** Ends a press on a loose part: a click selects it, a drag is handed to the app to resolve. */
  const grabEnd = (event: PointerEvent, cancelled: boolean) => {
    if (!grab || event.pointerId !== grab.pointerId) return;
    const gesture = grab;
    grab = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!gesture.active) {
      controls.enabled = true;
      flushRefit();
      if (!cancelled) onSelect(gesture.id);
      return;
    }
    const feedback = cancelled ? { inside: false, onTarget: false } : dragTo(event.clientX, event.clientY);
    if (hooks) hooks.onDrop(gesture.id, feedback); else endDrag('cancel');
  };
  const grabUp = (event: PointerEvent) => grabEnd(event, false);
  const grabCancel = (event: PointerEvent) => grabEnd(event, true);
  const keyDown = (event: KeyboardEvent) => {
    if (event.key.startsWith('Arrow')) { cameraGoal = null; targetGoal = null; dirty = true; }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(.8); }
    else if (event.key === '-') { event.preventDefault(); zoom(1.25); }
  };
  const interruptCamera = () => { cameraGoal = null; targetGoal = null; dirty = true; };
  const onControlChange = () => { dirty = true; };
  const contextLost = (event: Event) => { event.preventDefault(); onContextLost(); };
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  host.addEventListener('pointerdown', grabDown, true);
  canvas.addEventListener('pointermove', grabMove); canvas.addEventListener('pointerup', grabUp);
  canvas.addEventListener('pointercancel', grabCancel); canvas.addEventListener('lostpointercapture', grabCancel);
  canvas.addEventListener('keydown', keyDown); canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('wheel', interruptCamera, { passive: true });
  controls.addEventListener('change', onControlChange);
  const motionChange = () => { reducedMotion = motionQuery.matches; controls.enableDamping = !reducedMotion; dirty = true; };
  motionQuery.addEventListener('change', motionChange);

  const labelPoint = new THREE.Vector3();
  function updateLabels() {
    const occupied: { x: number; y: number; width: number }[] = [];
    // Keep the selected label first, so collision culling never hides it.
    const ordered = state.selected ? [state.selected, ...PART_IDS.filter((id) => id !== state.selected)] : PART_IDS;
    for (const id of ordered) {
      const label = labelElements[id];
      if (!parts[id].visible || (!state.labels && state.selected !== id)) { label.style.display = 'none'; continue; }
      labelPoint.copy(anchors[id]); parts[id].localToWorld(labelPoint); labelPoint.project(camera);
      if (labelPoint.z > 1 || labelPoint.z < -1) { label.style.display = 'none'; continue; }
      let x = (labelPoint.x * .5 + .5) * width;
      let y = (-labelPoint.y * .5 + .5) * height - 14;
      const labelWidth = COMPONENTS.find((part) => part.id === id)!.short.length * 6 + 29;
      x = Math.max(labelWidth / 2 + 8, Math.min(width - labelWidth / 2 - 8, x));
      y = Math.max(30, Math.min(height - 28, y));
      for (const other of occupied) {
        if (Math.abs(other.x - x) < (other.width + labelWidth) / 2 + 5 && Math.abs(other.y - y) < 28) y = other.y + 29;
      }
      if (y > height - 20) { label.style.display = 'none'; continue; }
      occupied.push({ x, y, width: labelWidth });
      label.style.display = 'block'; label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      label.classList.toggle('selected', id === state.selected);
    }
  }
  function animate(time: number) {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);
    if (document.hidden) { previousTime = time; return; }
    const dt = Math.min((time - previousTime) / 1000, .05); previousTime = time;
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    const dragAlpha = reducedMotion ? 1 : 1 - Math.exp(-dt * 24);
    let changing = false;
    for (const id of PART_IDS) {
      if (parts[id].position.distanceToSquared(targets[id]) > .000001) { parts[id].position.lerp(targets[id], drag?.id === id ? dragAlpha : alpha); changing = true; }
      else parts[id].position.copy(targets[id]);
    }
    if (flashUntil && !drag && time >= flashUntil) { flashUntil = 0; targetGroup.visible = false; dirty = true; }
    if (drag || flashUntil) {
      if (drag && !reducedMotion && zoneMode === 'seek') zoneFill.opacity = .16 + .06 * Math.sin(time / 240);
      changing = true;
    }
    if (cameraGoal && targetGoal) {
      camera.position.lerp(cameraGoal, alpha); controls.target.lerp(targetGoal, alpha); changing = true;
      if (camera.position.distanceToSquared(cameraGoal) < .00001 && controls.target.distanceToSquared(targetGoal) < .00001) { cameraGoal = null; targetGoal = null; }
    }
    controls.autoRotate = state.autoRotate && !reducedMotion && !drag;
    controls.update(dt);
    if (changing || dirty || controls.autoRotate || settleFrames > 0) {
      root.updateMatrixWorld(true);
      if (!drag && state.selected && parts[state.selected].visible && !state.isolate) {
        highlight.box.copy(localBounds[state.selected]).translate(parts[state.selected].position).expandByScalar(.025); highlight.visible = true;
      } else highlight.visible = false;
      updateLabels(); renderer.render(scene, camera);
      dirty = false; settleFrames = changing ? 3 : Math.max(0, settleFrames - 1);
    }
  }
  function zoom(factor: number) {
    cameraGoal = camera.position.clone().sub(controls.target).multiplyScalar(factor);
    const distance = THREE.MathUtils.clamp(cameraGoal.length(), controls.minDistance, controls.maxDistance);
    cameraGoal.setLength(distance).add(controls.target);
    targetGoal = controls.target.clone(); dirty = true;
  }
  /** Where a part rests when it is not being carried: just released, loose in the workspace, or its tray/explode pose. */
  function placeTarget(id: PartId) {
    if (drag?.id === id) { if (drag.position) targets[id].copy(drag.position); return; }
    const released = limbo.get(id);
    if (released) { targets[id].copy(released); return; }
    const loose = state.loose?.[id];
    if (loose) { targets[id].set(...loose); return; }
    targets[id].copy(origins[id]).addScaledVector(offsets[id], state.removed.includes(id) ? 1 : state.explode);
  }
  function isShown(id: PartId) {
    if (drag?.id === id) return drag.shown;
    if (limbo.has(id)) return true;
    return !state.hidden.includes(id) && (!state.isolate || !state.selected || id === state.selected);
  }
  function applyVisibility() { for (const id of PART_IDS) parts[id].visible = isShown(id); }
  function startDrag(id: PartId, requested: DragOrigin, grip?: THREE.Vector3) {
    if (drag) endDrag('cancel');
    const rest = requested === 'loose' ? limbo.get(id) ?? (state.loose?.[id] ? new THREE.Vector3(...state.loose[id]) : null) : null;
    const at = rest ?? origins[id];
    const hold = grip ? { point: grip.clone(), offset: grip.clone().sub(at) } : centerHold(installedBounds[id], origins[id], at);
    drag = { id, origin: rest ? 'loose' : 'tray', position: rest ? rest.clone() : null, shown: !!rest, hold };
    limbo.delete(id);
    // The gesture belongs to the part: no orbiting, panning, zooming or camera tweening underneath it.
    controls.enabled = false; cameraGoal = null; targetGoal = null;
    flashUntil = 0; styleZones('seek'); showZones(id); applyVisibility(); dirty = true;
  }
  function dragTo(clientX: number, clientY: number): DragFeedback {
    if (!drag) return { inside: false, onTarget: false };
    const rect = canvas.getBoundingClientRect();
    const inside = rect.width > 0 && rect.height > 0 && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    let onTarget = false;
    if (inside) {
      pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      camera.getWorldDirection(viewDirection);
      const placement = dragPosition(raycaster.ray, viewDirection, installedBounds[drag.id], origins[drag.id], TARGET_MARGIN, drag.hold);
      onTarget = placement.onTarget;
      if (placement.position) {
        // Clamping while carrying means what you see is exactly what stays when you let go.
        drag.position = onTarget ? placement.position : restAboveFloor(placement.position, localBounds[drag.id].min.y, FLOOR_Y);
        if (!drag.shown) {
          // A tray part appears under the pointer instead of flying in from somewhere else.
          drag.shown = true; placeTarget(drag.id); parts[drag.id].position.copy(targets[drag.id]);
        }
      }
    } else if (drag.origin === 'tray') drag.shown = false;
    placeTarget(drag.id); applyVisibility(); styleZones(onTarget ? 'over' : 'seek'); dirty = true;
    return { inside, onTarget };
  }
  function endDrag(end: DragEnd): Vec3 | null {
    if (!drag) return null;
    const { id, position } = drag;
    drag = null; controls.enabled = true;
    // Any press that was carrying the part is over, so a later pointer-up cannot act on it.
    if (grab) { if (canvas.hasPointerCapture(grab.pointerId)) canvas.releasePointerCapture(grab.pointerId); grab = null; }
    let rest: Vec3 | null = null;
    if (end === 'install') limbo.set(id, origins[id].clone());
    else if (end === 'loose' && position) {
      const left = restAboveFloor(position, localBounds[id].min.y, FLOOR_Y);
      limbo.set(id, left); rest = [left.x, left.y, left.z];
    }
    // Cancel needs no override: a tray part goes back to hidden and a loose part back to its recorded spot.
    placeTarget(id); applyVisibility();
    if (end === 'loose' && rest) { styleZones('miss'); flashUntil = performance.now() + 650; } else targetGroup.visible = false;
    flushRefit();
    dirty = true;
    return rest;
  }
  function setState(next: SceneState) {
    const framing = next.frame ?? 'visible';
    // Assembly framing is fixed to the finished PC, so only a visible-parts frame re-fits when parts come and go.
    const shouldFit = (state.frame ?? 'visible') !== framing || state.explode !== next.explode || state.isolate !== next.isolate || (next.isolate && state.selected !== next.selected)
      || (framing === 'visible' && (state.removed.join() !== next.removed.join() || state.hidden.join() !== next.hidden.join()));
    state = { ...next };
    // Once the new state accounts for a released part (installed or loose), it no longer needs the temporary override.
    for (const id of limbo.keys()) if (!state.hidden.includes(id) || state.loose?.[id]) limbo.delete(id);
    for (const id of PART_IDS) {
      const amount = state.removed.includes(id) ? 1 : state.explode;
      placeTarget(id);
      // Cables disappear while parts separate: connector routing is intentionally schematic.
      parts[id].traverse((object) => { if (object.userData.isCable) object.visible = amount < .02 && state.removed.length === 0 && !state.isolate; });
    }
    applyVisibility();
    ground.visible = !state.isolate; grid.visible = !state.isolate;
    if (shouldFit) fit();
    dirty = true;
  }
  fit(new THREE.Vector3(1.2, .54, 1), true);
  frameId = requestAnimationFrame(animate);
  return {
    setState, fit: () => fit(), zoom, dragTo, endDrag,
    beginDrag: (id, origin = 'tray') => startDrag(id, origin),
    view: (name) => { const directions: Record<string, THREE.Vector3> = { perspective: new THREE.Vector3(1.2, .54, 1), side: new THREE.Vector3(1, .05, 0), front: new THREE.Vector3(.02, .03, 1) }; fit(directions[name] || directions.perspective); },
    dispose: () => {
      disposed = true; cancelAnimationFrame(frameId); resizeObserver.disconnect();
      motionQuery.removeEventListener('change', motionChange);
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerCancel);
      host.removeEventListener('pointerdown', grabDown, true);
      canvas.removeEventListener('pointermove', grabMove); canvas.removeEventListener('pointerup', grabUp);
      canvas.removeEventListener('pointercancel', grabCancel); canvas.removeEventListener('lostpointercapture', grabCancel);
      limbo.clear(); drag = null; grab = null;
      canvas.removeEventListener('keydown', keyDown); canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('wheel', interruptCamera);
      controls.removeEventListener('change', onControlChange); controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
      scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); } });
      geometries.forEach((geometry) => geometry.dispose()); textures.forEach((texture) => texture.dispose()); materials.forEach((material) => material.dispose());
      environment.dispose(); key.shadow.dispose(); renderer.dispose(); canvas.remove(); labelsHost.remove();
    },
  };
}
