// Сборка THREE-объекта из JSON-модели (примитивы + трансформ + цвет + текстуры + анимация).
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
    case 'ring': g = new THREE.RingGeometry(0.28, 0.5, 24); break;
    case 'halfsphere': g = new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case 'wedge': g = new THREE.CylinderGeometry(0.55, 0.55, 1, 3); break; // треугольная призма
    default: g = new THREE.BoxGeometry(1, 1, 1);
  }
  geoCache.set(shape, g);
  return g;
}

// ——— процедурные текстуры ———
const texCache = new Map();
function canvasTexture(kind, color) {
  const key = kind + '|' + color;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color || '#cccccc';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  if (kind === 'stripes') {
    for (let i = 0; i < 64; i += 16) ctx.fillRect(i, 0, 8, 64);
  } else if (kind === 'dots') {
    for (let y = 8; y < 64; y += 16) {
      for (let x = 8; x < 64; x += 16) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'checker') {
    for (let y = 0; y < 64; y += 16) {
      for (let x = 0; x < 64; x += 16) {
        if (((x + y) / 16) % 2 === 0) ctx.fillRect(x, y, 16, 16);
      }
    }
  } else if (kind === 'metal') {
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  texCache.set(key, tex);
  return tex;
}

const matCache = new Map();
function material(p) {
  const key = `${p.color}|${p.emissive}|${p.tex || ''}|${p.opacity ?? 1}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(p.color || '#cccccc'),
    emissive: new THREE.Color(p.emissive || '#000000'),
    roughness: 0.75,
    metalness: 0.15
  });
  if (p.tex && p.tex !== 'none') {
    m.map = canvasTexture(p.tex, p.color || '#cccccc');
    m.color.set('#ffffff');
  }
  if (p.opacity !== undefined && p.opacity < 1) {
    m.transparent = true;
    m.opacity = Math.max(0.05, p.opacity);
    m.depthWrite = p.opacity > 0.6;
  }
  matCache.set(key, m);
  return m;
}

export function buildModel(modelJson) {
  const group = new THREE.Group();
  const parts = (modelJson && modelJson.parts) || [];
  parts.forEach((p, index) => {
    const mesh = new THREE.Mesh(geometry(p.shape), material(p));
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    mesh.castShadow = true;
    if (p.anim && p.anim !== 'none') {
      mesh.userData.anim = { type: p.anim, index, base: mesh.position.clone() };
    }
    group.add(mesh);
  });
  return group;
}

// Анимация частей модели (spin/bob/orbit) — вызывать каждый кадр с временем в сек.
export function animateModel(group, t) {
  if (!group) return;
  for (const child of group.children) {
    const a = child.userData && child.userData.anim;
    if (!a) continue;
    if (a.type === 'spin') {
      child.rotation.y += 0.03;
    } else if (a.type === 'bob') {
      child.position.y = a.base.y + Math.sin(t * 2.4 + a.index) * 0.12;
    } else if (a.type === 'orbit') {
      child.position.x = a.base.x + Math.cos(t * 1.6 + a.index) * 0.3;
      child.position.z = a.base.z + Math.sin(t * 1.6 + a.index) * 0.3;
    }
  }
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
