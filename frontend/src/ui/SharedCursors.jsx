import { memo, useCallback, useContext, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EMPTY_CURSORS } from "../sharedCursor.js";
import { SharedCursorContext } from "../sharedCursorContext.js";
import { PointerIcon } from "./icons.jsx";

const RemoteCursor = memo(function RemoteCursor({ cursor }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div className="shared-cursor" aria-hidden="true" data-author={cursor.author}
      initial={false} animate={{ left: cursor.x * 100 + "%", top: cursor.y * 100 + "%" }}
      transition={{ duration: reducedMotion ? 0 : 0.06, ease: "linear" }}>
      <PointerIcon className="shared-cursor-arrow" width="18" height="23" fill="white" stroke="#111318" />
      <span className="interaction-author">{cursor.author}</span>
    </motion.div>
  );
});

export default function SharedCursors({ tile }) {
  const store = useContext(SharedCursorContext);
  const subscribe = useCallback((listener) => store?.subscribe(tile, listener) || (() => {}), [store, tile]);
  const snapshot = useCallback(() => store?.snapshot(tile) || EMPTY_CURSORS, [store, tile]);
  const cursors = useSyncExternalStore(subscribe, snapshot, snapshot);
  return cursors.map((cursor) => <RemoteCursor key={cursor.id} cursor={cursor} />);
}
