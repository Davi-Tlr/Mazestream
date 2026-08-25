import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Slider, Tooltip } from "antd";
import {
  ExportOutlined, FullscreenOutlined, FullscreenExitOutlined, StopOutlined
} from "@ant-design/icons";
import EstadoOverlay from "./EstadoOverlay.jsx";
import { fmtDuracao } from "../estado.js";

// Envolve um controle e da micro-interacao de hover/tap.
function Toque({ children }) {
  return (
    <motion.span style={{ display: "inline-flex" }} whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }}>
      {children}
    </motion.span>
  );
}

export default function VideoTile({
  tile, destaque, agora, onSelect, mostrarVolume, volume, onVolume, onMute, onParar
}) {
  const videoRef = useRef(null);
  const [emTelaCheia, setEmTelaCheia] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    const track = tile.track;
    if (el && track) track.attach(el);
    return () => { if (track) try { track.detach(el); } catch (e) {} };
  }, [tile.track]);

  useEffect(() => {
    function onFs() { setEmTelaCheia(document.fullscreenElement === videoRef.current); }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function flutuar(e) {
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

  async function telaCheia(e) {
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
  if (tile.ehLocal) classes.push("local");
  if (tile.quality === "poor") classes.push("qualidade-poor");
  if (tile.quality === "lost") classes.push("qualidade-lost");

  return (
    <motion.div
      layout
      layoutId={"tile-" + tile.key}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      className={classes.join(" ")}
      onClick={() => onSelect(tile.key)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(tile.key); } }}
      aria-label={"Assistir " + tile.nome}
    >
      <video ref={videoRef} autoPlay playsInline muted />

      {tile.ehLocal && (
        <div className="badge">{tile.ehTela ? "Sua transmissão" : "Sua câmera"}</div>
      )}
      {tile.ehTela && !tile.ehLocal && tile.estado && tile.estado.estado === "ao_vivo" && (
        <div className="badge badge-vivo">
          AO VIVO{tile.estado.desde ? " · " + fmtDuracao((agora || Date.now()) - tile.estado.desde) : ""}
        </div>
      )}

      <div className="acoes" onClick={(e) => e.stopPropagation()}>
        {tile.ehLocal && tile.ehTela && (
          <Toque>
            <Tooltip title="Parar esta transmissão">
              <Button className="btn-parar" size="small" danger icon={<StopOutlined />}
                aria-label="Parar transmissão"
                onClick={(e) => { e.stopPropagation(); onParar(tile.pubName); }} />
            </Tooltip>
          </Toque>
        )}
        <Toque>
          <Tooltip title="Janela flutuante (PiP)">
            <Button className="btn-pip" size="small" icon={<ExportOutlined />} aria-label="Picture-in-picture" onClick={flutuar} />
          </Tooltip>
        </Toque>
        <Toque>
          <Tooltip title={emTelaCheia ? "Sair da tela cheia" : "Tela cheia"}>
            <Button className="btn-full" size="small" icon={emTelaCheia ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              aria-label="Tela cheia" onClick={telaCheia} />
          </Tooltip>
        </Toque>
      </div>

      <div className="rotulo">{tile.nome}</div>

      {mostrarVolume && (
        <div className="volbar" onClick={(e) => e.stopPropagation()}>
          <span className="lbl">Vol</span>
          <Slider style={{ width: 92, margin: 0 }} min={0} max={150}
            value={volume.muted ? 0 : volume.value}
            onChange={(v) => onVolume(v)} tooltip={{ formatter: (v) => v + "%" }} />
          <Button size="small" onClick={(e) => { e.stopPropagation(); onMute(); }}>
            {volume.muted ? "Ativar" : "Mudo"}
          </Button>
        </div>
      )}

      <AnimatePresence>
        {tile.estado && tile.estado.estado === "pausado" && (
          <EstadoOverlay estado={tile.estado} autor={tile.ehLocal ? "Você" : tile.autor} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
