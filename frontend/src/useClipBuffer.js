import { useCallback, useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";
import { muxClip } from "./clipMux.js";
import { appendClipPacket, bufferedPacketBytes, getBufferedSeconds, pruneRollingPackets, selectClipEntries } from "./clipBufferCore.js";
import { chooseScreenAudioPublication } from "./clipTrackSelection.js";

const CLIP_VIDEO_BITRATE = 2_500_000;
const CLIP_FRAME_RATE = 15;
const CLIP_MAX_ACTIVE_MS = 10 * 60 * 1000;

let mediaModulePromise = null;
function loadMediaModule() {
  if (!mediaModulePromise) mediaModulePromise = import("./clipMedia.js").catch((error) => {
    mediaModulePromise = null;
    throw error;
  });
  return mediaModulePromise;
}

function findAudioTrack(room, tile) {
  if (!room || !tile) return null;
  const participant = tile.isLocal
    ? room.localParticipant
    : room.remoteParticipants.get(tile.identity);
  if (!participant) return null;

  const publication = chooseScreenAudioPublication(
    participant.trackPublications.values(), tile.pubName, Track.Source.ScreenShareAudio
  );
  return publication?.track || null;
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "mazestream-clip-" + new Date().toISOString().replace(/[:.]/g, "-") + ".webm";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function useClipBuffer(room, tile, maxSeconds = 45, enabled = false, onAutoStop = null) {
  const runtimeRef = useRef(null);
  const exportingRef = useRef(false);
  const onAutoStopRef = useRef(onAutoStop);
  onAutoStopRef.current = onAutoStop;
  const [supported, setSupported] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [readySeconds, setReadySeconds] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    setSupported(false);
    setBuffering(false);
    setReadySeconds(0);
    setError("");

    const stopRuntime = (runtime) => {
      if (!runtime) return;
      runtime.failed = true;
      if (runtime.autoStopTimer) {
        window.clearTimeout(runtime.autoStopTimer);
        runtime.autoStopTimer = null;
      }
      runtime.exportController?.abort();
      try { runtime.videoSource?.close(); } catch (e) {}
      try { runtime.audioSource?.close(); } catch (e) {}
      if (runtime.output && !["canceled", "finalized"].includes(runtime.output.state)) {
        void runtime.output.cancel().catch(() => {});
      }
      runtime.video = [];
      runtime.audio = [];
      runtime.bufferedBytes = 0;
    };

    const previous = runtimeRef.current;
    runtimeRef.current = null;
    stopRuntime(previous);

    if (!enabled || !room || !tile || !tile.isScreen || !tile.track?.mediaStreamTrack) {
      return () => { disposed = true; };
    }
    const videoTrack = tile.track.mediaStreamTrack;
    if (videoTrack.readyState !== "live") return () => { disposed = true; };

    void (async () => {
      try {
        const media = await loadMediaModule();
        const {
          getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
          MediaStreamAudioTrackSource, MediaStreamVideoTrackSource,
          NullTarget, Output, Quality, WebMOutputFormat
        } = media;
        const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
        const clipWidth = Math.min(1280, Number(settings.width) || 1280);
        const videoCodec = await getFirstEncodableVideoCodec(["vp8", "vp9"], {
          width: clipWidth,
          height: settings.height || 720,
          bitrate: new Quality({ bitrate: CLIP_VIDEO_BITRATE })
        });
        if (!videoCodec) throw new Error("Este navegador não consegue codificar VP8/VP9 para clipes.");

        const liveAudioTrack = findAudioTrack(room, tile)?.mediaStreamTrack;
        const audioCodec = liveAudioTrack?.readyState === "live"
          ? await getFirstEncodableAudioCodec(["opus"])
          : null;
        if (disposed) return;

        const runtime = {
          media,
          output: null,
          videoSource: null,
          audioSource: null,
          videoCodec,
          audioCodec,
          videoMeta: null,
          audioMeta: null,
          video: [],
          audio: [],
          latest: 0,
          order: 0,
          bufferedBytes: 0,
          readyWholeSeconds: 0,
          lastPrunedTimestamp: -Infinity,
          autoStopTimer: null,
          failed: false
        };
        const onPacketError = () => {
          if (disposed) return;
          if (runtime.failed) return;
          runtime.failed = true;
          setError("O clipe não pôde continuar neste dispositivo. Desative e ative novamente para tentar.");
          setBuffering(false);
          setSupported(false);
          if (runtimeRef.current === runtime) {
            runtimeRef.current = null;
            stopRuntime(runtime);
          }
        };
        const updateRing = () => {
          // Packet callbacks run at the capture frame rate. Pruning and React
          // state updates every frame cause avoidable CPU/GC pressure on a
          // 2-core machine, so maintain the rolling window at most twice/sec.
          if (runtime.latest - runtime.lastPrunedTimestamp < 0.5) return;
          runtime.lastPrunedTimestamp = runtime.latest;
          const pruned = pruneRollingPackets(runtime.video, runtime.audio, runtime.latest, maxSeconds);
          runtime.video = pruned.video;
          runtime.audio = pruned.audio;
          runtime.bufferedBytes = bufferedPacketBytes(runtime.video, runtime.audio);
          const wholeSeconds = Math.floor(getBufferedSeconds(runtime.video, runtime.latest, maxSeconds));
          if (wholeSeconds !== runtime.readyWholeSeconds) {
            runtime.readyWholeSeconds = wholeSeconds;
            setReadySeconds(wholeSeconds);
          }
        };

        const output = new Output({
          format: new WebMOutputFormat({ appendOnly: true, minimumClusterDuration: 1 }),
          target: new NullTarget()
        });
        const videoSource = new MediaStreamVideoTrackSource(videoTrack, {
          codec: videoCodec,
          quality: new Quality({ bitrate: CLIP_VIDEO_BITRATE }),
          keyFrameInterval: 2,
          sizeChangeBehavior: "contain",
          transform: { width: clipWidth },
          onEncodedPacket: (packet, meta) => {
            if (disposed || runtime.failed) return;
            try { appendClipPacket(runtime, "video", packet, meta); }
            catch (error) { onPacketError(); return; }
            runtime.latest = Math.max(runtime.latest, packet.timestamp + packet.duration);
            updateRing();
          }
        // Sample at a modest rate before resizing/encoding. This keeps the
        // rolling clip useful while avoiding a second encode for every live
        // frame on machines with limited CPU.
        }, { frameRate: CLIP_FRAME_RATE });
        output.addVideoTrack(videoSource);
        videoSource.errorPromise.catch(onPacketError);

        let audioSource = null;
        if (audioCodec && liveAudioTrack) {
          audioSource = new MediaStreamAudioTrackSource(liveAudioTrack, {
            codec: audioCodec,
            quality: new Quality({ bitrate: 128_000 }),
            onEncodedPacket: (packet, meta) => {
              if (disposed || runtime.failed) return;
              try { appendClipPacket(runtime, "audio", packet, meta); }
            catch (error) { onPacketError(); }
            }
          });
          output.addAudioTrack(audioSource);
          audioSource.errorPromise.catch(onPacketError);
        }

        runtime.output = output;
        runtime.videoSource = videoSource;
        runtime.audioSource = audioSource;
        runtimeRef.current = runtime;
        await output.start();
        if (disposed || runtime.failed) { stopRuntime(runtime); return; }
        runtime.autoStopTimer = window.setTimeout(() => {
          if (disposed || runtimeRef.current !== runtime || runtime.failed) return;
          runtimeRef.current = null;
          stopRuntime(runtime);
          setSupported(false);
          setBuffering(false);
          setReadySeconds(0);
          onAutoStopRef.current?.();
        }, CLIP_MAX_ACTIVE_MS);
        setSupported(true);
        setBuffering(true);
      } catch {
        if (disposed) return;
        const runtime = runtimeRef.current;
        runtimeRef.current = null;
        stopRuntime(runtime);
        setSupported(false);
        setBuffering(false);
        setError("Não consegui iniciar o clipe. Desative e ative novamente para tentar.");
      }
    })();

    return () => {
      disposed = true;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      stopRuntime(runtime);
    };
  }, [enabled, room, tile?.key, tile?.track, tile?.pubName, maxSeconds]);

  const saveClip = useCallback(async (seconds = 30) => {
    const runtime = runtimeRef.current;
    if (!runtime || exporting || exportingRef.current) return false;
    const selection = selectClipEntries(runtime.video, runtime.audio, runtime.latest,
      Math.max(5, Math.min(maxSeconds, seconds)));
    if (!selection) return false;
    exportingRef.current = true;
    setExporting(true);
    setError("");
    const controller = new AbortController();
    runtime.exportController = controller;
    const timer = window.setTimeout(() => controller.abort(new Error("A exportação do clipe demorou demais. Tente um intervalo menor.")), 30000);
    try {
      const blob = await muxClip(runtime, selection, controller.signal);
      if (runtimeRef.current !== runtime || controller.signal.aborted) return false;
      downloadBlob(blob);
      return true;
    } catch (caught) {
      if (runtimeRef.current !== runtime) return false;
      const reason = caught instanceof Error ? caught.message : "Falha ao montar o clipe.";
      setError(reason);
      throw caught;
    } finally {
      window.clearTimeout(timer);
      runtime.exportController = null;
      exportingRef.current = false;
      setExporting(false);
    }
  }, [exporting, maxSeconds]);

  return { supported, buffering, exporting, readySeconds, error, saveClip };
}
