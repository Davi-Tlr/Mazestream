import { ConnectionState, RoomEvent } from "livekit-client";
import { decodeInteraction, INTERACTION_TOPIC, LEGACY_TYPE_MAP, newInteractionId } from "./interactions.js";
import {
  boardResponderCandidates, buildBoardSnapshot, collectBoardSnapshot,
  createPendingBoardSync, nextBoardEpoch, restoreBoardSnapshot
} from "./boardSync.js";

// The channel owns transport lifecycle only; the hook owns the document/history.
// Keeping this boundary explicit also lets tests exercise real event ordering.
export function attachBoardChannel({ room, canPublishData, sendData, message, documentRef, pendingRef, project, apply }) {
  if (!room) return;
  let disposed = false;
  let timer;
  const transfers = new Set();
  const lastSnapshotAt = new Map();
  const inbound = new Map();
  const requestSnapshot = (attempt = 0) => {
    clearTimeout(timer);
    pendingRef.current = null;
    if (disposed || !canPublishData || room.state !== ConnectionState.Connected) return;
    const candidates = boardResponderCandidates(room, room.localParticipant.identity);
    if (!candidates.length) return;
    if (attempt >= 3) {
      message.warning("Não consegui sincronizar o quadro. Entre novamente na sala se o histórico estiver incompleto.");
      return;
    }
    const responder = candidates[attempt % candidates.length];
    const requestId = newInteractionId();
    pendingRef.current = createPendingBoardSync(responder, requestId);
    sendData({ type: "board-request", protocol: 2, requestId, responder }, true, [responder]);
    timer = setTimeout(() => requestSnapshot(attempt + 1), 5000);
  };

  const onData = (payload, participant, _kind, topic) => {
    if (disposed || topic !== INTERACTION_TOPIC || !participant?.identity) return;
    const data = decodeInteraction(payload);
    const type = data?.type || LEGACY_TYPE_MAP[data?.t];
    if (typeof type !== "string" || !type.startsWith("board-")) return;
    const sender = participant.identity;
    if (type === "board-sync") {
      const pending = pendingRef.current;
      const snapshot = collectBoardSnapshot(pending, data, sender);
      if (!snapshot) return;
      clearTimeout(timer);
      pendingRef.current = null;
      project(restoreBoardSnapshot(documentRef.current, snapshot, pending.mutations));
      return;
    }
    const now = Date.now();
    const second = Math.floor(now / 1000);
    const budget = inbound.get(sender);
    const current = budget?.second === second ? budget : { second, count: 0 };
    if (current.count++ >= 120) return;
    inbound.set(sender, current);
    if (type === "board-request") {
      // Two simultaneous entrants may request each other. Do not deadlock both
      // channels by refusing to answer merely because our own request is pending.
      if (!canPublishData || transfers.size >= 2 || transfers.has(sender)) return;
      const responder = data.responder || boardResponderCandidates(room, sender)[0];
      if (responder !== room.localParticipant.identity || now - (lastSnapshotAt.get(sender) || 0) < 2000) return;
      const requestId = typeof data.requestId === "string" ? data.requestId.slice(0, 80) : newInteractionId();
      lastSnapshotAt.set(sender, now);
      transfers.add(sender);
      void (async () => {
        try {
          const packets = buildBoardSnapshot(documentRef.current, requestId);
          for (const packet of packets) {
            if (disposed) break;
            if (await sendData(packet, true, [sender]) === false) break;
          }
        } finally { transfers.delete(sender); }
      })().catch(() => {
        if (!disposed) message.warning("Não consegui enviar o histórico do quadro.");
      });
      return;
    }
    const operation = { ...data, type };
    if (type === "board-clear" && !operation.boardEpoch) {
      operation.boardEpoch = nextBoardEpoch(documentRef.current, sender);
    }
    apply(operation);
  };

  const onConnected = () => requestSnapshot();
  const onReconnecting = () => {
    clearTimeout(timer);
    pendingRef.current = null;
  };
  const onParticipantLeft = (participant) => {
    inbound.delete(participant.identity);
    lastSnapshotAt.delete(participant.identity);
    if (pendingRef.current?.peer === participant.identity) requestSnapshot();
  };
  room.on(RoomEvent.DataReceived, onData);
  room.on(RoomEvent.Connected, onConnected);
  room.on(RoomEvent.Reconnected, onConnected);
  room.on(RoomEvent.Reconnecting, onReconnecting);
  room.on(RoomEvent.Disconnected, onReconnecting);
  room.on(RoomEvent.ParticipantDisconnected, onParticipantLeft);
  requestSnapshot();
  return () => {
    disposed = true;
    clearTimeout(timer);
    pendingRef.current = null;
    room.off(RoomEvent.DataReceived, onData);
    room.off(RoomEvent.Connected, onConnected);
    room.off(RoomEvent.Reconnected, onConnected);
    room.off(RoomEvent.Reconnecting, onReconnecting);
    room.off(RoomEvent.Disconnected, onReconnecting);
    room.off(RoomEvent.ParticipantDisconnected, onParticipantLeft);
  };
}
