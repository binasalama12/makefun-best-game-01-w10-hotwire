// police.js — the heat model and the six unit brains. Heat is points:
// crimes add them when witnessed, they drain when no unit has eyes on
// you, and stars = ceil(points/100). Units spawn on the road ring around
// the player, pursue with distinct behaviours per type, set roadblocks
// and lay spike strips. Busted pressure is measured in main.js.

import { UNIT_TYPES, HEAT_TABLE } from './config.js';
import { clamp, angleTo, turnToward, dist2 } from './rng.js';
import { makeCar, stepCar, carSpeed } from './cars.js';
import { randomRoadPoint, nearestIntersection, streetCenterX, streetCenterY } from './city.js';

export function starsOf(points) {
  return points <= 0 ? 0 : Math.min(5, Math.ceil(points / 100));
}

export function anyUnitNear(state, x, y, r) {
  const r2 = r * r;
  for (const u of state.units) if (dist2(x, y, u.x, u.y) < r2) return true;
  for (const o of state.officers) if (dist2(x, y, o.x, o.y) < r2) return true;
  return false;
}

export function witnessed(state, x, y) { return anyUnitNear(state, x, y, 430); }

export function hasEyes(state) {
  const p = state.player;
  if (anyUnitNear(state, p.x, p.y, 430)) return true;
  return state.detectiveTailing > 0;
}

// Add heat for a crime. Unwitnessed crimes still smoulder at 35%.
export function addHeat(state, amount, x, y) {
  const seen = witnessed(state, x, y);
  const ghost = state.mods.has('ghost') && seen ? 0.7 : 1;
  state.heat.points = clamp(state.heat.points + amount * (seen ? 1 : 0.35) * ghost * state.diff.heatGain, 0, 500);
  if (seen) state.heat.noEyes = 0;
  return seen;
}

export function updateHeat(state, dt) {
  const h = state.heat;
  if (hasEyes(state)) h.noEyes = 0; else h.noEyes += dt;
  let floor = state.missionHeatFloor || 0;
  if (state.detectiveTailing > 0) floor = Math.max(floor, 100);
  if (h.noEyes > 5) {
    const rate = 13 * state.diff.heatDecay * (state.mods.has('jammer') ? 1.6 : 1);
    h.points = Math.max(floor, h.points - rate * dt);
  } else if (h.points < floor) {
    h.points = Math.min(floor, h.points + 22 * dt);
  }
  h.stars = starsOf(h.points);
}

function steerTo(car, tx, ty, dt, aggression = 1) {
  const want = angleTo(car.x, car.y, tx, ty);
  let d = (want - car.angle) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return clamp(d * 2.2 * aggression, -1, 1);
}

function spawnUnit(state, kind) {
  const p = state.player;
  for (let tries = 0; tries < 12; tries++) {
    const pt = randomRoadPoint(state.rng);
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d < 640 || d > 1080) continue;
    const car = makeCar(pt.x, pt.y, 0, UNIT_TYPES[kind], 'police');
    car.unit = kind;
    car.angle = angleTo(pt.x, pt.y, p.x, p.y);
    state.units.push(car);
    return car;
  }
  return null;
}

function countKind(state, kind) {
  let n = 0;
  for (const u of state.units) if (u.unit === kind) n++;
  return n;
}

// Keep the fielded units matched to the heat table for the star level.
export function manageUnits(state, dt) {
  const want = HEAT_TABLE[state.heat.stars];
  state.spawnCd -= dt;
  for (const kind of ['cruiser', 'detective', 'interceptor', 'spikevan']) {
    if (countKind(state, kind) < want[kind] && state.spawnCd <= 0) {
      if (spawnUnit(state, kind)) state.spawnCd = 1.4;
    }
  }
  // Foot patrols drift around busy corners and respawn near the player.
  while (state.officers.length < want.footpatrol) {
    const pt = randomRoadPoint(state.rng);
    if (Math.hypot(pt.x - state.player.x, pt.y - state.player.y) < 380) continue;
    state.officers.push({
      x: pt.x + (state.rng() - 0.5) * 70, y: pt.y + (state.rng() - 0.5) * 70,
      angle: 0, speed: UNIT_TYPES.footpatrol.speed, phase: state.rng() * 6,
    });
    if (state.officers.length >= want.footpatrol) break;
  }
  // Cull units that fell hopelessly behind when the heat is low.
  const p = state.player;
  state.units = state.units.filter((u) => {
    if (u.unit === 'roadblock') return u.blockUntil > state.time;
    return Math.hypot(u.x - p.x, u.y - p.y) < 1500 || state.heat.stars >= 3;
  });
  state.officers = state.officers.filter((o) => Math.hypot(o.x - p.x, o.y - p.y) < 900);
  // Roadblocks at 4+ stars, on an intersection ahead of the player.
  state.blockCd -= dt;
  if (want.roadblock > 0 && countKind(state, 'roadblock') < want.roadblock * 2 && state.blockCd <= 0) {
    placeRoadblock(state);
    state.blockCd = 9;
  }
}

