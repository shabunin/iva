// A house in 3D (three.js), served by the panel itself (<WebApp entry="./web/house.js">).
// The rooms' lights follow the panel's joins; a tap on a room switches its light.
// Drag to turn it, pinch to zoom; it turns slowly by itself until touched.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { panel } from 'iva/web';

const o = panel.options;
const look = o.theme ?? {};
const font = `"${look.font ?? 'Helvetica Neue'}", -apple-system, Helvetica, Arial, sans-serif`;

// a phone's GPU: no shadows, no antialiasing, fewer pixels (a WebGL crash there takes every web view's canvas with it)
const phone = /Android|iPhone|iPad/i.test(navigator.userAgent);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !phone, powerPreference: phone ? 'low-power' : 'default' });
} catch (e) {
  // no WebGL here (an old WebView, a browser without a GPU): say so, not a blank box
  document.body.innerHTML = `<div style="display:flex;height:100%;align-items:center;justify-content:center;color:${look.muted ?? '#8A949C'};font:15px ${font}">3D needs WebGL: ${e.message}</div>`;
  throw e;
}
renderer.setPixelRatio(Math.min(phone ? 1.5 : 2, window.devicePixelRatio));
renderer.shadowMap.enabled = !phone;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(look.bg ?? '#22272C');
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
camera.position.set(10, 12, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.42;
controls.minDistance = 9;
controls.maxDistance = 32;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.addEventListener('start', () => (controls.autoRotate = false));

const dark = new THREE.Color(look.bg ?? '#22272C').getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
scene.add(new THREE.HemisphereLight('#c8d4e0', '#202428', dark ? 0.35 : 0.9));
const sun = new THREE.DirectionalLight('#ffffff', dark ? 0.35 : 1.1);
sun.position.set(6, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
scene.add(sun);

// the plot it stands on
const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: dark ? '#2b3a2f' : '#b9d3b0' }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.06;
ground.receiveShadow = true;
scene.add(ground);

const rooms = o.rooms ?? [];
// the plan, centred
const minX = Math.min(...rooms.map((r) => r.x));
const maxX = Math.max(...rooms.map((r) => r.x + r.w));
const minZ = Math.min(...rooms.map((r) => r.z));
const maxZ = Math.max(...rooms.map((r) => r.z + r.d));
const cx = (minX + maxX) / 2;
const cz = (minZ + maxZ) / 2;

const WALL = 0.12;
const H = 1.3;
const wallMat = new THREE.MeshStandardMaterial({ color: '#e9e4dc' });
const floors = [];
const placed = rooms.map((r) => {
  const x0 = r.x - cx;
  const z0 = r.z - cz;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.1, r.d), new THREE.MeshStandardMaterial({ color: r.floor ?? '#a58e72' }));
  floor.position.set(x0 + r.w / 2, 0, z0 + r.d / 2);
  floor.receiveShadow = true;
  floor.userData.room = r;
  floors.push(floor);
  scene.add(floor);
  // walls just inside the room: two rooms' walls side by side, not in one place
  const wall = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    m.position.set(x, H / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  wall(r.w, WALL, x0 + r.w / 2, z0 + WALL / 2);
  wall(r.w, WALL, x0 + r.w / 2, z0 + r.d - WALL / 2);
  wall(WALL, r.d - 2 * WALL, x0 + WALL / 2, z0 + r.d / 2);
  wall(WALL, r.d - 2 * WALL, x0 + r.w - WALL / 2, z0 + r.d / 2);
  // the ceiling lamp and its light
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#ffc861', emissiveIntensity: 0 }));
  lamp.position.set(x0 + r.w / 2, H + 0.5, z0 + r.d / 2);
  scene.add(lamp);
  const light = new THREE.PointLight('#ffcf7a', 0, Math.max(r.w, r.d) * 1.6, 1.4);
  light.position.copy(lamp.position);
  scene.add(light);
  // its name over it (HTML, crisp at any size)
  const tag = document.createElement('div');
  Object.assign(tag.style, {
    position: 'absolute', transform: 'translate(-50%, -50%)', font: `600 13px ${font}`, color: '#fff', padding: '3px 8px',
    borderRadius: '10px', background: 'rgba(0,0,0,0.45)', pointerEvents: 'none', whiteSpace: 'nowrap',
  });
  document.body.append(tag);
  return { r, lamp, light, tag, on: 0, level: 0 };
});

for (const p of placed) {
  panel.on(p.r.light, (v) => (p.on = Number(v) ? 1 : 0));
}

// a tap (not a drag) on a room switches its light
const ray = new THREE.Raycaster();
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const rect = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
  const hit = ray.intersectObjects(floors)[0];
  if (!hit) return;
  const p = placed.find((x) => x.r === hit.object.userData.room);
  panel.set(p.r.light, p.on ? 0 : 1);
});

function fit() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

const at = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  controls.update();
  for (const p of placed) {
    // lights fade on and off
    p.level += (p.on - p.level) * 0.15;
    p.light.intensity = p.level * 9;
    p.lamp.material.emissiveIntensity = p.level * 2.5;
    at.copy(p.lamp.position).setY(H + 1.1).project(camera);
    p.tag.style.left = `${((at.x + 1) / 2) * window.innerWidth}px`;
    p.tag.style.top = `${((1 - at.y) / 2) * window.innerHeight}px`;
    p.tag.textContent = `${p.r.label}${p.on ? ' · on' : ''}`;
    p.tag.style.background = p.on ? 'rgba(255,190,80,0.85)' : 'rgba(0,0,0,0.45)';
    p.tag.style.color = p.on ? '#2a1a00' : '#fff';
  }
  renderer.render(scene, camera);
});
