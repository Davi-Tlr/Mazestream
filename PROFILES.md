# Perfis local e host A1

Veja o [README](README.md), o [guia de desenvolvimento](docs/DEVELOPMENT.md) e o
[fluxo de CI/releases](docs/CI-CD.md) para os comandos do workspace e os pacotes
pre-compilados. Os limites abaixo descrevem politicas, nao capacidade garantida.

O Mazestream possui uma unica base de codigo. A separacao acontece no build do
frontend e no Compose, evitando que correcoes de transmissao precisem ser feitas
duas vezes.

## O que muda

| Item | `local` | `host-a1` |
|---|---:|---:|
| Tela alta | 1080p30, ate 5 Mbps | 1080p30, ate 4 Mbps |
| Tela media | 720p30, ate 2,2 Mbps | 720p30, ate 1,8 Mbps |
| Tela baixa | 540p30, ate 1 Mbps | 540p30, ate 0,8 Mbps |
| Diagnostico de desenvolvimento | ligado | desligado |
| Clipes | local, sob demanda | local, sob demanda |
| LiveKit/Redis/frontend/Discord | sem teto do overlay | limites do `docker-compose.host-a1.yaml` |

O perfil hospedado nao reduz a resolucao nem o framerate. Ele reduz o teto do
encoder e preserva Adaptive Stream, Dynacast, VP9/SVC para movimento e simulcast
para detalhes. O SFU apenas encaminha as camadas; nao existe transcodificacao no
servidor.

## Desenvolvimento local

```bash
cd frontend
npm run dev:full
```

O Vite em desenvolvimento seleciona `local` automaticamente. Para comparar as
duas politicas na mesma maquina:

```bash
npm run dev:local
npm run dev:host
```

Builds reproduziveis:

```bash
npm run build:local
npm run build:host
```

## Oracle A1 compartilhado

O `deploy.sh` usa automaticamente:

```text
docker-compose.yaml + docker-compose.host-a1.yaml
```

Exemplo conservador para a maquina de 2 CPUs e 12 GB:

```bash
sudo ./deploy.sh --domain live.seudominio.com \
  --with-frontend --use-caddy \
  --max-rooms 2 --max-participants 10 --alerta-mbps 120
```

Os tetos iniciais do Mazestream sao 1,25 CPU/1536 MB para o SFU, 0,20 CPU/256 MB
para o frontend, 0,10 CPU/192 MB para Redis e 0,05 CPU/128 MB para o relay. Eles
impedem um pico deste projeto de consumir a maquina inteira, mas nao reservam
capacidade para os outros containers. Os outros projetos tambem precisam de
limites coerentes.

Com uma tela a 4 Mbps e nove espectadores, o pior caso aproximado de saida e
36 Mbps. Duas telas podem chegar perto de 72 Mbps, antes de audio e overhead. Na
pratica, Adaptive Stream reduz isso quando a tela esta pequena, oculta ou quando
o espectador escolhe qualidade menor.

## Atualizacao e rollback

O Compose usa `livekit/livekit-server:v1.13.6`. A versao inclui correcoes de
reconexao, WebSocket e VP9. Para rollback, altere somente no `.env` do servidor:

```dotenv
LIVEKIT_SERVER_IMAGE=livekit/livekit-server:v1.13.5
```

Depois aplique novamente o Compose com os dois arquivos. Nao use `latest` em
producao.

## Branches

Mantenha uma `main` integravel, branches curtas de trabalho e tags de versao.
Local e self-hosted sao dois artefatos do mesmo commit. Nao crie branches
permanentes por distribuicao nem duplique correcoes entre elas.

Os arquivos que definem a diferenca sao:

- `frontend/src/appProfile.js`;
- `frontend/.env.local-preview`;
- `frontend/.env.host-a1`;
- `docker-compose.host-a1.yaml`;
- `host-a1.env.example`.

Nunca commite `.env`, `livekit.yaml`, chaves do LiveKit ou credenciais do Discord.
