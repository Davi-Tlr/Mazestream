import { useState, useEffect } from "react";
import { Input, Button, Modal, Tooltip, Segmented, Select } from "antd";
import { EyeOutlined, UserOutlined } from "@ant-design/icons";
import { Sun, Moon } from "./icons.jsx";
import { useTheme } from "../theme.jsx";
import { PRESET_OPTIONS, ROOM_PRESETS } from "../roomFeatures.js";

function Terms({ open, onClose }) {
  return (
    <Modal title="Sobre o Mazestream" open={open} onCancel={onClose} centered
      footer={[<Button key="ok" type="primary" onClick={onClose}>Entendi</Button>]}>
      <div className="terms-text">
        <p>O <b>Mazestream</b> roda num servidor caseiro, o mesmo que uso pros meus projetos de RPG e outras coisas.</p>
        <p>Pra ele não sair do ar nem pesar demais, tem <b>limite de salas simultâneas</b> e de gente por sala. Se der "servidor cheio", é só esperar uma sala esvaziar.</p>
        <p>Arquivos enviados pelo chat são temporários e pequenos. Eles somem automaticamente e não funcionam como armazenamento permanente.</p>
        <p>É de graça e sem garantia: pode cair, pode ter manutenção. Se cair, tenta de novo depois.</p>
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
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("participant");
  const [preset, setPreset] = useState("livre");
  const [termsOpen, setTermsOpen] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    if (!localStorage.getItem("viuTermos")) {
      setTermsOpen(true);
      localStorage.setItem("viuTermos", "1");
    }
  }, []);

  function submit() {
    const cleanName = (name || "").trim() || "convidado";
    const cleanRoom = (room || "").trim() || "geral";
    onJoin(cleanName, cleanRoom, {
      spectator: role === "spectator",
      pin: (pin || "").trim(),
      preset
    });
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
        <p className="subtitle">Tela, câmera e áudio em uma sala, direto no navegador. A voz pode continuar no seu Discord.</p>

        <div className="field">
          <label htmlFor="name">Seu nome</label>
          <Input id="name" size="large" placeholder="Seu nome" maxLength={40}
            value={name} onChange={(event) => setName(event.target.value)} onPressEnter={submit} />
        </div>

        <div className="field">
          <label htmlFor="room">Nome da sala</label>
          <Input id="room" size="large" placeholder="geral" maxLength={40}
            value={room} onChange={(event) => setRoom(event.target.value)} onPressEnter={submit} />
        </div>

        <div className="field">
          <label>Como você quer entrar?</label>
          <Segmented block value={role} onChange={setRole} options={[
            { value: "participant", label: <span><UserOutlined /> Participar</span> },
            { value: "spectator", label: <span><EyeOutlined /> Só assistir</span> }
          ]} />
        </div>

        <div className="join-inline-fields">
          <div className="field">
            <label htmlFor="pin">PIN da sala <span className="field-optional">opcional</span></label>
            <Input.Password id="pin" size="large" placeholder="Se a sala tiver PIN" maxLength={24}
              value={pin} onChange={(event) => setPin(event.target.value)} onPressEnter={submit} />
          </div>
          <div className="field">
            <label>Modo se a sala for nova</label>
            <Select size="large" value={preset} options={PRESET_OPTIONS} style={{ width: "100%" }} onChange={setPreset} />
          </div>
        </div>
        <p className="preset-hint">{ROOM_PRESETS[preset]?.description}</p>

        <Button type="primary" size="large" block loading={joining} onClick={submit}>
          {role === "spectator" ? "Entrar só para assistir" : "Entrar"}
        </Button>

        <p className="join-notice">
          Se você for a primeira pessoa de uma sala nova, vira o host dela automaticamente.{" "}
          <Button type="link" onClick={() => setTermsOpen(true)}>Como funciona?</Button>
        </p>
      </div>

      <Terms open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
