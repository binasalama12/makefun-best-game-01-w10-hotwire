// missions.js — the three mission cores of HOTWIRE CITY behind one
// interface (setup / nextStage / update / objective / onBusted).
// A: GETAWAY WHEEL — timed fares under a rising heat floor, a rival duel
//    and a final gauntlet.
// B: TURF COURIER — 15 packages, three live drops at a time, your route
//    order; districts you milk push back with patrol pressure.
// C: BAIL RUN — endless heat shifts; survive, vent stars in garages,
//    chase medal scores.

import { CLIENT_NAMES, PACKAGE_NAMES, DISTRICTS, districtAt } from './config.js';
import { clamp, angleTo } from './rng.js';
import { randomRoadPoint, garageAt } from './city.js';
import { makeCar, stepCar, carSpeed } from './cars.js';
import { addHeat } from './police.js';
import { banner, floatText } from './fx.js';

function roadIn(rng, districtName, avoid, minD = 500) {
  for (let t = 0; t < 30; t++) {
    const p = randomRoadPoint(rng, districtName);
    if (avoid && Math.hypot(p.x - avoid.x, p.y - avoid.y) < minD) continue;
    return p;
  }
  return randomRoadPoint(rng);
}

function steerCtl(car, tx, ty, throttle) {
  const want = angleTo(car.x, car.y, tx, ty);
  let d = (want - car.angle) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return { throttle, steer: clamp(d * 2.2, -1, 1), handbrake: false, boost: false };
}

function atPoint(state, pt, r) {
  const v = state.playerCar || state.player;
  return Math.hypot(v.x - pt.x, v.y - pt.y) < r;
}

