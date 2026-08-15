'use strict';

/* Consulta status de pedido no Worker (mesma rota que o print-agent local
   ja usa em main.js: fetchOrderFromWorker). Reaproveita PRINT_AGENT_TOKEN
   (aqui chamado DAYLANCHES_AGENT_TOKEN) — nao cria rota nem token novo. */
function makeOrderLookup({ workerUrl, agentToken }) {
  return async function fetchOrderFromWorker(orderNum) {
    if (!orderNum) return null;
    try {
      const res = await fetch(
        `${workerUrl}/local-agent/order-status?order_number=${encodeURIComponent(orderNum)}`,
        { headers: { Authorization: `Bearer ${agentToken}` } }
      );
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  };
}

module.exports = makeOrderLookup;
