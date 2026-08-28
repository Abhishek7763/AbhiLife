import { DATA_SCHEMA_VERSION, EXECUTION_STATES, HABIT_STATES, MISSED_REASONS } from '../core/system.js';
import { createDailyRecord, createHabit } from '../data/schema.js';
import { parseAndValidateJson, validateCollection } from '../data/validate.js';
import { validateTodayRecord } from '../execution/today.js';
import { DATA_PATHS, recordPath } from '../storage/paths.js';
import { safeWriteJson } from '../storage/recovery.js';

export const HABIT_EVENT_STATES = Object.freeze(['planned', ...EXECUTION_STATES]);
export const HABIT_SCHEDULE_TYPE = 'days_of_week';
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
    throw new Error('Choose at least one valid day for the habit.');
  }
  return unique;
}

function scheduleFor(habit) {
  if (!habit.schedule) return { type: HABIT_SCHEDULE_TYPE, days: [...ALL_WEEKDAYS] };
  return habit.schedule;
}

export function validateHabitDefinition(habit) {
  if (!habit || typeof habit !== 'object' || Array.isArray(habit)) {
    throw new Error('Invalid AbhiLife data: habit must be an object.');
  }
  if (habit.schemaVersion !== DATA_SCHEMA_VERSION) throw new Error('Invalid AbhiLife data: unsupported habit schemaVersion.');
  requireString(habit.id, 'habit id');
  requireString(habit.title, 'habit title');
  if (habit.areaId !== null && habit.areaId !== undefined) requireString(habit.areaId, 'habit areaId');
  if (habit.kind !== 'build') throw new Error('Invalid AbhiLife data: Habit Engine currently accepts build habits only.');
  if (!HABIT_STATES.includes(habit.state)) throw new Error(`Invalid AbhiLife data: unknown habit state ${String(habit.state)}.`);
  requireString(habit.cue ?? '', 'habit cue', { allowEmpty: true });
  requireString(habit.context ?? '', 'habit context', { allowEmpty: true });
  requireString(habit.minimumAction ?? '', 'habit minimumAction', { allowEmpty: true });
  requireString(habit.targetAction ?? '', 'habit targetAction', { allowEmpty: true });
  requireString(habit.replacementBehavior ?? '', 'habit replacementBehavior', { allowEmpty: true });

  const schedule = scheduleFor(habit);
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new Error('Invalid AbhiLife data: habit schedule must be an object.');
  }
  if (schedule.type !== HABIT_SCHEDULE_TYPE) throw new Error('Invalid AbhiLife data: unsupported habit schedule type.');
  normaliseDays(schedule.days);

  requireOptionalString(habit.pausedAt, 'habit pausedAt');
  requireOptionalString(habit.archivedAt, 'habit archivedAt');
  if (habit.preArchiveState !== null && habit.preArchiveState !== undefined && !['active', 'paused'].includes(habit.preArchiveState)) {
    throw new Error('Invalid AbhiLife data: habit preArchiveState must be active or paused.');
  }
  requireString(habit.createdAt, 'habit createdAt');
  requireString(habit.updatedAt, 'habit updatedAt');
  return true;
}

export function validateHabitsCollection(collection) {
  validateCollection(collection, 'habits');
  const ids = new Set();
  for (const habit of collection.items) {
    validateHabitDefinition(habit);
    if (ids.has(habit.id)) throw new Error(`Invalid AbhiLife data: duplicate habit id ${habit.id}.`);
    ids.add(habit.id);
  }
  return true;
}

export async function loadHabits(adapter) {
  if (!await adapter.exists(DATA_PATHS.habits)) {
    throw new Error('Habits collection is missing from the AbhiLife vault.');
  }
  return parseAndValidateJson(await adapter.readText(DATA_PATHS.habits), validateHabitsCollection);
}

async function saveHabits(adapter, collection) {
  collection.updatedAt = nowISO();
  await safeWriteJson(adapter, DATA_PATHS.habits, collection, validateHabitsCollection);
  return collection;
}

