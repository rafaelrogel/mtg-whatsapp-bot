#!/bin/bash

# Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2 globalmente
sudo npm install -g pm2

# Instalar dependências do bot
cd /opt/mtg-whatsapp-bot
npm install

# Criar diretórios necessários
mkdir -p temp auth_info_baileys

# Iniciar o bot com PM2
pm2 start index.js --name mtg-bot

# Salvar a lista de processos do PM2
pm2 save

# Configurar PM2 para iniciar no boot
pm2 startup

echo "========================================="
echo "  MTG WhatsApp Bot instalado com sucesso!"
echo "========================================="
echo ""
echo "Comandos úteis:"
echo "  pm2 status        - Ver status do bot"
echo "  pm2 logs mtg-bot  - Ver logs em tempo real"
echo "  pm2 restart mtg-bot - Reiniciar o bot"
echo "  pm2 stop mtg-bot    - Parar o bot"
echo ""
echo "Acesse http://IP_DO_VPS:3000/qr para escanear o QR Code"