// render.js — everything the player (and the judge) sees: the dusk city
// from above with extruded procedural buildings, roads and docks, cars
// with headlights, pedestrians, pursuit light-bars, markers with light
// columns, the in-canvas panels (minimap, threats, mods), and the three
// full screens — title, safehouse, and the grade screen. All drawing is
// deterministic: patterns come from coordinate hashes, never Math.random.

import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, PITCH, ROAD_W, DISTRICTS, UNIT_TYPES, MODS, DIFFICULTIES, PALETTE, districtAt } from './config.js';
import { city } from './city.js';
import { fx } from './fx.js';
import { META } from './meta.js';

function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bf03635;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, state, labels = true) {
  const cam = state.cam;
  const vx = cam.x - VIEW_W / 2 - 60, vy = cam.y - VIEW_H / 2 - 60;
  const vw = VIEW_W + 120, vh = VIEW_H + 120;
  ctx.fillStyle = PALETTE.sidewalk;
  ctx.fillRect(vx, vy, vw, vh);
  // District ground tints.
  for (let cx = 0; cx < 3; cx++) for (let cy = 0; cy < 2; cy++) {
    const d = DISTRICTS[cy * 3 + cx];
    ctx.fillStyle = d.tint;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(cx * (WORLD_W / 3), cy * (WORLD_H / 2), WORLD_W / 3, WORLD_H / 2);
    ctx.globalAlpha = 1;
  }
  // Block ground (grass in parks shows through: paint blocks by kind).
  for (const cell of city.cells) {
    const bx = cell.i * PITCH + ROAD_W, by = cell.j * PITCH + ROAD_W;
    if (bx > vx + vw || by > vy + vh || bx + PITCH < vx || by + PITCH < vy) continue;
    if (cell.kind === 'park') { ctx.fillStyle = PALETTE.grass; ctx.fillRect(bx, by, PITCH - ROAD_W, PITCH - ROAD_W); }
    else if (cell.kind === 'dock') { ctx.fillStyle = '#5a4a33'; ctx.fillRect(bx, by, PITCH - ROAD_W, PITCH - ROAD_W); }
  }
  // Roads.
  ctx.fillStyle = PALETTE.road;
  for (let i = 0; i <= 12; i++) ctx.fillRect(i * PITCH, vy, ROAD_W, vh);
  for (let j = 0; j <= 9; j++) ctx.fillRect(vx, j * PITCH, vw, ROAD_W);
  // Lane dashes.
  ctx.fillStyle = PALETTE.lane;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 12; i++) {
    const x = i * PITCH + ROAD_W / 2;
    if (x < vx || x > vx + vw) continue;
    for (let y = Math.floor(vy / 44) * 44; y < vy + vh; y += 44) ctx.fillRect(x - 1, y, 2, 22);
  }
  for (let j = 0; j < 9; j++) {
    const y = j * PITCH + ROAD_W / 2;
    if (y < vy || y > vy + vh) continue;
    for (let x = Math.floor(vx / 44) * 44; x < vx + vw; x += 44) ctx.fillRect(x, y - 1, 22, 2);
  }
  ctx.globalAlpha = 1;
  // Skid marks.
  for (const s of fx.skids) {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.angle);
    ctx.fillStyle = `rgba(10,10,12,${0.34 * (1 - s.t / s.life)})`;
    ctx.fillRect(-2, -6, 4, 3); ctx.fillRect(-2, 3, 4, 3);
    ctx.restore();
  }
  // Garages: floor + label (labels are live-play only: on the title,
  // safehouse and grade screens the world is a dim backdrop and a stray
  // label would bleed through the screen's own text).
  for (const g of city.garages) {
    ctx.fillStyle = '#2c313c';
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = '#7ed492'; ctx.globalAlpha = 0.65; ctx.lineWidth = 2;
    ctx.strokeRect(g.x + 3, g.y + 3, g.w - 6, g.h - 6);
    ctx.globalAlpha = 1;
    if (labels) {
      ctx.fillStyle = '#7ed492';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GARAGE — VENT', g.cx, g.y + g.h - 10);
    }
  }
  // The Keep: Commissioner Dray's headquarters block.
  if (labels && city.precinct) {
    ctx.fillStyle = '#8fb4ff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('DRAY\u2019S KEEP', city.precinct.cx, city.precinct.y + city.precinct.h + 44);
  }
  // Trees.
  for (const t of city.trees) {
    if (t.x < vx || t.x > vx + vw || t.y < vy || t.y > vy + vh) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(t.x + 4, t.y + 6, t.r, t.r * 0.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2c5a34';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a7a44';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.62, 0, 7); ctx.fill();
  }
  // Buildings, stalls, containers: extruded blocks with lit windows.
  drawBlocks(ctx, city.buildings, vx, vy, vw, vh);
  drawBlocks(ctx, city.stalls, vx, vy, vw, vh);
  drawBlocks(ctx, city.containers, vx, vy, vw, vh);
  // Spike strips.
  for (const s of state.strips) {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.angle);
    ctx.fillStyle = '#c9ccd4';
    ctx.fillRect(-26, -4, 52, 8);
    ctx.fillStyle = '#ff5f5f';
    for (let k = -2; k <= 2; k++) ctx.fillRect(k * 10 - 2, -6, 4, 12);
    ctx.restore();
  }
}

