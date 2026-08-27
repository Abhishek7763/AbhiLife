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

export function findInboxThought(collection, id) {
  const thought = collection.items.find((item) => item.id === id);
  if (!thought) throw new Error('Inbox thought was not found.');
  return thought;
}

export async function loadInbox(adapter) {
  const raw = await adapter.readText(DATA_PATHS.inbox);
  return parseAndValidateJson(raw, validateInboxCollection);
}

export async function saveInboxCollection(adapter, collection) {
  collection.updatedAt = nowISO();
  await safeWriteJson(adapter, DATA_PATHS.inbox, collection, validateInboxCollection);
  return collection;
}

export async function listInboxThoughts(adapter, { includeArchived = false } = {}) {
  const collection = await loadInbox(adapter);
  return collection.items
    .filter((item) => includeArchived || item.state !== 'archived')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function captureInboxThought(adapter, text) {
  const collection = await loadInbox(adapter);
  const thought = createInboxThought(normalizeThoughtText(text));
  collection.items.unshift(thought);
  await saveInboxCollection(adapter, collection);
  return thought;
}

export async function editInboxThought(adapter, id, text) {
  const collection = await loadInbox(adapter);
  const thought = findInboxThought(collection, id);
  thought.text = normalizeThoughtText(text);
  thought.updatedAt = nowISO();
  await saveInboxCollection(adapter, collection);
  return thought;
}

export async function archiveInboxThought(adapter, id) {
  const collection = await loadInbox(adapter);
  const thought = findInboxThought(collection, id);
  const now = nowISO();
  if (thought.state !== 'archived') thought.preArchiveState = thought.state;
  thought.state = 'archived';
  thought.archivedAt = now;
  thought.updatedAt = now;
  await saveInboxCollection(adapter, collection);
  return thought;
}

export async function restoreInboxThought(adapter, id) {
  const collection = await loadInbox(adapter);
  const thought = findInboxThought(collection, id);
  thought.state = thought.preArchiveState || 'inbox';
  thought.preArchiveState = null;
  thought.archivedAt = null;
  thought.updatedAt = nowISO();
  await saveInboxCollection(adapter, collection);
  return thought;
}

export async function linkAcceptedThoughtToGoal(adapter, thoughtId, goalId) {
  const collection = await loadInbox(adapter);
  const thought = findInboxThought(collection, thoughtId);
  if (thought.state !== 'accepted' || thought.investigation?.decision !== 'real_goal') {
    throw new Error('Only a Real Goal candidate can be linked to a defined goal.');
  }
  if (thought.convertedToGoalId && thought.convertedToGoalId !== goalId) {
    throw new Error('This thought is already linked to a different goal.');
  }
  thought.convertedToGoalId = goalId;
  thought.updatedAt = nowISO();
  await saveInboxCollection(adapter, collection);
  return thought;
}