// ---------------------------------------------------------------- A: GETAWAY
const GETAWAY = {
  id: 'a', name: 'GETAWAY WHEEL', draftEvery: 2,
  title: 'HOTWIRE CITY — Getaway Wheel: 12 getaway fares across 6 districts under Commissioner Dray\u2019s five-ring Net — hotwire any car at the kerb, draft 9 street mods, outrun rival wheelman Sable Rook, break Dray\u2019s Gauntlet',
  tagline: 'Twelve fares. One closing Net. One unbeaten rival.',
  arc: 'THE ARC · FARE 6 — THE DUEL vs SABLE ROOK · FARE 12 — DRAY\u2019S GAUNTLET · A MOD DRAFT EVERY 2 FARES',
  setup(state) { state.m = { fails: 0, done: 0, phase: 'pickup', rival: null, rivalWon: false }; },
  nextStage(state) {
    const m = state.m, i = state.stage;
    if (i >= 12) return false;
    const rng = state.rng;
    const fromD = DISTRICTS[i % DISTRICTS.length].name;
    let toD = DISTRICTS[(i + 2 + (i % 3)) % DISTRICTS.length].name;
    if (toD === fromD) toD = DISTRICTS[(i + 3) % DISTRICTS.length].name;
    m.pickup = roadIn(rng, fromD, state.player, 300);
    m.drop = roadIn(rng, toD, m.pickup, 1100);
    const dist = Math.hypot(m.drop.x - m.pickup.x, m.drop.y - m.pickup.y);
    m.timer = clamp(dist / 88, 30, 100);
    m.phase = 'pickup';
    m.client = CLIENT_NAMES[i];
    m.payBase = Math.round((280 + i * 55 + dist * 0.32) * state.diff.payMult);
    m.rivalWon = false;
    state.missionHeatFloor = i >= 10 ? 300 : i >= 6 ? 170 : i >= 3 ? 80 : 0;
    if (m.rival) { state.cars = state.cars.filter((c) => c !== m.rival); m.rival = null; }
    if (i === 5) banner('FARE 6 — THE DUEL', 'Sable Rook wants this fare. Beat her to the drop.', '#ff9d5c');
    if (i === 11) banner('FARE 12 — DRAY\u2019S GAUNTLET', 'Dray has sealed Portside. The Net is at five rings. Punch through.', '#ff5f5f');
    state.markers = [{ x: m.pickup.x, y: m.pickup.y, kind: 'pickup', label: 'PICKUP' }];
    return true;
  },
  update(state, dt) {
    const m = state.m;
    m.timer -= dt;
    if (m.timer <= 0) {
      m.fails++;
      state.stats.faresBlown++;
      banner('FARE BLOWN', m.fails >= 3 ? 'Three blown fares. The city wins.' : `Blown fares: ${m.fails}/3`, '#ff5f5f');
      state.stageResult = m.fails >= 3 ? 'campaign-fail' : 'clear';
      return;
    }
    // Rival duel (fare 6): Sable races the drop once the client is in.
    if (state.stage === 5 && m.phase === 'drop') {
      if (!m.rival) {
        m.rival = makeCar(m.pickup.x + 60, m.pickup.y + 40, 0,
          { kind: 'muscle', label: 'Rival', color: '#b03a5b', speed: 246, accel: 330, grip: 3.4, hull: 120, weight: 1.1 }, 'rival');
        state.cars.push(m.rival);
        banner('SABLE ROOK', 'She is rolling. Do not let her take your fare.', '#ff9d5c');
      }
      stepCar(m.rival, steerCtl(m.rival, m.drop.x, m.drop.y, 0.96), dt);
      if (!m.rivalWon && Math.hypot(m.rival.x - m.drop.x, m.rival.y - m.drop.y) < 52) {
        m.rivalWon = true;
        banner('SABLE TOOK THE DROP', 'The fare pays half. Pride pays nothing.', '#ff9d5c');
      }
    }
    if (m.phase === 'pickup') {
      if (state.playerCar && atPoint(state, m.pickup, 54)) {
        m.phase = 'drop';
        state.stats.pickups++;
        banner('CLIENT IN', `Take ${m.client} to ${districtAt(m.drop.x, m.drop.y).name}.`, '#7ed492');
        state.markers = [{ x: m.drop.x, y: m.drop.y, kind: 'drop', label: 'DROP' }];
        addHeat(state, 12, m.pickup.x, m.pickup.y);
      }
    } else if (atPoint(state, m.drop, 56)) {
      const timeBonus = clamp(m.timer / 40, 0, 1);
      const clean = state.fareHits === 0 ? 1.25 : 1;
      let pay = Math.round(m.payBase * (0.55 + timeBonus) * clean * (m.rivalWon ? 0.5 : 1));
      state.cash += pay; state.stats.faresDone++;
      state.score += pay * 4;
      floatText(m.drop.x, m.drop.y - 30, `FARE PAID $${pay}`, '#7ed492', 21);
      if (clean > 1) floatText(m.drop.x, m.drop.y - 56, 'CLEAN RUN ×1.25', '#ffe9b8', 15);
      state.stageResult = 'clear';
    }
  },
  objective(state) {
    const m = state.m;
    return {
      title: `FARE ${state.stage + 1}/12 — ${m.phase === 'pickup' ? 'PICK UP' : 'DELIVER'}: ${m.client}`,
      win: 'Finish all 12 fares', lose: 'Pinned, or 3 blown fares',
      detail: m.phase === 'pickup' ? `Reach the gold ring in a car — ${districtAt(m.pickup.x, m.pickup.y).name}` : `Drop in ${districtAt(m.drop.x, m.drop.y).name} before the clock dies`,
      timer: m.timer,
    };
  },
  onBusted() { return 'gameover'; },
  extraStats(state) { return [['Fares blown', state.m.fails], ['Best combo', '×' + state.stats.bestCombo.toFixed(1)], ['Time in the Net', Math.round(state.stats.timeWanted) + 's']]; },
};

