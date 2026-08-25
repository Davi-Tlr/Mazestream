import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getVideoContentArea, toNormalizedVideoPoint } from "../interactions.js";
import { REACTION_ICONS } from "./icons.jsx";

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
    strokeRef.current = [[point.x, point.y]];
    setLiveStroke([[point.x, point.y]]);
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
    const points = strokeRef.current;
    const last = points[points.length - 1];
    if (Math.abs(point.x - last[0]) < 0.004 && Math.abs(point.y - last[1]) < 0.004) return;
    points.push([point.x, point.y]);
    setLiveStroke(points.slice());
  }

  function handleUp(event) {
    if (!drawing || !strokeRef.current) return;
    event.stopPropagation();
    const points = strokeRef.current;
    strokeRef.current = null;
    setLiveStroke(null);
    if (points.length > 1) onStroke(points, color, width);
  }

  if (!area) return null;

  const areaStyle = { position: "absolute", left: area.left, top: area.top, width: area.width, height: area.height };
  const path = (points) => points.map((point, index) => (index ? "L" : "M") + (point[0] * 100).toFixed(2) + " " + (point[1] * 100).toFixed(2)).join(" ");
  const strokes = (items || []).filter((item) => item.type === "stroke");
  const pings = (items || []).filter((item) => item.type === "ping");
  const cursors = (items || []).filter((item) => item.type === "cursor");
  const reactions = (items || []).filter((item) => item.type === "reaction");

  return (
    <div className={"interaction-overlay" + (tool ? " active" : "")} style={areaStyle}
      onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
      onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}>
      <svg className="interaction-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {strokes.map((stroke) => (
          <path key={stroke.id} d={path(stroke.points)} fill="none" stroke={stroke.color || "#fff"}
            strokeWidth={stroke.width || 5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {liveStroke && liveStroke.length > 1 && (
          <path d={path(liveStroke)} fill="none" stroke={color} strokeWidth={width}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

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
          const Icon = REACTION_ICONS[reaction.reaction];
          if (!Icon) return null;
          const duration = 2.8 + (reaction.speed || 0) * 1.6;
          const drift = (reaction.drift || 0) * 90;
          return (
            <motion.div key={reaction.id} className="interaction-reaction"
              style={{ left: reaction.x * 100 + "%", top: reaction.y * 100 + "%", fontSize: 22 + (reaction.size || 0) * 16 }}
              initial={{ y: 0, x: 0, opacity: 0, scale: 0.4, rotate: 0 }}
              animate={{ y: -220 - (reaction.speed || 0) * 90, x: [0, drift * 0.6, drift * -0.4, drift], opacity: [0, 1, 1, 0], scale: 1, rotate: (reaction.drift || 0) * 22 }}
              exit={{ opacity: 0 }} transition={{ duration, ease: "easeOut" }}>
              <Icon /><span className="interaction-author">{reaction.author}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
