export const CONTROLS_IDLE_MS = 2600;

// One timer regardless of pointer frequency. Only visibility transitions render.
export function createIdleControls(onIdle, {
  delay = CONTROLS_IDLE_MS, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout
} = {}) {
  let timer = null;
  let lastActivity = now();
  let idle = false;
  let blocked = false;
  let disposed = false;
  const publish = (value) => {
    if (idle === value || disposed) return;
    idle = value;
    onIdle(value);
  };
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const schedule = () => {
    if (timer !== null || blocked || disposed) return;
    timer = setTimer(() => {
      timer = null;
      if (now() - lastActivity >= delay) publish(true);
      else schedule();
    }, Math.max(0, delay - (now() - lastActivity)));
  };
  const wake = () => { if (disposed) return; lastActivity = now(); publish(false); schedule(); };
  schedule();
  return {
    wake,
    hide() { if (!blocked) { clear(); publish(true); } },
    setBlocked(value) { blocked = value; clear(); wake(); },
    dispose() { disposed = true; clear(); }
  };
}
