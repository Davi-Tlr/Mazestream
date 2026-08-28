import test from "node:test";
import assert from "node:assert/strict";
import { RemoteTrackPublication, Track, VideoQuality } from "livekit-client";
import { applyReceiveQuality } from "../features/room/receiveQuality.js";

function fixture() {
  const publication = new RemoteTrackPublication(Track.Kind.Video, {
    sid: "TR_quality_test", name: "screen", type: 1, width: 1920, height: 1080, layers: []
  }, true);
  const room = { remoteParticipants: new Map([["peer", {
    videoTrackPublications: new Map([[publication.trackSid, publication]])
  }]]) };
  return { room, publication };
}

test("Auto clears the previous lower ceiling using the real SDK publication", () => {
  const { room, publication } = fixture();
  applyReceiveQuality(room, "low");
  assert.equal(publication.videoQuality, VideoQuality.LOW);
  applyReceiveQuality(room, "auto");
  assert.equal(publication.videoQuality, VideoQuality.HIGH);
  applyReceiveQuality(room, "medium");
  assert.equal(publication.videoQuality, VideoQuality.MEDIUM);
});

test("quality changes do not enable a disabled video or modify local publications", () => {
  const { room, publication } = fixture();
  publication.setEnabled(false);
  room.localParticipant = { videoTrackPublications: new Map([["local", {
    setVideoQuality() { assert.fail("local track must not be modified"); }
  }]]) };
  applyReceiveQuality(room, "auto");
  assert.equal(publication.isEnabled, false);
  applyReceiveQuality(room, "unknown");
  applyReceiveQuality(null, "auto");
});
