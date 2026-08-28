# Checklist de validação de releases

Estado: candidata em estabilização. Gerar um pacote ou passar no CI não aprova automaticamente a publicação como versão estável.

Confira a versão atual com `npm run check:versions`. Ao preparar uma nova entrega, use os [comandos de versionamento](CI-CD.md#atualizar-a-versão), sem editar números de versão manualmente.

## Escopo da estabilização inicial (histórico da 1.0.0)

- Atualização do LiveKit Client para 2.22.1 e do Vite para 7.3.6, com lockfile único. Node.js 24 LTS é o ambiente recomendado.
- Testes HTTP independentes de um build prévio, mantendo a verificação dos assets reais no empacotamento.
- Limites de frequência, quantidade, concorrência e reserva antecipada de memória para uploads; liberação em envios interrompidos.
- Retorno de qualidade Baixa/Média para Auto sem manter o teto da camada anterior. Auto continua sujeito à adaptação do LiveKit e à conexão.
- Envio confiável do traço final e do ping de área, limitado a 12 KiB. Cursores contínuos permanecem em transporte não confiável; desenhos na transmissão mantêm a expiração de 10 segundos.
- Histórico do quadro enviado por um participante, apenas a quem pediu, em lotes limitados. Entrada, reconexão, limpar e desfazer durante uma sincronização têm testes de regressão. O quadro mantém no máximo 400 ações e não é armazenamento durável.
- Buffer de clipes limitado a 48 MiB de pacotes codificados e 12 mil pacotes. A exportação pode ser cancelada e tem timeout de 30 segundos, sem baixar um arquivo de uma sessão já encerrada. Isso não limita toda a memória do navegador nem força o encerramento de um codec travado.
- Login ajustado para janelas baixas, controles ocultados por inatividade também fora da tela cheia e duração da transmissão selecionada no cabeçalho. Menus abertos, arrastes e foco por teclado suspendem o auto-hide.
- Ping básico por clique do meio, clique/toque prolongado de 650 ms ou ferramenta de clique simples. Círculo discreto de até 40 px, sem texto, som, alerta ou deslocamento da visão; duração de 1,8 segundo. Movimento, multitoque e modificadores cancelam o gesto. Há um intervalo mínimo de um segundo por pessoa, substituição do ping anterior e no máximo quatro pings simultâneos.
- Cursor compartilhado sem a cruz ou duplicata do mouse local. A saída da área, perda de foco, troca de ferramenta e desmontagem enviam uma remoção confiável. Sequências impedem que um pacote antigo ressuscite ou apague o cursor após reentrada; a expiração de 1,4 segundo permanece como proteção. Movimentos são coalescidos a até 25 Hz durante a mesma passagem, com uma única posição pendente sob pressão; somente a camada dos cursores renderiza as posições recebidas, com interpolação curta.
- Preferência local para ocultar pings e cursores sem desativar desenhos e reações. Identidade e geometria vêm da sessão e da área real do vídeo, não das barras pretas.

Não fazem parte desta rodada: redesign, novo catálogo de emojis, migração das chaves antigas de preferências, reestruturação completa de App/RoomView, otimização ampla do bundle ou alterações de TURN/TLS no modo Caddy. Esses itens permanecem no backlog.

## Pendência: clipes habilitados por muito tempo

Auditoria local em 27/08/2026, com Mediabunny 1.52.1:

- O gravador recodifica vídeo e áudio no navegador enquanto está habilitado; não há transcodificação de clipes no servidor. O custo depende de resolução, movimento, codec e aceleração disponível. O limite de pacotes não é um limite de CPU/GPU.
- `MediaStreamVideoTrackSource`, com `frameRate` explícito, usa internamente um agendador de 4 ms e limita a fila do encoder. Fila limitada não elimina o trabalho contínuo.
- O `Output` WebM usado durante a captura mantém entradas de índice (`cues`) por cluster, mesmo com `appendOnly` e `NullTarget`. Elas ficam fora do limite do buffer do app. Um diagnóstico sintético de mux, sem codificação ou espera em tempo real, encontrou 60, 600 e 3.600 entradas após representar 60, 600 e 3.600 segundos, respectivamente. Isso confirma crescimento do índice, não mede uso de RAM ou CPU de uma sessão real.
- A correção dos metadados de áudio tem testes de regressão com o muxer real; eles não comprovam decodificação, sincronismo de um arquivo reproduzido ou estabilidade após horas.

O uso contínuo dos clipes ainda não está aprovado. Antes de anunciá-lo como estável, remover ou limitar o índice acumulado sem perder a janela de áudio/vídeo; comparar CPU/GPU, memória e fluidez com clipes desligados e ligados em uma sessão real prolongada. Não usar estruturas privadas da biblioteca como solução de produção. Até essa validação, habilitar os clipes somente quando necessários.

## Verificações automáticas

Na raiz, usando Node.js 24:

```bash
npm ci
npm test
npm audit
npm run release:packages
```

O empacotador verifica estrutura, lockfile e sintaxe; compila e testa os dois perfis; inicia cada pacote para checar HTML, JavaScript, metadados e 404; gera arquivos e checksums. `npm test` pode ser executado antes de qualquer build.

Em um ambiente com Docker, execute também `npm run check:containers`. O CI faz essa etapa em Linux; ainda é necessário validar a execução nativa no ARM64 do servidor. Não execute testes de carga na VM que atende outros projetos.

## Aprovação em dispositivos reais

Registre SHA, perfil, data, navegador/sistema de quem transmite e de quem recebe. Use o pacote completo; a página `preview.html` não transmite pelo LiveKit. Para dois dispositivos, use uma instalação de teste com HTTPS, sem expor o pacote de localhost.

- [ ] Login: criar/entrar com PIN, rejeitar PIN errado, sair e entrar novamente; negar permissão de microfone/câmera sem travar a tela.
- [ ] Interface: conferir janelas baixas, zoom e teclado virtual; aguardar o auto-hide com mouse parado e fora do vídeo, usar H, teclado, menus e volume em tela cheia. O preview local foi conferido em 1920×1080, 1366×600, 390×844 e 320×568; falta o teste em celular real.
- [ ] Ping: confirmar no segundo participante o clique do meio e o clique/toque prolongado; arrastar, rolar ou usar dois dedos não deve enviar um ping. O ping deve desaparecer após cerca de 1,8 segundo; não alterar desenhos persistentes do quadro. Testar também a preferência para ocultar apontadores.
- [ ] Cursor: compartilhar, sair e voltar rapidamente à mesma área, trocar de transmissão/quadro, desativar a ferramenta, trocar de aba e desconectar. Verificar no receptor que não sobra um cursor congelado e que só há um cursor por pessoa. Pacotes fora de ordem, última amostra, expiração, limites e cancelamento têm testes automatizados; o preview entre abas usa um canal local, não uma sessão LiveKit.
- [ ] Transmissão: iniciar tela com áudio, confirmar ambos no receptor, parar pelo navegador, retomar e trocar a fonte. Repetir com as duas telas previstas pelo app.
- [ ] Qualidade: alternar Baixa → Auto e Média → Auto no receptor; redimensionar, entrar/sair de tela cheia e voltar de uma aba em segundo plano. Confirmar que vídeo e áudio retomam.
- [ ] Rede: interromper brevemente a conexão de um participante; verificar reconexão, ausência de faixas duplicadas e histórico do quadro. Conferir também saída definitiva e nova entrada.
- [ ] Clipes: habilitar sob demanda, esperar pelo menos 30 segundos, exportar e reproduzir o arquivo em outro player. Conferir imagem desde o início, duração e sincronismo do áudio. Repetir após trocar a fonte e sair durante uma exportação.
- [ ] Clipes contínuos: resolver o crescimento do índice descrito acima e comparar uma sessão de pelo menos uma hora com clipes desligados/ligados. Registrar navegador, codec, resolução, CPU/GPU, memória e quedas de frames; não considerar o teste sintético uma aprovação.
- [ ] Desenho: confirmar traços no receptor e sua remoção após 10 segundos; no quadro, entrar como segundo/terceiro participante, desfazer, refazer, limpar durante a sincronização e confirmar que desenhos apagados não reaparecem.
- [ ] Sala: testar chat, arquivo temporário, permissões e votação de expulsão com o número de participantes exigido. Verificar erro legível ao ultrapassar limites de upload.
- [ ] Discord, se configurado: conferir webhook, `/banda` e valores do monitor. Não gerar tráfego excessivo para forçar um alerta.
- [ ] Operação: fazer uma sessão de 20–30 minutos, observar CPU, memória, banda e logs, junto dos demais serviços. Confirmar que existe uma cópia recuperável do deploy anterior.

As caixas ficam em aberto até serem realmente verificadas. Testes simulados de transporte e mux não comprovam qualidade de mídia, compatibilidade de codec ou ausência de travamentos no navegador.

## Publicação e atualização

Após a aprovação, revise o diff, faça o commit e gere os pacotes novamente. `release.json` e `/build-info.json` devem identificar o SHA final e `dirty: false`; não publique um pacote identificado apenas pelo commit anterior às correções.

Só então integre a versão aprovada à `main`, execute o pipeline no commit final e escolha a tag. Todos os clientes devem recarregar a página após a atualização do protocolo do quadro. Consulte [implantação e rollback](DEPLOYMENT.md) e [CI/CD](CI-CD.md). Não há commit, push, tag, publicação ou deploy automático neste procedimento local.

## Referências

- [LiveKit Client 2.22.1](https://github.com/livekit/client-sdk-js/releases/tag/v2.22.1).
- [Qualidade de uma publicação remota](https://docs.livekit.io/reference/client-sdk-js/classes/RemoteTrackPublication.html).
- [Limites e modos de entrega dos pacotes de dados](https://docs.livekit.io/transport/data/packets/).
- [Política de manutenção do Vite](https://vite.dev/releases).
- [Fontes de mídia e codificação em tempo real do Mediabunny](https://mediabunny.dev/guide/media-sources).
- [Controles apresentados por hover ou foco — W3C](https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus).
- [Ping básico do Foundry VTT](https://foundryvtt.com/article/pings/). Apenas a indicação visual simples foi usada como referência; sem warning ping ou drag ping.
