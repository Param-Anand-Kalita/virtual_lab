import * as THREE from 'three';

const instanceMatrix = new THREE.Matrix4();

/**
 * World-space boxes for each rendered mesh of a part, excluding schematic cable runs. Instanced meshes
 * contribute one box per instance, because a single batch can span physically separate pieces.
 */
export function meshBoxes(part: THREE.Object3D): THREE.Box3[] {
  part.updateWorldMatrix(true, true);
  const boxes: THREE.Box3[] = [];
  part.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    let parent: THREE.Object3D | null = object;
    while (parent && !parent.userData.isCable) parent = parent.parent;
    if (parent) return;
    const instanced = object as THREE.InstancedMesh;
    if (!instanced.isInstancedMesh) { boxes.push(new THREE.Box3().setFromObject(object)); return; }
    if (!instanced.geometry.boundingBox) instanced.geometry.computeBoundingBox();
    for (let i = 0; i < instanced.count; i++) {
      instanced.getMatrixAt(i, instanceMatrix);
      boxes.push(instanced.geometry.boundingBox!.clone().applyMatrix4(instanceMatrix.premultiply(instanced.matrixWorld)));
    }
  });
  return boxes;
}

/**
 * Merges boxes that touch (within `gap`) into separate mounting zones, so a part with physically
 * separate pieces — such as two memory modules — highlights each slot rather than the space between.
 */
export function clusterBoxes(boxes: THREE.Box3[], gap: number): THREE.Box3[] {
  const zones: THREE.Box3[] = [];
  const probe = new THREE.Box3();
  for (const box of boxes) {
    if (box.isEmpty()) continue;
    const merged = box.clone();
    let grew = true;
    while (grew) {
      grew = false;
      probe.copy(merged).expandByScalar(gap);
      for (let i = zones.length - 1; i >= 0; i--) {
        if (!probe.intersectsBox(zones[i])) continue;
        merged.union(zones[i]); zones.splice(i, 1); grew = true;
      }
    }
    zones.push(merged);
  }
  return zones;
}

/** True when the pointer ray passes through the installed bounds, padded by `margin` for small parts. */
export function rayHitsZone(ray: THREE.Ray, zone: THREE.Box3, margin: number): boolean {
  return ray.intersectsBox(zone.clone().expandByScalar(margin));
}

const dragPlane = new THREE.Plane();
const planePoint = new THREE.Vector3();

/** The point of a part that follows the pointer: its world position, and its offset from the part's own origin. */
export type Hold = { point: THREE.Vector3; offset: THREE.Vector3 };

/** Holds a part by the centre of its installed bounds, wherever the part currently sits. */
export function centerHold(installed: THREE.Box3, origin: THREE.Vector3, position: THREE.Vector3): Hold {
  const offset = installed.getCenter(new THREE.Vector3()).sub(origin);
  return { point: position.clone().add(offset), offset };
}

/**
 * Where a dragged part should sit for a pointer ray. Over its target it snaps to the install origin;
 * elsewhere the held point follows the ray on a camera-facing plane through that point, so the part keeps its depth
 * and the spot you grabbed stays under the pointer. Without a `hold` the part is held by the centre of its installed
 * bounds, which gives a tray drag the depth it will have once mounted. Returns a null position if the ray misses the plane.
 */
export function dragPosition(ray: THREE.Ray, viewDirection: THREE.Vector3, installed: THREE.Box3, origin: THREE.Vector3, margin: number, hold?: Hold): { onTarget: boolean; position: THREE.Vector3 | null } {
  if (rayHitsZone(ray, installed, margin)) return { onTarget: true, position: origin.clone() };
  const held = hold ?? centerHold(installed, origin, origin);
  dragPlane.setFromNormalAndCoplanarPoint(viewDirection, held.point);
  if (!ray.intersectPlane(dragPlane, planePoint)) return { onTarget: false, position: null };
  return { onTarget: false, position: planePoint.clone().sub(held.offset) };
}

/** Lifts a released part so the lowest point of its geometry rests on the workbench instead of sinking into it. */
export function restAboveFloor(position: THREE.Vector3, localMinY: number, floorY: number): THREE.Vector3 {
  const rested = position.clone();
  rested.y = Math.max(rested.y, floorY - localMinY);
  return rested;
}
