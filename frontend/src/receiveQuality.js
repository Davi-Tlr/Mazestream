import { VideoQuality } from "livekit-client";

const QUALITY_CEILINGS = {
  auto: VideoQuality.HIGH,
  high: VideoQuality.HIGH,
  medium: VideoQuality.MEDIUM,
  low: VideoQuality.LOW
};

export function applyReceiveQuality(room, quality) {
  if (!room) return;
  const ceiling = QUALITY_CEILINGS[quality];
  if (ceiling === undefined) return;
  // HIGH removes our lower manual ceiling. It does not disable adaptiveStream:
  // LiveKit still chooses smaller dimensions for small/hidden video elements.
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.videoTrackPublications.values()) {
      publication.setVideoQuality?.(ceiling);
    }
  }
}
