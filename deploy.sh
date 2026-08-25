#!/usr/bin/env bash
#
# deploy.sh - sobe o LiveKit no Oracle A1 com HTTPS automatico.
#
# Faz: Docker, chaves da API, livekit.yaml, portas do firewall, DuckDNS,
# proxy do WebSocket com Caddy existente ou Nginx e, se voce quiser, o
# frontend proprio.
#
# Uso com Foundry + Caddy na mesma instancia:
#   sudo ./deploy.sh --domain seunome.duckdns.org --duckdns-token SEU_TOKEN --with-frontend --use-caddy
#
# Flags:
#   --domain HOST           obrigatorio. Ex: seunome.duckdns.org
#   --duckdns-token TOKEN   opcional. Se passar, o script atualiza o IP no DuckDNS.
#   --email EMAIL           opcional. Usado pelo Let's Encrypt (avisos de expiracao).
#   --with-frontend         opcional. Sobe o frontend proprio (2 telas + painel de conexao).
#   --use-caddy             preserva o Caddy existente e adiciona um dominio para o LiveKit.
#   --skip-ssl              opcional. Nao tenta gerar certificado (util em re-runs).
#
# Idempotente: pode rodar de novo sem quebrar.

set -euo pipefail

# ---------- parse de argumentos ----------
DOMAIN=""
DUCKDNS_TOKEN=""
EMAIL=""
WITH_WEB=0
USE_CADDY=0
SKIP_SSL=0
DISCORD_WEBHOOK=""

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)          DOMAIN="$2"; shift 2 ;;
    --duckdns-token)   DUCKDNS_TOKEN="$2"; shift 2 ;;
    --email)           EMAIL="$2"; shift 2 ;;
    --with-frontend)   WITH_WEB=1; shift ;;
    --use-caddy)       USE_CADDY=1; shift ;;
    --skip-ssl)        SKIP_SSL=1; shift ;;
    --discord-webhook) DISCORD_WEBHOOK="$2"; shift 2 ;;
    *) echo "Flag desconhecida: $1"; exit 1 ;;
  esac
done

if [ -z "$DOMAIN" ]; then
  read -rp "Dominio (ex: seunome.duckdns.org): " DOMAIN
fi
if [ -z "$DOMAIN" ]; then
  echo "Precisa de um dominio. Abortando."
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo."
  exit 1
fi

WORKDIR="$(cd "$(dirname "$0")" && pwd)"
cd "$WORKDIR"
echo ">> Diretorio: $WORKDIR"
echo ">> Dominio:   $DOMAIN"

if ! printf '%s' "$DOMAIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'; then
  echo "Dominio invalido: $DOMAIN"
  exit 1
fi

# ---------- preflight do proxy ----------
if [ "$USE_CADDY" -eq 1 ]; then
  if ! command -v caddy >/dev/null 2>&1; then
    echo "Caddy nao encontrado. Instale ou configure o Caddy antes de usar --use-caddy."
    exit 1
  fi
  if ! systemctl is-active --quiet caddy; then
    echo "Caddy esta instalado, mas nao esta ativo. Inicie o Caddy antes de continuar."
    exit 1
  fi
  echo ">> Proxy existente: Caddy"
else
  if systemctl is-active --quiet caddy 2>/dev/null; then
    echo "Caddy ativo detectado. Rode novamente com --use-caddy para nao causar conflito nas portas 80 e 443."
    exit 1
  fi
  echo ">> Proxy: Nginx"
fi

