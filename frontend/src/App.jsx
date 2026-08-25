import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { App as AntApp } from "antd";
import { Track, VideoQuality, AudioPresets } from "livekit-client";
import { useRoom } from "./useRoom.js";
import { coletarTiles, coletarAudios, coletarPessoas } from "./collect.js";
import { lerEstado, montarEstado } from "./estado.js";
import { PRESETS_ENVIO, MAX_TELAS, AJUSTES_PADRAO } from "./constants.js";
import JoinScreen from "./ui/JoinScreen.jsx";
import RoomView from "./ui/RoomView.jsx";

const MAPA_RECEBER = {
  alta: VideoQuality.HIGH,
  media: VideoQuality.MEDIUM,
  baixa: VideoQuality.LOW
};

function carregarAjustes() {
  try {
    const salvo = JSON.parse(localStorage.getItem("ajustes") || "{}");
    // Migra quem vinha da versao antiga, cujo padrao era 1080p/6 Mbps.
    // Sem isso, o localStorage manteria "alta" mesmo depois de corrigirmos o default.
    if (salvo.configVersion !== AJUSTES_PADRAO.configVersion) {
      return { ...AJUSTES_PADRAO, ...salvo, configVersion: AJUSTES_PADRAO.configVersion, qualidadeEnvio: "media", qualidadeRecebo: "auto" };
    }
    return { ...AJUSTES_PADRAO, ...salvo };
  } catch (e) {
    return { ...AJUSTES_PADRAO };
  }
}

