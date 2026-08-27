import { useState, useRef, useEffect, useMemo, useCallback, memo, forwardRef } from "react";
import { LayoutGroup, AnimatePresence, motion } from "framer-motion";
import { Button, ConfigProvider, Drawer, Switch, Select, Segmented, Input, Slider, Tag, Empty, Tooltip, Popover, Badge } from "antd";
import {
  DesktopOutlined, StopOutlined, AudioOutlined, AudioMutedOutlined,
  VideoCameraOutlined, VideoCameraAddOutlined, SettingOutlined, TeamOutlined, LogoutOutlined,
  AppstoreOutlined, PicCenterOutlined, ExpandOutlined, FullscreenOutlined,
  PauseOutlined, CaretRightOutlined, LinkOutlined, AimOutlined, EditOutlined,
  ClearOutlined, BorderOutlined, NotificationOutlined, DeleteOutlined,
  EyeOutlined, EyeInvisibleOutlined, MessageOutlined, DownOutlined, UpOutlined,
  CommentOutlined, UploadOutlined, CrownOutlined, PushpinOutlined, ScissorOutlined,
  LockOutlined, UnlockOutlined, UserDeleteOutlined,
  UndoOutlined, RedoOutlined, EllipsisOutlined
} from "@ant-design/icons";
import VideoTile from "./VideoTile.jsx";
import AudioSink from "./AudioSink.jsx";
import SharedBoard from "./SharedBoard.jsx";
import { Sun, Moon, PointerIcon, REACTIONS } from "./icons.jsx";
import { useTheme } from "../theme.jsx";
import { fmtDuration } from "../state.js";
import { volumeKey, getPersonSettings } from "../collect.js";
import { DRAW_COLORS, DRAW_WIDTHS, DRAW_TOOLS, DRAW_TOOL_LABELS } from "../interactions.js";
import { ROOM_PRESETS, PRESET_OPTIONS } from "../roomFeatures.js";
import { CONTENT_OPTIONS, SEND_OPTIONS, RECEIVE_OPTIONS, MAX_SCREENS, QUALITY_LABELS } from "../constants.js";
import { useIdleControls } from "../useIdleControls.js";

const STATUS_MAP = {
  idle: ["Conectando", "reconnecting"], connecting: ["Conectando", "reconnecting"],
  connected: ["Conectado", "connected"], reconnecting: ["Reconectando", "reconnecting"],
  disconnected: ["Desconectado", "disconnected"]
};
const QUALITY_COLOR = { excellent: "success", good: "green", poor: "warning", lost: "error", unknown: "default" };

const Touch = forwardRef(function Touch({ children, ...props }, ref) {
  return (
    <motion.span {...props} ref={ref} style={{ display: "inline-flex" }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }}>
      {children}
    </motion.span>
  );
});

function ChatText({ text }) {
  const parts = String(text || "").split(/(https?:\/\/[^\s]+)/g);
  return (
    <div className="chat-text">
      {parts.map((part, index) => /^https?:\/\//.test(part)
        ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>
        : part)}
    </div>
  );
}

const LiveTimer = memo(function LiveTimer({ desde, estado }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (estado !== "ao_vivo") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [estado]);
  if (estado !== "ao_vivo" || !desde) return null;
  return <span className="live-pill live"><span className="pulse" /> AO VIVO · {fmtDuration(now - desde)}</span>;
});

const EMPTY_INTERACTIONS = Object.freeze([]);

// Keep per-tile callbacks inside the memoized adapter. RoomView also renders
// the cursor/interaction stream, so creating a fresh closure for every tile on
// each pointer update would otherwise defeat VideoTile's memoization.
const MemoTile = memo(function MemoTile({
  tile, destaque, interactions, interactionTool, markerStyle, pendingReaction, brush,
  mostrarVolume, volume, onSelectTile, onSetVolume, onToggleMute, onStopBroadcast,
  onPingTile, onCursorTile, onStrokeTile, onReactionTile, controlsAwake, canInteract
}) {
  const volKey = volumeKey(tile.sid, tile.pubName);
  const onSelect = useCallback(() => onSelectTile(tile.key), [onSelectTile, tile.key]);
  const onVolume = useCallback((value) => onSetVolume(volKey, value), [onSetVolume, volKey]);
  const onMute = useCallback(() => onToggleMute(volKey), [onToggleMute, volKey]);
  const onPing = useCallback((point, marker) => onPingTile(tile.key, point, marker), [onPingTile, tile.key]);
  const onCursor = useCallback((point) => onCursorTile(tile.key, point), [onCursorTile, tile.key]);
  const onStroke = useCallback((points, color, width, tool, opacity) => {
    onStrokeTile(tile.key, points, color, width, tool, opacity);
  }, [onStrokeTile, tile.key]);
  const onReactionAt = useCallback((point, reaction) => {
    onReactionTile(tile.key, reaction, point);
  }, [onReactionTile, tile.key]);

  return <VideoTile
    tile={tile}
    destaque={destaque}
    onSelect={onSelect}
    mostrarVolume={mostrarVolume}
    volume={volume}
    onVolume={onVolume}
    onMute={onMute}
    onParar={onStopBroadcast}
    interactions={interactions}
    interactionTool={interactionTool}
    markerStyle={markerStyle}
    pendingReaction={pendingReaction}
    brush={brush}
    onPing={onPing}
    onCursor={onCursor}
    onStroke={onStroke}
    onReactionAt={onReactionAt}
    controlsAwake={controlsAwake}
    canInteract={canInteract}
  />;
});

