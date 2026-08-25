# 04 — LiveKit Meet (Frontend)

LiveKit Meet é o frontend open source oficial do LiveKit. Funciona no browser sem instalar nada — seus amigos só precisam de um link.

---

## O que é o LiveKit Meet

- Video call + screen share no browser
- Interface limpa, sem criar conta
- Open source (MIT), pode customizar
- Repositório: https://github.com/livekit/meet

---

## Opção A — Usar o Meet hospedado pelo LiveKit (mais fácil)

O LiveKit disponibiliza uma instância em https://meet.livekit.io que pode ser apontada para o seu servidor próprio.

Basta acessar e configurar:
- **LiveKit URL:** `wss://livekit.seudominio.com`
- **API Key:** sua chave
- **API Secret:** seu secret

Isso funciona pra testar, mas não é ideal pra uso contínuo — você quer hospedar o frontend também.

---

## Opção B — Self-host do LiveKit Meet (recomendado)

### 1. Instalar Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y
node --version  # deve ser 20.x
```

### 2. Clonar o repositório

```bash
cd ~
git clone https://github.com/livekit/meet.git livekit-meet
cd livekit-meet
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
nano .env.local
```

Preencha:

```env
LIVEKIT_API_KEY=SUA_API_KEY
LIVEKIT_API_SECRET=SEU_API_SECRET
NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.seudominio.com
```

### 4. Build e start

```bash
npm install
npm run build
npm start -- -p 3000
```

### 5. Configurar Nginx para o Meet

Adicione em `/etc/nginx/sites-available/meet.seudominio.com.conf`:

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name meet.seudominio.com;

    ssl_certificate     /etc/letsencrypt/live/seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seudominio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Ativar:

```bash
sudo ln -s /etc/nginx/sites-available/meet.seudominio.com.conf \
           /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Rodar como serviço (systemd)

```bash
sudo nano /etc/systemd/system/livekit-meet.service
```

```ini
[Unit]
Description=LiveKit Meet Frontend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/livekit-meet
ExecStart=/usr/bin/npm start -- -p 3000
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable livekit-meet
sudo systemctl start livekit-meet
```

---

## Como usar com os amigos

1. Acesse `https://meet.seudominio.com`
2. Crie uma sala com qualquer nome
3. Manda o link para os amigos — eles entram no browser, sem instalar nada
4. Clique em "Share Screen" para compartilhar tela/jogo
5. Para compartilhar áudio do sistema junto com a tela: no seletor do browser, marque **"Compartilhar áudio do sistema"** (Chrome/Edge no Windows)

---

## Adicionar subdomínio DNS para o Meet

```
meet.seudominio.com  A  SEU_IP_PUBLICO
```

Gerar certificado:

```bash
sudo certbot certonly --nginx -d meet.seudominio.com
```
