#!/usr/bin/env bash
#
# deploy.sh - prepara e sobe o LiveKit com Docker Compose e Caddy.
#
# Uso:
#   sudo ./deploy.sh --domain livekit.exemplo.com --with-frontend --use-caddy
#
# Flags:
#   --domain HOST             obrigatorio. Ex: livekit.exemplo.com
#   --duckdns-token TOKEN     opcional. Atualiza o IP quando o dominio usa DuckDNS.
#   --with-frontend           opcional. Sobe o frontend incluido no projeto.
#   --discord-webhook URL     opcional. Sobe o relay de eventos para um webhook do Discord.
#   --use-caddy               aceito para compatibilidade; Caddy e o proxy usado pelo projeto.
#
# As flags --email e --skip-ssl de versoes anteriores sao aceitas e ignoradas
# para manter compatibilidade com comandos existentes.

set -euo pipefail

DOMAIN=""
DUCKDNS_TOKEN=""
WITH_WEB=0
DISCORD_WEBHOOK=""

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)
      [ $# -ge 2 ] || { echo "Falta valor para --domain."; exit 1; }
      DOMAIN="$2"
      shift 2
      ;;
    --duckdns-token)
      [ $# -ge 2 ] || { echo "Falta valor para --duckdns-token."; exit 1; }
      DUCKDNS_TOKEN="$2"
      shift 2
      ;;
    --with-frontend)
      WITH_WEB=1
      shift
      ;;
    --discord-webhook)
      [ $# -ge 2 ] || { echo "Falta valor para --discord-webhook."; exit 1; }
      DISCORD_WEBHOOK="$2"
      shift 2
      ;;
    --use-caddy)
      shift
      ;;
    --email)
      [ $# -ge 2 ] || { echo "Falta valor para --email."; exit 1; }
      shift 2
      ;;
    --skip-ssl)
      shift
      ;;
    *)
      echo "Flag desconhecida: $1"
      exit 1
      ;;
  esac
done

if [ -z "$DOMAIN" ]; then
  read -rp "Dominio (ex: livekit.exemplo.com): " DOMAIN
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

# ---------- preflight do Caddy ----------
if ! command -v caddy >/dev/null 2>&1; then
  echo "Caddy nao encontrado. Instale e configure o Caddy antes de continuar."
  exit 1
fi

if ! systemctl is-active --quiet caddy; then
  echo "Caddy esta instalado, mas nao esta ativo. Inicie o servico antes de continuar."
  exit 1
fi

echo ">> Proxy: Caddy"

# Na primeira instalacao, interrompe antes de alterar o servidor quando uma
# porta interna necessaria ja esta ocupada. Em reexecucoes, os containers do
# proprio projeto podem estar usando essas portas.
if [ ! -f .env ]; then
  require_free_port() {
    local proto="$1" port="$2" label="$3"
    local flag="-ltn"
    [ "$proto" = "udp" ] && flag="-lun"

    if ss -H "$flag" | grep -Eq ":${port}[[:space:]]"; then
      echo "Porta $port/$proto ja esta em uso ($label)."
      echo "Confira o processo com: sudo ss -lntup"
      exit 1
    fi
  }

  require_free_port tcp 6379 Redis
  require_free_port tcp 7880 LiveKit-API
  require_free_port tcp 7881 LiveKit-RTC
  require_free_port udp 3478 TURN
  [ "$WITH_WEB" -eq 1 ] && require_free_port tcp 3000 frontend
  [ -n "$DISCORD_WEBHOOK" ] && require_free_port tcp 8080 Discord-relay

  if ss -H -lun | grep -Eq ':([5][0-9]{4}|60000)[[:space:]]'; then
    echo "Existe uma porta UDP entre 50000 e 60000 em uso, faixa necessaria para o LiveKit."
    echo "Confira o processo com: sudo ss -lunp"
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

# ---------- 2. DuckDNS opcional ----------
if [ -n "$DUCKDNS_TOKEN" ]; then
  SUB="${DOMAIN%%.duckdns.org}"
  echo ">> Atualizando IP no DuckDNS ($SUB)..."
  RESP="$(curl -s "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip=")"
  echo "   DuckDNS respondeu: $RESP"

  if [ "$RESP" != "OK" ]; then
    echo "   Aviso: DuckDNS nao retornou OK. Confira o dominio e o token."
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

