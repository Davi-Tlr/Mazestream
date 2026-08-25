# Guia completo, do zero até funcionar

Siga de cima pra baixo, na ordem. Cada etapa tem uma verificação no fim. Só passe pra próxima quando a verificação der certo. Onde aparecer `SEUNOME`, troque pelo nome que você escolher no DuckDNS. Onde aparecer `SEU_IP`, troque pelo IP público do servidor.

Tempo total: uns 30 a 40 minutos, a maior parte esperando DNS e instalação.

---

## Etapa 0. O que você precisa ter antes

- Uma instância no Oracle Cloud já criada: **Ubuntu 22.04**, formato **A1.Flex** (ARM), a do Always Free.
- O arquivo da chave SSH que o Oracle te deu quando criou a instância (algo tipo `ssh-key.key` ou `.pem`).
- O IP público atual da instância (aparece na página da instância no painel Oracle).

Se você ainda não criou a instância, crie primeiro no painel e volte aqui.

---

## Etapa 1. Confirmar o IP público atual (painel Oracle)

Não troque o IP de uma instância que já hospeda outros serviços. Na OCI, o IP público efêmero continua associado durante reboot e stop/start. Ele é perdido se você remover o IP público, desassociá-lo da VNIC ou encerrar a instância.

1. Entre em https://cloud.oracle.com
2. Menu > **Compute** > **Instances** > clique na instância do Foundry.
3. Copie o valor exibido em **Public IP address**.
4. Não edite **Public IP Type** e não escolha **No public IP**.

**Verificação:** anote o IP atual como `SEU_IP`. O domínio do Foundry e o novo domínio do LiveKit podem apontar para esse mesmo IP.

---

## Etapa 2. Criar o nome no DuckDNS

1. Abra https://duckdns.org e entre (login com Google, GitHub, etc).
2. No campo de cima, digite um nome exclusivo para o LiveKit (ex: `salaturma`) e clique em **add domain**.
   Isso cria `salaturma.duckdns.org`. Esse vira o seu `SEUNOME.duckdns.org`.
3. No topo da página, copie o **token** (uma sequência longa). Guarde, vamos usar já já.
4. Na linha do seu domínio, no campo **current ip**, coloque o `SEU_IP` da Etapa 1 e clique em **update ip**.

**Verificação:** no seu computador, rode `ping SEUNOME.duckdns.org`. Tem que responder com o `SEU_IP`. Se ainda não bater, espere alguns minutos e tente de novo (propagação de DNS).

---

## Etapa 3. Abrir as portas no painel Oracle (Security List)

Essa é a etapa que mais gente esquece. Sem ela, a chamada conecta mas o vídeo não passa.

1. Menu > **Networking** > **Virtual Cloud Networks**.
2. Clique na sua VCN.
3. Menu lateral > **Security Lists** > clique na **Default Security List**.
4. Clique em **Add Ingress Rules** e adicione as regras abaixo. Pode adicionar uma de cada vez. Em todas, **Source CIDR** é `0.0.0.0/0`.

| IP Protocol | Destination Port Range |
|---|---|
| TCP | 80 |
| TCP | 443 |
| TCP | 7881 |
| UDP | 443 |
| UDP | 3478 |
| UDP | 50000-60000 |

A faixa `50000-60000/UDP` é a mais importante. Confira que ela está lá.

Não exponha `7880/TCP`. O Caddy acessa essa porta somente dentro do servidor. `5349/TCP` só é necessário no modo Nginx com TURN/TLS; ele não é usado no modo Caddy deste guia.

**Verificação:** a lista de Ingress Rules mostra as seis regras acima. A regra de SSH em `22/TCP` normalmente já existe e deve ser mantida.

---

## Etapa 4. Conectar no servidor por SSH

No seu computador, abra o terminal na pasta onde está o arquivo da chave SSH e rode:

```bash
chmod 600 sua-chave.key
ssh -i sua-chave.key ubuntu@SEU_IP
```

Na primeira vez ele pergunta se confia no host, responda `yes`.

**Verificação:** o terminal muda pra algo como `ubuntu@nome-da-maquina:~$`. Você está dentro do servidor.

---

## Etapa 5. Enviar o projeto pro servidor

Abra **outro terminal** no seu computador (deixe o SSH aberto no primeiro), vá até a pasta onde está o `livekit-oracle` e rode:

```bash
scp -i sua-chave.key -r livekit-oracle ubuntu@SEU_IP:~/
```

