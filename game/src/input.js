// input.js — keyboard and mouse state. The game reads `keys` (held),
// consumes one-shot presses through `pressed`, and gets canvas clicks
// through a queue the screens drain.

export const keys = Object.create(null);
export const pressed = Object.create(null);
export const clicks = [];
export const mouse = { x: 0, y: 0, down: false };

let attached = false;

export function attachInput(canvas) {
  if (attached) return;
  attached = true;
  addEventListener('keydown', (e) => {
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    mouse.x = x; mouse.y = y; mouse.down = true;
    clicks.push({ x, y });
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
  });
  addEventListener('mouseup', () => { mouse.down = false; });
}

// Called once per frame by the loop after every system has read presses.
export function endFrameInput() {
  for (const k in pressed) pressed[k] = false;
  clicks.length = 0;
}

export function axis() {
  return {
    x: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
    y: (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0),
  };
}
