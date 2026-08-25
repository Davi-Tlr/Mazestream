import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { LayoutGroup, AnimatePresence, motion } from "framer-motion";
import { Button, Drawer, Switch, Select, Segmented, Input, Slider, Tag, Empty, Tooltip, Popover, Badge } from "antd";
import {
  DesktopOutlined, StopOutlined, AudioOutlined, AudioMutedOutlined,
  VideoCameraOutlined, VideoCameraAddOutlined, SettingOutlined, TeamOutlined, LogoutOutlined,
  AppstoreOutlined, PicCenterOutlined, ExpandOutlined, FullscreenOutlined,
  PauseOutlined, CaretRightOutlined, LinkOutlined, AimOutlined, EditOutlined,
  ClearOutlined, BorderOutlined, NotificationOutlined, DeleteOutlined,
  EyeOutlined, EyeInvisibleOutlined, MessageOutlined, DownOutlined, UpOutlined,
  CommentOutlined, UploadOutlined, CrownOutlined, PushpinOutlined, ScissorOutlined,
  LockOutlined, UnlockOutlined, UserDeleteOutlined, DragOutlined, ArrowRightOutlined
} from "@ant-design/icons";
import VideoTile from "./VideoTile.jsx";
import AudioSink from "./AudioSink.jsx";
import SharedBoard from "./SharedBoard.jsx";
import { Sun, Moon, REACTIONS } from "./icons.jsx";
import { useTheme } from "../theme.jsx";
import { fmtDuration } from "../state.js";
import { volumeKey, getPersonSettings } from "../collect.js";
import { DRAW_COLORS, DRAW_WIDTHS, MARKER_STYLES } from "../interactions.js";
import { ROOM_PRESETS, PRESET_OPTIONS } from "../roomFeatures.js";
import { SEND_OPTIONS, RECEIVE_OPTIONS, MAX_SCREENS, QUALITY_LABELS } from "../constants.js";

const STATUS_MAP = {
  idle: ["Conectando", "reconnecting"], connecting: ["Conectando", "reconnecting"],
  connected: ["Conectado", "connected"], reconnecting: ["Reconectando", "reconnecting"],
  disconnected: ["Desconectado", "disconnected"]
};
const QUALITY_COLOR = { excellent: "success", good: "green", poor: "warning", lost: "error", unknown: "default" };

function Touch({ children }) {
  return (
    <motion.span style={{ display: "inline-flex" }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }}>
      {children}
    </motion.span>
  );
}

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

const MemoTile = memo(function MemoTile(props) {
  return <VideoTile {...props} />;
});

