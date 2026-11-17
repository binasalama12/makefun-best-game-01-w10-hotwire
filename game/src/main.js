// main.js — HOTWIRE CITY's state machine and loop. Owns the run state,
// drives every system in order (player, traffic, police, peds, mission,
// heat, combo), turns physics events into score, heat and juice, and
// handles the busted meter, stage flow and the safehouse transitions.

import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, DIFFICULTIES, districtAt } from './config.js';
import { makeRng, clamp } from './rng.js';
import { buildCity, streetCenterX, streetCenterY, pointInBuilding, garageAt } from './city.js';
import { spawnTrafficCar, spawnParkedCar, updateTrafficCar, collideCars, carSpeed } from './cars.js';
import { makePlayer, updateOnFoot, updateDriving, updateCamera, tryInteract } from './player.js';
import { spawnPed, updatePed, knockDown } from './peds.js';
import { updateHeat, manageUnits, updateUnits, addHeat, starsOf } from './police.js';
import { FLAVOURS } from './missions.js';
import { openMeta, handleMetaClick } from './meta.js';
import { fx, resetFx, sparks, smoke, floatText, banner, addSkid, shake, updateFx } from './fx.js';
import { draw } from './render.js';
import { updateHud, setMsg } from './hud.js';
import { attachInput, keys, pressed, clicks, endFrameInput } from './input.js';
import { initAudio, updateAudio, sfx } from './audio.js';
import { setupShotScene } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
attachInput(canvas);

const params = new URLSearchParams(location.search);
const FLAVOUR_ID = params.get('flavour') || 'a';

export function freshState(flavourId) {
  const rng = makeRng(20261);
  buildCity(777);
  const state = {
    rng, time: 0, frame: 0,
    mode: 'title', paused: false,
    flavour: FLAVOURS[flavourId] || FLAVOURS.a,
    diff: DIFFICULTIES[1],
    player: makePlayer(streetCenterX(5), streetCenterY(4)),
    playerCar: null,
    cars: [], units: [], officers: [], peds: [], strips: [],
    markers: [],
    cam: { x: streetCenterX(5), y: streetCenterY(4) },
    heat: { points: 0, stars: 0, noEyes: 99 },
    missionHeatFloor: 0, detectiveTailing: 0,
    spawnCd: 0, blockCd: 0,
    cash: 0, score: 0, combo: 1, comboT: 0, nitro: 1,
    mods: new Set(), decoy: null, decoyCharges: 2,
    stage: 0, stageResult: null, fareHits: 0,
    bustedMeter: 0, graceT: 0, bustFlash: 0,
    drift: { lat: 0, fwd: 0, active: false }, driftT: 0, driftScoreT: 0,
    objective: null, districtName: 'OLD MARKET',
    metaDraft: false, metaChoices: [],
    endKind: null, endLine: '',
    best: 0, m: {},
    stats: {
      faresDone: 0, faresBlown: 0, dropsDone: 0, pickups: 0, carsLifted: 0,
      nearMisses: 0, crashes: 0, modsTaken: 0, bestCombo: 1, topSpeed: 0,
      timeWanted: 0, vents: 0,
    },
    dims: { WORLD_W, WORLD_H },
    shotMode: null,
  };
  for (let i = 0; i < 24; i++) spawnTrafficCar(rng, state.cars);
  for (let i = 0; i < 40; i++) spawnParkedCar(rng, state.cars);
  for (let i = 0; i < 42; i++) spawnPed(rng, state.peds, (r) => ({ x: 300 + r() * (WORLD_W - 600), y: 300 + r() * (WORLD_H - 600) }));
  try { state.best = parseInt(localStorage.getItem('hotwire-best') || '0', 10) || 0; } catch { state.best = 0; }
  return state;
}

const state = freshState(FLAVOUR_ID);
window.__hotwire = state;

function startRun(diff) {
  state.diff = diff;
  const keepFlavour = state.flavour;
  Object.assign(state, freshState(keepFlavour.id));
  state.flavour = keepFlavour;
  state.diff = diff;
  resetFx();
  state.flavour.setup(state);
  state.stage = 0;
  state.fareHits = 0;
  state.flavour.nextStage(state);
  state.objective = state.flavour.objective(state);
  state.mode = 'play';
  banner(state.flavour.name, state.flavour.tagline, '#ffd27a', 2.6);
  sfx.draft();
}

