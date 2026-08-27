// Cancellation must release the UI even if an encoder/muxer promise never settles.
// Resource cancellation is best effort; it cannot forcibly terminate a browser codec.
function waitForClipStep(promise, signal) {
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return Promise.race([promise, cancelled]).finally(() => signal.removeEventListener("abort", onAbort));
}

export async function muxClip(runtime, selection, signal) {
  const {
    BufferTarget, EncodedAudioPacketSource, EncodedVideoPacketSource,
    Output, WebMOutputFormat
  } = runtime.media;
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const cancel = () => { void output.cancel().catch(() => {}); };
  const wait = (promise) => waitForClipStep(promise, signal);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    const videoSource = new EncodedVideoPacketSource(runtime.videoCodec);
    const hasAudio = !!runtime.audioCodec && selection.audio.length > 0;
    const audioSource = hasAudio ? new EncodedAudioPacketSource(runtime.audioCodec) : null;
    output.addVideoTrack(videoSource);
    if (audioSource) output.addAudioTrack(audioSource);
    await wait(output.start());

    const entries = selection.video.map((entry) => ({ ...entry, kind: "video" }))
      .concat(selection.audio.map((entry) => ({ ...entry, kind: "audio" })))
      .sort((left, right) => left.order - right.order);
    let firstVideo = true;
    let firstAudio = true;

    for (const entry of entries) {
      signal.throwIfAborted();
      const packet = entry.packet.clone({
        timestamp: Math.max(0, entry.packet.timestamp - selection.startTimestamp)
      });
      if (entry.kind === "video") {
        await wait(videoSource.add(packet, firstVideo ? (entry.meta || runtime.videoMeta) : undefined));
        firstVideo = false;
      } else if (audioSource) {
        await wait(audioSource.add(packet, firstAudio ? (entry.meta || runtime.audioMeta) : undefined));
        firstAudio = false;
      }
    }

    videoSource.close();
    if (audioSource) audioSource.close();
    const mimeType = await wait(output.getMimeType());
    await wait(output.finalize());
    signal.throwIfAborted();
    if (!target.buffer) throw new Error("O navegador não finalizou o arquivo do clipe.");
    return new Blob([target.buffer], { type: mimeType || "video/webm" });
  } catch (error) {
    if (!["canceled", "finalized"].includes(output.state)) cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
