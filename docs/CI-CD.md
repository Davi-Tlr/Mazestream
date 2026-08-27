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

Executa em pushes para branches, pull requests e acionamento manual. Valida em Linux e Windows com Node.js 24, gera os dois pacotes e, no Linux, valida Compose e constrói imagens da aplicação/relay. Os artefatos só são enviados pelo job que conclui com sucesso e expiram após sete dias.

### `release.yml`

Executa manualmente ou quando você publica uma tag `v*`. Refaz a validação, prepara os pacotes e os disponibiliza como artefatos do workflow por 30 dias. A tag deve coincidir com `version` no `package.json` (por exemplo, `v1.0.0` para `1.0.0`).

Ele não cria um GitHub Release público, não publica no npm/GHCR e não implanta. Publicar o release visível aos usuários continua sendo uma decisão manual após o teste real de transmissão.

O [checklist de release](RELEASE-CHECKLIST.md) separa os checks automáticos da validação em dispositivos reais. Pacotes locais com `dirty: true` são candidatos de trabalho; após aprovar e fazer o commit, gere novamente os artefatos para registrar o SHA exato da versão publicada.

## Começar a usar

1. Revise as alterações locais e faça seus próprios commits. Nenhum comando desta preparação publica alterações no GitHub.
2. Envie uma branch de trabalho. Os workflows passam a existir no GitHub somente depois desse push; a execução depende de Actions estar habilitado e das políticas do repositório.
3. Abra um PR e acompanhe a aba Actions. Para acionar manualmente pela interface, o workflow precisa estar presente na branch padrão.
4. Depois da primeira execução, configure uma regra para `main` exigindo os checks `verify (ubuntu-latest)` e `verify (windows-latest)`. Revise os nomes apresentados na interface antes de salvar a regra.
5. Faça o teste manual entre dois dispositivos. Só então integre, escolha a versão e prepare uma tag.

Para mudar a versão de todos os pacotes juntos, sem criar commit ou tag automaticamente:

```bash
npm version 1.0.1 --workspaces --include-workspace-root --no-git-tag-version
npm run verify
```

Revise os três manifests e o lockfile. Commit e tag devem ser feitos por você. Uma versão candidata pode usar sufixo como `1.0.1-rc.1`; isso não equivale a uma versão estável já validada.

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

- [Instalação determinística com npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
- [Uso seguro do GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [Artefatos de workflows](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow)
