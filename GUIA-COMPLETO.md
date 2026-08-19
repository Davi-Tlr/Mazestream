# Guia completo

Este guia descreve o deploy usando o fluxo com Caddy implementado pelo `deploy.sh`.

Os exemplos usam `livekit.exemplo.com`. Substitua esse valor pelo domínio configurado para o servidor.

## 1. Preparar o domínio

O domínio informado em `--domain` precisa resolver para o IP público do servidor.

Exemplo:

```text
livekit.exemplo.com
```

O `deploy.sh` exige um domínio válido e encerra a execução quando o valor está vazio ou não passa pela validação interna.

DuckDNS pode ser usado, mas não é obrigatório.

## 2. Preparar o Caddy

O modo documentado usa a flag `--use-caddy`.

Antes do deploy, confirme que o Caddy está instalado:

```bash
caddy version
```

Confirme também que o serviço está ativo:

```bash
sudo systemctl status caddy
```

O script interrompe a execução quando `--use-caddy` é informado e o Caddy não está instalado ou não está ativo.

## 3. Liberar as portas

As regras externas da hospedagem precisam permitir o tráfego usado pelo LiveKit.

Libere:

```text
80/TCP
443/TCP
7881/TCP
3478/UDP
50000-60000/UDP
```

O `deploy.sh` também abre `443/UDP` no firewall local.

Não é necessário expor `7880/TCP` diretamente. O Caddy encaminha as requisições necessárias para `127.0.0.1:7880`.

Consulte [docs/01-rede-e-firewall.md](docs/01-rede-e-firewall.md).

## 4. Colocar o projeto no servidor

Entre no diretório do projeto no servidor.

Exemplo:

```bash
cd /caminho/do/projeto
```

Dê permissão de execução ao script:

```bash
chmod +x deploy.sh
```

## 5. Executar o deploy

Com frontend:

```bash
sudo ./deploy.sh \
  --domain livekit.exemplo.com \
  --with-frontend \
  --use-caddy
```

Sem frontend:

```bash
sudo ./deploy.sh \
  --domain livekit.exemplo.com \
  --use-caddy
```

## 6. Usar DuckDNS, se necessário

Quando o domínio estiver no DuckDNS:

```bash
sudo ./deploy.sh \
  --domain exemplo.duckdns.org \
  --duckdns-token TOKEN \
  --with-frontend \
  --use-caddy
```

O token é usado somente para a atualização de IP feita pelo script.

## 7. Acompanhar a execução

Na primeira execução, o script verifica se as portas internas necessárias já estão ocupadas.

No fluxo básico, ele verifica:

```text
6379/TCP
7880/TCP
7881/TCP
3478/UDP
```

Quando `--with-frontend` é usado, também verifica:

```text
3000/TCP
```

Quando `--discord-webhook` é usado, também verifica:

```text
8080/TCP
```

Depois das verificações, o script instala as dependências, gera os arquivos de configuração e inicia os containers.

## 8. Verificar os containers

Dentro do diretório do projeto:

```bash
sudo docker compose ps
```

Se o sistema estiver usando o comando legado instalado pelo script:

```bash
sudo docker-compose ps
```

O deploy detecta qual forma de Docker Compose está disponível.

## 9. Verificar o Caddy

Valide o Caddyfile:

```bash
sudo caddy validate \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile
```

Confira o serviço:

```bash
sudo systemctl status caddy
```

Confira os logs:

```bash
sudo journalctl -u caddy -n 100 --no-pager
```

## 10. Abrir o endereço

Com o frontend habilitado, acesse:

```text
https://livekit.exemplo.com
```

O Caddy encaminha a raiz do domínio para o serviço local na porta `3000`.

Sem `--with-frontend`, o bloco criado pelo script responde uma mensagem simples de status na raiz do domínio.

## 11. Ativar o relay do Discord, se necessário

Execute novamente o deploy incluindo a URL do webhook:

```bash
sudo ./deploy.sh \
  --domain livekit.exemplo.com \
  --with-frontend \
  --use-caddy \
  --discord-webhook "URL_DO_WEBHOOK"
```

O script inclui o profile `discord`, configura a variável do webhook no `.env` e adiciona a configuração de webhook ao `livekit.yaml`.

## 12. Guardar as credenciais

No fim do deploy, o script imprime:

```text
API Key
API Secret
```

Esses valores também são usados pelos arquivos gerados.

Não publique credenciais reais no Git.

## 13. Reexecutar o deploy

Quando `livekit.yaml` já contém uma chave no formato esperado pelo script, as credenciais existentes são reaproveitadas.

Em uma nova execução, mantenha as flags correspondentes aos serviços opcionais que devem continuar incluídos no comando.
