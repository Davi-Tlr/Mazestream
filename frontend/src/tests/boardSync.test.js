import test from "node:test";
import assert from "node:assert/strict";
import { encodeInteraction } from "../features/interactions/interactions.js";
import {
  applyBoardOperation, boardResponderCandidates, buildBoardSnapshot, collectBoardSnapshot,
  createBoardDocument, createPendingBoardSync, nextBoardEpoch, recordBoardMutation, restoreBoardSnapshot
} from "../features/board/boardSync.js";

const stroke = (id) => ({ type: "board-stroke", id, points: [[0.1, 0.2], [0.5, 0.8]], color: "#ffffff", width: 4 });

test("snapshot packets are UTF-8 bounded, including long strokes and multibyte IDs", () => {
  let doc = createBoardDocument();
  const points = Array.from({ length: 600 }, (_, i) => [(i * 7919 % 10000) / 10000, (i * 3571 % 10000) / 10000]);
  for (let i = 0; i < 40; i++) doc = applyBoardOperation(doc, { ...stroke("é".repeat(60) + i), points });
  const packets = buildBoardSnapshot(doc, "request-1");
  assert.ok(packets.length > 1);
  assert.ok(packets.every((packet) => encodeInteraction(packet).byteLength <= 12 * 1024));
  const pending = createPendingBoardSync("source", "request-1");
  let snapshot;
  for (const packet of [...packets].reverse()) snapshot = collectBoardSnapshot(pending, packet, "source") || snapshot;
  assert.deepEqual(snapshot, doc);
});

test("empty snapshots finish; unrelated, duplicate and unsolicited responses do not apply", () => {
  const packet = buildBoardSnapshot(createBoardDocument(), "new")[0];
  const pending = createPendingBoardSync("source", "new");
  assert.equal(collectBoardSnapshot(pending, packet, "other"), null);
  assert.equal(collectBoardSnapshot(pending, { ...packet, requestId: "old" }, "source"), null);
  assert.equal(collectBoardSnapshot(null, packet, "source"), null);
  assert.equal(collectBoardSnapshot(pending, { ...packet, batchCount: 401 }, "source"), null);
  assert.deepEqual(collectBoardSnapshot(pending, packet, "source"), createBoardDocument());
  assert.equal(collectBoardSnapshot(pending, packet, "source"), null);
});

test("undo and new strokes during a snapshot are replayed without resurrecting removed strokes", () => {
  const initial = applyBoardOperation(createBoardDocument(), stroke("old"));
  const pending = createPendingBoardSync("source", "sync");
  const edits = [{ type: "board-erase", ids: ["old"] }, stroke("new")];
  let current = initial;
  for (const operation of edits) {
    current = applyBoardOperation(current, operation);
    recordBoardMutation(pending, operation);
  }
  const restored = restoreBoardSnapshot(current, initial, pending.mutations);
  assert.deepEqual(restored.strokes.map((item) => item.id), ["new"]);
});

test("clears advance epochs and reject old snapshots or delayed operations", () => {
  const initial = applyBoardOperation(createBoardDocument(), stroke("old"));
  const clear = { type: "board-clear", boardEpoch: nextBoardEpoch(initial, "alice") };
  const cleared = applyBoardOperation(initial, clear);
  assert.equal(restoreBoardSnapshot(cleared, initial, []), cleared);
  assert.equal(applyBoardOperation(cleared, { ...stroke("late"), boardEpoch: initial.epoch }), cleared);
  assert.deepEqual(applyBoardOperation(cleared, { ...stroke("new"), boardEpoch: cleared.epoch }).strokes.map((item) => item.id), ["new"]);
});

test("concurrent clear order is deterministic and live edits survive a snapshot in the same epoch", () => {
  const initial = createBoardDocument();
  const a = { type: "board-clear", boardEpoch: nextBoardEpoch(initial, "a") };
  const b = { type: "board-clear", boardEpoch: nextBoardEpoch(initial, "b") };
  assert.deepEqual([a, b].reduce(applyBoardOperation, initial), [b, a].reduce(applyBoardOperation, initial));
  const cleared = applyBoardOperation(initial, b);
  const edit = { ...stroke("new"), boardEpoch: cleared.epoch };
  assert.equal(restoreBoardSnapshot(applyBoardOperation(cleared, edit), cleared, [edit]).strokes.length, 1);
});

test("a repeated clear cannot erase strokes created after that clear", () => {
  const initial = createBoardDocument();
  const clear = { type: "board-clear", boardEpoch: nextBoardEpoch(initial, "alice") };
  const cleared = applyBoardOperation(initial, clear);
  const edited = applyBoardOperation(cleared, { ...stroke("new"), boardEpoch: cleared.epoch });
  assert.equal(applyBoardOperation(edited, clear), edited);
});

test("only one eligible responder is selected, consistently on different peers", () => {
  const a = { identity: "a", permissions: { canPublishData: true } };
  const b = { identity: "b", permissions: { canPublishData: true } };
  const c = { identity: "c", permissions: { canPublishData: false } };
  const room = { localParticipant: b, remoteParticipants: new Map([["c", c], ["a", a]]) };
  assert.deepEqual(boardResponderCandidates(room, "b"), ["a"]);
});

test("mutation buffers cannot grow without bound during a slow transfer", () => {
  const pending = createPendingBoardSync("source", "slow");
  for (let i = 0; i < 1100; i++) recordBoardMutation(pending, stroke(String(i)));
  assert.equal(pending.overflow, true);
  assert.equal(pending.mutations.length, 1024);
});

test("responder election prefers an established participant to a newcomer", () => {
  const room = {
    localParticipant: { identity: "requester", joinedAt: new Date(3000) },
    remoteParticipants: new Map([
      ["a", { identity: "a", joinedAt: new Date(2000) }],
      ["z", { identity: "z", joinedAt: new Date(1000) }]
    ])
  };
  assert.deepEqual(boardResponderCandidates(room, "requester"), ["z", "a"]);
});
