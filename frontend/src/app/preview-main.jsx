import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import ptBR from "antd/locale/pt_BR";
import RoomView from "../components/RoomView.jsx";
import { DEFAULT_SETTINGS } from "../config/constants.js";
import { createTheme } from "../config/theme.js";
import { ThemeProvider, useTheme } from "../config/theme.jsx";
import { DRAW_COLORS, DRAW_WIDTHS, INTERACTION_LIFETIME, newInteractionId } from "../features/interactions/interactions.js";
import { createCursorPublisher, createRemoteCursorStore } from "../features/interactions/sharedCursor.js";
import { SharedCursorContext } from "../features/interactions/sharedCursorContext.js";
import { createPingGate, mergeTransientInteraction } from "../features/interactions/pingPolicy.js";
import "../styles/styles.css";
import "../styles/interactions.css";

const initialStrokes = [
  { id: "preview-marker", tool: "marker", color: "#facc15", width: 12, opacity: 0.32,
    points: [[0.08, 0.17], [0.23, 0.15], [0.39, 0.18]] },
  { id: "preview-pen", tool: "pen", color: "#3b82f6", width: 7, opacity: 1,
    points: [[0.09, 0.31], [0.16, 0.25], [0.23, 0.34], [0.31, 0.26], [0.39, 0.31]] },
  { id: "preview-arrow", tool: "arrow", color: "#ef4444", width: 7, opacity: 1,
    points: [[0.52, 0.18], [0.78, 0.34]] },
  { id: "preview-rectangle", tool: "rectangle", color: "#22c55e", width: 7, opacity: 1,
    points: [[0.1, 0.51], [0.38, 0.8]] },
  { id: "preview-ellipse", tool: "ellipse", color: "#8b5cf6", width: 7, opacity: 1,
    points: [[0.54, 0.5], [0.82, 0.79]] }
];

const initialInteractions = [
  { id: "preview-party", type: "reaction", tile: "board", reaction: "party", x: 0.47, y: 0.82, size: 0.45, speed: 0.2, drift: 0, author: "prévia" },
  { id: "preview-fire", type: "reaction", tile: "board", reaction: "fire", x: 0.88, y: 0.8, size: 0.2, speed: 0.4, drift: 0.25, author: "prévia" }
];

// Synthetic, silent source for UI testing only. Never connects to a LiveKit room.
function usePreviewTile() {
  const [tile, setTile] = useState(null);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280; canvas.height = 720;
    const context = canvas.getContext("2d");
    context.fillStyle = "#0b1018"; context.fillRect(0, 0, 1280, 720);
    context.strokeStyle = "#263244";
    for (let x = 0; x < 1280; x += 80) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 720); context.stroke(); }
    for (let y = 0; y < 720; y += 80) { context.beginPath(); context.moveTo(0, y); context.lineTo(1280, y); context.stroke(); }
    context.fillStyle = "#edf1f6"; context.font = "bold 48px sans-serif"; context.fillText("Prévia da transmissão", 80, 300);
    context.fillStyle = "#a8b1c0"; context.font = "24px sans-serif"; context.fillText("Clique do meio ou segure para apontar um local", 80, 355);
    context.fillText("Vídeo sintético · sem conexão com o servidor", 80, 402);
    const stream = canvas.captureStream(0);
    const mediaStreamTrack = stream.getVideoTracks()[0];
    const interval = window.setInterval(() => mediaStreamTrack.requestFrame(), 500);
    const track = {
      mediaStreamTrack,
      attach(element) { element.srcObject = stream; mediaStreamTrack.requestFrame(); },
      detach(element) { if (element.srcObject === stream) element.srcObject = null; }
    };
    setTile({ key: "preview-screen", sid: "preview", identity: "preview-author", pubName: "screen", isScreen: true,
      isLocal: false, name: "Transmissão de demonstração", author: "Demonstração", track,
      state: { estado: "ao_vivo", desde: Date.now() - 97000 } });
    return () => { window.clearInterval(interval); mediaStreamTrack.stop(); };
  }, []);
  return tile;
}

