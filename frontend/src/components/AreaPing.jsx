import { motion } from "framer-motion";

export default function AreaPing({ item }) {
  return (
    <div className="interaction-ping" aria-hidden="true" style={{ left: item.x * 100 + "%", top: item.y * 100 + "%" }}>
      <motion.div className="area-ping" initial={{ opacity: 0 }}
        animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
        <span className="area-ping-ring" />
        <span className="area-ping-center" />
      </motion.div>
    </div>
  );
}
