import { useRef, useReducer, useState, useCallback, useEffect } from "react";
import { Room, RoomEvent } from "livekit-client";

// Keeps the LiveKit room with granular version counters so unrelated events do
// not force every collector to rebuild.
export function useRoom() {
  const roomRef = useRef(null);
  const [connState, setConnState] = useState("idle");
  const [trackVer, incTracks] = useReducer((x) => x + 1, 0);
  const [partVer, incParts] = useReducer((x) => x + 1, 0);
  const [metaVer, incMeta] = useReducer((x) => x + 1, 0);
  const [qualityVer, incQuality] = useReducer((x) => x + 1, 0);
  const [permissionVer, incPermission] = useReducer((x) => x + 1, 0);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const connect = useCallback(async (url, token) => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        simulcast: true,
        stopMicTrackOnMute: true
      },
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720, frameRate: 30 }
      }
    });
    roomRef.current = room;

    const onTrack = () => incTracks();
    const onPart = () => incParts();
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
      .on(RoomEvent.ParticipantNameChanged, onMeta)
      .on(RoomEvent.ConnectionQualityChanged, () => incQuality())
      .on(RoomEvent.ParticipantPermissionsChanged, () => incPermission())
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Reconnecting, () => setConnState("reconnecting"))
      .on(RoomEvent.Reconnected, () => {
        setConnState("connected");
        incTracks();
        incParts();
        incMeta();
        incQuality();
        incPermission();
        setAudioBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Disconnected, () => setConnState("disconnected"));

    setConnState("connecting");
    await room.connect(url, token);
    setConnState("connected");
    setAudioBlocked(!room.canPlaybackAudio);
    incTracks();
    incParts();
    incMeta();
    incQuality();
    incPermission();
    return room;
  }, []);

  const enableAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
    } catch (e) {}
  }, []);

  const disconnect = useCallback(() => {
    if (roomRef.current) roomRef.current.disconnect();
  }, []);

  useEffect(() => () => { if (roomRef.current) roomRef.current.disconnect(); }, []);

  return {
    roomRef, connState, connect, disconnect,
    trackVer, partVer, metaVer, qualityVer, permissionVer,
    audioBlocked, enableAudio
  };
}
