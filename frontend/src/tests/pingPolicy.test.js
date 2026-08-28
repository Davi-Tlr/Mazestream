import test from "node:test";
import assert from "node:assert/strict";
import { createPingGate, mergeTransientInteraction, PING_TTL_MS, PING_COOLDOWN_MS, MAX_VISIBLE_PINGS } from "../features/interactions/pingPolicy.js";

test("pings have a per-person cooldown independent of cursor traffic", () => {
  let now = 0;
  const gate = createPingGate(() => now);
  assert.equal(gate.accept("alice"), true);
  assert.equal(gate.accept("alice"), false);
  assert.equal(gate.accept("bob"), true);
  now += PING_COOLDOWN_MS;
  assert.equal(gate.accept("alice"), true);
  gate.remove("alice"); assert.equal(gate.accept("alice"), true);
});

test("a new ping replaces that person's previous ping without removing drawings", () => {
  const stroke = { type: "stroke", id: "drawing" };
  const old = { type: "ping", id: "old", identity: "alice", tile: "board" };
  const current = { type: "ping", id: "new", identity: "alice", tile: "screen" };
  const list = mergeTransientInteraction([stroke, old], current);
  assert.deepEqual(list, [stroke, current]);
});

test("a room cannot fill the screen with pings; visual lifetime stays short", () => {
  let list = [{ type: "stroke", id: "drawing" }];
  for (let i = 0; i < 20; i++) list = mergeTransientInteraction(list, { type: "ping", id: String(i), identity: String(i) });
  assert.equal(list.filter((item) => item.type === "ping").length, MAX_VISIBLE_PINGS);
  assert.equal(list[0].id, "drawing");
  assert.ok(PING_TTL_MS <= 2000);
});
