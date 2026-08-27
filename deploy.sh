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
#   --discord-webhook URL   envia eventos e alertas automaticos ao Discord.
#   --discord-app-id ID     Application ID para registrar o comando /banda.
#   --discord-public-key K  Public Key usada para validar interacoes do Discord.
#   --discord-bot-token T   Bot Token usado somente para registrar /banda.
#   --discord-guild-id ID   opcional. Registra /banda imediatamente em uma guild.
#   --alerta-mbps N         dispara alerta automatico acima deste Mbps (padrao A1: 120).
#   --max-rooms N           limita salas simultaneas (padrao A1: 2).
#   --max-participants N    limita pessoas por sala (padrao A1: 10).
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
DISCORD_APP_ID=""
DISCORD_PUBLIC_KEY=""
DISCORD_BOT_TOKEN=""
DISCORD_GUILD_ID=""
ALERTA_MBPS="120"
ALERTA_MBPS_SET=0
MAX_ROOMS_SETTING="2"
MAX_ROOMS_SET=0
MAX_PARTICIPANTS_SETTING="10"
MAX_PARTICIPANTS_SET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)          DOMAIN="$2"; shift 2 ;;
    --duckdns-token)   DUCKDNS_TOKEN="$2"; shift 2 ;;
    --email)           EMAIL="$2"; shift 2 ;;
    --with-frontend)   WITH_WEB=1; shift ;;
    --use-caddy)       USE_CADDY=1; shift ;;
    --skip-ssl)        SKIP_SSL=1; shift ;;
    --discord-webhook) DISCORD_WEBHOOK="$2"; shift 2 ;;
    --discord-app-id) DISCORD_APP_ID="$2"; shift 2 ;;
    --discord-public-key) DISCORD_PUBLIC_KEY="$2"; shift 2 ;;
    --discord-bot-token) DISCORD_BOT_TOKEN="$2"; shift 2 ;;
    --discord-guild-id) DISCORD_GUILD_ID="$2"; shift 2 ;;
    --alerta-mbps) ALERTA_MBPS="$2"; ALERTA_MBPS_SET=1; shift 2 ;;
    --max-rooms) MAX_ROOMS_SETTING="$2"; MAX_ROOMS_SET=1; shift 2 ;;
    --max-participants) MAX_PARTICIPANTS_SETTING="$2"; MAX_PARTICIPANTS_SET=1; shift 2 ;;
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

# Em reexecucoes, preserva a integracao Discord se as flags nao forem repetidas.
env_value() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -1
}
[ -z "$DISCORD_WEBHOOK" ] && DISCORD_WEBHOOK="$(env_value DISCORD_WEBHOOK_URL)"
[ -z "$DISCORD_APP_ID" ] && DISCORD_APP_ID="$(env_value DISCORD_APPLICATION_ID)"
[ -z "$DISCORD_PUBLIC_KEY" ] && DISCORD_PUBLIC_KEY="$(env_value DISCORD_PUBLIC_KEY)"
[ -z "$DISCORD_BOT_TOKEN" ] && DISCORD_BOT_TOKEN="$(env_value DISCORD_BOT_TOKEN)"
[ -z "$DISCORD_GUILD_ID" ] && DISCORD_GUILD_ID="$(env_value DISCORD_GUILD_ID)"
SAVED_ALERTA_MBPS="$(env_value ALERTA_MBPS)"
[ "$ALERTA_MBPS_SET" -eq 0 ] && [ -n "$SAVED_ALERTA_MBPS" ] && ALERTA_MBPS="$SAVED_ALERTA_MBPS"
SAVED_MAX_ROOMS="$(env_value MAX_ROOMS)"
[ "$MAX_ROOMS_SET" -eq 0 ] && [ -n "$SAVED_MAX_ROOMS" ] && MAX_ROOMS_SETTING="$SAVED_MAX_ROOMS"
SAVED_MAX_PARTICIPANTS="$(env_value MAX_PARTICIPANTS_PER_ROOM)"
[ "$MAX_PARTICIPANTS_SET" -eq 0 ] && [ -n "$SAVED_MAX_PARTICIPANTS" ] && MAX_PARTICIPANTS_SETTING="$SAVED_MAX_PARTICIPANTS"
LIVEKIT_SERVER_IMAGE="$(env_value LIVEKIT_SERVER_IMAGE)"
[ -z "$LIVEKIT_SERVER_IMAGE" ] && LIVEKIT_SERVER_IMAGE="livekit/livekit-server:v1.13.6"
MAZESTREAM_LIVEKIT_CPUS="$(env_value MAZESTREAM_LIVEKIT_CPUS)"
[ -z "$MAZESTREAM_LIVEKIT_CPUS" ] && MAZESTREAM_LIVEKIT_CPUS="1.25"
MAZESTREAM_LIVEKIT_MEMORY="$(env_value MAZESTREAM_LIVEKIT_MEMORY)"
[ -z "$MAZESTREAM_LIVEKIT_MEMORY" ] && MAZESTREAM_LIVEKIT_MEMORY="1536m"
MAZESTREAM_REDIS_CPUS="$(env_value MAZESTREAM_REDIS_CPUS)"
[ -z "$MAZESTREAM_REDIS_CPUS" ] && MAZESTREAM_REDIS_CPUS="0.10"
MAZESTREAM_REDIS_MEMORY="$(env_value MAZESTREAM_REDIS_MEMORY)"
[ -z "$MAZESTREAM_REDIS_MEMORY" ] && MAZESTREAM_REDIS_MEMORY="192m"
MAZESTREAM_FRONTEND_CPUS="$(env_value MAZESTREAM_FRONTEND_CPUS)"
[ -z "$MAZESTREAM_FRONTEND_CPUS" ] && MAZESTREAM_FRONTEND_CPUS="0.20"
MAZESTREAM_FRONTEND_MEMORY="$(env_value MAZESTREAM_FRONTEND_MEMORY)"
[ -z "$MAZESTREAM_FRONTEND_MEMORY" ] && MAZESTREAM_FRONTEND_MEMORY="256m"
MAZESTREAM_DISCORD_CPUS="$(env_value MAZESTREAM_DISCORD_CPUS)"
[ -z "$MAZESTREAM_DISCORD_CPUS" ] && MAZESTREAM_DISCORD_CPUS="0.05"
MAZESTREAM_DISCORD_MEMORY="$(env_value MAZESTREAM_DISCORD_MEMORY)"
[ -z "$MAZESTREAM_DISCORD_MEMORY" ] && MAZESTREAM_DISCORD_MEMORY="128m"
DISCORD_ENABLED=0
if [ -n "$DISCORD_WEBHOOK" ] || [ -n "$DISCORD_APP_ID" ]; then
  DISCORD_ENABLED=1
