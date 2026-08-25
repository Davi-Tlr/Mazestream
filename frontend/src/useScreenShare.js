import { useRef, useCallback } from "react";
import { Track, AudioPresets } from "livekit-client";
import { readState } from "./state.js";
import { SEND_PRESETS, MAX_SCREENS } from "./constants.js";

export function useScreenShare(room, settings, updateMeta) {
  const seqRef = useRef(0);

  const screenCount = useCallback(() => {
    if (!room) return 0;
    return Array.from(room.localParticipant.trackPublications.values())
      .filter((p) => p.source === Track.Source.ScreenShare && p.track).length;
  }, [room]);

  const stopBroadcast = useCallback(async (pubName) => {
    if (!room) return;
    const pubs = Array.from(room.localParticipant.trackPublications.values());
    for (const pub of pubs) {
      const isScreen = pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
      if (isScreen && pub.trackName === pubName && pub.track) {
        try { await room.localParticipant.unpublishTrack(pub.track, true); } catch (e) {}
      }
    }
    const remaining = Array.from(room.localParticipant.trackPublications.values())
      .some((p) => p.source === Track.Source.ScreenShare && p.track);
    if (!remaining) updateMeta({ estado: "off", desde: 0 });
  }, [room, updateMeta]);

  const shareScreen = useCallback(async (message) => {
    if (!room) return;
    const current = screenCount();
    if (current >= MAX_SCREENS) { message.warning("Voce ja esta com " + MAX_SCREENS + " telas (o maximo)."); return; }
    const preset = SEND_PRESETS[settings.sendQuality] || SEND_PRESETS.medium;
    const supported = navigator.mediaDevices.getSupportedConstraints
      ? navigator.mediaDevices.getSupportedConstraints() : {};
    let screenName = "";
    try {
      const audioRequest = settings.audioOnShare
        ? { channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : false;
      if (audioRequest && supported.restrictOwnAudio) audioRequest.restrictOwnAudio = true;

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: preset.fps, max: preset.fps },
          width: { ideal: preset.w, max: preset.w },
          height: { ideal: preset.h, max: preset.h }
        },
        audio: audioRequest,
        windowAudio: "window",
        systemAudio: "include",
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include"
      });

      const vtrack0 = stream.getVideoTracks()[0];
      const atrack0 = stream.getAudioTracks()[0];
      const videoSettings = vtrack0 && vtrack0.getSettings ? vtrack0.getSettings() : {};
      const surface = videoSettings.displaySurface || "";
      console.log("[shareScreen] capture:", {
        surface, width: videoSettings.width, height: videoSettings.height,
        frameRate: videoSettings.frameRate, preset: settings.sendQuality, maxBitrate: preset.br
      }, "| audio:", atrack0 ? (atrack0.label || "yes") : "NONE");
      if (settings.audioOnShare && !atrack0) {
        message.warning("A captura veio sem audio. No seletor, marque \"Compartilhar audio\" (ou audio da aba/aplicacao). Se escolheu Janela e mesmo assim nao veio, use a Guia do navegador ou a Tela inteira.", 8);
      } else if (surface === "monitor" && settings.audioOnShare) {
        message.info("Tela inteira captura o som do sistema todo (Discord incluso). Pra nao pegar a call, compartilhe a Janela do jogo.", 8);
      }

      seqRef.current += 1;
      screenName = "tela-" + seqRef.current;
      const tracks = stream.getTracks();
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track.kind === "video") {
          try { track.contentHint = "motion"; } catch (e) {}
          await room.localParticipant.publishTrack(track, {
            source: Track.Source.ScreenShare,
            name: screenName,
            stream: screenName,
            degradationPreference: "maintain-framerate",
            simulcast: true,
            screenShareEncoding: { maxBitrate: preset.br, maxFramerate: preset.fps }
          });
          track.addEventListener("ended", () => stopBroadcast(screenName), { once: true });
        } else {
          try { track.contentHint = "music"; } catch (e) {}
          await room.localParticipant.publishTrack(track, {
            source: Track.Source.ScreenShareAudio,
            name: screenName,
            stream: screenName,
            audioPreset: AudioPresets.musicHighQualityStereo,
            dtx: false
          });
        }
      }
      const st = readState(room.localParticipant);
      updateMeta({ estado: "ao_vivo", desde: st.desde || Date.now() });
    } catch (e) {
      if (e && e.name !== "NotAllowedError" && e.name !== "AbortError") {
        console.error("Failed to share screen:", e);
      }
      if (screenName) await stopBroadcast(screenName);
    }
  }, [room, settings, screenCount, stopBroadcast, updateMeta]);

  const stopAll = useCallback(async () => {
    if (!room) return;
    const pubs = Array.from(room.localParticipant.trackPublications.values());
    for (const pub of pubs) {
      if ((pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) && pub.track) {
        try { await room.localParticipant.unpublishTrack(pub.track, true); } catch (e) {}
      }
    }
    updateMeta({ estado: "off", desde: 0 });
  }, [room, updateMeta]);

  const pauseLive = useCallback(async () => {
    if (!room) return;
    const pubs = Array.from(room.localParticipant.trackPublications.values());
    for (const pub of pubs) {
      if ((pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) && pub.track) {
        try { await pub.track.mute(); } catch (e) {}
      }
    }
    updateMeta({ estado: "pausado" });
  }, [room, updateMeta]);

  const resumeLive = useCallback(async () => {
    if (!room) return;
    const pubs = Array.from(room.localParticipant.trackPublications.values());
    for (const pub of pubs) {
      if ((pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) && pub.track) {
        try { await pub.track.unmute(); } catch (e) {}
      }
    }
    const st = readState(room.localParticipant);
    updateMeta({ estado: "ao_vivo", desde: st.desde || Date.now() });
  }, [room, updateMeta]);

  return { screenCount, shareScreen, stopBroadcast, stopAll, pauseLive, resumeLive };
}
