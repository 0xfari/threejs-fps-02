// The HE grenade: one arcing, bouncing projectile with a fuse, then a radius
// blast. Physics are simple on purpose — gravity, a damped bounce off the
// world's boxes, and damage that falls off with distance. No new objects in
// the hot loop: one reusable probe box.
import * as THREE from 'three';

const GRAVITY = 16;
const FUSE = 1.6;
const BLAST_RADIUS = 7;
const BLAST_DAMAGE = 95;

export function createGrenades(scene, world) {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.5, metalness: 0.5 });
  const blastGeo = new THREE.SphereGeometry(1, 20, 14);
  const blastMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.7, depthWrite: false });
  const probe = new THREE.Box3();
  const list = [];

  function throwGrenade(origin, direction) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    scene.add(mesh);
    list.push({
      mesh,
      pos: mesh.position,
      vel: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
      fuse: FUSE,
      bounced: 0,
    });
  }

  function step(dt, damageAt) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const g = list[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      const next = g.pos.clone().addScaledVector(g.vel, dt);
      // Bounce: test the next position against the world's boxes, one axis at
      // a time, and damp the component that hit.
      probe.min.set(next.x - 0.09, next.y - 0.09, next.z - 0.09);
      probe.max.set(next.x + 0.09, next.y + 0.09, next.z + 0.09);
      let hit = false;
      for (const c of world.colliders) {
        if (probe.intersectsBox(c)) { hit = true; break; }
      }
      if (hit) {
        const probeX = probe.clone();
        probeX.min.x = g.pos.x - 0.09 + g.vel.x * dt;
        probeX.max.x = g.pos.x + 0.09 + g.vel.x * dt;
        probeX.min.y = g.pos.y - 0.09;
        probeX.max.y = g.pos.y + 0.09;
        probeX.min.z = g.pos.z - 0.09;
        probeX.max.z = g.pos.z + 0.09;
        let hitX = false;
        let hitZ = false;
        for (const c of world.colliders) {
          if (probeX.intersectsBox(c)) hitX = true;
          if (probe.intersectsBox(c)) hitZ = true;
        }
        if (hitX) g.vel.x *= -0.45;
        if (hitZ) g.vel.z *= -0.45;
        if (!hitX && !hitZ) g.vel.y *= -0.45;
        g.vel.multiplyScalar(0.7);
        g.bounced += 1;
      } else {
        g.pos.copy(next);
      }
      if (g.pos.y < 0.09) {
        g.pos.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      if (g.fuse <= 0) {
        explode(g, damageAt);
        scene.remove(g.mesh);
        list.splice(i, 1);
      }
    }
  }

  function explode(g, damageAt) {
    const flash = new THREE.Mesh(blastGeo, blastMat.clone());
    flash.position.copy(g.pos);
    flash.scale.setScalar(0.5);
    scene.add(flash);
    const light = new THREE.PointLight(0xff7a1a, 60, 18);
    light.position.copy(g.pos);
    scene.add(light);
    let life = 0.35;
    const start = performance.now();
    function fade() {
      const t = (performance.now() - start) / 1000;
      const k = 1 - t / life;
      if (k <= 0) {
        scene.remove(flash);
        scene.remove(light);
        return;
      }
      flash.scale.setScalar(0.5 + (1 - k) * BLAST_RADIUS);
      flash.material.opacity = 0.7 * k;
      light.intensity = 60 * k;
      requestAnimationFrame(fade);
    }
    requestAnimationFrame(fade);
    if (damageAt) damageAt(g.pos, BLAST_RADIUS, BLAST_DAMAGE);
  }

  return {
    throwGrenade,
    step,
    count() { return list.length; },
    clear() {
      for (const g of list) scene.remove(g.mesh);
      list.length = 0;
    },
  };
}
