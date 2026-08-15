#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Arquivo .env nao encontrado. Copie .env.example para .env e preencha antes de rodar este script."
  exit 1
fi

# shellcheck disable=SC1091
source .env

AGENT_PORT="${WHATSAPP_AGENT_PORT:-3001}"
AGENT_URL="${WHATSAPP_AGENT_URL:-http://host.docker.internal:${AGENT_PORT}/webhook/evolution}"

echo "── Registrando webhook da instancia '${INSTANCE_NAME}' na Evolution API ──"
echo "URL do webhook: ${AGENT_URL}"

curl -sS -X POST "https://${DOMAIN}/webhook/set/${INSTANCE_NAME}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  -d "{\"webhook\":{\"enabled\":true,\"url\":\"${AGENT_URL}\",\"byEvents\":false,\"base64\":false,\"events\":[\"MESSAGES_UPSERT\"]}}"

echo ""
echo "Webhook configurado. Teste enviando uma mensagem para o WhatsApp da loja e"
echo "verifique os logs com: pm2 logs day-lanches-agent"