**Verificação:** volte pro terminal do SSH e rode `ls`. Tem que aparecer a pasta `livekit-oracle`.

---

## Etapa 6. Rodar o deploy (o comando único)

Ainda no terminal do SSH, dentro do servidor:

```bash
cd ~/livekit-oracle
chmod +x deploy.sh

sudo ./deploy.sh \
  --domain SEUNOME.duckdns.org \
  --duckdns-token SEU_TOKEN_DUCKDNS \
  --with-frontend \
  --use-caddy
```

Troque `SEUNOME` e `SEU_TOKEN_DUCKDNS` pelos seus valores. Use o domínio novo do LiveKit, não o domínio do Foundry.

O script vai instalar o Docker, gerar as chaves, subir os serviços, buildar o frontend e acrescentar um bloco separado ao Caddyfile. Antes disso, ele cria uma cópia de segurança do Caddyfile, valida a configuração e só então recarrega o Caddy. O bloco do Foundry continua apontando para a porta `30000`. O HTTPS do novo domínio fica por conta do Caddy.

Na primeira vez o build do frontend leva alguns minutos. No fim o script imprime um quadro com a URL, a **API Key** e o **API Secret**.

**Anote a API Key e o Secret** que aparecerem. Se um dia quiser usar o meet.livekit.io como alternativa, vai precisar deles.

**Verificação:** rode `sudo docker compose ps`. Os serviços `livekit`, `redis` e `frontend` devem aparecer como ativos. Depois rode `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`.

Se o Caddy não conseguir emitir o certificado, confirme se o domínio já aponta para o IP da instância e se `80/TCP` e `443/TCP` estão liberadas. Veja os detalhes com `sudo journalctl -u caddy -n 100 --no-pager`.

---

## Etapa 7. Testar o screen share

1. No seu computador (não no servidor), abra no navegador: `https://SEUNOME.duckdns.org`
2. Tem que carregar a tela "Entrar na sala", com cadeado de HTTPS na barra.
3. Digite seu nome, deixe a sala como `geral` e clique em **Entrar**.
4. Clique em **Compartilhar tela**, escolha um monitor ou janela.
5. Pra testar as duas telas, clique em **Compartilhar tela** de novo e escolha um segundo monitor. Os dois aparecem lado a lado.

**Verificação:** você se vê compartilhando. Agora peça pra um amigo abrir o mesmo link `https://SEUNOME.duckdns.org`, entrar na sala `geral`, e confirme que ele vê a sua tela e que o painel de conexão no canto mostra os dois.

Se conectar mas o vídeo não aparecer pro amigo, o culpado quase sempre é a faixa `50000-60000/UDP` faltando na Etapa 3.

---

## Etapa 8. Avisos no Discord (opcional)

Se quiser o Discord avisando quando abre sala ou começa transmissão:

1. No Discord: **Configurações do canal** > **Integrações** > **Webhooks** > **Novo webhook** > copie a URL.
2. No terminal do SSH, rode o deploy de novo adicionando a flag:

```bash
cd ~/livekit-oracle
sudo ./deploy.sh \
  --domain SEUNOME.duckdns.org \
  --duckdns-token SEU_TOKEN_DUCKDNS \
  --with-frontend \
  --discord-webhook "COLE_A_URL_DO_WEBHOOK_AQUI" \
  --use-caddy
```

No modo Caddy não é preciso usar `--skip-ssl`, pois o próprio Caddy gerencia e renova o certificado.

**Verificação:** entre numa sala pelo navegador. Em segundos, cai uma mensagem no canal do Discord.

---

## Se precisar mexer depois

- **Ver logs do LiveKit:** `cd ~/livekit-oracle && sudo docker compose logs -f livekit`
- **Reiniciar tudo:** `cd ~/livekit-oracle && sudo docker compose up -d`
- **Parar tudo:** `cd ~/livekit-oracle && sudo docker compose down`
- **Problemas comuns e soluções:** veja `docs/05-troubleshooting.md`.

---

## Ordem resumida, pra bater o olho

1. Confirmar o IP atual da instância sem alterá-lo
2. Criar um domínio separado no DuckDNS e apontar pro mesmo IP
3. Abrir as 6 regras do LiveKit no Security List
4. SSH no servidor
5. `scp` da pasta
6. `sudo ./deploy.sh ... --with-frontend --use-caddy`
7. Abrir `https://SEUNOME.duckdns.org` e testar
8. (opcional) Discord
