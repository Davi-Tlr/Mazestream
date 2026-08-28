import test from "node:test";
import assert from "node:assert/strict";
import { muxClip } from "./clipMux.js";
import { appendClipPacket, pruneRollingPackets, selectClipEntries } from "./clipBufferCore.js";
import * as clipMedia from "./clipMedia.js";
import { BufferSource, EncodedPacket, EncodedPacketSink, Input, WEBM } from "mediabunny";

function decoderMetadata(codec = "vp8") {
  return {
    video: { decoderConfig: { codec: codec === "vp9" ? "vp09.00.31.08" : "vp8", codedWidth: 1280, codedHeight: 720 } },
    audio: { decoderConfig: {
      codec: "opus", sampleRate: 48000, numberOfChannels: 2,
      // OpusHead: version 1, stereo, pre-skip 312, 48 kHz, mapping family 0.
      description: new Uint8Array([79, 112, 117, 115, 72, 101, 97, 100, 1, 2, 56, 1, 128, 187, 0, 0, 0, 0, 0])
    } }
  };
}

function fixture(stall = "") {
  const calls = [];
  let output;
  const never = () => new Promise(() => {});
  class BufferTarget {}
  class Source {
    constructor(codec) { this.codec = codec; }
    async add(packet, meta) { calls.push({ codec: this.codec, packet, meta }); }
    close() { calls.push("close-" + this.codec); }
  }
  class Output {
    constructor({ target }) { this.target = target; this.state = "pending"; output = this; }
    addVideoTrack() {}
    addAudioTrack() {}
    async start() { this.state = "started"; if (stall === "start") await never(); }
    async getMimeType() { return "video/webm"; }
    async finalize() {
      this.state = "finalizing";
      if (stall === "finalize") await never();
      this.target.buffer = new Uint8Array([1, 2, 3]).buffer;
      this.state = "finalized";
    }
    async cancel() {
      calls.push("cancel");
      this.state = "canceled";
      if (stall) await never();
    }
  }
  const entry = (timestamp, order) => ({ order, packet: { timestamp, clone: (patch) => ({ timestamp, ...patch }) } });
  const selection = { startTimestamp: 10, video: [entry(10, 0), entry(11, 2)], audio: [entry(10.2, 1)] };
  const meta = decoderMetadata("vp9");
  const runtime = { videoCodec: "vp9", audioCodec: "opus", videoMeta: meta.video, audioMeta: meta.audio,
    media: { BufferTarget, Output, WebMOutputFormat: class {}, EncodedVideoPacketSource: Source, EncodedAudioPacketSource: Source } };
  return { runtime, selection, calls, output: () => output };
}

test("clip mux preserves packet order, rebases timestamps and writes configuration on each first track packet", async () => {
  const { runtime, selection, calls, output } = fixture();
  const blob = await muxClip(runtime, selection, new AbortController().signal);
  assert.equal(blob.type, "video/webm");
  assert.equal(blob.size, 3);
  const packets = calls.filter((call) => typeof call === "object");
  assert.deepEqual(packets.map((call) => call.codec), ["vp9", "opus", "vp9"]);
  assert.equal(packets[0].packet.timestamp, 0);
  assert.ok(Math.abs(packets[1].packet.timestamp - 0.2) < 0.0001);
  assert.equal(packets[2].packet.timestamp, 1);
  assert.deepEqual(packets.map((call) => call.meta), [runtime.videoMeta, runtime.audioMeta, undefined]);
  assert.equal(output().state, "finalized");
  assert.equal(calls.includes("cancel"), false);
});

test("empty packet metadata does not hide the cached decoder configuration", async () => {
  const { runtime, selection, calls } = fixture();
  selection.video[0].meta = {};
  selection.audio[0].meta = {};
  await muxClip(runtime, selection, new AbortController().signal);
  const packets = calls.filter((call) => typeof call === "object");
  assert.deepEqual(packets.map((call) => call.meta), [runtime.videoMeta, runtime.audioMeta, undefined]);
});

