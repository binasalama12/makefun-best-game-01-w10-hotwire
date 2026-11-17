// city.js — generates the city once from a seed: building blocks with
// procedural roofs, parks, the precinct, four parking garages (heat
// vents), market plazas and the Portside docks. Also owns collision
// (circle vs building rects) and road-graph helpers every driver uses.

import { PITCH, ROAD_W, GRID_X, GRID_Y, WORLD_W, WORLD_H, DISTRICTS, districtAt } from './config.js';
import { makeRng, randInt, randRange, clamp } from './rng.js';

export const city = {
  buildings: [],   // {x,y,w,h,hgt,color,winSeed}
  trees: [],       // {x,y,r}
  stalls: [],      // market stall rects (collidable)
  containers: [],  // dock container rects (collidable)
  garages: [],     // {x,y,w,h,cx,cy,district}
  cells: [],       // {i,j,kind}
  precinct: null,  // {x,y,w,h,cx,cy}
  index: new Map(),
};

const ROOF_TONES = ['#4b4258', '#584a52', '#3f4a5a', '#5a4632', '#46523f', '#52455e', '#3a3f52', '#5e4a3a'];

function cellKey(cx, cy) { return cx + ':' + cy; }

function addRect(list, r) {
  list.push(r);
  const x0 = Math.floor(r.x / PITCH), x1 = Math.floor((r.x + r.w) / PITCH);
  const y0 = Math.floor(r.y / PITCH), y1 = Math.floor((r.y + r.h) / PITCH);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const k = cellKey(cx, cy);
    if (!city.index.has(k)) city.index.set(k, []);
    city.index.get(k).push(r);
  }
}

export function buildCity(seed) {
  city.buildings.length = 0; city.trees.length = 0; city.stalls.length = 0;
  city.containers.length = 0; city.garages.length = 0; city.cells.length = 0;
  city.index.clear();
  const rng = makeRng(seed);
  // Special cells picked first: garages spread across the map, precinct
  // near the middle, docks along the Portside (south-west) block row.
  const garageCells = new Set(['1:1', '9:1', '5:6', '10:6']);
  const precinctCell = '5:3';
  for (let i = 0; i < GRID_X - 1; i++) {
    for (let j = 0; j < GRID_Y - 1; j++) {
      const bx = i * PITCH + ROAD_W, by = j * PITCH + ROAD_W;
      const bw = PITCH - ROAD_W, bh = PITCH - ROAD_W;
      const key = i + ':' + j;
      let kind = 'buildings';
      if (garageCells.has(key)) kind = 'garage';
      else if (key === precinctCell) kind = 'precinct';
      else if (j === GRID_Y - 2 && i < 4) kind = 'dock';
      else if (rng() < 0.10) kind = 'park';
      else if (rng() < 0.06) kind = 'plaza';
      city.cells.push({ i, j, kind });
      const d = districtAt(bx + bw / 2, by + bh / 2);

      if (kind === 'buildings') {
        const layout = randInt(rng, 0, 3);
        const inset = 16, gap = 14;
        const mk = (x, y, w, h) => addRect(city.buildings, {
          x, y, w, h, hgt: randRange(rng, 14, 46),
          color: ROOF_TONES[randInt(rng, 0, ROOF_TONES.length - 1)],
          winSeed: randInt(rng, 1, 99999), district: d.name,
        });
        if (layout === 0) mk(bx + inset, by + inset, bw - inset * 2, bh - inset * 2);
        else if (layout === 1) {
          const w = (bw - inset * 2 - gap) / 2;
          mk(bx + inset, by + inset, w, bh - inset * 2);
          mk(bx + inset + w + gap, by + inset, w, bh - inset * 2);
        } else if (layout === 2) {
          const h = (bh - inset * 2 - gap) / 2;
          mk(bx + inset, by + inset, bw - inset * 2, h);
          mk(bx + inset, by + inset + h + gap, bw - inset * 2, h);
        } else {
          const w = (bw - inset * 2 - gap) / 2, h = (bh - inset * 2 - gap) / 2;
          mk(bx + inset, by + inset, w, h); mk(bx + inset + w + gap, by + inset, w, h);
          mk(bx + inset, by + inset + h + gap, w, h); mk(bx + inset + w + gap, by + inset + h + gap, w, h);
        }
      } else if (kind === 'park') {
        const n = randInt(rng, 7, 12);
        for (let t = 0; t < n; t++) {
          city.trees.push({ x: bx + randRange(rng, 26, bw - 26), y: by + randRange(rng, 26, bh - 26), r: randRange(rng, 13, 22) });
        }
      } else if (kind === 'plaza') {
        const n = randInt(rng, 4, 6);
        for (let s = 0; s < n; s++) {
          addRect(city.stalls, {
            x: bx + randRange(rng, 18, bw - 66), y: by + randRange(rng, 18, bh - 40),
            w: 46, h: 24, hgt: 8, color: '#7a5230', winSeed: 1, district: d.name,
          });
        }
      } else if (kind === 'garage') {
        // A drive-in box: three walls and an open south mouth; the inner
        // floor is the vent zone. Walls are thin collidable rects.
        const gx = bx + 24, gy = by + 24, gw = bw - 48, gh = bh - 48;
        addRect(city.buildings, { x: gx, y: gy, w: gw, h: 12, hgt: 20, color: '#3c414d', winSeed: 7, district: d.name });
        addRect(city.buildings, { x: gx, y: gy, w: 12, h: gh, hgt: 20, color: '#3c414d', winSeed: 7, district: d.name });
        addRect(city.buildings, { x: gx + gw - 12, y: gy, w: 12, h: gh, hgt: 20, color: '#3c414d', winSeed: 7, district: d.name });
        city.garages.push({ x: gx, y: gy, w: gw, h: gh, cx: gx + gw / 2, cy: gy + gh / 2, district: d.name });
      } else if (kind === 'precinct') {
        addRect(city.buildings, {
          x: bx + 30, y: by + 30, w: bw - 60, h: bh - 60, hgt: 34,
          color: '#2e3d5c', winSeed: 42, district: d.name,
        });
        city.precinct = { x: bx, y: by, w: bw, h: bh, cx: bx + bw / 2, cy: by + bh + 26 };
      } else if (kind === 'dock') {
        const n = randInt(rng, 2, 4);
        for (let c = 0; c < n; c++) {
          addRect(city.containers, {
            x: bx + randRange(rng, 10, bw - 90), y: by + randRange(rng, 10, bh - 40),
            w: 76, h: 28, hgt: 16, color: ['#7a3b2e', '#2e5a6e', '#6e622e'][randInt(rng, 0, 2)],
            winSeed: 3, district: d.name,
          });
        }
      }
    }
  }
  return city;
}

