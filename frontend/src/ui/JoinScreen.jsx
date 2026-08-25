import { useState, useEffect } from "react";
import { Input, Button, Modal, Tooltip } from "antd";
import { Sun, Moon } from "./icons.jsx";
import { useTheme } from "../theme.jsx";

function Terms({ open, onClose }) {
  return (
    <Modal
      title="Sobre o Mazestream"
      open={open}
      onCancel={onClose}
      centered
      footer={[<Button key="ok" type="primary" onClick={onClose}>Entendi</Button>]}
    >
      <div className="terms-text">
        <p>O <b>Mazestream</b> roda num servidor caseiro, o mesmo que uso pros meus projetos de RPG e outras coisas.</p>
        <p>Pra ele nao sair do ar nem pesar demais, tem <b>limite de salas simultaneas</b> e de gente por sala. Se der "servidor cheio", e so esperar uma sala esvaziar.</p>
        <p>Cada pessoa que assiste puxa a transmissao do servidor, entao quanto mais gente ao mesmo tempo, mais banda. Use com consciencia e evite espalhar o link pra muita gente de uma vez.</p>
        <p>E de graça e sem garantia: pode cair, pode ter manutencao. Se cair, respira e tenta de novo mais tarde.</p>
      </div>
    </Modal>
  );
}

export default function JoinScreen({ joining, onJoin }) {
  const [name, setName] = useState(localStorage.getItem("meuNome") || "");
  const [room, setRoom] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("sala") || "geral"; }
    catch (e) { return "geral"; }
  });
  const [termsOpen, setTermsOpen] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    if (!localStorage.getItem("viuTermos")) {
      setTermsOpen(true);
      localStorage.setItem("viuTermos", "1");
    }
  }, []);

  function submit() {
    const n = (name || "").trim() || "convidado";
    const r = (room || "").trim() || "geral";
    onJoin(n, r);
  }

  return (
    <div className="join-wrap">
      <div className="join-card">
        <div className="join-header">
          <div className="brand">Mazestream</div>
          <Tooltip title={theme.dark ? "Tema claro" : "Tema escuro"}>
            <Button className="theme-btn" aria-label="Alternar tema"
              icon={theme.dark ? <Sun /> : <Moon />} onClick={theme.toggle} />
          </Tooltip>
        </div>
        <h1>Entre e compartilhe.</h1>
        <p className="subtitle">Tela, camera e audio em uma sala, direto no navegador. A voz fica no seu Discord.</p>

        <div className="field">
          <label htmlFor="name">Seu nome</label>
          <Input id="name" size="large" placeholder="Seu nome" maxLength={40}
            value={name} onChange={(e) => setName(e.target.value)} onPressEnter={submit} />
        </div>

        <div className="field">
          <label htmlFor="room">Nome da sala</label>
          <Input id="room" size="large" placeholder="geral" maxLength={40}
            value={room} onChange={(e) => setRoom(e.target.value)} onPressEnter={submit} />
        </div>

        <Button type="primary" size="large" block loading={joining} onClick={submit}>
          Entrar
        </Button>

        <p className="join-notice">
          Servidor caseiro e compartilhado, com limite de salas.{" "}
          <Button type="link" onClick={() => setTermsOpen(true)}>Por que?</Button>
        </p>
      </div>

      <Terms open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
