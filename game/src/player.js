// player.js — the runner: on-foot movement and sprint, the hotwire
// channel (stand at a door, hold your nerve, the car is yours), driving
// input for the shared car physics, and the camera that follows it all.

import { clamp } from './rng.js';
import { collideCircle } from './city.js';
import { stepCar, carSpeed } from './cars.js';
import { keys, pressed } from './input.js';

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, vx: 0, vy: 0,
    hotwire: null, // {car, t, need}
    phase: 0, inCar: null,
  };
}

export function updateOnFoot(state, dt, events) {
  const p = state.player;
  const ax = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const ay = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const top = (sprint ? 218 : 148) * (state.mods.has('adrenaline') ? 1.18 : 1);
  const len = Math.hypot(ax, ay) || 1;
  const tvx = (ax / len) * top * (ax || ay ? 1 : 0);
  const tvy = (ay / len) * top * (ax || ay ? 1 : 0);
  p.vx += (tvx - p.vx) * Math.min(1, dt * 10);
  p.vy += (tvy - p.vy) * Math.min(1, dt * 10);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (ax || ay) { p.angle = Math.atan2(p.vy, p.vx); p.phase += dt * (sprint ? 13 : 10); }
  collideCircle(p, 9);

  // Hotwire channel: stand by a car and hold your nerve — the channel
  // holds while you stay close. A moving car can be jacked if you run
  // with it; it pulls away and the channel breaks if you fall behind.
  if (p.hotwire) {
    const car = p.hotwire.car;
    const d = Math.hypot(p.x - car.x, p.y - car.y);
    if (d > 46) {
      p.hotwire = null;
      events.push({ kind: 'hotwireCancel' });
    } else {
      p.hotwire.t += dt;
      if (p.hotwire.t >= p.hotwire.need) {
        const lifted = car;
        p.hotwire = null;
        enterCar(state, lifted, events);
      }
    }
  }
}

export function tryInteract(state, events) {
  const p = state.player;
  if (p.inCar) {
    // Bail out — the car keeps its momentum and its handbrake off.
    // Both pointers must clear: leaving state.playerCar set would keep
    // updateDriving running and glue the player to the car.
    const car = p.inCar;
    p.inCar = null;
    state.playerCar = null;
    car.kind = 'parked';
    car.driverGone = true;
    p.x = car.x - Math.sin(car.angle) * 26;
    p.y = car.y + Math.cos(car.angle) * 26;
    p.vx = car.vx * 0.4; p.vy = car.vy * 0.4;
    events.push({ kind: 'exit', car });
    return;
  }
  // Find a door: the nearest car within reach.
  let best = null, bd = 42 * 42;
  for (const c of state.cars) {
    if (c.kind === 'police') continue;
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  for (const u of state.units) {
    const d = (u.x - p.x) ** 2 + (u.y - p.y) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  if (!best) return;
  const need = (best.kind === 'traffic' && carSpeed(best) > 8) ? 1.3 : 0.9;
  p.hotwire = { car: best, t: 0, need: need * (state.mods.has('adrenaline') ? 0.5 : 1) };
  events.push({ kind: 'hotwireStart', car: best });
}

export function enterCar(state, car, events) {
  const p = state.player;
  const wasParked = car.kind === 'parked';
  const wasTraffic = car.kind === 'traffic';
  if (car.kind === 'police') {
    // Stealing a unit: it leaves the police fleet and joins your garage of sins.
    state.units = state.units.filter((u) => u !== car);
  }
  car.kind = 'player';
  car.bumperMod = state.mods.has('bumper');
  p.inCar = car;
  state.playerCar = car;
  if (wasTraffic) events.push({ kind: 'jackedMoving', car });
  events.push({ kind: 'lift', car, wasParked, wasTraffic });
}

export function updateDriving(state, dt, events) {
  const car = state.playerCar;
  if (!car) return 0;
  const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
  const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
  const boostReady = state.mods.has('nitro');
  const ctl = {
    throttle: (up ? 1 : 0) - (down ? 1 : 0),
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    handbrake: !!keys.Space,
    boost: boostReady && !!(keys.ShiftLeft || keys.ShiftRight) && state.nitro > 0,
  };
  // A wrecked car is scrap: it coasts to a stop, it does not answer the
  // throttle. The banner tells the player to bail out and lift another.
  if (car.wrecked) { ctl.throttle = 0; ctl.boost = false; }
  if (ctl.boost) state.nitro = Math.max(0, state.nitro - dt * 0.55);
  else state.nitro = Math.min(1, state.nitro + dt * 0.1);
  const impact = stepCar(car, ctl, dt);
  state.player.x = car.x; state.player.y = car.y;
  state.player.angle = car.angle;
  if (car.hull <= 0 && !car.wrecked) {
    car.wrecked = true;
    events.push({ kind: 'wrecked', car });
  }
  // Drifting: lateral slide while moving fast.
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const lat = Math.abs(-car.vx * fy + car.vy * fx);
  const fwd = car.vx * fx + car.vy * fy;
  state.drift = { lat, fwd, active: lat > 55 && Math.abs(fwd) > 90 };
  return impact;
}

export function updateCamera(state, dt) {
  const focus = state.playerCar || state.player;
  const lead = state.playerCar ? 0.32 : 0.12;
  const tx = focus.x + (state.playerCar ? state.playerCar.vx * lead : 0);
  const ty = focus.y + (state.playerCar ? state.playerCar.vy * lead : 0);
  const k = Math.min(1, dt * 4.2);
  state.cam.x += (tx - state.cam.x) * k;
  state.cam.y += (ty - state.cam.y) * k;
  const { WORLD_W, WORLD_H } = state.dims;
  state.cam.x = clamp(state.cam.x, 640, WORLD_W - 640);
  state.cam.y = clamp(state.cam.y, 360, WORLD_H - 360);
}
