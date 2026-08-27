import { useRef, useState, useCallback } from "react";
import { Track, AudioPresets, ScreenSharePresets, supportsVP9 } from "livekit-client";
import { readState } from "./state.js";
import { SEND_PRESETS, MAX_SCREENS } from "./constants.js";
import { chooseScreenCodec } from "./screenSharePolicy.js";
import { APP_PROFILE } from "./appProfile.js";

function isScreenPublication(publication) {
  return publication.source === Track.Source.ScreenShare
    || publication.source === Track.Source.ScreenShareAudio;
}

function activeScreenPublications(room, pubName) {
  if (!room) return [];
  return Array.from(room.localParticipant.trackPublications.values())
    .filter((publication) => isScreenPublication(publication)
      && publication.track
      && (!pubName || publication.trackName === pubName));
}

export function useScreenShare(room, settings, updateMeta, notifications) {
  const seqRef = useRef(0);
  const shareInFlightRef = useRef(false);
  const stoppingRef = useRef(new Set());
  const [sharing, setSharing] = useState(false);

  const screenCount = useCallback(() => {
    if (!room) return 0;
    return Array.from(room.localParticipant.trackPublications.values())
      .filter((publication) => publication.source === Track.Source.ScreenShare && publication.track).length;
  }, [room]);

  const stopBroadcast = useCallback(async (pubName) => {
    if (!room || !pubName || stoppingRef.current.has(pubName)) return false;
    stoppingRef.current.add(pubName);
    try {
      const targets = activeScreenPublications(room, pubName);
      const results = await Promise.allSettled(targets.map((publication) => (
        room.localParticipant.unpublishTrack(publication.track, true)
      )));
      const failed = results.some((result) => result.status === "rejected");
      const targetStillActive = activeScreenPublications(room, pubName).length > 0;
      const anyScreenActive = activeScreenPublications(room).length > 0;

      let metadataOk = true;
      if (!anyScreenActive) metadataOk = await updateMeta({ estado: "off", desde: 0 });
      if (failed || targetStillActive) {
        notifications?.error("Não consegui encerrar todas as faixas desta transmissão. Confira o indicador ao vivo antes de fechar a página.");
        return false;
      }
      if (!metadataOk) {
        notifications?.warning("A transmissão parou, mas o estado da sala não sincronizou. A reconexão deve corrigir o indicador.");
      }
      return true;
    } finally {
      stoppingRef.current.delete(pubName);
    }
  }, [room, updateMeta, notifications]);

  const shareScreen = useCallback(async () => {
    if (!room) return false;
    if (shareInFlightRef.current) {
      notifications?.info("O seletor de compartilhamento já está aberto.");
      return false;
    }
    if (screenCount() >= MAX_SCREENS) {
      notifications?.warning("Você já está com " + MAX_SCREENS + " telas, que é o máximo.");
      return false;
    }

    shareInFlightRef.current = true;
    setSharing(true);
    const preset = SEND_PRESETS[settings.sendQuality] || SEND_PRESETS.high;
    const contentHint = settings.shareContent === "detail" ? "detail" : "motion";
    const degradationPreference = contentHint === "detail" ? "maintain-resolution" : "maintain-framerate";
    let vp9Supported = false;
    try { vp9Supported = supportsVP9(); } catch (e) {}
    const videoCodec = chooseScreenCodec(contentHint, vp9Supported);
    const simulcastLayers = settings.sendQuality === "high"
      ? [ScreenSharePresets.h360fps15, ScreenSharePresets.h720fps30]
      : [ScreenSharePresets.h360fps15];
    const supported = navigator.mediaDevices.getSupportedConstraints
      ? navigator.mediaDevices.getSupportedConstraints() : {};
    let screenName = "";
    let stream = null;

    try {
      const audioRequest = settings.audioOnShare
        ? { channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : false;
      if (audioRequest && supported.restrictOwnAudio) audioRequest.restrictOwnAudio = true;

      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: preset.fps, max: preset.fps },
          width: { ideal: preset.w },
          height: { ideal: preset.h }
        },
        audio: audioRequest,
        windowAudio: "window",
        systemAudio: "include",
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include"
      });

      if (screenCount() >= MAX_SCREENS) {
        stream.getTracks().forEach((track) => track.stop());
        notifications?.warning("O limite de " + MAX_SCREENS + " telas foi atingido enquanto o seletor estava aberto.");
        return false;
      }

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (!videoTrack) throw new Error("O navegador não entregou uma faixa de vídeo para compartilhar.");
      const videoSettings = videoTrack.getSettings ? videoTrack.getSettings() : {};
      const surface = videoSettings.displaySurface || "";
      if (APP_PROFILE.diagnostics) {
        console.log("[shareScreen] capture:", {
          surface, width: videoSettings.width, height: videoSettings.height,
          frameRate: videoSettings.frameRate, preset: settings.sendQuality, maxBitrate: preset.br
        }, "| audio:", audioTrack ? (audioTrack.label || "yes") : "NONE");
      }

      if (settings.audioOnShare && !audioTrack) {
        notifications?.warning("A captura veio sem áudio. No seletor, marque Compartilhar áudio. Para jogos, prefira a janela ou a guia correta.", 8);
      } else if (surface === "monitor" && settings.audioOnShare) {
        notifications?.info("Tela inteira pode capturar também o Discord. Para isolar o jogo, compartilhe só a janela dele.", 8);
      }

      seqRef.current += 1;
      screenName = "tela-" + seqRef.current;
      try { videoTrack.contentHint = contentHint; } catch (e) {}
      await room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        name: screenName,
        stream: screenName,
        degradationPreference,
        videoCodec,
        backupCodec: true,
        simulcast: videoCodec === "vp8",
        screenShareSimulcastLayers: videoCodec === "vp8" ? simulcastLayers : undefined,
        screenShareEncoding: { maxBitrate: preset.br, maxFramerate: preset.fps, priority: "medium" }
      });
      videoTrack.addEventListener("ended", () => { void stopBroadcast(screenName); }, { once: true });

      if (audioTrack) {
        try { audioTrack.contentHint = "music"; } catch (e) {}
        await room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio,
          name: screenName,
          stream: screenName,
          audioPreset: AudioPresets.musicHighQualityStereo,
          dtx: false,
          red: false
        });
      }

      const state = readState(room.localParticipant);
      if (!await updateMeta({ estado: "ao_vivo", desde: state.desde || Date.now() })) {
        notifications?.warning("A tela está sendo enviada, mas o indicador ao vivo não sincronizou.");
      }
      const actualWidth = Number(videoSettings.width) || preset.w;
      const actualHeight = Number(videoSettings.height) || preset.h;
      const actualFps = Math.round(Number(videoSettings.frameRate) || preset.fps);
      const mode = contentHint === "detail" ? "detalhes" : "movimento";
      notifications?.success("Transmitindo em " + actualWidth + "×" + actualHeight + " · " + actualFps + "fps · " + videoCodec.toUpperCase() + " · " + mode, 4);
      if (settings.sendQuality === "high" && (actualWidth < 1800 || actualHeight < 1000 || actualFps < 25)) {
        notifications?.info("O navegador entregou menos que 1080p30. Tela inteira ou janela maximizada costuma preservar mais resolução.", 7);
      }
      return true;
    } catch (error) {
      const canceled = error && (error.name === "NotAllowedError" || error.name === "AbortError");
      if (!canceled) {
        console.error("Failed to share screen:", error);
        notifications?.error(error?.message || "Não consegui iniciar o compartilhamento de tela.");
      }
      if (screenName) await stopBroadcast(screenName);
      if (stream) stream.getTracks().forEach((track) => {
        if (track.readyState === "live") track.stop();
      });
      return false;
    } finally {
      shareInFlightRef.current = false;
      setSharing(false);
    }
  }, [room, settings, screenCount, stopBroadcast, updateMeta, notifications]);

  const stopAll = useCallback(async () => {
    if (!room) return false;
    const targets = activeScreenPublications(room);
    const names = new Set(targets.map((publication) => publication.trackName).filter(Boolean));
    names.forEach((name) => stoppingRef.current.add(name));
    try {
      const results = await Promise.allSettled(targets.map((publication) => (
        room.localParticipant.unpublishTrack(publication.track, true)
      )));
      const remaining = activeScreenPublications(room);
      if (results.some((result) => result.status === "rejected") || remaining.length > 0) {
        notifications?.error("Alguma faixa não foi encerrada. Não feche a página até o indicador de transmissão desaparecer.");
        return false;
      }
      if (!await updateMeta({ estado: "off", desde: 0 })) {
        notifications?.warning("As transmissões pararam, mas o estado da sala não sincronizou.");
      }
      return true;
    } finally {
      names.forEach((name) => stoppingRef.current.delete(name));
    }
  }, [room, updateMeta, notifications]);

  const pauseLive = useCallback(async () => {
    if (!room) return false;
    const targets = activeScreenPublications(room);
    const results = await Promise.allSettled(targets.map((publication) => publication.track.mute()));
    if (results.some((result) => result.status === "rejected")) {
      const stopped = await Promise.allSettled(targets.map((publication) => (
        room.localParticipant.unpublishTrack(publication.track, true)
      )));
      const stillActive = activeScreenPublications(room).length > 0;
      if (!stillActive) await updateMeta({ estado: "off", desde: 0 });
      notifications?.error(stillActive || stopped.some((result) => result.status === "rejected")
        ? "Falha ao pausar: alguma faixa pode continuar ativa. Use Parar transmissão."
        : "Falha ao pausar; a transmissão foi encerrada por segurança.");
      return false;
    }
    if (!await updateMeta({ estado: "pausado" })) {
      notifications?.warning("As faixas foram pausadas, mas o estado da sala não sincronizou.");
    }
    return true;
  }, [room, updateMeta, notifications]);

  const resumeLive = useCallback(async () => {
    if (!room) return false;
    const targets = activeScreenPublications(room);
    const results = await Promise.allSettled(targets.map((publication) => publication.track.unmute()));
    if (results.some((result) => result.status === "rejected")) {
      await Promise.allSettled(targets.map((publication) => publication.track.mute()));
      notifications?.error("Não consegui retomar todas as faixas. A transmissão continua pausada.");
      return false;
    }
    const state = readState(room.localParticipant);
    if (!await updateMeta({ estado: "ao_vivo", desde: state.desde || Date.now() })) {
      await Promise.allSettled(targets.map((publication) => publication.track.mute()));
      notifications?.error("Não consegui sincronizar a retomada. A transmissão continua pausada.");
      return false;
    }
    return true;
  }, [room, updateMeta, notifications]);

  return { sharing, screenCount, shareScreen, stopBroadcast, stopAll, pauseLive, resumeLive };
}
