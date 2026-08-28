import { useRef } from "react";
import { Track } from "livekit-client";
import { readState } from "./state.js";

export function volumeKey(sid, pubName) { return (sid || "") + "::" + (pubName || ""); }

export function getParticipantName(participant) {
  return (participant && (participant.name || participant.identity)) || "";
}

export function getPersonSettings(settings, key, legacyKey) {
  const current = (settings && settings[key]) || (legacyKey && settings && settings[legacyKey]) || {};
  return {
    muted: !!current.muted,
    cameraHidden: !!current.cameraHidden,
    interactionsHidden: !!current.interactionsHidden,
    volume: typeof current.volume === "number" ? Math.max(0, Math.min(100, current.volume)) : 100
  };
}

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

function peopleSettingsKey(settings) {
  try { return JSON.stringify(settings || {}); }
  catch (e) { return "{}"; }
}

export function useCollectTiles(room, trackVersion, metaVersion, peopleSettings) {
  const settingsKey = peopleSettingsKey(peopleSettings);
  return useStableArray("tiles:" + tilesKey(room) + ":" + trackVersion + ":" + (metaVersion || 0) + ":" + settingsKey, () => {
    const tiles = [];
    if (!room) return tiles;
    const lp = room.localParticipant;
    const myState = readState(lp);
    lp.trackPublications.forEach((pub) => {
      if (pub.track && pub.track.kind === "video") {
        const isScreen = pub.source === Track.Source.ScreenShare;
        if (!isScreen && (pub.isMuted || pub.track.mediaStreamTrack?.readyState !== "live")) return;
        tiles.push({
          key: pub.trackSid || ("local-" + pub.source),
          track: pub.track,
          name: isScreen ? "Sua transmissão" : "Sua câmera",
          isLocal: true, isScreen, source: pub.source, pubName: pub.trackName,
          sid: lp.sid, identity: lp.identity, quality: lp.connectionQuality,
          state: isScreen ? myState : null
        });
      }
    });
    room.remoteParticipants.forEach((p) => {
      const st = readState(p);
      const displayName = getParticipantName(p);
      const personSettings = getPersonSettings(peopleSettings, p.identity, displayName);
      p.trackPublications.forEach((pub) => {
        if (pub.isSubscribed && pub.track && pub.track.kind === "video") {
          const isScreen = pub.source === Track.Source.ScreenShare;
          if (!isScreen && (pub.isMuted || pub.track.mediaStreamTrack?.readyState !== "live")) return;
          if (!isScreen && personSettings.cameraHidden) return;
          tiles.push({
            key: pub.trackSid,
            track: pub.track,
            name: isScreen && st.titulo ? st.titulo : (isScreen ? displayName + " transmitindo" : displayName),
            author: displayName,
            isLocal: false, isScreen, source: pub.source, pubName: pub.trackName,
            sid: p.sid, identity: p.identity, quality: p.connectionQuality,
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
          audios.push({
            key: pub.trackSid,
            track: pub.track,
            sid: p.sid,
            pubName: pub.trackName,
            owner: getParticipantName(p), ownerIdentity: p.identity
          });
        }
      });
    });
    return audios;
  });
}

export function useCollectPeople(room, participantVersion, metaVersion, trackVersion, qualityVersion, permissionVersion) {
  return useStableArray(
    "people:" + peopleKey(room) + ":" + participantVersion + ":" + (metaVersion || 0) + ":" + (trackVersion || 0) + ":" + (qualityVersion || 0) + ":" + (permissionVersion || 0),
    () => {
      if (!room) return [];
      const all = [room.localParticipant].concat(Array.from(room.remoteParticipants.values()));
      return all.map((p, index) => {
        const isLocal = p === room.localParticipant;
        let hasCamera = false, hasMic = false, hasScreen = false;
        p.trackPublications.forEach((pub) => {
          if (pub.source === Track.Source.Camera) hasCamera = true;
          else if (pub.source === Track.Source.Microphone) hasMic = true;
          else if (pub.source === Track.Source.ScreenShare) hasScreen = true;
        });
        const rawName = getParticipantName(p);
        return {
          key: p.sid || ("p" + index),
          name: isLocal ? "você" : rawName,
          rawName,
          identity: p.identity,
          isLocal,
          hasCamera,
          hasMic,
          hasScreen,
          canPublish: p.permissions ? p.permissions.canPublish !== false : true,
          canPublishData: p.permissions ? p.permissions.canPublishData !== false : true,
          quality: p.connectionQuality || "unknown"
        };
      });
    }
  );
}
