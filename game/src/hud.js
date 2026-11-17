// hud.js — the DOM HUD strip over the canvas: cash, score and combo on
// the left; the mission objective (with the WIN / LOSE lines) in the
// middle; the Net's ring pips, heat and hull bars on the right.
// In-canvas panels (threats, mods, minimap) are render.js' job; this
// strip is the always-readable summary.

let els = null;

function grab() {
  els = {
    hud: document.getElementById('hud'),
    cash: document.getElementById('h-cash'),
    score: document.getElementById('h-score'),
    combo: document.getElementById('h-combo'),
    obj: document.getElementById('h-obj'),
    win: document.getElementById('h-win'),
    lose: document.getElementById('h-lose'),
    stars: document.getElementById('h-stars'),
    heat: document.getElementById('h-heatbar'),
    hull: document.getElementById('h-hullbar'),
    hullWrap: document.getElementById('h-hullwrap'),
    district: document.getElementById('h-district'),
    msg: document.getElementById('msg'),
  };
}

export function updateHud(state) {
  if (!els) grab();
  if (!els.cash) return;
  // The strip belongs to live play: on the title, safehouse and grade
  // screens it would sit over the screen's own title, so hide it there.
  if (els.hud) els.hud.style.visibility = (state.mode === 'play' || state.mode === 'busted') ? 'visible' : 'hidden';
  els.cash.textContent = '$' + state.cash.toLocaleString('en-US');
  els.score.textContent = state.score.toLocaleString('en-US');
  els.combo.textContent = state.combo > 1 ? '×' + state.combo.toFixed(1) : '';
  const o = state.objective;
  if (o) {
    els.obj.textContent = o.title + (o.timer != null ? ` — ${Math.max(0, Math.ceil(o.timer))}s` : '');
    els.win.textContent = 'WIN: ' + o.win;
    els.lose.textContent = 'LOSE: ' + o.lose;
  }
  const stars = state.heat.stars;
  els.stars.textContent = 'NET ' + '◆'.repeat(stars) + '◇'.repeat(5 - stars);
  els.stars.style.color = stars >= 4 ? '#ff5f5f' : stars >= 2 ? '#ffb84c' : '#8a93a5';
  els.heat.style.width = Math.round((state.heat.points / 500) * 100) + '%';
  if (state.playerCar) {
    els.hullWrap.style.visibility = 'visible';
    const pct = Math.max(0, Math.round((state.playerCar.hull / state.playerCar.maxHull) * 100));
    els.hull.style.width = pct + '%';
    els.hull.style.background = pct > 50 ? '#7ed492' : pct > 25 ? '#ffb84c' : '#ff5f5f';
  } else els.hullWrap.style.visibility = 'hidden';
  els.district.textContent = state.districtName || '';
}

export function setMsg(text) {
  if (!els) grab();
  if (els && els.msg) els.msg.textContent = text || '';
}
