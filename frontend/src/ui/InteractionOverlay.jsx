import { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getVideoContentArea, REACTION_EMOJIS, toNormalizedVideoPoint } from "../interactions.js";

const DrawingCanvas = lazy(() => import("./DrawingCanvas.jsx"));

function Marker({ item }) {
  const marker = item.marker || "ring";
  return (
    <motion.div key={item.id} className={"interaction-ping marker-" + marker}
      style={{ left: item.x * 100 + "%", top: item.y * 100 + "%" }}
      initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 1.5, opacity: 0 }} transition={{ type: "spring", stiffness: 520, damping: 24 }}>
      {marker === "ring" && <span className="interaction-ping-ring" />}
      {marker === "arrow" && <span className="marker-arrow">➜</span>}
      {["1", "2", "3"].includes(marker) && <span className="marker-number">{marker}</span>}
      <span className="interaction-author">{item.author}</span>
    </motion.div>
  );
}

export default function InteractionOverlay({
  videoRef, tool, items, brush, markerStyle = "ring", pendingReaction,
  onPing, onStroke, onCursor, onReactionAt
}) {
  const color = (brush && brush.color) || "#ffffff";
  const width = (brush && brush.width) || 5;
  const drawTool = (brush && brush.tool) || "pen";
  const opacity = drawTool === "marker" ? 0.32 : 1;
  const [area, setArea] = useState(null);
  const strokeRef = useRef(null);
  const [liveStroke, setLiveStroke] = useState(null);
  const lastCursorRef = useRef(0);

  useEffect(() => {
    const video = videoRef && videoRef.current;
    if (!video) return;
    const recalc = () => setArea(getVideoContentArea(video));
    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(video);
    video.addEventListener("loadedmetadata", recalc);
    video.addEventListener("resize", recalc);
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", recalc);
      video.removeEventListener("resize", recalc);
    };
  }, [videoRef]);

  const getPoint = useCallback((event) => {
    const video = videoRef && videoRef.current;
    if (!video) return null;
    const touch = event.touches && event.touches[0];
    return toNormalizedVideoPoint(video, touch ? touch.clientX : event.clientX, touch ? touch.clientY : event.clientY);
  }, [videoRef]);

  const drawing = tool === "draw";

  function handleDown(event) {
    if (!tool) return;
    event.stopPropagation();
    const point = getPoint(event);
    if (!point) return;
    if (tool === "point") { onPing(point, markerStyle); return; }
    if (tool === "reaction") { if (pendingReaction) onReactionAt(point, pendingReaction); return; }
    if (!drawing) return;
    const points = [[point.x, point.y]];
    strokeRef.current = points;
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
        onCursor(point);
      }
      return;
    }
    if (!drawing || !strokeRef.current) return;
    event.stopPropagation();
    let points = strokeRef.current;
    const last = points[points.length - 1];
    if (Math.abs(point.x - last[0]) < 0.004 && Math.abs(point.y - last[1]) < 0.004) return;
    if (["line", "arrow", "rectangle", "ellipse"].includes(drawTool)) {
      points = [points[0], [point.x, point.y]];
      strokeRef.current = points;
    } else {
      points.push([point.x, point.y]);
    }
    setLiveStroke({ points: points.slice(), color, width, tool: drawTool, opacity });
  }

  function handleUp(event) {
    if (!drawing || !strokeRef.current) return;
    event.stopPropagation();
    const points = strokeRef.current;
    strokeRef.current = null;
    setLiveStroke(null);
    if (points.length > 1) onStroke(points, color, width, drawTool, opacity);
  }

  if (!area) return null;

  const areaStyle = { position: "absolute", left: area.left, top: area.top, width: area.width, height: area.height };
  const strokes = (items || []).filter((item) => item.type === "stroke");
  const pings = (items || []).filter((item) => item.type === "ping");
  const cursors = (items || []).filter((item) => item.type === "cursor");
  const reactions = (items || []).filter((item) => item.type === "reaction");

  return (
    <div className={"interaction-overlay" + (tool ? " active" : "")} style={areaStyle}
      onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
      onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp} onTouchCancel={handleUp}>
      <Suspense fallback={null}>
        <DrawingCanvas actions={strokes} liveAction={liveStroke} />
      </Suspense>

      <AnimatePresence>{pings.map((ping) => <Marker key={ping.id} item={ping} />)}</AnimatePresence>

      <AnimatePresence>
        {cursors.map((cursor) => (
          <motion.div key={cursor.id} className="shared-cursor"
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
          const duration = 2.8 + (reaction.speed || 0) * 1.6;
          const drift = (reaction.drift || 0) * 90;
          return (
            <motion.div key={reaction.id} className="interaction-reaction"
              style={{ left: reaction.x * 100 + "%", top: reaction.y * 100 + "%", fontSize: 30 + (reaction.size || 0) * 20 }}
              initial={{ y: 0, x: 0, opacity: 0, scale: 0.4, rotate: 0 }}
              animate={{ y: -220 - (reaction.speed || 0) * 90, x: [0, drift * 0.6, drift * -0.4, drift], opacity: [0, 1, 1, 0], scale: [0.4, 1.14, 1, 0.92], rotate: (reaction.drift || 0) * 22 }}
              exit={{ opacity: 0 }} transition={{ duration, ease: "easeOut" }}>
              <span className="reaction-emoji">{emoji}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
