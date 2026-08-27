# Mazestream — distribuição local

Aplicação já compilada para testes na própria máquina. Não é um instalador desktop e não deve ser exposta na internet. Não há integração Discord ou configuração de produção neste pacote.

Requisitos: Node.js 24 LTS e Docker com Compose v2. Não é necessário executar `npm install`.

Na pasta extraída:

```bash
npm run livekit:up
npm start
```

Abra [localhost:3000](http://localhost:3000). O pacote conecta ao LiveKit em localhost com credenciais públicas de desenvolvimento. As portas são restritas à própria máquina. Não use este pacote para convidar pessoas pela internet ou por outro dispositivo da rede.

Para parar a aplicação, use `Ctrl+C`. Depois:

```bash
npm run livekit:down
```

O perfil local solicita até 1080p30 / 5 Mbps. O resultado depende do navegador e do dispositivo. A versão está em `release.json` e em [build-info.json](http://localhost:3000/build-info.json). Clipes ficam no dispositivo; a sala e o quadro não são armazenamento permanente.