// --- collision -------------------------------------------------------------
// Push a circle out of every building/stall/container rect it overlaps.
// Returns true when a push happened (callers turn that into crash juice).
export function collideCircle(p, r) {
  let hit = false;
  const cx = Math.floor(p.x / PITCH), cy = Math.floor(p.y / PITCH);
  for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
    const list = city.index.get(cellKey(ix, iy));
    if (!list) continue;
    for (const b of list) {
      const nx = clamp(p.x, b.x, b.x + b.w), ny = clamp(p.y, b.y, b.y + b.h);
      const dx = p.x - nx, dy = p.y - ny, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        p.x += dx * push; p.y += dy * push;
      } else {
        // Centre inside the rect: push out along the smallest exit.
        const exits = [
          { d: p.x - b.x, x: b.x - r, y: p.y }, { d: b.x + b.w - p.x, x: b.x + b.w + r, y: p.y },
          { d: p.y - b.y, x: p.x, y: b.y - r }, { d: b.y + b.h - p.y, x: p.x, y: b.y + b.h + r },
        ].sort((a, z) => a.d - z.d);
        p.x = exits[0].x; p.y = exits[0].y;
      }
    }
  }
  p.x = clamp(p.x, 8, WORLD_W - 8);
  p.y = clamp(p.y, 8, WORLD_H - 8);
  return hit;
}

export function pointInBuilding(x, y, pad = 0) {
  const cx = Math.floor(x / PITCH), cy = Math.floor(y / PITCH);
  for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
    const list = city.index.get(cellKey(ix, iy));
    if (!list) continue;
    for (const b of list) {
      if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
    }
  }
  return false;
}

// --- road graph --------------------------------------------------------------
export function onRoad(x, y) {
  return (x % PITCH) < ROAD_W || (y % PITCH) < ROAD_W;
}

export function streetCenterX(i) { return i * PITCH + ROAD_W / 2; }
export function streetCenterY(j) { return j * PITCH + ROAD_W / 2; }

// A random drivable point on the street grid (optionally in a district).
export function randomRoadPoint(rng, districtName = null) {
  for (let tries = 0; tries < 40; tries++) {
    const vertical = rng() < 0.5;
    const i = randInt(rng, 0, GRID_X - 1), j = randInt(rng, 0, GRID_Y - 1);
    const x = vertical ? streetCenterX(i) + randRange(rng, -26, 26) : randRange(rng, 30, WORLD_W - 30);
    const y = vertical ? randRange(rng, 30, WORLD_H - 30) : streetCenterY(j) + randRange(rng, -26, 26);
    if (districtName && districtAt(x, y).name !== districtName) continue;
    return { x, y };
  }
  return { x: streetCenterX(3), y: streetCenterY(3) };
}

// Nearest intersection centre to a point.
export function nearestIntersection(x, y) {
  const i = clamp(Math.round((x - ROAD_W / 2) / PITCH), 0, GRID_X - 1);
  const j = clamp(Math.round((y - ROAD_W / 2) / PITCH), 0, GRID_Y - 1);
  return { x: streetCenterX(i), y: streetCenterY(j), i, j };
}

export function garageAt(x, y) {
  for (const g of city.garages) {
    if (x > g.x && x < g.x + g.w && y > g.y && y < g.y + g.h) return g;
  }
  return null;
}
