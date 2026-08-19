# Rede e firewall

O LiveKit usa portas diferentes para sinalização, fallback RTC, TURN e mídia WebRTC.

O `deploy.sh` ajusta o firewall local, mas regras de firewall mantidas pela hospedagem precisam ser configuradas fora do script.

## Portas públicas

O projeto usa:

```text
80/TCP
443/TCP
7881/TCP
3478/UDP
50000-60000/UDP
```

O script também libera:

```text
443/UDP
```

## Portas internas

O LiveKit escuta em:

```text
7880/TCP
```

Essa porta é usada pelo Caddy através de `127.0.0.1:7880`.

Ela não precisa ser exposta diretamente pela regra externa da hospedagem.

O Redis usa:

```text
6379/TCP
```

No `docker-compose.yaml`, o Redis é iniciado com bind em `127.0.0.1` e protected mode habilitado.

Quando o frontend está ativo, o serviço é publicado em:

```text
127.0.0.1:3000
```

Quando o relay do Discord está ativo, o serviço é publicado em:

```text
127.0.0.1:8080
```

## UFW

Quando o UFW está instalado e ativo, o `deploy.sh` adiciona as regras com `ufw allow`.

Para conferir o estado:

```bash
sudo ufw status
```

## iptables

Quando não encontra UFW ativo, o script instala `iptables-persistent`, adiciona regras com `iptables` e executa:

```bash
sudo netfilter-persistent save
```

Para inspecionar as regras:

```bash
sudo iptables -L INPUT -n
```

## Verificar sockets

Para conferir portas TCP e UDP em uso:

```bash
sudo ss -lntup
```

Para procurar os serviços principais:

```bash
sudo ss -lntup | grep -E '6379|7880|7881|3478|3000|8080'
```

## Faixa de mídia

O `livekit.yaml` gerado pelo script configura:

```yaml
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
```

Quando a conexão de sala funciona, mas a mídia não chega, a faixa `50000-60000/UDP` deve ser uma das primeiras regras verificadas.
