import { lazy, Suspense, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { REACTION_EMOJIS } from "../interactions.js";

const DrawingCanvas = lazy(() => import("./DrawingCanvas.jsx"));

function Marker({ item }) {
  const marker = item.marker || "ring";
  return (
    <motion.div key={item.id} className={"interaction-ping board-ping marker-" + marker}
      style={{ left: item.x * 100 + "%", top: item.y * 100 + "%" }}
      initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }}>
      {marker === "ring" && <span className="interaction-ping-ring" />}
      {marker === "arrow" && <span className="marker-arrow">➜</span>}
      {["1", "2", "3"].includes(marker) && <span className="marker-number">{marker}</span>}
      <span className="interaction-author">{item.author}</span>
    </motion.div>
  );
}

export default function SharedBoard({
  strokes, tool, brush, interactions, markerStyle = "ring", pendingReaction,
  onStroke, onPing, onCursor, onReactionAt
}) {
  const areaRef = useRef(null);
  const currentRef = useRef(null);
  const lastCursorRef = useRef(0);
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

  function handleDown(event) {
    if (!tool) return;
    event.stopPropagation();
    const point = getPoint(event);
    if (!point) return;
    if (tool === "point") { onPing({ x: point[0], y: point[1] }, markerStyle); return; }
    if (tool === "reaction") { if (pendingReaction) onReactionAt({ x: point[0], y: point[1] }, pendingReaction); return; }
    if (!drawing) return;
    const points = [point];
    currentRef.current = points;
    setLiveStroke({ points, color, width, tool: drawTool, opacity });
  }

  function handleMove(event) {
    if (!tool) return;
    const point = getPoint(event);
    if (!point) return;
    if (tool === "cursor") {
      event.stopPropagation();
      const now = performance.now();
      if (now - lastCursorRef.current >= 55) {
        lastCursorRef.current = now;
        onCursor({ x: point[0], y: point[1] });
      }
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
    if (!drawing || !currentRef.current) return;
    event.stopPropagation();
    const points = currentRef.current;
    currentRef.current = null;
    setLiveStroke(null);
    if (points.length > 1) onStroke(points, color, width, drawTool, opacity);
  }

  const pings = (interactions || []).filter((item) => item.type === "ping");
  const cursors = (interactions || []).filter((item) => item.type === "cursor");
  const reactions = (interactions || []).filter((item) => item.type === "reaction");

  return (
    <div ref={areaRef} className={"shared-board" + (tool ? " interactive" : "")}
      onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
      onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp} onTouchCancel={handleUp}>
      <Suspense fallback={null}>
        <DrawingCanvas actions={strokes || []} liveAction={liveStroke} />
      </Suspense>

      {(strokes || []).length === 0 && !liveStroke && (
        <div className="shared-board-empty">Quadro compartilhado. Escolha uma ferramenta e desenhe.</div>
      )}

      <AnimatePresence>{pings.map((ping) => <Marker key={ping.id} item={ping} />)}</AnimatePresence>
      <AnimatePresence>
        {cursors.map((cursor) => (
          <motion.div key={cursor.id} className="shared-cursor board-cursor"
            style={{ left: cursor.x * 100 + "%", top: cursor.y * 100 + "%" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="shared-cursor-arrow">➤</span><span className="interaction-author">{cursor.author}</span>
          </motion.div>
        ))}
      </AnimatePresence>
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
