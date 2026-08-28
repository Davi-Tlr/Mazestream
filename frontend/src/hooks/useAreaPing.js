import { useEffect, useRef } from "react";
import { createAreaPingGesture } from "../features/interactions/areaPingGesture.js";

export function useAreaPing({ getPoint, onPing, enabled, tool }) {
  const current = useRef({ getPoint, onPing });
  current.current = { getPoint, onPing };
  const gesture = useRef(null);
  if (!gesture.current) gesture.current = createAreaPingGesture({
    getPoint: (event) => current.current.getPoint(event),
    onPing: (point, marker) => current.current.onPing(point, marker)
  });
  useEffect(() => {
    const cancel = () => gesture.current.cancel();
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancel);
    };
  }, [enabled, tool]);
  return gesture.current;
}
