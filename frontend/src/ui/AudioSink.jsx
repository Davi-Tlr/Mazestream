import { useRef, useEffect, memo } from "react";

// Toca uma transmissao de audio e aplica o volume/mudo local do usuario.
// React.memo: so re-renderiza quando track/volume/muteAll mudam.
const AudioSink = memo(function AudioSink({ track, volume, muteAll }) {
  const elRef = useRef(null);

  useEffect(() => {
    const el = document.createElement("audio");
    el.autoplay = true;
    elRef.current = el;
    document.body.appendChild(el);
    if (track) track.attach(el);
    return () => {
      if (track) try { track.detach(el); } catch (e) {}
      el.remove();
    };
  }, [track]);

  useEffect(() => {
    const mudo = muteAll || (volume && volume.muted);
    const nivel = mudo ? 0 : ((volume ? volume.value : 100) / 100);
    if (track && track.setVolume) { try { track.setVolume(nivel); } catch (e) {} }
    if (elRef.current) elRef.current.muted = !!mudo;
  }, [track, volume, muteAll]);

  return null;
});

export default AudioSink;
