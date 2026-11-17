// cars.js — the vehicle factory, the shared arcade physics step every
// car (traffic, police, player) runs on, traffic AI that drives the
// street grid on the correct side, parked cars, and car-car collisions.

import { CAR_TYPES, WORLD_W, WORLD_H } from './config.js';
import { clamp, turnToward, angleTo, dist2 } from './rng.js';
import { collideCircle, randomRoadPoint } from './city.js';

let nextId = 1;

export function makeCar(x, y, angle, type, kind) {
  return {
    id: nextId++, x, y, angle, vx: 0, vy: 0,
    type, kind, color: type.color,
    hull: type.hull, maxHull: type.hull,
    popped: false, wrecked: false, boost: 0,
    dir: 0, cruise: 110, decideAt: 0, honk: 0,
    targetX: x, targetY: y, lastKnownX: x, lastKnownY: y,
    unit: null, stillTime: 0, stripAt: 0, tailTime: 0,
  };
}

export function carSpeed(c) { return Math.hypot(c.vx, c.vy); }
export function forwardSpeed(c) { return c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle); }

// One physics step. ctl = {throttle:-1..1, steer:-1..1, handbrake, boost}
export function stepCar(c, ctl, dt) {
  const t = c.type;
  const maxF = t.speed * (c.popped ? 0.45 : 1) * (c.wrecked ? 0.35 : 1) * (ctl.boost ? 1.45 : 1);
  const maxR = -t.speed * 0.38;
  const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
  const rx = -fy, ry = fx;
  let vf = c.vx * fx + c.vy * fy;
  let vl = c.vx * rx + c.vy * ry;
  // Engine / brake / reverse.
  if (ctl.throttle > 0) vf += t.accel * ctl.throttle * dt * (ctl.boost ? 1.5 : 1);
  else if (ctl.throttle < 0) vf += (vf > 12 ? -t.accel * 1.7 : t.accel * 0.8 * ctl.throttle) * dt;
  // Steering scales with speed; reversing flips it, as real cars do.
  const steerAuthority = clamp(Math.abs(vf) / 60, 0, 1) * (vf < 0 ? -1 : 1);
  c.angle += ctl.steer * 2.7 * steerAuthority * dt * (ctl.handbrake ? 1.35 : 1);
  // Grip kills lateral slide; handbrake lets the tail hang out (drift).
  const grip = t.grip * (ctl.handbrake ? 0.35 : 1) * (c.popped ? 0.7 : 1);
  vl *= Math.exp(-grip * dt);
  // Rolling drag + soft caps.
  vf *= Math.exp(-0.35 * dt);
  vf = clamp(vf, maxR, Math.max(maxF, 0));
  const nfx = Math.cos(c.angle), nfy = Math.sin(c.angle);
  const nrx = -nfy, nry = nfx;
  c.vx = nfx * vf + nrx * vl;
  c.vy = nfy * vf + nry * vl;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  // Buildings: push out and bleed speed; returns impact for crash juice.
  const before = Math.hypot(c.vx, c.vy);
  const hit = collideCircle(c, 15);
  if (hit) {
    const keep = c.kind === 'player' && c.bumperMod ? 0.62 : 0.38;
    c.vx *= keep; c.vy *= keep;
    return Math.max(0, before - Math.hypot(c.vx, c.vy));
  }
  return 0;
}

