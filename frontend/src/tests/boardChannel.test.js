import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { ConnectionState, RoomEvent } from "livekit-client";
import { attachBoardChannel } from "../features/board/boardChannel.js";
import { prepareInteractionPublication } from "../features/interactions/interactions.js";
import { applyBoardOperation, createBoardDocument, recordBoardMutation } from "../features/board/boardSync.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));
const stroke = (id) => ({ type: "board-stroke", id, points: [[0.1, 0.2], [0.5, 0.8]], color: "#ffffff", width: 4 });

function mesh(t) {
  const peers = new Map();
  const sent = [];
  const warnings = [];
  function peer(identity, strokes = [], state = ConnectionState.Connected) {
    const room = new EventEmitter();
    room.state = state;
    room.localParticipant = { identity, permissions: { canPublishData: true } };
    room.remoteParticipants = new Map();
    const documentRef = { current: strokes.reduce(applyBoardOperation, createBoardDocument()) };
    const pendingRef = { current: null };
    const project = (document) => { documentRef.current = document; };
    const apply = (operation) => {
      recordBoardMutation(pendingRef.current, operation);
      project(applyBoardOperation(documentRef.current, operation));
    };
    const sendData = async (data, reliable, destinations) => {
      const { payload, options } = prepareInteractionPublication(data, reliable, destinations);
      sent.push({ sender: identity, data, options });
      for (const destination of options.destinationIdentities || room.remoteParticipants.keys()) {
        const target = peers.get(destination);
        if (!target || target.room.state !== ConnectionState.Connected) continue;
        queueMicrotask(() => target.room.emit(RoomEvent.DataReceived, payload, room.localParticipant, undefined, options.topic));
      }
      return true;
    };
    const item = { room, documentRef, pendingRef, apply, sendData };
    item.attach = () => {
      const cleanup = attachBoardChannel({ ...item, canPublishData: true, project, message: { warning: (text) => warnings.push(text) } });
      t.after(cleanup);
      return cleanup;
    };
    peers.set(identity, item);
    return item;
  }
  function link(left, right) {
    left.room.remoteParticipants.set(right.room.localParticipant.identity, right.room.localParticipant);
    right.room.remoteParticipants.set(left.room.localParticipant.identity, left.room.localParticipant);
  }
  return { peer, link, sent, warnings };
}

test("a room mounted while connecting requests history after Connected, not before", async (t) => {
  const { peer, link, sent, warnings } = mesh(t);
  const source = peer("alice", Array.from({ length: 30 }, (_, i) => stroke(String(i))));
  source.attach();
  const joining = peer("bob", [], ConnectionState.Connecting);
  link(source, joining);
  joining.attach();
  assert.equal(sent.length, 0);
  joining.room.state = ConnectionState.Connected;
  joining.room.emit(RoomEvent.Connected);
  await settle();
  assert.deepEqual(joining.documentRef.current, source.documentRef.current);
  assert.equal(joining.pendingRef.current, null);
  assert.equal(sent.filter((item) => item.data.type === "board-sync").length, 3);
  assert.ok(sent.every((item) => item.options.reliable));
  assert.deepEqual(warnings, []);
});

test("with three peers, only the chosen responder sends history and only the requester receives it", async (t) => {
  const { peer, link, sent } = mesh(t);
  const a = peer("alice", [stroke("existing")]);
  a.attach();
  const c = peer("carol");
  link(a, c);
  c.attach();
  await settle();
  sent.length = 0;
  const b = peer("bob");
  link(a, b);
  link(c, b);
  b.attach();
  await settle();
  assert.deepEqual(b.documentRef.current, a.documentRef.current);
  const responses = sent.filter((item) => item.data.type === "board-sync");
  assert.equal(responses.length, 1);
  assert.equal(responses[0].sender, "alice");
  assert.deepEqual(responses[0].options.destinationIdentities, ["bob"]);
  assert.deepEqual(sent[0].options.destinationIdentities, ["alice"]);
  assert.deepEqual(c.documentRef.current, a.documentRef.current);
});

test("reconnection discards the pending request and obtains a fresh board", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const { peer, link, sent } = mesh(t);
  const a = peer("alice", [stroke("before")]);
  a.attach();
  const b = peer("bob");
  link(a, b);
  b.attach();
  await settle();
  b.room.state = ConnectionState.Reconnecting;
  b.room.emit(RoomEvent.Reconnecting);
  assert.equal(b.pendingRef.current, null);
  a.apply(stroke("after"));
  // Advance past the responder's cooldown without sleeping in the test.
  now += 2100;
  const count = sent.length;
  assert.equal(b.pendingRef.current, null);
  b.room.state = ConnectionState.Connected;
  b.room.emit(RoomEvent.Reconnected);
  await settle();
  assert.ok(sent.length > count);
  assert.deepEqual(b.documentRef.current, a.documentRef.current);
});

test("cleanup removes all channel listeners and cancels an unanswered request", (t) => {
  const { peer, link, sent } = mesh(t);
  const a = peer("alice");
  const b = peer("bob");
  link(a, b);
  const cleanup = b.attach();
  assert.ok(b.pendingRef.current);
  cleanup();
  assert.equal(b.pendingRef.current, null);
  assert.equal(b.room.eventNames().length, 0);
  b.room.emit(RoomEvent.Connected);
  b.room.emit(RoomEvent.Reconnected);
  assert.equal(sent.length, 1);
});

test("an existing empty room does not request history from a newcomer", async (t) => {
  const { peer, link, sent } = mesh(t);
  const a = peer("alice");
  a.attach();
  const b = peer("bob");
  link(a, b);
  a.room.emit(RoomEvent.ParticipantConnected, b.room.localParticipant);
  b.attach();
  await settle();
  assert.equal(sent.filter((item) => item.data.type === "board-request").length, 1);
  assert.equal(b.pendingRef.current, null);
  assert.deepEqual(a.documentRef.current, b.documentRef.current);
});

test("simultaneous entrants can answer each other without a pending-request deadlock", async (t) => {
  const { peer, link } = mesh(t);
  const a = peer("alice");
  const b = peer("bob");
  link(a, b);
  a.attach();
  b.attach();
  await settle();
  assert.equal(a.pendingRef.current, null);
  assert.equal(b.pendingRef.current, null);
  assert.deepEqual(a.documentRef.current, b.documentRef.current);
});
