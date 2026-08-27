<h1 align="center">Mazestream</h1>

<p align="center">
  <strong>Compartilhamento de tela e colaboração em tempo real.</strong>
</p>

<p align="center">
  Transmissões, apontamentos, reações e um quadro compartilhado em uma única sala.
</p>

<p align="center">
  <a href="frontend/package.json"><img src="https://img.shields.io/badge/React-18.3.1-149ECA?style=flat-square&amp;logo=react&amp;logoColor=white" alt="React 18.3.1"></a>
  <a href="frontend/package.json"><img src="https://img.shields.io/badge/LiveKit%20Client-2.22.0-7C3AED?style=flat-square" alt="LiveKit Client 2.22.0"></a>
  <a href=".nvmrc"><img src="https://img.shields.io/badge/Node.js-24%20LTS-339933?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 24 LTS"></a>
  <a href="docker-compose.yaml"><img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&amp;logo=docker&amp;logoColor=white" alt="Docker Compose"></a>
</p>

<p align="center">
  <a href="#principais-recursos">Recursos</a> ·
  <a href="#distribuições">Distribuições</a> ·
  <a href="#executando-localmente">Instalação</a> ·
  <a href="docs/DEPLOYMENT.md">Self-hosting</a> ·
  <a href="docs/CI-CD.md">Desenvolvimento e releases</a>
</p>

---

## Sobre o Mazestream

O **Mazestream** é uma aplicação web de compartilhamento de tela e colaboração em tempo real para pequenos grupos. Reúne transmissão de áudio e vídeo, anotações temporárias, quadro compartilhado e clipes gerados no navegador, com opções de execução local e hospedagem própria.

O projeto utiliza o **LiveKit** para a comunicação de áudio e vídeo. Chat, apontamentos e reações complementam a transmissão, permitindo que os participantes interajam com o conteúdo compartilhado.

---

## Principais recursos

<table>
  <tr>
    <td width="33%" align="center" valign="top">
      <p><strong>Transmissão</strong></p>
      <p>Tela, janela ou aba, com áudio e até duas telas simultâneas no palco.</p>
      <p><sub>Até 1080p · 30 fps · Perfis de qualidade</sub></p>
      <a href="#transmissão-de-tela">Ver transmissão →</a>
    </td>
    <td width="33%" align="center" valign="top">
      <p><strong>Interação</strong></p>
      <p>Apontamentos, reações e desenhos temporários sobre a transmissão.</p>
      <p><sub>Participação em tempo real</sub></p>
      <a href="#interações-sobre-a-transmissão">Ver interações →</a>
    </td>
    <td width="33%" align="center" valign="top">
      <p><strong>Quadro compartilhado</strong></p>
      <p>Um espaço para desenhar, apresentar ideias e colaborar durante a sessão.</p>
      <p><sub>Caneta · Formas · Desfazer e refazer</sub></p>
      <a href="#quadro-compartilhado">Ver ferramentas →</a>
    </td>
  </tr>
  <tr>
    <td width="33%" align="center" valign="top">
      <p><strong>Clipes</strong></p>
      <p>Salve trechos no próprio dispositivo, com buffer ativado sob demanda.</p>
      <p><sub>Processamento no navegador</sub></p>
      <a href="#clipes-no-dispositivo">Ver clipes →</a>
    </td>
    <td width="33%" align="center" valign="top">
      <p><strong>Controle de sala</strong></p>
      <p>Chat, arquivos temporários, PIN, permissões e votação para expulsão.</p>
      <p><sub>Livre · Jogo · RPG · Apresentação</sub></p>
      <a href="#comunicação-e-controle-de-sala">Ver controles →</a>
    </td>
    <td width="33%" align="center" valign="top">
      <p><strong>Discord</strong></p>
      <p>Eventos da sala, alertas de consumo e consulta de banda pelo Discord.</p>
      <p><sub>Integração opcional · Comando /banda</sub></p>
      <a href="#integração-com-discord">Ver integração →</a>
    </td>
  </tr>
</table>

### Transmissão de tela

Compartilhamento de tela, janela ou aba diretamente pelo navegador, com microfone e câmera opcionais.

- Visualização de até duas telas simultâneas no palco.
- Seleção da qualidade de envio e da qualidade recebida.
- Modo **Movimento**, voltado a jogos e vídeo.
- Modo **Detalhes**, voltado a texto, código e apresentações.
- Ajustes de volume e modos de visualização para acompanhar a transmissão.

Os perfis de envio chegam a **1080p a 30 fps**, com limites de bitrate distintos para execução local e hospedagem. A qualidade efetiva depende da captura, do navegador, do dispositivo e da conexão.

