import { createInboxThought } from '../data/schema.js';
import { parseAndValidateJson, validateInboxCollection } from '../data/validate.js';
import { DATA_PATHS } from '../storage/paths.js';
import { safeWriteJson } from '../storage/recovery.js';

function nowISO() {
  return new Date().toISOString();
}

function normalizeThoughtText(text) {
  const value = String(text ?? '').trim();
  if (!value) throw new Error('Write something before saving the thought.');
  return value;
}

function findThought(collection, id) {
  const thought = collection.items.find((item) => item.id === id);
  if (!thought) throw new Error('Inbox thought was not found.');
  return thought;
}

export async function loadInbox(adapter) {
  const raw = await adapter.readText(DATA_PATHS.inbox);
  return parseAndValidateJson(raw, validateInboxCollection);
}

async function saveInbox(adapter, collection) {
  collection.updatedAt = nowISO();
  await safeWriteJson(adapter, DATA_PATHS.inbox, collection, validateInboxCollection);
  return collection;
}

export async function listInboxThoughts(adapter, { includeArchived = false } = {}) {
  const collection = await loadInbox(adapter);
  return collection.items
    .filter((item) => includeArchived || item.state === 'inbox')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function captureInboxThought(adapter, text) {
  const collection = await loadInbox(adapter);
  const thought = createInboxThought(normalizeThoughtText(text));
  collection.items.unshift(thought);
  await saveInbox(adapter, collection);
  return thought;
}

export async function editInboxThought(adapter, id, text) {
  const collection = await loadInbox(adapter);
  const thought = findThought(collection, id);
  thought.text = normalizeThoughtText(text);
  thought.updatedAt = nowISO();
  await saveInbox(adapter, collection);
  return thought;
}

export async function archiveInboxThought(adapter, id) {
  const collection = await loadInbox(adapter);
  const thought = findThought(collection, id);
  const now = nowISO();
  thought.state = 'archived';
  thought.archivedAt = now;
  thought.updatedAt = now;
  await saveInbox(adapter, collection);
  return thought;
}

export async function restoreInboxThought(adapter, id) {
  const collection = await loadInbox(adapter);
  const thought = findThought(collection, id);
  thought.state = 'inbox';
  thought.archivedAt = null;
  thought.updatedAt = nowISO();
  await saveInbox(adapter, collection);
  return thought;
}
