export const PING_TTL_MS = 1800;
export const PING_COOLDOWN_MS = 1000;
export const MAX_VISIBLE_PINGS = 4;

export function createPingGate(now = Date.now) {
  const last = new Map();
  return {
    accept(identity) {
      const time = now();
      if (last.has(identity) && time - last.get(identity) < PING_COOLDOWN_MS) return false;
      if (!last.has(identity) && last.size >= 64) last.delete(last.keys().next().value);
      last.set(identity, time);
      return true;
    },
    remove(identity) { last.delete(identity); },
    clear() { last.clear(); }
  };
}

export function mergeTransientInteraction(list, item) {
  const owner = item.identity || item.author;
  let next = list.filter((current) => current.id !== item.id
    && !(item.type === "ping" && current.type === "ping" && (current.identity || current.author) === owner));
  if (item.type === "ping") {
    const retained = new Set(next.filter((current) => current.type === "ping").slice(-(MAX_VISIBLE_PINGS - 1)).map((current) => current.id));
    next = next.filter((current) => current.type !== "ping" || retained.has(current.id));
  }
  return next.concat(item).slice(-80);
}
