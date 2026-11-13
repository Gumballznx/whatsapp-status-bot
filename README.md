# WhatsApp Status Bot

Bot automatizado para publicação programada de Status (Stories) no WhatsApp utilizando a biblioteca [Baileys](https://github.com/WhiskeySockets/Baileys) (pacote `baileys` v7), com sincronização de contatos via **Google People API** e agendamento de tarefas com **node-cron**.

---

## Visão Geral

O **WhatsApp Status Bot** foi projetado para publicar automaticamente atualizações de status (vídeos, fotos ou textos) no WhatsApp com contagem dinâmica de dias (exemplo: `DAY 1`, `DAY 2`, etc.), direcionando a visualização para uma lista seleta de contatos sincronizados diretamente da sua conta Google Contacts.

### Principais Recursos

- **Publicação Automatizada de Status**: Envia mídias para `status@broadcast` respeitando a lista de privacidade configurada (`statusJidList`).
- **Sincronização de Contatos do Google**: Integração com a Google People API (OAuth 2.0) com suporte a paginação automática para importar contatos telefônicos limpos e formatados no padrão internacional do WhatsApp.
- **Contador Dinâmico de Dias**: Calcula automaticamente os dias decorridos a partir de uma data inicial base (`START_DATE`), adicionando legendas como `DAY X`.
- **Agendador Cron Flexível**: Execução programada diária ou periódica com suporte a fuso horário configurável via `moment-timezone`.
- **Assistentes de Pareamento**: `qr_connect.js` (QR Code no terminal e em `qrcode.png`, com abertura automática no Windows) e `pair.js` (código de pareamento por número de telefone).
- **Sempre Online**: com `ALWAYS_ONLINE="true"` (padrão) a conta aparece online o tempo todo e as mensagens recebidas ficam com dois tiques (entregue), sem marcar como lida. Use `false` se quiser que o celular toque as notificações normalmente.
- **Recuperação de Postagem**: se o bot estiver offline no horário agendado, posta assim que reconectar — nunca antes do horário — e sem duplicar postagens.
- **Pronto para Produção**: Configuração de processo para [PM2](https://pm2.keymetrics.io/) (`ecosystem.config.cjs`) com auto-restart, limite de memória e logs.

---

## Arquitetura do Projeto

```text
whatsapp-status-bot/
├── src/
│   ├── config/
│   │   └── env.js               # Carregamento e validação de variáveis de ambiente
│   └── services/
│       ├── googleContacts.js    # Cliente OAuth 2.0 e busca paginada no Google Contacts
│       ├── cronMatcher.js       # Verifica se o horário do cron de hoje já passou
│       ├── scheduler.js         # Agendamento cron e cálculo de contagem de dias
│       └── statusPoster.js      # Envio de status via Baileys (vídeo, imagem, texto)
├── ecosystem.config.cjs         # Configuração de deploy e gerenciamento com PM2
├── index.js                     # Ponto de entrada principal do bot e agendador
├── package.json                 # Dependências e scripts do projeto
├── pair.js                      # Pareamento por código de telefone
├── qr_connect.js                # Pareamento inicial por QR Code
├── tests/                       # Testes automatizados (npm test)
├── video.mp4                    # Arquivo de mídia padrão para envio
├── .env.example                 # Modelo de variáveis de ambiente
└── .gitignore                   # Arquivos ignorados pelo controle de versão
```

---

## Pré-requisitos

1. **Node.js**: Versão 20.x ou superior instalada.
2. **Conta WhatsApp**: Um smartphone ativo com WhatsApp para leitura do QR Code.
3. **Credenciais Google Cloud**: Projeto no [Google Cloud Console](https://console.cloud.google.com/) com a **People API** habilitada e credenciais OAuth 2.0 (Client ID, Client Secret e Refresh Token).

---

## Configuração

### 1. Clonar e Instalar Dependências

```bash
git clone <URL_DO_REPOSITORIO>
cd whatsapp-status-bot
npm install
```

### 2. Configurar Variáveis de Ambiente

Crie uma cópia do arquivo `.env.example` e renomeie para `.env`:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```ini
# Google Cloud Console — OAuth 2.0 Client Credentials
GOOGLE_CLIENT_ID="SEU_GOOGLE_CLIENT_ID_AQUI"
GOOGLE_CLIENT_SECRET="SEU_GOOGLE_CLIENT_SECRET_AQUI"
GOOGLE_REFRESH_TOKEN="SEU_GOOGLE_REFRESH_TOKEN_AQUI"

# Número do Dono/Administrador (apenas dígitos: DDI + DDD + número)
OWNER_NUMBER="258XXXXXXXXX"

# (Opcional) Número do bot para pareamento por código, em vez de QR Code
# BOT_NUMBER="258XXXXXXXXX"

# DDI aplicado a contatos salvos sem código do país (ex: "84 123 4567" -> 25884...)
DEFAULT_COUNTRY_CODE="258"

# Manter a conta sempre "online" (true/false). Com true, o celular pode não tocar notificações.
ALWAYS_ONLINE="true"

# Expressão Cron para o agendamento (Ex: Todo dia às 09:00 -> "0 9 * * *")
STATUS_CRON="0 9 * * *"

# Fuso horário para agendamento e cálculo da virada do dia
TIMEZONE="Africa/Maputo"

# Data base de início para a contagem progressiva (DAY 1 = START_DATE)
START_DATE="2026-01-01"

# Caminho do arquivo de mídia a ser postado (ex: .mp4, .jpg, .png)
MEDIA_PATH="./video.mp4"
```

---

## Como Usar

### Passo 1: Primeira Conexão

Antes de iniciar o serviço contínuo, autentique a sessão do WhatsApp com **uma** das opções:

```bash
# Opção A: QR Code
npm run connect

# Opção B: código de pareamento por número de telefone
npm run pair -- 258XXXXXXXXX
```

- **QR Code**: o script mostra o QR no terminal e salva `qrcode.png` (abre automaticamente no Windows). No celular, vá em **Aparelhos conectados** > **Conectar um aparelho** e escaneie.
- **Código**: no celular, vá em **Aparelhos conectados** > **Conectar um aparelho** > **Conectar com número de telefone** e digite o código exibido.

Os dois scripts encerram sozinhos depois de conectar, com a sessão salva em `session/`.

### Passo 2: Executar o Bot

Com a sessão autenticada, inicie o bot principal:

```bash
npm start
```

Ao iniciar:
1. O bot restaura a sessão salva em `session/` (se não houver sessão, exibe o QR Code ou, com `BOT_NUMBER` definido, o código de pareamento).
2. Ativa o agendador `node-cron` para publicações automáticas no horário determinado em `STATUS_CRON`.
3. Se o horário de hoje já passou e ainda não há postagem registrada em `last_post.json` (ex: o bot estava offline), posta o status pendente. Antes do horário, apenas aguarda o cron.

Se a conexão cair, o bot reconecta automaticamente com espera progressiva (3s, 6s, 12s… até 5 minutos).

### Testes

```bash
npm test
```

---

## Execução em Produção com PM2

Para manter o bot em execução 24/7 em um servidor VPS ou máquina dedicada:

```bash
# Iniciar a aplicação gerenciada pelo PM2
pm2 start ecosystem.config.cjs

# Visualizar logs em tempo real
pm2 logs whatsapp-status-bot

# Checar status do processo
pm2 status

# Reiniciar aplicação
pm2 restart whatsapp-status-bot

# Parar aplicação
pm2 stop whatsapp-status-bot
```

---

## Detalhes de Funcionamento

### Como os Contatos são Mapeados para o Status
O WhatsApp restringe o envio de status a transmissões direcionadas (`status@broadcast`). O bot:
1. Conecta-se à Google People API com o Refresh Token fornecido.
2. Itera por todas as páginas de conexões (`pageSize: 1000`).
3. Higieniza os números telefônicos para o formato de JID do WhatsApp (`<DDI><NUMERO>@s.whatsapp.net`). Números salvos sem código do país recebem o `DEFAULT_COUNTRY_CODE`; números com `+` ou `00` são mantidos no formato internacional.
4. Inclui o número do dono (`OWNER_NUMBER`) e o próprio número do bot.
5. Posta o status com a lista `statusJidList`, garantindo que os contatos tenham permissão para visualizar a publicação.

### Cálculo Dinâmico do Dia
A função de cálculo compara a data atual no fuso horário especificado (`TIMEZONE`) com a `START_DATE`. O resultado é adicionado como legenda:
- No dia inicial (`START_DATE`): `DAY 1`
- Nos dias seguintes: `DAY 2`, `DAY 3`, ..., `DAY N`

---

## Tecnologias Utilizadas

- [Node.js](https://nodejs.org/) — Plataforma de desenvolvimento JavaScript
- [Baileys](https://github.com/WhiskeySockets/Baileys) — Cliente Web WhatsApp em TypeScript/JavaScript
- [googleapis](https://github.com/googleapis/google-api-nodejs-client) — SDK oficial do Google para People API
- [node-cron](https://github.com/kelektiv/node-cron) — Agendador de tarefas cron
- [moment-timezone](https://momentjs.com/timezone/) — Manipulação de datas e fusos horários
- [pino](https://github.com/pinojs/pino) — Logger estruturado de alta performance
- [pm2](https://pm2.keymetrics.io/) — Gerenciador de processos em produção

---

## Licença

Este projeto é disponibilizado para uso pessoal e operacional sob licença proprietária/MIT conforme aplicável ao repositório.
