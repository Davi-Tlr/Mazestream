import { encodeInteraction, sanitizeDrawAction } from "../interactions/interactions.js";

export const MAX_BOARD_ACTIONS = 400;
export const MAX_SYNC_MUTATIONS = 1024;
const MAX_PACKET_BYTES = 12 * 1024;

export function createBoardDocument() {
  return { epoch: [0, ""], strokes: [] };
}

function validEpoch(epoch) {
  return Array.isArray(epoch) && epoch.length === 2
    && Number.isSafeInteger(epoch[0]) && epoch[0] >= 0
    && typeof epoch[1] === "string" && epoch[1].length <= 180;
}

export function compareEpoch(left, right) {
  return left[0] - right[0] || (left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0);
}

export function nextBoardEpoch(document, identity) {
  return [Math.min(Number.MAX_SAFE_INTEGER, document.epoch[0] + 1), String(identity).slice(0, 180)];
}

export function applyBoardOperation(document, operation) {
  if (!["board-stroke", "board-erase", "board-clear"].includes(operation.type)) return document;
  // Legacy operation names still work. New peers attach an epoch so a delayed
  // operation from before a clear cannot restore the old drawing.
  const epoch = operation.boardEpoch ?? document.epoch;
  if (!validEpoch(epoch) || compareEpoch(epoch, document.epoch) < 0) return document;
  if (operation.type === "board-clear" && operation.boardEpoch && compareEpoch(epoch, document.epoch) === 0) return document;
  let strokes = compareEpoch(epoch, document.epoch) > 0 ? [] : document.strokes;
  if (operation.type === "board-clear") strokes = [];
  else if (operation.type === "board-erase") {
    if (!Array.isArray(operation.ids)) return document;
    const removed = new Set(operation.ids.slice(0, 40).map(String));
    strokes = strokes.filter((stroke) => !removed.has(stroke.id));
  } else {
    const stroke = sanitizeDrawAction(operation);
    if (stroke.points.length < 2 || strokes.some((current) => current.id === stroke.id)) return document;
    strokes = strokes.concat(stroke).slice(-MAX_BOARD_ACTIONS);
  }
  return { epoch: [...epoch], strokes };
}

export function buildBoardSnapshot(document, requestId) {
  const batches = [];
  let strokes = [];
  const packet = (items, index = MAX_BOARD_ACTIONS, count = MAX_BOARD_ACTIONS) => ({
    type: "board-sync", protocol: 2, requestId, boardEpoch: document.epoch,
    batchIndex: index, batchCount: count, strokes: items
  });
  for (const stroke of document.strokes.slice(-MAX_BOARD_ACTIONS)) {
    const candidate = strokes.concat(sanitizeDrawAction(stroke));
    if (strokes.length && (candidate.length > 12 || encodeInteraction(packet(candidate)).byteLength > MAX_PACKET_BYTES)) {
      batches.push(strokes);
      strokes = [sanitizeDrawAction(stroke)];
    } else strokes = candidate;
    if (encodeInteraction(packet(strokes)).byteLength > MAX_PACKET_BYTES) throw new RangeError("Traço excede o limite do quadro.");
  }
  if (strokes.length || !batches.length) batches.push(strokes);
  return batches.map((items, index) => packet(items, index, batches.length));
}

export function createPendingBoardSync(peer, requestId) {
  return { peer, requestId, batches: new Map(), count: null, epoch: null, strokes: 0, mutations: [], overflow: false };
}

export function recordBoardMutation(pending, operation) {
  if (!pending) return;
  if (pending.mutations.length >= MAX_SYNC_MUTATIONS) { pending.overflow = true; return; }
  pending.mutations.push(operation);
}

export function collectBoardSnapshot(pending, message, sender) {
  if (!pending || pending.overflow || message.protocol !== 2 || sender !== pending.peer
      || message.requestId !== pending.requestId || !validEpoch(message.boardEpoch)) return null;
  const { batchIndex, batchCount } = message;
  if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > MAX_BOARD_ACTIONS
      || !Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= batchCount
      || !Array.isArray(message.strokes) || message.strokes.length > 12
      || encodeInteraction(message).byteLength > MAX_PACKET_BYTES) return null;
  if (pending.count !== null && (batchCount !== pending.count || compareEpoch(message.boardEpoch, pending.epoch) !== 0)) return null;
  if (pending.batches.has(batchIndex)) return null;
  if (pending.strokes + message.strokes.length > MAX_BOARD_ACTIONS) { pending.overflow = true; return null; }
  if (message.strokes.some((stroke) => !stroke || typeof stroke.id !== "string" || !stroke.id)) return null;
  pending.count = batchCount;
  pending.epoch = [...message.boardEpoch];
  pending.strokes += message.strokes.length;
  pending.batches.set(batchIndex, message.strokes.map(sanitizeDrawAction).filter((stroke) => stroke.points.length > 1));
  if (pending.batches.size !== batchCount) return null;
  const byId = new Map();
  for (let index = 0; index < batchCount; index++) {
    for (const stroke of pending.batches.get(index)) byId.set(stroke.id, stroke);
  }
  return { epoch: pending.epoch, strokes: [...byId.values()] };
}

export function restoreBoardSnapshot(current, snapshot, mutations) {
  if (compareEpoch(snapshot.epoch, current.epoch) < 0) return current;
  // Replay live edits made/received while the transfer was in flight. An undo
  // must win over an older snapshot containing that same stroke.
  return mutations.reduce(applyBoardOperation, snapshot);
}

export function boardResponderCandidates(room, requester) {
  const participants = [room.localParticipant, ...room.remoteParticipants.values()];
  const joinedAt = (participant) => {
    const timestamp = participant.joinedAt?.getTime?.();
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
  };
  // Prefer the longest-present participant over another newcomer still syncing.
  // Identity is a deterministic tie-breaker when the SDK has no join timestamp.
  return participants.filter((participant) => participant.identity !== requester
      && participant.permissions?.canPublishData !== false)
    .sort((left, right) => joinedAt(left) - joinedAt(right)
      || (left.identity < right.identity ? -1 : left.identity > right.identity ? 1 : 0))
    .map((participant) => participant.identity);
}
