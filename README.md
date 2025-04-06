# Bot do WhatsApp

Este é um bot simples do WhatsApp criado com Node.js e whatsapp-web.js.

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