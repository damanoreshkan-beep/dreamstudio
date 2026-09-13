// blackout — the rig helpers the runner (stage.js) and the street NPCs (world.js) share: find the hips, fit a
// Mixamo model to a height with a one-time bind-pose offset, retarget a clip onto another rig (afterdark's
// prefix rename + hips translation scaled by bind height; IN PLACE pins the hips' x/z to frame 0).
import * as THREE from "three";

export const hipsOf = (obj) => { let h = null; obj.traverse((o) => { if (!h && /hips$/i.test(o.name)) h = o; }); return h ? { bone: h, y: h.position.y, prefix: h.name.replace(/hips$/i, "") } : { bone: null, y: 0, prefix: "" }; };

export function fit(root, height) {
  let box = new THREE.Box3().setFromObject(root);
  root.scale.setScalar(height / (box.getSize(new THREE.Vector3()).y || height));
  box = new THREE.Box3().setFromObject(root);
  root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return root;
}

export function retarget(clip, src, dst, inPlace) {
  const c = clip.clone(), r = src.y && dst.y ? dst.y / src.y : 1, rename = src.prefix !== dst.prefix;
  for (const t of c.tracks) {
    if (rename && t.name.startsWith(src.prefix)) t.name = dst.prefix + t.name.slice(src.prefix.length);
    if (/hips\.position$/i.test(t.name)) {
      const v = t.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = inPlace ? x0 * r : v[i] * r; v[i + 1] *= r; v[i + 2] = inPlace ? z0 * r : v[i + 2] * r; }
    }
  }
  return c;
}