function endRun(kind, line) {
  state.mode = 'end';
  state.endKind = kind;
  state.endLine = line;
  if (state.score > state.best) {
    state.best = state.score;
    try { localStorage.setItem('hotwire-best', String(state.best)); } catch { /* private mode */ }
  }
  if (kind === 'win') sfx.win();
}

function advanceStage() {
  // Called when a stage clears: draft every `draftEvery` stages, then the
  // safehouse (with or without a draft), then the next stage plays.
  const draftDue = ((state.stage + 1) % state.flavour.draftEvery) === 0;
  state.stage++;
  state.fareHits = 0;
  const more = state.flavour.nextStage(state);
  if (!more) {
    endRun('win', state.flavour.id === 'a'
      ? 'All 12 fares run. Sable is beaten, Dray is embarrassed, the city is yours.'
      : 'All 15 packages delivered. The Ledger sits on the Commissioner\u2019s own steps.');
    return;
  }
  state.objective = state.flavour.objective(state);
  openMeta(state, draftDue);
  sfx.draft();
}

function handleBusted() {
  state.mode = 'busted';
  state.bustFlash = 1.5;
  sfx.busted();
  shake(9);
}

function resolveBusted() {
  const verdict = state.flavour.onBusted(state);
  state.bustedMeter = 0;
  if (verdict === 'gameover') {
    endRun('busted', state.flavour.id === 'c'
      ? `The run ends on shift ${state.stage + 1}. The city keeps your score.`
      : 'Pinned, cuffed, and read your rights. The city keeps the car.');
    return;
  }
  // Courier shrugs off a bust: heat cools, you walk from the nearest garage.
  state.heat.points = 40;
  const g = garageAt(state.player.x, state.player.y) || null;
  const spot = g || { cx: streetCenterX(5), cy: streetCenterY(4) };
  state.player.x = spot.cx ?? spot.x; state.player.y = spot.cy ?? spot.y;
  if (state.playerCar) { state.playerCar.kind = 'parked'; state.playerCar = null; state.player.inCar = null; }
  state.graceT = 5;
  state.mode = 'play';
  banner('PINNED — BUT THE COURIER WALKS', `${state.m.busts}/3 strikes. The Net cooled. Keep routing.`, '#ff9d5c');
}

// --- per-frame systems ---------------------------------------------------------

function threatAt(x, y) {
  let best = null;
  const test = (c) => {
    const d = Math.hypot(c.x - x, c.y - y), sp = carSpeed(c);
    if (d < 130 && (!best || d < best.dist)) best = { x: c.x, y: c.y, dist: d, speed: sp };
  };
  for (const c of state.cars) test(c);
  for (const u of state.units) test(u);
  return best;
}

