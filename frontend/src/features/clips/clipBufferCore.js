const KEYFRAME_MARGIN_SECONDS = 4;
export const MAX_CLIP_BUFFER_BYTES = 48 * 1024 * 1024;
export const MAX_CLIP_PACKETS = 12000;

export function clipPacketBytes(packet) {
  return Math.max(0, Number(packet.byteLength ?? packet.data?.byteLength) || 0)
    + Math.max(0, Number(packet.sideData?.alphaByteLength ?? packet.sideData?.alpha?.byteLength) || 0);
}

export function appendClipPacket(runtime, kind, packet, meta) {
  const bytes = clipPacketBytes(packet);
  if (runtime.bufferedBytes + bytes > MAX_CLIP_BUFFER_BYTES
      || runtime.video.length + runtime.audio.length >= MAX_CLIP_PACKETS) {
    throw new Error("Este clipe ficou longo demais para o dispositivo. Desative e ative novamente para tentar.");
  }
  // WebCodecs emits decoderConfig only when needed; later metadata may be {}.
  // Keep an owned snapshot with each packet so pruning or a newer config cannot
  // invalidate an export. Packets sharing a config share this small snapshot.
  const metaKey = `${kind}Meta`;
  if (meta?.decoderConfig) {
    runtime[metaKey] = { decoderConfig: structuredClone(meta.decoderConfig) };
  }
  runtime[kind].push({ packet: packet.clone(), meta: runtime[metaKey], order: runtime.order++, bytes });
  runtime.bufferedBytes += bytes;
}

export function bufferedPacketBytes(video, audio) {
  return video.concat(audio).reduce((sum, entry) => sum + (entry.bytes ?? clipPacketBytes(entry.packet)), 0);
}

export function pruneRollingPackets(videoEntries, audioEntries, latestTimestamp, maxSeconds) {
  if (!videoEntries.length) return { video: [], audio: [] };
  const cutoff = latestTimestamp - maxSeconds - KEYFRAME_MARGIN_SECONDS;
  let keepFrom = 0;

  for (let index = 0; index < videoEntries.length; index += 1) {
    const entry = videoEntries[index];
    if (entry.packet.type === "key" && entry.packet.timestamp <= cutoff) keepFrom = index;
    if (entry.packet.timestamp > cutoff) break;
  }

  const video = keepFrom > 0 ? videoEntries.slice(keepFrom) : videoEntries;
  const earliest = video[0]?.packet.timestamp ?? cutoff;
  const audio = audioEntries.filter((entry) => entry.packet.timestamp + entry.packet.duration >= earliest - 0.1);
  return { video, audio };
}

export function getBufferedSeconds(videoEntries, latestTimestamp, maxSeconds) {
  const firstKey = videoEntries.find((entry) => entry.packet.type === "key");
  if (!firstKey || !Number.isFinite(latestTimestamp)) return 0;
  return Math.max(0, Math.min(maxSeconds, latestTimestamp - firstKey.packet.timestamp));
}

export function selectClipEntries(videoEntries, audioEntries, latestTimestamp, seconds) {
  if (!videoEntries.length || !Number.isFinite(latestTimestamp)) return null;
  const requestedSeconds = Math.max(5, Number(seconds) || 0);
  const requestedStart = latestTimestamp - requestedSeconds;
  let startIndex = -1;

  for (let index = 0; index < videoEntries.length; index += 1) {
    const entry = videoEntries[index];
    if (entry.packet.type === "key" && entry.packet.timestamp <= requestedStart) startIndex = index;
    if (entry.packet.timestamp > requestedStart) break;
  }
  if (startIndex < 0) startIndex = videoEntries.findIndex((entry) => entry.packet.type === "key");
  if (startIndex < 0) return null;

  const startTimestamp = videoEntries[startIndex].packet.timestamp;
  const video = videoEntries.slice(startIndex).filter((entry) => entry.packet.timestamp <= latestTimestamp + 0.25);
  if (!video.length || latestTimestamp - startTimestamp < Math.min(5, requestedSeconds)) return null;

  const audio = audioEntries.filter((entry) => (
    entry.packet.timestamp + entry.packet.duration >= startTimestamp
    && entry.packet.timestamp <= latestTimestamp + 0.25
  ));
  return { startTimestamp, endTimestamp: latestTimestamp, video, audio };
}
