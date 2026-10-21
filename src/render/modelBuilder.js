// Сборка THREE-объекта из JSON-модели (примитивы + трансформ + цвет).
import * as THREE from 'three';

const geoCache = new Map();
function geometry(shape) {
  if (geoCache.has(shape)) return geoCache.get(shape);
  let g;
  switch (shape) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'sphere': g = new THREE.SphereGeometry(0.5, 18, 14); break;
    case 'cylinder': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 16); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 16); break;
    case 'torus': g = new THREE.TorusGeometry(0.5, 0.12, 10, 24); break;
    case 'capsule': g = new THREE.CapsuleGeometry(0.5, 1, 6, 12); break;
    default: g = new THREE.BoxGeometry(1, 1, 1);
  }
  geoCache.set(shape, g);
  return g;
}

const matCache = new Map();
function material(color, emissive) {
  const key = `${color}|${emissive}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color || '#cccccc'),
    emissive: new THREE.Color(emissive || '#000000'),
    roughness: 0.75,
    metalness: 0.15
  });
  matCache.set(key, m);
  return m;
}

export function buildModel(modelJson) {
  const group = new THREE.Group();
  const parts = (modelJson && modelJson.parts) || [];
  for (const p of parts) {
    const mesh = new THREE.Mesh(geometry(p.shape), material(p.color, p.emissive));
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

// Плоский «круг» под юнитом — маркер команды.
export function teamRing(color, radius = 0.6) {
  const g = new THREE.RingGeometry(radius * 0.82, radius, 24);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  return mesh;
}

// Полоска здоровья: две плоскости (фон + заливка).
export function healthBar(width = 0.9) {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * 0.14),
    new THREE.MeshBasicMaterial({ color: 0x1a1a22, transparent: true, opacity: 0.85, depthWrite: false })
  );
  const fg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * 0.14),
    new THREE.MeshBasicMaterial({ color: 0x35d05a, depthWrite: false })
  );
  fg.position.z = 0.001;
  group.add(bg, fg);
  group.userData.fg = fg;
  group.userData.width = width;
  group.renderOrder = 10;
  return group;
}

export function setHealthBar(bar, ratio, color) {
  const fg = bar.userData.fg;
  const w = bar.userData.width;
  fg.scale.x = Math.max(0.001, Math.min(1, ratio));
  fg.position.x = -w * (1 - fg.scale.x) * 0.5;
  if (color !== undefined) fg.material.color.set(color);
}
