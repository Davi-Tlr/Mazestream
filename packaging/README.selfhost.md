# Mazestream — distribuição self-hosted

Pacote para servidor Linux, incluindo ARM64, com frontend pré-compilado e API Node.js. O Dockerfile da aplicação apenas copia o build: não instala dependências npm nem compila React no servidor.

Requisitos: Docker com Compose v2, domínio, HTTPS e conectividade WebRTC configurada. LiveKit e Redis usam rede do host. Discord é opcional.

## Instalação ou atualização

Siga [o guia de implantação](docs/DEPLOYMENT.md). Para uma instalação existente, preserve `.env`, `livekit.yaml`, o nome do projeto Compose e a configuração do proxy. Copie o pacote completo: o contexto Docker é a raiz, não somente `frontend/`.

Para atualizar apenas a aplicação já configurada:

```bash
sudo docker compose -f docker-compose.yaml -f docker-compose.host-a1.yaml \
  --profile web up -d --build --no-deps frontend
```

Não execute `deploy.sh` como rotina de atualização sem revisão: ele configura pacotes do sistema, firewall e proxy. Não há credenciais de produção incluídas neste pacote.

O perfil solicita até 1080p30 / 4 Mbps. Os limites A1 são um ponto de partida, não uma garantia de capacidade. Confira `release.json`, `SHA256SUMS` e `/build-info.json` após a implantação. Teste a recepção em outro dispositivo antes de considerar a atualização validada.
