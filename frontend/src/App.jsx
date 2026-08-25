import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { App as AntApp } from "antd";
import { Track, VideoQuality, RoomEvent } from "livekit-client";
import { useRoom } from "./useRoom.js";
import {
  useCollectTiles, useCollectAudios, useCollectPeople,
  getPersonSettings, getParticipantName
} from "./collect.js";
import { readState, buildState } from "./state.js";
import { useScreenShare } from "./useScreenShare.js";
import { DEFAULT_SETTINGS } from "./constants.js";
import { useClipBuffer } from "./useClipBuffer.js";
import {
  ROOM_TOPIC, ROOM_PRESETS, encodeRoomData, decodeRoomData, newRoomMessageId,
  sanitizeChatText, sanitizeFileMeta, normalizePresenter, presenterMatchesTile
} from "./roomFeatures.js";
import {
  INTERACTION_TOPIC, encodeInteraction, decodeInteraction, newInteractionId,
  INTERACTION_LIFETIME, DRAW_COLORS, DRAW_WIDTHS,
  sanitizePoints, sanitizeColor, sanitizeWidth,
  REACTION_TO_WIRE, REACTION_FROM_WIRE, LEGACY_TYPE_MAP, MARKER_STYLES
} from "./interactions.js";
import JoinScreen from "./ui/JoinScreen.jsx";
import RoomView from "./ui/RoomView.jsx";

const RECEIVE_QUALITY_MAP = {
  high: VideoQuality.HIGH,
  medium: VideoQuality.MEDIUM,
  low: VideoQuality.LOW
};

const OLD_QUALITY_MAP = { alta: "high", media: "medium", baixa: "low", auto: "auto" };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("ajustes") || "{}");
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      configVersion: DEFAULT_SETTINGS.configVersion,
      audioOnShare: saved.audioOnShare ?? saved.audioAoCompartilhar ?? DEFAULT_SETTINGS.audioOnShare,
      sendQuality: saved.sendQuality || OLD_QUALITY_MAP[saved.qualidadeEnvio] || DEFAULT_SETTINGS.sendQuality,
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

