export function chooseScreenAudioPublication(publications, pubName, screenShareAudioSource) {
  const candidates = Array.from(publications || []).filter((publication) => (
    publication?.track
    && publication.track.kind === "audio"
    && publication.source === screenShareAudioSource
  ));
  const exact = candidates.find((publication) => publication.trackName === pubName);
  if (exact) return exact;
  return candidates.length === 1 ? candidates[0] : null;
}
