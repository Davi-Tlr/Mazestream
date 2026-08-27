# Ajustes de streaming aplicados

Configuracao atual validada com `livekit-client` 2.22.0 e LiveKit Server 1.13.6.

- envio hospedado: 1080p30, ate 4 Mbps; o perfil local conserva o teto de 5 Mbps;
- modo **Detalhes** usa VP8, `contentHint: detail`, prioridade de resolucao e
  simulcast espacial;
- modo **Movimento** prefere VP9 quando suportado e prioriza framerate;
- `adaptiveStream` e `dynacast` continuam ativos;
- compartilhar, conectar, pausar, retomar e encerrar possuem travas contra
  operacoes concorrentes e nao escondem mais falhas parciais;
- falha ao pausar encerra as faixas por seguranca, evitando audio invisivel;
- o buffer de clipes fica desligado por padrao e so usa um segundo encoder quando
  o usuario o ativa para uma tela;
- clipes com duas telas associam audio e video pelo nome da publicacao;
- volume foi normalizado para o intervalo suportado pelo SDK (`0..1`);
- microfone e camera refletem o estado real do `LocalParticipant`;
- o servidor cria salas com limite real de 10 pessoas por padrao;
- a imagem do LiveKit Server foi fixada em `v1.13.6` para deploy reproduzivel,
  com rollback para `v1.13.5` pela variavel `LIVEKIT_SERVER_IMAGE`;
- o perfil `host-a1` aplica limites de CPU/memoria por container sem criar um
  fork do frontend;
- assets estaticos sao precomprimidos no build e servidos com cache imutavel;
- a v1.13.6 contem a correcao da migracao por UDP instavel, mas essa opcao
  experimental permanece desligada no modo Caddy porque o fallback de RTT alto
  dependeria de TURN/TLS; o fallback TCP normal continua ativo.

O relay do Discord mede os bytes reais do SFU pelo endpoint Prometheus, usa as
faixas publicadas para o detalhamento por sala, envia alertas automaticos e oferece
`/banda` quando as credenciais do Discord App estao configuradas.

Referencias principais:

- https://docs.livekit.io/transport/media/advanced/
- https://docs.livekit.io/transport/media/subscribe/
- https://docs.livekit.io/transport/self-hosting/vm/
- https://github.com/livekit/client-sdk-js/blob/v2.22.0/src/room/participant/LocalParticipant.ts
- https://docs.discord.com/developers/interactions/overview
