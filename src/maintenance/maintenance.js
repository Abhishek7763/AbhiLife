import { DATA_SCHEMA_VERSION, EXECUTION_STATES, MAINTENANCE_STATES, MISSED_REASONS } from '../core/system.js';
import { createDailyRecord } from '../data/schema.js';
import { parseAndValidateJson, validateCollection } from '../data/validate.js';
import { validateTodayRecord } from '../execution/today.js';
import { DATA_PATHS, recordPath } from '../storage/paths.js';
import { safeWriteJson } from '../storage/recovery.js';

export const MAINTENANCE_CATEGORIES = Object.freeze([
  'sleep',
  'health',
  'hygiene',
  'meals',
  'medication',
  'finance',
  'home',
  'other'
]);

export const MAINTENANCE_EVENT_STATES = Object.freeze(['planned', ...EXECUTION_STATES]);
export const MAINTENANCE_SCHEDULE_TYPE = 'days_of_week';
export const ALL_WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

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

function normaliseDays(days) {
  const input = Array.isArray(days) ? days : ALL_WEEKDAYS;
  const unique = [...new Set(input.map((day) => Number(day)))].sort((a, b) => a - b);
  if (!unique.length || unique.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Choose at least one valid day for maintenance.');
  }
  return unique;
}

function scheduleFor(item) {
  if (!item.schedule) return { type: MAINTENANCE_SCHEDULE_TYPE, days: [...ALL_WEEKDAYS] };
  return item.schedule;
}

export function createMaintenanceDefinition(input = {}) {
  const now = nowISO();
  return applyMaintenanceInput({
    schemaVersion: DATA_SCHEMA_VERSION,
    id: makeId('maintenance'),
    title: '',
    category: 'other',
    areaId: null,
    purpose: '',
    minimumCondition: '',
    schedule: { type: MAINTENANCE_SCHEDULE_TYPE, days: [...ALL_WEEKDAYS] },
    state: 'active',
    pausedAt: null,
    archivedAt: null,
    preArchiveState: null,
    createdAt: now,
    updatedAt: now
  }, input);
}

function applyMaintenanceInput(item, input) {
  const title = String(input.title ?? '').trim();
  const category = String(input.category ?? '').trim();
  const areaId = String(input.areaId ?? '').trim();
  const purpose = String(input.purpose ?? '').trim();
  const minimumCondition = String(input.minimumCondition ?? '').trim();

  if (!title) throw new Error('Maintenance title is required.');
  if (!MAINTENANCE_CATEGORIES.includes(category)) throw new Error('Choose a valid maintenance category.');
  if (!areaId) throw new Error('Choose a life department.');
  if (!purpose) throw new Error('Add why this maintenance protects normal functioning.');
  if (!minimumCondition) throw new Error('Add the Minimum Acceptable Condition.');

  item.title = title;
  item.category = category;
  item.areaId = areaId;
  item.purpose = purpose;
  item.minimumCondition = minimumCondition;
  item.schedule = { type: MAINTENANCE_SCHEDULE_TYPE, days: normaliseDays(input.days) };
  item.updatedAt = nowISO();
  return item;
}

export function validateMaintenanceDefinition(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Invalid AbhiLife data: maintenance must be an object.');
  }
  if (item.schemaVersion !== DATA_SCHEMA_VERSION) throw new Error('Invalid AbhiLife data: unsupported maintenance schemaVersion.');
  requireString(item.id, 'maintenance id');
  requireString(item.title, 'maintenance title');
  if (!MAINTENANCE_CATEGORIES.includes(item.category)) throw new Error(`Invalid AbhiLife data: unknown maintenance category ${String(item.category)}.`);
  requireString(item.areaId, 'maintenance areaId');
  requireString(item.purpose, 'maintenance purpose');
  requireString(item.minimumCondition, 'maintenance minimumCondition');
  if (!MAINTENANCE_STATES.includes(item.state)) throw new Error(`Invalid AbhiLife data: unknown maintenance state ${String(item.state)}.`);

  const schedule = scheduleFor(item);
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) throw new Error('Invalid AbhiLife data: maintenance schedule must be an object.');
  if (schedule.type !== MAINTENANCE_SCHEDULE_TYPE) throw new Error('Invalid AbhiLife data: unsupported maintenance schedule type.');
  normaliseDays(schedule.days);

  requireOptionalString(item.pausedAt, 'maintenance pausedAt');
  requireOptionalString(item.archivedAt, 'maintenance archivedAt');
  if (item.preArchiveState !== null && item.preArchiveState !== undefined && !['active', 'paused'].includes(item.preArchiveState)) {
    throw new Error('Invalid AbhiLife data: maintenance preArchiveState must be active or paused.');
  }
  requireString(item.createdAt, 'maintenance createdAt');
  requireString(item.updatedAt, 'maintenance updatedAt');
  return true;
}

