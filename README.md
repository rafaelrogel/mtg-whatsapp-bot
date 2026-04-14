# MTG WhatsApp Bot (ManaMate)

Bot do WhatsApp para buscar cartas de Magic: The Gathering, agora usando **Baileys** (sem Puppeteer).

## Requisitos

- Node.js 18+
- NPM

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

2. Escaneie o QR Code que aparecerá no terminal ou acesse `http://localhost:3000/qr`

3. Comandos disponíveis:
- `!ping` - O bot responderá com "pong"
- `!oi` - O bot responderá com uma saudação
- `!carta [nome da carta]` - Busca uma carta no Scryfall e mostra sua imagem e texto
- `!ajuda` ou `!help` - Mostra os comandos disponíveis
- `!status` - Verifica o status da API do Scryfall

## Observações

- Na primeira execução, você precisará escanear o QR Code para autenticar o bot
- A sessão é salva automaticamente na pasta `auth_info_baileys`
- Para buscar cartas, prefira o nome em inglês para melhores resultados
- O Baileys se reconecta automaticamente caso a conexão caia

## Mudanças da versão com Baileys

- Removido Puppeteer/whatsapp-web.js (mais leve, sem navegador headless)
- Autenticação via `useMultiFileAuthState` (sessão salva em `auth_info_baileys/`)
- Reconexão automática em caso de desconexão
- QR Code disponível no terminal e via web (`/qr`)
- Status da conexão WhatsApp visível na página principal (`/`)

## Deploy

O bot está configurado para deploy no Render via `render.yaml`.