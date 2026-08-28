# Branches, CI e releases

## Organização recomendada

Use uma `main` integrável, branches curtas de trabalho (`feat/...`, `fix/...`, `chore/...`) e tags para versões. Local e self-hosted são artefatos do mesmo commit, não branches permanentes. Assim uma correção de transmissão não precisa ser aplicada duas vezes.

Mantenha a snapshot como referência até conferir o histórico e o conteúdo integrado. Não exclua a branch do colaborador apenas por esta reorganização: primeiro confirme que os commits relevantes estão preservados. Esta mudança não cria, apaga ou renomeia branches.

## O que foi preparado

| Etapa | Onde roda | O que faz |
| --- | --- | --- |
| Desenvolvimento | Seu computador | Editar e executar `npm run verify` |
| CI | Runners hospedados pelo GitHub | Instalar pelo lockfile, verificar, compilar e testar os dois perfis |
| Empacotamento | Computador ou GitHub Actions | Gerar `.tar.gz`, checksums e identificação dos builds |
| Implantação | Manual, no servidor | Escolher o pacote aprovado, aplicar e conferir |

O primeiro estágio é integração contínua com entrega de artefatos. Ainda não é deploy contínuo. Nenhuma chave SSH, credencial LiveKit, webhook Discord ou acesso à Oracle é necessário no CI.

### `ci.yml`

Executa em pushes para branches, pull requests e acionamento manual. Antes de instalar dependências, confere a versão de todos os manifests e das entradas correspondentes do lockfile. Valida em Linux e Windows com Node.js 24, gera os dois pacotes e, no Linux, valida Compose e constrói imagens da aplicação/relay. Os artefatos só são enviados pelo job que conclui com sucesso e expiram após sete dias.

### `release.yml`

Executa manualmente ou quando você publica uma tag `v*`. Refaz a validação, prepara os pacotes e os disponibiliza como artefatos do workflow por 30 dias. A tag deve coincidir com `version` no `package.json` (por exemplo, `v1.2.1` para `1.2.1`). Essa conferência acontece antes de instalar dependências ou compilar. O empacotamento também rejeita um `build-info.json` de outra versão.

Ele não cria um GitHub Release público, não publica no npm/GHCR e não implanta. Publicar o release visível aos usuários continua sendo uma decisão manual após o teste real de transmissão.

O [checklist de release](RELEASE-CHECKLIST.md) separa os checks automáticos da validação em dispositivos reais. Pacotes locais com `dirty: true` são candidatos de trabalho; após aprovar e fazer o commit, gere novamente os artefatos para registrar o SHA exato da versão publicada.

## Começar a usar

1. Revise as alterações locais e faça seus próprios commits. Nenhum comando desta preparação publica alterações no GitHub.
2. Envie uma branch de trabalho. Os workflows passam a existir no GitHub somente depois desse push; a execução depende de Actions estar habilitado e das políticas do repositório.
3. Abra um PR e acompanhe a aba Actions. Para acionar manualmente pela interface, o workflow precisa estar presente na branch padrão.
4. Depois da primeira execução, configure uma regra para `main` exigindo os checks `verify (ubuntu-latest)` e `verify (windows-latest)`. Revise os nomes apresentados na interface antes de salvar a regra.
5. Faça o teste manual entre dois dispositivos. Só então integre, escolha a versão e prepare uma tag.

## Atualizar a versão

O `package.json` da raiz define a versão do produto. Os dois perfis são gerados com essa mesma versão, inclusive nomes dos arquivos, `release.json` e `build-info.json`. Não são versões independentes de local e self-hosted.

Escolha **um** comando de acordo com a mudança, usando [versionamento semântico](https://semver.org/lang/pt-BR/):

| Mudança | Comando | Exemplo partindo de `1.2.1` |
| --- | --- | --- |
| Correção compatível | `npm run version:patch` | `1.2.2` |
| Funcionalidade nova compatível | `npm run version:minor` | `1.3.0` |
| Mudança incompatível | `npm run version:major` | `2.0.0` |

Para escolher um número exato, inclusive uma candidata:

```bash
npm run version:set -- 1.3.0-rc.1
```

Esses comandos usam o `npm version` para atualizar os três manifests e o lockfile juntos, sem instalar dependências, acessar a rede, executar hooks de versão, criar commit/tag, enviar push ou publicar. Se o npm falhar ou deixar versões diferentes, os quatro arquivos são restaurados ao conteúdo anterior à tentativa. Versões já divergentes precisam ser revisadas antes do incremento; o comando não escolhe silenciosamente qual delas está correta.

Não é preciso aumentar a versão a cada commit ou push. Faça isso ao preparar uma nova entrega. Uma candidata `-rc.1` não equivale a uma versão estável validada; depois da aprovação, escolha a versão final com `version:set`. Como no npm, `version:patch` em `1.3.0-rc.1` promove para `1.3.0`, não para `1.3.1`.

Para conferir sem alterar arquivos e depois testar:

```bash
npm run check:versions
npm run verify
```

Revise os três manifests e o lockfile no diff. Commit, tag e push continuam sendo feitos por você, depois da validação. Não reutilize ou mova uma tag já publicada: correções de uma versão entregue devem receber outra versão. Os testes da automação rodam em diretórios temporários (`npm run test:versions`), sem alterar a versão do projeto.

## Segurança e limites

- As Actions usadas são fixadas por SHA completo. Atualize os pins deliberadamente, após revisar o release oficial.
- O token do workflow recebe apenas `contents: read`; o checkout não persiste credenciais.
- Não há `pull_request_target`, comandos construídos com títulos de PR, segredos de produção, publicação automática ou runner instalado no A1.
- O empacotamento usa uma lista explícita de arquivos e rejeita arquivos privados, código de desenvolvimento e builds de perfil errado.
- `npm ci` reproduz o lockfile; não executamos `npm audit fix` automaticamente. Audite dependências periodicamente e trate atualizações como mudanças revisáveis.
- O pipeline não valida navegadores reais, conectividade NAT/TURN, carga do servidor ou qualidade subjetiva de transmissão. Um check verde não prova ausência de bugs.
- Windows/Linux testam o código e a montagem dos pacotes. O build Docker padrão do runner Linux não substitui uma validação operacional em ARM64.

Quando os testes reais estiverem confiáveis, a próxima etapa pode ser publicação de imagens ARM64/AMD64 e um ambiente de staging. O deploy para produção deve continuar exigindo aprovação e um caminho de rollback.

## Referências oficiais

- [Versionamento de workspaces com npm](https://docs.npmjs.com/cli/v11/commands/npm-version/)
- [Versionamento Semântico](https://semver.org/lang/pt-BR/)
- [Instalação determinística com npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
- [Uso seguro do GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [Artefatos de workflows](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow)
