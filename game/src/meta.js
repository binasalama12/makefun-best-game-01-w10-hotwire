// meta.js — the SAFEHOUSE between stages: a district path-map with the
// next job's offer on it, and the street-mod draft (pick 1 of 3). This
// file owns the layout and the click logic; render.js paints it.

import { MODS } from './config.js';

export const META = {
  map: { x: 60, y: 128, w: 660, h: 460 },
  cards: [
    { x: 756, y: 150, w: 464, h: 118 },
    { x: 756, y: 284, w: 464, h: 118 },
    { x: 756, y: 418, w: 464, h: 118 },
  ],
  roll: { x: 756, y: 566, w: 464, h: 54 },
};

// Open the safehouse. `draft` says whether a mod choice is on the table.
export function openMeta(state, draft) {
  state.mode = 'meta';
  state.metaDraft = draft;
  state.metaChoices = [];
  if (draft) {
    const owned = state.mods;
    const pool = MODS.filter((m) => !owned.has(m.id));
    const rng = state.rng;
    while (state.metaChoices.length < 3 && pool.length > 0) {
      const i = Math.floor(rng() * pool.length);
      state.metaChoices.push(pool.splice(i, 1)[0]);
    }
    if (state.metaChoices.length === 0) state.metaDraft = false;
  }
}

export function handleMetaClick(state, x, y) {
  if (state.metaDraft) {
    for (let i = 0; i < state.metaChoices.length; i++) {
      const c = META.cards[i];
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
        const mod = state.metaChoices[i];
        state.mods.add(mod.id);
        state.stats.modsTaken++;
        return 'picked';
      }
    }
    return null;
  }
  const r = META.roll;
  if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return 'picked';
  return null;
}
