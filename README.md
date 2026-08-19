# LiveKit Self Hosted com Caddy

Este repositório reúne uma configuração de LiveKit executada com Docker Compose, Redis e Caddy.

O projeto também possui dois serviços opcionais no Compose:

* frontend próprio, habilitado pelo profile `web`
* relay para webhook do Discord, habilitado pelo profile `discord`

O projeto usa Caddy como proxy HTTP/HTTPS.

## Componentes

`deploy.sh`

Automatiza a preparação do servidor, a geração das credenciais do LiveKit, a criação dos arquivos de configuração, a inicialização dos containers e a integração com o Caddy.

`docker-compose.yaml`

Define os serviços `livekit`, `redis`, `frontend` e `discord-relay`.

`livekit.yaml`

Arquivo de configuração usado pelo servidor LiveKit. O `deploy.sh` gera esse arquivo durante o deploy.

`.env`

Arquivo gerado pelo `deploy.sh` com variáveis usadas pelos serviços opcionais.

`livekit.yaml.example`

Exemplo de estrutura de configuração do LiveKit.

## Requisitos do fluxo documentado

O servidor precisa atender aos requisitos usados pelo próprio `deploy.sh`:

1. Linux com `apt-get` e `systemd`
2. acesso com privilégios de root ou `sudo`
3. domínio apontando para o IP público do servidor
4. Caddy instalado e ativo
5. acesso às regras de firewall da hospedagem e do sistema

O Docker é instalado pelo script quando necessário.

## Portas usadas

O fluxo com Caddy utiliza as seguintes portas públicas:

```text
80/TCP
443/TCP
7881/TCP
3478/UDP
50000-60000/UDP
```

O `deploy.sh` também libera `443/UDP` no firewall local.

A porta `7880/TCP` é usada pelo LiveKit internamente e não precisa ser exposta diretamente à internet.

Mais detalhes estão em [docs/01-rede-e-firewall.md](docs/01-rede-e-firewall.md).

## Deploy básico

Confirme primeiro que o Caddy está ativo:

```bash
sudo systemctl status caddy
```

Depois execute:

```bash
chmod +x deploy.sh

sudo ./deploy.sh \
  --domain livekit.exemplo.com \
  --with-frontend \
  --use-caddy
```

A flag `--domain` é obrigatória.

A flag `--with-frontend` é opcional. Sem ela, o serviço `frontend` não é iniciado.

## DuckDNS

O uso de DuckDNS é opcional.

Quando um domínio DuckDNS for usado, o token pode ser passado ao script:

```bash
sudo ./deploy.sh \
  --domain exemplo.duckdns.org \
  --duckdns-token TOKEN \
  --with-frontend \
  --use-caddy
```

O script envia uma atualização de IP para o DuckDNS quando `--duckdns-token` é informado.

## Discord

O relay para Discord também é opcional.

```bash
sudo ./deploy.sh \
  --domain livekit.exemplo.com \
  --with-frontend \
  --use-caddy \
  --discord-webhook "URL_DO_WEBHOOK"
```

Quando essa flag é usada, o profile `discord` é incluído no Docker Compose.

## O que o script faz no modo Caddy

No fluxo com `--use-caddy`, o script:

1. verifica se o Caddy está instalado
2. verifica se o serviço Caddy está ativo
3. instala Docker, curl, OpenSSL e Git
4. instala Docker Compose quando necessário
5. gera ou reaproveita a API Key e o API Secret
6. gera `livekit.yaml`
7. gera `.env`
8. ajusta o firewall local
9. sobe os serviços do Docker Compose
10. cria um backup do Caddyfile
11. adiciona o domínio do LiveKit ao Caddyfile
12. valida a configuração do Caddy
13. recarrega o Caddy
14. imprime a URL, a API Key e o API Secret

## Arquivos sensíveis

`livekit.yaml` e `.env` guardam credenciais.

O `.gitignore` do projeto já inclui:

```text
livekit.yaml
.env
.env.local
.env.production
```

Antes de compartilhar o projeto, confirme que nenhum arquivo com credenciais reais foi enviado junto.

## Documentação

O passo a passo completo está em [GUIA-COMPLETO.md](GUIA-COMPLETO.md).

Os documentos de referência estão em:

* [Rede e firewall](docs/01-rede-e-firewall.md)
* [Caddy](docs/02-caddy.md)
* [Frontend](docs/03-frontend.md)
* [Discord webhook](docs/04-discord-webhook.md)
* [Operação](docs/05-operacao.md)
* [Troubleshooting](docs/06-troubleshooting.md)
