function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function field(object, snake, camel, fallback = undefined) {
  if (!object) return fallback;
  if (object[snake] !== undefined) return object[snake];
  if (object[camel] !== undefined) return object[camel];
  return fallback;
}

function sourceName(track) {
  const source = track?.source;
  if (typeof source === "string") return source.toUpperCase();
  return ({ 1: "CAMERA", 2: "MICROPHONE", 3: "SCREEN_SHARE", 4: "SCREEN_SHARE_AUDIO" })[source] || "UNKNOWN";
}

function isVideoTrack(track) {
  const type = track?.type;
  if (typeof type === "string") return type.toUpperCase() === "VIDEO";
  if (type === 1) return true;
  const source = sourceName(track);
  return source === "CAMERA" || source === "SCREEN_SHARE";
}

function estimateTrackMbps(track, defaults = {}) {
  if (!track || track.muted) return 0;
  const layers = Array.isArray(track.layers) ? track.layers : [];
  const layerMbps = layers
    .map((layer) => finiteNumber(layer.bitrate) / 1_000_000)
    .filter((value) => value > 0);
  if (layerMbps.length) return Math.max(...layerMbps);

  const source = sourceName(track);
  if (source === "SCREEN_SHARE") return finiteNumber(defaults.screenShareMbps, 5);
  if (source === "CAMERA") return finiteNumber(defaults.cameraMbps, 2.5);
  if (!isVideoTrack(track)) return finiteNumber(defaults.audioMbps, 0.128);

  const width = finiteNumber(track.width);
  const height = finiteNumber(track.height);
  if (width >= 1600 || height >= 900) return finiteNumber(defaults.screenShareMbps, 5);
  if (width >= 1000 || height >= 600) return 2.5;
  return 1;
}

function canSubscribe(participant) {
  const permission = participant?.permission || participant?.permissions;
  return field(permission, "can_subscribe", "canSubscribe", true) !== false;
}

function summarizeRoom(room, participants, defaults = {}) {
  const people = Array.isArray(participants) ? participants : [];
  const summary = {
    name: room?.name || "sala",
    participants: people.length,
    publications: 0,
    screens: 0,
    cameras: 0,
    audios: 0,
    ingressMbps: 0,
    egressMbps: 0
  };

  for (const participant of people) {
    const tracks = Array.isArray(participant.tracks) ? participant.tracks : [];
    const identity = participant.identity;
    const viewers = people.filter((candidate) => candidate.identity !== identity && canSubscribe(candidate)).length;
    for (const track of tracks) {
      const mbps = estimateTrackMbps(track, defaults);
      if (mbps <= 0) continue;
      const source = sourceName(track);
      summary.publications += 1;
      if (source === "SCREEN_SHARE") summary.screens += 1;
      else if (source === "CAMERA") summary.cameras += 1;
      else summary.audios += 1;
      summary.ingressMbps += mbps;
      summary.egressMbps += mbps * viewers;
    }
  }

  summary.ingressMbps = Number(summary.ingressMbps.toFixed(3));
  summary.egressMbps = Number(summary.egressMbps.toFixed(3));
  return summary;
}

function summarizeRooms(rooms, participantsByRoom, defaults = {}) {
  const perRoom = (Array.isArray(rooms) ? rooms : []).map((room) => (
    summarizeRoom(room, participantsByRoom.get(room.name) || [], defaults)
  ));
  const total = perRoom.reduce((sum, room) => ({
    participants: sum.participants + room.participants,
    publications: sum.publications + room.publications,
    screens: sum.screens + room.screens,
    cameras: sum.cameras + room.cameras,
    audios: sum.audios + room.audios,
    ingressMbps: sum.ingressMbps + room.ingressMbps,
    egressMbps: sum.egressMbps + room.egressMbps
  }), { participants: 0, publications: 0, screens: 0, cameras: 0, audios: 0, ingressMbps: 0, egressMbps: 0 });
  total.ingressMbps = Number(total.ingressMbps.toFixed(3));
  total.egressMbps = Number(total.egressMbps.toFixed(3));
  return { rooms: perRoom, ...total };
}

function formatBytes(bytes) {
  const value = Math.max(0, finiteNumber(bytes));
  if (value >= 1024 ** 3) return (value / 1024 ** 3).toFixed(2) + " GB";
  if (value >= 1024 ** 2) return (value / 1024 ** 2).toFixed(1) + " MB";
  if (value >= 1024) return (value / 1024).toFixed(1) + " KB";
  return Math.round(value) + " B";
}

function parsePacketByteCounters(metricsText) {
  const totals = { incoming: 0, outgoing: 0 };
  let matched = 0;
  const lines = String(metricsText || "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^livekit_packet_bytes(?:_total)?\{([^}]*)\}\s+([0-9.eE+-]+)$/);
    if (!match) continue;
    const direction = /direction="(incoming|outgoing)"/.exec(match[1])?.[1];
    const value = Number(match[2]);
    if (direction && Number.isFinite(value) && value >= 0) {
      totals[direction] += value;
      matched += 1;
    }
  }
  return matched ? totals : null;
}

function packetCounterRates(previous, current) {
  if (!previous || !current) return null;
  const seconds = (current.at - previous.at) / 1000;
  if (!(seconds > 0)) return null;
  const incomingBytes = current.incoming - previous.incoming;
  const outgoingBytes = current.outgoing - previous.outgoing;
  if (incomingBytes < 0 || outgoingBytes < 0) return null;
  return {
    ingressMbps: incomingBytes * 8 / seconds / 1_000_000,
    egressMbps: outgoingBytes * 8 / seconds / 1_000_000,
    incomingBytes,
    outgoingBytes
  };
}

module.exports = {
  estimateTrackMbps,
  formatBytes,
  packetCounterRates,
  parsePacketByteCounters,
  sourceName,
  summarizeRoom,
  summarizeRooms
};