function applyHabitInput(habit, input) {
  const title = String(input.title ?? '').trim();
  const areaId = String(input.areaId ?? '').trim();
  const cue = String(input.cue ?? '').trim();
  const context = String(input.context ?? '').trim();
  const minimumAction = String(input.minimumAction ?? '').trim();
  const targetAction = String(input.targetAction ?? '').trim();
  if (!title) throw new Error('Habit title is required.');
  if (!areaId) throw new Error('Choose a life department.');
  if (!cue) throw new Error('Add a cue or trigger for this habit.');
  if (!context) throw new Error('Add the context where this habit should happen.');
  if (!minimumAction) throw new Error('Add a Minimum Version that is easy to do on a difficult day.');
  if (!targetAction) throw new Error('Add the Preferred Version of the habit.');

  habit.title = title;
  habit.areaId = areaId;
  habit.cue = cue;
  habit.context = context;
  habit.minimumAction = minimumAction;
  habit.targetAction = targetAction;
  habit.schedule = { type: HABIT_SCHEDULE_TYPE, days: normaliseDays(input.days) };
  habit.updatedAt = nowISO();
  return habit;
}

export async function createHabitDefinition(adapter, input) {
  const collection = await loadHabits(adapter);
  const habit = createHabit({ title: input.title, areaId: input.areaId, kind: 'build' });
  habit.schedule = { type: HABIT_SCHEDULE_TYPE, days: [...ALL_WEEKDAYS] };
  habit.pausedAt = null;
  habit.archivedAt = null;
  habit.preArchiveState = null;
  applyHabitInput(habit, input);
  validateHabitDefinition(habit);
  collection.items.push(habit);
  await saveHabits(adapter, collection);
  return habit;
}

export async function editHabitDefinition(adapter, habitId, input) {
  const collection = await loadHabits(adapter);
  const habit = collection.items.find((item) => item.id === habitId);
  if (!habit) throw new Error('Habit was not found.');
  if (habit.state === 'archived') throw new Error('Restore this habit before editing it.');
  applyHabitInput(habit, input);
  validateHabitDefinition(habit);
  await saveHabits(adapter, collection);
  return habit;
}

async function changeHabitState(adapter, habitId, action) {
  const collection = await loadHabits(adapter);
  const habit = collection.items.find((item) => item.id === habitId);
  if (!habit) throw new Error('Habit was not found.');
  const now = nowISO();

  if (action === 'pause') {
    if (habit.state !== 'active') throw new Error('Only an Active habit can be paused.');
    habit.state = 'paused';
    habit.pausedAt = now;
  } else if (action === 'resume') {
    if (habit.state !== 'paused') throw new Error('Only a Paused habit can be resumed.');
    habit.state = 'active';
    habit.pausedAt = null;
  } else if (action === 'archive') {
    if (habit.state === 'archived') return habit;
    habit.preArchiveState = habit.state === 'paused' ? 'paused' : 'active';
    habit.state = 'archived';
    habit.archivedAt = now;
  } else if (action === 'restore') {
    if (habit.state !== 'archived') throw new Error('Only an Archived habit can be restored.');
    habit.state = habit.preArchiveState === 'paused' ? 'paused' : 'active';
    habit.archivedAt = null;
    habit.preArchiveState = null;
    if (habit.state === 'active') habit.pausedAt = null;
  } else {
    throw new Error('Unknown habit state action.');
  }

  habit.updatedAt = now;
  validateHabitDefinition(habit);
  await saveHabits(adapter, collection);
  return habit;
}

export const pauseHabit = (adapter, habitId) => changeHabitState(adapter, habitId, 'pause');
export const resumeHabit = (adapter, habitId) => changeHabitState(adapter, habitId, 'resume');
export const archiveHabit = (adapter, habitId) => changeHabitState(adapter, habitId, 'archive');
export const restoreHabit = (adapter, habitId) => changeHabitState(adapter, habitId, 'restore');

