# 02 — Instalação do LiveKit

> Este capítulo descreve a instalação manual com Nginx. Se o FoundryVTT já usa Caddy na mesma instância, não instale outro proxy. Use o fluxo `--use-caddy` descrito em `COMECE-AQUI.md`.

---

## 1. Instalar Docker

```bash
sudo apt update
sudo apt install docker.io docker-compose -y
sudo systemctl enable --now docker

# Adiciona seu usuário ao grupo docker (evita usar sudo toda hora)
sudo usermod -aG docker $USER
newgrp docker
```

---

## 2. Instalar Certbot

```bash
sudo apt install snapd -y
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### Gerar certificados SSL

Você precisa de certificados para `livekit.seudominio.com` e `livekit-turn.seudominio.com`.

Se Nginx já está rodando pra FoundryVTT com um wildcard cert, pode reaproveitar.
Senão, gere separado:

```bash
sudo certbot certonly --nginx \
  -d livekit.seudominio.com \
  -d livekit-turn.seudominio.com
```

> **Nota:** Substitua `seudominio.com` pelo seu domínio real em todos os comandos.

---

## 3. Configurar DNS

No seu provedor de DNS, adicione dois registros apontando para o IP público do Oracle:

```
livekit.seudominio.com      A   SEU_IP_PUBLICO
livekit-turn.seudominio.com A   SEU_IP_PUBLICO
```

Aguarde a propagação (geralmente minutos com Cloudflare, até 24h com outros).

---

## 4. Gerar configuração do LiveKit

O LiveKit tem um gerador oficial de config via Docker:

```bash
cd ~
sudo docker run --rm -it -v$PWD:/output livekit/generate
```

Responda as perguntas:
- **Primary domain name:** `livekit.seudominio.com`
- **TURN server domain name:** `livekit-turn.seudominio.com`
- **LiveKit version:** latest
- **Use bundled Redis?** No (vai rodar separado no docker-compose)
- **Startup type:** Shell Script

> ⚠️ **ANOTE a API Key e o API Secret** exibidos no terminal. Você vai precisar para o frontend. Eles também ficam salvos em `~/livekit.seudominio.com/livekit.yaml`.

---

## 5. Ajustar o docker-compose.yaml

Copie o arquivo deste repositório para o diretório gerado:

```bash
cp docker-compose.yaml ~/livekit.seudominio.com/docker-compose.yaml
```

Ou edite o gerado, **comentando o serviço `caddy`** (vamos usar Nginx):

```bash
cd ~/livekit.seudominio.com
nano docker-compose.yaml
```

O arquivo final deve ficar como em [`../docker-compose.yaml`](../docker-compose.yaml).

---

## 6. Subir os containers

```bash
cd ~/livekit.seudominio.com
docker-compose up -d

# Verificar se subiu:
docker-compose ps
docker-compose logs livekit
```

Saída esperada nos logs:
```
INFO livekit starting {"version": "x.x.x", "portHttp": 7880, ...}
```

---

## 7. Criar serviço systemd (para reiniciar no boot)

```bash
sudo nano /etc/systemd/system/livekit.service
```

```ini
[Unit]
Description=LiveKit Server
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/home/ubuntu/livekit.seudominio.com
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable livekit
sudo systemctl start livekit
```

---

## 8. Verificar funcionamento

```bash
# Checar se o LiveKit está respondendo na porta 7880
curl http://localhost:7880

# Deve retornar algo como:
# {"code":9,"message":"Not Acceptable","details":[]}
# Isso é normal — significa que o servidor está online
```