export function validateMaintenanceCollection(collection) {
  validateCollection(collection, 'maintenance');
  const ids = new Set();
  for (const item of collection.items) {
    validateMaintenanceDefinition(item);
    if (ids.has(item.id)) throw new Error(`Invalid AbhiLife data: duplicate maintenance id ${item.id}.`);
    ids.add(item.id);
  }
  return true;
}

export async function loadMaintenance(adapter) {
  if (!await adapter.exists(DATA_PATHS.maintenance)) {
    throw new Error('Maintenance collection is missing from the AbhiLife vault.');
  }
  return parseAndValidateJson(await adapter.readText(DATA_PATHS.maintenance), validateMaintenanceCollection);
}

async function saveMaintenance(adapter, collection) {
  collection.updatedAt = nowISO();
  await safeWriteJson(adapter, DATA_PATHS.maintenance, collection, validateMaintenanceCollection);
  return collection;
}

export async function addMaintenance(adapter, input) {
  const collection = await loadMaintenance(adapter);
  const item = createMaintenanceDefinition(input);
  validateMaintenanceDefinition(item);
  collection.items.push(item);
  await saveMaintenance(adapter, collection);
  return item;
}

export async function editMaintenance(adapter, itemId, input) {
  const collection = await loadMaintenance(adapter);
  const item = collection.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error('Maintenance item was not found.');
  if (item.state === 'archived') throw new Error('Restore this maintenance item before editing it.');
  applyMaintenanceInput(item, input);
  validateMaintenanceDefinition(item);
  await saveMaintenance(adapter, collection);
  return item;
}

async function changeMaintenanceState(adapter, itemId, action) {
  const collection = await loadMaintenance(adapter);
  const item = collection.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error('Maintenance item was not found.');
  const now = nowISO();

  if (action === 'pause') {
    if (item.state !== 'active') throw new Error('Only Active maintenance can be paused.');
    item.state = 'paused';
    item.pausedAt = now;
  } else if (action === 'resume') {
    if (item.state !== 'paused') throw new Error('Only Paused maintenance can be resumed.');
    item.state = 'active';
    item.pausedAt = null;
  } else if (action === 'archive') {
    if (item.state === 'archived') return item;
    item.preArchiveState = item.state === 'paused' ? 'paused' : 'active';
    item.state = 'archived';
    item.archivedAt = now;
  } else if (action === 'restore') {
    if (item.state !== 'archived') throw new Error('Only Archived maintenance can be restored.');
    item.state = item.preArchiveState === 'paused' ? 'paused' : 'active';
    item.archivedAt = null;
    item.preArchiveState = null;
    if (item.state === 'active') item.pausedAt = null;
  } else {
    throw new Error('Unknown maintenance state action.');
  }

  item.updatedAt = now;
  validateMaintenanceDefinition(item);
  await saveMaintenance(adapter, collection);
  return item;
}

export const pauseMaintenance = (adapter, itemId) => changeMaintenanceState(adapter, itemId, 'pause');
export const resumeMaintenance = (adapter, itemId) => changeMaintenanceState(adapter, itemId, 'resume');
export const archiveMaintenance = (adapter, itemId) => changeMaintenanceState(adapter, itemId, 'archive');
export const restoreMaintenance = (adapter, itemId) => changeMaintenanceState(adapter, itemId, 'restore');