fi

if ! printf '%s' "$ALERTA_MBPS" | grep -Eq '^[0-9]+([.][0-9]+)?$'; then
  echo "Valor invalido para --alerta-mbps: $ALERTA_MBPS"
  exit 1
fi
if ! printf '%s' "$MAX_ROOMS_SETTING" | grep -Eq '^[1-9][0-9]*$' || [ "$MAX_ROOMS_SETTING" -gt 1000 ]; then
  echo "Valor invalido para --max-rooms: $MAX_ROOMS_SETTING"
  exit 1
fi
if ! printf '%s' "$MAX_PARTICIPANTS_SETTING" | grep -Eq '^([2-9]|[1-9][0-9]+)$' || [ "$MAX_PARTICIPANTS_SETTING" -gt 100 ]; then
  echo "Valor invalido para --max-participants: $MAX_PARTICIPANTS_SETTING"
  exit 1
fi
if [ -n "$DISCORD_PUBLIC_KEY" ] && ! printf '%s' "$DISCORD_PUBLIC_KEY" | grep -Eq '^[A-Fa-f0-9]{64}$'; then
  echo "Discord Public Key invalida: esperado hexadecimal com 64 caracteres."
  exit 1
fi
if [ -n "$DISCORD_APP_ID" ] && ! printf '%s' "$DISCORD_APP_ID" | grep -Eq '^[0-9]+$'; then
  echo "Discord Application ID invalido."
  exit 1
fi
if [ -n "$DISCORD_GUILD_ID" ] && ! printf '%s' "$DISCORD_GUILD_ID" | grep -Eq '^[0-9]+$'; then
  echo "Discord Guild ID invalido."
  exit 1
fi
if [ -n "$DISCORD_APP_ID$DISCORD_PUBLIC_KEY$DISCORD_BOT_TOKEN$DISCORD_GUILD_ID" ]; then
  if [ -z "$DISCORD_APP_ID" ] || [ -z "$DISCORD_PUBLIC_KEY" ] || [ -z "$DISCORD_BOT_TOKEN" ]; then
    echo "Configuracao incompleta do Discord App: informe App ID, Public Key e Bot Token juntos."
    exit 1
  fi
fi

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
  require_free_port tcp 6789 LiveKit-Metrics
  require_free_port tcp 7880 LiveKit-API
  require_free_port tcp 7881 LiveKit-RTC
  require_free_port udp 3478 TURN
  [ "$WITH_WEB" -eq 1 ] && require_free_port tcp 3000 frontend
  [ "$DISCORD_ENABLED" -eq 1 ] && require_free_port tcp 8080 Discord-relay
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
COMPOSE_HOST="$COMPOSE -f docker-compose.yaml -f docker-compose.host-a1.yaml"
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
prometheus_port: 6789