# Na primeira instalacao, pare antes de alterar o servidor se alguma porta
# interna necessaria ja estiver em uso. Em reexecucoes, o proprio projeto pode
# estar ocupando essas portas e o Docker Compose cuidara da atualizacao.
if [ ! -f .env ]; then
  require_free_port() {
    local proto="$1" port="$2" label="$3"
    local flag="-ltn"
    [ "$proto" = "udp" ] && flag="-lun"
    if ss -H "$flag" | grep -Eq ":${port}[[:space:]]"; then
      echo "Porta $port/$proto ja esta em uso ($label)."
      echo "Nada foi instalado ou alterado. Descubra o processo com: sudo ss -lntup"
      exit 1
    fi
  }

  require_free_port tcp 6379 Redis
  require_free_port tcp 7880 LiveKit-API
  require_free_port tcp 7881 LiveKit-RTC
  require_free_port udp 3478 TURN
  [ "$WITH_WEB" -eq 1 ] && require_free_port tcp 3000 frontend
  [ -n "$DISCORD_WEBHOOK" ] && require_free_port tcp 8080 Discord-relay
  if [ "$USE_CADDY" -eq 0 ]; then
    require_free_port tcp 80 Certbot-Nginx
    require_free_port tcp 443 Nginx
    require_free_port tcp 5349 TURN-TLS
  fi

  if ss -H -lun | grep -Eq ':([5][0-9]{4}|60000)[[:space:]]'; then
    echo "Existe uma porta UDP entre 50000 e 60000 em uso, faixa necessaria para o LiveKit."
    echo "Nada foi instalado ou alterado. Descubra o processo com: sudo ss -lunp"
    exit 1
  fi
  echo ">> Portas internas do LiveKit estao livres."
else
  echo ">> Reexecucao detectada. O Compose atualizara os servicos existentes."
fi

# ---------- 1. Pacotes base ----------
echo ">> Instalando dependencias..."
apt-get update -y
apt-get install -y docker.io curl openssl git
systemctl enable --now docker

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  apt-get install -y docker-compose
  COMPOSE="docker-compose"
fi
echo ">> Compose: $COMPOSE"

# ---------- 2. DuckDNS (opcional) ----------
if [ -n "$DUCKDNS_TOKEN" ]; then
  SUB="${DOMAIN%%.duckdns.org}"
  echo ">> Atualizando IP no DuckDNS ($SUB)..."
  RESP="$(curl -s "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip=")"
  echo "   DuckDNS respondeu: $RESP"
  if [ "$RESP" != "OK" ]; then
    echo "   Aviso: DuckDNS nao retornou OK. Confira o nome e o token."
  fi
fi

# ---------- 3. Chaves da API ----------
if [ -f livekit.yaml ] && grep -qE '^\s+API[a-f0-9]+:' livekit.yaml; then
  API_KEY="$(grep -E '^\s+API[a-f0-9]+:' livekit.yaml | head -1 | sed -E 's/^\s+([^:]+):.*/\1/')"
  API_SECRET="$(grep -E '^\s+API[a-f0-9]+:' livekit.yaml | head -1 | sed -E 's/.*:\s*(\S+)\s*$/\1/')"
  echo ">> Reaproveitando chaves existentes."
else
  API_KEY="API$(openssl rand -hex 6)"
  API_SECRET="$(openssl rand -base64 48 | tr -d '/+=' | head -c 43)"
  echo ">> Chaves novas geradas."
fi

# ---------- 4. Portas no firewall do servidor ----------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  open_port() {
    local proto="$1" port="$2"
    ufw allow "$port/$proto" >/dev/null
    echo "   liberado $proto/$port no UFW"
  }
  echo ">> UFW ativo detectado. Adicionando somente as regras do LiveKit..."
else
  DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
  open_port() {
    local proto="$1" port="$2"
    if ! iptables -C INPUT -p "$proto" --dport "$port" -j ACCEPT 2>/dev/null; then
      iptables -I INPUT -p "$proto" --dport "$port" -j ACCEPT
      echo "   liberado $proto/$port no iptables"
    fi
  }
  echo ">> Abrindo portas no iptables..."
fi

open_port tcp 80
open_port tcp 443
open_port tcp 7881
if [ "$USE_CADDY" -eq 0 ]; then
  open_port tcp 5349
fi
open_port udp 443
open_port udp 3478
open_port udp 50000:60000

if ! (command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'); then
  netfilter-persistent save || true
fi

# ---------- 5. Certificado HTTPS (Let's Encrypt) ----------
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ "$USE_CADDY" -eq 1 ]; then
  echo ">> HTTPS sera gerenciado pelo Caddy."