export default function RoomView(props) {
  const {
    tiles, audios, people, screenCount, totalScreenCount, connState,
    selected, setSelected, volumes, setVolumes,
    settings, setSettings, peopleSettings, onPersonSetting,
    isHost, hostIdentity, roomRole, roomPreset, roomLocked, presenter,
    localCanPublish, localCanPublishData,
    chatMessages, onSendChat, onShareFile,
    onSetRoomPin, onSetRoomPreset, onSetPresenter, onSetParticipantPermission, onKickParticipant,
    clipSupported, clipBuffering, clipReadySeconds, clipTargetName, onSaveClip,
    micOn, camOn, currentRoom, myState,
    audioBlocked, onEnableAudio,
    interactions, interactionTool, setInteractionTool,
    markerStyle, setMarkerStyle, pendingReaction, setPendingReaction,
    brush, setBrush,
    onPing, onCursor, onStroke, onReaction,
    boardOpen, setBoardOpen, boardStrokes, onBoardStroke, onBoardErase, onBoardClear,
    attentionRequest, setAttentionRequest, onCallAttention,
    onShare, onStopBroadcast, onStopAll,
    onPauseLive, onResumeLive, onLiveTitle, onCopyLink,
    onToggleMic, onToggleCam, onLeave
  } = props;

  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [unreadChat, setUnreadChat] = useState(0);
  const [pinDraft, setPinDraft] = useState("");
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
  const [idleFullscreen, setIdleFullscreen] = useState(false);
  const roomRef = useRef(null);
  const theme = useTheme();

  const [nowDrawer, setNowDrawer] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowDrawer(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
    if (!boardOpen && interactionTool === "eraser") setInteractionTool(null);
  }, [boardOpen, interactionTool, setInteractionTool]);

  useEffect(() => {
    if (localCanPublishData) return;
    setInteractionTool(null);
    setPendingReaction(null);
  }, [localCanPublishData, setInteractionTool, setPendingReaction]);

  const isLive = myState && (myState.estado === "ao_vivo" || myState.estado === "pausado");
  const isFullscreenMode = layoutMode === "fullscreen-app" || layoutMode === "fullscreen-pc";

  useEffect(() => {
    function onFs() {
      if (!document.fullscreenElement) {
        setLayoutMode((mode) => (mode === "fullscreen-pc" ? "default" : mode));
      }
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!isFullscreenMode) { setIdleFullscreen(false); return; }
    let timeout = window.setTimeout(() => setIdleFullscreen(true), 2600);
    function wakeHud() {
      setIdleFullscreen(false);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setIdleFullscreen(true), 2600);
    }
    window.addEventListener("mousemove", wakeHud);
    window.addEventListener("touchstart", wakeHud);
    window.addEventListener("keydown", wakeHud);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("mousemove", wakeHud);
      window.removeEventListener("touchstart", wakeHud);
      window.removeEventListener("keydown", wakeHud);
    };
  }, [isFullscreenMode]);

  const hudVisible = hudEnabled && !(isFullscreenMode && idleFullscreen);

  const goFullscreen = useCallback(async () => {
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
  const boardInteractions = useMemo(() => interactions.filter((item) => item.tile === "board"), [interactions]);

  const volCurrent = useCallback((key) => volumes[key] || { value: 100, muted: !!settings.startMuted }, [volumes, settings.startMuted]);
  const setVol = useCallback((key, pct) => setVolumes((previous) => ({ ...previous, [key]: { value: pct, muted: false } })), [setVolumes]);
  const toggleMute = useCallback((key) => {
    setVolumes((previous) => {
      const current = previous[key] || { value: 100, muted: false };
      return { ...previous, [key]: { value: current.value, muted: !current.muted } };
    });
  }, [setVolumes]);

  useEffect(() => {
    function onKey(event) {
      const el = event.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key === "f") { event.preventDefault(); goFullscreen(); }
      else if (key === "t") { event.preventDefault(); switchMode(layoutMode === "theater" ? "default" : "theater"); }
      else if (key === "m") { event.preventDefault(); setSettings((current) => ({ ...current, muteAll: !current.muteAll })); }
      else if (key === "h") { event.preventDefault(); setHudEnabled((value) => !value); }
      else if (key >= "1" && key <= "9") {
        const tile = tiles[Number(key) - 1];
        if (tile) { event.preventDefault(); setBoardOpen(false); setSelected(tile.key); }
      } else if (key === "arrowup" || key === "arrowdown") {
        if (!selTile || !selTile.isScreen || selTile.isLocal || boardOpen) return;
        event.preventDefault();
        const volumeKeyCurrent = volumeKey(selTile.sid, selTile.pubName);
        const current = volCurrent(volumeKeyCurrent);
        const step = key === "arrowup" ? 10 : -10;
        setVol(volumeKeyCurrent, Math.max(0, Math.min(150, (current.muted ? 0 : current.value) + step)));
      } else if (key === "escape" && !document.fullscreenElement && layoutMode !== "default") {
        setLayoutMode("default");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goFullscreen, switchMode, layoutMode, setSettings, tiles, selTile, boardOpen, volCurrent, setVol, setBoardOpen, setSelected]);

  const renderTile = useCallback((tile, highlighted) => {
    const volKey = volumeKey(tile.sid, tile.pubName);
    return (
      <MemoTile
        key={tile.key}
        tile={tile}
        destaque={highlighted}
        agora={0}
        onSelect={(key) => { setBoardOpen(false); setSelected(key); }}
        mostrarVolume={highlighted && tile.isScreen && !tile.isLocal}
        volume={volCurrent(volKey)}
        onVolume={(value) => setVol(volKey, value)}
        onMute={() => toggleMute(volKey)}
        onParar={onStopBroadcast}
        interactions={highlighted ? interactions.filter((item) => item.tile === tile.key) : []}
        interactionTool={highlighted ? interactionTool : null}
        markerStyle={markerStyle}
        pendingReaction={pendingReaction}
        brush={brush}
        onPing={(point, marker) => onPing(tile.key, point, marker)}
        onCursor={(point) => onCursor(tile.key, point)}
        onStroke={(points, color, width) => onStroke(tile.key, points, color, width)}
        onReactionAt={(point, reaction) => onReaction(tile.key, reaction, point)}
      />
    );
  }, [setBoardOpen, setSelected, volCurrent, setVol, toggleMute, onStopBroadcast, interactions, interactionTool, markerStyle, pendingReaction, brush, onPing, onCursor, onStroke, onReaction]);

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

  const markerLabels = { ring: "Círculo", arrow: "Seta", "1": "Número 1", "2": "Número 2", "3": "Número 3" };

  return (
    <div className="room" data-mode={layoutMode} data-hud={hudVisible ? "on" : "off"} ref={roomRef}>
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
          <LiveTimer desde={myState && myState.desde} estado={myState && myState.estado} />
          {myState && myState.estado === "pausado" && (
            <span className="live-pill paused"><PauseOutlined /> EM PAUSA</span>
          )}
          <span className="viewers"><TeamOutlined /> {people.length}</span>
          <b>{(totalScreenCount !== undefined ? totalScreenCount : screenCount)} ao vivo</b>
        </div>
      </header>

      <div className="content">
        <Tooltip title={hudVisible ? "Esconder controles (H)" : "Mostrar controles (H)"} placement="left">
          <Button className="hud-toggle" size="small" icon={hudVisible ? <DownOutlined /> : <UpOutlined />}
            aria-label={hudVisible ? "Esconder controles" : "Mostrar controles"}
            onClick={() => setHudEnabled((value) => !value)} />
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
                onStroke={onBoardStroke}
                onErase={onBoardErase}
                onPing={(point, marker) => onPing("board", point, marker)}
                onCursor={(point) => onCursor("board", point)}
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
          personVolume={getPersonSettings(peopleSettings, audio.owner).volume} />
      ))}

      <div className="toolbar">
        <Touch><Button type="primary" icon={<DesktopOutlined />} disabled={!localCanPublish || screenCount >= MAX_SCREENS} onClick={onShare}>
          {!localCanPublish ? "Modo espectador" : (screenCount === 0 ? "Compartilhar tela" : (screenCount === 1 ? "Compartilhar outra" : "Limite atingido"))}
        </Button></Touch>
        <Touch><Button icon={<StopOutlined />} danger disabled={!localCanPublish || screenCount === 0} onClick={onStopAll}>
          {screenCount > 1 ? "Parar tudo" : "Parar"}
        </Button></Touch>
        {screenCount > 0 && localCanPublish && (myState && myState.estado === "pausado"
          ? <Touch><Button icon={<CaretRightOutlined />} type="primary" onClick={onResumeLive}>Retomar</Button></Touch>
          : <Touch><Button icon={<PauseOutlined />} onClick={onPauseLive}>Pausar</Button></Touch>)}
        <Touch><Button disabled={!localCanPublish} icon={micOn ? <AudioOutlined /> : <AudioMutedOutlined />} type={micOn ? "primary" : "default"} onClick={onToggleMic}>Microfone</Button></Touch>
        <Touch><Button disabled={!localCanPublish} icon={<VideoCameraOutlined />} type={camOn ? "primary" : "default"} onClick={onToggleCam}>Câmera</Button></Touch>

        <Popover trigger="click" placement="top" content={
          <div className="clip-menu">
            <div className="clip-title">Clipe instantâneo</div>
            <div className="clip-meta">{clipTargetName || "Nenhuma transmissão"} · {clipBuffering ? Math.min(45, clipReadySeconds) + "s disponíveis" : "parado"}</div>
            <Button block size="small" disabled={!clipBuffering || clipReadySeconds < 5} onClick={() => onSaveClip(15)}>Salvar últimos 15s</Button>
            <Button block size="small" disabled={!clipBuffering || clipReadySeconds < 5} onClick={() => onSaveClip(30)}>Salvar últimos 30s</Button>
            {!clipSupported && <span className="clip-note">Seu navegador não oferece gravação de clipes.</span>}
          </div>
        }>
          <Button icon={<ScissorOutlined />} disabled={!clipSupported || !clipTargetName}>Clipe</Button>
        </Popover>

        {isHost && (
          <Tooltip title={presenter ? "Liberar o destaque para cada pessoa escolher" : "Fixar o que você está vendo para todos"}>
            <Button type={presenter ? "primary" : "default"} icon={<PushpinOutlined />}
              disabled={!presenter && !presenterTarget}
              onClick={() => onSetPresenter(presenter ? null : presenterTarget)}>
              {presenter ? "Liberar destaque" : "Apresentar"}
            </Button>
          </Tooltip>
        )}

        <span className="interaction-tools">
          <Tooltip title="Mostrar seu cursor para a sala">
            <Button disabled={!localCanPublishData || !targetInteraction} type={interactionTool === "cursor" ? "primary" : "default"}
              icon={<DragOutlined />} aria-label="Compartilhar cursor"
              onClick={() => { setPendingReaction(null); setInteractionTool(interactionTool === "cursor" ? null : "cursor"); }} />
          </Tooltip>
          <Popover trigger="click" placement="top" content={
            <div className="marker-menu">
              {MARKER_STYLES.map((marker) => (
                <Button key={marker} size="small" type={markerStyle === marker && interactionTool === "point" ? "primary" : "default"}
                  onClick={() => { setPendingReaction(null); setMarkerStyle(marker); setInteractionTool("point"); }}>
                  {marker === "ring" ? <AimOutlined /> : marker === "arrow" ? <ArrowRightOutlined /> : marker}
                  <span>{markerLabels[marker]}</span>
                </Button>
              ))}
            </div>
          }>
            <Tooltip title="Marcador temporário">
              <Button disabled={!localCanPublishData || !targetInteraction} type={interactionTool === "point" ? "primary" : "default"}
                icon={<AimOutlined />} aria-label="Marcador" />
            </Tooltip>
          </Popover>
          <Tooltip title="Desenhar">
            <Button disabled={!localCanPublishData || !targetInteraction} type={interactionTool === "draw" ? "primary" : "default"} icon={<EditOutlined />}
              aria-label="Desenhar" onClick={() => { setPendingReaction(null); setInteractionTool(interactionTool === "draw" ? null : "draw"); }} />
          </Tooltip>
          <Tooltip title="Borracha do quadro">
            <Button disabled={!localCanPublishData || !boardOpen} type={interactionTool === "eraser" ? "primary" : "default"} icon={<ClearOutlined />}
              aria-label="Borracha" onClick={() => { setPendingReaction(null); setInteractionTool(interactionTool === "eraser" ? null : "eraser"); }} />
          </Tooltip>
          <Popover trigger="click" placement="top" content={
            <div className="reaction-menu">
              {REACTIONS.map(({ key, Icon, label }) => (
                <Tooltip key={key} title={label}>
                  <button className="reaction-button" aria-label={label} disabled={!targetInteraction || !localCanPublishData}
                    onClick={() => { setPendingReaction(key); setInteractionTool("reaction"); }}><Icon /></button>
                </Tooltip>
              ))}
              <span className="reaction-hint">Escolha e clique onde a reação deve aparecer.</span>
            </div>
          }>
            <Button aria-label="Reagir" disabled={!targetInteraction || !localCanPublishData}
              type={interactionTool === "reaction" ? "primary" : "default"} className="reaction-trigger"><span className="reaction-symbol">♥</span></Button>
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

        {localCanPublishData && (interactionTool === "draw" || boardOpen) && (
          <span className="brush-tools">
            {DRAW_COLORS.map((color) => (
              <button key={color} className={"brush-color" + (brush.color === color ? " active" : "")}
                style={{ "--brush-color": color }} aria-label={"Cor " + color}
                onClick={() => setBrush({ ...brush, color })} />
            ))}
            {DRAW_WIDTHS.map((width) => (
              <button key={width} className={"brush-width" + (brush.width === width ? " active" : "")}
                aria-label={"Espessura " + width} onClick={() => setBrush({ ...brush, width })}>
                <span style={{ width: width + 4, height: width + 4 }} />
              </button>
            ))}
            {boardOpen && (
              <Tooltip title="Limpar o quadro">
                <Button icon={<DeleteOutlined />} aria-label="Limpar o quadro" disabled={!localCanPublishData} onClick={onBoardClear} />
              </Tooltip>
            )}
          </span>
        )}

        <span className="spacer" />

        <span className="modes">
          {layoutBtns.map((button) => (
            <Touch key={button.mode}>
              <Tooltip title={button.title}>
                <Button type={layoutMode === button.mode ? "primary" : "default"} icon={button.icon}
                  aria-label={button.title} onClick={() => switchMode(button.mode)} />
              </Tooltip>
            </Touch>
          ))}
        </span>

        <span className={"status " + statusClass}>{statusText}</span>
        <Touch>
          <Tooltip title={theme.dark ? "Tema claro" : "Tema escuro"}>
            <Button className="theme-btn" aria-label="Alternar tema"
              icon={theme.dark ? <Sun /> : <Moon />} onClick={theme.toggle} />
          </Tooltip>
        </Touch>
        <Touch><Tooltip title="Copiar link da sala"><Button icon={<LinkOutlined />} onClick={onCopyLink}>Convidar</Button></Tooltip></Touch>
        <Badge count={unreadChat} size="small" overflowCount={99}>
          <Button icon={<CommentOutlined />} type={chatOpen ? "primary" : "default"} onClick={() => setChatOpen(true)}>Chat</Button>
        </Badge>
        <Touch><Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>Ajustes</Button></Touch>
        <Touch><Button icon={<TeamOutlined />} onClick={() => setConnectionsOpen(true)}>Pessoas</Button></Touch>
        <Touch><Button icon={<LogoutOutlined />} onClick={onLeave}>Sair</Button></Touch>
      </div>

      <Drawer title="Pessoas" placement="right" open={connectionsOpen} onClose={() => setConnectionsOpen(false)} width={350}>
        {people.length === 0 && <Empty description="Ninguém por aqui" />}
        {people.map((person) => {
          const personSettings = getPersonSettings(peopleSettings, person.rawName);
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
                        onClick={() => onPersonSetting(person.rawName, { muted: !personSettings.muted })} />
                    </Tooltip>
                    <Tooltip title={personSettings.cameraHidden ? "Mostrar a câmera" : "Esconder a câmera"}>
                      <Button size="small" type={personSettings.cameraHidden ? "primary" : "default"}
                        icon={personSettings.cameraHidden ? <EyeInvisibleOutlined /> : <VideoCameraAddOutlined />}
                        onClick={() => onPersonSetting(person.rawName, { cameraHidden: !personSettings.cameraHidden })} />
                    </Tooltip>
                    <Tooltip title={personSettings.interactionsHidden ? "Voltar a ver interações" : "Esconder interações desta pessoa"}>
                      <Button size="small" type={personSettings.interactionsHidden ? "primary" : "default"}
                        icon={<MessageOutlined />}
                        onClick={() => onPersonSetting(person.rawName, { interactionsHidden: !personSettings.interactionsHidden })} />
                    </Tooltip>
                  </div>
                  <div className="person-volume">
                    <span>Volume</span>
                    <Slider min={0} max={150} value={personSettings.volume} style={{ flex: 1, margin: 0 }}
                      tooltip={{ formatter: (value) => value + "%" }}
                      onChange={(value) => onPersonSetting(person.rawName, { volume: value })} />
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
                </>
              )}
            </div>
          );
        })}
        <p className="drawer-note">Silenciar o microfone ou esconder a câmera de alguém cancela a inscrição daquela faixa, reduzindo o tráfego recebido. A transmissão de tela da pessoa não é afetada.</p>
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
