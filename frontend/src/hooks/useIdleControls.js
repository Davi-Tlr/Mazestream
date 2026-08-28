import { useEffect, useState } from "react";
import { createIdleControls } from "../features/room/idleControls.js";

export function useIdleControls(rootRef, blocked = false) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    setIdle(false);
    const document = root.ownerDocument;
    const controls = createIdleControls(setIdle);
    let pressed = false;
    let keyboardFocus = false;
    const sync = () => controls.setBlocked(blocked || pressed || keyboardFocus);
    const wake = () => controls.wake();
    const down = () => { pressed = true; keyboardFocus = false; sync(); };
    const up = () => { pressed = false; sync(); };
    const focus = () => {
      const active = document.activeElement;
      keyboardFocus = root.contains(active) && active?.matches(":focus-visible");
      sync();
    };
    const blur = () => { pressed = false; keyboardFocus = false; sync(); controls.hide(); };
    const leave = () => controls.hide();
    sync();
    root.addEventListener("pointermove", wake, { passive: true, capture: true });
    root.addEventListener("pointerenter", wake);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("keydown", wake, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", focus);
    document.defaultView.addEventListener("blur", blur);
    return () => {
      controls.dispose();
      root.removeEventListener("pointermove", wake, true);
      root.removeEventListener("pointerenter", wake);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("keydown", wake, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focus);
      document.defaultView.removeEventListener("blur", blur);
    };
  }, [rootRef, blocked]);
  return idle;
}
