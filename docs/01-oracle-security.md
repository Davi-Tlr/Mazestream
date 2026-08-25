# 01 — Portas no Oracle Security List

Esse é o passo mais crítico. Sem as portas UDP abertas **no painel do Oracle**, o vídeo não vai fluir — mesmo que o firewall do servidor esteja liberado.

---

## Portas necessárias

| Porta | Protocolo | Serviço |
|---|---|---|
| 22 | TCP | SSH |
| 80 | TCP | HTTP / emissão e renovação do HTTPS |
| 443 | TCP | HTTPS do Caddy ou Nginx |
| 443 | UDP | HTTP/3 do Caddy |
| 7881 | TCP | LiveKit RTC fallback TCP |
| 3478 | UDP | TURN UDP padrão |
| 50000–60000 | UDP | **Mídia WebRTC — obrigatório** |

Não exponha `7880/TCP` no painel. O Caddy ou Nginx acessa a API e o WebSocket do LiveKit por dentro do próprio servidor.

Se você usar o modo Nginx com TURN/TLS, adicione também `5349/TCP`. No modo `--use-caddy`, essa porta não é necessária.

> ⚠️ A faixa `50000-60000/UDP` é o erro mais comum. Sem ela a chamada conecta mas nenhum vídeo chega.

---

## Passo a passo no painel Oracle

1. Acesse [cloud.oracle.com](https://cloud.oracle.com)
2. Menu → **Networking** → **Virtual Cloud Networks**
3. Clique na sua VCN → **Security Lists**
4. Clique na Security List padrão → **Add Ingress Rules**

### Regras TCP

Adicione uma regra por vez (ou todas de uma vez em CIDR `0.0.0.0/0`):

```
Source CIDR:      0.0.0.0/0
IP Protocol:      TCP
Source Port:      All
Destination Port: 80
```

```
Source CIDR:      0.0.0.0/0
IP Protocol:      TCP
Destination Port: 443
```

```
Source CIDR:      0.0.0.0/0
IP Protocol:      TCP
Destination Port: 7881
```

### Regras UDP

```
Source CIDR:      0.0.0.0/0
IP Protocol:      UDP
Destination Port: 443
```

```
Source CIDR:      0.0.0.0/0
IP Protocol:      UDP
Destination Port: 3478
```

```
Source CIDR:      0.0.0.0/0
IP Protocol:      UDP
Destination Port: 50000-60000
```

---

## Firewall do servidor

O `deploy.sh` detecta se o UFW do Jarbas está ativo e adiciona as regras sem desativá-lo. Se não houver UFW ativo, ele usa `iptables`.

Para configurar manualmente uma instalação que usa UFW:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw allow 7881/tcp
sudo ufw allow 3478/udp
sudo ufw allow 50000:60000/udp
```

Para configurar manualmente uma instalação que usa `iptables`:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 7881 -j ACCEPT
sudo iptables -I INPUT -p udp --dport 443 -j ACCEPT
sudo iptables -I INPUT -p udp --dport 3478 -j ACCEPT
sudo iptables -I INPUT -p udp --dport 50000:60000 -j ACCEPT

# Salva as regras para sobreviver ao reboot
sudo apt install iptables-persistent -y
sudo netfilter-persistent save
```

---

## Verificar se as portas estão abertas

Depois de configurar, teste de fora do servidor:

```bash
# De outro terminal/máquina:
nc -zv SEU_IP 7881
nc -zvu SEU_IP 3478
```

Ou use [https://portchecker.co](https://portchecker.co) para UDP.