elif [ "$SKIP_SSL" -eq 0 ]; then
  if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
    echo ">> Gerando certificado para $DOMAIN..."
    apt-get install -y certbot
    systemctl stop nginx 2>/dev/null || true
    EMAIL_ARG="--register-unsafely-without-email"
    [ -n "$EMAIL" ] && EMAIL_ARG="--email $EMAIL"
    certbot certonly --standalone -d "$DOMAIN" \
      --non-interactive --agree-tos $EMAIL_ARG || {
        echo "   Certbot falhou. Confira: DNS aponta pro IP? Porta 80 aberta no painel Oracle?"
        echo "   Voce pode continuar com --skip-ssl e resolver o cert depois."
        exit 1
      }
    systemctl start nginx 2>/dev/null || true
  else
    echo ">> Certificado ja existe para $DOMAIN."
  fi
fi

# monta o bloco de TURN/TLS so se o cert existir
TURN_TLS_BLOCK=""
if [ -f "$CERT_DIR/fullchain.pem" ]; then
  TURN_TLS_BLOCK=$(printf '  tls_port: 5349\n  cert_file: %s/fullchain.pem\n  key_file: %s/privkey.pem' "$CERT_DIR" "$CERT_DIR")
fi

# bloco de webhook pro Discord (so se passar --discord-webhook)
WEBHOOK_BLOCK=""
if [ -n "$DISCORD_WEBHOOK" ]; then
  WEBHOOK_BLOCK=$(printf 'webhook:\n  api_key: %s\n  urls:\n    - http://localhost:8080' "$API_KEY")
fi

# ---------- 6. livekit.yaml ----------
cat > livekit.yaml <<EOF
# Gerado por deploy.sh. Nao commite (esta no .gitignore).
port: 7880

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true

redis:
  address: localhost:6379

keys:
  $API_KEY: $API_SECRET

turn:
  enabled: true
  domain: $DOMAIN
  udp_port: 3478
$TURN_TLS_BLOCK

$WEBHOOK_BLOCK

logging:
  level: info
  json: false
EOF
echo ">> livekit.yaml escrito."

# arquivo .env pro compose (frontend e relay do Discord)
cat > .env <<EOF
LIVEKIT_API_KEY=$API_KEY
LIVEKIT_API_SECRET=$API_SECRET
PUBLIC_WSS_URL=wss://$DOMAIN
DISCORD_WEBHOOK_URL=$DISCORD_WEBHOOK
PUBLIC_URL=https://$DOMAIN
EOF
chmod 600 .env
echo ">> .env escrito."