export function habitIsDueOnDate(habit, dateISO) {
  validateHabitDefinition(habit);
  if (habit.state !== 'active') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error('Habit date must use YYYY-MM-DD.');
  const date = new Date(`${dateISO}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Habit date is invalid.');
  return normaliseDays(scheduleFor(habit).days).includes(date.getUTCDay());
}

export function validateHabitEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Invalid AbhiLife data: habit event must be an object.');
  }
  for (const [key, label] of [
    ['id', 'habit event id'],
    ['habitId', 'habit event habitId'],
    ['title', 'habit event title'],
    ['minimumAction', 'habit event minimumAction'],
    ['preferredAction', 'habit event preferredAction'],
    ['createdAt', 'habit event createdAt'],
    ['updatedAt', 'habit event updatedAt']
  ]) requireString(event[key], label);
  if (!HABIT_EVENT_STATES.includes(event.state)) throw new Error(`Invalid AbhiLife data: unknown habit event state ${String(event.state)}.`);
  requireOptionalString(event.reason, 'habit event reason');
  requireOptionalString(event.note, 'habit event note');
  requireOptionalString(event.resolvedAt, 'habit event resolvedAt');
  if (event.state === 'missed' && !MISSED_REASONS.includes(event.reason)) {
    throw new Error('Invalid AbhiLife data: missed habit requires a known reason.');
  }
  if (event.state !== 'missed' && event.reason !== null) {
    throw new Error('Invalid AbhiLife data: only missed habit events can store a reason.');
  }
  return true;
}

export function validateHabitDailyRecord(record) {
  validateTodayRecord(record);
  const ids = new Set();
  const habitIds = new Set();
  for (const event of record.habitEvents) {
    validateHabitEvent(event);
    if (ids.has(event.id)) throw new Error(`Invalid AbhiLife data: duplicate habit event id ${event.id}.`);
    if (habitIds.has(event.habitId)) throw new Error(`Invalid AbhiLife data: duplicate habit event for habit ${event.habitId}.`);
    ids.add(event.id);
    habitIds.add(event.habitId);
  }
  return true;
}

export async function loadHabitDayRecord(adapter, dateISO) {
  const path = recordPath(dateISO);
  if (!await adapter.exists(path)) return createDailyRecord(dateISO);
  return parseAndValidateJson(await adapter.readText(path), validateHabitDailyRecord);
}

async function saveHabitDayRecord(adapter, record) {
  record.updatedAt = nowISO();
  await safeWriteJson(adapter, recordPath(record.date), record, validateHabitDailyRecord);
  return record;
}

export async function syncHabitEventsForDate(adapter, dateISO) {
  const collection = await loadHabits(adapter);
  const record = await loadHabitDayRecord(adapter, dateISO);
  const existingHabitIds = new Set(record.habitEvents.map((event) => event.habitId));
  let created = 0;

  for (const habit of collection.items) {
    if (!habitIsDueOnDate(habit, dateISO) || existingHabitIds.has(habit.id)) continue;
    const now = nowISO();
    record.habitEvents.push({
      id: makeId('habit_event'),
      habitId: habit.id,
      title: habit.title,
      minimumAction: habit.minimumAction,
      preferredAction: habit.targetAction,
      state: 'planned',
      reason: null,
      note: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null
    });
    existingHabitIds.add(habit.id);
    created += 1;
  }

  if (created) await saveHabitDayRecord(adapter, record);
  return { record, created };
}

export async function recordHabitOutcome(adapter, dateISO, eventId, state, { reason = null, note = null } = {}) {
  if (!EXECUTION_STATES.includes(state)) throw new Error('Choose a valid habit result.');
  const record = await loadHabitDayRecord(adapter, dateISO);
  const event = record.habitEvents.find((item) => item.id === eventId);
  if (!event) throw new Error('Habit event was not found for this day.');

  if (state === 'missed') {
    if (!MISSED_REASONS.includes(reason)) throw new Error('Choose why this habit was missed.');
  } else {
    reason = null;
  }

  const now = nowISO();
  event.state = state;
  event.reason = reason;
  event.note = String(note ?? '').trim() || null;
  event.updatedAt = now;
  event.resolvedAt = now;
  await saveHabitDayRecord(adapter, record);
  return { record, event };
}
