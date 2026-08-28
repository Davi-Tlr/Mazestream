import { lazy, Suspense, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { App as AntApp } from "antd";
import { Track, RoomEvent } from "livekit-client";
import { useRoom } from "../hooks/useRoom.js";
import {
  useCollectTiles, useCollectAudios, useCollectPeople,
  getPersonSettings, getParticipantName
} from "../features/room/collect.js";
import { readState, buildState } from "../features/room/state.js";
import { useScreenShare } from "../hooks/useScreenShare.js";
import { useBoard } from "../hooks/useBoard.js";
import { applyReceiveQuality } from "../features/room/receiveQuality.js";
import { DEFAULT_SETTINGS } from "../config/constants.js";
import { useClipBuffer } from "../hooks/useClipBuffer.js";
import {
  ROOM_TOPIC, ROOM_PRESETS, encodeRoomData, decodeRoomData, newRoomMessageId,
  sanitizeChatText, sanitizeFileMeta, normalizePresenter, presenterMatchesTile, normalizeRoomName
} from "../features/room/roomFeatures.js";
import {
  INTERACTION_TOPIC, prepareInteractionPublication, decodeInteraction, newInteractionId,
  INTERACTION_LIFETIME, DRAW_COLORS, DRAW_WIDTHS,
  sanitizeDrawAction,
  REACTION_EMOJIS, REACTION_TO_WIRE, REACTION_FROM_WIRE, LEGACY_TYPE_MAP, MARKER_STYLES
} from "../features/interactions/interactions.js";
import JoinScreen from "../components/JoinScreen.jsx";
import { createCursorPublisher, createRemoteCursorStore } from "../features/interactions/sharedCursor.js";
import { SharedCursorContext } from "../features/interactions/sharedCursorContext.js";
import { createPingGate, mergeTransientInteraction } from "../features/interactions/pingPolicy.js";

// The login screen does not need the full room toolbar, Konva board or motion
// components. Keep that surface in a deferred chunk so first paint stays light.
const RoomView = lazy(() => import("../components/RoomView.jsx"));

const OLD_QUALITY_MAP = { alta: "high", media: "medium", baixa: "low", auto: "auto" };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("ajustes") || "{}");
    const savedVersion = Number(saved.configVersion) || 0;
    const savedQuality = saved.sendQuality || OLD_QUALITY_MAP[saved.qualidadeEnvio];
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      configVersion: DEFAULT_SETTINGS.configVersion,
      audioOnShare: saved.audioOnShare ?? saved.audioAoCompartilhar ?? DEFAULT_SETTINGS.audioOnShare,
      sendQuality: savedVersion >= 4 && savedQuality ? savedQuality : DEFAULT_SETTINGS.sendQuality,
      shareContent: ["motion", "detail"].includes(saved.shareContent) ? saved.shareContent : DEFAULT_SETTINGS.shareContent,
      receiveQuality: saved.receiveQuality || OLD_QUALITY_MAP[saved.qualidadeRecebo] || DEFAULT_SETTINGS.receiveQuality,
      muteAll: saved.muteAll ?? saved.silenciarTudo ?? DEFAULT_SETTINGS.muteAll,
      startMuted: saved.startMuted ?? saved.iniciarMutado ?? DEFAULT_SETTINGS.startMuted,
      interactionsEnabled: saved.interactionsEnabled ?? saved.interacoesLigadas ?? DEFAULT_SETTINGS.interactionsEnabled
    };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function loadPeopleSettings() {
  try {
    const current = JSON.parse(localStorage.getItem("peopleSettings") || "null");
    if (current && typeof current === "object") return current;
    const old = JSON.parse(localStorage.getItem("pessoasCfg") || "{}");
    const migrated = {};
    Object.entries(old || {}).forEach(([name, value]) => {
      migrated[name] = {
        muted: !!value.mudo,
        cameraHidden: !!value.semCamera,
        interactionsHidden: !!value.semInteracao,
        volume: typeof value.volume === "number" ? value.volume : 100
      };
    });
    return migrated;
  } catch (e) {
    return {};
  }
}

