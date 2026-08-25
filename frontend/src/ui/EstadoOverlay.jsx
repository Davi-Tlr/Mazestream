import { motion } from "framer-motion";
import { PauseOutlined } from "@ant-design/icons";

// Overlay local mostrado sobre a transmissao de quem pausou (render local, banda ~0).
// Enquanto pausado a track fica muda, entao o video congela no ultimo quadro; o scrim
// deixa a pausa clara mesmo se o navegador pintar preto.
export default function EstadoOverlay({ estado, autor }) {
  if (!estado || estado.estado !== "pausado") return null;
  return (
    <motion.div className="estado-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}>
      <div className="estado-caixa">
        <span className="estado-tag"><PauseOutlined /> Pausado</span>
        <strong>{estado.titulo || "Volto já"}</strong>
        <span className="estado-sub">{autor ? autor + " pausou a transmissão." : "Transmissão em pausa."}</span>
      </div>
    </motion.div>
  );
}
