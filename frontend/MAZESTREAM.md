# Mazestream (frontend React)

> Nota historica: os comandos e a estrutura abaixo antecedem o workspace e os
> pacotes pre-compilados. Para instalar, atualizar ou desenvolver, use o
> [README atual](../README.md), o [guia de desenvolvimento](../docs/DEVELOPMENT.md)
> e o [guia de implantacao](../docs/DEPLOYMENT.md). Eles sao a referencia atual.

Substitui o frontend antigo. Mesmo contrato: porta 3000, `/token`, mesmas variaveis
de ambiente. Agora tem build (Vite) que roda dentro do Docker.

## O que mudou nesta versao

- Rebrand pra **Mazestream** (nome, titulo, manifest).
- **Layout que cabe na tela**: nada de scroll da pagina; so o palco rola por dentro.
- **Tela cheia** agora e do proprio video (limpo, tipo player).
- **Volume** com barra clara, o slider e os botoes aparecem no fundo escuro.
- **Fluidez**: animacoes de entrada, hover e transicoes.
- **windowAudio** (isola audio da aplicacao, Chromium/Windows 2026) + aviso quando a
  captura vem sem audio.
- **Limite de salas simultaneas** no servidor + **modal de termos** na entrada.
- **Entrada resiliente**: timeouts de token/negociacao, retorno ao login quando a
  conexao cai e tela da sala carregada sob demanda.
- **Desenho local** com borracha proporcional ao pincel; preferencias por identidade
  do LiveKit, com fallback para o formato antigo salvo por nome.

## Deploy

O contrato nao mudou, entao e drop-in. O build Docker usa o perfil `host-a1` e o
overlay limita os recursos na VM compartilhada:

```bash
cd ~/livekit-oracle
sudo docker compose -f docker-compose.yaml -f docker-compose.host-a1.yaml \
  --profile web up -d --build frontend
```

O `Dockerfile` faz `npm ci` + `vite build` dentro do container (1 a 2 min na
primeira vez). Depois, hard refresh no navegador (Ctrl+Shift+R).

## Limites de salas e pessoas (importante)

O servidor recusa criar uma sala nova quando ja existem `MAX_ROOMS` (padrao A1: 2). Ele
pergunta ao LiveKit quantas salas ha antes de liberar. Salas novas sao criadas
explicitamente via `CreateRoom` com `max_participants`, entao o proprio SFU aplica
o teto mesmo se varias pessoas tentarem entrar ao mesmo tempo. O padrao A1 e 10:

```yaml
  frontend:
    environment:
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY:-}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET:-}
      - PUBLIC_WSS_URL=${PUBLIC_WSS_URL:-}
      - MAX_ROOMS=2
      - MAX_PARTICIPANTS_PER_ROOM=10
      # Vazio: usa PUBLIC_WSS_URL, convertendo ws(s) para http(s).
      - LIVEKIT_API_URL=${LIVEKIT_API_URL:-}
```

Como funciona a checagem: o servidor chama `ListRooms` e `CreateRoom` pela API do
LiveKit usando `LIVEKIT_API_URL`, quando definido, ou o endereco HTTP(S) derivado
de `PUBLIC_WSS_URL`. A rota interna e opcional: `host.docker.internal` nao garante
que o firewall permita acesso do container a porta 7880 do host. Se a API nao responder, a emissao de token falha de forma segura com
503; o app nao distribui tokens sem conseguir confirmar os limites.

## Seguranca (contra flood / DoS / injection)

O `server.cjs` foi endurecido:

- **Parsing a prova de crash**: URL e caminho malformados (ex: `%` solto) nao
  derrubam mais o processo, so respondem erro.
- **Rate limit global de `/token`** (`TOKENS_POR_SEG`, padrao 40/s): passou disso,
  responde 429. Isso limita a CPU e a amplificacao sob flood.
- **Cache do ListRooms** (3s): um flood de `/token` NAO vira um flood pra dentro
  do LiveKit; no maximo 1 chamada real a cada 3s.
- **Timeouts** de request/headers/conexao (contra slowloris).
- **Sem injection**: `room` so aceita `[a-zA-Z0-9_-]`, `name` e limpo e o token e
  JSON, entao nada de string quebra o JWT. Path traversal bloqueado.

Recomendo somar um rate limit por IP **no Nginx** (o servidor so ve o IP do Nginx,
entao o teto por IP e melhor na borda). No bloco `http {}` do `nginx.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=mazestream:10m rate=10r/s;
```

E dentro do `location /` do site do Mazestream:

```nginx
limit_req zone=mazestream burst=20 nodelay;
```

Ajuste `TOKENS_POR_SEG` no compose se precisar:

```yaml
  frontend:
    environment:
      - MAX_ROOMS=2
      - TOKENS_POR_SEG=20
```

Se o seu amigo dev for testar (stress/flood), o esperado e: `/token` responde 429
sob flood, o LiveKit nao recebe o flood (cache), e o processo nao cai. Se ele
achar um jeito de derrubar, me manda o metodo que eu tapo.

Lembrete de banda: o LiveKit e SFU, cada espectador puxa o stream, entao a banda de
saida cresce com o numero de gente assistindo. Os limites acima seguram isso.

## Aviso de banda (dois niveis)

Como o servidor e o mesmo do RPG, vale ter aviso quando o consumo sobe.

### 1. Relay do Discord (medido, automatico e com `/banda`)

