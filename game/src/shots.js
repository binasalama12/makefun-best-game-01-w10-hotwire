// shots.js — deterministic screenshot scenes behind ?shot=title|cover|meta|end.
// Every scene is staged with the game's OWN systems (startRun, nextStage,
// enterCar, manageUnits, openMeta, the real update loop) from the seeded
// state, then frozen: no wall clock, no Math.random, no input after the
// freeze — the same URL always renders the same pixels. The live loop in
// main.js draws the frozen state as-is and sets window.__shotReady here.
//
// Scenes (DESIGN.md): 1-cover = final-mission climax with full HUD,
// 2-meta = safehouse path-map + mod draft, 3-title = dense title screen,
// 4-end = grade screen with 9 stats and a mod recap.

import { keys, pressed, endFrameInput } from './input.js';
import { fx, resetFx, banner, floatText, updateFx } from './fx.js';
import { enterCar, updateCamera } from './player.js';
import { updateTrafficCar, carSpeed, nearestCar } from './cars.js';
import { manageUnits, updateUnits, updateHeat, addHeat } from './police.js';
import { openMeta } from './meta.js';
import { streetCenterX, streetCenterY, nearestIntersection, randomRoadPoint } from './city.js';
import { WORLD_W, WORLD_H } from './config.js';
import { clamp } from './rng.js';

const DT = 1 / 60;

function clearKeys() {
  for (const k in keys) keys[k] = false;
  for (const k in pressed) pressed[k] = false;
}

// One real loop step: the game's update plus fx ageing, as frame() does.
// NOTE: updatePlay is main.js' module singleton step — it takes ONLY dt
// (it closes over the state); passing state as dt would poison every
// number it touches (time/noEyes become "[object Object]", cars go NaN).
function step(state, hooks) {
  hooks.updatePlay(DT);
  updateFx(DT);
  endFrameInput();
}