// ---------------------------------------------------------------- B: COURIER
const COURIER = {
  id: 'b', name: 'TURF COURIER', draftEvery: 1,
  title: 'HOTWIRE CITY — Turf Courier: route 15 packages through 6 districts in any order, bend each district\u2019s Net pressure, draft 9 street mods, hand Commissioner Dray his own Ledger',
  tagline: 'Fifteen packages. Your route. Their city.',
  arc: 'THE ARC · DROP 8 — THE AMBUSH IN FOUNDRY ROW · DROP 15 — THE LEDGER AT DRAY\u2019S OWN KEEP · A MOD DRAFT EVERY 3 DROPS',
  setup(state) {
    state.m = { delivered: 0, drops: [], clock: 620, pressure: {}, ambushDone: false };
  },
  nextStage(state) {
    const m = state.m, rng = state.rng;
    if (m.delivered >= 15) return false;
    m.drops = [];
    const used = new Set();
    for (let k = 0; k < 3 && m.delivered + k < 15; k++) {
      let dName = DISTRICTS[(state.stage * 3 + k * 2) % DISTRICTS.length].name;
      if (used.has(dName)) dName = DISTRICTS[(state.stage + k + 3) % DISTRICTS.length].name;
      used.add(dName);
      const pt = roadIn(rng, dName, state.player, 420);
      m.drops.push({ x: pt.x, y: pt.y, district: dName, pkg: PACKAGE_NAMES[m.delivered + k], fresh: 1, done: false });
    }
    if (state.stage === 2 && !m.ambushDone) {
      m.ambushDone = true;
      state.missionHeatFloor = 250;
      banner('THE AMBUSH', 'Foundry Row is crawling. They knew the route.', '#ff5f5f');
    } else if (state.stage === 4) {
      state.missionHeatFloor = 330;
      banner('THE LAST PACKAGE', 'The Commissioner\u2019s Ledger goes to the steps of his own Keep.', '#ff9d5c');
    } else state.missionHeatFloor = 40 + state.stage * 22;
    state.markers = m.drops.map((d) => ({ x: d.x, y: d.y, kind: 'drop', label: d.district }));
    return true;
  },
  update(state, dt) {
    const m = state.m;
    m.clock -= dt;
    if (m.clock <= 0) { state.stageResult = 'campaign-fail'; banner('OUT OF TIME', 'The packages go cold. The city wins.', '#ff5f5f'); return; }
    let allDone = true;
    for (const d of m.drops) {
      if (d.done) continue;
      allDone = false;
      d.fresh = Math.max(0, d.fresh - dt / 170);
      if (state.playerCar && atPoint(state, d, 56)) {
        d.done = true;
        m.delivered++;
        state.stats.dropsDone++;
        const pay = Math.round((340 + m.delivered * 26) * (0.5 + d.fresh * 0.7) * state.diff.payMult);
        state.cash += pay;
        state.score += pay * 4;
        m.pressure[d.district] = (m.pressure[d.district] || 0) + 1;
        floatText(d.x, d.y - 30, `DELIVERED $${pay}`, '#7ed492', 20);
        banner('PACKAGE DOWN', `${d.pkg} — ${m.delivered}/15. ${d.district} pressure rising.`, '#ffd27a', 1.6);
        addHeat(state, 14 + (m.pressure[d.district] || 0) * 4, d.x, d.y);
        state.markers = m.drops.filter((z) => !z.done).map((z) => ({ x: z.x, y: z.y, kind: 'drop', label: z.district }));
      }
    }
    if (allDone || m.drops.every((d) => d.done)) state.stageResult = 'clear';
  },
  objective(state) {
    const m = state.m;
    const left = m.drops.filter((d) => !d.done).length;
    return {
      title: `PACKAGES ${m.delivered}/15 — ${left} live drop${left === 1 ? '' : 's'}, your order`,
      win: 'Deliver all 15 packages', lose: 'Pinned 3 times, or the clock dies',
      detail: 'Gold rings are live drops — freshness pays, districts push back',
      timer: m.clock,
    };
  },
  onBusted(state) {
    state.m.busts = (state.m.busts || 0) + 1;
    return state.m.busts >= 3 ? 'gameover' : 'continue';
  },
  extraStats(state) { return [['Times pinned', state.m.busts || 0], ['Best combo', '×' + state.stats.bestCombo.toFixed(1)], ['Time in the Net', Math.round(state.stats.timeWanted) + 's']]; },
};