# ---------- 7. Nginx (proxy do WebSocket, dominio unico) ----------
if [ "$USE_CADDY" -eq 0 ] && [ -f "$CERT_DIR/fullchain.pem" ]; then
  echo ">> Configurando Nginx..."
  apt-get install -y nginx
  # decide o destino de '/': frontend proprio (se --with-frontend) ou pagina de status
  if [ "$WITH_WEB" -eq 1 ]; then
    ROOT_PROXY="proxy_pass http://127.0.0.1:3000;"
  else
    ROOT_PROXY="return 200 'LiveKit no ar. Use este endereco como wss:// no seu frontend.';\n        add_header Content-Type text/plain;"
  fi
  cat > /etc/nginx/sites-available/livekit.conf <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;

    # Sinalizacao do LiveKit (WebSocket e APIs)
    location /rtc      { proxy_pass http://127.0.0.1:7880; proxy_http_version 1.1; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "Upgrade"; proxy_set_header Host \$host; }
    location /twirp    { proxy_pass http://127.0.0.1:7880; proxy_set_header Host \$host; }
    location /validate { proxy_pass http://127.0.0.1:7880; proxy_set_header Host \$host; }

    # Raiz: frontend ou pagina de status
    location / {
        $ROOT_PROXY
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/livekit.conf /etc/nginx/sites-enabled/livekit.conf
  nginx -t && systemctl reload nginx
  echo ">> Nginx recarregado."
fi

# ---------- 8. Sobe os containers ----------
echo ">> Subindo containers..."
PROFILES=""
[ "$WITH_WEB" -eq 1 ] && PROFILES="$PROFILES --profile web"
[ -n "$DISCORD_WEBHOOK" ] && PROFILES="$PROFILES --profile discord"
$COMPOSE $PROFILES up -d --build
sleep 4
$COMPOSE $PROFILES ps

# ---------- 9. Caddy existente (modo compativel com o Foundry) ----------
if [ "$USE_CADDY" -eq 1 ]; then
  CADDYFILE="/etc/caddy/Caddyfile"
  CADDY_BACKUP="/etc/caddy/Caddyfile.before-livekit-$(date +%Y%m%d-%H%M%S)"
  LIVEKIT_MARKER_START="# BEGIN LIVEKIT ORACLE"
  LIVEKIT_MARKER_END="# END LIVEKIT ORACLE"

  if [ ! -f "$CADDYFILE" ]; then
    echo "Caddyfile nao encontrado em $CADDYFILE. Abortando sem alterar o Caddy."
    exit 1
  fi

  cp "$CADDYFILE" "$CADDY_BACKUP"
  sed -i '/^# BEGIN LIVEKIT ORACLE$/,/^# END LIVEKIT ORACLE$/d' "$CADDYFILE"

  if grep -Fq "$DOMAIN {" "$CADDYFILE"; then
    cp "$CADDY_BACKUP" "$CADDYFILE"
    echo "O dominio $DOMAIN ja existe no Caddyfile fora do bloco gerenciado pelo LiveKit."
    echo "Nada foi alterado. Revise o bloco existente antes de tentar novamente."
    exit 1
  fi

  printf '\n%s\n%s {\n' "$LIVEKIT_MARKER_START" "$DOMAIN" >> "$CADDYFILE"
  cat >> "$CADDYFILE" <<'EOF'
    @livekit path /rtc* /twirp* /validate*
    handle @livekit {
        reverse_proxy 127.0.0.1:7880
    }
EOF
  if [ "$WITH_WEB" -eq 1 ]; then
    cat >> "$CADDYFILE" <<'EOF'
    handle {
        reverse_proxy 127.0.0.1:3000
    }
EOF
  else
    cat >> "$CADDYFILE" <<'EOF'
    handle {
        respond "LiveKit no ar. Use este dominio como wss:// no seu frontend." 200
    }
EOF
  fi
  printf '}\n%s\n' "$LIVEKIT_MARKER_END" >> "$CADDYFILE"

  if ! caddy validate --config "$CADDYFILE" --adapter caddyfile; then
    cp "$CADDY_BACKUP" "$CADDYFILE"
    echo "A configuracao do Caddy nao passou na validacao. Backup restaurado."
    exit 1
  fi
  if ! systemctl reload caddy; then
    cp "$CADDY_BACKUP" "$CADDYFILE"
    systemctl reload caddy || true
    echo "O Caddy nao recarregou. Backup restaurado."
    exit 1
  fi
  echo ">> Caddy atualizado sem substituir o bloco do Foundry."
  echo "   Backup: $CADDY_BACKUP"
fi

# ---------- 10. Resumo ----------
echo ""
echo "======================================================"
echo " LiveKit no ar em: wss://$DOMAIN"
echo ""
echo " API Key:    $API_KEY"
echo " API Secret: $API_SECRET"
echo "======================================================"
if [ "$WITH_WEB" -eq 1 ]; then
  echo " Frontend proprio (2 telas + painel de conexao): https://$DOMAIN"
else
  echo " Frontend rapido: abra https://meet.livekit.io e configure:"
  echo "   LiveKit URL: wss://$DOMAIN"
  echo "   API Key/Secret: acima"
fi
[ -n "$DISCORD_WEBHOOK" ] && echo " Relay do Discord ligado: avisos de sala/transmissao vao cair no seu canal."
if [ "$USE_CADDY" -eq 1 ]; then
  echo " Caddy preservado: Foundry e LiveKit usam dominios diferentes no mesmo IP."
  echo " TURN/UDP ativo em 3478. TURN/TLS nao e ativado neste modo para nao disputar a porta 443 com o Caddy."
fi
echo ""
echo " Ainda precisa (uma vez, fora do script):"
echo "  - Abrir as portas no painel do Oracle (Security List), em especial 50000-60000/UDP."
echo "  - DNS $DOMAIN apontando pro IP publico (o DuckDNS ja faz se voce passou o token)."
