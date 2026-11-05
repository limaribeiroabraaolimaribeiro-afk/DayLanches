'use strict';

/* A Evolution API pode reentregar mensagens antigas depois de reconectar.
   Nao responder historico nem o mesmo ID duas vezes durante a execucao. */
function timestampMs(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') {
    if (value.seconds !== undefined) return timestampMs(value.seconds);
    if (Number.isInteger(value.low) && Number.isInteger(value.high)) {
      return timestampMs(value.high * 4294967296 + (value.low >>> 0));
    }
    return null;
  }
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number < 1e12 ? number * 1000 : number;
}

class IncomingMessageGuard {
  constructor({ maxAgeMs = 15 * 60 * 1000, maxFutureMs = 5 * 60 * 1000, maxEntries = 5000 } = {}) {
    this.maxAgeMs = maxAgeMs;
    this.maxFutureMs = maxFutureMs;
    this.maxEntries = maxEntries;
    this.processed = new Map();
  }

  check(data, now = Date.now()) {
    const timestamp = timestampMs(data?.messageTimestamp ?? data?.message?.messageTimestamp);
    if (timestamp !== null && now - timestamp > this.maxAgeMs) {
      return { accept: false, reason: 'old_message' };
    }
    if (timestamp !== null && timestamp - now > this.maxFutureMs) {
      return { accept: false, reason: 'future_message' };
    }

    const jid = data?.key?.remoteJid;
    const id = data?.key?.id;
    if (!jid || !id) return { accept: true };

    const key = jid + ':' + id;
    if (this.processed.has(key)) {
      return { accept: false, reason: 'duplicate' };
    }

    // Limit memory while keeping the newest IDs. Distinct messages (even if
    // they contain the same '1') must be answered independently.
    while (this.processed.size >= this.maxEntries) {
      this.processed.delete(this.processed.keys().next().value);
    }
    this.processed.set(key, now);
    return { accept: true };
  }
}

module.exports = { IncomingMessageGuard, timestampMs };
