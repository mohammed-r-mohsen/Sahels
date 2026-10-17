#!/bin/bash
# Sahels Deployment Script
# Usage: ./deploy.sh

echo "🚀 Starting Sahels Deployment..."

# 1. Update System
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# 2. Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 3. Install Nginx
echo "🌐 Installing Nginx..."
apt install -y nginx

# 4. Copy Nginx Config
echo "⚙️ Configuring Nginx..."
cp infra/nginx.conf /etc/nginx/sites-available/sahels
ln -s /etc/nginx/sites-available/sahels /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 5. Setup Firewall
echo "🛡️ Setting up UFW..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 6. Start Docker Compose
echo "🚀 Starting Sahels Containers..."
docker compose up -d --build

echo "✅ Deployment Complete!"
echo "Check status with: docker compose ps"
