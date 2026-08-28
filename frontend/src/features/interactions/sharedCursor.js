export const CURSOR_INTERVAL_MS = 40;
export const CURSOR_TTL_MS = 1400;
export const MAX_REMOTE_CURSORS = 64;
export const EMPTY_CURSORS = Object.freeze([]);

export function normalizedCursorPoint(point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)
      || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
  return { x: Math.round(point.x * 10000) / 10000, y: Math.round(point.y * 10000) / 10000 };
}

// Coalesce mouse samples, including the last position of a short movement.
// At most one movement is in flight; leave messages bypass that lossy queue.
export function createCursorPublisher(publish, {
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, nextSequence
} = {}) {
  let sequence = 0;
  const next = nextSequence || (() => ++sequence);
  let tile = null, pending = null, timer = null, lastPoint = null;
  let lastSent = -Infinity, inFlight = false, disposed = false;
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const send = (packet, reliable) => {
    try { return Promise.resolve(publish(packet, reliable)).catch(() => false); }
    catch { return Promise.resolve(false); }
  };
  const schedule = () => {
    if (disposed || !pending || inFlight || timer !== null) return;
    const delay = Math.max(0, CURSOR_INTERVAL_MS - (now() - lastSent));
    if (delay > 0) { timer = setTimer(() => { timer = null; flush(); }, delay); return; }
    flush();
  };
  const flush = () => {
    if (disposed || !pending || inFlight) return;
    const point = pending;
    pending = null; lastPoint = point; lastSent = now(); inFlight = true;
    void send({ type: "cursor", tile, ...point, seq: next() }, false).finally(() => {
      inFlight = false;
      schedule();
    });
  };
  const hide = (target = tile) => {
    if (!tile || target !== tile) return;
    const previous = tile;
    tile = null; pending = null; lastPoint = null;
    clear();
    void send({ type: "cursor", tile: previous, visible: false, seq: next() }, true);
  };
  return {
    update(target, point) {
      if (disposed || typeof target !== "string" || !target || target.length > 256) return;
      const normalized = normalizedCursorPoint(point);
      if (!normalized) { hide(target); return; }
      if (tile !== target) { hide(); tile = target; lastSent = -Infinity; }
      if (lastPoint?.x === normalized.x && lastPoint?.y === normalized.y && !pending) return;
      pending = normalized;
      schedule();
    },
    hide,
    dispose() { hide(); disposed = true; clear(); }
  };
}

// Cursor traffic has its own subscriptions: moving a pointer must not render
// the room, video elements, toolbar or drawing canvas on every packet.
export function createRemoteCursorStore({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const records = new Map(), listeners = new Map(), snapshots = new Map();
  let timer = null;
  const notify = (tile) => {
    if (!tile) return;
    snapshots.delete(tile);
    listeners.get(tile)?.forEach((listener) => listener());
  };
  const hideRecord = (record) => {
    const tile = record.item?.tile;
    record.item = null;
    notify(tile);
  };
  const scheduleExpiry = () => {
    if (timer !== null) return;
    let next = Infinity;
    for (const record of records.values()) if (record.item) next = Math.min(next, record.expires);
    if (!Number.isFinite(next)) return;
    timer = setTimer(() => {
      timer = null;
      for (const record of records.values()) if (record.item && record.expires <= now()) hideRecord(record);
      scheduleExpiry();
    }, Math.max(0, next - now()));
  };
  return {
    receive(data, identity, author = identity) {
      if (!identity || typeof identity !== "string" || identity.length > 256
          || data?.type !== "cursor" || typeof data.tile !== "string" || !data.tile || data.tile.length > 256) return false;
      const hidden = data.visible === false;
      const point = hidden ? null : normalizedCursorPoint(data);
      if (!hidden && !point) return false;
      if (data.seq !== undefined && (!Number.isSafeInteger(data.seq) || data.seq < 1)) return false;
      let record = records.get(identity);
      // A reliable leave may overtake an older lossy position (or vice versa).
      // Keep the last sequence even after hiding/expiry to prevent resurrection.
      if (record?.seq && (data.seq === undefined || data.seq <= record.seq)) return false;
      if (!record) {
        if (records.size >= MAX_REMOTE_CURSORS) this.remove(records.keys().next().value);
        record = { seq: 0, item: null, expires: 0 };
        records.set(identity, record);
      }
      record.seq = data.seq || record.seq;
      if (hidden) { hideRecord(record); return true; }
      const previous = record.item;
      record.item = { id: identity, identity, author: String(author).slice(0, 80), tile: data.tile, ...point };
      record.expires = now() + CURSOR_TTL_MS;
      if (previous?.tile !== data.tile) notify(previous?.tile);
      if (!previous || previous.tile !== data.tile || previous.x !== point.x || previous.y !== point.y || previous.author !== record.item.author) notify(data.tile);
      scheduleExpiry();
      return true;
    },
    snapshot(tile) {
      if (snapshots.has(tile)) return snapshots.get(tile);
      const items = [...records.values()].map((record) => record.item).filter((item) => item?.tile === tile);
      if (!items.length) return EMPTY_CURSORS;
      snapshots.set(tile, items);
      return items;
    },
    subscribe(tile, listener) {
      if (!listeners.has(tile)) listeners.set(tile, new Set());
      listeners.get(tile).add(listener);
      return () => {
        listeners.get(tile)?.delete(listener);
        if (!listeners.get(tile)?.size) { listeners.delete(tile); snapshots.delete(tile); }
      };
    },
    hideWhere(predicate) {
      for (const record of records.values()) if (record.item && predicate(record.item)) hideRecord(record);
    },
    expire() {
      for (const record of records.values()) if (record.item && record.expires <= now()) hideRecord(record);
    },
    remove(identity) {
      const record = records.get(identity);
      records.delete(identity);
      if (record) notify(record.item?.tile);
    },
    clear() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      const tiles = new Set([...records.values()].map((record) => record.item?.tile));
      records.clear(); snapshots.clear();
      tiles.forEach(notify);
    }
  };
}
