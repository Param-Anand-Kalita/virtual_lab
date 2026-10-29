import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type PartId = 'case' | 'panel' | 'motherboard' | 'cpu' | 'cooler' | 'ram' | 'gpu' | 'ssd' | 'psu' | 'fans';

type V3 = [number, number, number];
type Pose = { p: V3; s?: V3; r?: V3 };
type Mat = THREE.Material;

/** A millimetre-inspired, entirely procedural mid-tower. Front is +Z, glass side is +X. */
export function createTower(): {
  root: THREE.Group;
  parts: Record<PartId, THREE.Group>;
  anchors: Record<PartId, THREE.Vector3>;
} {
  const root = new THREE.Group();
  root.name = 'Precision mid-tower';
  const parts = {} as Record<PartId, THREE.Group>;
  const anchors = {} as Record<PartId, THREE.Vector3>;

  const material = (color: THREE.ColorRepresentation, metalness = 0, roughness = 0.5) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const m = {
    shell: material('#dcdedb', 0.43, 0.39),
    shellEdge: material('#b7bcb9', 0.58, 0.36),
    shellBright: material('#f0f0ea', 0.30, 0.37),
    frame: material('#323736', 0.60, 0.40),
    black: material('#111615', 0.20, 0.52),
    rubber: material('#111413', 0.04, 0.83),
    graphite: material('#292f2e', 0.67, 0.40),
    darkMetal: material('#3c4543', 0.85, 0.37),
    silver: material('#acb7b5', 0.91, 0.29),
    silverBright: material('#dae0dc', 0.94, 0.24),
    fins: material('#b4c1bd', 0.90, 0.32),
    copper: material('#ba7844', 0.88, 0.28),
    gold: material('#c6a353', 0.77, 0.36),
    pcb: material('#172b26', 0.30, 0.63),
    pcbDark: material('#1b2421', 0.28, 0.65),
    chip: material('#1c201f', 0.16, 0.66),
    socket: material('#343b36', 0.28, 0.47),
    white: material('#dedfd6', 0.10, 0.48),
    blue: material('#357d87', 0.22, 0.43),
    lightBar: new THREE.MeshStandardMaterial({ color: '#d7e1cf', emissive: '#bacda7', emissiveIntensity: 0.10, roughness: 0.40 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#a9c1b6', transparent: true, opacity: 0.145, roughness: 0.10, metalness: 0.02, depthWrite: false, side: THREE.DoubleSide }),
  };

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
  const roundedCache = new Map<string, THREE.BufferGeometry>();
  const vec = new THREE.Vector3(), sca = new THREE.Vector3(), qua = new THREE.Quaternion(), eul = new THREE.Euler(), matrix = new THREE.Matrix4();

  function part(id: PartId, p: V3, anchor: V3) {
    const g = new THREE.Group();
    g.name = id;
    g.position.set(...p);
    g.userData.partId = id;
    root.add(g);
    parts[id] = g;
    anchors[id] = new THREE.Vector3(...anchor);
    return g;
  }

  function mesh(g: THREE.Group, geometry: THREE.BufferGeometry, mat: Mat, p: V3, r?: V3) {
    const o = new THREE.Mesh(geometry, mat);
    o.position.set(...p);
    if (r) o.rotation.set(...r);
    o.castShadow = mat !== m.glass;
    o.receiveShadow = true;
    g.add(o);
    return o;
  }

  function box(g: THREE.Group, p: V3, size: V3, mat: Mat, radius = 0) {
    if (!radius) {
      const o = mesh(g, unitBox, mat, p);
      o.scale.set(...size);
      return o;
    }
    const key = [...size, radius].join('/');
    let geo = roundedCache.get(key);
    if (!geo) {
      geo = new RoundedBoxGeometry(...size, 2, radius);
      roundedCache.set(key, geo);
    }
    return mesh(g, geo, mat, p);
  }

  function batch(g: THREE.Group, geo: THREE.BufferGeometry, mat: Mat, poses: Pose[]) {
    if (!poses.length) return;
    const im = new THREE.InstancedMesh(geo, mat, poses.length);
    poses.forEach((pose, i) => {
      vec.set(...pose.p);
      sca.set(...(pose.s || [1, 1, 1] as V3));
      eul.set(...(pose.r || [0, 0, 0] as V3));
      qua.setFromEuler(eul);
      matrix.compose(vec, qua, sca);
      im.setMatrixAt(i, matrix);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
    return im;
  }

  function cylinder(g: THREE.Group, p: V3, radius: number, length: number, mat: Mat, axis: 'x' | 'y' | 'z' = 'y', radialSegments = 24) {
    const geo = radialSegments === 16 ? unitCylinder : new THREE.CylinderGeometry(1, 1, 1, radialSegments, 1);
    const o = mesh(g, geo, mat, p);
    o.scale.set(radius, length, radius);
    if (axis === 'x') o.rotation.z = -Math.PI / 2;
    if (axis === 'z') o.rotation.x = Math.PI / 2;
    return o;
  }

  function ring(g: THREE.Group, p: V3, radius: number, tube: number, mat: Mat, axis: 'x' | 'y' | 'z' = 'z', segments = 48) {
    return mesh(g, new THREE.TorusGeometry(radius, tube, 5, segments), mat, p,
      axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [-Math.PI / 2, 0, 0] : undefined);
  }

  function screws(g: THREE.Group, points: V3[], axis: 'x' | 'y' | 'z' = 'x', radius = 0.029, dark = false) {
    const r: V3 = axis === 'x' ? [0, 0, -Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    batch(g, unitCylinder, dark ? m.darkMetal : m.silver, points.map(p => ({ p, s: [radius, 0.014, radius], r })));
    const offset = axis === 'x' ? [0.008, 0, 0] : axis === 'y' ? [0, 0.008, 0] : [0, 0, 0.008];
    const size: V3 = axis === 'x' ? [0.002, radius * 1.1, 0.006] : axis === 'y' ? [radius * 1.1, 0.002, 0.006] : [radius * 1.1, 0.006, 0.002];
    batch(g, unitBox, m.black, points.map(p => ({ p: [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]], s: size })));
  }

  function tube(g: THREE.Group, points: V3[], radius: number, mat: Mat, segments = 36) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(g, new THREE.TubeGeometry(path, segments, radius, 7, false), mat, [0, 0, 0]);
  }

  function label(g: THREE.Group, p: V3, width: number, height: number, lines: string[], options: { axis?: 'x' | 'y' | 'z'; color?: string; background?: string; small?: boolean } = {}) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (options.background) {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.fillStyle = options.color || '#cbd1cc';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      const fontSize = lines.length === 1 ? 96 : i === 0 ? 75 : 43;
      ctx.font = `${i === 0 ? 600 : 400} ${fontSize}px ${options.small ? 'monospace' : 'Arial, sans-serif'}`;
      ctx.fillText(line, 26, lines.length === 1 ? 135 : 75 + i * 78);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.68, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const o = mesh(g, new THREE.PlaneGeometry(width, height), mat, p,
      options.axis === 'x' ? [0, Math.PI / 2, 0] : options.axis === 'y' ? [-Math.PI / 2, 0, 0] : undefined);
    o.castShadow = false;
    return o;
  }

  // The shared fan blade has a broad swept trailing edge, a narrow root, and true depth.
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.065, 0.19);
  bladeShape.bezierCurveTo(0.37, 0.22, 0.69, 0.49, 0.59, 0.81);
  bladeShape.bezierCurveTo(0.37, 0.94, 0.09, 0.87, -0.025, 0.67);
  bladeShape.bezierCurveTo(0.16, 0.55, 0.10, 0.30, 0.065, 0.19);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.055, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, steps: 1, curveSegments: 8 });

  function fan(g: THREE.Group, p: V3, size: number, r: V3 = [0, 0, 0], framed = true, hubLabel = false) {
    const f = new THREE.Group();
    f.position.set(...p);
    f.rotation.set(...r);
    g.add(f);
    const radius = size * 0.435;
    if (framed) {
      const edge = size / 2, corner = size * 0.075;
      const s = new THREE.Shape();
      s.moveTo(-edge + corner, -edge);
      s.lineTo(edge - corner, -edge); s.quadraticCurveTo(edge, -edge, edge, -edge + corner);
      s.lineTo(edge, edge - corner); s.quadraticCurveTo(edge, edge, edge - corner, edge);
      s.lineTo(-edge + corner, edge); s.quadraticCurveTo(-edge, edge, -edge, edge - corner);
      s.lineTo(-edge, -edge + corner); s.quadraticCurveTo(-edge, -edge, -edge + corner, -edge);
      const hole = new THREE.Path();
      hole.absarc(0, 0, radius * 1.075, 0, Math.PI * 2, true);
      s.holes.push(hole);
      mesh(f, new THREE.ExtrudeGeometry(s, { depth: size * 0.11, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 24 }), m.black, [0, 0, -size * 0.055]);
      const corners: V3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        box(f, [x * size * 0.43, y * size * 0.43, 0.025], [size * 0.15, size * 0.15, size * 0.16], m.rubber, 0.025);
        corners.push([x * size * 0.425, y * size * 0.425, size * 0.115]);
      }
      screws(f, corners, 'z', size * 0.027, true);
    }
    ring(f, [0, 0, 0.015], radius * 1.035, size * 0.021, m.graphite);
    ring(f, [0, 0, -size * 0.057], radius * 1.035, size * 0.027, m.black);
    const fanBlades: Pose[] = [];
    for (let i = 0; i < 9; i++) fanBlades.push({ p: [0, 0, 0.008], s: [radius, radius, radius], r: [0, 0, i * Math.PI * 2 / 9] });
    batch(f, bladeGeo, m.graphite, fanBlades);
    const struts: Pose[] = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.20;
      struts.push({ p: [Math.cos(a) * radius * 0.58, Math.sin(a) * radius * 0.58, -size * 0.055], s: [radius * 0.86, size * 0.035, size * 0.035], r: [0, 0, a] });
    }
    batch(f, unitBox, m.black, struts);
    cylinder(f, [0, 0, 0.035], size * 0.132, size * 0.125, m.black, 'z', 32);
    cylinder(f, [0, 0, size * 0.10], size * 0.107, 0.008, m.darkMetal, 'z', 32);
    if (hubLabel) {
      label(f, [-size * 0.064, -size * 0.005, size * 0.108], size * 0.17, size * 0.055, ['AIR'], { color: '#abb4ae' });
    }
    return f;
  }

  // CHASSIS — a real open side with thin folded rails, a perforated front and a closed far side.
  const chassis = part('case', [0, 2.425, 0], [1.025, 1.91, 1.74]);
  const cy = (y: number) => y - 2.425;
  box(chassis, [0, cy(0.39), 0], [2.13, 0.095, 3.96], m.shell, 0.025);
  box(chassis, [0, cy(4.605), 0], [2.15, 0.09, 4.0], m.shell, 0.03);
  box(chassis, [-1.054, cy(2.51), 0], [0.055, 4.11, 3.95], m.shell, 0.018);
  box(chassis, [-0.88, cy(2.99), -0.28], [0.046, 3.15, 2.76], m.shellEdge, 0.025);
  const railPoses: Pose[] = [];
  for (const x of [-1.012, 1.012]) for (const z of [-1.908, 1.908]) {
    railPoses.push({ p: [x, cy(2.51), z], s: [0.09, 4.12, 0.095] });
    railPoses.push({ p: [x - Math.sign(x) * 0.053, cy(2.51), z], s: [0.095, 4.12, 0.025] });
  }
  for (const x of [-1.012, 1.012]) {
    railPoses.push({ p: [x, cy(0.52), 0], s: [0.09, 0.20, 3.91] });
    railPoses.push({ p: [x, cy(4.50), 0], s: [0.09, 0.14, 3.91] });
  }
  batch(chassis, unitBox, m.shell, railPoses);
  // Front bezel: proud of its inset black mesh by a few millimetres.
  box(chassis, [-0.998, cy(2.56), 2.008], [0.135, 4.04, 0.095], m.shellBright, 0.024);
  box(chassis, [0.998, cy(2.56), 2.008], [0.135, 4.04, 0.095], m.shellBright, 0.024);
  box(chassis, [0, cy(4.526), 2.008], [1.99, 0.12, 0.095], m.shellBright, 0.020);
  box(chassis, [0, cy(0.576), 2.008], [1.99, 0.16, 0.095], m.shellBright, 0.020);
  const weave: Pose[] = [];
  for (let y = 0.682; y < 4.45; y += 0.050) weave.push({ p: [0, cy(y), 1.984], s: [1.866, 0.011, 0.012] });
  for (let x = -0.912; x <= 0.92; x += 0.045) weave.push({ p: [x, cy(2.56), 1.992], s: [0.010, 3.76, 0.012] });
  batch(chassis, unitBox, m.frame, weave);
  box(chassis, [0, cy(0.715), 2.002], [0.25, 0.025, 0.016], m.shellEdge, 0.004);

  // Rear skeleton and individual expansion slot covers leave the interior legible.
  box(chassis, [0, cy(4.44), -1.985], [1.98, 0.22, 0.06], m.shell);
  box(chassis, [-0.86, cy(3.42), -1.984], [0.32, 1.85, 0.055], m.shell);
  box(chassis, [0.85, cy(3.40), -1.984], [0.32, 1.90, 0.055], m.shell);
  box(chassis, [0, cy(2.55), -1.984], [1.83, 0.12, 0.055], m.shell);
  box(chassis, [0, cy(1.385), -1.984], [1.98, 0.11, 0.055], m.shell);
  box(chassis, [-0.96, cy(0.91), -1.984], [0.10, 0.91, 0.055], m.shell);
  box(chassis, [0.96, cy(0.91), -1.984], [0.10, 0.91, 0.055], m.shell);
  const slotMetal: Pose[] = [], slotSlits: Pose[] = [];
  for (let j = 0; j < 6; j++) {
    const y = 1.57 + j * 0.142;
    if (j === 3 || j === 4) continue;
    slotMetal.push({ p: [0.04, cy(y), -1.965], s: [1.58, 0.112, 0.028] });
    for (let k = 0; k < 10; k++) slotSlits.push({ p: [-0.60 + k * 0.14, cy(y), -1.984], s: [0.091, 0.045, 0.006] });
  }
  batch(chassis, unitBox, m.shellEdge, slotMetal);
  batch(chassis, unitBox, m.black, slotSlits);
  // Recessed top dust filter, with its own fine staggered perforations.
  box(chassis, [0, cy(4.659), -0.36], [1.72, 0.008, 2.72], m.frame, 0.06);
  const topSlits: Pose[] = [];
  for (let row = 0; row < 26; row++) for (let column = 0; column < 12; column++) {
    topSlits.push({ p: [-0.75 + column * 0.136 + (row % 2) * 0.028, cy(4.664), -1.60 + row * 0.095], s: [0.071, 0.003, 0.024] });
  }
  batch(chassis, unitBox, m.black, topSlits);
  // Accessible front/top I/O rather than decorative floating buttons.
  cylinder(chassis, [0.60, cy(4.665), 1.64], 0.078, 0.015, m.graphite, 'y');
  ring(chassis, [0.60, cy(4.675), 1.64], 0.051, 0.0038, m.shellBright, 'y', 32);
  box(chassis, [0.60, cy(4.681), 1.599], [0.006, 0.005, 0.041], m.shellBright);
  for (const x of [-0.16, 0.13]) {
    box(chassis, [x, cy(4.656), 1.65], [0.165, 0.025, 0.073], m.black, 0.010);
    box(chassis, [x, cy(4.672), 1.65], [0.114, 0.012, 0.027], m.blue, 0.003);
  }
  box(chassis, [-0.43, cy(4.667), 1.65], [0.111, 0.010, 0.049], m.black, 0.021);
  cylinder(chassis, [-0.69, cy(4.665), 1.65], 0.035, 0.01, m.black, 'y');
  for (const x of [-0.78, 0.78]) for (const z of [-1.50, 1.48]) {
    box(chassis, [x, cy(0.292), z], [0.37, 0.14, 0.51], m.rubber, 0.045);
    box(chassis, [x, cy(0.37), z], [0.40, 0.048, 0.54], m.frame, 0.018);
  }
  screws(chassis, [[1.063, cy(0.66), -1.77], [1.063, cy(0.66), 1.77], [1.063, cy(4.42), -1.77], [1.063, cy(4.42), 1.77]], 'x', 0.03);
  // Dark cable pass-throughs sit behind the mainboard's right edge.
  for (const y of [1.98, 2.77, 3.64]) {
    box(chassis, [-0.847, cy(y), 1.22], [0.035, 0.49, 0.23], m.rubber, 0.055);
    box(chassis, [-0.824, cy(y), 1.22], [0.006, 0.39, 0.015], m.black);
  }

  // GLASS SIDE — exceptionally light tint; frame is only a narrow border.
  const panel = part('panel', [1.091, 2.505, 0], [0.027, 1.33, 1.40]);
  const pane = box(panel, [0, 0, 0], [0.021, 3.88, 3.73], m.glass, 0.008);
  pane.renderOrder = 8;
  box(panel, [0.001, -1.956, 0], [0.037, 0.060, 3.86], m.graphite, 0.006);
  box(panel, [0.001, 1.956, 0], [0.037, 0.060, 3.86], m.graphite, 0.006);
  box(panel, [0.001, 0, -1.914], [0.037, 3.91, 0.042], m.graphite, 0.006);
  box(panel, [0.001, 0, 1.914], [0.037, 3.91, 0.042], m.graphite, 0.006);
  screws(panel, [[0.039, -1.844, -1.805], [0.039, -1.844, 1.805], [0.039, 1.844, -1.805], [0.039, 1.844, 1.805]], 'x', 0.046, true);

  // MOTHERBOARD — the PCB and hardware all inhabit the YZ plane, facing the glass.
  const motherboard = part('motherboard', [-0.78, 2.92, -0.35], [0.16, 1.31, 1.02]);
  box(motherboard, [0, 0, 0], [0.07, 3.05, 2.44], m.pcbDark, 0.019);
  box(motherboard, [-0.04, 0, 0], [0.012, 3.02, 2.41], m.pcb);
  const traceVertices: number[] = [];
  for (let i = 0; i < 44; i++) {
    const y = -1.32 + (i % 15) * 0.18;
    const z = -1.06 + Math.floor(i / 15) * 0.62;
    const dy = 0.04 + (i % 4) * 0.028;
    const dz = 0.21 + (i % 3) * 0.072;
    traceVertices.push(0.038, y, z, 0.038, y, z + dz, 0.038, y, z + dz, 0.038, y + dy, z + dz + dy, 0.038, y + dy, z + dz + dy, 0.038, y + dy + 0.085, z + dz + dy);
  }
  const traceGeometry = new THREE.BufferGeometry();
  traceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(traceVertices, 3));
  motherboard.add(new THREE.LineSegments(traceGeometry, new THREE.LineBasicMaterial({ color: '#516155', transparent: true, opacity: 0.48 })));
  const boardScrews: V3[] = [];
  for (const y of [-1.41, 0, 1.41]) for (const z of [-1.09, 1.09]) boardScrews.push([0.052, y, z]);
  boardScrews.push([0.052, -1.41, 0]);
  for (const p of boardScrews) cylinder(motherboard, [0.037, p[1], p[2]], 0.058, 0.012, m.gold, 'x', 16);
  screws(motherboard, boardScrews, 'x', 0.033);
  // Socket retention frame remains on the board when the processor is lifted away.
  box(motherboard, [0.087, 0.68, -0.25], [0.104, 0.71, 0.73], m.socket, 0.030);
  box(motherboard, [0.151, 0.68, -0.25], [0.028, 0.615, 0.64], m.silver, 0.02);
  box(motherboard, [0.168, 0.68, -0.25], [0.012, 0.53, 0.53], m.black);
  screws(motherboard, [[0.18, 0.965, -0.54], [0.18, 0.395, -0.54], [0.18, 0.965, 0.04], [0.18, 0.395, 0.04]], 'x', 0.025);
  tube(motherboard, [[0.18, 0.36, -0.64], [0.18, 0.99, -0.64], [0.18, 1.04, -0.55], [0.18, 1.03, -0.42]], 0.011, m.silverBright, 16);
  // Rear I/O / VRM armour and short, tightly spaced aluminum fins.
  box(motherboard, [0.205, 0.86, -0.945], [0.29, 1.31, 0.37], m.darkMetal, 0.027);
  box(motherboard, [0.19, 1.295, -0.27], [0.27, 0.31, 1.01], m.silver, 0.018);
  const vrmFins: Pose[] = [];
  for (let i = 0; i < 15; i++) vrmFins.push({ p: [0.371, 0.29 + i * 0.078, -0.945], s: [0.068, 0.028, 0.34] });
  for (let i = 0; i < 15; i++) vrmFins.push({ p: [0.345, 1.295, -0.72 + i * 0.064], s: [0.075, 0.277, 0.021] });
  batch(motherboard, unitBox, m.silver, vrmFins);
  label(motherboard, [0.412, 0.82, -0.951], 0.31, 0.105, ['PRO SERIES'], { axis: 'x', color: '#e0e4de', small: true });
  const ports = new THREE.Group();
  ports.position.set(0.10, 0.18, -1.30);
  motherboard.add(ports);
  box(ports, [0.025, 0.33, -0.052], [0.43, 1.85, 0.04], m.silver, 0.012);
  for (let i = 0; i < 4; i++) {
    box(ports, [0.02, -0.41 + i * 0.33, -0.08], [0.31, 0.24, 0.24], m.silver, 0.010);
    box(ports, [0.02, -0.41 + i * 0.33, -0.205], [0.235, 0.14, 0.012], m.black, 0.005);
    box(ports, [0.02, -0.41 + i * 0.33, -0.214], [0.18, 0.032, 0.006], i < 2 ? m.blue : m.frame);
  }
  box(ports, [0.02, 0.97, -0.1], [0.30, 0.30, 0.24], m.silver, 0.015);
  box(ports, [0.02, 0.97, -0.225], [0.22, 0.21, 0.012], m.black, 0.007);
  for (let i = 0; i < 3; i++) cylinder(ports, [0.01, -0.73 + i * 0.095, -0.22], 0.035, 0.085, i === 0 ? m.blue : m.darkMetal, 'z', 16);
  // Four DIMM sockets, with alternating A2/B2 positions populated below.
  for (const z of [0.38, 0.63, 0.88, 1.13]) {
    box(motherboard, [0.08, 0.68, z], [0.14, 1.50, 0.068], m.black, 0.008);
    box(motherboard, [0.155, 0.68, z], [0.013, 1.33, 0.026], m.socket);
    for (const y of [-0.085, 1.445]) box(motherboard, [0.115, y, z], [0.17, 0.089, 0.095], m.socket, 0.013);
  }
  // Reinforced primary PCIe slot and secondary slots, with gold contacts.
  const contacts: Pose[] = [];
  for (const y of [-0.79, -1.27]) {
    box(motherboard, [0.095, y, -0.12], [0.16, 0.105, 1.66], m.black, 0.012);
    if (y === -0.79) {
      box(motherboard, [0.18, y - 0.046, -0.12], [0.032, 0.020, 1.60], m.silver);
      box(motherboard, [0.18, y + 0.046, -0.12], [0.032, 0.020, 1.60], m.silver);
    }
    for (let i = 0; i < 35; i++) contacts.push({ p: [0.179, y, -0.85 + i * 0.042], s: [0.009, 0.036, 0.013] });
    box(motherboard, [0.17, y, 0.77], [0.12, 0.13, 0.16], m.socket, 0.01);
  }
  batch(motherboard, unitBox, m.gold, contacts);
  box(motherboard, [0.121, -1.10, 0.53], [0.18, 0.50, 0.50], m.darkMetal, 0.033);
  const chipsetFins: Pose[] = [];
  for (let i = 0; i < 7; i++) chipsetFins.push({ p: [0.224, -1.10, 0.32 + i * 0.061], s: [0.031, 0.44, 0.018] });
  batch(motherboard, unitBox, m.silver, chipsetFins);
  // Discrete chips, metallic solder feet and dense capacitor banks.
  const chips: Pose[] = [], solder: Pose[] = [], capBodies: Pose[] = [], capTops: Pose[] = [];
  for (let i = 0; i < 36; i++) {
    const y = -1.32 + (i % 12) * 0.218;
    const z = i < 12 ? -1.07 : i < 24 ? 0.49 : -0.53;
    const sy = 0.055 + (i % 3) * 0.014;
    chips.push({ p: [0.067, y, z], s: [0.05, sy, 0.10] });
    for (const k of [-1, 1]) solder.push({ p: [0.047, y, z + k * 0.064], s: [0.018, sy * 0.73, 0.030] });
  }
  for (let i = 0; i < 26; i++) {
    const y = i < 10 ? -1.31 + i * 0.121 : i < 18 ? 1.04 : -0.38 + (i - 18) * 0.11;
    const z = i < 10 ? -0.95 : i < 18 ? -0.70 + (i - 10) * 0.145 : 0.54;
    capBodies.push({ p: [0.095, y, z], s: [0.037, 0.11, 0.037], r: [0, 0, -Math.PI / 2] });
    capTops.push({ p: [0.153, y, z], s: [0.033, 0.006, 0.033], r: [0, 0, -Math.PI / 2] });
  }
  batch(motherboard, unitBox, m.chip, chips);
  batch(motherboard, unitBox, m.silver, solder);
  batch(motherboard, unitCylinder, m.graphite, capBodies);
  batch(motherboard, unitCylinder, m.silver, capTops);
  for (const y of [-1.26, -1.05, -0.84]) box(motherboard, [0.145, y, 1.13], [0.22, 0.16, 0.21], m.black, 0.012);
  box(motherboard, [0.11, -0.12, 1.20], [0.20, 0.60, 0.115], m.black, 0.010);
  const pinRows: Pose[] = [];
  for (let i = 0; i < 12; i++) for (const z of [1.18, 1.225]) pinRows.push({ p: [0.22, -0.37 + i * 0.045, z], s: [0.028, 0.025, 0.020] });
  batch(motherboard, unitBox, m.gold, pinRows);
  cylinder(motherboard, [0.075, -0.42, -0.45], 0.15, 0.053, m.silver, 'x', 32);
  cylinder(motherboard, [0.105, -0.42, -0.45], 0.124, 0.006, m.silverBright, 'x', 32);
  label(motherboard, [0.041, -1.44, 0.30], 0.83, 0.075, ['ATX  /  PCIe 4.0  /  DDR5'], { axis: 'x', color: '#a2aaa0', small: true });

  // CPU — visible in isolation, including substrate, IHS shoulders and contact pads.
  const cpu = part('cpu', [-0.61, 3.60, -0.60], [0.064, 0.10, 0.10]);
  box(cpu, [-0.015, 0, 0], [0.044, 0.536, 0.536], m.pcb, 0.014);
  box(cpu, [0.016, 0, 0], [0.053, 0.470, 0.470], m.silverBright, 0.020);
  box(cpu, [0.045, 0, 0], [0.011, 0.415, 0.415], m.silver, 0.008);
  const cpuPads: Pose[] = [];
  for (let y = 0; y < 13; y++) for (let z = 0; z < 13; z++) {
    if (y > 3 && y < 9 && z > 3 && z < 9) continue;
    cpuPads.push({ p: [-0.039, -0.222 + y * 0.037, -0.222 + z * 0.037], s: [0.004, 0.023, 0.023] });
  }
  batch(cpu, unitBox, m.gold, cpuPads);
  label(cpu, [0.052, 0.026, 0], 0.345, 0.195, ['PROCESSOR', '8 CORE / 16 THREAD'], { axis: 'x', color: '#4a5350', small: true });
  const cpuCorner = new THREE.Shape();
  cpuCorner.moveTo(0, 0); cpuCorner.lineTo(0.046, 0); cpuCorner.lineTo(0, 0.046); cpuCorner.closePath();
  mesh(cpu, new THREE.ShapeGeometry(cpuCorner), m.gold, [0.010, -0.252, -0.244], [0, Math.PI / 2, 0]);

  // CPU TOWER COOLER — stack of individual fins, four copper U heatpipes, a front fan.
  const cooler = part('cooler', [0.10, 3.60, -0.60], [0.48, 0.47, 0.40]);
  box(cooler, [-0.585, 0, 0], [0.125, 0.55, 0.56], m.silver, 0.027);
  box(cooler, [-0.653, 0, 0], [0.012, 0.44, 0.44], m.copper, 0.005);
  box(cooler, [-0.495, 0, 0], [0.095, 0.65, 0.62], m.darkMetal, 0.016);
  const coolingFins: Pose[] = [];
  for (let i = 0; i < 35; i++) coolingFins.push({ p: [-0.37 + i * 0.024, 0, -0.015], s: [0.013, 1.10, 0.91] });
  batch(cooler, unitBox, m.fins, coolingFins);
  // Folded edges and dark end cap give the stack a manufacturable, precise silhouette.
  box(cooler, [0.48, 0, -0.015], [0.030, 1.10, 0.91], m.silver, 0.018);
  box(cooler, [0.498, 0, -0.015], [0.012, 1.065, 0.875], m.darkMetal, 0.017);
  const pipeCaps: V3[] = [];
  for (const z of [-0.285, -0.10, 0.10, 0.285]) {
    for (const y of [-0.30, 0.30]) {
      tube(cooler, [[-0.60, y * 0.24, z], [-0.52, y * 0.78, z], [-0.39, y, z], [0.45, y, z], [0.535, y, z]], 0.027, m.copper, 22);
      pipeCaps.push([0.529, y, z]);
    }
  }
  for (const p of pipeCaps) cylinder(cooler, p, 0.035, 0.036, m.silver, 'x', 16);
  fan(cooler, [0.052, 0, 0.52], 1.12, [0, 0, 0], true, true);
  // Wire retention clips hook around the fan frame into the heatsink.
  for (const y of [-0.48, 0.48]) {
    tube(cooler, [[-0.31, y, 0.20], [-0.38, y, 0.40], [-0.39, y, 0.60], [0.49, y, 0.60], [0.49, y, 0.36]], 0.010, m.silverBright, 18);
  }
  label(cooler, [0.509, 0.02, 0.06], 0.50, 0.15, ['THERMAL'], { axis: 'x', color: '#bdc5bf' });
  tube(cooler, [[-0.41, -0.47, 0.51], [-0.46, -0.61, 0.49], [-0.61, -0.65, 0.63], [-0.66, -0.47, 0.86]], 0.013, m.rubber, 20);

  // MEMORY — two long DIMMs, with exposed PCB, fingers, heatspreaders and subdued light bars.
  const ram = part('ram', [-0.49, 3.60, 0.53], [0.235, 0.55, 0.14]);
  const ramFingers: Pose[] = [], ramChips: Pose[] = [], ramRibs: Pose[] = [];
  for (const z of [-0.25, 0.25]) {
    box(ram, [-0.065, 0, z], [0.43, 1.36, 0.042], m.pcb, 0.005);
    for (let i = 0; i < 28; i++) {
      if (i === 16) continue;
      ramFingers.push({ p: [-0.277, -0.63 + i * 0.046, z], s: [0.055, 0.025, 0.047] });
    }
    for (let i = 0; i < 8; i++) for (const face of [-1, 1]) ramChips.push({ p: [-0.066, -0.54 + i * 0.152, z + face * 0.028], s: [0.22, 0.112, 0.019] });
    for (const face of [-1, 1]) {
      box(ram, [0.012, 0, z + face * 0.051], [0.285, 1.30, 0.030], m.darkMetal, 0.016);
      for (let i = 0; i < 9; i++) ramRibs.push({ p: [0.045, -0.56 + i * 0.14, z + face * 0.071], s: [0.235, 0.034, 0.015] });
    }
    box(ram, [0.171, 0, z], [0.065, 1.255, 0.117], m.graphite, 0.025);
    box(ram, [0.208, 0, z], [0.021, 1.20, 0.072], m.lightBar, 0.010);
    label(ram, [0.020, 0.045, z + 0.069], 0.24, 0.095, ['DDR5'], { color: '#d4d7d0' });
  }
  batch(ram, unitBox, m.gold, ramFingers);
  batch(ram, unitBox, m.chip, ramChips);
  batch(ram, unitBox, m.graphite, ramRibs);

  // GRAPHICS CARD — a horizontal dual-fan card, with its backplate on top and fans below.
  const gpu = part('gpu', [0.05, 2.02, -0.10], [0.61, 0.13, 0.71]);
  box(gpu, [-0.035, 0.089, 0], [1.14, 0.042, 2.65], m.pcbDark, 0.014);
  box(gpu, [0.0, 0.183, 0], [1.15, 0.047, 2.69], m.darkMetal, 0.045);
  box(gpu, [0, 0.212, -0.06], [1.035, 0.013, 2.44], m.graphite, 0.040);
  // Backplate vents are dark recessed diagonal slots, clear even from above.
  const backplateSlits: Pose[] = [];
  for (let i = 0; i < 9; i++) backplateSlits.push({ p: [0.06, 0.221, 0.75 + i * 0.048], s: [0.72, 0.006, 0.019], r: [0, 0.32, 0] });
  batch(gpu, unitBox, m.black, backplateSlits);
  box(gpu, [-0.04, 0.224, -0.33], [0.52, 0.014, 0.53], m.darkMetal, 0.025);
  screws(gpu, [[-0.215, 0.238, -0.505], [0.135, 0.238, -0.505], [-0.215, 0.238, -0.155], [0.135, 0.238, -0.155], [-0.48, 0.224, -1.15], [0.48, 0.224, -1.15], [-0.48, 0.224, 1.14], [0.48, 0.224, 1.14]], 'y', 0.028);
  const gpuFins: Pose[] = [];
  for (let i = 0; i < 64; i++) gpuFins.push({ p: [0, -0.022, -1.245 + i * 0.039], s: [1.04, 0.276, 0.015] });
  batch(gpu, unitBox, m.fins, gpuFins);
  for (const x of [-0.32, -0.10, 0.12, 0.34]) {
    tube(gpu, [[x, -0.023, -1.19], [x, -0.115, -0.90], [x, -0.115, 0.86], [x, -0.02, 1.19]], 0.024, m.copper, 26);
  }
  // Side wall has an open fin reveal between two solid, accurately scaled rails.
  for (const x of [-0.55, 0.55]) {
    box(gpu, [x, -0.148, 0], [0.068, 0.078, 2.68], m.black, 0.025);
    box(gpu, [x, 0.110, 0], [0.067, 0.087, 2.66], m.graphite, 0.022);
  }
  for (const z of [-1.29, 1.29]) box(gpu, [0, -0.05, z], [1.09, 0.31, 0.093], m.graphite, 0.026);
  box(gpu, [0, -0.166, 0], [1.11, 0.064, 0.12], m.graphite, 0.010);
  for (const z of [-0.655, 0.655]) {
    const f = fan(gpu, [0.0, -0.212, z], 1.064, [Math.PI / 2, 0, 0], false, true);
    ring(f, [0, 0, -0.025], 0.50, 0.035, m.graphite);
  }
  box(gpu, [0.596, 0.11, 0.12], [0.012, 0.034, 1.75], m.silver);
  box(gpu, [0.597, 0.009, 0.15], [0.016, 0.119, 1.96], m.graphite, 0.004);
  label(gpu, [0.607, 0.014, 0.05], 1.50, 0.108, ['GRAPHICS / PCIe x16'], { axis: 'x', color: '#d3d8d1' });
  label(gpu, [0, 0.232, -0.94], 0.69, 0.19, ['8 GB GDDR'], { axis: 'y', color: '#bcc6be' });
  // PCIe tongue runs into the board in X; rear steel bracket extends to the case in Z.
  box(gpu, [-0.663, 0.098, -0.26], [0.18, 0.033, 1.53], m.pcb);
  const gpuContacts: Pose[] = [];
  for (let i = 0; i < 42; i++) {
    if (i === 9 || i === 10) continue;
    gpuContacts.push({ p: [-0.675, 0.121, -0.985 + i * 0.035], s: [0.15, 0.010, 0.022] });
  }
  batch(gpu, unitBox, m.gold, gpuContacts);
  box(gpu, [0, 0, -1.727], [1.36, 0.39, 0.039], m.silver, 0.012);
  box(gpu, [0, 0.207, -1.658], [1.36, 0.039, 0.17], m.silver);
  const bracketHoles: Pose[] = [];
  for (let i = 0; i < 8; i++) bracketHoles.push({ p: [-0.52 + i * 0.145, -0.105, -1.752], s: [0.090, 0.076, 0.007] });
  batch(gpu, unitBox, m.black, bracketHoles);
  for (const x of [-0.44, -0.08, 0.28]) {
    box(gpu, [x, 0.071, -1.754], [0.245, 0.087, 0.025], m.frame, 0.010);
    box(gpu, [x, 0.071, -1.770], [0.197, 0.047, 0.010], m.black, 0.005);
  }
  box(gpu, [0.40, 0.14, 0.75], [0.27, 0.14, 0.26], m.black, 0.012);

  // NVMe — an 80 mm gumstick, with chips and its retaining screw clearly distinct.
  const ssd = part('ssd', [-0.60, 2.50, 0.25], [0.105, 0.065, 0.30]);
  box(ssd, [0, 0, 0], [0.036, 0.265, 0.86], m.pcb, 0.009);
  box(ssd, [0.038, 0, -0.20], [0.050, 0.204, 0.245], m.chip, 0.005);
  box(ssd, [0.033, 0, 0.11], [0.045, 0.203, 0.282], m.chip, 0.005);
  box(ssd, [0.058, 0, 0.075], [0.006, 0.219, 0.394], m.white);
  label(ssd, [0.063, 0.012, 0.071], 0.365, 0.189, ['NVMe 1TB', 'PCIe 4.0  M.2'], { axis: 'x', color: '#343e37', small: true });
  const ssdPins: Pose[] = [];
  for (let i = 0; i < 11; i++) {
    if (i === 8) continue;
    ssdPins.push({ p: [0.021, -0.115 + i * 0.022, -0.403], s: [0.010, 0.014, 0.065] });
  }
  batch(ssd, unitBox, m.gold, ssdPins);
  cylinder(ssd, [0.004, 0, 0.407], 0.057, 0.044, m.gold, 'x', 20);
  screws(ssd, [[0.035, 0, 0.407]], 'x', 0.040);
  const ssdResistors: Pose[] = [];
  for (let i = 0; i < 7; i++) ssdResistors.push({ p: [0.027, -0.110, -0.26 + i * 0.077], s: [0.018, 0.026, 0.040] });
  batch(ssd, unitBox, m.silver, ssdResistors);

  // POWER SUPPLY — black modular unit, top intake, rear AC socket and restrained label.
  const psu = part('psu', [0, 0.82, -1.05], [0.805, 0.15, 0.40]);
  box(psu, [0, -0.429, 0], [1.55, 0.042, 1.45], m.black, 0.015);
  for (const x of [-0.754, 0.754]) box(psu, [x, 0, 0], [0.042, 0.87, 1.45], m.black, 0.014);
  for (const z of [-0.704, 0.704]) box(psu, [0, 0, z], [1.52, 0.87, 0.042], m.black, 0.014);
  const psuRoof = new THREE.Shape();
  psuRoof.moveTo(-0.775, -0.725); psuRoof.lineTo(0.775, -0.725);
  psuRoof.lineTo(0.775, 0.725); psuRoof.lineTo(-0.775, 0.725); psuRoof.closePath();
  const psuIntake = new THREE.Path();
  psuIntake.absarc(0, 0, 0.581, 0, Math.PI * 2, true);
  psuRoof.holes.push(psuIntake);
  mesh(psu, new THREE.ExtrudeGeometry(psuRoof, { depth: 0.025, bevelEnabled: false, curveSegments: 32 }), m.black, [0, 0.425, 0], [-Math.PI / 2, 0, 0]);
  box(psu, [0.779, 0, 0], [0.014, 0.815, 1.36], m.graphite, 0.012);
  box(psu, [0.790, 0.06, -0.12], [0.008, 0.585, 0.92], m.frame, 0.013);
  label(psu, [0.797, 0.10, -0.15], 0.80, 0.42, ['650 W', 'ATX / MODULAR'], { axis: 'x', color: '#ccd2ca' });
  box(psu, [0.798, -0.265, -0.145], [0.009, 0.025, 0.82], m.shellEdge);
  screws(psu, [[0.797, -0.345, -0.60], [0.797, -0.345, 0.60], [0.797, 0.345, -0.60], [0.797, 0.345, 0.60]], 'x', 0.026, true);
  const psuFan = fan(psu, [0, 0.326, 0], 1.23, [-Math.PI / 2, 0, 0], false);
  for (const rad of [0.19, 0.28, 0.37, 0.46, 0.55]) ring(psuFan, [0, 0, 0.11], rad, 0.010, m.darkMetal);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const o = box(psuFan, [Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0.118], [0.56, 0.017, 0.017], m.darkMetal);
    o.rotation.z = a;
  }
  screws(psu, [[-0.60, 0.46, -0.58], [0.60, 0.46, -0.58], [-0.60, 0.46, 0.58], [0.60, 0.46, 0.58]], 'y', 0.028, true);
  box(psu, [-0.39, 0.01, -0.743], [0.46, 0.31, 0.040], m.frame, 0.019);
  box(psu, [-0.39, 0.01, -0.769], [0.32, 0.21, 0.018], m.black, 0.025);
  for (const x of [-0.08, 0.08]) box(psu, [-0.39 + x, 0.025, -0.783], [0.037, 0.072, 0.022], m.silver);
  box(psu, [0.04, 0.035, -0.757], [0.15, 0.22, 0.049], m.graphite, 0.012);
  const psuVents: Pose[] = [];
  for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) psuVents.push({ p: [0.25 + col * 0.066, -0.26 + row * 0.10, -0.737], s: [0.041, 0.050, 0.008] });
  batch(psu, unitBox, m.graphite, psuVents);
  const modularPins: Pose[] = [];
  for (const x of [-0.47, -0.05, 0.37]) for (const y of [-0.20, 0.12]) {
    box(psu, [x, y, 0.751], [0.30, 0.22, 0.054], m.frame, 0.009);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 2; row++) modularPins.push({ p: [x - 0.108 + col * 0.071, y - 0.049 + row * 0.098, 0.783], s: [0.045, 0.065, 0.006] });
  }
  batch(psu, unitBox, m.black, modularPins);
  const psuCables = new THREE.Group();
  psuCables.userData.isCable = true;
  psu.add(psuCables);
  // Tight sleeved cable runs hug the lower front and motherboard edge.
  for (let i = 0; i < 7; i++) {
    const d = (i - 3) * 0.038;
    tube(psuCables, [[0.32 + d, 0.10, 0.82], [0.35 + d, 0.15, 1.08], [0.27 + d, 0.49, 1.52], [-0.48 + d * 0.60, 0.72, 2.00], [-0.64 + d * 0.40, 1.47, 2.00], [-0.68 + d * 0.30, 1.85, 1.92]], 0.016, m.rubber, 34);
  }
  box(psuCables, [0.30, 0.39, 1.41], [0.31, 0.065, 0.075], m.graphite, 0.008);
  box(psuCables, [-0.535, 0.89, 2.002], [0.22, 0.065, 0.075], m.graphite, 0.008);
  for (let i = 0; i < 5; i++) {
    const d = (i - 2) * 0.032;
    tube(psuCables, [[-0.05 + d, -0.17, 0.82], [0.30 + d, -0.08, 1.13], [0.69 + d, 0.39, 1.31], [0.65 + d, 0.83, 1.43], [0.48 + d, 1.30, 1.70]], 0.015, m.rubber, 28);
  }

  // CASE FANS — two large front intakes, each with swept blades.
  const fans = part('fans', [0, 3.225, 1.77], [0.36, 0.73, 0.13]);
  fan(fans, [0, -0.625, 0], 1.22, [0, 0, 0], true, true);
  fan(fans, [0, 0.625, 0], 1.22, [0, 0, 0], true, true);
  // Rear ventilation is left open so the front intake pair remains a distinct assembly.
  // Mounting rails belong to the replaceable fan assembly.
  for (const x of [-0.67, 0.67]) box(fans, [x, 0, -0.065], [0.053, 2.55, 0.055], m.frame);
  const fanCable = tube(fans, [[-0.54, 0.20, -0.075], [-0.66, 0.04, -0.10], [-0.71, -0.90, -0.15], [-0.88, -1.10, -0.38]], 0.012, m.rubber, 24);
  fanCable.userData.isCable = true;

  for (const id of Object.keys(parts) as PartId[]) {
    parts[id].traverse(object => {
      object.userData.partId = id;
      if ((object as THREE.Mesh).isMesh) {
        object.name = object.name || `${id}-surface`;
      }
    });
    parts[id].updateMatrix();
  }
  root.updateMatrixWorld(true);
  return { root, parts, anchors };
}
