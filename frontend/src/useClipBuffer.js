import { useCallback, useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";

function chooseMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4"
  ];
  return candidates.find((type) => {
    try { return MediaRecorder.isTypeSupported(type); } catch (e) { return false; }
  }) || "";
}

function findAudioTrack(room, tile) {
  if (!room || !tile) return null;
  const participant = tile.isLocal
    ? room.localParticipant
    : room.remoteParticipants.get(tile.identity);
  if (!participant) return null;
  let fallback = null;
  participant.trackPublications.forEach((publication) => {
    if (!publication.track || publication.track.kind !== "audio") return;
    if (publication.source !== Track.Source.ScreenShareAudio) return;
    if (!fallback) fallback = publication.track;
    if (tile.pubName && publication.trackName === tile.pubName) fallback = publication.track;
  });
  return fallback;
}

export function useClipBuffer(room, tile, maxSeconds = 45) {
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const firstChunkRef = useRef(null);
  const mimeRef = useRef("");
  const [readySeconds, setReadySeconds] = useState(0);
  const [supported] = useState(() => typeof MediaRecorder !== "undefined" && typeof MediaStream !== "undefined");

  useEffect(() => {
    const previous = recorderRef.current;
    recorderRef.current = null;
    chunksRef.current = [];
    firstChunkRef.current = null;
    setReadySeconds(0);
    if (previous && previous.state !== "inactive") {
      try { previous.stop(); } catch (e) {}
    }

    if (!supported || !room || !tile || !tile.isScreen || !tile.track?.mediaStreamTrack) return;
    const videoTrack = tile.track.mediaStreamTrack;
    if (videoTrack.readyState !== "live") return;

    const stream = new MediaStream();
    stream.addTrack(videoTrack);
    const audio = findAudioTrack(room, tile);
    if (audio?.mediaStreamTrack?.readyState === "live") stream.addTrack(audio.mediaStreamTrack);

    const mimeType = chooseMimeType();
    let recorder;
    try { recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
    catch (e) { return; }

    mimeRef.current = recorder.mimeType || mimeType || "video/webm";
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (!event.data || !event.data.size) return;
      const entry = { blob: event.data, at: Date.now() };
      if (!firstChunkRef.current) firstChunkRef.current = entry;
      chunksRef.current.push(entry);
      const cutoff = Date.now() - maxSeconds * 1000;
      chunksRef.current = chunksRef.current.filter((item, index) => index === 0 || item.at >= cutoff);
      const firstRecent = chunksRef.current.length > 1 ? chunksRef.current[1].at : chunksRef.current[0].at;
      setReadySeconds(Math.max(1, Math.min(maxSeconds, Math.round((Date.now() - firstRecent) / 1000) + 1)));
    };
    recorder.onerror = () => {};
    try { recorder.start(1000); } catch (e) { recorderRef.current = null; }

    return () => {
      if (recorderRef.current === recorder) recorderRef.current = null;
      if (recorder.state !== "inactive") { try { recorder.stop(); } catch (e) {} }
    };
  }, [room, tile?.key, tile?.track, tile?.pubName, supported, maxSeconds]);

  const saveClip = useCallback((seconds = 30) => {
    if (!firstChunkRef.current || chunksRef.current.length < 2) return false;
    const cutoff = Date.now() - Math.max(5, Math.min(maxSeconds, seconds)) * 1000;
    const recent = chunksRef.current.filter((entry) => entry.at >= cutoff);
    const parts = [];
    if (firstChunkRef.current && !recent.includes(firstChunkRef.current)) parts.push(firstChunkRef.current.blob);
    parts.push(...recent.map((entry) => entry.blob));
    if (!parts.length) return false;
    const type = mimeRef.current || "video/webm";
    const blob = new Blob(parts, { type });
    const url = URL.createObjectURL(blob);
    const extension = type.includes("mp4") ? "mp4" : "webm";
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mazestream-clip-" + new Date().toISOString().replace(/[:.]/g, "-") + "." + extension;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  }, [maxSeconds]);

  return {
    supported,
    buffering: !!recorderRef.current,
    readySeconds,
    saveClip
  };
}
