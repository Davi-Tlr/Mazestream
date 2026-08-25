import { useRef, useEffect, memo } from "react";

// Plays one remote audio track and applies both per-track and per-person volume.
const AudioSink = memo(function AudioSink({ track, volume, muteAll, personVolume = 100 }) {
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
    const muted = muteAll || (volume && volume.muted);
    const trackLevel = (volume ? volume.value : 100) / 100;
    const personLevel = Math.max(0, Math.min(150, personVolume)) / 100;
    const level = muted ? 0 : Math.min(1.5, trackLevel * personLevel);
    if (track && track.setVolume) { try { track.setVolume(level); } catch (e) {} }
    if (elRef.current) elRef.current.muted = !!muted;
  }, [track, volume, muteAll, personVolume]);

  return null;
});

export default AudioSink;