function PreviewRoom() {
  const previewTile = usePreviewTile();
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [selected, setSelected] = useState(null);
  const [volumes, setVolumes] = useState({});
  const [peopleSettings, setPeopleSettings] = useState({});
  const [interactionTool, setInteractionTool] = useState(null);
  const [markerStyle, setMarkerStyle] = useState("ring");
  const [pendingReaction, setPendingReaction] = useState(null);
  const [brush, setBrush] = useState({ color: DRAW_COLORS[7], width: DRAW_WIDTHS[2], tool: "pen" });
  const [boardOpen, setBoardOpen] = useState(() => new URLSearchParams(window.location.search).get("view") !== "stream");
  const [boardStrokes, setBoardStrokes] = useState(initialStrokes);
  const [interactions, setInteractions] = useState(initialInteractions);
  const [attentionRequest, setAttentionRequest] = useState(null);
  const redoRef = useRef([]);
  const [cursorStore] = useState(createRemoteCursorStore);
  const [pingGate] = useState(createPingGate);
  const [previewIdentity] = useState(newInteractionId);
  const channelRef = useRef(null);
  const cursorSenderRef = useRef(null);
  const transientTimersRef = useRef(new Set());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const addTransient = useCallback((item) => {
    setInteractions((current) => mergeTransientInteraction(current, item));
    const timer = window.setTimeout(() => {
      transientTimersRef.current.delete(timer);
      setInteractions((current) => current.filter((entry) => entry.id !== item.id));
    }, INTERACTION_LIFETIME[item.type] || 3800);
    transientTimersRef.current.add(timer);
  }, []);

  // Test the real pointer publisher/store between preview tabs, not a delayed
  // echo of the local mouse. This channel never contacts a LiveKit server.
  useEffect(() => {
    const channel = new BroadcastChannel("mazestream-pointer-preview");
    channelRef.current = channel;
    const sender = createCursorPublisher((data) => channel.postMessage({ sender: previewIdentity, data }));
    cursorSenderRef.current = sender;
    channel.onmessage = ({ data: envelope }) => {
      if (!envelope?.sender || envelope.sender === previewIdentity || !settingsRef.current.interactionsEnabled || settingsRef.current.pointersEnabled === false) return;
      const author = "Outro participante";
      if (envelope.data?.type === "cursor") cursorStore.receive(envelope.data, envelope.sender, author);
      else if (envelope.data?.type === "ping" && pingGate.accept(envelope.sender)) addTransient({ ...envelope.data, identity: envelope.sender, author });
    };
    return () => {
      sender.dispose(); channel.close(); cursorStore.clear(); pingGate.clear();
      if (channelRef.current === channel) channelRef.current = null;
      if (cursorSenderRef.current === sender) cursorSenderRef.current = null;
      transientTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      transientTimersRef.current.clear();
    };
  }, [previewIdentity, cursorStore, pingGate, addTransient]);
  useEffect(() => {
    if (!settings.interactionsEnabled || settings.pointersEnabled === false) cursorStore.hideWhere(() => true);
  }, [cursorStore, settings.interactionsEnabled, settings.pointersEnabled]);

  const addBoardStroke = useCallback((points, color, width, tool, opacity) => {
    setBoardStrokes((current) => current.concat({ id: newInteractionId(), points, color, width, tool, opacity }));
    redoRef.current = [];
  }, []);

  const undoBoard = useCallback(() => {
    setBoardStrokes((current) => {
      if (!current.length) return current;
      redoRef.current.push(current[current.length - 1]);
      return current.slice(0, -1);
    });
  }, []);

  const redoBoard = useCallback(() => {
    const stroke = redoRef.current.pop();
    if (stroke) setBoardStrokes((current) => current.concat(stroke));
  }, []);

  const onPing = useCallback((tile, point, marker) => {
    if (!pingGate.accept("local")) return;
    const data = { id: newInteractionId(), type: "ping", tile, ...point, marker };
    addTransient({ ...data, identity: previewIdentity, author: "você" });
    channelRef.current?.postMessage({ sender: previewIdentity, data });
  }, [addTransient, pingGate, previewIdentity]);

  const onCursor = useCallback((tile, point) => {
    cursorSenderRef.current?.update(tile, point);
  }, []);
  const onStroke = useCallback((tile, points, color, width, tool, opacity) => addTransient({
    id: newInteractionId(), type: "stroke", tile, points, color, width, tool, opacity, author: "você"
  }), [addTransient]);

  const onReaction = useCallback((tile, reaction, point) => addTransient({
    id: newInteractionId(), type: "reaction", tile, reaction, ...point,
    size: Math.random(), speed: Math.random(), drift: Math.random() * 2 - 1, author: "você"
  }), [addTransient]);

  return (
    <>
      <SharedCursorContext.Provider value={cursorStore}>
      <RoomView
        tiles={previewTile ? [previewTile] : []} audios={[]} people={[]} screenCount={0} totalScreenCount={1} connState="connected"
        selected={selected} setSelected={setSelected} volumes={volumes} setVolumes={setVolumes}
        settings={settings} setSettings={setSettings} peopleSettings={peopleSettings}
        onPersonSetting={(name, patch) => setPeopleSettings((current) => ({ ...current, [name]: { ...(current[name] || {}), ...patch } }))}
        isHost hostIdentity="preview" roomRole="host" roomPreset="livre" roomLocked={false} presenter={null}
        localCanPublish localCanPublishData chatMessages={[]} onSendChat={() => true} onShareFile={async () => {}}
        onSetRoomPin={() => {}} onSetRoomPreset={() => {}} onSetPresenter={() => {}}
        onSetParticipantPermission={() => {}} onKickParticipant={() => {}} onVoteKickParticipant={async () => ({ votes: 1, required: 2 })}
        clipSupported clipEnabled={false} clipBuffering={false} clipExporting={false} clipError="" clipReadySeconds={0}
        clipTargetName="Prévia local" onToggleClipBuffer={() => {}} onSaveClip={() => {}}
        micOn={false} camOn={false} currentRoom="preview-local"
        myState={{ estado: "ao_vivo", desde: Date.now() - 97000, titulo: "Prévia das ferramentas" }}
        audioBlocked={false} onEnableAudio={() => {}}
        interactions={interactions.filter((item) => settings.interactionsEnabled && !(item.type === "ping" && settings.pointersEnabled === false))} interactionTool={interactionTool} setInteractionTool={setInteractionTool}
        markerStyle={markerStyle} setMarkerStyle={setMarkerStyle}
        pendingReaction={pendingReaction} setPendingReaction={setPendingReaction}
        brush={brush} setBrush={setBrush}
        onPing={onPing} onCursor={onCursor} onStroke={onStroke} onReaction={onReaction}
        boardOpen={boardOpen} setBoardOpen={setBoardOpen} boardStrokes={boardStrokes}
        onBoardStroke={addBoardStroke} onBoardUndo={undoBoard} onBoardRedo={redoBoard}
        boardCanUndo={boardStrokes.length > 0} boardCanRedo={redoRef.current.length > 0}
        onBoardClear={() => { setBoardStrokes([]); redoRef.current = []; }}
        attentionRequest={attentionRequest} setAttentionRequest={setAttentionRequest} onCallAttention={() => {}}
        sharing={false} onShare={() => {}} onStopBroadcast={() => {}} onStopAll={() => {}}
        onPauseLive={() => {}} onResumeLive={() => {}} onLiveTitle={() => {}} onCopyLink={() => {}}
        onToggleMic={() => {}} onToggleCam={() => {}} onLeave={() => {}}
      />
      </SharedCursorContext.Provider>
      <div style={{ position: "fixed", right: 14, bottom: 78, zIndex: 1000, padding: "7px 11px",
        borderRadius: 10, background: "rgba(15,23,42,.88)", color: "#fff", fontSize: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
        PRÉVIA LOCAL · <a style={{ color: "inherit" }} href="/">Login</a> · <a style={{ color: "inherit" }} href="/preview.html?view=stream">Transmissão</a> · <a style={{ color: "inherit" }} href="/preview.html?view=stream&receiver=1" target="_blank" rel="noreferrer">Outro espectador</a>
      </div>
    </>
  );
}

function PreviewRoot() {
  const { dark } = useTheme();
  return (
    <ConfigProvider theme={createTheme(dark)} locale={ptBR}>
      <AntApp><PreviewRoom /></AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <ThemeProvider><PreviewRoot /></ThemeProvider>
);
