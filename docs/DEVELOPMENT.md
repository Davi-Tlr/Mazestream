# Desenvolvimento

## Estrutura

```text
package.json / package-lock.json   comandos e dependências do workspace
frontend/                         @mazestream/web: React/Vite e API Node
discord-relay/                    @mazestream/discord-relay: integração opcional
scripts/                          verificações, metadados e empacotamento
packaging/                        arquivos exclusivos dos pacotes distribuídos
deploy/                           configuração local do LiveKit
docs/                             documentação operacional
.github/workflows/                CI e preparação de artefatos
```

As pastas existentes foram mantidas para reduzir movimentação de código. O backend de token/sala continua junto do frontend e ambos usam uma única imagem. O relay é um processo independente, sem dependências npm de runtime. Os perfis local e self-hosted não são forks: recebem as mesmas correções.

Um único `npm ci` na raiz instala os workspaces. Não crie lockfiles nas subpastas. Para adicionar uma dependência ao aplicativo, use `npm install <pacote> --workspace=@mazestream/web` e revise a alteração no lockfile.

## Comandos

| Comando na raiz | Finalidade |
| --- | --- |
| `npm run dev` | Vite e API de desenvolvimento |
| `npm run dev:ui` | Apenas Vite/perfil local; inclui a prévia simulada |
| `npm run dev:host` | Apenas Vite/perfil host; execute a API separadamente se precisar conectar |
| `npm run local:up` / `local:down` | Iniciar/parar o LiveKit de localhost |
| `npm run build:local` / `build:host` | Compilar o perfil em `frontend/dist` |
| `npm run check` | Estrutura, lockfile, sintaxe JavaScript e links da documentação |
| `npm test` | Testes dos pacotes e do empacotamento; requer build anterior |
| `npm run verify` | Verificar, compilar e testar ambos os perfis |
| `npm run release:local` / `release:selfhost` | Gerar somente uma distribuição, com validação |
| `npm run release:packages` | Gerar ambas, com validação |
| `npm run check:containers` | Validar Compose e construir imagens; requer Docker e pacote self-hosted gerado |

Os dois builds usam a mesma pasta `frontend/dist`: o último substitui o anterior. O empacotador copia cada build para uma pasta própria antes de compilar o próximo.

## Configuração local

O modo padrão usa LiveKit em `localhost:7880`, API em `127.0.0.1:3001` e Vite em `localhost:5173`. O Compose local é independente do Compose Linux de produção, publica portas apenas em loopback e usa as chaves públicas de desenvolvimento `devkey`/`devsecret`.

Para alterar a API de desenvolvimento, copie `frontend/.env.example` para `frontend/.env`. Os comandos da API carregam esse arquivo com o suporte nativo do Node.js. O arquivo não deve entrar no Git. `VITE_*` nunca pode conter segredos, pois entra no bundle do navegador.

O ambiente de localhost é para a própria máquina. Para testar dois dispositivos, use uma instalação de teste com HTTPS e conectividade WebRTC configurada. Mudar apenas `localhost` pelo IP do computador não constitui uma configuração completa.

## Limites dos testes

`npm test` cobre lógica e contratos HTTP, mas não opera o seletor nativo de compartilhamento, não mede perda de pacotes e não exercita NAT/TURN de verdade. O build valida sintaxe JSX e resolução de imports; `check` não é um lint completo de estilo ou uma auditoria de segurança.

Antes de um release, faça uma sessão entre dois dispositivos: entrar/sair, transmitir com áudio, parar e retomar, alternar a tela, testar clipe, desenho temporário/quadro, votação e reconexão. Registre versão, navegador e sistema de ambos os lados. Compare o vídeo recebido, não apenas a prévia de quem transmite.

## Identificar um build

Abra `/build-info.json` na instalação compilada. Ele informa `version`, `revision`, `profile`, `dirty` e `builtAt`; não inclui variáveis de ambiente ou segredos. `dirty: true` indica alterações locais fora do commit. `unknown`/`null` indicam que o Git não estava disponível durante o build.

Ao construir a imagem diretamente pelo código, é possível informar o SHA com `--build-arg MAZESTREAM_REVISION=<sha>`. O contexto Docker não inclui `.git`.

## Referências

A instalação única e os comandos por pacote seguem o modelo de [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/). O modo de teste do SFU segue as opções de [execução local do LiveKit](https://docs.livekit.io/transport/self-hosting/local/) e sua [configuração de referência](https://github.com/livekit/livekit/blob/v1.13.6/config-sample.yaml).
