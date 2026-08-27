import { useCallback, useEffect, useRef, useState } from "react";
import { newInteractionId, sanitizeDrawAction } from "./interactions.js";
import { attachBoardChannel } from "./boardChannel.js";
import {
  applyBoardOperation, compareEpoch, createBoardDocument, nextBoardEpoch, recordBoardMutation
} from "./boardSync.js";

export function useBoard(room, canPublishData, sendData, message) {
  const documentRef = useRef(createBoardDocument());
  const ownerRef = useRef(null);
  const pendingRef = useRef(null);
  const historyRef = useRef({ undo: [], redo: [] });
  const [boardStrokes, setBoardStrokes] = useState([]);
  const [boardHistoryState, setBoardHistoryState] = useState({ canUndo: false, canRedo: false });

  const project = useCallback((next) => {
    if (compareEpoch(next.epoch, documentRef.current.epoch) !== 0) historyRef.current = { undo: [], redo: [] };
    documentRef.current = next;
    const ids = new Set(next.strokes.map((stroke) => stroke.id));
    historyRef.current.undo = historyRef.current.undo.filter((stroke) => ids.has(stroke.id));
    setBoardStrokes(next.strokes);
    setBoardHistoryState({ canUndo: historyRef.current.undo.length > 0, canRedo: historyRef.current.redo.length > 0 });
  }, []);

  const apply = useCallback((operation) => {
    recordBoardMutation(pendingRef.current, operation);
    project(applyBoardOperation(documentRef.current, operation));
  }, [project]);

  const addBoardStroke = useCallback((points, color, width, tool = "pen", opacity) => {
    if (!room || !canPublishData) return;
    const stroke = sanitizeDrawAction({ id: newInteractionId(), points, color, width, tool, opacity });
    if (stroke.points.length < 2) return;
    historyRef.current.undo = historyRef.current.undo.concat(stroke).slice(-400);
    historyRef.current.redo = [];
    const operation = { type: "board-stroke", t: "q-risco", ...stroke, boardEpoch: documentRef.current.epoch,
      pts: stroke.points, cor: stroke.color, espessura: stroke.width };
    apply(operation);
    sendData(operation, true);
  }, [room, canPublishData, apply, sendData]);

  const undoBoard = useCallback(() => {
    if (!room || !canPublishData) return;
    const stroke = historyRef.current.undo.pop();
    if (!stroke) return;
    historyRef.current.redo.push(stroke);
    const operation = { type: "board-erase", t: "q-apagar", ids: [stroke.id], boardEpoch: documentRef.current.epoch };
    apply(operation);
    sendData(operation, true);
  }, [room, canPublishData, apply, sendData]);

  const redoBoard = useCallback(() => {
    if (!room || !canPublishData) return;
    const previous = historyRef.current.redo.pop();
    if (!previous) return;
    const stroke = { ...previous, id: newInteractionId() };
    historyRef.current.undo = historyRef.current.undo.concat(stroke).slice(-400);
    const operation = { type: "board-stroke", t: "q-risco", ...stroke, boardEpoch: documentRef.current.epoch,
      pts: stroke.points, cor: stroke.color, espessura: stroke.width };
    apply(operation);
    sendData(operation, true);
  }, [room, canPublishData, apply, sendData]);

  const clearBoard = useCallback(() => {
    if (!room || !canPublishData) return;
    const operation = { type: "board-clear", t: "q-limpar",
      boardEpoch: nextBoardEpoch(documentRef.current, room.localParticipant.identity) };
    apply(operation);
    sendData(operation, true);
  }, [room, canPublishData, apply, sendData]);

  useEffect(() => {
    if (ownerRef.current !== room) {
      ownerRef.current = room;
      historyRef.current = { undo: [], redo: [] };
      project(createBoardDocument());
    }
    return attachBoardChannel({ room, canPublishData, sendData, message, documentRef, pendingRef, project, apply });
  }, [room, canPublishData, sendData, message, project, apply]);

  return { boardStrokes, boardHistoryState, addBoardStroke, undoBoard, redoBoard, clearBoard };
}