async function fetchWithTimeout(input, init = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export default function App() {
  const { message } = AntApp.useApp();
  const {
    roomRef, connState, connect, disconnect,
    trackVer, partVer, metaVer, qualityVer, permissionVer,
    audioBlocked, enableAudio, lastError
  } = useRoom();

  const [phase, setPhase] = useState("join");
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);
  const [currentRoom, setCurrentRoom] = useState("");
  const [settings, setSettings] = useState(loadSettings);
  const [peopleSettings, setPeopleSettings] = useState(loadPeopleSettings);
  const [volumes, setVolumes] = useState({});
  const [selected, setSelected] = useState(null);
  const [sessionKey, setSessionKey] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [roomRole, setRoomRole] = useState("participant");
  const [roomPreset, setRoomPreset] = useState("livre");
  const [roomLocked, setRoomLocked] = useState(false);
  const [presenter, setPresenter] = useState(null);
  const [hostIdentity, setHostIdentity] = useState("");
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => {
    try { localStorage.setItem("ajustes", JSON.stringify(settings)); } catch (e) {}
  }, [settings]);

  useEffect(() => {
    try { localStorage.setItem("peopleSettings", JSON.stringify(peopleSettings)); } catch (e) {}
  }, [peopleSettings]);

  const room = roomRef.current;
  const tiles = useCollectTiles(room, trackVer, metaVer, peopleSettings);
  const audios = useCollectAudios(room, trackVer);
  const people = useCollectPeople(room, partVer, metaVer, trackVer, qualityVer, permissionVer);
  const screenCount = useMemo(() => tiles.filter((tile) => tile.isLocal && tile.isScreen).length, [tiles]);
  const totalScreenCount = useMemo(() => tiles.filter((tile) => tile.isScreen).length, [tiles]);
  const myState = useMemo(() => readState(room ? room.localParticipant : null), [room, metaVer]);
  const localCanPublish = useMemo(() => !room || !room.localParticipant.permissions || room.localParticipant.permissions.canPublish !== false, [room, permissionVer]);
  const localCanPublishData = useMemo(() => !room || !room.localParticipant.permissions || room.localParticipant.permissions.canPublishData !== false, [room, permissionVer]);
  const micOn = !!room?.localParticipant.isMicrophoneEnabled;
  const camOn = !!room?.localParticipant.isCameraEnabled;

  useEffect(() => {
    if (lastError?.message) message.error(lastError.message);
  }, [lastError, message]);

  useEffect(() => {
    if (phase !== "room" || connState !== "disconnected") return;
    // LiveKit can end a session without the user clicking “Sair”. Return to
    // the login screen so a stale room view cannot keep accepting actions.
    setPhase("join");
    setCurrentRoom("");
    setSessionKey("");
    setIsHost(false);
    setRoomRole("participant");
    setRoomLocked(false);
    setPresenter(null);
    setHostIdentity("");
    setChatMessages([]);
    setSelected(null);
  }, [phase, connState]);

  // Per-person camera/microphone controls are real subscriptions, not just CSS.
  // Screen-share video/audio are intentionally never affected by these toggles.
  useEffect(() => {
    if (!room) return;
    room.remoteParticipants.forEach((participant) => {
      const name = getParticipantName(participant);
      const person = getPersonSettings(peopleSettings, participant.identity, name);
      participant.trackPublications.forEach((pub) => {
        if (!pub.setSubscribed) return;
        let wanted = null;
        if (pub.source === Track.Source.Camera) wanted = !person.cameraHidden;
        else if (pub.source === Track.Source.Microphone) wanted = !person.muted;
        if (wanted === null || pub.isSubscribed === wanted) return;
        try { pub.setSubscribed(wanted); } catch (e) {}
      });
    });
  }, [room, trackVer, peopleSettings]);

  const updatePersonSetting = useCallback((identity, patch) => {
    if (!identity) return;
    setPeopleSettings((previous) => ({
      ...previous,
      [identity]: { ...getPersonSettings(previous, identity), ...patch }
    }));
  }, []);

  // Notify only when a new remote screen-share appears.
  const seenScreensRef = useRef(new Set());
  useEffect(() => {
    const current = new Set();
    tiles.forEach((tile) => {
      if (!tile.isScreen || tile.isLocal) return;
      current.add(tile.key);
      if (!seenScreensRef.current.has(tile.key)) {
        message.info((tile.author || "Alguém") + " começou a transmitir.", 4);
      }
    });
    seenScreensRef.current = current;
  }, [tiles, message]);

  useEffect(() => {
    document.title = totalScreenCount > 0
      ? "AO VIVO (" + totalScreenCount + ") · Mazestream"
      : (phase === "room" ? "Sala · Mazestream" : "Mazestream");
  }, [totalScreenCount, phase]);

  useEffect(() => {
    if (screenCount === 0) return;
    function warnBeforeLeave(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [screenCount]);

  useEffect(() => {
    if (totalScreenCount === 0 || !navigator.wakeLock) return;
    let lock = null;
    let active = true;
    async function requestLock() {
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => { lock = null; });
      } catch (e) {}
    }
    function onVisibility() {
      if (active && !lock && document.visibilityState === "visible") requestLock();
    }
    requestLock();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (lock) { try { lock.release(); } catch (e) {} }
    };
  }, [totalScreenCount > 0]);

  const updateMeta = useCallback(async (patch) => {
    if (!room) return false;
    const next = { ...readState(room.localParticipant), ...patch };
    try {
      await room.localParticipant.setMetadata(buildState(next));
      return true;
    } catch (error) {
      console.error("Failed to update participant metadata:", error);
      return false;
    }
  }, [room]);

  const { sharing, shareScreen, stopBroadcast, stopAll, pauseLive, resumeLive } = useScreenShare(room, settings, updateMeta, message);

  useEffect(() => {
    applyReceiveQuality(room, settings.receiveQuality);
  }, [room, settings.receiveQuality, trackVer]);

  // ---- Ephemeral interaction layer ---------------------------------------
  const [interactions, setInteractions] = useState([]);
  const [interactionTool, setInteractionTool] = useState(null); // cursor | point | draw | reaction
  const [markerStyle, setMarkerStyle] = useState("ring");
  const [pendingReaction, setPendingReaction] = useState(null);
  const [brush, setBrush] = useState({ color: DRAW_COLORS[0], width: DRAW_WIDTHS[1], tool: "pen" });
  const [boardOpen, setBoardOpen] = useState(false);
  const [attentionRequest, setAttentionRequest] = useState(null);
  const interactionTimersRef = useRef(new Map());
  const [cursorStore] = useState(createRemoteCursorStore);
  const [pingGate] = useState(createPingGate);
  const inboundDataBudgetRef = useRef(new Map());

  const addInteraction = useCallback((item) => {
    setInteractions((list) => mergeTransientInteraction(list, item));
    const lifetime = INTERACTION_LIFETIME[item.type] || 4000;
    const timers = interactionTimersRef.current;
    if (timers.has(item.id)) window.clearTimeout(timers.get(item.id));
    timers.set(item.id, window.setTimeout(() => {
      timers.delete(item.id);
      setInteractions((list) => list.filter((current) => current.id !== item.id));
    }, lifetime));
  }, []);

  useEffect(() => () => {
    interactionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    interactionTimersRef.current.clear();
    inboundDataBudgetRef.current.clear();
  }, []);

  useEffect(() => {
    const remove = (participant) => { cursorStore.remove(participant.identity); pingGate.remove(participant.identity); inboundDataBudgetRef.current.delete(participant.identity); };
    const reset = () => cursorStore.hideWhere(() => true);
    const expire = () => { if (!document.hidden) cursorStore.expire(); };
    room?.on(RoomEvent.ParticipantDisconnected, remove);
    room?.on(RoomEvent.Reconnecting, reset);
    document.addEventListener("visibilitychange", expire);
    return () => {
      room?.off(RoomEvent.ParticipantDisconnected, remove);
      room?.off(RoomEvent.Reconnecting, reset);
      document.removeEventListener("visibilitychange", expire);
      cursorStore.clear(); pingGate.clear();
    };
  }, [room, cursorStore, pingGate]);

  useEffect(() => {
    cursorStore.hideWhere((item) => !settings.interactionsEnabled || settings.pointersEnabled === false
      || getPersonSettings(peopleSettings, item.identity, item.author).interactionsHidden
      || room?.remoteParticipants.get(item.identity)?.permissions?.canPublishData === false);
  }, [cursorStore, settings.interactionsEnabled, settings.pointersEnabled, peopleSettings, room, permissionVer]);

  const visibleInteractions = useMemo(() => interactions.filter((item) => settings.interactionsEnabled
    && !(item.type === "ping" && settings.pointersEnabled === false)
    && !getPersonSettings(peopleSettings, item.identity, item.author).interactionsHidden),
  [interactions, settings.interactionsEnabled, settings.pointersEnabled, peopleSettings]);

  const lastInteractionErrorRef = useRef(0);
  const sendData = useCallback((data, reliable = false, destinations) => {
    if (!room || !localCanPublishData) return Promise.resolve(false);
    const reportFailure = () => {
      if (Date.now() - lastInteractionErrorRef.current < 5000) return;
      lastInteractionErrorRef.current = Date.now();
      message.warning("Não consegui enviar uma interação. Confira a conexão e tente novamente.");
    };
    try {
      const publication = prepareInteractionPublication(data, reliable, destinations);
      return room.localParticipant.publishData(publication.payload, publication.options).then(() => true).catch(() => {
        reportFailure();
        return false;
      });
    } catch (e) { reportFailure(); return Promise.resolve(false); }
  }, [room, localCanPublishData, message]);

  const myName = room ? (room.localParticipant.name || room.localParticipant.identity) : "";
  const { boardStrokes, boardHistoryState, addBoardStroke, undoBoard, redoBoard, clearBoard } = useBoard(
    room, localCanPublishData, sendData, message
  );

  const sendPing = useCallback((tile, point, marker = "ring") => {
    if (!localCanPublishData || !tile || !point || !pingGate.accept("local")) return;
    const safeMarker = MARKER_STYLES.includes(marker) ? marker : "ring";
    const item = { type: "ping", id: newInteractionId(), tile, x: point.x, y: point.y, marker: safeMarker, author: "você", identity: room?.localParticipant.identity };
    addInteraction(item);
    sendData({ type: "ping", t: "ping", id: item.id, tile, x: item.x, y: item.y, marker: safeMarker });
  }, [addInteraction, sendData, localCanPublishData, pingGate, room]);

  const cursorSequenceRef = useRef(0);
  const cursorSenderRef = useRef(null);
  useEffect(() => {
    const sender = createCursorPublisher((data, reliable) => room?.state === "connected" ? sendData(data, reliable) : false,
      { nextSequence: () => ++cursorSequenceRef.current });
    cursorSenderRef.current = sender;
    return () => { sender.dispose(); if (cursorSenderRef.current === sender) cursorSenderRef.current = null; };
  }, [room, sendData]);
  useEffect(() => { if (connState !== "connected") cursorSenderRef.current?.hide(); }, [connState]);
  const sendCursor = useCallback((tile, point) => {
    cursorSenderRef.current?.update(tile, point);
  }, []);

  const sendStroke = useCallback((tile, points, color, width, tool = "pen", opacity) => {
    if (!tile) return;
    const drawing = sanitizeDrawAction({ points, color, width, tool, opacity });
    if (drawing.points.length < 2) return;
    const item = {
      type: "stroke", tile, ...drawing, id: newInteractionId(), author: "você"
    };
    addInteraction(item);
    sendData({
      type: "stroke", t: "risco", id: item.id, tile,
      points: item.points, pts: item.points, color: item.color, cor: item.color,
      width: item.width, espessura: item.width, tool: item.tool, opacity: item.opacity
    });
  }, [addInteraction, sendData]);

  const sendReaction = useCallback((tile, reaction, point) => {
    if (!tile || !point || !REACTION_EMOJIS[reaction]) return;
    const extra = {
      x: Math.max(0, Math.min(1, point.x)),
      y: Math.max(0, Math.min(1, point.y)),
      speed: Math.random(),
      size: Math.random(),
      drift: Math.random() * 2 - 1
    };
    const item = { type: "reaction", id: newInteractionId(), tile, reaction, ...extra, author: "você" };
    addInteraction(item);
    sendData({ type: "reaction", t: "reacao", id: item.id, tile, reaction, k: REACTION_TO_WIRE[reaction], ...extra, vel: extra.speed, tam: extra.size, deriva: extra.drift });
    setPendingReaction(null);
  }, [addInteraction, sendData]);

  const callAttention = useCallback((tile, title) => {
    if (!tile) return;
    sendData({ type: "look", t: "olha", tile, title: title || "", titulo: title || "" }, true);
    message.success("Avisei a galera pra olhar aqui.");
  }, [sendData, message]);

  useEffect(() => {
    if (!room) return;

    function onData(payload, participant, _kind, topic) {
      if (topic !== INTERACTION_TOPIC || !settings.interactionsEnabled) return;
      const author = participant ? (participant.name || participant.identity) : "alguém";
      if (getPersonSettings(peopleSettings, participant?.identity, author).interactionsHidden) return;
      const data = decodeInteraction(payload);
      if (!data) return;
      const type = data.type || LEGACY_TYPE_MAP[data.t];
      if (typeof type !== "string" || type.startsWith("board-")) return;
      if ((type === "cursor" || type === "ping") && (settings.pointersEnabled === false
          || !participant?.identity || participant.identity === room.localParticipant.identity
          || participant.permissions?.canPublishData === false)) return;

      // Data packets are intentionally lightweight, but a participant can
      // still flood a browser with valid packets. Keep cursors responsive while
      // bounding the work done per sender for strokes and control messages.
      const sender = participant?.identity || "unknown";
      const second = Math.floor(Date.now() / 1000);
      const budget = inboundDataBudgetRef.current.get(sender);
      const currentBudget = budget && budget.second === second ? budget : { second, count: 0 };
      const limit = type === "cursor" ? 90 : (type === "stroke" ? 45 : 120);
      if (currentBudget.count >= limit) return;
      currentBudget.count += 1;
      inboundDataBudgetRef.current.set(sender, currentBudget);

      if (type === "look" && data.tile) {
        setAttentionRequest({
          id: newInteractionId(), tile: String(data.tile), author,
          title: typeof (data.title || data.titulo) === "string" ? (data.title || data.titulo).slice(0, 80) : ""
        });
        return;
      }

      const tile = typeof data.tile === "string" ? data.tile : "";
      if (!tile) return;
      if (type === "ping" && Number.isFinite(data.x) && Number.isFinite(data.y)) {
        if (!pingGate.accept(sender)) return;
        addInteraction({
          type: "ping", id: String(data.id || newInteractionId()), tile,
          x: Math.max(0, Math.min(1, data.x)), y: Math.max(0, Math.min(1, data.y)),
          marker: MARKER_STYLES.includes(data.marker) ? data.marker : "ring", author, identity: sender
        });
      } else if (type === "cursor") {
        cursorStore.receive(data, sender, author);
      } else if (type === "stroke") {
        const drawing = sanitizeDrawAction(data);
        if (drawing.points.length > 1) addInteraction({
          type: "stroke", tile, ...drawing, author
        });
      } else if (type === "reaction") {
        const rawReaction = data.reaction || data.k;
        const reaction = REACTION_EMOJIS[rawReaction] ? rawReaction : REACTION_FROM_WIRE[rawReaction];
        if (!REACTION_EMOJIS[reaction]) return;
        addInteraction({
          type: "reaction", id: String(data.id || newInteractionId()), tile,
          reaction,
          x: Number.isFinite(data.x) ? Math.max(0, Math.min(1, data.x)) : 0.5,
          y: Number.isFinite(data.y) ? Math.max(0, Math.min(1, data.y)) : 0.75,
          speed: Number.isFinite(data.speed ?? data.vel) ? (data.speed ?? data.vel) : 0,
          size: Number.isFinite(data.size ?? data.tam) ? (data.size ?? data.tam) : 0,
          drift: Number.isFinite(data.drift ?? data.deriva) ? (data.drift ?? data.deriva) : 0,
          author
        });
      }
    }

    room.on(RoomEvent.DataReceived, onData);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  }, [room, settings.interactionsEnabled, settings.pointersEnabled, peopleSettings, addInteraction, cursorStore, pingGate]);

  // ---- Room features: chat, temporary files, host controls and presenter ---
  const addChatMessage = useCallback((item) => {
    setChatMessages((list) => {
      if (list.some((current) => current.id === item.id)) return list;
      return list.concat(item).slice(-120);
    });
  }, []);

  const sendRoomData = useCallback((data, reliable = true) => {
    if (!room || !localCanPublishData) return false;
    try {
      void room.localParticipant.publishData(encodeRoomData(data), { reliable, topic: ROOM_TOPIC }).catch(() => {});
      return true;
    } catch (e) { return false; }
  }, [room, localCanPublishData]);

  useEffect(() => {
    if (!room) return;
    function onRoomData(payload, participant, _kind, topic) {
      if (topic !== ROOM_TOPIC) return;
      const data = decodeRoomData(payload);
      if (!data || typeof data !== "object") return;
      const author = participant ? (participant.name || participant.identity) : "alguém";
      const identity = participant ? participant.identity : "";

      if (data.type === "chat") {
        const text = sanitizeChatText(data.text);
        if (!text) return;
        addChatMessage({
          id: String(data.id || newRoomMessageId()).slice(0, 100),
          kind: "text", text, author, identity,
          at: Number.isFinite(data.at) ? data.at : Date.now(), mine: false
        });
      } else if (data.type === "file") {
        const file = sanitizeFileMeta(data.file);
        if (!file.id || !file.url) return;
        addChatMessage({
          id: String(data.id || newRoomMessageId()).slice(0, 100),
          kind: "file", file, author, identity,
          at: Number.isFinite(data.at) ? data.at : Date.now(), mine: false
        });
      } else if (data.type === "presenter") {
        const currentHostPresent = !!hostIdentity && (room.localParticipant.identity === hostIdentity || room.remoteParticipants.has(hostIdentity));
        const senderIsHost = !!identity && identity === hostIdentity;
        if (senderIsHost || !hostIdentity || !currentHostPresent) setPresenter(normalizePresenter(data.presenter));
      } else if (data.type === "room-state") {
        const announcedHost = typeof data.hostIdentity === "string" ? data.hostIdentity : "";
        const currentHostPresent = !!hostIdentity && (room.localParticipant.identity === hostIdentity || room.remoteParticipants.has(hostIdentity));
        const senderIsHost = !!identity && identity === hostIdentity;
        const validHandoff = !currentHostPresent && !!identity && announcedHost === identity;
        if (!senderIsHost && hostIdentity && !validHandoff) return;
        if (ROOM_PRESETS[data.preset]) setRoomPreset(data.preset);
        if (typeof data.locked === "boolean") setRoomLocked(data.locked);
        if (announcedHost) setHostIdentity(announcedHost);
      }
    }
    room.on(RoomEvent.DataReceived, onRoomData);
    return () => room.off(RoomEvent.DataReceived, onRoomData);
  }, [room, addChatMessage, hostIdentity]);

  // Re-announce authoritative room state after a host reconnects with a new LiveKit identity.
  useEffect(() => {
    if (phase !== "room" || !isHost || !room || !localCanPublishData) return;
    sendRoomData({ type: "room-state", preset: roomPreset, locked: roomLocked, hostIdentity: room.localParticipant.identity }, true);
    if (presenter) sendRoomData({ type: "presenter", presenter }, true);
  }, [phase, isHost, room, localCanPublishData, roomPreset, roomLocked, presenter, sendRoomData]);

  const roomControl = useCallback(async (payload) => {
    if (!sessionKey) throw new Error("Sua sessão de controle expirou.");
    const response = await fetchWithTimeout("/api/room-control", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Maze-Session": sessionKey },
      body: JSON.stringify(payload)
    }, 12000);
    let data = {};
    try { data = await response.json(); } catch (e) {}
    if (!response.ok) throw new Error(data.motivo || "Não consegui aplicar a mudança.");
    if (data.roomState) {
      if (ROOM_PRESETS[data.roomState.preset]) setRoomPreset(data.roomState.preset);
      setRoomLocked(!!data.roomState.locked);
      if (typeof data.roomState.hostIdentity === "string") setHostIdentity(data.roomState.hostIdentity);
      if ("presenter" in data.roomState) setPresenter(normalizePresenter(data.roomState.presenter));
    }
    return data;
  }, [sessionKey]);

  const sendChat = useCallback((value) => {
    const text = sanitizeChatText(value);
    if (!text) return false;
    if (!localCanPublishData) { message.warning("O host desativou suas interações nesta sala."); return false; }
    const item = { id: newRoomMessageId(), kind: "text", text, author: "Você", identity: room?.localParticipant.identity || "", at: Date.now(), mine: true };
    addChatMessage(item);
    sendRoomData({ type: "chat", id: item.id, text, at: item.at }, true);
    return true;
  }, [room, localCanPublishData, addChatMessage, sendRoomData, message]);

  const shareFile = useCallback(async (file) => {
    if (!file || !sessionKey) return false;
    if (!localCanPublishData) { message.warning("O host desativou suas interações nesta sala."); return false; }
    if (file.size > 8 * 1024 * 1024) { message.warning("O arquivo passa do limite de 8 MB."); return false; }
    const url = "/api/share?name=" + encodeURIComponent(file.name || "arquivo") + "&type=" + encodeURIComponent(file.type || "application/octet-stream");
    const response = await fetchWithTimeout(url, { method: "POST", headers: { "X-Maze-Session": sessionKey }, body: file }, 30000);
    let data = {};
    try { data = await response.json(); } catch (e) {}
    if (!response.ok) { message.error(data.motivo || "Não consegui enviar o arquivo."); return false; }
    const meta = sanitizeFileMeta(data);
    const item = { id: newRoomMessageId(), kind: "file", file: meta, author: "Você", identity: room?.localParticipant.identity || "", at: Date.now(), mine: true };
    addChatMessage(item);
    sendRoomData({ type: "file", id: item.id, file: meta, at: item.at }, true);
    message.success("Arquivo enviado para a sala.");
    return true;
  }, [sessionKey, localCanPublishData, room, addChatMessage, sendRoomData, message]);

  const changeRoomPin = useCallback(async (pin) => {
    try {
      const data = await roomControl({ action: "pin", pin: String(pin || "").slice(0, 24) });
      const state = data.roomState || {};
      sendRoomData({ type: "room-state", preset: state.preset || roomPreset, locked: !!state.locked, hostIdentity: state.hostIdentity || hostIdentity }, true);
      message.success(state.locked ? "PIN da sala atualizado." : "Sala desbloqueada.");
      return true;
    } catch (e) { message.error(e.message); return false; }
  }, [roomControl, sendRoomData, roomPreset, hostIdentity, message]);

  const changeRoomPreset = useCallback(async (preset) => {
    if (!ROOM_PRESETS[preset]) return false;
    try {
      const data = await roomControl({ action: "preset", preset });
      const state = data.roomState || {};
      setRoomPreset(preset);
      sendRoomData({ type: "room-state", preset, locked: !!state.locked, hostIdentity: state.hostIdentity || hostIdentity }, true);
      return true;
    } catch (e) { message.error(e.message); return false; }
  }, [roomControl, sendRoomData, hostIdentity, message]);

  const setPresenterTarget = useCallback(async (target) => {
    const normalized = normalizePresenter(target);
    try {
      await roomControl({ action: "presenter", presenter: normalized });
      setPresenter(normalized);
      sendRoomData({ type: "presenter", presenter: normalized }, true);
      message.success(normalized ? "Destaque do host ativado." : "Destaque do host liberado.");
      return true;
    } catch (e) { message.error(e.message); return false; }
  }, [roomControl, sendRoomData, message]);

  const setParticipantPermission = useCallback(async (identity, patch) => {
    const person = people.find((item) => item.identity === identity);
    if (!person || person.isLocal) return false;
    try {
      await roomControl({
        action: "permission", identity,
        canPublish: patch.canPublish ?? person.canPublish,
        canPublishData: patch.canPublishData ?? person.canPublishData
      });
      message.success("Permissões atualizadas.");
      return true;
    } catch (e) { message.error(e.message); return false; }
  }, [people, roomControl, message]);

  const kickParticipant = useCallback(async (identity) => {
    try {
      await roomControl({ action: "kick", identity });
      message.success("Pessoa removida desta sessão. Ela poderá entrar novamente.");
      return true;
    } catch (e) { message.error(e.message); return false; }
  }, [roomControl, message]);

  const voteKickParticipant = useCallback(async (identity) => {
    try {
      const data = await roomControl({ action: "vote-kick", identity });
      if (data.kicked) {
        message.success((data.targetName || "Pessoa") + " foi removida pela votação e poderá entrar novamente.");
      } else if (data.duplicate) {
        message.info("Seu voto já estava registrado · " + data.votes + "/" + data.required);
      } else {
        message.success("Voto registrado · " + data.votes + "/" + data.required);
      }
      return data;
    } catch (e) {
      message.error(e.message);
      return false;
    }
  }, [roomControl, message]);

  useEffect(() => {
    if (!presenter) return;
    if (presenter.kind === "board") {
      if (!boardOpen) setBoardOpen(true);
      return;
    }
    const target = tiles.find((tile) => presenterMatchesTile(presenter, tile));
    if (!target) return;
    if (boardOpen) setBoardOpen(false);
    if (selected !== target.key) setSelected(target.key);
  }, [presenter, tiles, boardOpen, selected]);

  const selectedTile = useMemo(() => {
    const exact = selected && tiles.find((tile) => tile.key === selected);
    return exact || tiles.find((tile) => tile.isScreen) || tiles[0] || null;
  }, [tiles, selected]);
  const clipTarget = selectedTile && selectedTile.isScreen ? selectedTile : tiles.find((tile) => tile.isScreen) || null;
  const [clipBufferTarget, setClipBufferTarget] = useState("");
  const clipEnabled = !!clipTarget && clipBufferTarget === clipTarget.key;
  const onClipAutoStop = useCallback(() => {
    setClipBufferTarget("");
    message.warning("O clipe foi desligado após alguns minutos para manter o dispositivo leve.", 6);
  }, [message]);
  const clipBuffer = useClipBuffer(room, clipTarget, 45, clipEnabled, onClipAutoStop);
  const toggleClipBuffer = useCallback(() => {
    if (!clipTarget) return;
    setClipBufferTarget((current) => current === clipTarget.key ? "" : clipTarget.key);
  }, [clipTarget]);
  const saveClip = useCallback(async (seconds) => {
    if (!clipBuffer.supported) { message.warning("Este dispositivo não consegue criar clipes agora."); return; }
    message.open({ key: "maze-clip", type: "loading", content: "Preparando o clipe…", duration: 0 });
    try {
      if (!await clipBuffer.saveClip(seconds)) {
        message.open({ key: "maze-clip", type: "info", content: "O clipe ainda não tem tempo suficiente." });
        return;
      }
      message.open({ key: "maze-clip", type: "success", content: "Clipe salvo no seu dispositivo." });
    } catch (error) {
      message.open({ key: "maze-clip", type: "error", content: "Não consegui salvar o clipe. Desative e ative novamente para tentar." });
    }
  }, [clipBuffer, message]);

  const join = useCallback(async (name, roomName, options = {}) => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    let connected = false;
    try {
      const canonicalRoom = normalizeRoomName(roomName);
      let hostClaim = "";
      try {
        hostClaim = localStorage.getItem("mazeHostClaim:" + canonicalRoom)
          || localStorage.getItem("mazeHostClaim:" + roomName) || "";
      } catch (e) {}
      const params = new URLSearchParams({
        room: canonicalRoom,
        name,
        role: options.spectator ? "spectator" : "participant",
        preset: options.preset || "livre"
      });
      const tokenHeaders = {};
      if (options.pin) tokenHeaders["X-Maze-Pin"] = String(options.pin).slice(0, 24);
      if (hostClaim) tokenHeaders["X-Maze-Host-Claim"] = hostClaim;
      const resp = await fetchWithTimeout("/token?" + params.toString(), { headers: tokenHeaders }, 10000);
      if (!resp.ok) {
        let reason = "Não consegui entrar agora.";
        try { const body = await resp.json(); if (body && body.motivo) reason = body.motivo; } catch (e) {}
        throw new Error(reason);
      }
      const data = await resp.json();
      const url = data.url || window.LIVEKIT_URL;
      if (!url) throw new Error("URL do servidor não configurada");
      await connect(url, data.token);
      connected = true;
      try { localStorage.setItem("meuNome", name); } catch (e) {}
      if (data.hostClaim) {
        try { localStorage.setItem("mazeHostClaim:" + (data.room || canonicalRoom), data.hostClaim); } catch (e) {}
      }
      setSessionKey(data.session || "");
      setIsHost(!!data.isHost);
      setRoomRole(data.role || (options.spectator ? "spectator" : "participant"));
      setCurrentRoom(data.room || canonicalRoom);
      const state = data.roomState || {};
      setRoomPreset(ROOM_PRESETS[state.preset] ? state.preset : "livre");
      setRoomLocked(!!state.locked);
      setPresenter(normalizePresenter(state.presenter));
      setHostIdentity(state.hostIdentity || (data.isHost ? data.identity : ""));
      setChatMessages([]);
      setPhase("room");
      if (data.isHost) message.success("Você é o host desta sala.");
    } catch (e) {
      if (connected) await disconnect();
      const reason = e?.name === "AbortError"
        ? "O servidor demorou demais para responder. Tente novamente."
        : (e && e.message ? e.message : String(e));
      message.error(reason);
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }, [connect, disconnect, message]);

  const setLiveTitle = useCallback(async (title) => {
    if (!await updateMeta({ titulo: title })) message.error("Não consegui atualizar o título da transmissão.");
  }, [updateMeta, message]);

  const copyLink = useCallback(async () => {
    const link = window.location.origin + "/?sala=" + encodeURIComponent(currentRoom || "geral");
    try { await navigator.clipboard.writeText(link); message.success("Link da sala copiado."); }
    catch (e) { message.info(link); }
  }, [currentRoom, message]);

  const toggleMic = useCallback(async () => {
    if (!room) return;
    if (!localCanPublish) { message.warning("O host deixou você no modo espectador."); return; }
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
    } catch (error) {
      message.error(error?.message || "Não consegui alterar o microfone.");
    }
  }, [room, localCanPublish, message]);

  const toggleCam = useCallback(async () => {
    if (!room) return;
    if (!localCanPublish) { message.warning("O host deixou você no modo espectador."); return; }
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);
    } catch (error) {
      message.error(error?.message || "Não consegui alterar a câmera.");
    }
  }, [room, localCanPublish, message]);

  const leave = useCallback(async () => {
    await disconnect();
    window.location.reload();
  }, [disconnect]);

  const onShare = useCallback(() => {
    if (!localCanPublish) { message.warning("O host deixou você no modo espectador."); return; }
    shareScreen();
  }, [shareScreen, message, localCanPublish]);

  if (phase === "join") {
    return <JoinScreen joining={joining} onJoin={join} />;
  }

  return (
    <Suspense fallback={<div className="room-loading" role="status">Abrindo a sala…</div>}>
      <SharedCursorContext.Provider value={cursorStore}>
      <RoomView
      tiles={tiles}
      audios={audios}
      people={people}
      screenCount={screenCount}
      totalScreenCount={totalScreenCount}
      connState={connState}
      selected={selected}
      setSelected={setSelected}
      volumes={volumes}
      setVolumes={setVolumes}
      settings={settings}
      setSettings={setSettings}
      peopleSettings={peopleSettings}
      onPersonSetting={updatePersonSetting}
      isHost={isHost}
      hostIdentity={hostIdentity}
      roomRole={roomRole}
      roomPreset={roomPreset}
      roomLocked={roomLocked}
      presenter={presenter}
      localCanPublish={localCanPublish}
      localCanPublishData={localCanPublishData}
      chatMessages={chatMessages}
      onSendChat={sendChat}
      onShareFile={shareFile}
      onSetRoomPin={changeRoomPin}
      onSetRoomPreset={changeRoomPreset}
      onSetPresenter={setPresenterTarget}
      onSetParticipantPermission={setParticipantPermission}
      onKickParticipant={kickParticipant}
      onVoteKickParticipant={voteKickParticipant}
      clipSupported={clipBuffer.supported}
      clipBuffering={clipBuffer.buffering}
      clipExporting={clipBuffer.exporting}
      clipError={clipBuffer.error}
      clipReadySeconds={clipBuffer.readySeconds}
      clipTargetName={clipTarget ? clipTarget.name : ""}
      clipEnabled={clipEnabled}
      onToggleClipBuffer={toggleClipBuffer}
      onSaveClip={saveClip}
      micOn={micOn}
      camOn={camOn}
      currentRoom={currentRoom}
      myState={myState}
      audioBlocked={audioBlocked}
      onEnableAudio={enableAudio}
      interactions={visibleInteractions}
      interactionTool={interactionTool}
      setInteractionTool={setInteractionTool}
      markerStyle={markerStyle}
      setMarkerStyle={setMarkerStyle}
      pendingReaction={pendingReaction}
      setPendingReaction={setPendingReaction}
      brush={brush}
      setBrush={setBrush}
      onPing={sendPing}
      onCursor={sendCursor}
      onStroke={sendStroke}
      onReaction={sendReaction}
      boardOpen={boardOpen}
      setBoardOpen={setBoardOpen}
      boardStrokes={boardStrokes}
      onBoardStroke={addBoardStroke}
      onBoardUndo={undoBoard}
      onBoardRedo={redoBoard}
      boardCanUndo={boardHistoryState.canUndo}
      boardCanRedo={boardHistoryState.canRedo}
      onBoardClear={clearBoard}
      attentionRequest={attentionRequest}
      setAttentionRequest={setAttentionRequest}
      onCallAttention={callAttention}
      onShare={onShare}
      sharing={sharing}
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
      </SharedCursorContext.Provider>
    </Suspense>
  );
}