function drawBlocks(ctx, list, vx, vy, vw, vh) {
  for (const b of list) {
    if (b.x > vx + vw || b.y > vy + vh || b.x + b.w < vx || b.y + b.h < vy) continue;
    const ox = -b.hgt * 0.36, oy = -b.hgt * 0.5;
    // Side (extrusion) then roof.
    ctx.fillStyle = 'rgba(8,8,14,0.85)';
    ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
    ctx.fillStyle = '#14141d';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
    // Windows: lit grid from the building's own seed.
    const cols = Math.max(2, Math.floor(b.w / 17)), rows = Math.max(2, Math.floor(b.h / 17));
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const h = hash2(b.winSeed + cx * 7, cy * 13);
      if (h < 0.42) continue;
      ctx.fillStyle = h > 0.85 ? 'rgba(140,200,255,0.85)' : 'rgba(255,196,110,0.8)';
      ctx.fillRect(b.x + ox + 6 + cx * 17, b.y + oy + 6 + cy * 17, 7, 9);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + ox, b.y + oy, b.w, b.h);
  }
}

export function drawCar(ctx, state, c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  // Shadow + headlight glow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, -15, -6, 32, 17, 5); ctx.fill();
  const glow = ctx.createRadialGradient(26, 0, 2, 40, 0, 46);
  glow.addColorStop(0, 'rgba(255,240,190,0.20)');
  glow.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(14, -24, 60, 48);
  // Body.
  ctx.fillStyle = c.wrecked ? '#3f3f46' : c.color;
  rr(ctx, -16, -9, 32, 18, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  rr(ctx, -16, -9, 32, 6, 5); ctx.fill();
  // Cabin + glass.
  ctx.fillStyle = '#10151d';
  rr(ctx, -6, -7, 13, 14, 3); ctx.fill();
  ctx.fillStyle = 'rgba(150,200,235,0.5)';
  ctx.fillRect(5, -6, 3, 12);
  ctx.fillRect(-8, -6, 2, 12);
  // Wheels.
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(-11, -11, 7, 3); ctx.fillRect(5, -11, 7, 3);
  ctx.fillRect(-11, 8, 7, 3); ctx.fillRect(5, 8, 7, 3);
  if (c.kind === 'police') {
    ctx.fillStyle = '#14181f';
    ctx.fillRect(-4, -9, 9, 18);
    const phase = Math.floor(state.time * 5 + c.id) % 2;
    ctx.fillStyle = phase ? '#ff4040' : '#4060ff';
    rr(ctx, -3, -3, 7, 6, 2); ctx.fill();
    const lg = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    lg.addColorStop(0, phase ? 'rgba(255,64,64,0.30)' : 'rgba(64,96,255,0.30)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-30, -30, 60, 60);
  }
  if (c.unit === 'detective') { ctx.fillStyle = '#d8b25c'; ctx.fillRect(-14, -2, 4, 4); }
  if (c.unit === 'roadblock') {
    ctx.fillStyle = '#ff8c3a';
    ctx.fillRect(-18, -13, 4, 4); ctx.fillRect(-18, 9, 4, 4);
    ctx.fillRect(14, -13, 4, 4); ctx.fillRect(14, 9, 4, 4);
  }
  if (c.popped) {
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('FLAT', 0, -14);
  }
  if (c.wrecked) {
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    ctx.beginPath(); ctx.arc(8, 0, 5 + Math.sin(state.time * 3 + c.id) * 1.5, 0, 7); ctx.fill();
  }
  ctx.restore();
  if (c.kind === 'rival') label(ctx, c.x, c.y - 26, 'SABLE ROOK', '#ff9d5c');
  if (c === state.playerCar) {
    ctx.strokeStyle = 'rgba(255,210,122,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(c.x, c.y, 23 + Math.sin(state.time * 4) * 1.6, 0, 7); ctx.stroke();
  }
}

export function label(ctx, x, y, text, color) {
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(5,5,10,0.72)';
  const w = ctx.measureText(text).width + 10;
  ctx.fillRect(x - w / 2, y - 10, w, 15);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 1);
}

export function drawPed(ctx, p, isOfficer) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.state === 'down') {
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = isOfficer ? '#31435f' : p.coat;
    rr(ctx, -8, -4, 16, 8, 4); ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath(); ctx.arc(10, 0, 3.6, 0, 7); ctx.fill();
  } else {
    const step = Math.sin(p.phase) * 2.2;
    ctx.strokeStyle = '#22222a'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(p.angle) * 4 + Math.sin(p.angle) * step, -Math.sin(p.angle) * 4 - Math.cos(p.angle) * step);
    ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(p.angle) * 4 - Math.sin(p.angle) * step, -Math.sin(p.angle) * 4 + Math.cos(p.angle) * step);
    ctx.stroke();
    ctx.fillStyle = isOfficer ? '#31435f' : p.coat;
    ctx.beginPath(); ctx.arc(0, 0, 5.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 2.4, Math.sin(p.angle) * 2.4, 3.1, 0, 7); ctx.fill();
    if (isOfficer) { ctx.fillStyle = '#d8b25c'; ctx.fillRect(-3, -3, 6, 2); }
  }
  ctx.restore();
}