export function maintenanceIsDueOnDate(item, dateISO) {
  validateMaintenanceDefinition(item);
  if (item.state !== 'active') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error('Maintenance date must use YYYY-MM-DD.');
  const date = new Date(`${dateISO}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateISO) throw new Error('Maintenance date is invalid.');
  return normaliseDays(scheduleFor(item).days).includes(date.getUTCDay());
}

export function validateMaintenanceEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid AbhiLife data: maintenance event must be an object.');
  for (const [key, label] of [
    ['id', 'maintenance event id'],
    ['maintenanceId', 'maintenance event maintenanceId'],
    ['title', 'maintenance event title'],
    ['category', 'maintenance event category'],
    ['minimumCondition', 'maintenance event minimumCondition'],
    ['createdAt', 'maintenance event createdAt'],
    ['updatedAt', 'maintenance event updatedAt']
  ]) requireString(event[key], label);
  if (!MAINTENANCE_CATEGORIES.includes(event.category)) throw new Error('Invalid AbhiLife data: maintenance event has unknown category.');
  if (!MAINTENANCE_EVENT_STATES.includes(event.state)) throw new Error(`Invalid AbhiLife data: unknown maintenance event state ${String(event.state)}.`);
  requireOptionalString(event.reason, 'maintenance event reason');
  requireOptionalString(event.note, 'maintenance event note');
  requireOptionalString(event.resolvedAt, 'maintenance event resolvedAt');
  if (event.state === 'missed' && !MISSED_REASONS.includes(event.reason)) throw new Error('Invalid AbhiLife data: missed maintenance requires a known reason.');
  if (event.state !== 'missed' && event.reason !== null) throw new Error('Invalid AbhiLife data: only missed maintenance can store a reason.');
  return true;
}

export function validateMaintenanceDailyRecord(record) {
  validateTodayRecord(record);
  const ids = new Set();
  const maintenanceIds = new Set();
  for (const event of record.maintenanceEvents) {
    validateMaintenanceEvent(event);
    if (ids.has(event.id)) throw new Error(`Invalid AbhiLife data: duplicate maintenance event id ${event.id}.`);
    if (maintenanceIds.has(event.maintenanceId)) throw new Error(`Invalid AbhiLife data: duplicate maintenance event for ${event.maintenanceId}.`);
    ids.add(event.id);
    maintenanceIds.add(event.maintenanceId);
  }
  return true;
}

export async function loadMaintenanceDayRecord(adapter, dateISO) {
  const path = recordPath(dateISO);
  if (!await adapter.exists(path)) return createDailyRecord(dateISO);
  return parseAndValidateJson(await adapter.readText(path), validateMaintenanceDailyRecord);
}

async function saveMaintenanceDayRecord(adapter, record) {
  record.updatedAt = nowISO();
  await safeWriteJson(adapter, recordPath(record.date), record, validateMaintenanceDailyRecord);
  return record;
}

export async function syncMaintenanceEventsForDate(adapter, dateISO) {
  const collection = await loadMaintenance(adapter);
  const record = await loadMaintenanceDayRecord(adapter, dateISO);
  const existing = new Set(record.maintenanceEvents.map((event) => event.maintenanceId));
  let created = 0;

  for (const item of collection.items) {
    if (!maintenanceIsDueOnDate(item, dateISO) || existing.has(item.id)) continue;
    const now = nowISO();
    record.maintenanceEvents.push({
      id: makeId('maintenance_event'),
      maintenanceId: item.id,
      title: item.title,
      category: item.category,
      minimumCondition: item.minimumCondition,
      state: 'planned',
      reason: null,
      note: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null
    });
    existing.add(item.id);
    created += 1;
  }

  if (created) await saveMaintenanceDayRecord(adapter, record);
  return { record, created };
}

export async function recordMaintenanceOutcome(adapter, dateISO, eventId, state, { reason = null, note = null } = {}) {
  if (!EXECUTION_STATES.includes(state)) throw new Error('Choose a valid maintenance result.');
  const record = await loadMaintenanceDayRecord(adapter, dateISO);
  const event = record.maintenanceEvents.find((entry) => entry.id === eventId);
  if (!event) throw new Error('Maintenance event was not found for this day.');

  if (state === 'missed') {
    if (!MISSED_REASONS.includes(reason)) throw new Error('Choose why this maintenance was missed.');
  } else {
    reason = null;
  }

  const now = nowISO();
  event.state = state;
  event.reason = reason;
  event.note = String(note ?? '').trim() || null;
  event.updatedAt = now;
  event.resolvedAt = now;
  await saveMaintenanceDayRecord(adapter, record);
  return { record, event };
}

export function summarizeMaintenanceDay(record) {
  const summary = { planned: 0, done: 0, partial: 0, missed: 0, skipped: 0, total: 0 };
  for (const event of record.maintenanceEvents ?? []) {
    if (Object.hasOwn(summary, event.state)) summary[event.state] += 1;
    summary.total += 1;
  }
  return summary;
}