export default function App() {
  const { message } = AntApp.useApp();
  const { roomRef, tick, connState, connect, disconnect, bump } = useRoom();

  const [fase, setFase] = useState("entrar");
  const [entrando, setEntrando] = useState(false);
  const [salaAtual, setSalaAtual] = useState("");
  const [ajustes, setAjustes] = useState(carregarAjustes);
  const [volumes, setVolumes] = useState({});
  const [selecionado, setSelecionado] = useState(null);
  const [micLigado, setMicLigado] = useState(false);
  const [camLigada, setCamLigada] = useState(false);
  const sequenciaRef = useRef(0);

  useEffect(() => {
    try { localStorage.setItem("ajustes", JSON.stringify(ajustes)); } catch (e) {}
  }, [ajustes]);

  const room = roomRef.current;
  const tiles = useMemo(() => coletarTiles(room), [room, tick]);
  const audios = useMemo(() => coletarAudios(room), [room, tick]);
  const pessoas = useMemo(() => coletarPessoas(room), [room, tick]);
  const qtdTelas = tiles.filter((t) => t.ehLocal && t.ehTela).length;
  const meuEstado = useMemo(() => lerEstado(room ? room.localParticipant : null), [room, tick]);

  // Escreve a metadata da propria live (titulo/estado/desde). Barato: nada de video.
  const atualizarMeta = useCallback(async (patch) => {
    if (!room) return;
    const novo = { ...lerEstado(room.localParticipant), ...patch };
    try { await room.localParticipant.setMetadata(montarEstado(novo)); bump(); } catch (e) {}
  }, [room, bump]);

  // Aplica a qualidade escolhida nas transmissoes que voce recebe.
  useEffect(() => {
    if (!room) return;
    // Em "auto" nao fixe uma camada. adaptiveStream escolhe a resolucao
    // pela area realmente exibida e o SFU reduz a qualidade se a rede apertar.
    if (ajustes.qualidadeRecebo === "auto") return;
    const alvo = MAPA_RECEBER[ajustes.qualidadeRecebo];
    if (alvo === undefined) return;
    room.remoteParticipants.forEach((p) => {
      p.videoTrackPublications.forEach((pub) => {
        if (pub.setVideoQuality) {
          try { pub.setVideoQuality(alvo); } catch (e) {}
        }
      });
    });
  }, [room, tick, ajustes.qualidadeRecebo]);

  const entrar = useCallback(async (nome, sala) => {
    setEntrando(true);
    try {
      const resp = await fetch("/token?room=" + encodeURIComponent(sala) + "&name=" + encodeURIComponent(nome));
      if (!resp.ok) {
        let motivo = "Nao consegui entrar agora.";
        try { const j = await resp.json(); if (j && j.motivo) motivo = j.motivo; } catch (e) {}
        throw new Error(motivo);
      }
      const dados = await resp.json();
      const url = dados.url || window.LIVEKIT_URL;
      if (!url) throw new Error("URL do servidor nao configurada");
      await connect(url, dados.token);
      localStorage.setItem("meuNome", nome);
      setSalaAtual(sala);
      setFase("sala");
    } catch (e) {
      message.error(e && e.message ? e.message : String(e));
    } finally {
      setEntrando(false);
    }
  }, [connect, message]);

  const pararTransmissao = useCallback(async (pubName) => {
    if (!room) return;
    const pubs = Array.from(room.localParticipant.trackPublications.values());
    for (let i = 0; i < pubs.length; i++) {
      const pub = pubs[i];
      const ehTela = pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
      if (ehTela && pub.trackName === pubName && pub.track) {
        try { await room.localParticipant.unpublishTrack(pub.track, true); } catch (e) {}
      }
    }
    const resta = Array.from(room.localParticipant.trackPublications.values())
      .some((p) => p.source === Track.Source.ScreenShare && p.track);
    if (!resta) atualizarMeta({ estado: "off", desde: 0 });
  }, [room, atualizarMeta]);

  const compartilhar = useCallback(async () => {
    if (!room) return;
    if (qtdTelas >= MAX_TELAS) { message.warning("Voce ja esta com " + MAX_TELAS + " telas (o maximo)."); return; }
    const preset = PRESETS_ENVIO[ajustes.qualidadeEnvio] || PRESETS_ENVIO.media;
    const suportado = navigator.mediaDevices.getSupportedConstraints
      ? navigator.mediaDevices.getSupportedConstraints() : {};
    let nomeTela = "";
    try {
      const pedidoAudio = ajustes.audioAoCompartilhar
        ? { channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : false;
      if (pedidoAudio && suportado.restrictOwnAudio) pedidoAudio.restrictOwnAudio = true;

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: preset.fps, max: preset.fps },
          width: { ideal: preset.w, max: preset.w },
          height: { ideal: preset.h, max: preset.h }
        },
        audio: pedidoAudio,
        // Chave do zero-download (Chromium/Windows 2026): ao escolher uma JANELA,
        // captura so o audio daquela aplicacao. O Discord fica de fora.
        windowAudio: "window",
        systemAudio: "include",
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include"
      });

      const vtrack0 = stream.getVideoTracks()[0];
      const atrack0 = stream.getAudioTracks()[0];
      const videoSettings = vtrack0 && vtrack0.getSettings ? vtrack0.getSettings() : {};
      const superficie = videoSettings.displaySurface || "";
      console.log("[compartilhar] captura:", {
        superficie, width: videoSettings.width, height: videoSettings.height,
        frameRate: videoSettings.frameRate, preset: ajustes.qualidadeEnvio, maxBitrate: preset.br
      }, "| audio:", atrack0 ? (atrack0.label || "sim") : "NENHUM");
      if (ajustes.audioAoCompartilhar && !atrack0) {
        message.warning("A captura veio sem audio. No seletor, marque \"Compartilhar audio\" (ou audio da aba/aplicacao). Se escolheu Janela e mesmo assim nao veio, use a Guia do navegador ou a Tela inteira.", 8);
      } else if (superficie === "monitor" && ajustes.audioAoCompartilhar) {
        message.info("Tela inteira captura o som do sistema todo (Discord incluso). Pra nao pegar a call, compartilhe a Janela do jogo.", 8);
      }

      sequenciaRef.current += 1;
      nomeTela = "tela-" + sequenciaRef.current;
      const faixas = stream.getTracks();
      for (let i = 0; i < faixas.length; i++) {
        const faixa = faixas[i];
        if (faixa.kind === "video") {
          try { faixa.contentHint = "motion"; } catch (e) {}
          await room.localParticipant.publishTrack(faixa, {
            source: Track.Source.ScreenShare,
            name: nomeTela,
            stream: nomeTela,
            // Para jogo/movimento, preserve fluidez quando houver congestionamento.
            // O LiveKit/Chrome pode baixar resolucao antes de derrubar FPS.
            degradationPreference: "maintain-framerate",
            simulcast: true,
            screenShareEncoding: { maxBitrate: preset.br, maxFramerate: preset.fps }
          });
          faixa.addEventListener("ended", () => pararTransmissao(nomeTela), { once: true });
        } else {
          try { faixa.contentHint = "music"; } catch (e) {}
          await room.localParticipant.publishTrack(faixa, {
            source: Track.Source.ScreenShareAudio,
            name: nomeTela,
            stream: nomeTela,
            audioPreset: AudioPresets.musicHighQualityStereo,
            dtx: false
          });
        }
      }
      // Marca a live como no ar (mantem o inicio se ja estava transmitindo).
      const at = lerEstado(room.localParticipant);
      atualizarMeta({ estado: "ao_vivo", desde: at.desde || Date.now() });
    } catch (e) {
      if (e && e.name !== "NotAllowedError" && e.name !== "AbortError") {
        console.error("Falha ao compartilhar a tela:", e);
      }
      if (nomeTela) await pararTransmissao(nomeTela);
    }
  }, [room, qtdTelas, ajustes, message, pararTransmissao, atualizarMeta]);

  const pararTudo = useCallback(async () => {
    if (!room) return;
    const pubs = Array.from(room.localParticipant.trackPublications.values());
    for (let i = 0; i < pubs.length; i++) {
      const pub = pubs[i];
      if ((pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) && pub.track) {
        try { await room.localParticipant.unpublishTrack(pub.track, true); } catch (e) {}
      }
    }
    atualizarMeta({ estado: "off", desde: 0 });
  }, [room, atualizarMeta]);

  // Pausa / retoma: muta as tracks de tela (banda cai) e marca na metadata.
  const pausarLive = useCallback(async () => {
    if (!room) return;
    const pubs = Array.from(room.localParticipant.trackPublications.values());
    for (let i = 0; i < pubs.length; i++) {
      const pub = pubs[i];
      if ((pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) && pub.track) {
        try { await pub.track.mute(); } catch (e) {}
      }
    }
    atualizarMeta({ estado: "pausado" });
  }, [room, atualizarMeta]);

  const retomarLive = useCallback(async () => {
    if (!room) return;
    const pubs = Array.from(room.localParticipant.trackPublications.values());
    for (let i = 0; i < pubs.length; i++) {
      const pub = pubs[i];
      if ((pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) && pub.track) {
        try { await pub.track.unmute(); } catch (e) {}
      }
    }
    const at = lerEstado(room.localParticipant);
    atualizarMeta({ estado: "ao_vivo", desde: at.desde || Date.now() });
  }, [room, atualizarMeta]);

  const definirTituloLive = useCallback((t) => { atualizarMeta({ titulo: t }); }, [atualizarMeta]);

  const copiarLink = useCallback(async () => {
    const link = window.location.origin + "/?sala=" + encodeURIComponent(salaAtual || "geral");
    try { await navigator.clipboard.writeText(link); message.success("Link da sala copiado."); }
    catch (e) { message.info(link); }
  }, [salaAtual, message]);

  const alternarMic = useCallback(async () => {
    if (!room) return;
    const on = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(on);
    setMicLigado(on);
  }, [room]);

  const alternarCam = useCallback(async () => {
    if (!room) return;
    const on = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(on);
    setCamLigada(on);
  }, [room]);

  const sair = useCallback(() => {
    disconnect();
    window.location.reload();
  }, [disconnect]);

  if (fase === "entrar") {
    return <JoinScreen entrando={entrando} onEntrar={entrar} />;
  }

  return (
    <RoomView
      tiles={tiles}
      audios={audios}
      pessoas={pessoas}
      qtdTelas={qtdTelas}
      connState={connState}
      selecionado={selecionado}
      setSelecionado={setSelecionado}
      volumes={volumes}
      setVolumes={setVolumes}
      ajustes={ajustes}
      setAjustes={setAjustes}
      micLigado={micLigado}
      camLigada={camLigada}
      salaAtual={salaAtual}
      meuEstado={meuEstado}
      onCompartilhar={compartilhar}
      onPararTransmissao={pararTransmissao}
      onPararTudo={pararTudo}
      onPausarLive={pausarLive}
      onRetomarLive={retomarLive}
      onTituloLive={definirTituloLive}
      onCopiarLink={copiarLink}
      onAlternarMic={alternarMic}
      onAlternarCam={alternarCam}
      onSair={sair}
    />
  );
}
