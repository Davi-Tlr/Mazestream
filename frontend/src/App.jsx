import { useState, useEffect, useMemo, useCallback } from "react";
import { App as AntApp } from "antd";
import { VideoQuality } from "livekit-client";
import { useRoom } from "./useRoom.js";
import { useCollectTiles, useCollectAudios, useCollectPeople } from "./collect.js";
import { readState, buildState } from "./state.js";
import { useScreenShare } from "./useScreenShare.js";
import { DEFAULT_SETTINGS } from "./constants.js";
import JoinScreen from "./ui/JoinScreen.jsx";
import RoomView from "./ui/RoomView.jsx";

const RECEIVE_QUALITY_MAP = {
  high: VideoQuality.HIGH,
  medium: VideoQuality.MEDIUM,
  low: VideoQuality.LOW
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("ajustes") || "{}");
    if (saved.configVersion !== DEFAULT_SETTINGS.configVersion) {
      return { ...DEFAULT_SETTINGS, ...saved, configVersion: DEFAULT_SETTINGS.configVersion, sendQuality: "medium", receiveQuality: "auto" };
    }
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export default function App() {
  const { message } = AntApp.useApp();
  const { roomRef, connState, connect, disconnect, trackVersion, participantVersion, metadataVersion } = useRoom();

  const [phase, setPhase] = useState("join");
  const [joining, setJoining] = useState(false);
  const [currentRoom, setCurrentRoom] = useState("");
  const [settings, setSettings] = useState(loadSettings);
  const [volumes, setVolumes] = useState({});
  const [selected, setSelected] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("ajustes", JSON.stringify(settings)); } catch (e) {}
  }, [settings]);

  const room = roomRef.current;

  const tiles = useCollectTiles(room, trackVersion);
  const audios = useCollectAudios(room, trackVersion);
  const people = useCollectPeople(room, participantVersion);
  const screenCount = useMemo(() => tiles.filter((t) => t.isLocal && t.isScreen).length, [tiles]);
  const myState = useMemo(() => readState(room ? room.localParticipant : null), [room, metadataVersion]);

  const updateMeta = useCallback(async (patch) => {
    if (!room) return;
    const next = { ...readState(room.localParticipant), ...patch };
    try { await room.localParticipant.setMetadata(buildState(next)); } catch (e) {}
  }, [room]);

  const { shareScreen, stopBroadcast, stopAll, pauseLive, resumeLive } = useScreenShare(room, settings, updateMeta);

  useEffect(() => {
    if (!room) return;
    if (settings.receiveQuality === "auto") return;
    const target = RECEIVE_QUALITY_MAP[settings.receiveQuality];
    if (target === undefined) return;
    room.remoteParticipants.forEach((p) => {
      p.videoTrackPublications.forEach((pub) => {
        if (pub.setVideoQuality) {
          try { pub.setVideoQuality(target); } catch (e) {}
        }
      });
    });
  }, [room, settings.receiveQuality]);

  const join = useCallback(async (name, roomName) => {
    setJoining(true);
    try {
      const resp = await fetch("/token?room=" + encodeURIComponent(roomName) + "&name=" + encodeURIComponent(name));
      if (!resp.ok) {
        let reason = "Nao consegui entrar agora.";
        try { const j = await resp.json(); if (j && j.motivo) reason = j.motivo; } catch (e) {}
        throw new Error(reason);
      }
      const data = await resp.json();
      const url = data.url || window.LIVEKIT_URL;
      if (!url) throw new Error("URL do servidor nao configurada");
      await connect(url, data.token);
      localStorage.setItem("meuNome", name);
      setCurrentRoom(roomName);
      setPhase("room");
    } catch (e) {
      message.error(e && e.message ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  }, [connect, message]);

  const setLiveTitle = useCallback((t) => { updateMeta({ titulo: t }); }, [updateMeta]);

  const copyLink = useCallback(async () => {
    const link = window.location.origin + "/?sala=" + encodeURIComponent(currentRoom || "geral");
    try { await navigator.clipboard.writeText(link); message.success("Link da sala copiado."); }
    catch (e) { message.info(link); }
  }, [currentRoom, message]);

  const toggleMic = useCallback(async () => {
    if (!room) return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [room]);

  const toggleCam = useCallback(async () => {
    if (!room) return;
    const next = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }, [room]);

  const leave = useCallback(() => {
    disconnect();
    window.location.reload();
  }, [disconnect]);

  const onShare = useCallback(() => shareScreen(message), [shareScreen, message]);

  if (phase === "join") {
    return <JoinScreen joining={joining} onJoin={join} />;
  }

  return (
    <RoomView
      tiles={tiles}
      audios={audios}
      people={people}
      screenCount={screenCount}
      connState={connState}
      selected={selected}
      setSelected={setSelected}
      volumes={volumes}
      setVolumes={setVolumes}
      settings={settings}
      setSettings={setSettings}
      micOn={micOn}
      camOn={camOn}
      currentRoom={currentRoom}
      myState={myState}
      onShare={onShare}
      onStopBroadcast={stopBroadcast}
      onStopAll={stopAll}
      onPauseLive={pauseLive}
      onResumeLive={resumeLive}
      onLiveTitle={setLiveTitle}
      onCopyLink={copyLink}
      onToggleMic={toggleMic}
      onToggleCam={toggleCam}
      onLeave={leave}
    />
  );
}
