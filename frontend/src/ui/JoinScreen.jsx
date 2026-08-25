import { useState, useEffect } from "react";
import { Input, Button, Modal, Tooltip } from "antd";
import { Sol, Lua } from "./icons.jsx";
import { useTema } from "../tema.jsx";

function Termos({ aberto, onFechar }) {
  return (
    <Modal
      title="Sobre o Mazestream"
      open={aberto}
      onCancel={onFechar}
      centered
      footer={[<Button key="ok" type="primary" onClick={onFechar}>Entendi</Button>]}
    >
      <div className="termos-texto">
        <p>O <b>Mazestream</b> roda num servidor caseiro, o mesmo que uso pros meus projetos de RPG e outras coisas.</p>
        <p>Pra ele não sair do ar nem pesar demais, tem <b>limite de salas simultâneas</b> e de gente por sala. Se der "servidor cheio", é só esperar uma sala esvaziar.</p>
        <p>Cada pessoa que assiste puxa a transmissão do servidor, então quanto mais gente ao mesmo tempo, mais banda. Use com consciência e evite espalhar o link pra muita gente de uma vez.</p>
        <p>É de graça e sem garantia: pode cair, pode ter manutenção. Se cair, respira e tenta de novo mais tarde.</p>
      </div>
    </Modal>
  );
}

export default function JoinScreen({ entrando, onEntrar }) {
  const [nome, setNome] = useState(localStorage.getItem("meuNome") || "");
  const [sala, setSala] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("sala") || "geral"; }
    catch (e) { return "geral"; }
  });
  const [termos, setTermos] = useState(false);
  const tema = useTema();

  useEffect(() => {
    if (!localStorage.getItem("viuTermos")) {
      setTermos(true);
      localStorage.setItem("viuTermos", "1");
    }
  }, []);

  function submeter() {
    const n = (nome || "").trim() || "convidado";
    const s = (sala || "").trim() || "geral";
    onEntrar(n, s);
  }

  return (
    <div className="entrar-wrap">
      <div className="entrar-card">
        <div className="entrar-topo">
          <div className="marca">Mazestream</div>
          <Tooltip title={tema.escuro ? "Tema claro" : "Tema escuro"}>
            <Button className="tema-btn" aria-label="Alternar tema"
              icon={tema.escuro ? <Sol /> : <Lua />} onClick={tema.alternar} />
          </Tooltip>
        </div>
        <h1>Entre e compartilhe.</h1>
        <p className="sub">Tela, câmera e áudio em uma sala, direto no navegador. A voz fica no seu Discord.</p>

        <div className="campo">
          <label htmlFor="nome">Seu nome</label>
          <Input id="nome" size="large" placeholder="Seu nome" maxLength={40}
            value={nome} onChange={(e) => setNome(e.target.value)} onPressEnter={submeter} />
        </div>

        <div className="campo">
          <label htmlFor="sala">Nome da sala</label>
          <Input id="sala" size="large" placeholder="geral" maxLength={40}
            value={sala} onChange={(e) => setSala(e.target.value)} onPressEnter={submeter} />
        </div>

        <Button type="primary" size="large" block loading={entrando} onClick={submeter}>
          Entrar
        </Button>

        <p className="entrar-aviso">
          Servidor caseiro e compartilhado, com limite de salas.{" "}
          <Button type="link" onClick={() => setTermos(true)}>Por quê?</Button>
        </p>
      </div>

      <Termos aberto={termos} onFechar={() => setTermos(false)} />
    </div>
  );
}
