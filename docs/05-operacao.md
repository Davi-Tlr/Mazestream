# Operação

Os comandos abaixo devem ser executados no diretório que contém o `docker-compose.yaml`.

## Ver serviços

```bash
sudo docker compose ps
```

Se a instalação estiver usando o comando legado:

```bash
sudo docker-compose ps
```

## Ver logs do LiveKit

```bash
sudo docker compose logs -f livekit
```

## Ver logs do Redis

```bash
sudo docker compose logs -f redis
```

## Ver logs do frontend

```bash
sudo docker compose logs -f frontend
```

O serviço só existe no conjunto ativo quando o profile `web` foi incluído.

## Ver logs do relay

```bash
sudo docker compose logs -f discord-relay
```

O serviço só existe no conjunto ativo quando o profile `discord` foi incluído.

## Reiniciar um serviço

Exemplo:

```bash
sudo docker compose restart livekit
```

## Reiniciar os serviços ativos

```bash
sudo docker compose restart
```

## Parar o Compose

```bash
sudo docker compose down
```

## Subir novamente

Para LiveKit e Redis:

```bash
sudo docker compose up -d
```

Para reproduzir a configuração criada pelo `deploy.sh`, a alternativa mais segura dentro do fluxo documentado é executar novamente o mesmo comando de deploy com as mesmas flags opcionais usadas anteriormente.

## Caddy

Status:

```bash
sudo systemctl status caddy
```

Validação:

```bash
sudo caddy validate \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile
```

Logs:

```bash
sudo journalctl -u caddy -f
```

## Arquivos gerados

O deploy gera ou atualiza:

```text
livekit.yaml
.env
```

Também altera o Caddyfile no modo `--use-caddy`.

O script cria um backup do Caddyfile antes de alterar a configuração.
