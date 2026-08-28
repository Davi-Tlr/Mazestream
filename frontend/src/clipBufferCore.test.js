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
  }), /clipe ficou longo demais/);
  assert.equal(runtime.video.length, 0);
});

test("small packets cannot grow metadata without bound", () => {
  const runtime = { video: Array(MAX_CLIP_PACKETS).fill({}), audio: [], bufferedBytes: 1, order: 0 };
  assert.throws(() => appendClipPacket(runtime, "audio", { byteLength: 1 }), /clipe ficou longo demais/);
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

test("packet metadata keeps the last real decoder config through empty and omitted callbacks", () => {
  const runtime = { video: [], audio: [], bufferedBytes: 0, order: 0 };
  const packet = { byteLength: 3, clone() { return this; } };
  const audioMeta = { decoderConfig: { codec: "opus", sampleRate: 48000, numberOfChannels: 2, description: new Uint8Array([1, 2, 3]) } };
  const videoMeta = { decoderConfig: { codec: "vp8", codedWidth: 1280, codedHeight: 720, colorSpace: { matrix: "bt709" } } };
  for (const [kind, meta] of [["audio", audioMeta], ["video", videoMeta]]) {
    appendClipPacket(runtime, kind, packet, meta);
    appendClipPacket(runtime, kind, packet, {});
    appendClipPacket(runtime, kind, packet);
    assert.deepEqual(runtime[kind][0].meta, meta);
    assert.notEqual(runtime[kind][0].meta.decoderConfig, meta.decoderConfig);
    assert.equal(runtime[kind][1].meta, runtime[kind][0].meta);
    assert.equal(runtime[kind][2].meta, runtime[kind][0].meta);
  }
  audioMeta.decoderConfig.description[0] = 9;
  videoMeta.decoderConfig.colorSpace.matrix = "bt470bg";
  assert.equal(runtime.audio[0].meta.decoderConfig.description[0], 1);
  assert.equal(runtime.video[0].meta.decoderConfig.colorSpace.matrix, "bt709");
});

test("a new decoder config does not rewrite metadata belonging to buffered packets", () => {
  const runtime = { video: [], audio: [], bufferedBytes: 0, order: 0 };
  const packet = { byteLength: 3, clone() { return this; } };
  const first = { decoderConfig: { codec: "opus", sampleRate: 48000, numberOfChannels: 2 } };
  const second = { decoderConfig: { ...first.decoderConfig, numberOfChannels: 1 } };
  appendClipPacket(runtime, "audio", packet, first);
  appendClipPacket(runtime, "audio", packet, {});
  appendClipPacket(runtime, "audio", packet, second);
  appendClipPacket(runtime, "audio", packet, {});
  assert.deepEqual(runtime.audio.slice(0, 2).map((entry) => entry.meta), [first, first]);
  assert.deepEqual(runtime.audio.slice(2).map((entry) => entry.meta), [second, second]);
  assert.deepEqual(runtime.audioMeta, second);
});