export default function RoomView(props) {
  const {
    tiles, audios, people, screenCount, totalScreenCount, connState,
    selected, setSelected, volumes, setVolumes,
    settings, setSettings, peopleSettings, onPersonSetting,
    isHost, hostIdentity, roomRole, roomPreset, roomLocked, presenter,
    localCanPublish, localCanPublishData,
    chatMessages, onSendChat, onShareFile,
    onSetRoomPin, onSetRoomPreset, onSetPresenter, onSetParticipantPermission, onKickParticipant, onVoteKickParticipant,
    clipSupported, clipBuffering, clipExporting, clipError, clipReadySeconds, clipTargetName,
    clipEnabled, onToggleClipBuffer, onSaveClip,
    micOn, camOn, currentRoom, myState,
    audioBlocked, onEnableAudio,
    interactions, interactionTool, setInteractionTool,
    markerStyle, setMarkerStyle, pendingReaction, setPendingReaction,
    brush, setBrush,
    onPing, onCursor, onStroke, onReaction,
    boardOpen, setBoardOpen, boardStrokes, onBoardStroke, onBoardUndo, onBoardRedo,
    boardCanUndo, boardCanRedo, onBoardClear,
    attentionRequest, setAttentionRequest, onCallAttention,
    onShare, sharing, onStopBroadcast, onStopAll,
    onPauseLive, onResumeLive, onLiveTitle, onCopyLink,
    onToggleMic, onToggleCam, onLeave
  } = props;

  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [unreadChat, setUnreadChat] = useState(0);
  const [pinDraft, setPinDraft] = useState("");
  const [voteKickBusy, setVoteKickBusy] = useState("");
  const fileInputRef = useRef(null);
  const lastChatCountRef = useRef(chatMessages ? chatMessages.length : 0);
  const [layoutMode, setLayoutMode] = useState(() => {
    try {
      const saved = localStorage.getItem("mazestreamLayout");
      return saved === "default" || saved === "theater" ? saved : "default";
    } catch (e) { return "default"; }
  });
  const [titleLocal, setTitleLocal] = useState(myState ? myState.titulo : "");
  const [hudEnabled, setHudEnabled] = useState(true);
  const [openPopover, setOpenPopover] = useState(null);
  const [hudTipOpen, setHudTipOpen] = useState(false);
  const roomRef = useRef(null);
  const theme = useTheme();
  const idle = useIdleControls(roomRef, connectionsOpen || settingsOpen || chatOpen || !!openPopover || (!boardOpen && tiles.length === 0));
  const hudVisible = hudEnabled && !idle;
  useEffect(() => { if (idle) setHudTipOpen(false); }, [idle]);
  const popoverProps = (key) => ({
    open: openPopover === key,
    onOpenChange: (open) => setOpenPopover(open ? key : null),
    getPopupContainer: () => roomRef.current || document.body
  });

  const [nowDrawer, setNowDrawer] = useState(Date.now());
  useEffect(() => {
    if (!settingsOpen) return;
    const id = setInterval(() => setNowDrawer(Date.now()), 1000);
    return () => clearInterval(id);
  }, [settingsOpen]);

  useEffect(() => { setTitleLocal(myState ? myState.titulo : ""); }, [myState && myState.titulo]);
  useEffect(() => {
    if (layoutMode === "default" || layoutMode === "theater") {
      try { localStorage.setItem("mazestreamLayout", layoutMode); } catch (e) {}
    }
  }, [layoutMode]);

  useEffect(() => {
    const count = chatMessages ? chatMessages.length : 0;
    if (count > lastChatCountRef.current && !chatOpen) {
      setUnreadChat((value) => value + (count - lastChatCountRef.current));
    }
    lastChatCountRef.current = count;
  }, [chatMessages, chatOpen]);

  useEffect(() => { if (chatOpen) setUnreadChat(0); }, [chatOpen]);

  useEffect(() => {
    const presetLayout = ROOM_PRESETS[roomPreset]?.layout;
    if (!presetLayout || document.fullscreenElement) return;
    setLayoutMode(presetLayout);
  }, [roomPreset]);

  useEffect(() => {
    if (localCanPublishData) return;
    setInteractionTool(null);
    setPendingReaction(null);
  }, [localCanPublishData, setInteractionTool, setPendingReaction]);

  const isLive = myState && (myState.estado === "ao_vivo" || myState.estado === "pausado");

  useEffect(() => {
    function onFs() {
      if (!document.fullscreenElement) {
        setLayoutMode((mode) => (mode === "fullscreen-pc" ? "default" : mode));
      }
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const goFullscreen = useCallback(async () => {
    setOpenPopover(null);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setLayoutMode("default");
        return;
      }
      if (roomRef.current && roomRef.current.requestFullscreen) {
        await roomRef.current.requestFullscreen();
        setLayoutMode("fullscreen-pc");
      }
    } catch (e) {}
  }, []);

  const switchMode = useCallback((mode) => {
    setOpenPopover(null);
    if (mode === "fullscreen-pc") { goFullscreen(); return; }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setLayoutMode(mode);
  }, [goFullscreen]);

  const { selTile, others } = useMemo(() => {
    let selKey = selected && tiles.some((tile) => tile.key === selected) ? selected : null;
    if (!selKey) {
      const screen = tiles.find((tile) => tile.isScreen);
      selKey = screen ? screen.key : (tiles[0] ? tiles[0].key : null);
    }
    const sel = tiles.find((tile) => tile.key === selKey) || null;
    const out = sel ? tiles.filter((tile) => tile.key !== selKey) : tiles;
    return { selTile: sel, others: out };
  }, [tiles, selected]);

  const targetInteraction = boardOpen ? "board" : (selTile ? selTile.key : null);
  const interactionsByTile = useMemo(() => {
    const grouped = new Map();
    (interactions || []).forEach((item) => {
      const list = grouped.get(item.tile);
      if (list) list.push(item);
      else grouped.set(item.tile, [item]);
    });
    return grouped;
  }, [interactions]);
  const boardInteractions = interactionsByTile.get("board") || EMPTY_INTERACTIONS;
  const onBoardCursor = useCallback((point) => onCursor("board", point), [onCursor]);

  const volCurrent = useCallback((key) => volumes[key] || { value: 100, muted: !!settings.startMuted }, [volumes, settings.startMuted]);
  const setVol = useCallback((key, pct) => setVolumes((previous) => ({ ...previous, [key]: { value: pct, muted: false } })), [setVolumes]);
  const toggleMute = useCallback((key) => {
    setVolumes((previous) => {
      const current = previous[key] || { value: 100, muted: !!settings.startMuted };
      return { ...previous, [key]: { value: current.value, muted: !current.muted } };
    });
  }, [setVolumes, settings.startMuted]);

  useEffect(() => {
    function onKey(event) {
      const el = event.target;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.closest?.('[role="slider"], [role="combobox"], .ant-select'))) return;
      const key = event.key.toLowerCase();
      if (event.repeat && key !== "arrowup" && key !== "arrowdown") return;
      if (key === "escape" && openPopover) { event.preventDefault(); setOpenPopover(null); return; }
      if (key === "f") { event.preventDefault(); goFullscreen(); }
      else if (key === "t") { event.preventDefault(); switchMode(layoutMode === "theater" ? "default" : "theater"); }
      else if (key === "m") { event.preventDefault(); setSettings((current) => ({ ...current, muteAll: !current.muteAll })); }
      else if (key === "h") { event.preventDefault(); setOpenPopover(null); setHudTipOpen(false); setHudEnabled((value) => !value); }
      else if (key >= "1" && key <= "9") {
        const tile = tiles[Number(key) - 1];
        if (tile) { event.preventDefault(); setBoardOpen(false); setSelected(tile.key); }
      } else if (key === "arrowup" || key === "arrowdown") {
        if (!selTile || !selTile.isScreen || selTile.isLocal || boardOpen) return;
        event.preventDefault();
        const volumeKeyCurrent = volumeKey(selTile.sid, selTile.pubName);
        const current = volCurrent(volumeKeyCurrent);
        const step = key === "arrowup" ? 10 : -10;
        setVol(volumeKeyCurrent, Math.max(0, Math.min(100, (current.muted ? 0 : current.value) + step)));
      } else if (key === "escape" && !document.fullscreenElement && layoutMode !== "default") {
        setLayoutMode("default");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goFullscreen, switchMode, layoutMode, setSettings, tiles, selTile, boardOpen, volCurrent, setVol, setBoardOpen, setSelected, openPopover]);

  const selectTile = useCallback((key) => {
    setBoardOpen(false);
    setSelected(key);
  }, [setBoardOpen, setSelected]);

  const renderTile = useCallback((tile, highlighted) => {
    const volKey = volumeKey(tile.sid, tile.pubName);
    return (
      <MemoTile
        key={tile.key}
        tile={tile}
        destaque={highlighted}
        onSelectTile={selectTile}
        mostrarVolume={highlighted && tile.isScreen && !tile.isLocal}
        volume={volCurrent(volKey)}
        onSetVolume={setVol}
        onToggleMute={toggleMute}
        onStopBroadcast={onStopBroadcast}
        interactions={highlighted ? (interactionsByTile.get(tile.key) || EMPTY_INTERACTIONS) : EMPTY_INTERACTIONS}
        interactionTool={highlighted ? interactionTool : null}
        markerStyle={highlighted ? markerStyle : null}
        pendingReaction={highlighted ? pendingReaction : null}
        brush={highlighted ? brush : null}
        onPingTile={onPing}
        onCursorTile={onCursor}
        onStrokeTile={onStroke}
        onReactionTile={onReaction}
        controlsAwake={hudVisible}
        canInteract={localCanPublishData}
      />
    );
  }, [selectTile, volCurrent, setVol, toggleMute, onStopBroadcast, interactionsByTile, interactionTool, markerStyle, pendingReaction, brush, onPing, onCursor, onStroke, onReaction, hudVisible, localCanPublishData]);

  const [statusText, statusClass] = STATUS_MAP[connState] || STATUS_MAP.connecting;
  const layoutBtns = [
    { mode: "default", icon: <AppstoreOutlined />, title: "Padrão (lado a lado)" },
    { mode: "theater", icon: <PicCenterOutlined />, title: "Teatro (miniaturas embaixo)" },
    { mode: "fullscreen-app", icon: <ExpandOutlined />, title: "Tela cheia do app" },
    { mode: "fullscreen-pc", icon: <FullscreenOutlined />, title: "Tela cheia do PC (F)" }
  ];

  const presenterTarget = boardOpen ? { kind: "board" } : (selTile ? {
    kind: "track", identity: selTile.identity || "", pubName: selTile.pubName || "", source: String(selTile.source || "")
  } : null);

  function submitChat() {
    if (onSendChat(chatDraft)) setChatDraft("");
  }

  async function chooseFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file) await onShareFile(file);
  }

  const activeLiveState = !boardOpen && selTile ? selTile.state : null;

  const drawingInspector = (
    <div className="drawing-inspector">
      <div className="inspector-head">
        <span>Desenho</span>
        <b>{DRAW_TOOL_LABELS[brush.tool] || "Caneta"}</b>
      </div>
      <div className="inspector-section">
        <span className="inspector-label">Ferramenta</span>
        <div className="drawing-tool-menu">
          {DRAW_TOOLS.map((tool) => (
            <Button key={tool} size="small" type={brush.tool === tool ? "primary" : "text"}
              onClick={() => {
                setPendingReaction(null);
                setBrush({ ...brush, tool });
                setInteractionTool("draw");
              }}>
              {DRAW_TOOL_LABELS[tool]}
            </Button>
          ))}
        </div>
      </div>
      <div className="inspector-section">
        <span className="inspector-label">Cor</span>
        <div className="inspector-palette">
          {DRAW_COLORS.map((color) => (
            <button key={color} className={"brush-color" + (brush.color === color ? " active" : "")}
              style={{ "--brush-color": color }} aria-label={"Cor " + color}
              onClick={() => setBrush({ ...brush, color })} />
          ))}
          <label className="brush-custom-color" title="Cor personalizada">
            <input type="color" value={brush.color} aria-label="Cor personalizada"
              onChange={(event) => setBrush({ ...brush, color: event.target.value })} />
          </label>
        </div>
      </div>
      <div className="inspector-section inspector-size-row">
        <span className="inspector-label">Tamanho</span>
        <div className="inspector-widths">
          {DRAW_WIDTHS.map((width) => (
            <button key={width} className={"brush-width" + (brush.width === width ? " active" : "")}
              aria-label={"Espessura " + width} onClick={() => setBrush({ ...brush, width })}>
              <span style={{ width: width + 4, height: width + 4 }} />
            </button>
          ))}
        </div>
      </div>
      {boardOpen && (
        <div className="inspector-board-actions">
          <Tooltip title="Desfazer"><Button size="small" icon={<UndoOutlined />} aria-label="Desfazer"
            disabled={!boardCanUndo} onClick={onBoardUndo} /></Tooltip>
          <Tooltip title="Refazer"><Button size="small" icon={<RedoOutlined />} aria-label="Refazer"
            disabled={!boardCanRedo} onClick={onBoardRedo} /></Tooltip>
          <Tooltip title="Limpar o quadro"><Button size="small" danger icon={<DeleteOutlined />}
            aria-label="Limpar o quadro" onClick={onBoardClear} /></Tooltip>
        </div>
      )}
      <p className="inspector-note">
        {boardOpen
          ? "No canvas, os desenhos permanecem até alguém desfazer ou limpar o quadro."
          : "Sobre a transmissão, cada desenho desaparece automaticamente após 10 segundos."}
      </p>
    </div>
  );

  const moreControls = (
    <div className="toolbar-more-menu">
      <div className={"toolbar-more-status " + statusClass}>
        <span />{statusText}
      </div>
      <Button type="text" icon={<LinkOutlined />} onClick={onCopyLink}>Convidar pessoas</Button>
      <div className="toolbar-more-divider" />
      <span className="toolbar-more-label">Visualização</span>
      {layoutBtns.map((button) => (
        <Button key={button.mode} type={layoutMode === button.mode ? "primary" : "text"}
          icon={button.icon} onClick={() => switchMode(button.mode)}>{button.title}</Button>
      ))}
      <div className="toolbar-more-divider" />
      <Button type="text" icon={theme.dark ? <Sun /> : <Moon />} onClick={theme.toggle}>
        {theme.dark ? "Tema claro" : "Tema escuro"}
      </Button>
      <Button type="text" danger icon={<LogoutOutlined />} onClick={onLeave}>Sair da sala</Button>
    </div>
  );

  return (
    <div className="room" data-mode={layoutMode} data-hud={hudVisible ? "on" : "off"}
      data-idle={idle ? "true" : "false"} data-controls-enabled={hudEnabled ? "true" : "false"} ref={roomRef}>
      <AnimatePresence>
        {attentionRequest && (
          <motion.div className="attention-banner"
            initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }}>
            <span><b>{attentionRequest.author}</b> quer te mostrar {attentionRequest.title ? "“" + attentionRequest.title + "”" : "algo"}.</span>
            <Button size="small" type="primary" icon={<AimOutlined />} onClick={() => {
              if (attentionRequest.tile === "board") setBoardOpen(true);
              else { setBoardOpen(false); setSelected(attentionRequest.tile); }
              setAttentionRequest(null);
            }}>Ver agora</Button>
            <Button size="small" type="text" onClick={() => setAttentionRequest(null)}>Agora não</Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {audioBlocked && (
          <motion.div className="audio-unlock-banner"
            initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}>
            <span>O navegador bloqueou o som até você interagir.</span>
            <Button size="small" type="primary" icon={<AudioOutlined />} onClick={onEnableAudio}>Ativar som</Button>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="header">
        <div className="brand">Mazestream</div>
        <div className="room-info">
          {isHost && <Tag color="gold" icon={<CrownOutlined />}>HOST</Tag>}
          {!localCanPublish && <Tag icon={<EyeOutlined />}>ESPECTADOR</Tag>}
          <Tag>{ROOM_PRESETS[roomPreset]?.label || "Livre"}</Tag>
          {roomLocked && <Tag icon={<LockOutlined />}>PIN</Tag>}
          {presenter && <Tag color="processing" icon={<PushpinOutlined />}>DESTAQUE DO HOST</Tag>}
          {selTile && !boardOpen && <span className="active-stream-name" title={selTile.name}>{selTile.author || selTile.name}</span>}
          <LiveTimer desde={activeLiveState?.desde} estado={activeLiveState?.estado} />
          {activeLiveState?.estado === "pausado" && (
            <span className="live-pill paused"><PauseOutlined /> EM PAUSA</span>
          )}
          <span className="viewers"><TeamOutlined /> {people.length}</span>
          <b>{(totalScreenCount !== undefined ? totalScreenCount : screenCount)} ao vivo</b>
        </div>
      </header>

      <div className="content">
        <Tooltip title={hudEnabled ? "Esconder controles (H)" : "Mostrar controles (H)"} placement="left"
          open={!idle && hudTipOpen} onOpenChange={setHudTipOpen}>
          <Button className="hud-toggle" size="small" icon={hudVisible ? <DownOutlined /> : <UpOutlined />}
            aria-label={hudVisible ? "Esconder controles" : "Mostrar controles"}
            onClick={() => { setOpenPopover(null); setHudTipOpen(false); setHudEnabled((value) => !value); }} />
        </Tooltip>
        <LayoutGroup>
          <main className="stage">
            {boardOpen ? (
              <SharedBoard
                strokes={boardStrokes}
                tool={localCanPublishData ? interactionTool : null}
                brush={brush}
                interactions={boardInteractions}
                markerStyle={markerStyle}
                pendingReaction={pendingReaction}
                canInteract={localCanPublishData}
                onStroke={onBoardStroke}
                onPing={(point, marker) => onPing("board", point, marker)}
                onCursor={onBoardCursor}
                onReactionAt={(point, reaction) => onReaction("board", reaction, point)}
              />
            ) : selTile ? renderTile(selTile, true) : (
              <div className="tile destaque" style={{ cursor: "default" }}>
                <div className="tile-empty">
                  <div><strong>Nada sendo compartilhado</strong>
                    <span>{localCanPublish ? "Clique em Compartilhar tela pra começar." : "Você entrou como espectador. Quando alguém transmitir, aparece aqui."}</span></div>
                </div>
              </div>
            )}
          </main>
          <aside className="rail">
            {others.length === 0 && selTile && <div className="rail-empty">Só esta transmissão por enquanto.</div>}
            <AnimatePresence>{others.map((tile) => renderTile(tile, false))}</AnimatePresence>
          </aside>
        </LayoutGroup>
      </div>

      {audios.map((audio) => (
      <AudioSink key={audio.key} track={audio.track}
          volume={volCurrent(volumeKey(audio.sid, audio.pubName))}
          muteAll={settings.muteAll}
          personVolume={getPersonSettings(peopleSettings, audio.ownerIdentity, audio.owner).volume} />
      ))}

      <ConfigProvider getPopupContainer={(trigger) => trigger?.closest(".room") || document.body}>
      <div className="toolbar">
        <span className="control-cluster media-controls">
          <Touch><Button className="share-control" type="primary" icon={<DesktopOutlined />}
            loading={sharing} disabled={!localCanPublish || sharing || screenCount >= MAX_SCREENS} onClick={onShare}>
            {!localCanPublish ? "Espectador" : (sharing ? "Escolhendo" : (screenCount === 0 ? "Compartilhar" : (screenCount === 1 ? "Outra tela" : "Limite")))}
          </Button></Touch>
          <Tooltip title={screenCount > 1 ? "Parar todas as transmissões" : "Parar transmissão"}>
            <Touch><Button icon={<StopOutlined />} danger disabled={!localCanPublish || screenCount === 0}
              aria-label="Parar transmissão" onClick={onStopAll} /></Touch>
          </Tooltip>
          {screenCount > 0 && localCanPublish && (myState && myState.estado === "pausado"
            ? <Tooltip title="Retomar transmissão"><Touch><Button icon={<CaretRightOutlined />} type="primary"
              aria-label="Retomar transmissão" onClick={onResumeLive} /></Touch></Tooltip>
            : <Tooltip title="Pausar transmissão"><Touch><Button icon={<PauseOutlined />}
              aria-label="Pausar transmissão" onClick={onPauseLive} /></Touch></Tooltip>)}
          <Tooltip title={micOn ? "Desligar microfone" : "Ligar microfone"}>
            <Touch><Button disabled={!localCanPublish} icon={micOn ? <AudioOutlined /> : <AudioMutedOutlined />}
              type={micOn ? "primary" : "default"} aria-label="Microfone" onClick={onToggleMic} /></Touch>
          </Tooltip>
          <Tooltip title={camOn ? "Desligar câmera" : "Ligar câmera"}>
            <Touch><Button disabled={!localCanPublish} icon={<VideoCameraOutlined />}
              type={camOn ? "primary" : "default"} aria-label="Câmera" onClick={onToggleCam} /></Touch>
          </Tooltip>

          <Popover {...popoverProps("clip")} trigger="click" placement="top" content={
            <div className="clip-menu">
              <div className="clip-title">Clipe instantâneo</div>
              <div className="clip-meta">{clipTargetName || "Nenhuma transmissão"}</div>
              {!clipEnabled ? (
                <>
                  <span className="clip-note">Grava continuamente no seu navegador enquanto estiver ativo. Usa CPU/GPU local; o consumo varia conforme o dispositivo.</span>
                  <Button block size="small" type="primary" onClick={onToggleClipBuffer}>Ativar buffer para esta tela</Button>
                </>
              ) : (
                <>
                  <div className="clip-meta">{clipBuffering
                    ? Math.min(45, clipReadySeconds) + "s disponíveis"
                    : (clipError ? "indisponível" : "preparando buffer")}</div>
                  <Button block size="small" loading={clipExporting} disabled={!clipBuffering || clipReadySeconds < 15 || clipExporting}
                    onClick={() => onSaveClip(15)}>Salvar últimos 15s</Button>
                  <Button block size="small" loading={clipExporting} disabled={!clipBuffering || clipReadySeconds < 30 || clipExporting}
                    onClick={() => onSaveClip(30)}>Salvar últimos 30s</Button>
                  <Button block size="small" onClick={onToggleClipBuffer}>Desligar buffer</Button>
                  {clipError && <span className="clip-note clip-error">{clipError}</span>}
                  {!clipSupported && !clipError && <span className="clip-note">Verificando o codificador do navegador…</span>}
                </>
              )}
            </div>
          }>
            <Tooltip title="Criar clipe"><Button icon={<ScissorOutlined />} disabled={!clipTargetName} aria-label="Criar clipe" /></Tooltip>
          </Popover>

          {isHost && (
            <Tooltip title={presenter ? "Liberar o destaque" : "Apresentar isto para todos"}>
              <Button type={presenter ? "primary" : "default"} icon={<PushpinOutlined />}
                aria-label={presenter ? "Liberar destaque" : "Apresentar"}
                disabled={!presenter && !presenterTarget}
                onClick={() => onSetPresenter(presenter ? null : presenterTarget)} />
            </Tooltip>
          )}
        </span>

        <span className="interaction-tools">
          <Tooltip title="Compartilhar ponteiro: aparece só dentro do vídeo ou quadro e some ao sair">
            <Button disabled={!localCanPublishData || !targetInteraction} type={interactionTool === "cursor" ? "primary" : "default"}
              icon={<PointerIcon />} aria-label="Compartilhar cursor" aria-pressed={interactionTool === "cursor"}
              onClick={() => { setPendingReaction(null); setInteractionTool(interactionTool === "cursor" ? null : "cursor"); }} />
          </Tooltip>
            <Tooltip title="Marcar um local: clique do meio ou segure o clique/toque. Sem mover a tela de ninguém.">
              <Button disabled={!localCanPublishData || !targetInteraction} type={interactionTool === "point" ? "primary" : "default"}
                icon={<AimOutlined />} aria-label="Marcar local (ping)" aria-pressed={interactionTool === "point"}
                onClick={() => { setPendingReaction(null); setMarkerStyle("ring"); setInteractionTool(interactionTool === "point" ? null : "point"); }} />
            </Tooltip>
          <Popover {...popoverProps("drawing")} trigger="click" placement="top" content={drawingInspector}>
            <Tooltip title="Ferramentas de desenho">
              <Button disabled={!localCanPublishData || !targetInteraction}
                type={interactionTool === "draw" ? "primary" : "default"}
                icon={brush.tool === "eraser" ? <ClearOutlined /> : <EditOutlined />}
                aria-label="Ferramentas de desenho" />
            </Tooltip>
          </Popover>
          <Popover {...popoverProps("reactions")} trigger="click" placement="top" content={
            <div className="reaction-menu">
              {REACTIONS.map(({ key, emoji, label }) => (
                <Tooltip key={key} title={label}>
                  <button className="reaction-button" aria-label={label} disabled={!targetInteraction || !localCanPublishData}
                    onClick={() => {
                      if (!targetInteraction) return;
                      onReaction(targetInteraction, key, {
                        x: 0.66 + Math.random() * 0.24,
                        y: 0.84 + Math.random() * 0.1
                      });
                      setPendingReaction(null);
                      if (interactionTool === "reaction") setInteractionTool(null);
                    }}>
                    <span className="reaction-emoji">{emoji}</span>
                  </button>
                </Tooltip>
              ))}
              <span className="reaction-hint">Um clique envia a reação para a área ativa.</span>
            </div>
          }>
            <Button aria-label="Reagir" disabled={!targetInteraction || !localCanPublishData}
              className="reaction-trigger"><span className="reaction-symbol">😊</span></Button>
          </Popover>
          <Tooltip title="Quadro compartilhado">
            <Button type={boardOpen ? "primary" : "default"} icon={<BorderOutlined />} aria-label="Quadro compartilhado"
              onClick={() => setBoardOpen(!boardOpen)} />
          </Tooltip>
          <Tooltip title="Chamar a galera pra ver o que você está mostrando">
            <Button icon={<NotificationOutlined />} aria-label="Olhem aqui" disabled={!targetInteraction || !localCanPublishData}
              onClick={() => targetInteraction && onCallAttention(targetInteraction, boardOpen ? "o quadro compartilhado" : (selTile ? selTile.name : ""))} />
          </Tooltip>
        </span>

        <span className="control-cluster app-controls">
          <Badge count={unreadChat} size="small" overflowCount={99}>
            <Tooltip title="Chat"><Button icon={<CommentOutlined />} type={chatOpen ? "primary" : "default"}
              aria-label="Chat" onClick={() => setChatOpen(true)} /></Tooltip>
          </Badge>
          <Tooltip title="Pessoas"><Button icon={<TeamOutlined />} aria-label="Pessoas"
            onClick={() => setConnectionsOpen(true)} /></Tooltip>
          <Tooltip title="Ajustes"><Button icon={<SettingOutlined />} aria-label="Ajustes"
            onClick={() => setSettingsOpen(true)} /></Tooltip>
          <Popover {...popoverProps("more")} trigger="click" placement="topRight" content={moreControls}>
            <Tooltip title="Mais opções"><Button icon={<EllipsisOutlined />} aria-label="Mais opções" /></Tooltip>
          </Popover>
        </span>
      </div>

      </ConfigProvider>

      <Drawer title="Pessoas" placement="right" open={connectionsOpen} onClose={() => setConnectionsOpen(false)} width={350}>
        {people.length === 0 && <Empty description="Ninguém por aqui" />}
        {people.map((person) => {
          const personSettings = getPersonSettings(peopleSettings, person.identity, person.rawName);
          return (
            <div className="person-card" key={person.key}>
              <div className="person-card-head">
                <span className="person-name">{person.name}</span>
                <span className="person-tags">
                  {person.identity === hostIdentity && <Tag color="gold" icon={<CrownOutlined />}>host</Tag>}
                  {!person.canPublish && <Tag icon={<EyeOutlined />}>espectador</Tag>}
                  <Tag color={QUALITY_COLOR[person.quality] || "default"} style={{ marginInlineEnd: 0 }}>
                    {QUALITY_LABELS[person.quality] || "..."}
                  </Tag>
                </span>
              </div>
              {!person.isLocal && (
                <>
                  <div className="person-controls">
                    <Tooltip title={personSettings.muted ? "Ouvir o microfone" : "Silenciar o microfone"}>
                      <Button size="small" type={personSettings.muted ? "primary" : "default"}
                        icon={personSettings.muted ? <AudioMutedOutlined /> : <AudioOutlined />}
                        onClick={() => onPersonSetting(person.identity, { muted: !personSettings.muted })} />
                    </Tooltip>
                    <Tooltip title={personSettings.cameraHidden ? "Mostrar a câmera" : "Esconder a câmera"}>
                      <Button size="small" type={personSettings.cameraHidden ? "primary" : "default"}
                        icon={personSettings.cameraHidden ? <EyeInvisibleOutlined /> : <VideoCameraAddOutlined />}
                        onClick={() => onPersonSetting(person.identity, { cameraHidden: !personSettings.cameraHidden })} />
                    </Tooltip>
                    <Tooltip title={personSettings.interactionsHidden ? "Voltar a ver interações" : "Esconder interações desta pessoa"}>
                      <Button size="small" type={personSettings.interactionsHidden ? "primary" : "default"}
                        icon={<MessageOutlined />}
                        onClick={() => onPersonSetting(person.identity, { interactionsHidden: !personSettings.interactionsHidden })} />
                    </Tooltip>
                  </div>
                  <div className="person-volume">
                    <span>Volume</span>
                    <Slider min={0} max={100} value={personSettings.volume} style={{ flex: 1, margin: 0 }}
                      tooltip={{ formatter: (value) => value + "%" }}
                      onChange={(value) => onPersonSetting(person.identity, { volume: value })} />
                  </div>
                  <div className="person-state">
                    {personSettings.muted && "microfone silenciado"}
                    {personSettings.muted && personSettings.cameraHidden && " · "}
                    {personSettings.cameraHidden && "câmera escondida"}
                    {(personSettings.muted || personSettings.cameraHidden) && personSettings.interactionsHidden && " · "}
                    {personSettings.interactionsHidden && "interações escondidas"}
                    {!personSettings.muted && !personSettings.cameraHidden && !personSettings.interactionsHidden && "recebendo tudo"}
                  </div>
                  {isHost && (
                    <div className="host-person-controls">
                      <div className="drawer-row"><span>Pode usar câmera/mic/tela</span>
                        <Switch checked={person.canPublish} onChange={(value) => onSetParticipantPermission(person.identity, { canPublish: value })} /></div>
                      <div className="drawer-row"><span>Pode usar chat/quadro/interações</span>
                        <Switch checked={person.canPublishData} onChange={(value) => onSetParticipantPermission(person.identity, { canPublishData: value })} /></div>
                      <Button danger size="small" icon={<UserDeleteOutlined />} onClick={() => onKickParticipant(person.identity)}>Remover da sala</Button>
                    </div>
                  )}
                  {!isHost && person.identity !== hostIdentity && (
                    <div className="vote-kick-control">
                      <span>Votação válida só nesta sessão. Não bloqueia a pessoa de entrar novamente.</span>
                      <Button danger size="small" icon={<UserDeleteOutlined />}
                        loading={voteKickBusy === person.identity}
                        disabled={!!voteKickBusy}
                        onClick={async () => {
                          setVoteKickBusy(person.identity);
                          try { await onVoteKickParticipant(person.identity); }
                          finally { setVoteKickBusy(""); }
                        }}>
                        Votar para remover
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        <p className="drawer-note">Silenciar o microfone ou esconder a câmera de alguém cancela a inscrição daquela faixa, reduzindo o tráfego recebido. Votekick exige maioria, expira em 90 segundos e nunca vira ban permanente.</p>
      </Drawer>

      <Drawer title="Chat da sala" placement="right" open={chatOpen} onClose={() => setChatOpen(false)} width={390}>
        <div className="chat-list">
          {(!chatMessages || chatMessages.length === 0) && (
            <Empty description="Nada no chat ainda" />
          )}
          {(chatMessages || []).map((item) => (
            <div className={"chat-message" + (item.mine ? " mine" : "")} key={item.id}>
              <div className="chat-meta">
                <strong>{item.mine ? "Você" : item.author}</strong>
                <span>{item.at ? new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
              </div>
              {item.kind === "text" ? (
                <ChatText text={item.text} />
              ) : item.kind === "file" && item.file ? (
                <div className="chat-file">
                  {item.file.type && item.file.type.startsWith("image/") && item.file.url && (
                    <a href={item.file.url} target="_blank" rel="noreferrer">
                      <img src={item.file.url} alt={item.file.name || "Imagem compartilhada"} loading="lazy" />
                    </a>
                  )}
                  <a className="chat-file-link" href={item.file.url} target="_blank" rel="noreferrer">
                    <UploadOutlined />
                    <span>
                      <b>{item.file.name || "arquivo"}</b>
                      <small>{item.file.size ? (item.file.size / 1024 / 1024).toFixed(item.file.size >= 1024 * 1024 ? 1 : 2) + " MB" : "arquivo temporário"}</small>
                    </span>
                  </a>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="chat-composer">
          <Input.TextArea
            value={chatDraft}
            disabled={!localCanPublishData}
            placeholder={localCanPublishData ? "Escreva uma mensagem…" : "O host desativou seu chat e suas interações."}
            maxLength={600}
            autoSize={{ minRows: 2, maxRows: 5 }}
            onChange={(event) => setChatDraft(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                submitChat();
              }
            }}
          />
          <input ref={fileInputRef} className="chat-file-input" type="file" onChange={chooseFile} />
          <div className="chat-actions">
            <Button icon={<UploadOutlined />} disabled={!localCanPublishData}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}>
              Arquivo
            </Button>
            <Button type="primary" disabled={!localCanPublishData || !chatDraft.trim()} onClick={submitChat}>
              Enviar
            </Button>
          </div>
        </div>
        <p className="drawer-note">O chat fica só nesta sessão. Arquivos são temporários, têm limite de 8 MB e expiram automaticamente.</p>
      </Drawer>

      <Drawer title="Ajustes" placement="right" open={settingsOpen} onClose={() => setSettingsOpen(false)} width={340}>
        <div className="drawer-group">
          <span className="drawer-title">Aparência</span>
          <div className="drawer-row"><span>Tema</span>
            <Segmented value={theme.pref} onChange={(value) => theme.setPref(value)}
              options={[
                { value: "auto", label: "Auto" },
                { value: "claro", label: "Claro" },
                { value: "escuro", label: "Escuro" }
              ]} /></div>
        </div>
        <div className="drawer-group">
          <span className="drawer-title">Sala</span>
          <div className="drawer-row"><span>Nome</span><span className="drawer-value">{currentRoom || "geral"}</span></div>
          <div className="drawer-row"><span>Seu papel</span>
            <span className="drawer-value">{isHost ? "Host" : (roomRole === "spectator" || !localCanPublish ? "Espectador" : "Participante")}</span>
          </div>
          <div className="drawer-row"><span>Modo da sala</span>
            {isHost ? (
              <Select value={roomPreset} options={PRESET_OPTIONS} style={{ width: 155 }} onChange={onSetRoomPreset} />
            ) : (
              <span className="drawer-value">{ROOM_PRESETS[roomPreset]?.label || "Livre"}</span>
            )}
          </div>
          {isHost ? (
            <div className="host-room-controls">
              <span className="host-room-help">O PIN vale para novas entradas enquanto este container estiver rodando.</span>
              <Input.Password value={pinDraft} maxLength={24} placeholder={roomLocked ? "Novo PIN" : "Definir PIN"}
                onChange={(event) => setPinDraft(event.target.value)}
                onPressEnter={async () => {
                  if (!pinDraft.trim()) return;
                  if (await onSetRoomPin(pinDraft)) setPinDraft("");
                }} />
              <div className="host-room-actions">
                <Button type="primary" icon={<LockOutlined />} disabled={!pinDraft.trim()} onClick={async () => {
                  if (await onSetRoomPin(pinDraft)) setPinDraft("");
                }}>
                  {roomLocked ? "Trocar PIN" : "Bloquear sala"}
                </Button>
                {roomLocked && (
                  <Button icon={<UnlockOutlined />} onClick={async () => {
                    if (await onSetRoomPin("")) setPinDraft("");
                  }}>Remover PIN</Button>
                )}
              </div>
            </div>
          ) : (
            <div className="drawer-row"><span>Entrada</span><span className="drawer-value">{roomLocked ? "Protegida por PIN" : "Livre"}</span></div>
          )}
        </div>
        <div className="drawer-group">
          <span className="drawer-title">Sua transmissão</span>
          <div className="drawer-row" style={{ display: "block" }}>
            <span style={{ display: "block", marginBottom: 8 }}>Título (aparece pra quem assiste)</span>
            <Input value={titleLocal} placeholder="Ex: Elden Ring co-op" maxLength={80} disabled={!localCanPublish}
              onChange={(event) => setTitleLocal(event.target.value)}
              onBlur={() => onLiveTitle(titleLocal)}
              onPressEnter={() => onLiveTitle(titleLocal)} />
          </div>
          <div className="drawer-row"><span>Situação</span>
            <span className="drawer-value">
              {!isLive ? "Fora do ar"
                : (myState.estado === "pausado" ? "Em pausa"
                  : "Ao vivo · " + fmtDuration(nowDrawer - myState.desde))}
            </span></div>
          <div className="drawer-row"><span>Assistindo agora</span>
            <span className="drawer-value">{people.length}</span></div>
          <div className="drawer-row" style={{ borderTop: 0, paddingTop: 4 }}>
            <Button icon={<LinkOutlined />} block onClick={onCopyLink}>Copiar link da sala</Button></div>
        </div>
        <div className="drawer-group">
          <span className="drawer-title">Quando eu compartilho</span>
          <div className="drawer-row"><span>Enviar áudio do sistema</span>
            <Switch disabled={!localCanPublish} checked={settings.audioOnShare} onChange={(value) => setSettings((current) => ({ ...current, audioOnShare: value }))} /></div>
          <div className="drawer-row"><span>Qualidade que eu envio</span>
            <Select disabled={!localCanPublish} value={settings.sendQuality} options={SEND_OPTIONS} style={{ width: 165 }}
              onChange={(value) => setSettings((current) => ({ ...current, sendQuality: value }))} /></div>
          <div className="drawer-row"><span>Tipo de conteúdo</span>
            <Select disabled={!localCanPublish} value={settings.shareContent} options={CONTENT_OPTIONS} style={{ width: 180 }}
              onChange={(value) => setSettings((current) => ({ ...current, shareContent: value }))} /></div>
          <span className="host-room-help">Movimento preserva fluidez. Detalhes prioriza a nitidez de texto, código e apresentações quando a rede oscilar.</span>
        </div>
        <div className="drawer-group">
          <span className="drawer-title">Quando eu assisto</span>
          <div className="drawer-row"><span>Qualidade que eu recebo</span>
            <Select value={settings.receiveQuality} options={RECEIVE_OPTIONS} style={{ width: 150 }}
              onChange={(value) => setSettings((current) => ({ ...current, receiveQuality: value }))} /></div>
          <div className="drawer-row"><span>Iniciar transmissões mutadas</span>
            <Switch checked={settings.startMuted} onChange={(value) => setSettings((current) => ({ ...current, startMuted: value }))} /></div>
          <div className="drawer-row"><span>Silenciar todo o áudio</span>
            <Switch checked={settings.muteAll} onChange={(value) => setSettings((current) => ({ ...current, muteAll: value }))} /></div>
          <div className="drawer-row"><span>Receber apontamentos e reações</span>
            <Switch checked={settings.interactionsEnabled}
              onChange={(value) => setSettings((current) => ({ ...current, interactionsEnabled: value }))} /></div>
          <div className="drawer-row"><span>Mostrar pings e cursores</span>
            <Switch aria-label="Mostrar pings e cursores" disabled={!settings.interactionsEnabled} checked={settings.pointersEnabled !== false}
              onChange={(value) => setSettings((current) => ({ ...current, pointersEnabled: value }))} /></div>
          <span className="host-room-help">Preferência só sua. Oculta os apontadores sem esconder desenhos e reações.</span>
        </div>
        <div className="drawer-group">
          <span className="drawer-title">Atalhos</span>
          <div className="drawer-row"><span>Tela cheia do PC</span><kbd>F</kbd></div>
          <div className="drawer-row"><span>Modo teatro</span><kbd>T</kbd></div>
          <div className="drawer-row"><span>Esconder os controles</span><kbd>H</kbd></div>
          <div className="drawer-row"><span>Silenciar todo o áudio</span><kbd>M</kbd></div>
          <div className="drawer-row"><span>Escolher transmissão</span><span><kbd>1</kbd>–<kbd>9</kbd></span></div>
          <div className="drawer-row"><span>Volume da transmissão</span><span><kbd>↑</kbd> <kbd>↓</kbd></span></div>
          <div className="drawer-row"><span>Voltar ao padrão</span><kbd>Esc</kbd></div>
        </div>
        <p className="drawer-note">Desligar o áudio do sistema evita puxar a voz do Discord pra dentro da transmissão.</p>
      </Drawer>
    </div>
  );
}