# ---------- 4. Firewall local ----------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  open_port() {
    local proto="$1" port="$2"
    ufw allow "$port/$proto" >/dev/null
    echo "   liberado $proto/$port no UFW"
  }

  echo ">> UFW ativo detectado. Adicionando as regras do LiveKit..."
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
open_port udp 443
open_port udp 3478
open_port udp 50000:60000

if ! (command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'); then
  netfilter-persistent save || true
fi

echo ">> HTTPS sera gerenciado pelo Caddy."

# ---------- 5. Webhook opcional ----------
WEBHOOK_BLOCK=""
if [ -n "$DISCORD_WEBHOOK" ]; then
  WEBHOOK_BLOCK=$(printf 'webhook:\n  api_key: %s\n  urls:\n    - http://localhost:8080' "$API_KEY")
fi

# ---------- 6. livekit.yaml ----------
cat > livekit.yaml <<EOF
# Gerado por deploy.sh. Nao commite este arquivo.
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

$WEBHOOK_BLOCK

logging:
  level: info
  json: false
EOF

chmod 600 livekit.yaml
echo ">> livekit.yaml escrito."

# ---------- 7. .env ----------
cat > .env <<EOF
LIVEKIT_API_KEY=$API_KEY
LIVEKIT_API_SECRET=$API_SECRET
PUBLIC_WSS_URL=wss://$DOMAIN
DISCORD_WEBHOOK_URL=$DISCORD_WEBHOOK
PUBLIC_URL=https://$DOMAIN
EOF

chmod 600 .env
echo ">> .env escrito."

# ---------- 8. Containers ----------
echo ">> Subindo containers..."
PROFILES=""
[ "$WITH_WEB" -eq 1 ] && PROFILES="$PROFILES --profile web"
[ -n "$DISCORD_WEBHOOK" ] && PROFILES="$PROFILES --profile discord"

$COMPOSE $PROFILES up -d --build
sleep 4
$COMPOSE $PROFILES ps

# ---------- 9. Caddy ----------
CADDYFILE="/etc/caddy/Caddyfile"
CADDY_BACKUP="/etc/caddy/Caddyfile.before-livekit-$(date +%Y%m%d-%H%M%S)"
LIVEKIT_MARKER_START="# BEGIN LIVEKIT MANAGED"
LIVEKIT_MARKER_END="# END LIVEKIT MANAGED"

if [ ! -f "$CADDYFILE" ]; then
  echo "Caddyfile nao encontrado em $CADDYFILE."
  exit 1
fi

cp "$CADDYFILE" "$CADDY_BACKUP"

# Remove qualquer bloco gerenciado por uma versao anterior do script.
sed -i '/^# BEGIN LIVEKIT .*$/,/^# END LIVEKIT .*$/d' "$CADDYFILE"

if grep -Fq "$DOMAIN {" "$CADDYFILE"; then
  cp "$CADDY_BACKUP" "$CADDYFILE"
  echo "O dominio $DOMAIN ja existe no Caddyfile fora do bloco gerenciado pelo projeto."
  echo "O arquivo anterior foi restaurado. Revise o bloco existente antes de tentar novamente."
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
        respond "LiveKit no ar. Use este dominio como wss:// no seu cliente." 200
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

echo ">> Caddy atualizado."
echo "   Backup: $CADDY_BACKUP"

# ---------- 10. Resumo ----------
echo ""
echo "======================================================"
echo " LiveKit no ar em: wss://$DOMAIN"
echo ""
echo " API Key:    $API_KEY"
echo " API Secret: $API_SECRET"
echo "======================================================"

if [ "$WITH_WEB" -eq 1 ]; then
  echo " Frontend: https://$DOMAIN"
else
  echo " Nenhum frontend foi habilitado neste deploy."
fi

[ -n "$DISCORD_WEBHOOK" ] && echo " Relay do Discord habilitado."

echo ""
echo " Confira fora do script:"
echo "  - As portas necessarias no firewall ou security group da hospedagem."
echo "  - O DNS de $DOMAIN apontando para o IP publico do servidor."
