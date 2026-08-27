import { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getVideoContentArea, REACTION_EMOJIS, toNormalizedVideoPoint } from "../interactions.js";
import { useAreaPing } from "../useAreaPing.js";
import AreaPing from "./AreaPing.jsx";
import SharedCursors from "./SharedCursors.jsx";
import { useSharedCursor } from "../useSharedCursor.js";

const DrawingCanvas = lazy(() => import("./DrawingCanvas.jsx"));

export default function InteractionOverlay({
  videoRef, tileKey, tool, items, brush, markerStyle = "ring", pendingReaction,
  onPing, onStroke, onCursor, onReactionAt, canInteract = false
}) {
  const color = (brush && brush.color) || "#ffffff";
  const width = (brush && brush.width) || 5;
  const drawTool = (brush && brush.tool) || "pen";
  const opacity = drawTool === "marker" ? 0.32 : 1;
  const [area, setArea] = useState(null);
  const strokeRef = useRef(null);
  const [liveStroke, setLiveStroke] = useState(null);

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
  const ping = useAreaPing({ getPoint, onPing, enabled: canInteract, tool });
  const cursor = useSharedCursor({ getPoint, onCursor, enabled: canInteract && tool === "cursor", surfaceKey: tileKey });

  function handleDown(event) {
    cursor.move(event);
    if (ping.down(event, canInteract, tool)) return;
    if (!canInteract || event.button !== 0 || event.isPrimary === false) return;
    if (!tool) return;
    event.stopPropagation();
    const point = getPoint(event);
    if (!point) return;
    if (tool === "reaction") { if (pendingReaction) onReactionAt(point, pendingReaction); return; }
    if (!drawing) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const points = [[point.x, point.y]];
    strokeRef.current = points;
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
    if (event.pointerType === "touch") cursor.hide();
    if (ping.up(event)) return;
    if (!drawing || !strokeRef.current) return;
    event.stopPropagation();
    const points = strokeRef.current;
    strokeRef.current = null;
    setLiveStroke(null);
    if (points.length > 1) onStroke(points, color, width, drawTool, opacity);
  }

  function cancelGesture() {
    ping.cancel();
    cursor.hide();
    strokeRef.current = null;
    setLiveStroke(null);
  }

  if (!area) return null;

  const areaStyle = { position: "absolute", left: area.left, top: area.top, width: area.width, height: area.height };
  const strokes = (items || []).filter((item) => item.type === "stroke");
  const pings = (items || []).filter((item) => item.type === "ping");
  const reactions = (items || []).filter((item) => item.type === "reaction");

  return (
    <div className={"interaction-overlay" + (canInteract ? " interactive" : "") + (tool ? " active" : "")}
      data-drawing={drawing ? "true" : "false"} data-tool={tool || "none"} style={areaStyle}
      onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}
      onPointerEnter={cursor.move} onPointerLeave={() => { cursor.hide(); ping.cancel(); }}
      onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}
      onClick={ping.click} onContextMenu={ping.contextMenu}
      onAuxClick={(event) => { if (canInteract && event.button === 1) { event.preventDefault(); event.stopPropagation(); } }}>
      <Suspense fallback={null}>
        <DrawingCanvas actions={strokes} liveAction={liveStroke} />
      </Suspense>

      <AnimatePresence>{pings.map((ping) => <AreaPing key={ping.id} item={ping} />)}</AnimatePresence>

      <SharedCursors tile={tileKey} />

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
