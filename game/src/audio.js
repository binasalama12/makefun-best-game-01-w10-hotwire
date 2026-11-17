// audio.js — a tiny WebAudio synth: a two-oscillator engine whose pitch
// follows your speed, a two-tone siren that swells as units close in,
// and one-shot blips for pickups, cash, crashes and menus. No audio
// files; everything is oscillators and filtered noise. Sound starts on
// the first user gesture, per browser rules.

let ctx = null, engine = null, engineGain = null, siren = null, sirenGain = null;
let sirenPhase = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineGain.connect(ctx.destination);
    engine = ctx.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 60;
    const e2 = ctx.createOscillator(); e2.type = 'square'; e2.frequency.value = 30;
    const eg2 = ctx.createGain(); eg2.gain.value = 0.4;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    engine.connect(lp); e2.connect(eg2); eg2.connect(lp); lp.connect(engineGain);
    engine.start(); e2.start();
    engine._sub = e2;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenGain.connect(ctx.destination);
    siren = ctx.createOscillator(); siren.type = 'triangle'; siren.frequency.value = 700;
    siren.connect(sirenGain); siren.start();
  } catch { ctx = null; }
}

export function updateAudio(state, dt) {
  if (!ctx) return;
  const car = state.playerCar;
  if (car && state.mode === 'play') {
    const sp = Math.hypot(car.vx, car.vy);
    const f = 55 + sp * 0.55 + (car.boostOn ? 40 : 0);
    engine.frequency.setTargetAtTime(f, ctx.currentTime, 0.06);
    engine._sub.frequency.setTargetAtTime(f / 2, ctx.currentTime, 0.06);
    engineGain.gain.setTargetAtTime(0.05 + Math.min(0.05, sp / 4000), ctx.currentTime, 0.1);
  } else engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  // Siren: nearest unit sets the volume, phase sets the two-tone.
  let nearest = Infinity;
  for (const u of state.units) {
    const d = Math.hypot(u.x - state.player.x, u.y - state.player.y);
    if (d < nearest) nearest = d;
  }
  sirenPhase += dt * 2.4;
  const on = state.mode === 'play' && nearest < 560;
  siren.frequency.setTargetAtTime(Math.sin(sirenPhase * Math.PI) > 0 ? 760 : 570, ctx.currentTime, 0.03);
  sirenGain.gain.setTargetAtTime(on ? Math.max(0, 0.028 * (1 - nearest / 620)) : 0, ctx.currentTime, 0.15);
}

function blip(freq, dur, type = 'sine', vol = 0.08, slide = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + dur);
}

function noise(dur, vol, freq) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start();
}

export const sfx = {
  pickup() { blip(660, 0.12, 'sine', 0.09); setTimeout(() => blip(990, 0.16, 'sine', 0.09), 70); },
  cash() { blip(1180, 0.07, 'square', 0.05); setTimeout(() => blip(1560, 0.1, 'square', 0.05), 55); },
  crash(big) { noise(big ? 0.3 : 0.16, big ? 0.22 : 0.12, 900); blip(90, 0.2, 'sawtooth', 0.1, -40); },
  lift() { blip(220, 0.1, 'square', 0.06); setTimeout(() => blip(440, 0.14, 'square', 0.06), 90); },
  popped() { noise(0.22, 0.18, 2400); blip(300, 0.3, 'sawtooth', 0.08, -220); },
  draft() { blip(520, 0.1, 'triangle', 0.09); setTimeout(() => blip(780, 0.18, 'triangle', 0.09), 80); },
  busted() { blip(392, 0.22, 'square', 0.1); setTimeout(() => blip(311, 0.22, 'square', 0.1), 200); setTimeout(() => blip(233, 0.4, 'square', 0.1), 400); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.09), i * 110)); },
  click() { blip(840, 0.05, 'sine', 0.05); },
};