O `discord-relay` consulta a cada 30s os contadores Prometheus de bytes do LiveKit
na porta local 6789. A taxa total e o acumulado sao medidos do trafego real do SFU.
Ele tambem conta as faixas de tela, camera e audio para montar uma divisao estimada
por sala. Acima de `ALERTA_MBPS` (padrao A1: 120) envia um embed automatico ao webhook
e tambem avisa quando a banda volta ao normal.

O comando `/banda` mostra:

- Mbps de entrada e saida agora;
- ritmo estimado por hora;
- salas, pessoas, telas, cameras e faixas;
- bytes reais enviados desde que o relay iniciou.

Webhook sozinho e suficiente para os alertas. Slash command exige um Discord App,
porque webhooks de entrada nao recebem comandos. Rode o deploy com:

```bash
sudo ./deploy.sh --domain live.seudominio.com \
  --with-frontend --use-caddy \
  --discord-webhook 'URL_DO_WEBHOOK' \
  --discord-app-id 'APPLICATION_ID' \
  --discord-public-key 'PUBLIC_KEY' \
  --discord-bot-token 'BOT_TOKEN' \
  --discord-guild-id 'GUILD_ID' \
  --alerta-mbps 120
```

`--discord-guild-id` e opcional, mas faz o comando aparecer imediatamente na
guild de teste. Sem ele, o comando e global. No Discord Developer Portal, defina
o **Interactions Endpoint URL** como:

```text
https://seu-dominio/discord/interactions
```

Instale o app na guild com o escopo `applications.commands`. O relay valida todas
as interacoes com a assinatura Ed25519 do Discord. As credenciais ficam apenas no
`.env` do servidor (permissao 600) e nao entram na imagem nem no Git.

O total e real para os pacotes processados pelo LiveKit. A divisao por sala ainda
e uma **estimativa**, porque Adaptive Stream, Dynacast e assinaturas desativadas
mudam quais camadas cada espectador recebe.

A porta 6789 e apenas para o relay local; nao a abra na Security List da Oracle.

### 2. Alarme da Oracle (real, autoritativo)

Esse mede os **bytes de verdade** que saem da instancia e te avisa por email.
E o que realmente protege o servidor do RPG. No painel da Oracle:

1. Menu > **Observability & Management** > **Monitoring** > **Alarms**.
2. **Create Alarm**.
3. Metric: Namespace `oci_vcn` (ou `oci_computeagent`), metrica de **bytes de
   saida** da instancia (ex: `VnicToNetworkBytes` / egress).
4. Condicao: soma por 1h acima de um limite (ex: alertar perto de ~8 TB/mes de
   ritmo). Ou um teto de taxa (Mbps) sustentado.
5. Notificacao: crie um topico e coloque seu email.

Assim voce recebe email quando a saida real dispara, independente da estimativa.
Combinado com os limites de sala e o vigia do Discord, e' o suficiente pra um
servidor caseiro nao te dar susto na conta de banda.

---

## Desenvolvimento local

Modo de rodar o frontend sem Docker nem envs, so pra testar a UI e prototipar.

### Pre-requisitos

- Node.js v20+
- Docker (pra rodar LiveKit + Redis)

### Passo a passo

**1. Instalar dependencias:**

```bash
cd frontend
npm install
```

**2. Criar `livekit.yaml` na raiz do projeto** (nao versionado):

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false
redis:
  address: 127.0.0.1:6379
keys:
  devkey: devsecret
turn:
  enabled: false
logging:
  level: info
  json: false
```

**3. Subir LiveKit + Redis:**

```bash
docker compose up -d livekit redis
```

**4. Rodar o frontend (Vite + token server):**

```bash
cd frontend
npm run dev:full
```

Isso sobe dois processos:
- **Vite** na porta `5173` (hot reload)
- **dev-server** na porta `3001` (gera tokens JWT com chave `devkey`/`devsecret`)

O Vite proxya `/token` pro dev-server automaticamente. Abra `http://localhost:5173`.

### Comandos uteis

| Comando | O que faz |
|---|---|
| `npm run dev` | Só o Vite (sem token server, nao conecta no LiveKit) |
| `npm run dev:token` | Só o token server |
| `npm run dev:full` | Vite + token server juntos |
| `npm run dev:local` | UI com a politica local de 5 Mbps |
| `npm run dev:host` | UI com a politica hospedada de 4 Mbps |
| `npm run build:local` | Build local reproduzivel em `dist/` |
| `npm run build:host` | Build do Oracle A1 em `dist/` |
| `npm run build` | Build de producao; fora do Vite dev usa `host-a1` |

### Variaveis de ambiente (todas opcionais em dev)

O `dev-server.cjs` nao exige nenhuma env. Se quiser apontar pra um LiveKit remoto,
crie um `.env` no `frontend/`:

```
PUBLIC_WSS_URL=wss://seudominio.com
LIVEKIT_API_KEY=suachave
LIVEKIT_API_SECRET=seusegreto
```

Consulte `.env.example` pra ver todas as opcoes.

### O que funciona sem LiveKit rodando

A tela de join carrega normalmente. Ao clicar "Entrar", vai dar erro de conexao
 MotionEvent: o frontend tenta conectar em `ws://localhost:7880` e falha. A UI
renderiza, mas nao tem video/audio sem o LiveKit.

### Arquitetura do dev

```
Browser (localhost:5173)
  │
  ├── /token ──proxy──> dev-server (localhost:3001)
  │                       └── gera JWT com devkey/devsecret
  │
  └── ws://localhost:7880 ──> LiveKit Server
                                └── Redis (localhost:6379)
```

### Parar tudo

```bash
# Parar frontend
Ctrl+C no terminal onde roda npm run dev:full

# Parar LiveKit + Redis
docker compose down
```
