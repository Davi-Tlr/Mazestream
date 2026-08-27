import { useRef, useEffect, useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Slider, Tooltip } from "antd";
import {
  ExportOutlined, FullscreenOutlined, FullscreenExitOutlined, StopOutlined
} from "@ant-design/icons";
import StateOverlay from "./StateOverlay.jsx";
import InteractionOverlay from "./InteractionOverlay.jsx";
import { fmtDuration } from "../state.js";

function Touch({ children }) {
  return (
    <motion.span style={{ display: "inline-flex" }} whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }}>
      {children}
    </motion.span>
  );
}

const TileLiveBadge = memo(function TileLiveBadge({ desde }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!desde) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [desde]);

  return (
    <div className="badge badge-live">
      AO VIVO{desde ? " · " + fmtDuration(now - desde) : ""}
    </div>
  );
});

const VideoTile = memo(function VideoTile({
  tile, destaque, agora, onSelect, mostrarVolume, volume, onVolume, onMute, onParar,
  interactions, interactionTool, brush, markerStyle, pendingReaction,
  onPing, onStroke, onCursor, onReactionAt
}) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVisible, setIsVisible] = useState(destaque);

  useEffect(() => {
    if (destaque) { setIsVisible(true); return; }
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, { threshold: 0.01 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [destaque]);

  useEffect(() => {
    const el = videoRef.current;
    const track = tile.track;
    if (!isVisible || !el || !track) return;
    track.attach(el);
    return () => { try { track.detach(el); } catch (e) {} };
  }, [tile.track, isVisible]);

  useEffect(() => {
    function onFs() { setIsFullscreen(document.fullscreenElement === videoRef.current); }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function togglePiP(e) {
    e.stopPropagation();
    const v = videoRef.current;
    try {
      if (document.pictureInPictureElement === v) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        await v.requestPictureInPicture();
      }
    } catch (err) {}
  }

  async function toggleFullscreen(e) {
    e.stopPropagation();
    const v = videoRef.current;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        return;
      }
      if (v && v.requestFullscreen) await v.requestFullscreen();
      else if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
      if (screen.orientation && screen.orientation.lock) {
        try { await screen.orientation.lock("landscape"); } catch (err) {}
      }
    } catch (err) {}
  }

  const classes = ["tile"];
  if (destaque) classes.push("destaque");
  if (tile.isLocal) classes.push("local");
  if (tile.quality === "poor") classes.push("quality-poor");
  if (tile.quality === "lost") classes.push("quality-lost");

  return (
    <motion.div
      ref={wrapRef}
      layout
      layoutId={"tile-" + tile.key}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      className={classes.join(" ")}
      onClick={() => onSelect(tile.key)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(tile.key); } }}
      aria-label={"Assistir " + tile.name}
    >
      <video ref={videoRef} autoPlay playsInline muted />

      {tile.isLocal && (
        <div className="badge">{tile.isScreen ? "Sua transmissão" : "Sua câmera"}</div>
      )}
      {tile.isScreen && !tile.isLocal && tile.state && tile.state.estado === "ao_vivo" && (
        <TileLiveBadge desde={tile.state.desde} />
      )}

      <div className="actions" onClick={(e) => e.stopPropagation()}>
        {tile.isLocal && tile.isScreen && (
          <Touch>
            <Tooltip title="Parar esta transmissão">
              <Button className="btn-parar" size="small" danger icon={<StopOutlined />}
                aria-label="Parar transmissão"
                onClick={(e) => { e.stopPropagation(); onParar(tile.pubName); }} />
            </Tooltip>
          </Touch>
        )}
        <Touch>
          <Tooltip title="Janela flutuante (PiP)">
            <Button className="btn-pip" size="small" icon={<ExportOutlined />} aria-label="Janela flutuante" onClick={togglePiP} />
          </Tooltip>
        </Touch>
        <Touch>
          <Tooltip title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}>
            <Button className="btn-full" size="small" icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              aria-label="Tela cheia" onClick={toggleFullscreen} />
          </Tooltip>
        </Touch>
      </div>

      <div className="tile-label">{tile.name}</div>

      {mostrarVolume && (
        <div className="vol-bar" onClick={(e) => e.stopPropagation()}>
          <span className="vol-lbl">Vol</span>
          <Slider style={{ width: 92, margin: 0 }} min={0} max={100}
            value={volume.muted ? 0 : volume.value}
            onChange={(v) => onVolume(v)} tooltip={{ formatter: (v) => v + "%" }} />
          <Button size="small" onClick={(e) => { e.stopPropagation(); onMute(); }}>
            {volume.muted ? "Ativar" : "Mudo"}
          </Button>
        </div>
      )}

      {destaque && (
        <InteractionOverlay
          videoRef={videoRef}
          tool={interactionTool}
          items={interactions || []}
          brush={brush}
          markerStyle={markerStyle}
          pendingReaction={pendingReaction}
          onPing={onPing}
          onStroke={onStroke}
          onCursor={onCursor}
          onReactionAt={onReactionAt}
        />
      )}

      <AnimatePresence>
        {tile.state && tile.state.estado === "pausado" && (
          <StateOverlay state={tile.state} author={tile.isLocal ? "Você" : tile.author} />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default VideoTile;
