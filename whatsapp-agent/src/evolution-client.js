'use strict';

/* Cliente REST fino para a Evolution API. Este agente NAO abre socket
   WhatsApp proprio — a conexao (sessao, QR, reconexao) e responsabilidade
   exclusiva do container evolution-api (infra/evolution). Isso evita ter
   dois dispositivos Baileys logados no mesmo numero ao mesmo tempo. */

class EvolutionClient {
  constructor({ apiUrl, apiKey, instance }) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.instance = instance;
  }

  /* Extrai apenas os digitos de um JID (5547999999999@s.whatsapp.net -> 5547999999999) */
  static jidToNumber(jid) {
    return String(jid || '').split('@')[0].replace(/\D/g, '');
  }

  async sendText(jidOrNumber, text) {
    const number = EvolutionClient.jidToNumber(jidOrNumber);
    if (!number) throw new Error('Numero invalido para envio');

    const res = await fetch(`${this.apiUrl}/message/sendText/${this.instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
      body: JSON.stringify({ number, text }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Evolution API respondeu HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }

    return res.json().catch(() => ({}));
  }

  async getConnectionState() {
    const res = await fetch(`${this.apiUrl}/instance/connectionState/${this.instance}`, {
      headers: { apikey: this.apiKey },
    });
    if (!res.ok) return { state: 'unknown', httpStatus: res.status };
    const data = await res.json().catch(() => ({}));
    return { state: data.instance?.state || data.state || 'unknown' };
  }
}

module.exports = EvolutionClient;
