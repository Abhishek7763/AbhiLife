import { DATA_SCHEMA_VERSION, HABIT_STATES } from '../core/system.js';
import { createCollection, createDailyRecord } from '../data/schema.js';
import { parseAndValidateJson, validateCollection } from '../data/validate.js';
import { validateTodayRecord } from '../execution/today.js';
import { recordPath } from '../storage/paths.js';
import { safeWriteJson, snapshotLastKnownGood } from '../storage/recovery.js';

export const BAD_HABITS_PATH = 'habits/bad-items.json';
export const BAD_HABIT_EVENT_TYPES = Object.freeze(['occurred', 'interrupted', 'replaced']);

function nowISO() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function requireString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new Error(`Invalid AbhiLife data: ${label} must be ${allowEmpty ? 'a string' : 'a non-empty string'}.`);
  }
}

function requireOptionalString(value, label) {
  if (value !== null && value !== undefined) requireString(value, label);
}

export function createBadHabitDefinition(input = {}) {
  const now = nowISO();
  return applyBadHabitInput({
    schemaVersion: DATA_SCHEMA_VERSION,
    id: makeId('bad_habit'),
    kind: 'reduce',
    title: '',
    areaId: null,
    state: 'active',
    trigger: '',
    timePattern: '',
    placeContext: '',
    immediateReward: '',
    longTermCost: '',
    removeCuePlan: '',
    frictionPlan: '',
    environmentPlan: '',
    replacementBehavior: '',
    pausedAt: null,
    archivedAt: null,
    preArchiveState: null,
    createdAt: now,
    updatedAt: now
  }, input);
}

function applyBadHabitInput(item, input) {
  const fields = {
    title: 'Behavior',
    areaId: 'Life department',
    trigger: 'Trigger',
    timePattern: 'Time pattern',
    placeContext: 'Place / context',
    immediateReward: 'Immediate reward',
    longTermCost: 'Long-term cost',
    removeCuePlan: 'Remove cue plan',
    frictionPlan: 'Increase friction plan',
    environmentPlan: 'Environment change',
    replacementBehavior: 'Replacement behavior'
  };

  for (const [key, label] of Object.entries(fields)) {
    const value = String(input[key] ?? '').trim();
    if (!value) throw new Error(`${label} is required.`);
    item[key] = value;
  }
  item.updatedAt = nowISO();
  return item;
}

export function validateBadHabitDefinition(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Invalid AbhiLife data: bad habit must be an object.');
  }
  if (item.schemaVersion !== DATA_SCHEMA_VERSION) throw new Error('Invalid AbhiLife data: unsupported bad habit schemaVersion.');
  requireString(item.id, 'bad habit id');
  if (item.kind !== 'reduce') throw new Error('Invalid AbhiLife data: bad habit kind must be reduce.');
  if (!HABIT_STATES.includes(item.state)) throw new Error(`Invalid AbhiLife data: unknown bad habit state ${String(item.state)}.`);
  for (const key of [
    'title', 'areaId', 'trigger', 'timePattern', 'placeContext', 'immediateReward', 'longTermCost',
    'removeCuePlan', 'frictionPlan', 'environmentPlan', 'replacementBehavior', 'createdAt', 'updatedAt'
  ]) requireString(item[key], `bad habit ${key}`);
  requireOptionalString(item.pausedAt, 'bad habit pausedAt');
  requireOptionalString(item.archivedAt, 'bad habit archivedAt');
  if (item.preArchiveState !== null && item.preArchiveState !== undefined && !['active', 'paused'].includes(item.preArchiveState)) {
    throw new Error('Invalid AbhiLife data: bad habit preArchiveState must be active or paused.');
  }
  return true;
}

export function validateBadHabitsCollection(collection) {
  validateCollection(collection, 'badHabits');
  const ids = new Set();
  for (const item of collection.items) {
    validateBadHabitDefinition(item);
    if (ids.has(item.id)) throw new Error(`Invalid AbhiLife data: duplicate bad habit id ${item.id}.`);
    ids.add(item.id);
  }
  return true;
}

export async function loadBadHabits(adapter) {
  if (!await adapter.exists(BAD_HABITS_PATH)) return createCollection('badHabits', []);
  return parseAndValidateJson(await adapter.readText(BAD_HABITS_PATH), validateBadHabitsCollection);
}

async function saveBadHabits(adapter, collection) {
  collection.updatedAt = nowISO();
  const result = await safeWriteJson(adapter, BAD_HABITS_PATH, collection, validateBadHabitsCollection);
  if (!result.snapshotCreated) {
    await snapshotLastKnownGood(adapter, BAD_HABITS_PATH, validateBadHabitsCollection);
  }
  return collection;
}

export async function addBadHabit(adapter, input) {
  const collection = await loadBadHabits(adapter);
  const item = createBadHabitDefinition(input);
  validateBadHabitDefinition(item);
  collection.items.push(item);
  await saveBadHabits(adapter, collection);
  return item;
}

export async function editBadHabit(adapter, itemId, input) {
  const collection = await loadBadHabits(adapter);
  const item = collection.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error('Bad habit was not found.');
  if (item.state === 'archived') throw new Error('Restore this bad habit before editing it.');
  applyBadHabitInput(item, input);
  validateBadHabitDefinition(item);
  await saveBadHabits(adapter, collection);
  return item;
}