function processEvents(events) {
  for (const ev of events) {
    if (ev.kind === 'crash') {
      const involvesPlayer = ev.a === state.playerCar || ev.b === state.playerCar;
      sparks(ev.x, ev.y, ev.severity > 130 ? 16 : 8, state.rng);
      if (involvesPlayer) {
        state.stats.crashes++;
        state.fareHits++;
        state.combo = 1; state.comboT = 0;
        addHeat(state, 7, ev.x, ev.y);
        shake(ev.severity > 150 ? 6 : 3);
        sfx.crash(ev.severity > 150);
        if (ev.severity > 170) floatText(ev.x, ev.y - 24, 'HEAVY HIT', '#ff5f5f', 15);
      } else if (ev.severity > 120) sfx.crash(false);
    } else if (ev.kind === 'lift') {
      state.stats.carsLifted++;
      state.score += 60;
      sfx.lift();
      const seen = addHeat(state, ev.wasTraffic ? 30 : 20, ev.car.x, ev.car.y);
      floatText(ev.car.x, ev.car.y - 30, seen ? 'LIFTED — SPOTTED!' : 'LIFTED', seen ? '#ff9d5c' : '#ffd27a', 16);
      if (ev.wasTraffic) {
        const driver = spawnPed(state.rng, state.peds, () => ({ x: ev.car.x, y: ev.car.y }));
        driver.state = 'flee'; driver.timer = 1.6; driver.threatX = ev.car.x; driver.threatY = ev.car.y;
      }
      // A fresh set of wheels cools a Bail Run trail.
      if (state.flavour.id === 'c') { state.score += 120; floatText(ev.car.x, ev.car.y - 52, 'FRESH WHEELS +120', '#7ed492', 14); }
    } else if (ev.kind === 'jackedMoving') {
      addHeat(state, 10, ev.car.x, ev.car.y);
    } else if (ev.kind === 'popped') {
      banner('TYRES POPPED', 'Spike strip. This car is done — swap wheels.', '#ff5f5f');
      sfx.popped();
      shake(5);
    } else if (ev.kind === 'strip') {
      floatText(ev.x, ev.y - 20, 'SPIKES DOWN', '#ff9d5c', 13);
    } else if (ev.kind === 'unitdown') {
      state.score += 300;
      floatText(ev.x, ev.y - 24, 'UNIT DOWN +300', '#7ed492', 16);
      smoke(ev.x, ev.y, 10, state.rng, true);
    } else if (ev.kind === 'wrecked') {
      banner('WRECKED', 'This car is scrap. Bail out and lift another.', '#ff9d5c');
      smoke(ev.car.x, ev.car.y, 12, state.rng, true);
    }
  }
}

