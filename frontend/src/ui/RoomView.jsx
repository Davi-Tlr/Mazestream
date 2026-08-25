import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { LayoutGroup, AnimatePresence, motion } from "framer-motion";
import { Button, Drawer, Switch, Select, Segmented, Input, Tag, Empty, Tooltip } from "antd";
import {
  DesktopOutlined, StopOutlined, AudioOutlined, AudioMutedOutlined,
  VideoCameraOutlined, SettingOutlined, TeamOutlined, LogoutOutlined,
  AppstoreOutlined, PicCenterOutlined, ExpandOutlined, FullscreenOutlined,
  PauseOutlined, CaretRightOutlined, LinkOutlined
} from "@ant-design/icons";
import VideoTile from "./VideoTile.jsx";
import AudioSink from "./AudioSink.jsx";
import { Sun, Moon } from "./icons.jsx";
import { useTheme } from "../theme.jsx";
import { fmtDuration } from "../state.js";
import { volumeKey } from "../collect.js";
import { SEND_OPTIONS, RECEIVE_OPTIONS, MAX_SCREENS, QUALITY_LABELS } from "../constants.js";

const STATUS_MAP = {
  idle: ["Conectando", "reconectando"], connecting: ["Conectando", "reconectando"],
  connected: ["Conectado", "conectado"], reconnecting: ["Reconectando", "reconectando"],
  disconnected: ["Desconectado", "desconectado"]
};
const QUALITY_COLOR = { excellent: "success", good: "green", poor: "warning", lost: "error", unknown: "default" };

function Touch({ children }) {
  return (
    <motion.span style={{ display: "inline-flex" }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }}>
      {children}
    </motion.span>
  );
}

const LiveTimer = memo(function LiveTimer({ desde, estado }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (estado !== "ao_vivo") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [estado]);
  if (estado !== "ao_vivo" || !desde) return null;
  return <span className="live-pill live"><span className="pulse" /> AO VIVO · {fmtDuration(now - desde)}</span>;
});

const MemoTile = memo(function MemoTile({ tile, destaque, agora, onSelect, mostrarVolume, volume, onVolume, onMute, onParar }) {
  return (
    <VideoTile
      tile={tile}
      destaque={destaque}
      agora={agora}
      onSelect={onSelect}
      mostrarVolume={mostrarVolume}
      volume={volume}
      onVolume={onVolume}
      onMute={onMute}
      onParar={onParar}
    />
  );
});

