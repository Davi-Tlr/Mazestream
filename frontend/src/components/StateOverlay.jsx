import { motion } from "framer-motion";
import { PauseOutlined } from "@ant-design/icons";

export default function StateOverlay({ state, author }) {
  if (!state || state.estado !== "pausado") return null;
  return (
    <motion.div className="state-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}>
      <div className="state-box">
        <span className="state-tag"><PauseOutlined /> Pausado</span>
        <strong>{state.titulo || "Volto ja"}</strong>
        <span className="state-sub">{author ? author + " pausou a transmissao." : "Transmissao em pausa."}</span>
      </div>
    </motion.div>
  );
}