room:
  empty_timeout: 300
  departure_timeout: 20
  max_participants: $MAX_PARTICIPANTS_SETTING

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  congestion_control:
    enabled: true
    allow_pause: true
  allow_tcp_fallback: true

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
LIVEKIT_SERVER_IMAGE=$LIVEKIT_SERVER_IMAGE
MAZESTREAM_BUILD_PROFILE=host
MAZESTREAM_LIVEKIT_CPUS=$MAZESTREAM_LIVEKIT_CPUS
MAZESTREAM_LIVEKIT_MEMORY=$MAZESTREAM_LIVEKIT_MEMORY
MAZESTREAM_REDIS_CPUS=$MAZESTREAM_REDIS_CPUS
MAZESTREAM_REDIS_MEMORY=$MAZESTREAM_REDIS_MEMORY
MAZESTREAM_FRONTEND_CPUS=$MAZESTREAM_FRONTEND_CPUS
MAZESTREAM_FRONTEND_MEMORY=$MAZESTREAM_FRONTEND_MEMORY
MAZESTREAM_DISCORD_CPUS=$MAZESTREAM_DISCORD_CPUS
MAZESTREAM_DISCORD_MEMORY=$MAZESTREAM_DISCORD_MEMORY
PUBLIC_WSS_URL=wss://$DOMAIN
# Vazio: frontend e relay usam PUBLIC_WSS_URL, convertendo wss:// para https://.
# Uma rota interna pode ser definida explicitamente depois de validar a rede.
LIVEKIT_API_URL=
LIVEKIT_METRICS_URL=http://host.docker.internal:6789/metrics
DISCORD_WEBHOOK_URL=$DISCORD_WEBHOOK
DISCORD_APPLICATION_ID=$DISCORD_APP_ID
DISCORD_PUBLIC_KEY=$DISCORD_PUBLIC_KEY
DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
DISCORD_GUILD_ID=$DISCORD_GUILD_ID
ALERTA_MBPS=$ALERTA_MBPS
BANDWIDTH_INTERVAL_SECONDS=30
BANDWIDTH_ALERT_COOLDOWN_MINUTES=10
MAX_ROOMS=$MAX_ROOMS_SETTING
MAX_PARTICIPANTS_PER_ROOM=$MAX_PARTICIPANTS_SETTING
TOKENS_POR_SEG=20
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
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css text/javascript application/javascript application/json application/manifest+json image/svg+xml;

    # Sinalizacao do LiveKit (WebSocket e APIs)
    location /rtc      { proxy_pass http://127.0.0.1:7880; proxy_http_version 1.1; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "Upgrade"; proxy_set_header Host \$host; proxy_buffering off; proxy_read_timeout 3600s; proxy_send_timeout 3600s; }
    location /twirp    { proxy_pass http://127.0.0.1:7880; proxy_set_header Host \$host; }
    location /validate { proxy_pass http://127.0.0.1:7880; proxy_set_header Host \$host; }

    # Interacoes assinadas do Discord (/banda)
    location = /discord/interactions {
        proxy_pass http://127.0.0.1:8080/discord/interactions;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

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
[ "$DISCORD_ENABLED" -eq 1 ] && PROFILES="$PROFILES --profile discord"
$COMPOSE_HOST $PROFILES up -d --build
sleep 4
$COMPOSE_HOST $PROFILES ps

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
    encode zstd gzip
EOF
  if [ "$DISCORD_ENABLED" -eq 1 ]; then
    cat >> "$CADDYFILE" <<'EOF'
    @discord_interactions path /discord/interactions
    handle @discord_interactions {
        reverse_proxy 127.0.0.1:8080
    }
EOF
  fi
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
if [ "$DISCORD_ENABLED" -eq 1 ]; then
  echo " Relay do Discord ligado: eventos e alertas automaticos de banda estao ativos."
  if [ -n "$DISCORD_APP_ID" ] && [ -n "$DISCORD_PUBLIC_KEY" ] && [ -n "$DISCORD_BOT_TOKEN" ]; then
    echo " Comando /banda configurado. Interactions Endpoint: https://$DOMAIN/discord/interactions"
  else
    echo " Para ativar /banda, rode novamente com App ID, Public Key e Bot Token do Discord."
  fi
fi
if [ "$USE_CADDY" -eq 1 ]; then
  echo " Caddy preservado: Foundry e LiveKit usam dominios diferentes no mesmo IP."
  echo " TURN/UDP ativo em 3478. TURN/TLS nao e ativado neste modo para nao disputar a porta 443 com o Caddy."
fi
echo ""
echo " Ainda precisa (uma vez, fora do script):"
echo "  - Abrir as portas no painel do Oracle (Security List), em especial 50000-60000/UDP."
echo "  - DNS $DOMAIN apontando pro IP publico (o DuckDNS ja faz se voce passou o token)."
