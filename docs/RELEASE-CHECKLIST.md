# Validação da release 1.0.0

Estado: candidata em estabilização. Gerar um pacote ou passar no CI não aprova automaticamente a publicação como versão estável.

## Escopo desta rodada

- Atualização do LiveKit Client para 2.22.1 e do Vite para 7.3.6, com lockfile único. Node.js 24 LTS é o ambiente recomendado.
- Testes HTTP independentes de um build prévio, mantendo a verificação dos assets reais no empacotamento.
- Limites de frequência, quantidade, concorrência e reserva antecipada de memória para uploads; liberação em envios interrompidos.
- Retorno de qualidade Baixa/Média para Auto sem manter o teto da camada anterior. Auto continua sujeito à adaptação do LiveKit e à conexão.
- Envio confiável do traço final, limitado a 12 KiB. Apontadores continuam em transporte não confiável; desenhos na transmissão mantêm a expiração de 10 segundos.
- Histórico do quadro enviado por um participante, apenas a quem pediu, em lotes limitados. Entrada, reconexão, limpar e desfazer durante uma sincronização têm testes de regressão. O quadro mantém no máximo 400 ações e não é armazenamento durável.
- Buffer de clipes limitado a 48 MiB de pacotes codificados e 12 mil pacotes. A exportação pode ser cancelada e tem timeout de 30 segundos, sem baixar um arquivo de uma sessão já encerrada. Isso não limita toda a memória do navegador nem força o encerramento de um codec travado.

Não fazem parte desta rodada: redesign, novo catálogo de emojis, migração das chaves antigas de preferências, reestruturação completa de App/RoomView, otimização ampla do bundle ou alterações de TURN/TLS no modo Caddy. Esses itens permanecem no backlog.

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
- [ ] Transmissão: iniciar tela com áudio, confirmar ambos no receptor, parar pelo navegador, retomar e trocar a fonte. Repetir com as duas telas previstas pelo app.
- [ ] Qualidade: alternar Baixa → Auto e Média → Auto no receptor; redimensionar, entrar/sair de tela cheia e voltar de uma aba em segundo plano. Confirmar que vídeo e áudio retomam.
- [ ] Rede: interromper brevemente a conexão de um participante; verificar reconexão, ausência de faixas duplicadas e histórico do quadro. Conferir também saída definitiva e nova entrada.
- [ ] Clipes: habilitar sob demanda, esperar pelo menos 30 segundos, exportar e reproduzir o arquivo em outro player. Conferir imagem desde o início, duração e sincronismo do áudio. Repetir após trocar a fonte e sair durante uma exportação.
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
