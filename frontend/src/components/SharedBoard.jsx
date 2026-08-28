import { lazy, Suspense, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { REACTION_EMOJIS } from "../features/interactions/interactions.js";
import { useAreaPing } from "../hooks/useAreaPing.js";
import AreaPing from "./AreaPing.jsx";
import SharedCursors from "./SharedCursors.jsx";
import { useSharedCursor } from "../hooks/useSharedCursor.js";

const DrawingCanvas = lazy(() => import("./DrawingCanvas.jsx"));

export default function SharedBoard({
  strokes, tool, brush, interactions, markerStyle = "ring", pendingReaction,
  onStroke, onPing, onCursor, onReactionAt, canInteract = false
}) {
  const areaRef = useRef(null);
  const currentRef = useRef(null);
  const [liveStroke, setLiveStroke] = useState(null);
  const color = (brush && brush.color) || "#111111";
  const width = (brush && brush.width) || 5;
  const drawTool = (brush && brush.tool) || "pen";
  const opacity = drawTool === "marker" ? 0.32 : 1;
  const drawing = tool === "draw";

  const getPoint = useCallback((event) => {
    const el = areaRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const touch = event.touches && event.touches[0];
    const clientX = touch ? touch.clientX : event.clientX;
    const clientY = touch ? touch.clientY : event.clientY;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return [x, y];
  }, []);
  const getPingPoint = useCallback((event) => {
    const point = getPoint(event);
    return point ? { x: point[0], y: point[1] } : null;
  }, [getPoint]);
  const ping = useAreaPing({ getPoint: getPingPoint, onPing, enabled: canInteract, tool });
  const cursor = useSharedCursor({ getPoint: getPingPoint, onCursor, enabled: canInteract && tool === "cursor", surfaceKey: "board" });

  function handleDown(event) {
    cursor.move(event);
    if (ping.down(event, canInteract, tool)) return;
    if (!canInteract || event.button !== 0 || event.isPrimary === false) return;
    if (!tool) return;
    event.stopPropagation();
    const point = getPoint(event);
    if (!point) return;
    if (tool === "reaction") { if (pendingReaction) onReactionAt({ x: point[0], y: point[1] }, pendingReaction); return; }
    if (!drawing) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const points = [point];
    currentRef.current = points;
    setLiveStroke({ points, color, width, tool: drawTool, opacity });
  }

  function handleMove(event) {
    ping.move(event);
    cursor.move(event);
    if (!canInteract || event.isPrimary === false) return;
    if (!tool) return;
    const point = getPoint(event);
    if (!point) return;
    if (tool === "cursor") {
      event.stopPropagation();
      return;
    }
    if (!drawing || !currentRef.current) return;
    event.stopPropagation();
    let points = currentRef.current;
    const last = points[points.length - 1];
    if (Math.abs(point[0] - last[0]) < 0.003 && Math.abs(point[1] - last[1]) < 0.003) return;
    if (["line", "arrow", "rectangle", "ellipse"].includes(drawTool)) {
      points = [points[0], point];
      currentRef.current = points;
    } else {
      points.push(point);
    }
    setLiveStroke({ points: points.slice(), color, width, tool: drawTool, opacity });
  }

  function handleUp(event) {
    if (event.pointerType === "touch") cursor.hide();
    if (ping.up(event)) return;
    if (!drawing || !currentRef.current) return;
    event.stopPropagation();
    const points = currentRef.current;
    currentRef.current = null;
    setLiveStroke(null);
    if (points.length > 1) onStroke(points, color, width, drawTool, opacity);
  }

  function cancelGesture() {
    ping.cancel();
    cursor.hide();
    currentRef.current = null;
    setLiveStroke(null);
  }

  const pings = (interactions || []).filter((item) => item.type === "ping");
  const reactions = (interactions || []).filter((item) => item.type === "reaction");

  return (
    <div ref={areaRef} className={"shared-board" + (tool ? " interactive" : "")}
      data-drawing={drawing ? "true" : "false"} data-tool={tool || "none"}
      onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}
      onPointerEnter={cursor.move} onPointerLeave={() => { cursor.hide(); ping.cancel(); }}
      onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}
      onClick={ping.click} onContextMenu={ping.contextMenu}
      onAuxClick={(event) => { if (canInteract && event.button === 1) { event.preventDefault(); event.stopPropagation(); } }}>
      <Suspense fallback={null}>
        <DrawingCanvas actions={strokes || []} liveAction={liveStroke} />
      </Suspense>

      {(strokes || []).length === 0 && !liveStroke && (
        <div className="shared-board-empty">Quadro compartilhado. Escolha uma ferramenta e desenhe.</div>
      )}

      <AnimatePresence>{pings.map((ping) => <AreaPing key={ping.id} item={ping} />)}</AnimatePresence>
      <SharedCursors tile="board" />
      <AnimatePresence>
        {reactions.map((reaction) => {
          const emoji = REACTION_EMOJIS[reaction.reaction];
          if (!emoji) return null;
          const drift = (reaction.drift || 0) * 82;
          return (
            <motion.div key={reaction.id} className="interaction-reaction board-reaction"
              style={{ left: reaction.x * 100 + "%", top: reaction.y * 100 + "%", fontSize: 30 + (reaction.size || 0) * 20 }}
              initial={{ y: 0, x: 0, opacity: 0, scale: 0.4 }}
              animate={{ y: -210, x: [0, drift * 0.5, drift * -0.35, drift], opacity: [0, 1, 1, 0], scale: [0.4, 1.14, 1, 0.92] }}
              exit={{ opacity: 0 }} transition={{ duration: 3.2 + (reaction.speed || 0), ease: "easeOut" }}>
              <span className="reaction-emoji">{emoji}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
