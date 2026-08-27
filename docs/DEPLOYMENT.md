# Self-hosting, atualização e rollback

## Antes de começar

O Compose de produção usa rede do host para LiveKit/Redis e foi preparado para Linux. Use Docker com Compose v2, domínio, DNS e HTTPS configurados. O pacote local, suas chaves de desenvolvimento e suas portas de loopback não servem como implantação pública.

O perfil A1 é um ponto de partida para uma VM compartilhada, não uma capacidade certificada. Seus tetos estão em `docker-compose.host-a1.yaml`; `host-a1.env.example` lista ajustes opcionais. Nenhum teste de carga deve ser feito no servidor que já atende os outros projetos sem planejamento.

## Pacote self-hosted

Gere `npm run release:selfhost` em uma máquina de desenvolvimento ou use o artefato de um workflow aprovado. Extraia `mazestream-selfhost-<versão>.tar.gz`. O pacote contém a API, o frontend já compilado, o relay, os arquivos Compose, exemplos de configuração e instruções de implantação.

A imagem da aplicação usa Node.js 24 Alpine e não executa `npm ci` nem Vite: ela apenas copia os arquivos prontos. A imagem é construída nativamente na arquitetura do servidor, incluindo ARM64 do A1. Não é necessário transferir `node_modules` do Windows para o Linux.

Confira o SHA-256 do arquivo baixado contra o `SHA256SUMS` da mesma execução. Cada pacote também inclui checksums dos arquivos extraídos e `release.json`. Checksums detectam diferenças; não substituem a confiança na origem do download.

## Instalação nova

O script `deploy.sh` existente instala pacotes do sistema e configura firewall/proxy/certificados. Leia-o antes de executar; ele não é um comando inofensivo de atualização. Ele precisa de permissões administrativas e pode afetar outros serviços do host.

Para uma instalação que já utiliza Caddy, após conferir domínio, portas e backups:

```bash
sudo bash ./deploy.sh --domain live.seudominio.com --with-frontend --use-caddy
```

Sem `--use-caddy`, o script usa o caminho Nginx/Certbot. Não execute os dois modos para o mesmo domínio sem revisar a configuração. A política existente de não usar TURN/TLS no modo Caddy foi preservada; isso limita conectividade em algumas redes.

As chaves são geradas no servidor. `.env` e `livekit.yaml` não acompanham o pacote, não devem ser publicados e precisam ser preservados nas atualizações.

## Atualizar uma instalação existente

1. Guarde uma cópia recuperável do diretório atual, de `.env`, `livekit.yaml` e da configuração do proxy. Não publique esse backup: contém credenciais.
2. Confira o perfil em `release.json`; deve ser `host-a1` / distribuição `selfhost`.
3. Transfira o conteúdo do pacote completo para o diretório da instalação, preservando os arquivos de configuração e o nome do projeto Compose existente. Não copie somente `frontend/`: o contexto de build agora é a raiz.
4. Valide a configuração com `docker compose -f docker-compose.yaml -f docker-compose.host-a1.yaml --profile web config --quiet`.
5. Atualize apenas a aplicação, se essa for a mudança desejada:

```bash
sudo docker compose -f docker-compose.yaml -f docker-compose.host-a1.yaml \
  --profile web up -d --build --no-deps frontend
```

Se o relay também mudou, faça a atualização dele separadamente com o perfil `discord`. Não reinicie o SFU sem necessidade durante uma sala ativa. Recriar a API perde seu estado temporário em memória; programe a atualização para fora de uma sessão importante.

Após atualizar, confira `/build-info.json`, a entrada na sala e a recepção de áudio/vídeo em outro dispositivo. Recarregue o navegador se ainda estiver com assets antigos. O SHA publicado e o perfil precisam corresponder ao pacote escolhido.

Nesta atualização, todos os participantes devem recarregar a página e entrar novamente na sala: o histórico do quadro usa um protocolo novo com resposta direcionada e identificação da solicitação. A recuperação de histórico entre clientes antigos e novos não é garantida. Programe a atualização com a sala vazia; não há migração ou armazenamento durável do quadro.

## Arquivos temporários e limites

O upload exige sessão. Por padrão, cada arquivo pode ter até 8 MiB, com 32 MiB para dados armazenados e reservas de uploads em andamento, até 128 arquivos, duas transferências simultâneas no servidor e uma por sessão. São aceitos até seis inícios de upload por minuto por sessão. Interromper um envio libera sua reserva; tentativas aceitas continuam contando na janela de frequência.

Os limites são configuráveis pelas variáveis `SHARE_*` em `host-a1.env.example` e repassados pelo Compose. Arquivos expiram em 60 minutos por padrão e são perdidos ao reiniciar a API. O limite de dados não é um teto do RSS do processo: existem cópias transitórias, metadados e o custo do runtime.

O download funciona por posse do link, sem autenticar novamente a sessão. Não envie segredos ou documentos confidenciais; quem receber o link poderá acessar o arquivo enquanto ele estiver disponível.

## Rollback

Restaure os arquivos do pacote anterior e aplique novamente o mesmo comando Compose, mantendo as credenciais compatíveis. Preserve também a identificação das imagens usadas: tags de runtime podem receber atualizações de patch.

A variável `LIVEKIT_SERVER_IMAGE` controla o SFU independentemente da versão do frontend. Não troque a imagem do LiveKit automaticamente como tentativa de resolver qualquer erro de interface. Planeje mudanças no SFU e rollback fora de salas ativas.

## Discord e consumo de banda

O relay é opcional. `DISCORD_WEBHOOK_URL` permite alertas; `/banda` também requer `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` e, opcionalmente, `DISCORD_GUILD_ID`. O endpoint de interações é `/discord/interactions` e precisa estar acessível via HTTPS.

O monitor consulta os contadores do LiveKit em `LIVEKIT_METRICS_URL`. A divisão por sala é estimada; o acumulado do relay reinicia com seu processo e não equivale à fatura total da Oracle. Mantenha também o monitoramento da instância. Não exponha Redis, a API administrativa ou a porta de métricas diretamente na internet.

## Referência

Consulte os requisitos de rede e implantação na [documentação oficial de self-hosting do LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/). Esta preparação não instalou um runner de CI, agente de deploy ou serviço adicional no servidor.
