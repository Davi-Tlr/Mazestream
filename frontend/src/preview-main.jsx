import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import ptBR from "antd/locale/pt_BR";
import RoomView from "./ui/RoomView.jsx";
import { DEFAULT_SETTINGS } from "./constants.js";
import { createTheme } from "./theme.js";
import { ThemeProvider, useTheme } from "./theme.jsx";
import { DRAW_COLORS, DRAW_WIDTHS, newInteractionId } from "./interactions.js";
import "./styles.css";
import "./interactions.css";

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

function PreviewRoom() {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [selected, setSelected] = useState(null);
  const [volumes, setVolumes] = useState({});
  const [peopleSettings, setPeopleSettings] = useState({});
  const [interactionTool, setInteractionTool] = useState("draw");
  const [markerStyle, setMarkerStyle] = useState("ring");
  const [pendingReaction, setPendingReaction] = useState(null);
  const [brush, setBrush] = useState({ color: DRAW_COLORS[7], width: DRAW_WIDTHS[2], tool: "pen" });
  const [boardOpen, setBoardOpen] = useState(true);
  const [boardStrokes, setBoardStrokes] = useState(initialStrokes);
  const [interactions, setInteractions] = useState(initialInteractions);
  const [attentionRequest, setAttentionRequest] = useState(null);
  const redoRef = useRef([]);

  const addTransient = useCallback((item) => {
    setInteractions((current) => current.concat(item));
    window.setTimeout(() => setInteractions((current) => current.filter((entry) => entry.id !== item.id)), 3800);
  }, []);

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

  const onPing = useCallback((tile, point, marker) => addTransient({
    id: newInteractionId(), type: "ping", tile, ...point, marker, author: "você"
  }), [addTransient]);

  const onCursor = useCallback((tile, point) => {
    setInteractions((current) => current.filter((item) => !(item.type === "cursor" && item.tile === tile))
      .concat({ id: "preview-cursor", type: "cursor", tile, ...point, author: "você" }));
  }, []);

  const onReaction = useCallback((tile, reaction, point) => addTransient({
    id: newInteractionId(), type: "reaction", tile, reaction, ...point,
    size: Math.random(), speed: Math.random(), drift: Math.random() * 2 - 1, author: "você"
  }), [addTransient]);

  return (
    <>
      <RoomView
        tiles={[]} audios={[]} people={[]} screenCount={0} totalScreenCount={0} connState="connected"
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
        interactions={interactions} interactionTool={interactionTool} setInteractionTool={setInteractionTool}
        markerStyle={markerStyle} setMarkerStyle={setMarkerStyle}
        pendingReaction={pendingReaction} setPendingReaction={setPendingReaction}
        brush={brush} setBrush={setBrush}
        onPing={onPing} onCursor={onCursor} onStroke={() => {}} onReaction={onReaction}
        boardOpen={boardOpen} setBoardOpen={setBoardOpen} boardStrokes={boardStrokes}
        onBoardStroke={addBoardStroke} onBoardUndo={undoBoard} onBoardRedo={redoBoard}
        boardCanUndo={boardStrokes.length > 0} boardCanRedo={redoRef.current.length > 0}
        onBoardClear={() => { setBoardStrokes([]); redoRef.current = []; }}
        attentionRequest={attentionRequest} setAttentionRequest={setAttentionRequest} onCallAttention={() => {}}
        sharing={false} onShare={() => {}} onStopBroadcast={() => {}} onStopAll={() => {}}
        onPauseLive={() => {}} onResumeLive={() => {}} onLiveTitle={() => {}} onCopyLink={() => {}}
        onToggleMic={() => {}} onToggleCam={() => {}} onLeave={() => {}}
      />
      <div style={{ position: "fixed", right: 14, bottom: 78, zIndex: 1000, padding: "7px 11px",
        borderRadius: 10, background: "rgba(15,23,42,.88)", color: "#fff", fontSize: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
        PRÉVIA LOCAL · nada publicado
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
