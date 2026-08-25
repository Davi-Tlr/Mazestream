import { useRef, useReducer, useState, useCallback, useEffect } from "react";
import { Room, RoomEvent } from "livekit-client";

// Mantem a Room do LiveKit com estado granular.
// Em vez de um "tick" unico que re-renderiza tudo, usa contadores
// separados pra tracks, participantes e metadata. Assim so o que
// mudou triggera re-render nos componentes que dependem daquilo.
export function useRoom() {
  const roomRef = useRef(null);
  const [connState, setConnState] = useState("idle");
  const [trackVer, incTracks] = useReducer((x) => x + 1, 0);
  const [partVer, incParts] = useReducer((x) => x + 1, 0);
  const [metaVer, incMeta] = useReducer((x) => x + 1, 0);

  const connect = useCallback(async (url, token) => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    // Track events: subscribe, unsubscribe, publish, unpublish, mute, unmute
    const onTrack = () => incTracks();
    // Participant events: connect, disconnect
    const onPart = () => incParts();
    // Metadata events: titulo, estado, etc.
    const onMeta = () => incMeta();

    room
      .on(RoomEvent.TrackSubscribed, onTrack)
      .on(RoomEvent.TrackUnsubscribed, onTrack)
      .on(RoomEvent.LocalTrackPublished, onTrack)
      .on(RoomEvent.LocalTrackUnpublished, onTrack)
      .on(RoomEvent.TrackMuted, onTrack)
      .on(RoomEvent.TrackUnmuted, onTrack)
      .on(RoomEvent.ParticipantConnected, onPart)
      .on(RoomEvent.ParticipantDisconnected, onPart)
      .on(RoomEvent.ParticipantMetadataChanged, onMeta)
      // ConnectionQualityChanged NAO dispara bump - fired very often
      // and only affects the quality badge, which updates on next track/part event anyway.
      .on(RoomEvent.Reconnecting, () => setConnState("reconnecting"))
      .on(RoomEvent.Reconnected, () => setConnState("connected"))
      .on(RoomEvent.Disconnected, () => setConnState("disconnected"));

    setConnState("connecting");
    await room.connect(url, token);
    setConnState("connected");
    incTracks();
    incParts();
    incMeta();
    return room;
  }, []);

  const disconnect = useCallback(() => {
    if (roomRef.current) roomRef.current.disconnect();
  }, []);

  useEffect(() => () => { if (roomRef.current) roomRef.current.disconnect(); }, []);

  return {
    roomRef, connState, connect, disconnect,
    // Version counters pra consumers granulares
    trackVer, partVer, metaVer
  };
}