async function changeBadHabitState(adapter, itemId, action) {
  const collection = await loadBadHabits(adapter);
  const item = collection.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error('Bad habit was not found.');
  const now = nowISO();

  if (action === 'pause') {
    if (item.state !== 'active') throw new Error('Only an Active bad habit can be paused.');
    item.state = 'paused';
    item.pausedAt = now;
  } else if (action === 'resume') {
    if (item.state !== 'paused') throw new Error('Only a Paused bad habit can be resumed.');
    item.state = 'active';
    item.pausedAt = null;
  } else if (action === 'archive') {
    if (item.state === 'archived') return item;
    item.preArchiveState = item.state === 'paused' ? 'paused' : 'active';
    item.state = 'archived';
    item.archivedAt = now;
  } else if (action === 'restore') {
    if (item.state !== 'archived') throw new Error('Only an Archived bad habit can be restored.');
    item.state = item.preArchiveState === 'paused' ? 'paused' : 'active';
    item.archivedAt = null;
    item.preArchiveState = null;
    if (item.state === 'active') item.pausedAt = null;
  } else {
    throw new Error('Unknown bad habit state action.');
  }

  item.updatedAt = now;
  validateBadHabitDefinition(item);
  await saveBadHabits(adapter, collection);
  return item;
}

export const pauseBadHabit = (adapter, itemId) => changeBadHabitState(adapter, itemId, 'pause');
export const resumeBadHabit = (adapter, itemId) => changeBadHabitState(adapter, itemId, 'resume');
export const archiveBadHabit = (adapter, itemId) => changeBadHabitState(adapter, itemId, 'archive');
export const restoreBadHabit = (adapter, itemId) => changeBadHabitState(adapter, itemId, 'restore');

export function validateBadHabitEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Invalid AbhiLife data: bad habit event must be an object.');
  }
  for (const key of ['id', 'badHabitId', 'title', 'eventType', 'trigger', 'context', 'replacementBehavior', 'loggedAt', 'createdAt']) {
    requireString(event[key], `bad habit event ${key}`);
  }
  if (!BAD_HABIT_EVENT_TYPES.includes(event.eventType)) throw new Error(`Invalid AbhiLife data: unknown bad habit event type ${String(event.eventType)}.`);
  requireOptionalString(event.note, 'bad habit event note');
  return true;
}

export function validateBadHabitDailyRecord(record) {
  validateTodayRecord(record);
  if (record.badHabitEvents !== undefined && !Array.isArray(record.badHabitEvents)) {
    throw new Error('Invalid AbhiLife data: daily record badHabitEvents must be an array.');
  }
  const ids = new Set();
  for (const event of record.badHabitEvents ?? []) {
    validateBadHabitEvent(event);
    if (ids.has(event.id)) throw new Error(`Invalid AbhiLife data: duplicate bad habit event id ${event.id}.`);
    ids.add(event.id);
  }
  return true;
}

export async function loadBadHabitDayRecord(adapter, dateISO) {
  const path = recordPath(dateISO);
  if (!await adapter.exists(path)) {
    const record = createDailyRecord(dateISO);
    record.badHabitEvents = [];
    return record;
  }
  const record = parseAndValidateJson(await adapter.readText(path), validateBadHabitDailyRecord);
  if (!Array.isArray(record.badHabitEvents)) record.badHabitEvents = [];
  return record;
}

async function saveBadHabitDayRecord(adapter, record) {
  record.badHabitEvents ??= [];
  record.updatedAt = nowISO();
  await safeWriteJson(adapter, recordPath(record.date), record, validateBadHabitDailyRecord);
  return record;
}

export async function logBadHabitEvent(adapter, dateISO, itemId, eventType, { trigger = '', context = '', note = '' } = {}) {
  if (!BAD_HABIT_EVENT_TYPES.includes(eventType)) throw new Error('Choose a valid bad habit event type.');
  const collection = await loadBadHabits(adapter);
  const item = collection.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error('Bad habit was not found.');
  if (item.state !== 'active') throw new Error('Only an Active bad habit can log new evidence.');

  const observedTrigger = String(trigger ?? '').trim() || item.trigger;
  const observedContext = String(context ?? '').trim() || item.placeContext;
  const now = nowISO();
  const record = await loadBadHabitDayRecord(adapter, dateISO);
  const event = {
    id: makeId('bad_habit_event'),
    badHabitId: item.id,
    title: item.title,
    eventType,
    trigger: observedTrigger,
    context: observedContext,
    replacementBehavior: item.replacementBehavior,
    note: String(note ?? '').trim() || null,
    loggedAt: now,
    createdAt: now
  };
  validateBadHabitEvent(event);
  record.badHabitEvents.push(event);
  await saveBadHabitDayRecord(adapter, record);
  return { record, event };
}

export function summarizeBadHabitDay(record) {
  const summary = { occurred: 0, interrupted: 0, replaced: 0, total: 0 };
  for (const event of record.badHabitEvents ?? []) {
    if (BAD_HABIT_EVENT_TYPES.includes(event.eventType)) summary[event.eventType] += 1;
    summary.total += 1;
  }
  return summary;
}