export function drawPlayerOnFoot(ctx, state) {
  const p = state.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(1, 3, 8, 6, 0, 0, 7); ctx.fill();
  const step = Math.sin(p.phase) * 2.6;
  ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(p.angle) * 4.4 + Math.sin(p.angle) * step, -Math.sin(p.angle) * 4.4 - Math.cos(p.angle) * step);
  ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(p.angle) * 4.4 - Math.sin(p.angle) * step, -Math.sin(p.angle) * 4.4 + Math.cos(p.angle) * step);
  ctx.stroke();
  ctx.fillStyle = '#e86a2e';
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#f2d0a4';
  ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 2.6, Math.sin(p.angle) * 2.6, 3.4, 0, 7); ctx.fill();
  ctx.restore();
  // Hotwire progress ring.
  if (p.hotwire) {
    const frac = p.hotwire.t / p.hotwire.need;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(p.x, p.y - 20, 10, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffd27a';
    ctx.beginPath(); ctx.arc(p.x, p.y - 20, 10, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    label(ctx, p.x, p.y - 40, 'HOTWIRING…', '#ffd27a');
  }
}

export function drawMarkers(ctx, state) {
  for (const mk of state.markers) {
    const colors = { pickup: '#ffd27a', drop: '#7ed492', cash: '#ffd27a' };
    const col = colors[mk.kind] || '#fff';
    const pulse = 30 + Math.sin(state.time * 3.4) * 5;
    // Light column.
    const grad = ctx.createLinearGradient(0, mk.y - 190, 0, mk.y);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, col + '55');
    ctx.fillStyle = grad;
    ctx.fillRect(mk.x - 7, mk.y - 190, 14, 190);
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, pulse, 0, 7); ctx.stroke();
    ctx.strokeStyle = col + '88'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, pulse * 0.62, 0, 7); ctx.stroke();
    label(ctx, mk.x, mk.y - pulse - 12, mk.label, col);
  }
}

