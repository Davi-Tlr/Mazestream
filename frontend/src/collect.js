import { useRef } from "react";
import { Track } from "livekit-client";
import { readState } from "./state.js";

export function volumeKey(sid, pubName) { return sid + "::" + pubName; }

function useStableArray(key, compute) {
  const ref = useRef({ key: null, value: [] });
  if (ref.current.key !== key) {
    ref.current = { key, value: compute() };
  }
  return ref.current.value;
}

function tilesKey(room) {
  if (!room) return "empty";
  const parts = [];
  room.localParticipant.trackPublications.forEach((pub) => {
    if (pub.track && pub.track.kind === "video") parts.push("L" + pub.trackSid);
  });
  room.remoteParticipants.forEach((p) => {
    p.trackPublications.forEach((pub) => {
      if (pub.isSubscribed && pub.track && pub.track.kind === "video") parts.push("R" + pub.trackSid);
    });
  });
  return parts.join("|") || "none";
}

function audiosKey(room) {
  if (!room) return "empty";
  const parts = [];
  room.remoteParticipants.forEach((p) => {
    p.trackPublications.forEach((pub) => {
      if (pub.isSubscribed && pub.track && pub.track.kind === "audio") parts.push("A" + pub.trackSid);
    });
  });
  return parts.join("|") || "none";
}

function peopleKey(room) {
  if (!room) return "empty";
  const parts = [room.localParticipant.sid || ""];
  room.remoteParticipants.forEach((p) => parts.push(p.sid || ""));
  return parts.join("|") || "none";
}

export function useCollectTiles(room, trackVersion) {
  return useStableArray("tiles:" + tilesKey(room) + ":" + trackVersion, () => {
    const tiles = [];
    if (!room) return tiles;
    const lp = room.localParticipant;
    const myState = readState(lp);
    lp.trackPublications.forEach((pub) => {
      if (pub.track && pub.track.kind === "video") {
        const isScreen = pub.source === Track.Source.ScreenShare;
        tiles.push({
          key: pub.trackSid || ("local-" + pub.source),
          track: pub.track,
          name: isScreen ? "Sua transmissao" : "Sua camera",
          isLocal: true, isScreen, source: pub.source, pubName: pub.trackName,
          sid: lp.sid, quality: lp.connectionQuality,
          state: isScreen ? myState : null
        });
      }
    });
    room.remoteParticipants.forEach((p) => {
      const st = readState(p);
      p.trackPublications.forEach((pub) => {
        if (pub.isSubscribed && pub.track && pub.track.kind === "video") {
          const isScreen = pub.source === Track.Source.ScreenShare;
          const displayName = p.name || p.identity;
          tiles.push({
            key: pub.trackSid,
            track: pub.track,
            name: isScreen && st.titulo ? st.titulo : (isScreen ? displayName + " transmitindo" : displayName),
            author: displayName,
            isLocal: false, isScreen, source: pub.source, pubName: pub.trackName,
            sid: p.sid, quality: p.connectionQuality,
            state: isScreen ? st : null
          });
        }
      });
    });
    return tiles;
  });
}

export function useCollectAudios(room, trackVersion) {
  return useStableArray("audios:" + audiosKey(room) + ":" + trackVersion, () => {
    const audios = [];
    if (!room) return audios;
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        if (pub.isSubscribed && pub.track && pub.track.kind === "audio") {
          audios.push({ key: pub.trackSid, track: pub.track, sid: p.sid, pubName: pub.trackName });
        }
      });
    });
    return audios;
  });
}

export function useCollectPeople(room, participantVersion) {
  return useStableArray("people:" + peopleKey(room) + ":" + participantVersion, () => {
    if (!room) return [];
    const all = [room.localParticipant].concat(Array.from(room.remoteParticipants.values()));
    return all.map((p) => ({
      key: p.sid,
      name: p === room.localParticipant ? "voce" : (p.name || p.identity),
      quality: p.connectionQuality || "unknown"
    }));
  });
}
