> **Pra instalar do zero seguindo linha por linha, use [`GUIA-COMPLETO.md`](GUIA-COMPLETO.md).** É o passo a passo único, de cima pra baixo, com verificação em cada etapa. O resto deste README e a pasta `docs/` servem como referência e troubleshooting.

# 📡 LiveKit Self-Hosted — Oracle A1 Free Tier

Setup completo do LiveKit no Oracle Cloud Always Free (A1.Flex) com Caddy ou Nginx, TURN server e frontend próprio.

> **Objetivo:** substituir o screen sharing do Discord com infraestrutura própria, sem limite de qualidade, rodando junto ao FoundryVTT no mesmo servidor.

---

## 🗂️ Estrutura do Repositório

```
livekit-oracle/
├── README.md                   ← você está aqui
├── docker-compose.yaml         ← sobe LiveKit + Redis
├── livekit.yaml                ← config do servidor LiveKit
├── nginx/
│   ├── livekit.conf            ← proxy reverso para LiveKit API
│   └── livekit-turn.conf       ← referência antiga, não usada no fluxo Caddy
└── docs/
    ├── 01-oracle-security.md   ← portas a abrir no Oracle
    ├── 02-instalacao.md        ← passo a passo de instalação
    ├── 03-nginx.md             ← configuração Nginx
    ├── 04-livekit-meet.md      ← deploy do frontend
    └── 05-troubleshooting.md   ← erros comuns e soluções
```

---

## ⚡ Requisitos

| Item | Especificação |
|---|---|
| Servidor | Oracle A1.Flex (2 OCPUs, 12 GB RAM) |
| OS | Ubuntu 22.04 LTS |
| Proxy | Caddy existente do FoundryVTT ou Nginx em servidor dedicado |
| Docker | Instalar no setup |
| Domínio | Obrigatório, por exemplo `seulivekit.duckdns.org` |
| Domínios na mesma instância | um para o Foundry e outro para o LiveKit, ambos no mesmo IP |

---

## 🚀 Resumo do Setup

1. Siga primeiro o [`COMECE-AQUI.md`](COMECE-AQUI.md).
2. [Abra as portas no Oracle Security List](docs/01-oracle-security.md).
3. Em uma instância com Foundry e Caddy, rode o deploy com `--use-caddy`.
4. Consulte o [guia Nginx](docs/03-nginx.md) somente em servidor dedicado.
5. Use o [troubleshooting](docs/05-troubleshooting.md) se algo não subir.

---

## 🏗️ Arquitetura

```
Internet
   │
   ├─── 443/TCP  ──→ Caddy ──→ FoundryVTT (porta 30000)
   │                       └──→ LiveKit API/frontend (portas 7880/3000)
   ├─── 7881/TCP ────────────→ LiveKit RTC fallback
   ├─── 3478/UDP ────────────→ TURN/UDP
   │
   └─── 50000-60000/UDP ──→ LiveKit SFU (direto, sem proxy)
                              │
                            Redis (localhost:6379)
```

> **Por que UDP direto?** WebRTC precisa de portas UDP individualmente endereçáveis. O tráfego de mídia vai direto ao LiveKit. Caddy ou Nginx encaminha somente HTTPS e o WebSocket de sinalização.

---

## 📋 Variáveis de Ambiente

Antes de começar, defina suas variáveis (substitua em todos os arquivos de config):

| Variável | Exemplo | Descrição |
|---|---|---|
| `SEU_DOMINIO` | `exemplo.com` | Domínio principal |
| `LIVEKIT_HOST` | `livekit.exemplo.com` | Subdomínio do LiveKit |
| `API_KEY` | `gerado automaticamente` | Chave da API LiveKit |
| `API_SECRET` | `gerado automaticamente` | Secret da API LiveKit |

---

## 📦 Stack

- **LiveKit Server** — SFU WebRTC (Go binary via Docker)
- **Redis** — estado de sala para o LiveKit
- **TURN integrado ao LiveKit** — fallback de conectividade em `3478/UDP`
- **Caddy ou Nginx** — proxy reverso + TLS
- **Certbot** — certificados SSL no modo Nginx
- **Frontend próprio** — sala web responsiva

---

## 🔒 Segurança

- Nunca commite `livekit.yaml` com API Key/Secret reais → use `.env` ou secrets
- Redis fica em `localhost` apenas (sem exposição externa)
- Caddy gerencia e renova o certificado no modo usado com o Foundry

---

## 📖 Docs completas

Siga os documentos em ordem na pasta [`docs/`](docs/).
