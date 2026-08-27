import { DATA_SCHEMA_VERSION } from '../core/system.js';

export function createManifest() {
  const now = new Date().toISOString();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    product: 'AbhiLife',
    createdAt: now,
    updatedAt: now
  };
}

export function createDailyRecord(dateISO) {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    date: dateISO,
    importantWin: null,
    tasks: [],
    habits: [],
    maintenance: [],
    notes: '',
    review: null
  };
}

export function createInboxThought(text) {
  const now = new Date().toISOString();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    text: text.trim(),
    state: 'inbox',
    createdAt: now,
    updatedAt: now
  };
}
