# Comece por aqui

Caminho pra deixar o LiveKit no ar no seu Oracle A1 com HTTPS e streamar tela com os amigos.

## Antes de rodar (uma vez, no painel/DNS)

1. **IP público:** mantenha o IP público atual da instância. Na OCI, o IP efêmero não muda em reboot nem em stop/start. Não desassocie o IP de uma instância que já hospeda outros serviços.

2. **DuckDNS:** crie uma conta em https://duckdns.org, escolha um nome (ex: `seunome`) e copie o seu **token**. Isso te dá `seunome.duckdns.org` de graça.

3. **Portas no painel do Oracle (Security List):** libere `80/TCP`, `443/TCP`, `443/UDP`, `3478/UDP`, `7881/TCP` e a faixa `50000-60000/UDP`. Não exponha `7880/TCP`: o proxy acessa essa porta apenas dentro do servidor. No modo Nginx com TURN/TLS, libere também `5349/TCP`. Detalhes em `docs/01-oracle-security.md`.

## O comando único

Manda essa pasta pro servidor e roda:

> Se o Foundry já usa Caddy nessa instância, pule o primeiro comando de deploy e use somente o bloco da seção seguinte, com `--use-caddy`.

```bash
scp -r livekit-oracle ubuntu@SEU_IP:~/
ssh ubuntu@SEU_IP
cd ~/livekit-oracle
chmod +x deploy.sh

sudo ./deploy.sh \
  --domain seunome.duckdns.org \
  --duckdns-token SEU_TOKEN_DUCKDNS \
  --email seu@email.com \
  --with-frontend
```

### Se o Foundry já usa Caddy na mesma instância

Use um segundo domínio DuckDNS apontando para o mesmo IP e acrescente `--use-caddy`:

```bash
sudo ./deploy.sh \
  --domain seulivekit.duckdns.org \
  --duckdns-token SEU_TOKEN_DUCKDNS \
  --with-frontend \
  --use-caddy
```

Nesse modo, o script:

- preserva o bloco existente do Foundry
- cria um backup do Caddyfile
- adiciona um bloco separado para o domínio do LiveKit
- valida o Caddyfile antes de recarregar o Caddy
- não instala nem inicia Nginx
- deixa o HTTPS sob responsabilidade do Caddy
- usa TURN/UDP em `3478`; TURN/TLS não é ativado para não disputar a porta `443` com o Caddy

O que ele faz sozinho:

- instala Docker
- atualiza o IP no DuckDNS
- gera a API Key e o Secret
- abre as portas no firewall do servidor
- gera o **certificado HTTPS** com Let's Encrypt no modo Nginx
- configura Nginx ou preserva o Caddy existente, conforme a flag escolhida
- sobe LiveKit + Redis
- com `--with-frontend`, sobe o **frontend próprio** em `https://seunome.duckdns.org`

No fim ele imprime a URL, a API Key e o Secret.

## O frontend próprio

Com `--with-frontend` você ganha uma página sua (pasta `frontend/`) já com:

- **Duas telas ao mesmo tempo:** clique em "Compartilhar tela" duas vezes e escolha dois monitores/janelas. Cada um vira um bloco no grid.
- **Perfil 1080p a 30 FPS:** a captura fica limitada a 1920x1080, com até 6 Mbps por transmissão. A tela vai marcada como "motion" para preservar fluidez em jogo e filme, e o áudio do sistema vai sem filtros de voz.
- **Voz no Discord:** o microfone vem **desligado** por padrão pra não dar eco com o Discord. O que vai é o áudio da tela compartilhada.
- **Janela flutuante (PiP):** botão "Flutuar" em cada bloco solta o vídeo numa janelinha sempre no topo, que você arrasta e redimensiona e continua vendo mesmo em outro app ou aba.
- **Tela cheia com rotação:** botão "Tela cheia" por bloco. No celular Android tenta deitar sozinho; no iPhone o vídeo gira quando você vira o aparelho.
- **Painel de conexão:** lista cada participante com a qualidade (Excelente, Boa, Ruim, Caiu) e põe borda vermelha no bloco de quem está travando. No celular vira um botão "Conexoes" que abre e fecha.
- **Volume por transmissão:** cada tela com áudio tem slider próprio e um botão de mudo rápido. Um clique silencia; outro restaura o volume anterior sem mover o slider.
- **Instalável (PWA):** no navegador aparece a opção de instalar; aí abre em janela própria, com ícone, sem barra de navegador.
- **Reconexão automática** e o nome fica lembrado pra não digitar toda vez.

A página usa o cliente oficial do LiveKit e um servidor de token pequeno (Node puro) que assina os acessos no servidor, sem expor o Secret pro navegador.

Assistir funciona em notebook, tablet e celular (inclusive iPhone). Transmitir a **tela** só de notebook/PC (o navegador de celular/tablet bloqueia screen share); câmera funciona em todos.

## Flags

| Flag | Pra que serve |
|---|---|
| `--domain` | obrigatória. Seu nome do DuckDNS. |
| `--duckdns-token` | atualiza o IP no DuckDNS automaticamente. |
| `--email` | avisos de expiração do certificado no modo Nginx. |
| `--with-frontend` | sobe o frontend próprio (2 telas + painel de conexão). Sem ela, use https://meet.livekit.io. |
| `--use-caddy` | usa o Caddy que já atende o Foundry e não instala Nginx. |
| `--discord-webhook URL` | liga os avisos no Discord (veja abaixo). |
| `--skip-ssl` | pula a geração do certificado no modo Nginx. Não é necessário com Caddy. |

## Sem o frontend próprio (mais leve)

Se não passar `--with-frontend`, o servidor sobe igual e você usa o Meet oficial hospedado:

1. abra https://meet.livekit.io
2. LiveKit URL: `wss://seunome.duckdns.org`
3. cole a API Key e o Secret que o script imprimiu

A página do meet.livekit.io é `https`, então o botão de compartilhar tela funciona. O único HTTPS que precisa ser seu é o do servidor, que o script já resolve.

## Avisos no Discord (opcional)

O Discord continua sendo o chat; só o screenshare que saiu. Dá pra fazer o Discord avisar quando alguém abre sala ou começa a transmitir.

1. No Discord: Configurações do canal > Integrações > Webhooks > Novo webhook. Copie a URL.
2. Rode o deploy com a flag:

   ```bash
   sudo ./deploy.sh --domain seunome.duckdns.org --duckdns-token TOKEN --with-frontend --use-caddy --discord-webhook "URL_DO_WEBHOOK"
   ```

O LiveKit dispara os eventos, um mini-relay (`discord-relay/`) traduz pro formato do Discord e posta no canal. Mensagens tipo "Fulano começou a transmitir, entra aí: link".

## Recursos do seu A1

Com 1 vCPU e 12 GB dá pra um grupo de amigos assistir/jogar junto. O gargalo costuma ser a banda de upload do seu link, não a CPU, porque o LiveKit é SFU (encaminha o vídeo, não recodifica).

## Sobre o TURN, Caddy e Nginx

O TURN embutido do LiveKit termina o TLS ele mesmo na 5349, usando o mesmo certificado. Não precisa de Nginx na frente do TURN. O `deploy.sh` já cuida disso. O `nginx/livekit-turn.conf` antigo (proxy HTTP pra 5349) não funciona pra TURN e não é usado neste fluxo.

No modo `--use-caddy`, o script mantém TURN/UDP em `3478` e o tráfego WebRTC direto na faixa `50000-60000/UDP`. Esse modo não ativa TURN/TLS, porque a porta `443/TCP` já pertence ao Caddy do Foundry.
