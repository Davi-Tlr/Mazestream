import test from "node:test";
import assert from "node:assert/strict";
import { createAreaPingGesture, PING_HOLD_MS } from "../features/interactions/areaPingGesture.js";

const pointer = (patch = {}) => ({
  pointerType: "mouse", pointerId: 1, isPrimary: true, button: 0, clientX: 50, clientY: 50,
  preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...patch
});
function fixture(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const sent = [];
  const gesture = createAreaPingGesture({
    getPoint: (event) => event.clientX < 0 ? null : { x: event.clientX / 100, y: event.clientY / 100 },
    onPing: (point, marker) => sent.push({ ...point, marker })
  });
  t.after(() => gesture.cancel());
  return { gesture, sent, tick: (ms) => t.mock.timers.tick(ms) };
}

test("middle click sends one area ping without selecting a tool or scrolling", (t) => {
  const { gesture, sent } = fixture(t);
  const event = pointer({ button: 1 });
  assert.equal(gesture.down(event, true, null), true);
  assert.equal(event.prevented, true);
  gesture.up(event); gesture.click(event);
  assert.equal(event.stopped, true);
  assert.deepEqual(sent, [{ x: 0.5, y: 0.5, marker: "ring" }]);
});

test("long touch pings once, with no second ping or tile click on release", (t) => {
  const { gesture, sent, tick } = fixture(t);
  const event = pointer({ pointerType: "touch" });
  gesture.down(event, true, null);
  tick(PING_HOLD_MS - 1); assert.equal(sent.length, 0);
  tick(1); assert.equal(sent.length, 1);
  gesture.up(event); gesture.click(event);
  assert.equal(sent.length, 1); assert.equal(event.stopped, true);
});

test("normal touch and right click never ping accidentally", (t) => {
  const { gesture, sent, tick } = fixture(t);
  const touch = pointer({ pointerType: "touch" });
  gesture.down(touch, true, null); gesture.up(touch);
  gesture.down(pointer({ button: 2 }), true, null);
  tick(PING_HOLD_MS); assert.equal(sent.length, 0);
});

test("a long primary mouse click creates only the basic ping", (t) => {
  const { gesture, sent, tick } = fixture(t);
  const mouse = pointer();
  gesture.down(mouse, true, null); tick(PING_HOLD_MS); gesture.up(mouse);
  assert.equal(sent.length, 1); assert.equal(sent[0].marker, "ring");
  for (const modifier of ["altKey", "shiftKey", "ctrlKey", "metaKey"]) {
    const modified = pointer({ [modifier]: true });
    gesture.down(modified, true, null); tick(PING_HOLD_MS); gesture.up(modified);
  }
  assert.equal(sent.length, 1);
});

for (const reason of ["movement", "cancel", "second finger"]) {
  test(`long press is cancelled by ${reason}`, (t) => {
    const { gesture, sent, tick } = fixture(t);
    const touch = pointer({ pointerType: "touch" });
    gesture.down(touch, true, null);
    if (reason === "movement") gesture.move(pointer({ pointerType: "touch", clientX: 80 }));
    else if (reason === "second finger") gesture.down(pointer({ pointerType: "touch", pointerId: 2, isPrimary: false }), true, null);
    else gesture.cancel();
    tick(PING_HOLD_MS); gesture.up(touch);
    assert.equal(sent.length, 0);
  });
}

test("ping tool supports a normal click and never doubles a long touch", (t) => {
  const { gesture, sent, tick } = fixture(t);
  const mouse = pointer();
  gesture.down(mouse, true, "point"); assert.equal(sent.length, 0);
  gesture.up(mouse); assert.equal(sent.length, 1);
  const touch = pointer({ pointerType: "touch" });
  gesture.down(touch, true, "point"); tick(PING_HOLD_MS); gesture.up(touch);
  assert.equal(sent.length, 2);
});

test("disabled interactions, drawing and letterbox areas do not start a touch ping", (t) => {
  const { gesture, sent, tick } = fixture(t);
  const touch = pointer({ pointerType: "touch" });
  assert.equal(gesture.down(touch, false, null), false);
  assert.equal(gesture.down(touch, true, "draw"), false);
  assert.equal(gesture.down(pointer({ ...touch, clientX: -10 }), true, null), false);
  tick(PING_HOLD_MS); assert.equal(sent.length, 0);
});