### Interações sobre a transmissão

Apontamentos, reações e desenhos permitem chamar a atenção para uma região da tela sem interromper o compartilhamento.

As anotações sobre o vídeo são **temporárias**. Elas aparecem como uma camada de interação no aplicativo e expiram após a exibição, mantendo a transmissão livre para os próximos apontamentos.

### Quadro compartilhado

Um espaço dedicado para explicar uma ideia, organizar uma sessão ou desenhar em conjunto, construído com **Konva** e **react-konva**.

- Caneta, marca-texto e borracha.
- Linhas, setas, retângulos e elipses.
- Seleção de cor e espessura.
- Ações de desfazer e refazer.

No quadro, os traços permanecem durante a sessão até serem removidos; eles não seguem a expiração das anotações sobre o vídeo. O quadro não é um armazenamento permanente de desenhos.

### Clipes no dispositivo

O buffer de clipes é ativado sob demanda para salvar trechos da transmissão no próprio dispositivo.

A gravação e a preparação do arquivo acontecem no navegador. Essa escolha evita adicionar um serviço de gravação contínua no servidor, mantendo o custo de processamento dos clipes no dispositivo que utiliza o recurso.

### Comunicação e controle de sala

Chat e compartilhamento temporário de arquivos acompanham a transmissão. A sala também oferece PIN de acesso, permissões de participação e votação para expulsão, sem banimento permanente.

Os modos **Livre**, **Jogo**, **RPG** e **Apresentação** adaptam a organização da sala ao contexto de uso.

### Integração com Discord

Um relay opcional conecta os eventos da sala e o monitoramento de banda ao Discord.

- Notificações por webhook.
- Alertas automáticos de consumo de banda.
- Consulta pelo comando `/banda`.

