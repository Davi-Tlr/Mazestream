import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { REACTION_ICONS } from "./icons.jsx";

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
  onStroke, onErase, onPing, onCursor, onReactionAt
}) {
  const areaRef = useRef(null);
  const currentRef = useRef(null);
  const lastCursorRef = useRef(0);
  const [liveStroke, setLiveStroke] = useState(null);
  const color = (brush && brush.color) || "#111111";
  const width = (brush && brush.width) || 5;
  const drawing = tool === "draw" || tool === "eraser";

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
    if (tool === "eraser") { onErase(point); currentRef.current = "erasing"; return; }
    currentRef.current = [point];
    setLiveStroke([point]);
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
    if (tool === "eraser") { onErase(point); return; }
    const points = currentRef.current;
    const last = points[points.length - 1];
    if (Math.abs(point[0] - last[0]) < 0.003 && Math.abs(point[1] - last[1]) < 0.003) return;
    points.push(point);
    setLiveStroke(points.slice());
  }

  function handleUp(event) {
    if (!drawing || !currentRef.current) return;
    event.stopPropagation();
    const points = currentRef.current;
    currentRef.current = null;
    if (points === "erasing") return;
    setLiveStroke(null);
    if (points.length > 1) onStroke(points, color, width);
  }

  const path = (points) => points.map((point, index) => (index ? "L" : "M") + (point[0] * 100).toFixed(2) + " " + (point[1] * 100).toFixed(2)).join(" ");
  const pings = (interactions || []).filter((item) => item.type === "ping");
  const cursors = (interactions || []).filter((item) => item.type === "cursor");
  const reactions = (interactions || []).filter((item) => item.type === "reaction");

  return (
    <div ref={areaRef} className={"shared-board" + (tool ? " interactive" : "")}
      onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
      onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {(strokes || []).map((stroke) => (
          <path key={stroke.id} d={path(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {liveStroke && liveStroke.length > 1 && (
          <path d={path(liveStroke)} fill="none" stroke={color} strokeWidth={width}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

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
          const Icon = REACTION_ICONS[reaction.reaction];
          if (!Icon) return null;
          return (
            <motion.div key={reaction.id} className="interaction-reaction board-reaction"
              style={{ left: reaction.x * 100 + "%", top: reaction.y * 100 + "%", fontSize: 22 + (reaction.size || 0) * 16 }}
              initial={{ y: 0, opacity: 0, scale: 0.4 }} animate={{ y: -210, opacity: [0, 1, 1, 0], scale: 1 }}
              exit={{ opacity: 0 }} transition={{ duration: 3.2 + (reaction.speed || 0), ease: "easeOut" }}>
              <Icon /><span className="interaction-author">{reaction.author}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