export function drawFx(ctx, state) {
  for (const p of fx.parts) {
    const a = 1 - p.t / p.life;
    if (p.kind === 'spark') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a * 0.32;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.t * 0.9), 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (const t of fx.texts) {
    const a = 1 - t.t / t.life;
    ctx.font = `bold ${t.size}px system-ui`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(t.text, t.x + 1.5, t.y + 1.5);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

// --- in-canvas panels ---------------------------------------------------------

function panel(ctx, x, y, w, h, title) {
  ctx.fillStyle = 'rgba(8,9,16,0.78)';
  rr(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,233,184,0.25)';
  ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, 8); ctx.stroke();
  if (title) {
    ctx.fillStyle = '#b9a8e8';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + 10, y + 16);
  }
}

function drawMinimap(ctx, state) {
  const w = 196, h = 147, x = VIEW_W - w - 14, y = 64;
  panel(ctx, x, y, w, h, null);
  const sx = w / WORLD_W, sy = h / WORLD_H;
  for (let cx = 0; cx < 3; cx++) for (let cy = 0; cy < 2; cy++) {
    ctx.fillStyle = DISTRICTS[cy * 3 + cx].tint;
    ctx.fillRect(x + cx * w / 3, y + cy * h / 2, w / 3, h / 2);
  }
  ctx.strokeStyle = 'rgba(200,200,215,0.35)';
  for (let i = 0; i <= 12; i += 2) { ctx.beginPath(); ctx.moveTo(x + i * PITCH * sx, y); ctx.lineTo(x + i * PITCH * sx, y + h); ctx.stroke(); }
  for (let j = 0; j <= 9; j += 2) { ctx.beginPath(); ctx.moveTo(x, y + j * PITCH * sy); ctx.lineTo(x + w, y + j * PITCH * sy); ctx.stroke(); }
  ctx.fillStyle = '#7ed492';
  for (const g of city.garages) ctx.fillRect(x + g.cx * sx - 2, y + g.cy * sy - 2, 4, 4);
  ctx.fillStyle = '#ffd27a';
  for (const mk of state.markers) ctx.fillRect(x + mk.x * sx - 2.5, y + mk.y * sy - 2.5, 5, 5);
  const flash = Math.floor(state.time * 3) % 2 === 0;
  for (const u of state.units) {
    ctx.fillStyle = state.heat.stars >= 4 && flash ? '#ff5f5f' : '#6ea8ff';
    ctx.fillRect(x + u.x * sx - 2, y + u.y * sy - 2, 4, 4);
  }
  const p = state.player;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 3.2, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(x + (state.cam.x - VIEW_W / 2) * sx, y + (state.cam.y - VIEW_H / 2) * sy, VIEW_W * sx, VIEW_H * sy);
}

function drawThreats(ctx, state) {
  const x = VIEW_W - 210, y = 219, w = 196;
  const near = state.units
    .map((u) => ({ u, d: Math.hypot(u.x - state.player.x, u.y - state.player.y) }))
    .sort((a, b) => a.d - b.d).slice(0, 3);
  panel(ctx, x, y, w, 30 + near.length * 17 + 8, 'INCOMING');
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  if (near.length === 0) {
    ctx.fillStyle = '#7ed492';
    ctx.fillText(state.heat.noEyes > 2 ? 'UNSEEN — the Net is slipping' : 'No units in sight', x + 10, y + 36);
  }
  near.forEach((n, i) => {
    ctx.fillStyle = n.d < 200 ? '#ff5f5f' : n.d < 380 ? '#ffb84c' : '#c9d2e0';
    ctx.fillText(`${UNIT_TYPES[n.u.unit].label} — ${Math.round(n.d / 10)}m`, x + 10, y + 36 + i * 17);
  });
}

