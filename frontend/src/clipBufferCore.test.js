import test from "node:test";
import assert from "node:assert/strict";
import { appendClipPacket, bufferedPacketBytes, MAX_CLIP_BUFFER_BYTES, MAX_CLIP_PACKETS, getBufferedSeconds, pruneRollingPackets, selectClipEntries } from "./clipBufferCore.js";

function entry(timestamp, type = "delta", order = timestamp * 10) {
  return { order, packet: { timestamp, duration: 1, type } };
}

test("o clipe sempre começa no keyframe anterior ao intervalo pedido", () => {
  const video = Array.from({ length: 41 }, (_, index) => entry(index, index % 5 === 0 ? "key" : "delta"));
  const selected = selectClipEntries(video, [], 40, 18);
  assert.equal(selected.startTimestamp, 20);
  assert.equal(selected.video[0].packet.type, "key");
  assert.equal(selected.video.at(-1).packet.timestamp, 40);
});

test("a poda mantém uma margem e um keyframe válido", () => {
  const video = Array.from({ length: 101 }, (_, index) => entry(index, index % 2 === 0 ? "key" : "delta"));
  const audio = Array.from({ length: 101 }, (_, index) => entry(index, "key", index * 10 + 1));
  const pruned = pruneRollingPackets(video, audio, 100, 30);
  assert.equal(pruned.video[0].packet.timestamp, 66);
  assert.equal(pruned.video[0].packet.type, "key");
  assert.ok(pruned.audio[0].packet.timestamp >= 65);
  assert.equal(getBufferedSeconds(pruned.video, 100, 30), 30);
});

test("não exporta antes de haver conteúdo suficiente", () => {
  const video = [entry(0, "key"), entry(1), entry(2), entry(3)];
  assert.equal(selectClipEntries(video, [], 3, 15), null);
});

test("the encoded buffer refuses bytes above its budget before cloning", () => {
  const runtime = { video: [], audio: [], bufferedBytes: MAX_CLIP_BUFFER_BYTES - 5, order: 0 };
  assert.throws(() => appendClipPacket(runtime, "video", {
    byteLength: 6, clone() { assert.fail("oversized packet must not be cloned"); }
  }), /limite de memória/);
  assert.equal(runtime.video.length, 0);
});

test("small packets cannot grow metadata without bound", () => {
  const runtime = { video: Array(MAX_CLIP_PACKETS).fill({}), audio: [], bufferedBytes: 1, order: 0 };
  assert.throws(() => appendClipPacket(runtime, "audio", { byteLength: 1 }), /limite de memória/);
});

test("audio, video and alpha bytes share one budget and pruning releases capacity", () => {
  const runtime = { video: [], audio: [], bufferedBytes: 0, order: 0 };
  const packet = { byteLength: 100, sideData: { alphaByteLength: 20 }, clone() { return this; } };
  appendClipPacket(runtime, "video", packet);
  appendClipPacket(runtime, "audio", { ...packet, sideData: null, byteLength: 10 });
  assert.equal(runtime.bufferedBytes, 130);
  assert.equal(bufferedPacketBytes(runtime.video, runtime.audio), 130);
  assert.equal(bufferedPacketBytes([], runtime.audio), 10);
});