// ---------------------------------------------------------------- C: BAIL RUN
const BAILRUN = {
  id: 'c', name: 'BAIL RUN', draftEvery: 1,
  title: 'HOTWIRE CITY — Bail Run: survive the waking city, swap cars to stay cold, shed Net rings in 4 garages, draft 9 street mods, chase the $100,000 medal',
  tagline: 'The city wakes up every 25 seconds. Stay cold.',
  arc: 'THE ARC · THE CITY WAKES EVERY 25 S · MEDALS AT $25K / $50K / $100K · A MOD DRAFT EVERY SHIFT',
  setup(state) {
    state.m = { wake: 25, drops: [], ventCd: {}, medalsHit: 0 };
    this.refill(state);
  },
  refill(state) {
    const m = state.m;
    while (m.drops.length < 3) {
      const pt = randomRoadPoint(state.rng);
      if (Math.hypot(pt.x - state.player.x, pt.y - state.player.y) < 320) continue;
      m.drops.push({ x: pt.x, y: pt.y, value: 150 + Math.floor(state.rng() * 260) });
    }
    state.markers = m.drops.map((d) => ({ x: d.x, y: d.y, kind: 'cash', label: '$' }));
  },
  nextStage(state) {
    state.m.shiftHeat = 0;
    if (state.stage > 0) banner(`SHIFT ${state.stage + 1}`, 'The city leans harder. New eyes on every corner.', '#ff9d5c');
    return true;
  },
  update(state, dt) {
    const m = state.m;
    // The city wakes up: heat creeps in waves.
    m.wake -= dt;
    if (m.wake <= 0) {
      m.wake = 25;
      state.heat.points = clamp(state.heat.points + 34, 0, 500);
      banner('THE CITY WAKES UP', '+pressure — swap cars, vent in a garage, or run.', '#ff5f5f', 1.5);
    }
    // Shift timer: survive 75 s a shift.
    state.m.shiftT = (state.m.shiftT || 0) + dt;
    if (state.m.shiftT >= 75) {
      state.m.shiftT = 0;
      const bonus = 900 + state.stage * 350;
      state.score += bonus;
      state.cash += 150 + state.stage * 60;
      floatText(state.player.x, state.player.y - 44, `SHIFT SURVIVED +${bonus}`, '#7ed492', 20);
      state.stageResult = 'clear';
    }
    // Cash drops.
    for (let i = m.drops.length - 1; i >= 0; i--) {
      const d = m.drops[i];
      const v = state.playerCar || state.player;
      const reach = (state.mods.has('magnet') ? 64 : 34);
      if (Math.hypot(v.x - d.x, v.y - d.y) < reach) {
        state.cash += d.value;
        state.score += d.value * 3;
        state.stats.pickups++;
        floatText(d.x, d.y - 24, `+$${d.value}`, '#ffd27a', 18);
        m.drops.splice(i, 1);
      }
    }
    this.refill(state);
    // Garages vent heat: park a car inside, hold still.
    const car = state.playerCar;
    if (car && carSpeed(car) < 12) {
      const g = garageAt(car.x, car.y);
      if (g) {
        const key = g.cx + ':' + g.cy;
        if (state.time > (m.ventCd[key] || 0)) {
          state.m.venting = (state.m.venting || 0) + dt;
          if (state.m.venting > 2.4) {
            state.m.venting = 0;
            m.ventCd[key] = state.time + 22;
            state.heat.points = Math.max(0, state.heat.points - 105);
            banner('VENTED', 'One ring bleeds off in the dark of the garage.', '#7ed492', 1.6);
            state.stats.vents++;
          }
        }
      } else state.m.venting = 0;
    } else state.m.venting = 0;
    // Medals.
    const medals = [25000, 50000, 100000];
    if (m.medalsHit < medals.length && state.score >= medals[m.medalsHit]) {
      banner('MEDAL TIER', `Score past ${medals[m.medalsHit].toLocaleString('en-US')}. The city knows your name.`, '#ffd27a', 2.6);
      m.medalsHit++;
    }
  },
  objective(state) {
    const medals = [25000, 50000, 100000];
    const next = medals[state.m.medalsHit] || null;
    return {
      title: `SHIFT ${state.stage + 1} — SURVIVE ${Math.max(0, Math.ceil(75 - (state.m.shiftT || 0)))}s`,
      win: next ? `Reach the ${next.toLocaleString('en-US')} medal` : 'You are the medal. Keep going',
      lose: 'Pinned — the run ends',
      detail: 'Cash drops pay; garages shed a ring; fresh cars keep you cold',
      timer: null,
    };
  },
  onBusted() { return 'gameover'; },
  extraStats(state) { return [['Shifts survived', state.stage], ['Garages vented', state.stats.vents], ['Best combo', '×' + state.stats.bestCombo.toFixed(1)]]; },
};

export const FLAVOURS = { a: GETAWAY, b: COURIER, c: BAILRUN };
