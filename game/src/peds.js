// peds.js — pedestrians: they stroll the pavements, flee from fast cars
// and dive clear of danger. If one is clipped they go down (and get up
// again, unharmed but furious) — the heat system hears about it.

import { clamp, angleTo, turnToward, dist2 } from './rng.js';
import { collideCircle, onRoad } from './city.js';

let nextId = 1;
const COATS = ['#c9a86a', '#7fa3c9', '#c97f7f', '#8fc97f', '#b48fc9', '#c9c9c9', '#6a8a9a'];

export function makePed(rng, x, y) {
  return {
    id: nextId++, x, y, angle: rng() * Math.PI * 2,
    tx: x, ty: y, speed: 34 + rng() * 26,
    state: 'walk', timer: 0, coat: COATS[Math.floor(rng() * COATS.length)],
    phase: rng() * 6.28,
  };
}

export function spawnPed(rng, peds, roadPointFn) {
  const p = roadPointFn(rng);
  // Nudge to a pavement edge: offset perpendicular until off the carriageway centre.
  const ped = makePed(rng, p.x + (rng() - 0.5) * 60, p.y + (rng() - 0.5) * 60);
  ped.tx = ped.x; ped.ty = ped.y;
  peds.push(ped);
  return ped;
}

export function updatePed(ped, dt, world) {
  ped.timer -= dt;
  const threat = world.threatAt ? world.threatAt(ped.x, ped.y) : null;
  if (ped.state === 'down') {
    if (ped.timer <= 0) ped.state = 'walk';
    return;
  }
  if (threat && threat.dist < 105 && threat.speed > 60) {
    ped.state = threat.dist < 44 ? 'dive' : 'flee';
    ped.timer = 0.5;
    ped.threatX = threat.x; ped.threatY = threat.y;
  }
  if (ped.state === 'dive') {
    // A sideways leap away from the threat's line, then down briefly.
    const away = angleTo(threat ? threat.x : ped.x, threat ? threat.y : ped.y, ped.x, ped.y);
    const side = away + Math.PI / 2;
    ped.x += Math.cos(side) * 260 * dt;
    ped.y += Math.sin(side) * 260 * dt;
    if (ped.timer <= 0) { ped.state = 'down'; ped.timer = 1.1; }
    collideCircle(ped, 6);
    return;
  }
  if (ped.state === 'flee') {
    const away = angleTo(ped.threatX || ped.x, ped.threatY || ped.y, ped.x, ped.y);
    ped.angle = turnToward(ped.angle, away, 10 * dt);
    ped.x += Math.cos(ped.angle) * 165 * dt;
    ped.y += Math.sin(ped.angle) * 165 * dt;
    if (ped.timer <= 0 && (!threat || threat.dist > 130)) ped.state = 'walk';
    collideCircle(ped, 6);
    return;
  }
  // Walk: stroll to a target point, then pick another nearby.
  const d2 = dist2(ped.x, ped.y, ped.tx, ped.ty);
  if (d2 < 30 * 30 || ped.timer <= 0) {
    const rng = world.rng;
    for (let tries = 0; tries < 8; tries++) {
      const nx = ped.x + (rng() - 0.5) * 420, ny = ped.y + (rng() - 0.5) * 420;
      ped.tx = nx; ped.ty = ny;
      if (onRoad(nx, ny) || !world.pointBlocked(nx, ny)) break;
    }
    ped.timer = 6 + world.rng() * 6;
  }
  const want = angleTo(ped.x, ped.y, ped.tx, ped.ty);
  ped.angle = turnToward(ped.angle, want, 6 * dt);
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  ped.phase += dt * 7;
  collideCircle(ped, 6);
}

export function knockDown(ped) {
  if (ped.state !== 'down') { ped.state = 'down'; ped.timer = 2.6; return true; }
  return false;
}
