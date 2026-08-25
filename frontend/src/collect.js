import { Track } from "livekit-client";
import { lerEstado } from "./estado.js";

export function volumeKey(sid, pubName) { return sid + "::" + pubName; }

export function coletarTiles(room) {
  const tiles = [];
  if (!room) return tiles;
  const lp = room.localParticipant;
  const meuEstado = lerEstado(lp);
  lp.trackPublications.forEach((pub) => {
    if (pub.track && pub.track.kind === "video") {
      const ehTela = pub.source === Track.Source.ScreenShare;
      tiles.push({
        key: pub.trackSid || ("local-" + pub.source),
        track: pub.track,
        nome: ehTela ? "Sua transmissão" : "Sua câmera",
        ehLocal: true, ehTela, source: pub.source, pubName: pub.trackName,
        sid: lp.sid, quality: lp.connectionQuality,
        estado: ehTela ? meuEstado : null
      });
    }
  });
  room.remoteParticipants.forEach((p) => {
    const est = lerEstado(p);
    p.trackPublications.forEach((pub) => {
      if (pub.isSubscribed && pub.track && pub.track.kind === "video") {
        const ehTela = pub.source === Track.Source.ScreenShare;
        const nome = p.name || p.identity;
        tiles.push({
          key: pub.trackSid,
          track: pub.track,
          nome: ehTela && est.titulo ? est.titulo : (ehTela ? nome + " transmitindo" : nome),
          autor: nome,
          ehLocal: false, ehTela, source: pub.source, pubName: pub.trackName,
          sid: p.sid, quality: p.connectionQuality,
          estado: ehTela ? est : null
        });
      }
    });
  });
  return tiles;
}

export function coletarAudios(room) {
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
}

export function coletarPessoas(room) {
  if (!room) return [];
  const todos = [room.localParticipant].concat(Array.from(room.remoteParticipants.values()));
  return todos.map((p, i) => ({
    key: p.sid || ("p" + i),
    nome: p === room.localParticipant ? "você" : (p.name || p.identity),
    quality: p.connectionQuality || "unknown"
  }));
}
