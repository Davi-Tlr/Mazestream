import test from "node:test";
import assert from "node:assert/strict";
import { muxClip } from "./clipMux.js";

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
  const runtime = { videoCodec: "vp9", audioCodec: "opus", videoMeta: { key: "video" }, audioMeta: { key: "audio" },
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