export default function App() {
  const { message } = AntApp.useApp();
  const {
    roomRef, connState, connect, disconnect,
    trackVer, partVer, metaVer, qualityVer, permissionVer,
    audioBlocked, enableAudio
  } = useRoom();

  const [phase, setPhase] = useState("join");
  const [joining, setJoining] = useState(false);
  const [currentRoom, setCurrentRoom] = useState("");
  const [settings, setSettings] = useState(loadSettings);
  const [peopleSettings, setPeopleSettings] = useState(loadPeopleSettings);
  const [volumes, setVolumes] = useState({});
  const [selected, setSelected] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
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

  // Per-person camera/microphone controls are real subscriptions, not just CSS.
  // Screen-share video/audio are intentionally never affected by these toggles.
  useEffect(() => {
    if (!room) return;
    room.remoteParticipants.forEach((participant) => {
      const name = getParticipantName(participant);
      const person = getPersonSettings(peopleSettings, name);
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

  const updatePersonSetting = useCallback((name, patch) => {
    if (!name) return;
    setPeopleSettings((previous) => ({
      ...previous,
      [name]: { ...getPersonSettings(previous, name), ...patch }
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
    room.remoteParticipants.forEach((participant) => {
      participant.videoTrackPublications.forEach((pub) => {
        if (pub.setVideoQuality) {
          try { pub.setVideoQuality(target); } catch (e) {}
        }
      });
    });
  }, [room, settings.receiveQuality, trackVer]);

  // ---- Ephemeral interaction layer ---------------------------------------
  const [interactions, setInteractions] = useState([]);
  const [interactionTool, setInteractionTool] = useState(null); // cursor | point | draw | reaction | eraser
  const [markerStyle, setMarkerStyle] = useState("ring");
  const [pendingReaction, setPendingReaction] = useState(null);
  const [brush, setBrush] = useState({ color: DRAW_COLORS[0], width: DRAW_WIDTHS[1] });
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardStrokes, setBoardStrokes] = useState([]);
  const [attentionRequest, setAttentionRequest] = useState(null);
  const boardRef = useRef(boardStrokes);
  const cursorTimersRef = useRef(new Map());

  useEffect(() => { boardRef.current = boardStrokes; }, [boardStrokes]);

  const addInteraction = useCallback((item) => {
    setInteractions((list) => list.filter((current) => current.id !== item.id).concat(item).slice(-80));
    const lifetime = INTERACTION_LIFETIME[item.type] || 4000;
    window.setTimeout(() => {
      setInteractions((list) => list.filter((current) => current.id !== item.id));
    }, lifetime);
  }, []);

  const upsertCursor = useCallback((item) => {
    setInteractions((list) => list.filter((current) => current.id !== item.id).concat(item).slice(-80));
    const timers = cursorTimersRef.current;
    if (timers.has(item.id)) window.clearTimeout(timers.get(item.id));
    timers.set(item.id, window.setTimeout(() => {
      timers.delete(item.id);
      setInteractions((list) => list.filter((current) => current.id !== item.id));
    }, INTERACTION_LIFETIME.cursor));
  }, []);

  useEffect(() => () => {
    cursorTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    cursorTimersRef.current.clear();
  }, []);

  const sendData = useCallback((data, reliable = false) => {
    if (!room || !localCanPublishData) return;
    try {
      void room.localParticipant.publishData(encodeInteraction(data), { reliable, topic: INTERACTION_TOPIC }).catch(() => {});
    } catch (e) {}
  }, [room, localCanPublishData]);

  const myName = room ? (room.localParticipant.name || room.localParticipant.identity) : "";

  const sendPing = useCallback((tile, point, marker = "ring") => {
    if (!tile || !point) return;
    const safeMarker = MARKER_STYLES.includes(marker) ? marker : "ring";
    const item = { type: "ping", id: newInteractionId(), tile, x: point.x, y: point.y, marker: safeMarker, author: "você" };
    addInteraction(item);
    sendData({ type: "ping", t: "ping", id: item.id, tile, x: item.x, y: item.y, marker: safeMarker });
  }, [addInteraction, sendData]);

  const sendCursor = useCallback((tile, point) => {
    if (!tile || !point) return;
    sendData({ type: "cursor", tile, x: point.x, y: point.y }, false);
  }, [sendData]);

  const sendStroke = useCallback((tile, points, color, width) => {
    if (!tile) return;
    const safePoints = sanitizePoints(points);
    if (safePoints.length < 2) return;
    const item = {
      type: "stroke", id: newInteractionId(), tile, points: safePoints,
      color: sanitizeColor(color), width: sanitizeWidth(width), author: "você"
    };
    addInteraction(item);
    sendData({ type: "stroke", t: "risco", id: item.id, tile, points: item.points, pts: item.points, color: item.color, cor: item.color, width: item.width, espessura: item.width });
  }, [addInteraction, sendData]);

  const sendReaction = useCallback((tile, reaction, point) => {
    if (!tile || !point) return;
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
    setInteractionTool(null);
  }, [addInteraction, sendData]);

  const addBoardStroke = useCallback((points, color, width) => {
    const safePoints = sanitizePoints(points);
    if (safePoints.length < 2) return;
    const stroke = {
      id: newInteractionId(), points: safePoints,
      color: sanitizeColor(color), width: sanitizeWidth(width)
    };
    setBoardStrokes((list) => list.concat(stroke).slice(-400));
    sendData({ type: "board-stroke", t: "q-risco", ...stroke, pts: stroke.points, cor: stroke.color, espessura: stroke.width }, true);
  }, [sendData]);

  const eraseBoard = useCallback((point) => {
    setBoardStrokes((list) => {
      const ids = list.filter((stroke) => stroke.points.some(([x, y]) =>
        Math.abs(x - point[0]) < 0.025 && Math.abs(y - point[1]) < 0.025
      )).map((stroke) => stroke.id).slice(0, 40);
      if (!ids.length) return list;
      sendData({ type: "board-erase", t: "q-apagar", ids }, true);
      return list.filter((stroke) => !ids.includes(stroke.id));
    });
  }, [sendData]);

  const clearBoard = useCallback(() => {
    setBoardStrokes([]);
    sendData({ type: "board-clear", t: "q-limpar" }, true);
  }, [sendData]);

  const sendBoardSnapshot = useCallback(() => {
    const snapshot = (boardRef.current || []).slice(-400);
    let batch = [];
    for (const stroke of snapshot) {
      const candidate = batch.concat(stroke);
      // Keep reliable data packets comfortably below LiveKit's packet ceiling.
      if (batch.length && (candidate.length > 12 || JSON.stringify({ type: "board-sync", strokes: candidate }).length > 10000)) {
        sendData({ type: "board-sync", strokes: batch }, true);
        batch = [stroke];
      } else {
        batch = candidate;
      }
    }
    if (batch.length) sendData({ type: "board-sync", strokes: batch }, true);
  }, [sendData]);

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
      if (getPersonSettings(peopleSettings, author).interactionsHidden) return;
      const data = decodeInteraction(payload);
      if (!data) return;
      const type = data.type || LEGACY_TYPE_MAP[data.t];
      if (!type) return;

      if (type === "board-request") {
        sendBoardSnapshot();
        return;
      }
      if (type === "board-sync" && Array.isArray(data.strokes)) {
        const incoming = data.strokes.slice(0, 12).map((stroke) => ({
          id: String(stroke.id || newInteractionId()).slice(0, 80),
          points: sanitizePoints(stroke.points),
          color: sanitizeColor(stroke.color),
          width: sanitizeWidth(stroke.width)
        })).filter((stroke) => stroke.points.length > 1);
        setBoardStrokes((list) => {
          const known = new Set(list.map((stroke) => stroke.id));
          return list.concat(incoming.filter((stroke) => !known.has(stroke.id))).slice(-400);
        });
        return;
      }
      if (type === "board-stroke") {
        const points = sanitizePoints(data.points || data.pts);
        if (points.length < 2) return;
        const stroke = {
          id: String(data.id || newInteractionId()).slice(0, 80), points,
          color: sanitizeColor(data.color || data.cor), width: sanitizeWidth(data.width || data.espessura)
        };
        setBoardStrokes((list) => list.some((current) => current.id === stroke.id)
          ? list : list.concat(stroke).slice(-400));
        return;
      }
      if (type === "board-erase" && Array.isArray(data.ids)) {
        const ids = data.ids.slice(0, 40).map(String);
        setBoardStrokes((list) => list.filter((stroke) => !ids.includes(stroke.id)));
        return;
      }
      if (type === "board-clear") {
        setBoardStrokes([]);
        return;
      }
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
        addInteraction({
          type: "ping", id: String(data.id || newInteractionId()), tile,
          x: Math.max(0, Math.min(1, data.x)), y: Math.max(0, Math.min(1, data.y)),
          marker: MARKER_STYLES.includes(data.marker) ? data.marker : "ring", author
        });
      } else if (type === "cursor" && Number.isFinite(data.x) && Number.isFinite(data.y)) {
        const identity = participant ? participant.identity : author;
        upsertCursor({
          type: "cursor", id: "cursor:" + identity + ":" + tile, tile,
          x: Math.max(0, Math.min(1, data.x)), y: Math.max(0, Math.min(1, data.y)), author
        });
      } else if (type === "stroke") {
        const points = sanitizePoints(data.points || data.pts);
        if (points.length > 1) addInteraction({
          type: "stroke", id: String(data.id || newInteractionId()), tile, points,
          color: sanitizeColor(data.color || data.cor), width: sanitizeWidth(data.width || data.espessura), author
        });
      } else if (type === "reaction") {
        const reaction = data.reaction || REACTION_FROM_WIRE[data.k];
        if (!["heart", "flame", "bolt", "star"].includes(reaction)) return;
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
    // Ask existing participants for the current board after our listener exists.
    sendData({ type: "board-request", requester: myName }, true);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  }, [room, settings.interactionsEnabled, peopleSettings, addInteraction, upsertCursor, sendData, sendBoardSnapshot, myName]);

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
    const response = await fetch("/api/room-control", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Maze-Session": sessionKey },
      body: JSON.stringify(payload)
    });
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
    const response = await fetch(url, { method: "POST", headers: { "X-Maze-Session": sessionKey }, body: file });
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
      message.success("Pessoa removida da sala.");
      return true;
    } catch (e) { message.error(e.message); return false; }
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
  const clipBuffer = useClipBuffer(room, clipTarget, 45);
  const saveClip = useCallback((seconds) => {
    if (!clipBuffer.supported) { message.warning("Seu navegador não suporta clipes locais."); return; }
    if (!clipBuffer.saveClip(seconds)) { message.info("O buffer ainda não tem tempo suficiente para salvar o clipe."); return; }
    message.success("Clipe salvo no seu dispositivo.");
  }, [clipBuffer, message]);

  const join = useCallback(async (name, roomName, options = {}) => {
    setJoining(true);
    try {
      let hostClaim = "";
      try { hostClaim = localStorage.getItem("mazeHostClaim:" + roomName) || ""; } catch (e) {}
      const params = new URLSearchParams({
        room: roomName,
        name,
        role: options.spectator ? "spectator" : "participant",
        preset: options.preset || "livre"
      });
      const tokenHeaders = {};
      if (options.pin) tokenHeaders["X-Maze-Pin"] = String(options.pin).slice(0, 24);
      if (hostClaim) tokenHeaders["X-Maze-Host-Claim"] = hostClaim;
      const resp = await fetch("/token?" + params.toString(), { headers: tokenHeaders });
      if (!resp.ok) {
        let reason = "Não consegui entrar agora.";
        try { const body = await resp.json(); if (body && body.motivo) reason = body.motivo; } catch (e) {}
        throw new Error(reason);
      }
      const data = await resp.json();
      const url = data.url || window.LIVEKIT_URL;
      if (!url) throw new Error("URL do servidor não configurada");
      await connect(url, data.token);
      localStorage.setItem("meuNome", name);
      if (data.hostClaim) {
        try { localStorage.setItem("mazeHostClaim:" + roomName, data.hostClaim); } catch (e) {}
      }
      setSessionKey(data.session || "");
      setIsHost(!!data.isHost);
      setRoomRole(data.role || (options.spectator ? "spectator" : "participant"));
      setCurrentRoom(roomName);
      const state = data.roomState || {};
      setRoomPreset(ROOM_PRESETS[state.preset] ? state.preset : "livre");
      setRoomLocked(!!state.locked);
      setPresenter(normalizePresenter(state.presenter));
      setHostIdentity(state.hostIdentity || (data.isHost ? data.identity : ""));
      setChatMessages([]);
      setPhase("room");
      if (data.isHost) message.success("Você é o host desta sala.");
    } catch (e) {
      message.error(e && e.message ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  }, [connect, message]);

  const setLiveTitle = useCallback((title) => { updateMeta({ titulo: title }); }, [updateMeta]);

  const copyLink = useCallback(async () => {
    const link = window.location.origin + "/?sala=" + encodeURIComponent(currentRoom || "geral");
    try { await navigator.clipboard.writeText(link); message.success("Link da sala copiado."); }
    catch (e) { message.info(link); }
  }, [currentRoom, message]);

  const toggleMic = useCallback(async () => {
    if (!room) return;
    if (!localCanPublish) { message.warning("O host deixou você no modo espectador."); return; }
    const next = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [room, localCanPublish, message]);

  const toggleCam = useCallback(async () => {
    if (!room) return;
    if (!localCanPublish) { message.warning("O host deixou você no modo espectador."); return; }
    const next = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }, [room, localCanPublish, message]);

  const leave = useCallback(() => {
    disconnect();
    window.location.reload();
  }, [disconnect]);

  const onShare = useCallback(() => {
    if (!localCanPublish) { message.warning("O host deixou você no modo espectador."); return; }
    shareScreen(message);
  }, [shareScreen, message, localCanPublish]);

  if (phase === "join") {
    return <JoinScreen joining={joining} onJoin={join} />;
  }

  return (
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
      clipSupported={clipBuffer.supported}
      clipBuffering={clipBuffer.buffering}
      clipReadySeconds={clipBuffer.readySeconds}
      clipTargetName={clipTarget ? clipTarget.name : ""}
      onSaveClip={saveClip}
      micOn={micOn}
      camOn={camOn}
      currentRoom={currentRoom}
      myState={myState}
      audioBlocked={audioBlocked}
      onEnableAudio={enableAudio}
      interactions={interactions}
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
      onBoardErase={eraseBoard}
      onBoardClear={clearBoard}
      attentionRequest={attentionRequest}
      setAttentionRequest={setAttentionRequest}
      onCallAttention={callAttention}
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