export default function RoomView(props) {
  const {
    tiles, audios, people, screenCount, connState,
    selected, setSelected, volumes, setVolumes,
    settings, setSettings, micOn, camOn,
    currentRoom, myState,
    onShare, onStopBroadcast, onStopAll,
    onPauseLive, onResumeLive, onLiveTitle, onCopyLink,
    onToggleMic, onToggleCam, onLeave
  } = props;

  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState("default");
  const [titleLocal, setTitleLocal] = useState(myState ? myState.titulo : "");
  const roomRef = useRef(null);
  const theme = useTheme();

  // Drawer-only timer — does NOT cause re-renders on tiles.
  const [nowDrawer, setNowDrawer] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowDrawer(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setTitleLocal(myState ? myState.titulo : ""); }, [myState && myState.titulo]);

  const isLive = myState && (myState.estado === "ao_vivo" || myState.estado === "pausado");

  useEffect(() => {
    function onFs() {
      if (!document.fullscreenElement) {
        setLayoutMode((m) => (m === "fullscreen-pc" ? "default" : m));
      }
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function goFullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); setLayoutMode("default"); return; }
      if (roomRef.current && roomRef.current.requestFullscreen) {
        await roomRef.current.requestFullscreen();
        setLayoutMode("fullscreen-pc");
      }
    } catch (e) {}
  }
  function switchMode(m) {
    if (m === "fullscreen-pc") { goFullscreen(); return; }
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
    setLayoutMode(m);
  }

  useEffect(() => {
    function onKey(e) {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "f") { e.preventDefault(); goFullscreen(); }
      else if (k === "t") { e.preventDefault(); switchMode(layoutMode === "theater" ? "default" : "theater"); }
      else if (k === "m") { e.preventDefault(); setSettings((s) => ({ ...s, muteAll: !s.muteAll })); }
      else if (k === "escape") { if (!document.fullscreenElement && layoutMode !== "default") setLayoutMode("default"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layoutMode, setSettings]);

  const { selTile, others } = useMemo(() => {
    let selKey = selected && tiles.some((t) => t.key === selected) ? selected : null;
    if (!selKey) {
      const screen = tiles.find((t) => t.isScreen);
      selKey = screen ? screen.key : (tiles[0] ? tiles[0].key : null);
    }
    const sel = tiles.find((t) => t.key === selKey) || null;
    const out = sel ? tiles.filter((t) => t.key !== selKey) : tiles;
    return { selTile: sel, others: out };
  }, [tiles, selected]);

  const volCurrent = useCallback((key) => volumes[key] || { value: 100, muted: !!settings.startMuted }, [volumes, settings.startMuted]);
  const setVol = useCallback((key, pct) => setVolumes((p) => ({ ...p, [key]: { value: pct, muted: false } })), []);
  const toggleMute = useCallback((key) => {
    setVolumes((p) => {
      const cur = p[key] || { value: 100, muted: false };
      return { ...p, [key]: { value: cur.value, muted: !cur.muted } };
    });
  }, []);

  const renderTile = useCallback((tile, ehDestaque) => {
    const volKey = volumeKey(tile.sid, tile.pubName);
    return (
      <MemoTile
        key={tile.key}
        tile={tile}
        destaque={ehDestaque}
        agora={0}
        onSelect={setSelected}
        mostrarVolume={ehDestaque && tile.isScreen && !tile.isLocal}
        volume={volCurrent(volKey)}
        onVolume={(v) => setVol(volKey, v)}
        onMute={() => toggleMute(volKey)}
        onParar={onStopBroadcast}
      />
    );
  }, [setSelected, volCurrent, setVol, toggleMute, onStopBroadcast]);

  const [statusText, statusClass] = STATUS_MAP[connState] || STATUS_MAP.connecting;

  const layoutBtns = [
    { m: "default", ic: <AppstoreOutlined />, t: "Padrao (lado a lado)" },
    { m: "theater", ic: <PicCenterOutlined />, t: "Teatro (miniaturas embaixo)" },
    { m: "fullscreen-app", ic: <ExpandOutlined />, t: "Tela cheia do app" },
    { m: "fullscreen-pc", ic: <FullscreenOutlined />, t: "Tela cheia do PC (F)" }
  ];

  return (
    <div className="room" data-mode={layoutMode} ref={roomRef}>
      <header className="header">
        <div className="brand">Mazestream</div>
        <div className="room-info">
          <LiveTimer desde={myState && myState.desde} estado={myState && myState.estado} />
          {myState && myState.estado === "pausado" && (
            <span className="live-pill paused"><PauseOutlined /> EM PAUSA</span>
          )}
          <span className="viewers"><TeamOutlined /> {people.length}</span>
          <b>{screenCount} ao vivo</b>
        </div>
      </header>

      <div className="content">
        <LayoutGroup>
          <main className="stage">
            {selTile ? renderTile(selTile, true) : (
              <div className="tile destaque" style={{ cursor: "default" }}>
                <div className="tile-empty">
                  <div><strong>Nada sendo compartilhado</strong>
                    <span>Clique em Compartilhar tela pra comecar.</span></div>
                </div>
              </div>
            )}
          </main>
          <aside className="rail">
            {others.length === 0 && selTile && <div className="rail-empty">So esta transmissao por enquanto.</div>}
            <AnimatePresence>{others.map((t) => renderTile(t, false))}</AnimatePresence>
          </aside>
        </LayoutGroup>
      </div>

      {audios.map((a) => (
        <AudioSink key={a.key} track={a.track}
          volume={volCurrent(volumeKey(a.sid, a.pubName))} muteAll={settings.muteAll} />
      ))}

      <div className="toolbar">
        <Touch><Button type="primary" icon={<DesktopOutlined />} disabled={screenCount >= MAX_SCREENS} onClick={onShare}>
          {screenCount === 0 ? "Compartilhar tela" : (screenCount === 1 ? "Compartilhar outra" : "Limite atingido")}
        </Button></Touch>
        <Touch><Button icon={<StopOutlined />} danger disabled={screenCount === 0} onClick={onStopAll}>
          {screenCount > 1 ? "Parar tudo" : "Parar"}
        </Button></Touch>
        {screenCount > 0 && (myState && myState.estado === "pausado"
          ? <Touch><Button icon={<CaretRightOutlined />} type="primary" onClick={onResumeLive}>Retomar</Button></Touch>
          : <Touch><Button icon={<PauseOutlined />} onClick={onPauseLive}>Pausar</Button></Touch>)}
        <Touch><Button icon={micOn ? <AudioOutlined /> : <AudioMutedOutlined />} type={micOn ? "primary" : "default"} onClick={onToggleMic}>Microfone</Button></Touch>
        <Touch><Button icon={<VideoCameraOutlined />} type={camOn ? "primary" : "default"} onClick={onToggleCam}>Camera</Button></Touch>

        <span className="spacer" />

        <span className="modes">
          {layoutBtns.map((b) => (
            <Touch key={b.m}>
              <Tooltip title={b.t}>
                <Button type={layoutMode === b.m ? "primary" : "default"} icon={b.ic} aria-label={b.t} onClick={() => switchMode(b.m)} />
              </Tooltip>
            </Touch>
          ))}
        </span>

        <span className={"status " + statusClass}>{statusText}</span>
        <Touch>
          <Tooltip title={theme.dark ? "Tema claro" : "Tema escuro"}>
            <Button className="theme-btn" aria-label="Alternar tema"
              icon={theme.dark ? <Sun /> : <Moon />} onClick={theme.toggle} />
          </Tooltip>
        </Touch>
        <Touch><Tooltip title="Copiar link da sala"><Button icon={<LinkOutlined />} onClick={onCopyLink}>Convidar</Button></Tooltip></Touch>
        <Touch><Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>Ajustes</Button></Touch>
        <Touch><Button icon={<TeamOutlined />} onClick={() => setConnectionsOpen(true)}>Conexoes</Button></Touch>
        <Touch><Button icon={<LogoutOutlined />} onClick={onLeave}>Sair</Button></Touch>
      </div>

      <Drawer title="Conexao dos participantes" placement="right" open={connectionsOpen} onClose={() => setConnectionsOpen(false)} width={320}>
        {people.length === 0 && <Empty description="Ninguem por aqui" />}
        {people.map((p) => (
          <div className="person" key={p.key}>
            <span>{p.name}</span>
            <Tag color={QUALITY_COLOR[p.quality] || "default"} style={{ marginInlineEnd: 0 }}>{QUALITY_LABELS[p.quality] || "..."}</Tag>
          </div>
        ))}
      </Drawer>

      <Drawer title="Ajustes" placement="right" open={settingsOpen} onClose={() => setSettingsOpen(false)} width={340}>
        <div className="drawer-group">
          <span className="drawer-title">Aparencia</span>
          <div className="drawer-row"><span>Tema</span>
            <Segmented value={theme.pref} onChange={(v) => theme.setPref(v)}
              options={[
                { value: "auto", label: "Auto" },
                { value: "claro", label: "Claro" },
                { value: "escuro", label: "Escuro" }
              ]} /></div>
        </div>
        <div className="drawer-group">
          <span className="drawer-title">Sua transmissao</span>
          <div className="drawer-row" style={{ display: "block" }}>
            <span style={{ display: "block", marginBottom: 8 }}>Titulo (aparece pra quem assiste)</span>
            <Input value={titleLocal} placeholder="Ex: Elden Ring co-op" maxLength={80}
              onChange={(e) => setTitleLocal(e.target.value)}
              onBlur={() => onLiveTitle(titleLocal)}
              onPressEnter={() => onLiveTitle(titleLocal)} />
          </div>
          <div className="drawer-row"><span>Situacao</span>
            <span className="drawer-value">
              {!isLive ? "Fora do ar"
                : (myState.estado === "pausado" ? "Em pausa"
                  : "Ao vivo · " + fmtDuration(nowDrawer - myState.desde))}
            </span></div>
          <div className="drawer-row"><span>Assistindo agora</span>
            <span className="drawer-value">{people.length}</span></div>
          <div className="drawer-row" style={{ borderTop: 0, paddingTop: 4 }}>
            <Button icon={<LinkOutlined />} block onClick={onCopyLink}>Copiar link da sala</Button></div>
        </div>
        <div className="drawer-group">
          <span className="drawer-title">Quando eu compartilho</span>
          <div className="drawer-row"><span>Enviar audio do sistema</span>
            <Switch checked={settings.audioOnShare} onChange={(v) => setSettings((s) => ({ ...s, audioOnShare: v }))} /></div>
          <div className="drawer-row"><span>Qualidade que eu envio</span>
            <Select value={settings.sendQuality} options={SEND_OPTIONS} style={{ width: 150 }}
              onChange={(v) => setSettings((s) => ({ ...s, sendQuality: v }))} /></div>
        </div>
        <div className="drawer-group">
          <span className="drawer-title">Quando eu assisto</span>
          <div className="drawer-row"><span>Qualidade que eu recebo</span>
            <Select value={settings.receiveQuality} options={RECEIVE_OPTIONS} style={{ width: 150 }}
              onChange={(v) => setSettings((s) => ({ ...s, receiveQuality: v }))} /></div>
          <div className="drawer-row"><span>Iniciar transmissoes mutadas</span>
            <Switch checked={settings.startMuted} onChange={(v) => setSettings((s) => ({ ...s, startMuted: v }))} /></div>
          <div className="drawer-row"><span>Silenciar todo o audio</span>
            <Switch checked={settings.muteAll} onChange={(v) => setSettings((s) => ({ ...s, muteAll: v }))} /></div>
        </div>
        <p className="drawer-note">Atalhos: F tela cheia, T teatro, M silenciar tudo. Desligar o audio do
          sistema evita puxar a voz do Discord pra dentro da transmissao.</p>
      </Drawer>
    </div>
  );
}
