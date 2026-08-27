import { useCallback, useEffect, useRef } from "react";

export function useSharedCursor({ getPoint, onCursor, enabled, surfaceKey }) {
  const latest = useRef({ getPoint, onCursor, enabled });
  latest.current = { getPoint, onCursor, enabled };
  const visible = useRef(false);
  const hide = useCallback(() => {
    if (!visible.current) return;
    visible.current = false;
    latest.current.onCursor(null);
  }, []);
  const move = useCallback((event) => {
    if (!latest.current.enabled || event.isPrimary === false) return;
    const point = latest.current.getPoint(event);
    if (!point) { hide(); return; }
    visible.current = true;
    latest.current.onCursor(point);
  }, [hide]);
  useEffect(() => {
    // Capture the owner: cleanup for an old tile must not hide a new tile.
    const send = onCursor;
    const leave = () => { if (visible.current) { visible.current = false; send(null); } };
    const visibility = () => { if (document.hidden) leave(); };
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      leave();
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, surfaceKey, onCursor]);
  return { move, hide };
}
