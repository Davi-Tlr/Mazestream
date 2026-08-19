# Frontend

O `docker-compose.yaml` possui um serviço chamado `frontend`.

Esse serviço é opcional e pertence ao profile:

```text
web
```

## Como o deploy habilita o frontend

A flag usada pelo script é:

```text
--with-frontend
```

Exemplo:

```bash
sudo ./deploy.sh \
  --domain livekit.exemplo.com \
  --with-frontend \
  --use-caddy
```

Quando essa flag está presente, o script inicia o Compose com o profile `web`.

## Build

O Compose constrói o serviço a partir de:

```text
./frontend
```

## Porta

O serviço é publicado somente no endereço local:

```text
127.0.0.1:3000
```

O acesso público passa pelo Caddy.

## Variáveis

O serviço recebe:

```text
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
PUBLIC_WSS_URL
```

O `deploy.sh` grava esses valores no arquivo `.env`.

O endereço público é montado a partir do domínio informado:

```text
PUBLIC_WSS_URL=wss://DOMINIO
```

## Caddy

Com o frontend habilitado, a raiz do domínio é encaminhada para:

```text
127.0.0.1:3000
```

As rotas do LiveKit continuam sendo encaminhadas para `127.0.0.1:7880`.

## Verificação

Confira os serviços:

```bash
sudo docker compose ps
```

Confira os logs:

```bash
sudo docker compose logs frontend
```

Se o frontend não aparecer no Compose, confirme se o deploy foi executado com `--with-frontend`.
