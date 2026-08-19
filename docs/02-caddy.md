# Caddy

O fluxo documentado usa o Caddy como proxy para o domínio público do LiveKit.

O `deploy.sh` só entra nesse modo quando recebe:

```text
--use-caddy
```

## Pré requisito

O script exige que o comando `caddy` exista e que o serviço esteja ativo.

Verificação manual:

```bash
caddy version
sudo systemctl status caddy
```

## Arquivo usado

O script trabalha com:

```text
/etc/caddy/Caddyfile
```

Antes de alterar o arquivo, cria uma cópia de backup com timestamp.

## Rotas do LiveKit

O bloco criado pelo script usa estes caminhos:

```text
/rtc*
/twirp*
/validate*
```

Essas rotas são encaminhadas para:

```text
127.0.0.1:7880
```

## Raiz do domínio

Com `--with-frontend`, a raiz é encaminhada para:

```text
127.0.0.1:3000
```

Sem `--with-frontend`, a raiz responde uma mensagem de status gerada pela configuração do Caddy.

## Domínio já existente

Antes de adicionar o bloco, o script verifica se o domínio já aparece no Caddyfile fora da área que ele gerencia.

Quando encontra esse conflito, restaura o backup e encerra a execução.

## Validação

Depois de escrever o bloco, o script executa a validação do Caddyfile.

A mesma validação pode ser feita manualmente:

```bash
sudo caddy validate \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile
```

## Reload

Depois da validação, o script tenta:

```bash
sudo systemctl reload caddy
```

Se o reload falhar, o backup anterior é restaurado e uma nova tentativa de reload é feita com o arquivo restaurado.

## Logs

```bash
sudo journalctl -u caddy -n 100 --no-pager
```

Para acompanhar em tempo real:

```bash
sudo journalctl -u caddy -f
```
