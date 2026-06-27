#!/usr/bin/env bash
set -euo pipefail

# Instala Docker e Docker Compose no Ubuntu 22.04 / 24.04

echo "── Atualizando pacotes ──"
apt-get update -y
apt-get install -y ca-certificates curl gnupg

echo "── Adicionando repositório Docker ──"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "── Instalando Docker Engine e Compose ──"
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "── Habilitando Docker no boot ──"
systemctl enable docker
systemctl start docker

echo "── Verificando instalação ──"
docker --version
docker compose version

echo ""
echo "Docker instalado com sucesso!"
