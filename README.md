# MTG WhatsApp Bot

Bot do WhatsApp para buscar cartas de Magic: The Gathering.

## Configuração no Render.com

1. Crie uma conta no [Render.com](https://render.com)
2. Conecte seu repositório GitHub
3. Crie um novo Web Service
4. Configure as seguintes variáveis de ambiente:
   - `NODE_VERSION`: 18.0.0

## Comandos Disponíveis

- `!carta [nome]` - Busca uma carta (em português ou inglês)
- `!ajuda` ou `!help` - Mostra ajuda detalhada
- `!ping` - Responde com pong
- `!oi` - Responde com uma saudação
- `!status` - Verifica o status da API

## Dependências

- Node.js 18+
- whatsapp-web.js
- qrcode-terminal
- axios
- sharp

## Requisitos

- Node.js instalado
- NPM (Node Package Manager)
- WhatsApp no celular

## Instalação

1. Clone este repositório
2. Instale as dependências:
```bash
npm install
```

## Como usar

1. Execute o bot:
```bash
npm start
```

2. Escaneie o QR Code que aparecerá no terminal com seu WhatsApp

3. Comandos disponíveis:
- `!ping` - O bot responderá com "pong"
- `!oi` - O bot responderá com uma saudação
- `!carta [nome da carta]` - Busca uma carta no Scryfall e mostra sua imagem e texto

## Observações

- Na primeira execução, você precisará escanear o QR Code para autenticar o bot
- As sessões subsequentes serão salvas automaticamente
- Não compartilhe o QR Code com ninguém
- Para buscar cartas, use o nome exato da carta em inglês 