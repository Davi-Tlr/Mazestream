# Mazestream (frontend React)

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

## Deploy

O contrato nao mudou, entao e drop-in. Troque o conteudo da pasta `frontend/` por
estes arquivos e rebuilde:

```bash
cd ~/livekit-oracle
sudo docker compose up -d --build frontend
```

O `Dockerfile` faz `npm install` + `vite build` dentro do container (1 a 2 min na
primeira vez). Depois, hard refresh no navegador (Ctrl+Shift+R).

## Limite de salas (importante)

O servidor recusa criar uma sala nova quando ja existem `MAX_ROOMS` (padrao 5). Ele
pergunta ao LiveKit quantas salas ha antes de liberar. Adicione a variavel no
servico `frontend` do seu `docker-compose.yaml`:

```yaml
  frontend:
    environment:
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY:-}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET:-}
      - PUBLIC_WSS_URL=${PUBLIC_WSS_URL:-}
      - MAX_ROOMS=5
      # Opcional. Padrao: deriva do PUBLIC_WSS_URL (wss -> https), que passa pelo
      # seu Nginx em /twirp. So defina se quiser apontar direto pro LiveKit.
      # - LIVEKIT_API_URL=http://SEU_HOST:7880
```

Como funciona a checagem: o servidor chama a API do LiveKit (`ListRooms`) usando a
URL derivada do `PUBLIC_WSS_URL`. Pra isso funcionar, o seu Nginx precisa fazer
proxy de `/twirp` pro LiveKit (o `deploy.sh` ja configura isso). Se a checagem
falhar por qualquer motivo, o servidor **deixa entrar** (falha aberta), pra um
erro de rede nunca travar todo mundo. Ou seja: no pior caso o limite nao e
aplicado, mas o app nunca quebra por causa dele.

## Limite por sala (no livekit.yaml)

Pra travar o tamanho de cada sala e fechar salas vazias (que senao ocupam o teto de
salas), adicione no seu `livekit.yaml`:

```yaml
room:
  max_participants: 12      # teto de gente por sala
  empty_timeout: 300        # fecha sala vazia depois de 5 min
  departure_timeout: 20
```

Depois: `sudo docker compose restart livekit`.

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
      - MAX_ROOMS=5
      - TOKENS_POR_SEG=40
```

Se o seu amigo dev for testar (stress/flood), o esperado e: `/token` responde 429
sob flood, o LiveKit nao recebe o flood (cache), e o processo nao cai. Se ele
achar um jeito de derrubar, me manda o metodo que eu tapo.

Lembrete de banda: o LiveKit e SFU, cada espectador puxa o stream, entao a banda de
saida cresce com o numero de gente assistindo. Os limites acima seguram isso.

## Aviso de banda (dois niveis)

Como o servidor e o mesmo do RPG, vale ter aviso quando o consumo sobe.

### 1. Vigia no servidor (estimado, avisa no Discord)

O `server.cjs` consulta o LiveKit a cada 30s, estima os Mbps de saida
(publicadores x espectadores x bitrate) e, se passar do teto, manda um aviso no
seu Discord. So liga se voce definir o webhook. No servico `frontend` do compose:

```yaml
  frontend:
    environment:
      - ALERTA_WEBHOOK=https://discord.com/api/webhooks/SEU_WEBHOOK
      - ALERTA_MBPS=250        # avisa acima disso (padrao 250)
      - BITRATE_MBPS=6         # bitrate por stream pra estimativa (padrao 6)
```

E uma **estimativa** (nao mede bytes reais), boa como heads-up rapido.

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