// --- traffic ---------------------------------------------------------------
const DIRS = [
  { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
];
// Lane offset for right-hand traffic per heading (E,S,W,N).
const LANE = [20, -20, -20, 20];

export function spawnTrafficCar(rng, cars) {
  const p = randomRoadPoint(rng);
  const vertical = Math.abs((p.x % 320) - 48) < 30;
  const dir = vertical ? (rng() < 0.5 ? 1 : 3) : (rng() < 0.5 ? 0 : 2);
  const type = CAR_TYPES[Math.floor(rng() * CAR_TYPES.length)];
  const car = makeCar(p.x, p.y, 0, type, 'traffic');
  car.dir = dir;
  car.angle = Math.atan2(DIRS[dir].dy, DIRS[dir].dx);
  car.cruise = 92 + rng() * 55;
  cars.push(car);
  return car;
}

export function spawnParkedCar(rng, cars) {
  const p = randomRoadPoint(rng);
  const horizontal = rng() < 0.5;
  const type = CAR_TYPES[Math.floor(rng() * CAR_TYPES.length)];
  let x = p.x, y = p.y, angle;
  if (horizontal) {
    // Park mid-block along a horizontal street's curb.
    const block = Math.floor(p.x / 320);
    x = block * 320 + 130 + rng() * 190;
    y = (Math.floor(p.y / 320) * 320) + 48 + (rng() < 0.5 ? -37 : 37);
    angle = rng() < 0.5 ? 0 : Math.PI;
  } else {
    const block = Math.floor(p.y / 320);
    y = block * 320 + 130 + rng() * 190;
    x = (Math.floor(p.x / 320) * 320) + 48 + (rng() < 0.5 ? -37 : 37);
    angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  }
  const car = makeCar(x, y, angle + (rng() - 0.5) * 0.05, type, 'parked');
  cars.push(car);
  return car;
}

function obstacleAhead(car, cars, peds, player) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  let nearest = Infinity;
  const test = (o, r) => {
    const dx = o.x - car.x, dy = o.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 4 || ahead > 96) return;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 20 + r && ahead < nearest) nearest = ahead;
  };
  for (const o of cars) if (o !== car) test(o, 8);
  for (const p of peds) test(p, 2);
  if (player) test(player, 4);
  return nearest;
}

export function updateTrafficCar(car, dt, world) {
  const d = DIRS[car.dir];
  // Lane-true lookahead point: fixed lane coordinate, 110px ahead.
  let lx, ly;
  if (d.dx !== 0) { lx = car.x + d.dx * 110; ly = Math.round((car.y - 48) / 320) * 320 + 48 + LANE[car.dir]; }
  else { ly = car.y + d.dy * 110; lx = Math.round((car.x - 48) / 320) * 320 + 48 + LANE[car.dir]; }
  // Near an intersection centre, maybe pick a new heading.
  const ix = Math.round((car.x - 48) / 320) * 320 + 48;
  const iy = Math.round((car.y - 48) / 320) * 320 + 48;
  if (Math.abs(car.x - ix) < 26 && Math.abs(car.y - iy) < 26 && world.time > car.decideAt) {
    car.decideAt = world.time + 1.2;
    const roll = world.rng();
    if (roll > 0.55) {
      car.dir = (car.dir + (roll > 0.78 ? 1 : 3)) % 4;
      const nd = DIRS[car.dir];
      if (nd.dx !== 0) { lx = car.x + nd.dx * 110; ly = iy + LANE[car.dir]; }
      else { ly = car.y + nd.dy * 110; lx = ix + LANE[car.dir]; }
    }
  }
  const want = angleTo(car.x, car.y, lx, ly);
  const steer = clamp(((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1, 1) * 1.6;
  const obs = obstacleAhead(car, world.cars, world.peds, world.playerPos);
  let throttle = 0.55;
  const sp = carSpeed(car);
  if (sp > car.cruise) throttle = 0;
  if (obs < 46) throttle = -0.7; else if (obs < 92) throttle = Math.min(throttle, 0.12);
  return stepCar(car, { throttle, steer: clamp(steer, -1, 1), handbrake: false, boost: false }, dt);
}

// --- collisions between cars -------------------------------------------------
export function collideCars(cars, events) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 > 32 * 32 || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (32 - d) / 2;
      const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      // A shove must never leave a car outside the world (a negative
      // position crashes districtAt on the next frame).
      for (const c of [a, b]) {
        c.x = clamp(c.x, 8, WORLD_W - 8);
        c.y = clamp(c.y, 8, WORLD_H - 8);
      }
      const rel = Math.abs((b.vx - a.vx) * nx + (b.vy - a.vy) * ny);
      const swap = 0.35;
      a.vx -= nx * rel * swap; a.vy -= ny * rel * swap;
      b.vx += nx * rel * swap; b.vy += ny * rel * swap;
      if (rel > 55) {
        const dmg = (rel - 40) * 0.16;
        a.hull -= dmg * (b.type.weight); b.hull -= dmg * (a.type.weight);
        events.push({ kind: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, severity: rel, a, b });
      }
    }
  }
}

export function nearestCar(cars, x, y, maxD, pred = null) {
  let best = null, bd = maxD * maxD;
  for (const c of cars) {
    if (pred && !pred(c)) continue;
    const d = dist2(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