function updatePlay(dt) {
  const events = [];
  state.time += dt;
  state.graceT = Math.max(0, state.graceT - dt);

  // Player.
  if (state.playerCar) {
    const impact = updateDriving(state, dt, events);
    if (impact > 70) {
      state.fareHits++;
      state.stats.crashes++;
      addHeat(state, 4, state.playerCar.x, state.playerCar.y);
      sparks(state.playerCar.x, state.playerCar.y, 7, state.rng);
      shake(impact > 150 ? 5 : 2.5);
      sfx.crash(impact > 150);
      state.combo = 1; state.comboT = 0;
    }
    // Skid marks while drifting or burning out.
    if (state.drift.active || (carSpeed(state.playerCar) > 40 && Math.abs(state.drift.lat) > 30)) {
      const c = state.playerCar;
      addSkid(c.x - Math.cos(c.angle) * 10, c.y - Math.sin(c.angle) * 10, c.angle);
    }
  } else {
    updateOnFoot(state, dt, events);
    if (pressed.KeyE) tryInteract(state, events);
  }
  if (state.playerCar && pressed.KeyE) tryInteract(state, events);
  // Decoy flare.
  if (pressed.KeyF && state.mods.has('decoy') && state.decoyCharges > 0 && !state.decoy) {
    state.decoyCharges--;
    const a = state.player.angle;
    state.decoy = { x: state.player.x + Math.cos(a) * 300, y: state.player.y + Math.sin(a) * 300, t: 5 };
    banner('DECOY FLARE', 'Every unit in earshot bites on the flare.', '#ffd27a', 1.4);
  }
  if (state.decoy) { state.decoy.t -= dt; if (state.decoy.t <= 0) state.decoy = null; }

  // World life.
  const world = { time: state.time, rng: state.rng, cars: [...state.cars, ...state.units], peds: state.peds, playerPos: state.player };
  for (const c of state.cars) if (c.kind === 'traffic') updateTrafficCar(c, dt, world);
  for (const p of state.peds) updatePed(p, dt, { rng: state.rng, threatAt, pointBlocked: (x, y) => pointInBuilding(x, y, 4) });
  // Police.
  manageUnits(state, dt);
  updateUnits(state, dt, events);
  updateHeat(state, dt);
  // Collisions: dynamic cars vs each other, then vs roadblocks (static).
  const dynamic = [...state.cars, ...state.units.filter((u) => u.unit !== 'roadblock')];
  if (state.playerCar && !dynamic.includes(state.playerCar)) dynamic.push(state.playerCar);
  collideCars(dynamic, events);
  for (const u of state.units) {
    if (u.unit !== 'roadblock') continue;
    for (const c of dynamic) {
      const d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d < 34 && d > 0) {
        const nx = (c.x - u.x) / d, ny = (c.y - u.y) / d;
        c.x = u.x + nx * 34; c.y = u.y + ny * 34;
        const rel = Math.abs(c.vx * nx + c.vy * ny);
        c.vx += nx * rel * 0.8; c.vy += ny * rel * 0.8;
        if (rel > 60) events.push({ kind: 'crash', x: c.x, y: c.y, severity: rel, a: c, b: u });
      }
    }
  }
  // Player car vs pedestrians.
  if (state.playerCar && carSpeed(state.playerCar) > 34) {
    for (const p of state.peds) {
      if (Math.hypot(p.x - state.playerCar.x, p.y - state.playerCar.y) < 17 && knockDown(p)) {
        addHeat(state, 24, p.x, p.y);
        state.combo = 1; state.comboT = 0;
        floatText(p.x, p.y - 22, 'PEDESTRIAN DOWN', '#ff5f5f', 14);
        shake(3);
      }
    }
  }
  processEvents(events);

  // Near misses + drift chains + combo upkeep.
  if (state.playerCar) {
    const pc = state.playerCar;
    for (const c of state.cars) {
      c.nearCd = Math.max(0, (c.nearCd || 0) - dt);
      if (c.kind !== 'traffic' || c.nearCd > 0) continue;
      const d = Math.hypot(c.x - pc.x, c.y - pc.y);
      const rel = Math.hypot(c.vx - pc.vx, c.vy - pc.vy);
      if (d > 24 && d < 46 && rel > 165) {
        c.nearCd = 2.5;
        state.stats.nearMisses++;
        state.combo = Math.min(5, state.combo + 0.5);
        state.comboT = 4;
        const pts = Math.round(40 * state.combo);
        state.score += pts;
        floatText(pc.x, pc.y - 34, `NEAR MISS +${pts}`, '#ffd27a', 15);
      }
    }
    if (state.drift.active) {
      state.driftT += dt;
      state.driftScoreT += dt;
      if (state.driftScoreT > 0.5) {
        state.driftScoreT = 0;
        const pts = Math.round(25 * state.combo);
        state.score += pts;
        state.combo = Math.min(5, state.combo + 0.1);
        state.comboT = 4;
        if (state.driftT > 1.2) floatText(pc.x, pc.y - 34, `DRIFT +${pts}`, '#8fb4ff', 14);
      }
    } else state.driftT = 0;
    state.stats.topSpeed = Math.max(state.stats.topSpeed, carSpeed(pc));
  }
  if (state.comboT > 0) { state.comboT -= dt; if (state.comboT <= 0) state.combo = 1; }
  state.stats.bestCombo = Math.max(state.stats.bestCombo, state.combo);
  if (state.heat.stars > 0) state.stats.timeWanted += dt;

  // Busted meter.
  let pressure = 0;
  if (state.graceT <= 0) {
    if (!state.playerCar) {
      for (const o of state.officers) if (Math.hypot(o.x - state.player.x, o.y - state.player.y) < 46) pressure = 1;
      for (const u of state.units) if (Math.hypot(u.x - state.player.x, u.y - state.player.y) < 50 && carSpeed(u) < 30) pressure = 1;
    } else if (carSpeed(state.playerCar) < 14) {
      for (const u of state.units) if (Math.hypot(u.x - state.playerCar.x, u.y - state.playerCar.y) < 66) pressure = 1;
    }
  }
  const fillRate = (state.playerCar ? 1 / 2.0 : 1 / 1.2) * (state.mods.has('slick') ? 0.65 : 1);
  state.bustedMeter = clamp(state.bustedMeter + (pressure ? fillRate * dt : -dt * 1.6), 0, 1);
  if (state.bustedMeter >= 1) { handleBusted(); return; }

  // Mission.
  state.flavour.update(state, dt);
  state.objective = state.flavour.objective(state);
  state.districtName = districtAt(state.player.x, state.player.y).name;
  if (state.stageResult === 'clear') { state.stageResult = null; advanceStage(); return; }
  if (state.stageResult === 'campaign-fail') { state.stageResult = null; endRun('lose', 'The jobs dried up and the city moved on.'); return; }

  // Population upkeep: keep the streets alive near the player.
  state.cars = state.cars.filter((c) => c.kind === 'player' || Math.hypot(c.x - state.player.x, c.y - state.player.y) < 1600);
  let traffic = state.cars.filter((c) => c.kind === 'traffic').length;
  while (traffic < 22) { spawnTrafficCar(state.rng, state.cars); traffic++; }
  if (state.peds.length < 34) spawnPed(state.rng, state.peds, (r) => ({ x: state.player.x + (r() - 0.5) * 1400, y: state.player.y + (r() - 0.5) * 1400 }));
  state.peds = state.peds.filter((p) => Math.hypot(p.x - state.player.x, p.y - state.player.y) < 1500);

  // Context hint line.
  if (state.player.hotwire) setMsg('Hotwiring… stay at the door');
  else if (state.playerCar && garageAt(state.playerCar.x, state.playerCar.y)) setMsg('Garage: park and hold still to vent heat');
  else if (!state.playerCar) setMsg('E — hotwire a car · WASD — walk · SHIFT — sprint');
  else setMsg('E — bail out · SPACE — handbrake · R — restart run');
  updateCamera(state, dt);
}

