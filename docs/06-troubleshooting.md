# Troubleshooting

Este documento cobre problemas que podem ser diagnosticados pelos arquivos e comandos usados pelo próprio projeto.

## O script informa que o Caddy não foi encontrado

O modo `--use-caddy` exige que o comando `caddy` exista.

Confira:

```bash
caddy version
```

Se o comando não existir, o deploy é encerrado antes de continuar.

## O script informa que o Caddy não está ativo

Confira:

```bash
sudo systemctl status caddy
```

O deploy também encerra quando o serviço Caddy não está ativo.

## Porta interna já está em uso

Na primeira instalação, o script verifica portas antes de alterar o servidor.

Confira todos os sockets:

```bash
sudo ss -lntup
```

Portas verificadas pelo fluxo básico:

```text
6379/TCP
7880/TCP
7881/TCP
3478/UDP
```

Com frontend:

```text
3000/TCP
```

Com relay:

```text
8080/TCP
```

## LiveKit não sobe

Confira o estado:

```bash
sudo docker compose ps
```

Veja os logs:

```bash
sudo docker compose logs livekit
```

Confira se as portas principais estão ocupadas:

```bash
sudo ss -lntup | grep -E '7880|7881|3478'
```

## Redis não sobe

Veja os logs:

```bash
sudo docker compose logs redis
```

Confira a porta:

```bash
sudo ss -ltnp | grep 6379
```

O Compose configura o Redis para escutar em `127.0.0.1`.

## O domínio abre, mas a mídia não funciona

Confira as regras UDP externas e locais.

A configuração gerada usa:

```text
3478/UDP
50000-60000/UDP
```

No `livekit.yaml`, confirme:

```yaml
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
```

## WebSocket não conecta

O Caddy precisa encaminhar as rotas do LiveKit para:

```text
127.0.0.1:7880
```

Valide o Caddyfile:

```bash
sudo caddy validate \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile
```

Veja os logs:

```bash
sudo journalctl -u caddy -n 100 --no-pager
```

Confira também o LiveKit:

```bash
sudo docker compose logs livekit
```

## O frontend não aparece

Confirme se o deploy usou:

```text
--with-frontend
```

Confira:

```bash
sudo docker compose ps
sudo docker compose logs frontend
```

O serviço usa o profile `web`.

## O relay do Discord não aparece

Confirme se o deploy recebeu:

```text
--discord-webhook
```

Confira:

```bash
sudo docker compose ps
sudo docker compose logs discord-relay
```

O serviço usa o profile `discord`.

## O Caddyfile não passa na validação

Execute:

```bash
sudo caddy validate \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile
```

O `deploy.sh` cria um backup antes de alterar o Caddyfile e restaura esse backup quando a validação feita pelo próprio script falha.

## DuckDNS não retorna OK

Quando `--duckdns-token` é informado, o script envia a atualização ao DuckDNS e mostra a resposta.

Se a resposta for diferente de `OK`, confira o domínio e o token usados no comando.

## Verificação geral

```bash
sudo docker compose ps
sudo docker compose logs --tail=100 livekit
sudo systemctl status caddy
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo ss -lntup
```
