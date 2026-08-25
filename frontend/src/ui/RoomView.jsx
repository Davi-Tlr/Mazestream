import { useState, useRef, useEffect } from "react";
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
import { Sol, Lua } from "./icons.jsx";
import { useTema } from "../tema.jsx";
import { fmtDuracao } from "../estado.js";
import { volumeKey } from "../collect.js";
import { OPCOES_ENVIO, OPCOES_RECEBER, MAX_TELAS, QUALIDADE_PT } from "../constants.js";

const STATUS = {
  idle: ["Conectando", "reconectando"], connecting: ["Conectando", "reconectando"],
  connected: ["Conectado", "conectado"], reconnecting: ["Reconectando", "reconectando"],
  disconnected: ["Desconectado", "desconectado"]
};
const COR_QUALIDADE = { excellent: "success", good: "green", poor: "warning", lost: "error", unknown: "default" };

function Toque({ children }) {
  return (
    <motion.span style={{ display: "inline-flex" }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }}>
      {children}
    </motion.span>
  );
}

export default function RoomView(props) {
  const {
    tiles, audios, pessoas, qtdTelas, connState,
    selecionado, setSelecionado, volumes, setVolumes,
    ajustes, setAjustes, micLigado, camLigada,
    salaAtual, meuEstado,
    onCompartilhar, onPararTransmissao, onPararTudo,
    onPausarLive, onRetomarLive, onTituloLive, onCopiarLink,
    onAlternarMic, onAlternarCam, onSair
  } = props;

  const [conexoesAberto, setConexoesAberto] = useState(false);
  const [ajustesAberto, setAjustesAberto] = useState(false);
  const [modo, setModo] = useState("padrao");
  const [agora, setAgora] = useState(Date.now());
  const [tituloLocal, setTituloLocal] = useState(meuEstado ? meuEstado.titulo : "");
  const salaRef = useRef(null);
  const tema = useTema();

  // Cronometro da live: 1 tick por segundo (barato, so quando montado).
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Sincroniza o campo de titulo quando a metadata muda por fora.
  useEffect(() => { setTituloLocal(meuEstado ? meuEstado.titulo : ""); }, [meuEstado && meuEstado.titulo]);

  const transmitindo = meuEstado && (meuEstado.estado === "ao_vivo" || meuEstado.estado === "pausado");

  // Tela cheia do PC (nativa) fica em sincronia com o modo.
  useEffect(() => {
    function onFs() {
      if (!document.fullscreenElement) {
        setModo((m) => (m === "cheia-pc" ? "padrao" : m));
      }
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function irCheiaPC() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); setModo("padrao"); return; }
      if (salaRef.current && salaRef.current.requestFullscreen) {
        await salaRef.current.requestFullscreen();
        setModo("cheia-pc");
      }
    } catch (e) {}
  }
  function trocarModo(m) {
    if (m === "cheia-pc") { irCheiaPC(); return; }
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
    setModo(m);
  }

  // Atalhos: f (tela cheia PC), t (teatro), m (mudo geral), esc (volta ao padrao).
  useEffect(() => {
    function onKey(e) {
      const alvo = e.target;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "f") { e.preventDefault(); irCheiaPC(); }
      else if (k === "t") { e.preventDefault(); trocarModo(modo === "teatro" ? "padrao" : "teatro"); }
      else if (k === "m") { e.preventDefault(); setAjustes((a) => ({ ...a, silenciarTudo: !a.silenciarTudo })); }
      else if (k === "escape") { if (!document.fullscreenElement && modo !== "padrao") setModo("padrao"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modo, setAjustes]);

  const chaves = tiles.map((t) => t.key);
  let selKey = selecionado && chaves.includes(selecionado) ? selecionado : null;
  if (!selKey) {
    const tela = tiles.find((t) => t.ehTela);
    selKey = tela ? tela.key : (tiles[0] ? tiles[0].key : null);
  }
  const selTile = tiles.find((t) => t.key === selKey) || null;
  const outros = tiles.filter((t) => t.key !== selKey);

  function volAtual(key) { return volumes[key] || { value: 100, muted: !!ajustes.iniciarMutado }; }
  function definirVol(key, pct) { setVolumes((p) => ({ ...p, [key]: { value: pct, muted: false } })); }
  function alternarMudo(key) {
    const cur = volAtual(key);
    setVolumes((p) => ({ ...p, [key]: { value: cur.value, muted: !cur.muted } }));
  }

  function renderTile(tile, ehDestaque) {
    const chaveVol = volumeKey(tile.sid, tile.pubName);
    return (
      <VideoTile
        key={tile.key}
        tile={tile}
        destaque={ehDestaque}
        agora={agora}
        onSelect={setSelecionado}
        mostrarVolume={ehDestaque && tile.ehTela && !tile.ehLocal}
        volume={volAtual(chaveVol)}
        onVolume={(v) => definirVol(chaveVol, v)}
        onMute={() => alternarMudo(chaveVol)}
        onParar={onPararTransmissao}
      />
    );
  }

  const [statusTexto, statusClasse] = STATUS[connState] || STATUS.connecting;

  const modoBtns = [
    { m: "padrao", ic: <AppstoreOutlined />, t: "Padrão (lado a lado)" },
    { m: "teatro", ic: <PicCenterOutlined />, t: "Teatro (miniaturas embaixo)" },
    { m: "cheia-app", ic: <ExpandOutlined />, t: "Tela cheia do app" },
    { m: "cheia-pc", ic: <FullscreenOutlined />, t: "Tela cheia do PC (F)" }
  ];

  return (
    <div className="sala" data-modo={modo} ref={salaRef}>
      <header className="topo">
        <div className="marca">Mazestream</div>
        <div className="sala-destino">
          {meuEstado && meuEstado.estado === "ao_vivo" && (
            <span className="live-pill ao-vivo"><span className="pt" /> AO VIVO · {fmtDuracao(agora - meuEstado.desde)}</span>
          )}
          {meuEstado && meuEstado.estado === "pausado" && (
            <span className="live-pill pausado"><PauseOutlined /> EM PAUSA</span>
          )}
          <span className="viewers"><TeamOutlined /> {pessoas.length}</span>
          <b>{qtdTelas} ao vivo</b>
        </div>
      </header>

      <div className="meio">
        <LayoutGroup>
          <main className="stage">
            {selTile ? renderTile(selTile, true) : (
              <div className="tile destaque" style={{ cursor: "default" }}>
                <div className="tile-vazio">
                  <div><strong>Nada sendo compartilhado</strong>
                    <span>Clique em Compartilhar tela pra começar.</span></div>
                </div>
              </div>
            )}
          </main>
          <aside className="rail">
            {outros.length === 0 && selTile && <div className="rail-vazio">Só esta transmissão por enquanto.</div>}
            <AnimatePresence>{outros.map((t) => renderTile(t, false))}</AnimatePresence>
          </aside>
        </LayoutGroup>
      </div>

      {audios.map((a) => (
        <AudioSink key={a.key} track={a.track}
          volume={volAtual(volumeKey(a.sid, a.pubName))} muteAll={ajustes.silenciarTudo} />
      ))}

      <div className="barra">
        <Toque><Button type="primary" icon={<DesktopOutlined />} disabled={qtdTelas >= MAX_TELAS} onClick={onCompartilhar}>
          {qtdTelas === 0 ? "Compartilhar tela" : (qtdTelas === 1 ? "Compartilhar outra" : "Limite atingido")}
        </Button></Toque>
        <Toque><Button icon={<StopOutlined />} danger disabled={qtdTelas === 0} onClick={onPararTudo}>
          {qtdTelas > 1 ? "Parar tudo" : "Parar"}
        </Button></Toque>
        {qtdTelas > 0 && (meuEstado && meuEstado.estado === "pausado"
          ? <Toque><Button icon={<CaretRightOutlined />} type="primary" onClick={onRetomarLive}>Retomar</Button></Toque>
          : <Toque><Button icon={<PauseOutlined />} onClick={onPausarLive}>Pausar</Button></Toque>)}
        <Toque><Button icon={micLigado ? <AudioOutlined /> : <AudioMutedOutlined />} type={micLigado ? "primary" : "default"} onClick={onAlternarMic}>Microfone</Button></Toque>
        <Toque><Button icon={<VideoCameraOutlined />} type={camLigada ? "primary" : "default"} onClick={onAlternarCam}>Câmera</Button></Toque>

        <span className="espaco" />

        <span className="modos">
          {modoBtns.map((b) => (
            <Toque key={b.m}>
              <Tooltip title={b.t}>
                <Button type={modo === b.m ? "primary" : "default"} icon={b.ic} aria-label={b.t} onClick={() => trocarModo(b.m)} />
              </Tooltip>
            </Toque>
          ))}
        </span>

        <span className={"status " + statusClasse}>{statusTexto}</span>
        <Toque>
          <Tooltip title={tema.escuro ? "Tema claro" : "Tema escuro"}>
            <Button className="tema-btn" aria-label="Alternar tema"
              icon={tema.escuro ? <Sol /> : <Lua />} onClick={tema.alternar} />
          </Tooltip>
        </Toque>
        <Toque><Tooltip title="Copiar link da sala"><Button icon={<LinkOutlined />} onClick={onCopiarLink}>Convidar</Button></Tooltip></Toque>
        <Toque><Button icon={<SettingOutlined />} onClick={() => setAjustesAberto(true)}>Ajustes</Button></Toque>
        <Toque><Button icon={<TeamOutlined />} onClick={() => setConexoesAberto(true)}>Conexões</Button></Toque>
        <Toque><Button icon={<LogoutOutlined />} onClick={onSair}>Sair</Button></Toque>
      </div>

      <Drawer title="Conexão dos participantes" placement="right" open={conexoesAberto} onClose={() => setConexoesAberto(false)} width={320}>
        {pessoas.length === 0 && <Empty description="Ninguém por aqui" />}
        {pessoas.map((p) => (
          <div className="pessoa" key={p.key}>
            <span>{p.nome}</span>
            <Tag color={COR_QUALIDADE[p.quality] || "default"} style={{ marginInlineEnd: 0 }}>{QUALIDADE_PT[p.quality] || "..."}</Tag>
          </div>
        ))}
      </Drawer>

      <Drawer title="Ajustes" placement="right" open={ajustesAberto} onClose={() => setAjustesAberto(false)} width={340}>
        <div className="drawer-grupo">
          <span className="drawer-titulo">Aparência</span>
          <div className="drawer-linha"><span>Tema</span>
            <Segmented value={tema.pref} onChange={(v) => tema.definir(v)}
              options={[
                { value: "auto", label: "Auto" },
                { value: "claro", label: "Claro" },
                { value: "escuro", label: "Escuro" }
              ]} /></div>
        </div>
        <div className="drawer-grupo">
          <span className="drawer-titulo">Sua transmissão</span>
          <div className="drawer-linha" style={{ display: "block" }}>
            <span style={{ display: "block", marginBottom: 8 }}>Título (aparece pra quem assiste)</span>
            <Input value={tituloLocal} placeholder="Ex: Elden Ring co-op" maxLength={80}
              onChange={(e) => setTituloLocal(e.target.value)}
              onBlur={() => onTituloLive(tituloLocal)}
              onPressEnter={() => onTituloLive(tituloLocal)} />
          </div>
          <div className="drawer-linha"><span>Situação</span>
            <span className="drawer-valor">
              {!transmitindo ? "Fora do ar"
                : (meuEstado.estado === "pausado" ? "Em pausa"
                  : "Ao vivo · " + fmtDuracao(agora - meuEstado.desde))}
            </span></div>
          <div className="drawer-linha"><span>Assistindo agora</span>
            <span className="drawer-valor">{pessoas.length}</span></div>
          <div className="drawer-linha" style={{ borderTop: 0, paddingTop: 4 }}>
            <Button icon={<LinkOutlined />} block onClick={onCopiarLink}>Copiar link da sala</Button></div>
        </div>
        <div className="drawer-grupo">
          <span className="drawer-titulo">Quando eu compartilho</span>
          <div className="drawer-linha"><span>Enviar áudio do sistema</span>
            <Switch checked={ajustes.audioAoCompartilhar} onChange={(v) => setAjustes((a) => ({ ...a, audioAoCompartilhar: v }))} /></div>
          <div className="drawer-linha"><span>Qualidade que eu envio</span>
            <Select value={ajustes.qualidadeEnvio} options={OPCOES_ENVIO} style={{ width: 150 }}
              onChange={(v) => setAjustes((a) => ({ ...a, qualidadeEnvio: v }))} /></div>
        </div>
        <div className="drawer-grupo">
          <span className="drawer-titulo">Quando eu assisto</span>
          <div className="drawer-linha"><span>Qualidade que eu recebo</span>
            <Select value={ajustes.qualidadeRecebo} options={OPCOES_RECEBER} style={{ width: 150 }}
              onChange={(v) => setAjustes((a) => ({ ...a, qualidadeRecebo: v }))} /></div>
          <div className="drawer-linha"><span>Iniciar transmissões mutadas</span>
            <Switch checked={ajustes.iniciarMutado} onChange={(v) => setAjustes((a) => ({ ...a, iniciarMutado: v }))} /></div>
          <div className="drawer-linha"><span>Silenciar todo o áudio</span>
            <Switch checked={ajustes.silenciarTudo} onChange={(v) => setAjustes((a) => ({ ...a, silenciarTudo: v }))} /></div>
        </div>
        <p className="drawer-nota">Atalhos: F tela cheia, T teatro, M silenciar tudo. Desligar o áudio do
          sistema evita puxar a voz do Discord pra dentro da transmissão.</p>
      </Drawer>
    </div>
  );
}
