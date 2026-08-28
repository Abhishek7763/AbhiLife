import test from 'node:test';
import assert from 'node:assert/strict';

import { createDailyRecord } from '../src/data/schema.js';
import { recordPath } from '../src/storage/paths.js';
import {
  BAD_HABITS_PATH,
  addBadHabit,
  archiveBadHabit,
  editBadHabit,
  loadBadHabitDayRecord,
  loadBadHabits,
  logBadHabitEvent,
  pauseBadHabit,
  restoreBadHabit,
  resumeBadHabit,
  summarizeBadHabitDay,
  validateBadHabitDefinition
} from '../src/bad-habits/bad-habits.js';

function stringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(seed));
  return {
    files,
    async exists(path) { return files.has(path); },
    async readText(path) {
      if (!files.has(path)) throw new Error(`Missing ${path}`);
      return files.get(path);
    },
    async writeTextAtomic(path, data) { files.set(path, data); }
  };
}

function badHabitInput(overrides = {}) {
  return {
    title: 'Late-night scrolling',
    areaId: 'health',
    trigger: 'Bored after dinner',
    timePattern: '10:30 PM to midnight',
    placeContext: 'In bed with phone within reach',
    immediateReward: 'Fast entertainment and escape from boredom',
    longTermCost: 'Less sleep and poor next-day energy',
    removeCuePlan: 'Charge phone outside bedroom',
    frictionPlan: 'Log out of distracting apps after 10 PM',
    environmentPlan: 'Keep a book and alarm clock near bed',
    replacementBehavior: 'Read five pages instead',
    ...overrides
  };
}

test('Bad Habit definition keeps the full behavior loop separate from positive Habit Engine', async () => {
  const adapter = memoryAdapter();
  const item = await addBadHabit(adapter, badHabitInput());

  assert.equal(item.kind, 'reduce');
  assert.equal(item.state, 'active');
  assert.equal(item.trigger, 'Bored after dinner');
  assert.equal(item.immediateReward, 'Fast entertainment and escape from boredom');
  assert.equal(item.replacementBehavior, 'Read five pages instead');
  assert.equal(validateBadHabitDefinition(item), true);
  assert.equal('streak' in item, false);
  assert.equal(adapter.files.has(BAD_HABITS_PATH), true);
  assert.equal(adapter.files.has('habits/items.json'), false);
});

test('Bad Habit definition can be edited, paused, resumed, archived and restored without deleting history', async () => {
  const adapter = memoryAdapter();
  const item = await addBadHabit(adapter, badHabitInput());

  await editBadHabit(adapter, item.id, badHabitInput({ frictionPlan: 'Phone stays in another room after 10 PM' }));
  let saved = (await loadBadHabits(adapter)).items[0];
  assert.equal(saved.frictionPlan, 'Phone stays in another room after 10 PM');

  await pauseBadHabit(adapter, item.id);
  saved = (await loadBadHabits(adapter)).items[0];
  assert.equal(saved.state, 'paused');
  assert.ok(saved.pausedAt);

  await resumeBadHabit(adapter, item.id);
  saved = (await loadBadHabits(adapter)).items[0];
  assert.equal(saved.state, 'active');

  await archiveBadHabit(adapter, item.id);
  saved = (await loadBadHabits(adapter)).items[0];
  assert.equal(saved.state, 'archived');
  assert.ok(saved.archivedAt);

  await restoreBadHabit(adapter, item.id);
  saved = (await loadBadHabits(adapter)).items[0];
  assert.equal(saved.state, 'active');
  assert.equal(saved.archivedAt, null);
});

test('Multiple occurrences, interruptions and replacements can be logged on the same day', async () => {
  const adapter = memoryAdapter();
  const item = await addBadHabit(adapter, badHabitInput());
  const date = '2026-08-28';

  await logBadHabitEvent(adapter, date, item.id, 'occurred', { note: 'Scrolled for about 20 minutes.' });
  await logBadHabitEvent(adapter, date, item.id, 'interrupted', { trigger: 'Notification after lights out' });
  await logBadHabitEvent(adapter, date, item.id, 'replaced', { context: 'In bed', note: 'Read the replacement book.' });

  const record = await loadBadHabitDayRecord(adapter, date);
  assert.equal(record.badHabitEvents.length, 3);
  assert.deepEqual(summarizeBadHabitDay(record), { occurred: 1, interrupted: 1, replaced: 1, total: 3 });
  assert.equal(record.badHabitEvents[2].replacementBehavior, 'Read five pages instead');
  assert.equal('score' in record.badHabitEvents[0], false);
});

test('v0.13 daily record without badHabitEvents upgrades safely and preserves task and positive-habit evidence', async () => {
  const date = '2026-08-28';
  const oldRecord = createDailyRecord(date);
  delete oldRecord.badHabitEvents;
  oldRecord.taskEvents.push({
    id: 'exec_existing',
    goalId: 'goal_existing',
    sourcePlanTaskId: 'task_existing',
    title: 'Existing task',
    durationMinutes: 15,
    trigger: '',
    doneCondition: 'Finish existing task.',
    state: 'done',
    reason: null,
    note: null,
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T01:10:00.000Z',
    resolvedAt: '2026-08-28T01:10:00.000Z'
  });
  oldRecord.importantWinTaskId = 'exec_existing';
  oldRecord.habitEvents.push({
    id: 'habit_event_existing',
    habitId: 'habit_existing',
    title: 'Existing positive habit',
    minimumAction: 'One page',
    preferredAction: 'Ten pages',
    state: 'done',
    reason: null,
    note: null,
    createdAt: '2026-08-28T02:00:00.000Z',
    updatedAt: '2026-08-28T02:05:00.000Z',
    resolvedAt: '2026-08-28T02:05:00.000Z'
  });

  const adapter = memoryAdapter({ [recordPath(date)]: stringify(oldRecord) });
  const item = await addBadHabit(adapter, badHabitInput());
  await logBadHabitEvent(adapter, date, item.id, 'occurred');

  const upgraded = await loadBadHabitDayRecord(adapter, date);
  assert.equal(upgraded.taskEvents.length, 1);
  assert.equal(upgraded.habitEvents.length, 1);
  assert.equal(upgraded.badHabitEvents.length, 1);
  assert.equal(upgraded.taskEvents[0].id, 'exec_existing');
  assert.equal(upgraded.habitEvents[0].id, 'habit_event_existing');
});

test('Paused or archived bad habits cannot create new daily evidence', async () => {
  const adapter = memoryAdapter();
  const item = await addBadHabit(adapter, badHabitInput());
  await pauseBadHabit(adapter, item.id);
  await assert.rejects(logBadHabitEvent(adapter, '2026-08-28', item.id, 'occurred'), /Only an Active/);
  await resumeBadHabit(adapter, item.id);
  await archiveBadHabit(adapter, item.id);
  await assert.rejects(logBadHabitEvent(adapter, '2026-08-28', item.id, 'occurred'), /Only an Active/);
});

test('Invalid evidence type is rejected instead of inventing behavior scores', async () => {
  const adapter = memoryAdapter();
  const item = await addBadHabit(adapter, badHabitInput());
  await assert.rejects(logBadHabitEvent(adapter, '2026-08-28', item.id, 'failed'), /valid bad habit event type/);
});
