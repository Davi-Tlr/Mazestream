import test from "node:test";
import assert from "node:assert/strict";
import { createIdleControls, CONTROLS_IDLE_MS } from "../features/room/idleControls.js";

function fixture(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const changes = [];
  const controls = createIdleControls((idle) => changes.push(idle));
  t.after(() => controls.dispose());
  return { controls, changes, tick: (ms) => t.mock.timers.tick(ms) };
}

test("stationary controls hide and wake only on real activity", (t) => {
  const { controls, changes, tick } = fixture(t);
  tick(CONTROLS_IDLE_MS - 1); assert.deepEqual(changes, []);
  tick(1); assert.deepEqual(changes, [true]);
  controls.wake(); assert.deepEqual(changes, [true, false]);
  tick(CONTROLS_IDLE_MS); assert.deepEqual(changes, [true, false, true]);
});

test("pointer updates extend the deadline without rendering every movement", (t) => {
  const { controls, changes, tick } = fixture(t);
  for (let n = 0; n < 60; n++) { tick(50); controls.wake(); }
  assert.deepEqual(changes, []);
  tick(CONTROLS_IDLE_MS); assert.deepEqual(changes, [true]);
});

test("an open menu, keyboard focus or drag prevents controls disappearing", (t) => {
  const { controls, changes, tick } = fixture(t);
  controls.setBlocked(true); controls.hide(); tick(60000);
  assert.deepEqual(changes, []);
  controls.setBlocked(false); tick(CONTROLS_IDLE_MS);
  assert.deepEqual(changes, [true]);
});

test("leaving hides controls and disposal cancels pending work", (t) => {
  const { controls, changes, tick } = fixture(t);
  controls.hide(); assert.deepEqual(changes, [true]);
  controls.wake(); controls.dispose(); tick(60000); controls.wake();
  assert.deepEqual(changes, [true, false]);
});
