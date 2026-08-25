import { useRef, useReducer, useState, useCallback, useEffect } from "react";
import { Room, RoomEvent } from "livekit-client";

// Mantem a Room do LiveKit e forca re-render quando algo muda.
export function useRoom() {
  const roomRef = useRef(null);
  const [tick, bump] = useReducer((x) => x + 1, 0);
  const [connState, setConnState] = useState("idle");

  const connect = useCallback(async (url, token) => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const onChange = () => bump();
    room
      .on(RoomEvent.TrackSubscribed, onChange)
      .on(RoomEvent.TrackUnsubscribed, onChange)
      .on(RoomEvent.LocalTrackPublished, onChange)
      .on(RoomEvent.LocalTrackUnpublished, onChange)
      .on(RoomEvent.TrackMuted, onChange)
      .on(RoomEvent.TrackUnmuted, onChange)
      .on(RoomEvent.ParticipantConnected, onChange)
      .on(RoomEvent.ParticipantDisconnected, onChange)
      .on(RoomEvent.ParticipantMetadataChanged, onChange)
      .on(RoomEvent.ConnectionQualityChanged, onChange)
      .on(RoomEvent.Reconnecting, () => setConnState("reconnecting"))
      .on(RoomEvent.Reconnected, () => setConnState("connected"))
      .on(RoomEvent.Disconnected, () => setConnState("disconnected"));

    setConnState("connecting");
    await room.connect(url, token);
    setConnState("connected");
    bump();
    return room;
  }, []);

  const disconnect = useCallback(() => {
    if (roomRef.current) roomRef.current.disconnect();
  }, []);

  useEffect(() => () => { if (roomRef.current) roomRef.current.disconnect(); }, []);

  return { roomRef, tick, connState, connect, disconnect, bump };
}
