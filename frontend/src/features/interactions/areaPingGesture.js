export const PING_HOLD_MS = 650;
export const PING_MOVE_TOLERANCE = 10;

// Pointer events keep mouse, touch and pen from emitting duplicate pings.
export function createAreaPingGesture({ getPoint, onPing, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
  let press = null;
  let timer = null;
  let suppressClickUntil = 0;
  const cancel = () => { if (timer !== null) clearTimer(timer); timer = null; press = null; };
  const send = (point) => { suppressClickUntil = now() + 1000; onPing(point, "ring"); };
  return {
    down(event, enabled, tool) {
      if (!enabled) { cancel(); return false; }
      if (event.isPrimary === false) { cancel(); return false; }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) { cancel(); return false; }
      if (event.button === 1) {
        const point = getPoint(event);
        if (!point) return false;
        event.preventDefault(); event.stopPropagation();
        cancel(); send(point); return true;
      }
      if (event.button !== 0 || tool === "draw" || tool === "reaction") return false;
      const point = getPoint(event);
      if (!point) return false;
      cancel();
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, point, tap: tool === "point", sent: false };
      timer = setTimer(() => {
        timer = null;
        if (!press) return;
        press.sent = true;
        send(press.point);
      }, PING_HOLD_MS);
      return true;
    },
    move(event) {
      if (!press || press.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > PING_MOVE_TOLERANCE) cancel();
    },
    up(event) {
      if (!press || press.id !== event.pointerId) return false;
      const current = press;
      cancel();
      if (current.tap && !current.sent) send(current.point);
      if (current.tap || current.sent) { event.preventDefault(); event.stopPropagation(); return true; }
      return false;
    },
    click(event) {
      if (now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    },
    contextMenu(event) { if (press || now() < suppressClickUntil) event.preventDefault(); },
    cancel
  };
}
