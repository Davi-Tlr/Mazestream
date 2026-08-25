# Ajustes de streaming aplicados

Este pacote foi ajustado para LiveKit JS 2.22.0 com foco em screen share de jogos/movimento.

- envio padrão: 720p30, até 1.8 Mbps;
- 1080p30 continua disponível, agora limitado a 4 Mbps;
- 540p30: até 850 kbps;
- `degradationPreference: "maintain-framerate"` para privilegiar fluidez em congestionamento;
- simulcast mantido ligado e `dynacast` ligado para pausar camadas não consumidas;
- `adaptiveStream: true` fica responsável pela escolha automática de qualidade recebida conforme o elemento visível;
- o modo "Automática" não chama mais `setVideoQuality(HIGH)`;
- migração de localStorage evita que instalações antigas continuem presas no antigo padrão 1080p/6 Mbps;
- Dockerfile usa `npm ci` com o lockfile para build reproduzível.

Referências principais:
- https://docs.livekit.io/reference/client-sdk-js/interfaces/RoomOptions.html
- https://docs.livekit.io/reference/client-sdk-js/interfaces/TrackPublishOptions.html
- https://docs.livekit.io/reference/client-sdk-js/classes/RemoteTrackPublication.html
- https://docs.livekit.io/reference/client-sdk-js/variables/ScreenSharePresets.html
- https://docs.livekit.io/transport/self-hosting/deployment/
- https://docs.livekit.io/transport/self-hosting/ports-firewall/

Observação: erros HTTP 502 em `/rtc` são do caminho de sinalização/reverse proxy e não são corrigíveis apenas no frontend. Este pacote melhora a mídia e o comportamento de reconexão/estado, mas um 502 persistente ainda deve ser corrigido no Caddy/LiveKit.
