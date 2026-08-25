# 05 — Troubleshooting

Erros mais comuns e como resolver.

---

## Vídeo não aparece (mas a chamada conecta)

**Causa mais provável:** portas UDP não abertas.

O sintoma clássico: a sala abre, as pessoas aparecem conectadas, mas nenhum vídeo ou áudio chega.

**Checklist:**
1. Faixa `50000-60000/UDP` liberada no Oracle Security List? (painel Oracle, não só no servidor)
2. Mesma faixa liberada no `iptables` do servidor?
3. `use_external_ip: true` está no `livekit.yaml`?

```bash
# Verificar regras iptables
sudo iptables -L INPUT -n | grep 50000

# Testar porta UDP de fora
nc -zvu SEU_IP 50000
```

---

## Erro "WebSocket connection failed"

**Causa:** o proxy não está encaminhando o WebSocket para `127.0.0.1:7880`.

No modo Caddy usado junto com o Foundry:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -n 100 --no-pager
```

O bloco do domínio do LiveKit deve conter o matcher `@livekit` criado pelo `deploy.sh`. Se você estiver usando uma instância dedicada com Nginx, verifique:

Verifique se o config do Nginx tem:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "Upgrade";
```

```bash
sudo nginx -t
sudo systemctl reload nginx
tail -f /var/log/nginx/livekit/error.log
```

---

## Certbot falha ao gerar certificado

No modo `--use-caddy`, Certbot não é utilizado. Confira se o domínio aponta para o IP da instância, se `80/TCP` e `443/TCP` estão liberadas e veja `sudo journalctl -u caddy -n 100 --no-pager`.

Em uma instalação dedicada com Nginx:

```bash
# Verificar se porta 80 está aberta
curl http://livekit.seudominio.com

# Rodar certbot com verbose
sudo certbot certonly --nginx -d livekit.seudominio.com -v
```

Se o DNS ainda não propagou, aguarde e tente novamente:

```bash
# Checar propagação DNS
dig livekit.seudominio.com
```

---

## LiveKit container não sobe

```bash
# Ver logs do container
sudo docker compose logs livekit

# Erro comum: porta já em uso
sudo ss -tlnp | grep 7880

# Reiniciar tudo
sudo docker compose down
sudo docker compose up -d
```

---

## TURN não funciona (amigos com NAT restritivo)

Amigos em redes corporativas ou com CGNAT podem precisar do TURN.

```bash
# Verificar se o TURN está respondendo
nc -zvu SEU_IP 3478

# Ver logs do LiveKit (TURN é integrado)
sudo docker compose logs livekit | grep turn
```

Se ainda não funcionar, cheque o `livekit.yaml`. No modo Caddy, a configuração esperada é:

```yaml
turn:
  enabled: true
  domain: seulivekit.duckdns.org
  udp_port: 3478
```

TURN/TLS na porta `5349/TCP` é uma opção do modo Nginx dedicado. Ele não é ativado no modo Caddy, que usa TURN/UDP e a faixa direta de mídia.

---

## "Too many symbolic links" no Nginx

Acontece se usar caminho relativo no `ln -s`:

```bash
# ERRADO
sudo ln -s ./sites-available/livekit.conf sites-enabled/

# CERTO (caminho absoluto)
sudo ln -s /etc/nginx/sites-available/livekit.conf \
           /etc/nginx/sites-enabled/livekit.conf
```

---

## LiveKit Meet não carrega (.env não encontrado)

```bash
cd ~/livekit-meet
ls -la .env.local   # deve existir

# Se não existir:
cp .env.example .env.local
nano .env.local
npm run build
sudo systemctl restart livekit-meet
```

---

## Checar status geral do setup

```bash
# LiveKit rodando? Rode dentro da pasta do projeto
cd ~/livekit-oracle
sudo docker compose ps

# Caddy rodando e configuração válida?
sudo systemctl status caddy
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# Meet rodando?
sudo systemctl status livekit-meet

# Portas abertas?
sudo ss -lntup | grep -E '7880|7881|3478|3000'

# LiveKit respondendo?
curl http://localhost:7880
```

---

## Logs úteis

```bash
# LiveKit
sudo docker compose logs -f livekit

# Caddy
sudo journalctl -u caddy -f

# Nginx, somente no modo dedicado
sudo tail -f /var/log/nginx/livekit/error.log

# Meet
sudo journalctl -u livekit-meet -f
```
