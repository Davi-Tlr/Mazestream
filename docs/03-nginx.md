# 03 — Configuração Nginx

O Nginx vai fazer proxy reverso para o LiveKit API (sinalização WebSocket).
O tráfego de mídia UDP passa direto — Nginx não toca nele.

> Este capítulo é apenas para uma instância dedicada que já usa Nginx. Se o FoundryVTT já usa Caddy na mesma instância, não instale Nginx e não migre o Foundry. Use `sudo ./deploy.sh ... --use-caddy`, conforme o `COMECE-AQUI.md`.

---

## Estrutura de arquivos

```
/etc/nginx/sites-available/
├── foundry                        ← já existia (FoundryVTT)
├── livekit.seudominio.com.conf    ← novo
└── livekit-turn.seudominio.com.conf ← novo
```

---

## 1. Criar diretórios de log

```bash
sudo mkdir -p /var/log/nginx/livekit
sudo mkdir -p /var/log/nginx/livekit-turn
```

---

## 2. Config do LiveKit API

Copie o arquivo deste repositório:

```bash
sudo cp nginx/livekit.conf /etc/nginx/sites-available/livekit.seudominio.com.conf
```

Edite substituindo `seudominio.com`:

```bash
sudo nano /etc/nginx/sites-available/livekit.seudominio.com.conf
```

---

## 3. Config do TURN

```bash
sudo cp nginx/livekit-turn.conf /etc/nginx/sites-available/livekit-turn.seudominio.com.conf
sudo nano /etc/nginx/sites-available/livekit-turn.seudominio.com.conf
```

---

## 4. Ajuste no nginx.conf global

Adicione no bloco `http { }` do `/etc/nginx/nginx.conf`:

```bash
sudo nano /etc/nginx/nginx.conf
```

```nginx
http {
    # ... outras configurações existentes ...
    client_max_body_size 10m;
}
```

---

## 5. Ativar as configs

```bash
# Criar symlinks
sudo ln -s /etc/nginx/sites-available/livekit.seudominio.com.conf \
           /etc/nginx/sites-enabled/livekit.seudominio.com.conf

sudo ln -s /etc/nginx/sites-available/livekit-turn.seudominio.com.conf \
           /etc/nginx/sites-enabled/livekit-turn.seudominio.com.conf

# Testar sintaxe
sudo nginx -t

# Recarregar
sudo systemctl reload nginx
```

---

## 6. Verificar

```bash
# Deve retornar 200 ou redirect
curl -I https://livekit.seudominio.com

# Verificar logs
tail -f /var/log/nginx/livekit/access.log
```

---

## Nota sobre FoundryVTT

Se o FoundryVTT já usa Caddy, preserve essa instalação. Caddy pode servir o domínio do Foundry na porta interna `30000` e o domínio do LiveKit nas portas internas `3000` e `7880`, todos no mesmo IP público. A seleção é feita pelo nome do domínio recebido na conexão.

O modo `--use-caddy` cria um backup do Caddyfile, acrescenta somente o bloco do domínio do LiveKit, valida o arquivo e recarrega o serviço. Não use as instruções Nginx deste capítulo nesse cenário.