Os alertas funcionam com um webhook. O comando exige também a configuração de um Discord App, descrita no [guia de implantação](docs/DEPLOYMENT.md#discord-e-consumo-de-banda).

---

## Distribuições

O projeto mantém **uma única base de código**, distribuída em dois perfis. Correções e funcionalidades são compartilhadas; o que muda é a configuração e a forma de execução.

<table>
  <tr>
    <td width="50%" valign="top">
      <p><strong>Local</strong></p>
      <p><strong>Desenvolvimento e testes na própria máquina.</strong></p>
      <ul>
        <li>Aplicação pré-compilada com Node.js.</li>
        <li>LiveKit local e acesso por localhost.</li>
        <li>Envio de até 1080p30, limitado a 5 Mbps.</li>
      </ul>
      <p><a href="#executando-localmente"><strong>Começar localmente →</strong></a></p>
    </td>
    <td width="50%" valign="top">
      <p><strong>Self-hosted</strong></p>
      <p><strong>Salas na internet, na sua infraestrutura.</strong></p>
      <ul>
        <li>Aplicação pré-compilada em container.</li>
        <li>LiveKit, Redis e relay Discord opcional.</li>
        <li>Envio de até 1080p30, limitado a 4 Mbps.</li>
        <li>Domínio com HTTPS.</li>
      </ul>
      <p><a href="docs/DEPLOYMENT.md"><strong>Configurar self-hosting →</strong></a></p>
    </td>
  </tr>
</table>

O perfil local utiliza credenciais de desenvolvimento e acesso restrito à própria máquina. Ele não é um instalador desktop nem uma configuração para disponibilizar salas publicamente.

No pacote self-hosted, o frontend já está compilado. O servidor executa a aplicação sem precisar instalar dependências npm ou realizar o build do React. As orientações de instalação, atualização e rollback estão no [guia de self-hosting](docs/DEPLOYMENT.md).

---

## Tecnologias

| Camada | Tecnologias | Responsabilidade |
| --- | --- | --- |
| Interface | React, JavaScript, Ant Design e Framer Motion | Telas, controles e interações visuais |
| Desenho | Konva e react-konva | Renderização das ferramentas de desenho |
| Comunicação | LiveKit e WebRTC | Áudio, vídeo e mensagens em tempo real |
| Clipes | APIs de mídia do navegador e Mediabunny | Captura e preparação dos arquivos |
| Backend | Node.js | Tokens de acesso, controles de sala e arquivos temporários |
| Infraestrutura | Docker Compose e Redis | Execução dos serviços no ambiente hospedado |
| Build e validação | Vite, npm workspaces e GitHub Actions | Compilação, testes e empacotamento |

As versões utilizadas estão registradas nos [manifests do workspace](package.json), no [manifest da aplicação](frontend/package.json), no [lockfile](package-lock.json) e no [Docker Compose](docker-compose.yaml).

---

## Arquitetura

O repositório contém dois workspaces npm, com instalação e lockfile únicos:

- **`@mazestream/web`**: interface React e API Node.js, distribuídas na mesma aplicação.
- **`@mazestream/discord-relay`**: integração opcional com o Discord, executada separadamente.

```text
livekit-selfhost/
├── frontend/           Interface, API e ferramentas de mídia
├── discord-relay/      Eventos e monitoramento de banda
├── deploy/             Configuração do ambiente local
├── packaging/          Arquivos específicos de cada distribuição
├── scripts/            Validação, metadados e empacotamento
├── docs/               Guias de desenvolvimento e operação
├── .github/workflows/  CI e preparação de releases
└── package.json        Comandos do workspace
```

O **LiveKit atua como SFU**, encaminhando mídia aos participantes. Esta implantação não inclui transcodificação ou gravação centralizada. Desenhos e reações são tratados pela interface, enquanto os clipes são gerados no navegador.

Essa divisão mantém as ferramentas de interação e gravação no cliente. Ainda assim, a banda de saída do servidor cresce conforme as faixas e camadas recebidas pelos espectadores. Os [perfis de qualidade e recursos](PROFILES.md) documentam os limites configurados para o ambiente hospedado.

---

## Executando localmente

### Pré-requisitos

- **Node.js 24 LTS** e npm.
- **Docker com Compose v2** para executar o LiveKit local.
- Navegador com suporte a WebRTC e compartilhamento de tela.

### Instalação

Clone o repositório e instale as dependências na raiz:

```bash
git clone https://github.com/Davi-Tlr/livekit-selfhost.git
cd livekit-selfhost
npm ci
```

Inicie o LiveKit e a aplicação:

```bash
npm run local:up
npm run dev
```

Abra [localhost:5173](http://localhost:5173). Se a porta estiver ocupada, utilize a URL indicada pelo Vite.

Para encerrar, interrompa a aplicação com `Ctrl+C` e execute `npm run local:down`.

<details>
<summary><strong>Inspecionar somente a interface, sem Docker</strong></summary>

Após instalar as dependências, execute:

```bash
npm run dev:ui
```

Abra [localhost:5173/preview.html](http://localhost:5173/preview.html). Essa prévia usa dados simulados e serve para trabalhar na interface; não realiza uma transmissão LiveKit.

</details>

---

## Desenvolvimento e releases

Para verificar a estrutura, compilar e executar os testes dos dois perfis:

```bash
npm run verify
```

Para gerar as distribuições pré-compiladas:

```bash
npm run release:packages
```

Os pacotes são criados em uma nova pasta dentro de `artifacts/`, acompanhados de instruções de uso, checksums SHA-256 e identificação de versão, commit e perfil.

Os workflows de **GitHub Actions** estão preparados para validar o projeto em Windows e Linux e gerar os artefatos de distribuição. A publicação e a implantação permanecem manuais, sem acesso do CI ao servidor de produção.

O projeto está em desenvolvimento. Os testes cobrem lógica, contratos HTTP e empacotamento; a validação de áudio, vídeo e reconexão entre dispositivos faz parte da preparação de cada release.

## Compatibilidade e operação

Captura de tela e áudio dependem das permissões e do suporte de cada navegador e sistema operacional. Fora de localhost, a aplicação deve ser acessada por **HTTPS**.

Quadro, controles de sala e arquivos compartilhados são dados de sessão, não um serviço de armazenamento durável. Configuração de rede, limites do servidor e particularidades de Caddy/TURN estão detalhados no [guia de implantação](docs/DEPLOYMENT.md).

---

## Documentação

| Guia | Conteúdo |
| --- | --- |
| [Desenvolvimento](docs/DEVELOPMENT.md) | Ambiente local, comandos, estrutura e identificação dos builds |
| [Self-hosting](docs/DEPLOYMENT.md) | Instalação, configuração, Discord, atualização e rollback |
| [CI/CD e releases](docs/CI-CD.md) | Branches, validações automáticas e distribuição dos pacotes |
| [Perfis](PROFILES.md) | Qualidade de transmissão e limites de CPU, memória e banda |

## Licença

Uma licença de distribuição para o código do projeto ainda não foi definida. As dependências mantêm suas respectivas licenças; os pacotes incluem os avisos em `THIRD_PARTY_NOTICES.txt`.

---

<p align="center">
  <strong>Mazestream</strong><br>
  <sub>Transmissão e colaboração para pequenos grupos.</sub>
</p>
