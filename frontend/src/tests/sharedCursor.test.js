import test from "node:test";
import assert from "node:assert/strict";
import { createCursorPublisher, createRemoteCursorStore, CURSOR_INTERVAL_MS, CURSOR_TTL_MS, MAX_REMOTE_CURSORS } from "../features/interactions/sharedCursor.js";
import { prepareInteractionPublication } from "../features/interactions/interactions.js";

const settle = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };
const move = (seq, x = 0.2, tile = "screen") => ({ type: "cursor", tile, x, y: 0.5, seq });
const leave = (seq, tile = "screen") => ({ type: "cursor", tile, visible: false, seq });
function fixture(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const store = createRemoteCursorStore();
  t.after(() => store.clear());
  return { store, tick: (ms) => t.mock.timers.tick(ms) };
}

test("leave hides immediately; an older position cannot resurrect the cursor", (t) => {
  const { store } = fixture(t);
  store.receive(move(1), "alice");
  assert.equal(store.snapshot("screen").length, 1);
  store.receive(leave(3), "alice");
  assert.equal(store.snapshot("screen").length, 0);
  assert.equal(store.receive(move(2), "alice"), false);
  assert.equal(store.snapshot("screen").length, 0);
});

test("quick re-entry wins over a delayed leave from the previous visit", (t) => {
  const { store } = fixture(t);
  store.receive(move(1), "alice");
  store.receive(move(3, 0.8), "alice");
  assert.equal(store.receive(leave(2), "alice"), false);
  assert.equal(store.snapshot("screen")[0].x, 0.8);
});

test("one cursor per person, even after moving between a stream and the board", (t) => {
  const { store } = fixture(t);
  store.receive(move(1), "alice");
  store.receive(move(2, 0.7, "board"), "alice");
  assert.equal(store.snapshot("screen").length, 0);
  assert.equal(store.snapshot("board").length, 1);
  store.remove("alice");
  assert.equal(store.snapshot("board").length, 0);
});

test("silent or disconnected senders expire; stale samples stay rejected", (t) => {
  const { store, tick } = fixture(t);
  store.receive(move(5), "alice");
  tick(CURSOR_TTL_MS);
  assert.equal(store.snapshot("screen").length, 0);
  assert.equal(store.receive(move(4), "alice"), false);
  store.receive(move(6), "alice");
  assert.equal(store.snapshot("screen").length, 1);
});

test("legacy samples expire, but cannot override a sequenced stream", (t) => {
  const { store, tick } = fixture(t);
  store.receive(move(undefined), "alice");
  tick(CURSOR_TTL_MS);
  assert.equal(store.snapshot("screen").length, 0);
  store.receive(move(2), "alice");
  assert.equal(store.receive(move(undefined, 0.9), "alice"), false);
});

test("invalid cursor data cannot poison sequencing or snapshots", (t) => {
  const { store } = fixture(t);
  for (const packet of [move(1, NaN), move(1, -1), move(1, 2), move(-1), move(Infinity), move(1.5), move(1, 0.3, "x".repeat(257))]) {
    assert.equal(store.receive(packet, "alice"), false);
  }
  assert.equal(store.receive(move(1), "alice"), true);
});

test("only the affected cursor layer is notified; quiet mode hides existing pointers", (t) => {
  const { store } = fixture(t);
  let screenChanges = 0, boardChanges = 0;
  const unsubscribe = store.subscribe("screen", () => screenChanges++);
  store.subscribe("board", () => boardChanges++);
  store.receive(move(1), "alice");
  const snapshot = store.snapshot("screen");
  assert.equal(store.snapshot("screen"), snapshot);
  store.receive(move(2, 0.6), "alice");
  assert.equal(screenChanges, 2); assert.equal(boardChanges, 0);
  store.hideWhere(() => true);
  assert.equal(store.snapshot("screen").length, 0);
  assert.equal(store.receive(move(1), "alice"), false);
  unsubscribe(); store.clear();
});

test("participant bookkeeping and visible cursors are bounded", (t) => {
  const { store } = fixture(t);
  for (let i = 0; i < 200; i++) store.receive(move(1), `person-${i}`);
  assert.equal(store.snapshot("screen").length, MAX_REMOTE_CURSORS);
  store.clear();
  assert.equal(store.snapshot("screen").length, 0);
});

test("publisher coalesces high frequency moves and sends the final sample", async (t) => {
  const { tick } = fixture(t);
  const packets = [];
  const publisher = createCursorPublisher((data, reliable) => packets.push({ data, reliable }));
  t.after(() => publisher.dispose());
  publisher.update("screen", { x: 0.1, y: 0.5 }); await settle();
  for (let i = 1; i <= 7; i++) { tick(5); publisher.update("screen", { x: i / 10, y: 0.5 }); }
  assert.equal(packets.length, 1);
  tick(5); await settle();
  assert.equal(packets.length, 2);
  assert.equal(packets[1].data.x, 0.7);
  assert.equal(packets[1].reliable, false);
  publisher.update("screen", null);
  assert.equal(packets.at(-1).data.visible, false);
  assert.equal(packets.at(-1).reliable, true);
});

test("a blocked send keeps only the newest pending move; leave bypasses it", async (t) => {
  const { tick } = fixture(t);
  const packets = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const publisher = createCursorPublisher((data, reliable) => { packets.push({ data, reliable }); return reliable ? true : blocked; });
  t.after(() => publisher.dispose());
  publisher.update("screen", { x: 0.1, y: 0.5 });
  for (let i = 0; i < 1000; i++) { tick(1); publisher.update("screen", { x: i / 1000, y: 0.5 }); }
  assert.equal(packets.length, 1);
  publisher.update("screen", null);
  assert.equal(packets.length, 2);
  release(); await settle(); tick(CURSOR_INTERVAL_MS); await settle();
  assert.equal(packets.length, 2);
  publisher.update("screen", { x: 0.3, y: 0.5 }); await settle();
  assert.equal(packets.length, 3);
  assert.ok(packets[2].data.seq > packets[1].data.seq);
});

test("disposal and tile changes cancel pending samples without hiding the new tile", async (t) => {
  const { tick } = fixture(t);
  const packets = [];
  const publisher = createCursorPublisher((data) => packets.push(data));
  publisher.update("screen", { x: 0.1, y: 0.5 }); await settle();
  publisher.update("board", { x: 0.5, y: 0.5 }); await settle();
  publisher.update("screen", null);
  assert.equal(packets.at(-1).tile, "board");
  assert.notEqual(packets.at(-1).visible, false);
  publisher.update("board", { x: 0.7, y: 0.5 });
  publisher.dispose(); tick(5000); await settle();
  assert.equal(packets.at(-1).visible, false);
  assert.equal(packets.some((packet) => packet.x === 0.7), false);
});

test("cursor leave is reliable while position packets remain small and lossy", () => {
  const position = prepareInteractionPublication(move(1));
  const hidden = prepareInteractionPublication(leave(2));
  assert.equal(position.options.reliable, false);
  assert.equal(hidden.options.reliable, true);
  assert.ok(position.payload.byteLength < 160);
  assert.ok(hidden.payload.byteLength < 160);
});
