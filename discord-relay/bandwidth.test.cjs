const test = require("node:test");
const assert = require("node:assert/strict");
const {
  estimateTrackMbps, packetCounterRates, parsePacketByteCounters,
  summarizeRoom, summarizeRooms
} = require("./bandwidth.cjs");

test("uses the highest simulcast layer instead of summing every layer", () => {
  const track = { type: "VIDEO", source: "SCREEN_SHARE", layers: [
    { bitrate: 300000 }, { bitrate: 1500000 }, { bitrate: 5000000 }
  ] };
  assert.equal(estimateTrackMbps(track), 5);
});

test("counts publications and estimates egress per eligible viewer", () => {
  const participants = [
    { identity: "host", tracks: [
      { type: "VIDEO", source: "SCREEN_SHARE", layers: [{ bitrate: 5000000 }] },
      { type: "AUDIO", source: "SCREEN_SHARE_AUDIO" }
    ] },
    { identity: "viewer-1", tracks: [] },
    { identity: "viewer-2", permission: { can_subscribe: false }, tracks: [] }
  ];
  const result = summarizeRoom({ name: "geral" }, participants);
  assert.equal(result.publications, 2);
  assert.equal(result.screens, 1);
  assert.equal(result.audios, 1);
  assert.equal(result.ingressMbps, 5.128);
  assert.equal(result.egressMbps, 5.128);
});

test("aggregates rooms", () => {
  const rooms = [{ name: "a" }, { name: "b" }];
  const participants = new Map([
    ["a", [{ identity: "p1", tracks: [{ type: "VIDEO", source: "CAMERA" }] }, { identity: "p2", tracks: [] }]],
    ["b", [{ identity: "p3", tracks: [] }]]
  ]);
  const result = summarizeRooms(rooms, participants);
  assert.equal(result.participants, 3);
  assert.equal(result.cameras, 1);
  assert.equal(result.egressMbps, 2.5);
});

test("parses real LiveKit packet byte counters", () => {
  const metrics = [
    'livekit_packet_bytes_total{country="",direction="incoming",transmission="initial"} 1000',
    'livekit_packet_bytes_total{country="",direction="outgoing",transmission="initial"} 5000',
    'livekit_packet_bytes_total{country="",direction="outgoing",transmission="retransmit"} 200'
  ].join("\n");
  assert.deepEqual(parsePacketByteCounters(metrics), { incoming: 1000, outgoing: 5200 });
  assert.equal(parsePacketByteCounters("# no packet samples yet"), null);
});

test("calculates Mbps from counter deltas", () => {
  const rate = packetCounterRates(
    { at: 1000, incoming: 1000, outgoing: 2000 },
    { at: 2000, incoming: 126000, outgoing: 252000 }
  );
  assert.equal(rate.ingressMbps, 1);
  assert.equal(rate.egressMbps, 2);
});
