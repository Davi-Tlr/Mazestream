import { useRef, useReducer, useState, useCallback, useEffect } from "react";
import { Room, RoomEvent, ScreenSharePresets, VideoPresets } from "livekit-client";

const CONNECT_TIMEOUT_MS = 20000;

// Keeps the LiveKit room with granular version counters so unrelated events do
// not force every collector to rebuild.
export function useRoom() {
  const roomRef = useRef(null);
  const connectPromiseRef = useRef(null);
  const [connState, setConnState] = useState("idle");
  const [trackVer, incTracks] = useReducer((x) => x + 1, 0);
  const [partVer, incParts] = useReducer((x) => x + 1, 0);
  const [metaVer, incMeta] = useReducer((x) => x + 1, 0);
  const [qualityVer, incQuality] = useReducer((x) => x + 1, 0);
  const [permissionVer, incPermission] = useReducer((x) => x + 1, 0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [lastError, setLastError] = useState(null);

  const connect = useCallback(async (url, token) => {
    if (connectPromiseRef.current) return connectPromiseRef.current;

    const operation = (async () => {
      const previous = roomRef.current;
      if (previous) {
        roomRef.current = null;
        try { await previous.disconnect(); } catch (e) {}
      }

      const room = new Room({
      adaptiveStream: {
        pauseVideoInBackground: true,
        pixelDensity: 1
      },
      dynacast: true,
      publishDefaults: {
        simulcast: true,
        stopMicTrackOnMute: true,
        red: true,
        screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
        screenShareSimulcastLayers: [ScreenSharePresets.h360fps15, ScreenSharePresets.h720fps30],
        videoEncoding: VideoPresets.h1080.encoding
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h1080.resolution,
        frameRate: 30
      },
      audioCaptureDefaults: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
      });
      roomRef.current = room;

      const isCurrent = () => roomRef.current === room;
      const onTrack = () => { if (isCurrent()) incTracks(); };
      const onPart = () => { if (isCurrent()) incParts(); };
      const onMeta = () => { if (isCurrent()) incMeta(); };
      const reportError = (message) => {
        if (isCurrent()) setLastError({ id: Date.now(), message });
      };

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
      .on(RoomEvent.ConnectionQualityChanged, () => { if (isCurrent()) incQuality(); })
      .on(RoomEvent.ParticipantPermissionsChanged, () => { if (isCurrent()) incPermission(); })
      .on(RoomEvent.TrackSubscriptionFailed, () => reportError("Não consegui receber uma parte da transmissão."))
      .on(RoomEvent.MediaDevicesError, (error) => reportError(error?.message || "O navegador perdeu acesso ao microfone ou à câmera."))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (isCurrent()) setAudioBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Reconnecting, () => { if (isCurrent()) setConnState("reconnecting"); })
      .on(RoomEvent.Reconnected, () => {
        if (!isCurrent()) return;
        setConnState("connected");
        incTracks();
        incParts();
        incMeta();
        incQuality();
        incPermission();
        setAudioBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Disconnected, (reason) => {
        if (!isCurrent()) return;
        // A user-initiated disconnect clears roomRef before calling LiveKit, so
        // only an event that still owns the ref is an unexpected drop.
        roomRef.current = null;
        setConnState("disconnected");
        const detail = reason ? String(reason).replace(/^disconnect(ed)?[\s:_-]*/i, "") : "";
        setLastError({
          id: Date.now(),
          message: detail
            ? "A conexão com o LiveKit foi encerrada (" + detail + "). Entre novamente na sala."
            : "A conexão com o LiveKit foi encerrada. Entre novamente na sala."
        });
      });

      setConnState("connecting");
      setLastError(null);
      try {
        let connectTimer;
        try {
          await Promise.race([
            room.connect(url, token),
            new Promise((_, reject) => {
              connectTimer = window.setTimeout(() => reject(new Error(
                "A conexão com o LiveKit demorou mais de 20 segundos. Confira a rede e tente novamente."
              )), CONNECT_TIMEOUT_MS);
            })
          ]);
        } finally {
          if (connectTimer) window.clearTimeout(connectTimer);
        }
        if (!isCurrent()) {
          await room.disconnect();
          throw new Error("A tentativa de conexão foi substituída.");
        }
        setConnState("connected");
        setAudioBlocked(!room.canPlaybackAudio);
        incTracks();
        incParts();
        incMeta();
        incQuality();
        incPermission();
        return room;
      } catch (error) {
        if (isCurrent()) {
          roomRef.current = null;
          setConnState("idle");
        }
        try { await room.disconnect(); } catch (e) {}
        throw error;
      }
    })();

    connectPromiseRef.current = operation;
    try {
      return await operation;
    } finally {
      if (connectPromiseRef.current === operation) connectPromiseRef.current = null;
    }
  }, []);

  const enableAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return false;
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
      return room.canPlaybackAudio;
    } catch (error) {
      setLastError({ id: Date.now(), message: error?.message || "Não consegui ativar o áudio neste navegador." });
      return false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try { await room.disconnect(); } catch (e) {}
    }
    setConnState("disconnected");
  }, []);

  useEffect(() => () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) void room.disconnect().catch(() => {});
  }, []);

  return {
    roomRef, connState, connect, disconnect,
    trackVer, partVer, metaVer, qualityVer, permissionVer,
    audioBlocked, enableAudio, lastError
  };
}