test("a buffered packet uses its own configuration, not a newer runtime configuration", async () => {
  const { runtime, selection, calls } = fixture();
  const original = decoderMetadata("vp9");
  selection.video[0].meta = original.video;
  selection.audio[0].meta = original.audio;
  runtime.videoMeta = { decoderConfig: { ...original.video.decoderConfig, codedWidth: 1920 } };
  runtime.audioMeta = { decoderConfig: { ...original.audio.decoderConfig, numberOfChannels: 1 } };
  await muxClip(runtime, selection, new AbortController().signal);
  const packets = calls.filter((call) => typeof call === "object");
  assert.deepEqual(packets.map((call) => call.meta), [original.video, original.audio, undefined]);
});

for (const [kind, label] of [["video", "vídeo"], ["audio", "áudio"]]) {
  test(`missing ${kind} configuration fails clearly without silently dropping a track`, async () => {
    const { runtime, selection, output } = fixture();
    runtime[`${kind}Meta`] = null;
    selection[kind][0].meta = {};
    await assert.rejects(muxClip(runtime, selection, new AbortController().signal), new RegExp(`preparar o ${label}`));
    assert.equal(output().state, "canceled");
  });
}

// These are container/metadata tests using synthetic packet payloads. They do not
// substitute for decoding a real screen recording in a browser.
for (const codec of ["vp8", "vp9"]) {
  test(`real WebM muxer exports ${codec}/Opus after the original metadata packets leave the buffer`, { timeout: 5000 }, async () => {
    const meta = decoderMetadata(codec);
    const runtime = { media: clipMedia, videoCodec: codec, audioCodec: "opus", videoMeta: null, audioMeta: null,
      video: [], audio: [], order: 0, bufferedBytes: 0 };
    for (let timestamp = 0; timestamp <= 20; timestamp++) {
      appendClipPacket(runtime, "audio", new EncodedPacket(new Uint8Array([0xf8, 0xff, 0xfe]), "key", timestamp, 0.02), timestamp === 0 ? meta.audio : {});
      appendClipPacket(runtime, "video", new EncodedPacket(new Uint8Array([0x82, 0]), "key", timestamp, 1), timestamp === 0 ? meta.video : {});
    }
    const pruned = pruneRollingPackets(runtime.video, runtime.audio, 20, 5);
    assert.ok(pruned.video[0].packet.timestamp > 0);
    assert.ok(pruned.audio[0].packet.timestamp > 0);
    const selection = selectClipEntries(pruned.video, pruned.audio, 20, 5);
    assert.equal(selection.startTimestamp, 15);
    const blob = await muxClip(runtime, selection, new AbortController().signal);
    assert.match(blob.type, /^video\/webm/);
    const input = new Input({ source: new BufferSource(await blob.arrayBuffer()), formats: [WEBM] });
    try {
      const video = await input.getPrimaryVideoTrack();
      const audio = await input.getPrimaryAudioTrack();
      assert.ok(video);
      assert.ok(audio);
      assert.equal(video.codec, codec);
      assert.equal(audio.codec, "opus");
      const videoConfig = await video.getDecoderConfig();
      const audioConfig = await audio.getDecoderConfig();
      assert.equal(videoConfig.codedWidth, 1280);
      assert.equal(videoConfig.codedHeight, 720);
      assert.equal(audioConfig.sampleRate, 48000);
      assert.equal(audioConfig.numberOfChannels, 2);
      assert.deepEqual(new Uint8Array(audioConfig.description), meta.audio.decoderConfig.description);
      for (const [track, entries] of [[video, selection.video], [audio, selection.audio]]) {
        const packets = await Array.fromAsync(new EncodedPacketSink(track).packets());
        assert.equal(packets.length, entries.length);
        assert.deepEqual(packets.map((packet) => packet.timestamp), entries.map((entry) => entry.packet.timestamp - 15));
        assert.deepEqual(packets[0].data, entries[0].packet.data);
      }
    } finally {
      input.dispose();
    }
  });
}

for (const stage of ["start", "finalize"]) {
  test(`aborting releases a stalled ${stage} even when resource cancellation also stalls`, { timeout: 2000 }, async () => {
    const { runtime, selection, calls } = fixture(stage);
    const controller = new AbortController();
    const pending = muxClip(runtime, selection, controller.signal);
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(new Error("clip timeout"));
    await assert.rejects(pending, /clip timeout/);
    assert.ok(calls.includes("cancel"));
  });
}