function drawMods(ctx, state) {
  if (state.mods.size === 0) return;
  const names = MODS.filter((m) => state.mods.has(m.id)).map((m) => m.name);
  const x = 14, y = VIEW_H - 34 - names.length * 0 - 12;
  panel(ctx, x, y - 8, 250, 30, null);
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('MODS: ' + names.join(' · '), x + 10, y + 11, 232);
}

function drawBanner(ctx, state) {
  const b = fx.banner;
  if (!b) return;
  const a = b.t < 0.25 ? b.t / 0.25 : b.t > b.hold - 0.4 ? Math.max(0, (b.hold - b.t) / 0.4) : 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px system-ui';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(b.text, VIEW_W / 2 + 2, 138 + 2);
  ctx.fillStyle = b.color;
  ctx.fillText(b.text, VIEW_W / 2, 138);
  if (b.sub) {
    ctx.font = '15px system-ui';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(b.sub, VIEW_W / 2 + 1, 162 + 1);
    ctx.fillStyle = '#e8e4da';
    ctx.fillText(b.sub, VIEW_W / 2, 162);
  }
  ctx.restore();
}

function drawBustedMeter(ctx, state) {
  if (state.bustedMeter <= 0.02) return;
  const p = state.player;
  ctx.save();
  ctx.translate(-state.cam.x + VIEW_W / 2, -state.cam.y + VIEW_H / 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(p.x, p.y - 34, 13, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#ff5f5f';
  ctx.beginPath(); ctx.arc(p.x, p.y - 34, 13, -Math.PI / 2, -Math.PI / 2 + state.bustedMeter * Math.PI * 2); ctx.stroke();
  label(ctx, p.x, p.y - 56, 'THEY HAVE YOU — MOVE!', '#ff5f5f');
  ctx.restore();
}

// --- screens ------------------------------------------------------------------

function backdrop(ctx, state) {
  ctx.save();
  ctx.translate(VIEW_W / 2 - state.cam.x, VIEW_H / 2 - state.cam.y);
  drawWorld(ctx, state, false);
  for (const c of state.cars) drawCar(ctx, state, c);
  ctx.restore();
  ctx.fillStyle = 'rgba(6,6,14,0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function drawTitle(ctx, state) {
  backdrop(ctx, state);
  const F = state.flavour;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 64px system-ui';
  ctx.fillText('HOTWIRE CITY', VIEW_W / 2, 108);
  ctx.fillStyle = '#ff9d5c';
  ctx.font = 'bold 25px system-ui';
  ctx.fillText(F.name, VIEW_W / 2, 146);
  ctx.fillStyle = '#e8e4da';
  ctx.font = '15px system-ui';
  ctx.fillText(F.tagline, VIEW_W / 2, 172);
  ctx.fillStyle = '#9fb4d8';
  ctx.font = '13px system-ui';
  ctx.fillText('You are the wheelman Dray\u2019s Net cannot hold. Any car at the kerb is yours in a second — run the fare, ditch the car, stay unpinned.', VIEW_W / 2, 196);

  // Left: controls + difficulties.
  panel(ctx, 56, 224, 520, 300, 'HOW TO PLAY');
  ctx.fillStyle = '#e8e4da';
  ctx.font = '14.5px system-ui';
  ctx.textAlign = 'left';
  const lines = [
    'WASD / arrows — walk, or drive the car you are in',
    'E — hotwire the car at your elbow (0.9 s at the door)',
    'SPACE — handbrake: drift, swing the tail, chain combos',
    'SHIFT — sprint on foot · nitro burst with NITRO TANKS',
    'F — fire a decoy flare (with DECOY FLARES drafted)',
    'The Net tightens ring by ring: lose every eye 5 s, it slips',
    'Garages (green) shed a ring if you park inside and hold',
    'Pinned = held slow in a crew\u2019s reach. That ends runs.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, 76, 258 + i * 24));
  ctx.fillStyle = '#b9a8e8';
  ctx.font = 'bold 10px system-ui';
  ctx.fillText('DIFFICULTY — CLICK OR PRESS 1/2/3', 76, 478);
  DIFFICULTIES.forEach((d, i) => {
    const x = 76 + i * 168, sel = state.diff.id === d.id;
    ctx.fillStyle = sel ? 'rgba(255,210,122,0.25)' : 'rgba(255,255,255,0.05)';
    rr(ctx, x, 486, 156, 30, 6); ctx.fill();
    ctx.fillStyle = sel ? '#ffd27a' : '#c9d2e0';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(d.name, x + 78, 506);
    ctx.textAlign = 'left';
  });

  // Right: the NET roster.
  panel(ctx, 604, 224, 620, 300, 'DRAY\u2019S NET — THE SIX PURSUERS');
  let y = 254;
  for (const key of ['cruiser', 'interceptor', 'detective', 'roadblock', 'spikevan', 'footpatrol']) {
    const u = UNIT_TYPES[key];
    ctx.fillStyle = u.color;
    rr(ctx, 624, y - 11, 26, 13, 3); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 12.5px system-ui';
    ctx.fillText(u.label, 660, y);
    ctx.fillStyle = '#c9d2e0';
    ctx.font = '12.5px system-ui';
    ctx.fillText(u.line, 660, y + 16, 545);
    y += 45;
  }
  if (F.arc) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9d5c';
    ctx.font = 'bold 13.5px system-ui';
    ctx.fillText(F.arc, VIEW_W / 2, 556);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ed492';
  ctx.font = 'bold 21px system-ui';
  ctx.fillText(state.best > 0 ? `BEST ${state.best.toLocaleString('en-US')} — CLICK OR PRESS ENTER TO RUN` : 'CLICK OR PRESS ENTER TO RUN', VIEW_W / 2, 586);
  ctx.fillStyle = '#8a93a5';
  ctx.font = '13px system-ui';
  ctx.fillText('9 street mods wait in the safehouse draft: nitro, ghost plates, decoy flares and more.', VIEW_W / 2, 614);
}

export function drawSafehouse(ctx, state) {
  backdrop(ctx, state);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 34px system-ui';
  ctx.fillText('SAFEHOUSE', VIEW_W / 2, 90);
  ctx.fillStyle = '#e8e4da';
  ctx.font = '15px system-ui';
  ctx.fillText(state.metaDraft ? 'The city cools. Pick one mod — it is yours for the rest of the run.' : 'The city cools. Check the map, then roll out.', VIEW_W / 2, 114);
  // District path-map.
  const mp = META.map;
  panel(ctx, mp.x, mp.y, mp.w, mp.h, 'THE CITY — DISTRICTS & PRESSURE');
  const cw = (mp.w - 40) / 3, ch = (mp.h - 90) / 2;
  for (let cx = 0; cx < 3; cx++) for (let cy = 0; cy < 2; cy++) {
    const d = DISTRICTS[cy * 3 + cx];
    const x = mp.x + 20 + cx * cw, y = mp.y + 44 + cy * ch;
    ctx.fillStyle = d.tint;
    rr(ctx, x, y, cw - 10, ch - 10, 8); ctx.fill();
    ctx.strokeStyle = d.accent; ctx.globalAlpha = 0.6;
    rr(ctx, x, y, cw - 10, ch - 10, 8); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = d.accent;
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(d.name, x + (cw - 10) / 2, y + 28);
    ctx.fillStyle = '#c9d2e0';
    ctx.font = '12px system-ui';
    ctx.fillText(d.sub, x + (cw - 10) / 2, y + 48);
    const pressure = state.m && state.m.pressure ? (state.m.pressure[d.name] || 0) : 0;
    if (pressure > 0) {
      ctx.fillStyle = '#ff5f5f';
      ctx.font = 'bold 12px system-ui';
      ctx.fillText('▲'.repeat(Math.min(5, pressure)) + ` patrol pressure ${pressure}`, x + (cw - 10) / 2, y + 72);
    }
    const here = state.districtName === d.name;
    if (here) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText('● YOU ARE HERE', x + (cw - 10) / 2, y + ch - 22);
    }
  }
  // Next-job card under the map.
  ctx.fillStyle = '#e8e4da';
  ctx.font = '13.5px system-ui';
  ctx.textAlign = 'left';
  const o = state.objective;
  if (o) {
    ctx.fillStyle = '#ffd27a';
    ctx.fillText('NEXT JOB', mp.x + 20, mp.y + mp.h - 58);
    ctx.fillStyle = '#e8e4da';
    ctx.fillText(o.title, mp.x + 20, mp.y + mp.h - 36, mp.w - 40);
    ctx.fillStyle = '#9fb4d8';
    ctx.fillText(o.detail, mp.x + 20, mp.y + mp.h - 16, mp.w - 40);
  }
  // Draft cards or roll-out.
  if (state.metaDraft) {
    ctx.fillStyle = '#b9a8e8';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('STREET MOD DRAFT — CLICK A CARD (OR PRESS 1/2/3)', 756, 140);
    state.metaChoices.forEach((mod, i) => {
      const c = META.cards[i];
      ctx.fillStyle = 'rgba(20,22,36,0.92)';
      rr(ctx, c.x, c.y, c.w, c.h, 10); ctx.fill();
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.4;
      rr(ctx, c.x, c.y, c.w, c.h, 10); ctx.stroke();
      ctx.fillStyle = '#ffd27a';
      ctx.font = 'bold 19px system-ui';
      ctx.fillText(`${i + 1} · ${mod.name}`, c.x + 20, c.y + 36);
      ctx.fillStyle = '#e8e4da';
      ctx.font = '14.5px system-ui';
      ctx.fillText(mod.line, c.x + 20, c.y + 66, c.w - 40);
      ctx.fillStyle = '#8a93a5';
      ctx.font = '12px system-ui';
      ctx.fillText(state.mods.has(mod.id) ? 'Already fitted' : 'Fitted instantly. No charge — the house owes you.', c.x + 20, c.y + 92);
    });
  } else {
    const r = META.roll;
    ctx.fillStyle = 'rgba(126,212,146,0.2)';
    rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    ctx.strokeStyle = '#7ed492'; ctx.lineWidth = 1.4;
    rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke();
    ctx.fillStyle = '#7ed492';
    ctx.font = 'bold 19px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('ROLL OUT — ENTER', r.x + r.w / 2, r.y + 35);
  }
}

export function gradeOf(score) {
  return score >= 60000 ? 'S' : score >= 42000 ? 'A' : score >= 28000 ? 'B' : score >= 15000 ? 'C' : 'D';
}

export function drawEnd(ctx, state) {
  backdrop(ctx, state);
  const won = state.endKind === 'win';
  ctx.textAlign = 'center';
  ctx.fillStyle = won ? '#7ed492' : '#ff5f5f';
  ctx.font = 'bold 40px system-ui';
  ctx.fillText(won ? 'CITY CLEARED' : state.endKind === 'busted' ? 'PINNED' : 'THE CITY WINS', VIEW_W / 2, 106);
  ctx.fillStyle = '#e8e4da';
  ctx.font = '16px system-ui';
  ctx.fillText(state.endLine || '', VIEW_W / 2, 136);
  // Grade + headline numbers.
  const grade = gradeOf(state.score);
  ctx.fillStyle = grade === 'S' ? '#ffd27a' : grade === 'A' ? '#7ed492' : '#c9d2e0';
  ctx.font = 'bold 120px system-ui';
  ctx.fillText(grade, 240, 300);
  ctx.font = 'bold 15px system-ui';
  ctx.fillStyle = '#b9a8e8';
  ctx.fillText('FINAL GRADE', 240, 336);
  ctx.textAlign = 'left';
  ctx.font = 'bold 30px system-ui';
  ctx.fillStyle = '#ffd27a';
  ctx.fillText(`SCORE ${state.score.toLocaleString('en-US')}`, 420, 218);
  ctx.fillStyle = '#7ed492';
  ctx.fillText(`CASH $${state.cash.toLocaleString('en-US')}`, 420, 258);
  ctx.fillStyle = '#c9d2e0';
  ctx.font = '16px system-ui';
  ctx.fillText(`Best combo ×${state.stats.bestCombo.toFixed(1)} · Top speed ${Math.round(state.stats.topSpeed * 0.36)} km/h · Time in the Net ${Math.round(state.stats.timeWanted)}s`, 420, 292);
  // Stat grid.
  const stats = [
    ['Fares / drops done', state.flavour.id === 'a' ? state.stats.faresDone : state.stats.dropsDone],
    ['Clients picked up', state.stats.pickups],
    ['Cars lifted', state.stats.carsLifted],
    ['Near misses', state.stats.nearMisses],
    ['Crashes', state.stats.crashes],
    ['Mods fitted', state.stats.modsTaken],
    ...state.flavour.extraStats(state),
  ];
  panel(ctx, 400, 330, 700, 196, 'RUN RECORD');
  ctx.font = '14.5px system-ui';
  stats.forEach((s, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 424 + col * 340, y = 366 + row * 30;
    ctx.fillStyle = '#9fb4d8';
    ctx.textAlign = 'left';
    ctx.fillText(s[0], x, y);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(String(s[1]), x + 300, y);
    ctx.textAlign = 'left';
  });
  // Mod recap.
  const owned = MODS.filter((m) => state.mods.has(m.id));
  ctx.fillStyle = '#b9a8e8';
  ctx.font = 'bold 11px system-ui';
  ctx.fillText('MODS FITTED', 424, 560);
  ctx.fillStyle = '#ffd27a';
  ctx.font = '13.5px system-ui';
  ctx.fillText(owned.length ? owned.map((m) => m.name).join('  ·  ') : 'None — a stock run.', 424, 582, 660);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ed492';
  ctx.font = 'bold 19px system-ui';
  ctx.fillText('CLICK OR PRESS ENTER — RUN IT AGAIN', VIEW_W / 2, 664);
}

// --- top-level -----------------------------------------------------------------

export function draw(ctx, state) {
  ctx.fillStyle = '#07070d';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (state.mode === 'title') { drawTitle(ctx, state); return; }
  if (state.mode === 'meta') { drawSafehouse(ctx, state); return; }
  if (state.mode === 'end') { drawEnd(ctx, state); return; }
  ctx.save();
  const shx = fx.shake ? (hash2(state.frame, 1) - 0.5) * fx.shake : 0;
  const shy = fx.shake ? (hash2(state.frame, 2) - 0.5) * fx.shake : 0;
  ctx.translate(VIEW_W / 2 - state.cam.x + shx, VIEW_H / 2 - state.cam.y + shy);
  drawWorld(ctx, state);
  drawMarkers(ctx, state);
  for (const c of state.cars) drawCar(ctx, state, c);
  for (const u of state.units) drawCar(ctx, state, u);
  for (const p of state.peds) drawPed(ctx, p, false);
  for (const o of state.officers) drawPed(ctx, o, true);
  if (!state.playerCar) drawPlayerOnFoot(ctx, state);
  drawFx(ctx, state);
  ctx.restore();
  drawMinimap(ctx, state);
  drawThreats(ctx, state);
  drawMods(ctx, state);
  drawBustedMeter(ctx, state);
  drawBanner(ctx, state);
  if (state.mode === 'busted') {
    ctx.fillStyle = 'rgba(80,8,8,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5f5f';
    ctx.font = 'bold 64px system-ui';
    ctx.fillText('PINNED', VIEW_W / 2, VIEW_H / 2);
  }
  if (state.paused) {
    ctx.fillStyle = 'rgba(6,6,14,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e4da';
    ctx.font = 'bold 34px system-ui';
    ctx.fillText('PAUSED — P to resume', VIEW_W / 2, VIEW_H / 2);
  }
}