function wrapAngle(a) {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Steer the player's car toward (tx, ty) for up to `seconds` of sim time.
// Straight-line steering with a reverse-and-retry when stuck on a building.
// Returns true when the target is reached (within `radius`).
function driveTo(state, hooks, tx, ty, seconds, radius = 60) {
  const car = state.playerCar;
  if (!car) return false;
  let stuckT = 0, reverseT = 0;
  const steps = Math.floor(seconds / DT);
  for (let i = 0; i < steps; i++) {
    if (state.mode !== 'play') return false;
    const d = Math.hypot(tx - car.x, ty - car.y);
    if (d < radius) { clearKeys(); return true; }
    const want = Math.atan2(ty - car.y, tx - car.x);
    const diff = wrapAngle(want - car.angle);
    clearKeys();
    if (reverseT > 0) {
      reverseT -= DT;
      keys.KeyS = true;
      keys.KeyA = diff > 0;
      keys.KeyD = diff <= 0;
    } else {
      keys.KeyW = true;
      if (diff > 0.18) keys.KeyD = true;
      else if (diff < -0.18) keys.KeyA = true;
      if (Math.abs(diff) > 1.1 && carSpeed(car) > 110) keys.Space = true;
    }
    step(state, hooks);
    if (carSpeed(car) < 24) {
      stuckT += DT;
      if (stuckT > 2) { reverseT = 0.7; stuckT = 0; }
    } else stuckT = 0;
  }
  clearKeys();
  return Math.hypot(tx - car.x, ty - car.y) < radius;
}

// Put the player in a real car placed on the road near (x, y), through
// the game's own enterCar (so heat/score/floatText flow as in live play).
function enterCarNear(state, hooks, x, y) {
  const car = nearestCar(state.cars, x, y, 900, (c) => c.kind === 'parked' || c.kind === 'traffic');
  if (!car) return null;
  const inter = nearestIntersection(x, y);
  car.x = streetCenterX(inter.i) + 30;
  car.y = streetCenterY(inter.j) + 20;
  car.angle = Math.atan2(y - car.y, x - car.x);
  car.vx = 0; car.vy = 0;
  state.player.x = car.x - 24; state.player.y = car.y;
  const events = [];
  enterCar(state, car, events);
  hooks.processEvents(events);
  return car;
}

// Freeze a banner + floating texts mid-life so they render at full alpha
// (banner alpha ramps from t=0; fx never ages in shot mode).
function freezeJuice(bannerText, bannerSub, bannerColor, texts) {
  if (bannerText) {
    banner(bannerText, bannerSub || '', bannerColor || '#ffd27a', 2.6);
    if (fx.banner) fx.banner.t = 1.0;
  }
  fx.texts.length = 0;
  for (const [text, color, size, dx, dy] of texts || []) {
    const p = stateRef.playerCar || stateRef.player;
    floatText(p.x + (dx || 0), p.y + (dy || -40), text, color, size || 16);
    const t = fx.texts[fx.texts.length - 1];
    if (t) t.t = 0.35;
  }
}

let stateRef = null;

function giveRunNumbers(state, score, cash, combo, mods) {
  state.score = score;
  state.cash = cash;
  state.combo = combo;
  state.comboT = 4;
  for (const m of mods || []) state.mods.add(m);
  state.stats.modsTaken = (mods || []).length;
}

// --- scenes -----------------------------------------------------------------

function stageTitle(state) {
  // Idle city behind the title: traffic rolls for 6 sim-seconds, camera
  // drifts the way the live title screen does.
  for (let i = 0; i < 6 / DT; i++) {
    state.time += DT;
    const world = { time: state.time, rng: state.rng, cars: state.cars, peds: state.peds, playerPos: state.player };
    for (const c of state.cars) if (c.kind === 'traffic') updateTrafficCar(c, DT, world);
    state.cam.x = streetCenterX(5) + Math.sin(state.time * 0.05) * 300;
    state.cam.y = streetCenterY(4) + Math.cos(state.time * 0.04) * 200;
    updateFx(DT);
  }
  state.best = 0;
}

function stageMeta(state, hooks) {
  hooks.startRun(state.diff);
  // Stage the safehouse after a stage, with the draft on the table: run
  // stage 1's setup, then open the meta screen with a draft.
  state.stage = 1;
  state.flavour.nextStage(state);
  state.objective = state.flavour.objective(state);
  giveRunNumbers(state, 9600, 2400, 2, ['nitro', 'ghost']);
  state.stats.faresDone = 1;
  state.stats.dropsDone = 3;
  state.stats.pickups = 1;
  state.stats.carsLifted = 3;
  state.stats.nearMisses = 4;
  openMeta(state, true);
}

function stageEnd(state, hooks) {
  hooks.startRun(state.diff);
  const f = state.flavour;
  // End stats are per-flavour: three different runs, three different
  // records (an earlier build hardcoded one shared line for all three).
  if (f.id === 'a') {
    state.stage = 11;
    state.m.fails = 1;
    state.score = 68420; state.cash = 14800;
    state.stats.faresDone = 12; state.stats.pickups = 12;
    state.stats.carsLifted = 17; state.stats.nearMisses = 31;
    state.stats.crashes = 2; state.stats.bestCombo = 5.5;
    state.stats.topSpeed = 292; state.stats.timeWanted = 268;
    state.endKind = 'win';
    state.endLine = 'All 12 fares run. Sable is beaten, Dray is embarrassed, the city is yours.';
  } else if (f.id === 'b') {
    state.stage = 4;
    state.m.busts = 1;
    state.score = 61200; state.cash = 12900;
    state.stats.dropsDone = 15; state.stats.pickups = 6;
    state.stats.carsLifted = 11; state.stats.nearMisses = 19;
    state.stats.crashes = 4; state.stats.bestCombo = 3.8;
    state.stats.topSpeed = 261; state.stats.timeWanted = 187;
    state.endKind = 'win';
    state.endLine = 'All 15 packages delivered. The Ledger sits on the steps of Dray\u2019s own Keep.';
  } else {
    state.stage = 3;
    state.score = 102400; state.cash = 8600;
    state.stats.pickups = 11;
    state.stats.vents = 2;
    state.stats.carsLifted = 22; state.stats.nearMisses = 27;
    state.stats.crashes = 5; state.stats.bestCombo = 6.2;
    state.stats.topSpeed = 274; state.stats.timeWanted = 342;
    state.endKind = 'busted';
    state.endLine = 'The run ends on shift 4. The city keeps your score.';
  }
  state.mods.add('nitro'); state.mods.add('ghost'); state.mods.add('bumper'); state.mods.add('jammer');
  state.stats.modsTaken = 4;
  state.best = state.score;
  state.mode = 'end';
}

function stageCover(state, hooks) {
  hooks.startRun(state.diff);
  const f = state.flavour;
  // Final stage via the game's own setup (heat floor, banners, markers).
  if (f.id === 'a') state.stage = 11;
  else if (f.id === 'b') state.stage = 4;
  else state.stage = 2;
  state.flavour.nextStage(state);
  state.objective = state.flavour.objective(state);
  // The player, in a car, just short of the first marker.
  const mk = state.markers[0] || { x: state.player.x + 400, y: state.player.y };
  const car = enterCarNear(state, hooks, mk.x, mk.y);
  giveRunNumbers(state, 48200, 12400, 3.5, ['nitro', 'ghost', 'bumper', 'jammer']);
  state.stats.faresDone = 11;
  state.stats.dropsDone = 12;
  state.stats.pickups = 11;
  state.stats.carsLifted = 9;
  state.stats.nearMisses = 17;
  state.stats.crashes = 2;
  state.stats.bestCombo = 4.5;
  state.stats.topSpeed = 285;
  state.stats.timeWanted = 96;
  // Five stars: set the points, then let the real heat/units systems run
  // while the autopilot drives at a FAR point (the drop for A, the next
  // drop for B, a far corner for C) — cruisers, interceptors, roadblocks
  // and spike vans arrive on their own schedule. Driving at the near
  // marker would end the drive on the first step, before any unit spawns.
  state.heat.points = 460;
  state.spawnCd = 0;
  state.blockCd = 0;
  if (car) {
    let far = null;
    if (state.m && state.m.drop) far = state.m.drop;
    else if (state.markers.length > 1) far = state.markers[1];
    else far = { x: clamp(state.player.x + 1300, 200, WORLD_W - 200), y: clamp(state.player.y - 800, 200, WORLD_H - 200) };
    // Stop short of the far point (130px): close enough to read as the
    // climax, far enough that the drop does not complete mid-staging.
    driveTo(state, hooks, far.x, far.y, 24, 130);
    // If the drive got busted or the run ended mid-staging, put the
    // pursuit back on: the frame is the climax, not the failure.
    if (state.mode !== 'play') {
      state.mode = 'play';
      state.bustedMeter = 0;
      state.graceT = 5;
      state.heat.points = 460;
      if (!state.playerCar && car) {
        car.kind = 'player';
        state.playerCar = car;
        state.player.inCar = car;
        state.player.x = car.x; state.player.y = car.y;
      }
      updateCamera(state, 0.5);
    }
  }
  // Settle the camera on the player, re-pin five stars (heat may have
  // decayed toward the floor during the drive), and freeze the juice.
  for (let i = 0; i < 30; i++) updateCamera(state, DT);
  state.heat.points = 460;
  updateHeat(state, 0.001);
  fx.shake = 0;
  const bannerText = f.id === 'a' ? 'FARE 12 — DRAY\u2019S GAUNTLET'
    : f.id === 'b' ? 'THE LAST PACKAGE' : 'THE CITY WAKES UP';
  const bannerSub = f.id === 'a' ? 'Dray has sealed Portside. The Net is at five rings. Punch through.'
    : f.id === 'b' ? 'The Commissioner\u2019s Ledger goes to the steps of his own Keep.'
    : 'The Net is at five rings — swap cars, vent in a garage, or run.';
  freezeJuice(bannerText, bannerSub, '#ff5f5f', [
    ['NEAR MISS +140', '#ffd27a', 15, 48, -34],
    ['DRIFT +88', '#8fb4ff', 14, -72, -62],
  ]);
}

// --- entry ------------------------------------------------------------------

export function setupShotScene(state, hooks) {
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (!shot) return false;
  stateRef = state;
  state.shotMode = shot;
  resetFx();
  clearKeys();
  if (shot === 'title') stageTitle(state);
  else if (shot === 'meta') stageMeta(state, hooks);
  else if (shot === 'end') stageEnd(state, hooks);
  else stageCover(state, hooks); // 'cover' and anything else: the climax
  clearKeys();
  fx.shake = 0;
  window.__shotReady = true;
  return true;
}