function placeRoadblock(state) {
  const p = state.player;
  const ref = state.playerCar || p;
  const aheadX = ref.x + Math.cos(ref.angle) * 560;
  const aheadY = ref.y + Math.sin(ref.angle) * 560;
  const inter = nearestIntersection(aheadX, aheadY);
  const vertical = Math.abs(Math.sin(ref.angle)) < 0.7;
  for (let k = -1; k <= 1; k += 2) {
    const car = makeCar(
      inter.x + (vertical ? k * 24 : 0), inter.y + (vertical ? 0 : k * 24),
      vertical ? 0 : Math.PI / 2, UNIT_TYPES.roadblock, 'police');
    car.unit = 'roadblock';
    car.blockUntil = state.time + 26;
    state.units.push(car);
  }
}

export function updateUnits(state, dt, events) {
  const p = state.player;
  const pc = state.playerCar;
  const tx = pc ? pc.x : p.x, ty = pc ? pc.y : p.y;
  const tvx = pc ? pc.vx : 0, tvy = pc ? pc.vy : 0;
  state.detectiveTailing = Math.max(0, state.detectiveTailing - dt);

  for (const u of state.units) {
    if (u.unit === 'roadblock') continue;
    const d = Math.hypot(u.x - tx, u.y - ty);
    if (d < 470) { u.lastKnownX = tx; u.lastKnownY = ty; u.sightLoss = 0; }
    else u.sightLoss = (u.sightLoss || 0) + dt;

    let ctl = { throttle: 0, steer: 0, handbrake: false, boost: false };
    if (u.unit === 'cruiser' || u.unit === 'interceptor') {
      const lead = u.unit === 'interceptor' ? 0.55 : 0.18;
      const gx = u.lastKnownX + tvx * lead, gy = u.lastKnownY + tvy * lead;
      ctl.steer = steerTo(u, gx, gy, dt, u.unit === 'interceptor' ? 1.25 : 1);
      const gd = Math.hypot(u.x - gx, u.y - gy);
      ctl.throttle = gd > 60 ? 1 : gd > 26 ? 0.45 : -0.2;
      if ((u.sightLoss || 0) > 5) { // lost them: sweep to a nearby street
        const pt = randomRoadPoint(state.rng);
        ctl.steer = steerTo(u, pt.x, pt.y, dt);
        ctl.throttle = 0.5;
      }
    } else if (u.unit === 'detective') {
      ctl.steer = steerTo(u, tx, ty, dt);
      if (d > 290) ctl.throttle = 0.85;
      else if (d < 195) ctl.throttle = -0.35;
      else ctl.throttle = 0.25;
      if (d < 330) state.detectiveTailing = 0.6;
    } else if (u.unit === 'spikevan') {
      const aheadX = tx + tvx * 1.5 + Math.cos(pc ? pc.angle : 0) * 330;
      const aheadY = ty + tvy * 1.5 + Math.sin(pc ? pc.angle : 0) * 330;
      const inter = nearestIntersection(aheadX, aheadY);
      const gx = streetCenterX(inter.i), gy = streetCenterY(inter.j);
      ctl.steer = steerTo(u, gx, gy, dt);
      ctl.throttle = Math.hypot(u.x - gx, u.y - gy) > 50 ? 0.9 : 0;
      u.stripAt -= dt;
      if (Math.hypot(u.x - gx, u.y - gy) < 60 && u.stripAt <= 0 && d > 220 && d < 520) {
        state.strips.push({ x: gx, y: gy, angle: Math.atan2(gy - u.y, gx - u.x), until: state.time + 22 });
        events.push({ kind: 'strip', x: gx, y: gy });
        u.stripAt = 14;
      }
    }
    const impact = stepCar(u, ctl, dt);
    if (impact > 130 && u.unit !== 'roadblock') u.hull -= (impact - 120) * 0.05;
    if (u.hull <= 0 && !u.wrecked) { u.wrecked = true; events.push({ kind: 'unitdown', x: u.x, y: u.y }); }
  }

  // Foot patrol: chase a player on foot, scatter from cars.
  for (const o of state.officers) {
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (!pc && d < 320) {
      o.angle = turnToward(o.angle, angleTo(o.x, o.y, p.x, p.y), 8 * dt);
      o.x += Math.cos(o.angle) * o.speed * dt;
      o.y += Math.sin(o.angle) * o.speed * dt;
    } else if (pc && Math.hypot(o.x - pc.x, o.y - pc.y) < 90) {
      o.angle = turnToward(o.angle, angleTo(pc.x, pc.y, o.x, o.y), 8 * dt);
      o.x += Math.cos(o.angle) * 120 * dt;
      o.y += Math.sin(o.angle) * 120 * dt;
    }
    o.phase += dt * 8;
  }

  // Spike strips vs the player's tyres.
  if (pc && !state.mods.has('runflat') && !pc.popped) {
    for (const s of state.strips) {
      if (state.time > s.until) continue;
      if (Math.hypot(pc.x - s.x, pc.y - s.y) < 30 && carSpeed(pc) > 40) {
        pc.popped = true;
        events.push({ kind: 'popped', x: pc.x, y: pc.y });
      }
    }
  }
  state.strips = state.strips.filter((s) => state.time <= s.until);
}