// --- screens' input ---------------------------------------------------------------

function handleScreenInput() {
  if (state.mode === 'title') {
    DIFFICULTIES.forEach((d, i) => {
      if (pressed['Digit' + (i + 1)]) { state.diff = d; sfx.click(); }
    });
    for (const c of clicks) {
      DIFFICULTIES.forEach((d, i) => {
        const x = 76 + i * 168;
        if (c.x >= x && c.x <= x + 156 && c.y >= 486 && c.y <= 516) { state.diff = d; sfx.click(); }
      });
      if (!(c.y >= 486 && c.y <= 516)) { initAudio(); startRun(state.diff); return; }
    }
    if (pressed.Enter) { initAudio(); startRun(state.diff); }
  } else if (state.mode === 'meta') {
    for (const c of clicks) {
      if (handleMetaClick(state, c.x, c.y) === 'picked') { state.mode = 'play'; sfx.pickup(); return; }
    }
    if (state.metaDraft) {
      for (let i = 0; i < 3; i++) {
        if (pressed['Digit' + (i + 1)] && state.metaChoices[i]) {
          state.mods.add(state.metaChoices[i].id);
          state.stats.modsTaken++;
          state.mode = 'play';
          sfx.pickup();
          return;
        }
      }
    } else if (pressed.Enter) { state.mode = 'play'; }
  } else if (state.mode === 'end') {
    if (pressed.Enter || clicks.length) {
      Object.assign(state, freshState(state.flavour.id));
      state.mode = 'title';
    }
  } else if (state.mode === 'play') {
    if (pressed.KeyP) state.paused = !state.paused;
    if (pressed.KeyR) startRun(state.diff);
  }
}

// --- loop ---------------------------------------------------------------------------

const isShot = setupShotScene(state, { startRun, updatePlay, processEvents });
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.frame++;
  if (isShot) {
    // Shots.js has frozen a deterministic scene; render it as-is.
    draw(ctx, state);
    updateHud(state);
    return;
  }
  handleScreenInput();
  if (state.mode === 'play' && !state.paused) updatePlay(dt);
  else if (state.mode === 'busted') {
    state.bustFlash -= dt;
    if (state.bustFlash <= 0) resolveBusted();
  } else if (state.mode === 'title') {
    // Idle city behind the title: traffic rolls, nothing hunts.
    state.time += dt;
    const world = { time: state.time, rng: state.rng, cars: state.cars, peds: state.peds, playerPos: state.player };
    for (const c of state.cars) if (c.kind === 'traffic') updateTrafficCar(c, dt, world);
    state.cam.x = streetCenterX(5) + Math.sin(state.time * 0.05) * 300;
    state.cam.y = streetCenterY(4) + Math.cos(state.time * 0.04) * 200;
  }
  updateFx(dt);
  draw(ctx, state);
  updateHud(state);
  updateAudio(state, dt);
  endFrameInput();
}
requestAnimationFrame(frame);
