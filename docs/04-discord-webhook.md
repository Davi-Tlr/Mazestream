# Discord webhook

O projeto possui um serviço opcional chamado `discord-relay`.

O serviço é habilitado quando o deploy recebe:

```text
--discord-webhook
```

## Exemplo

```bash
sudo ./deploy.sh \
  --domain livekit.exemplo.com \
  --with-frontend \
  --use-caddy \
  --discord-webhook "URL_DO_WEBHOOK"
```

## Docker Compose

O serviço pertence ao profile:

```text
discord
```

O build usa:

```text
./discord-relay
```

A porta é publicada somente localmente:

```text
127.0.0.1:8080
```

## Variáveis

O serviço recebe:

```text
DISCORD_WEBHOOK_URL
PUBLIC_URL
```

O `deploy.sh` grava esses valores no `.env`.

`PUBLIC_URL` é gerada a partir do domínio informado:

```text
PUBLIC_URL=https://DOMINIO
```

## Configuração no LiveKit

Quando a URL do webhook é informada, o script adiciona ao `livekit.yaml` uma configuração de webhook apontando para:

```text
http://localhost:8080
```

A API Key gerada para o LiveKit também é usada nessa configuração.

## Verificação

Confira o serviço:

```bash
sudo docker compose ps
```

Veja os logs:

```bash
sudo docker compose logs discord-relay
```

Se o serviço não aparecer, confirme se `--discord-webhook` foi incluído no comando de deploy.
