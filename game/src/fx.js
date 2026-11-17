// fx.js — the juice: particles (sparks, smoke, glass), floating score
// text, event banners, skid marks and screen shake. Pure presentation
// state; systems push, render.js draws, this file ages everything.

export const fx = {
  parts: [], texts: [], skids: [], banner: null, shake: 0,
};

export function resetFx() {
  fx.parts.length = 0; fx.texts.length = 0; fx.skids.length = 0;
  fx.banner = null; fx.shake = 0;
}

export function sparks(x, y, n, rng, color = '#ffd27a') {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, sp = 60 + rng() * 240;
    fx.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + rng() * 0.4, t: 0, color, size: 1.6 + rng() * 2.2, kind: 'spark' });
  }
}

export function smoke(x, y, n, rng, dark = false) {
  for (let i = 0; i < n; i++) {
    fx.parts.push({
      x: x + (rng() - 0.5) * 10, y: y + (rng() - 0.5) * 10,
      vx: (rng() - 0.5) * 26, vy: -18 - rng() * 30,
      life: 0.9 + rng() * 1.1, t: 0, color: dark ? '#2c2c33' : '#9aa0ab', size: 5 + rng() * 8, kind: 'smoke',
    });
  }
}

export function floatText(x, y, text, color = '#ffe9b8', size = 17) {
  fx.texts.push({ x, y, text, color, size, t: 0, life: 1.35 });
}

export function banner(text, sub = '', color = '#ffd27a', hold = 2.2) {
  fx.banner = { text, sub, color, t: 0, hold };
}

export function addSkid(x, y, angle) {
  fx.skids.push({ x, y, angle, t: 0, life: 5 });
  if (fx.skids.length > 700) fx.skids.splice(0, fx.skids.length - 700);
}

export function shake(amount) { fx.shake = Math.min(14, fx.shake + amount); }

export function updateFx(dt) {
  for (const p of fx.parts) {
    p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'spark') { p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); }
  }
  fx.parts = fx.parts.filter((p) => p.t < p.life);
  for (const t of fx.texts) { t.t += dt; t.y -= 34 * dt; }
  fx.texts = fx.texts.filter((t) => t.t < t.life);
  for (const s of fx.skids) s.t += dt;
  fx.skids = fx.skids.filter((s) => s.t < s.life);
  if (fx.banner) { fx.banner.t += dt; if (fx.banner.t > fx.banner.hold) fx.banner = null; }
  fx.shake *= Math.exp(-6 * dt);
  if (fx.shake < 0.05) fx.shake = 0;
}
