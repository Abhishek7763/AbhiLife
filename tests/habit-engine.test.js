import test from 'node:test';
import assert from 'node:assert/strict';

import { createCollection, createDailyRecord } from '../src/data/schema.js';
import { DATA_PATHS, recordPath } from '../src/storage/paths.js';
import {
  archiveHabit,
  createHabitDefinition,
  editHabitDefinition,
  habitIsDueOnDate,
  loadHabitDayRecord,
  loadHabits,
  pauseHabit,
  recordHabitOutcome,
  restoreHabit,
  resumeHabit,
  syncHabitEventsForDate,
  validateHabitDailyRecord,
  validateHabitDefinition
} from '../src/habits/habits.js';

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

function emptyHabitAdapter() {
  return memoryAdapter({
    [DATA_PATHS.habits]: stringify(createCollection('habits', []))
  });
}

function habitInput(overrides = {}) {
  return {
    title: 'Evening walk',
    areaId: 'health',
    cue: 'After evening tea',
    context: 'At home with shoes near the door',
    minimumAction: 'Walk for 5 minutes',
    targetAction: 'Walk for 25 minutes',
    days: [1, 3, 5],
    ...overrides
  };
}

test('Habit definition stores cue, context, minimum, preferred version and weekday schedule', async () => {
  const adapter = emptyHabitAdapter();
  const habit = await createHabitDefinition(adapter, habitInput());
  assert.equal(habit.state, 'active');
  assert.equal(habit.kind, 'build');
  assert.equal(habit.minimumAction, 'Walk for 5 minutes');
  assert.equal(habit.targetAction, 'Walk for 25 minutes');
  assert.deepEqual(habit.schedule.days, [1, 3, 5]);
  assert.equal(validateHabitDefinition(habit), true);
  assert.equal('streak' in habit, false);

  const saved = await loadHabits(adapter);
  assert.equal(saved.items.length, 1);
});

test('Habit can be edited, paused, resumed, archived and restored without deleting its definition', async () => {
  const adapter = emptyHabitAdapter();
  const habit = await createHabitDefinition(adapter, habitInput());

  await editHabitDefinition(adapter, habit.id, habitInput({
    minimumAction: 'Put shoes on and walk for 2 minutes',
    targetAction: 'Walk for 30 minutes',
    days: [0, 6]
  }));
  let saved = (await loadHabits(adapter)).items[0];
  assert.equal(saved.minimumAction, 'Put shoes on and walk for 2 minutes');
  assert.deepEqual(saved.schedule.days, [0, 6]);

  await pauseHabit(adapter, habit.id);
  saved = (await loadHabits(adapter)).items[0];
  assert.equal(saved.state, 'paused');
  assert.ok(saved.pausedAt);

  await resumeHabit(adapter, habit.id);
  saved = (await loadHabits(adapter)).items[0];
  assert.equal(saved.state, 'active');
  assert.equal(saved.pausedAt, null);

  await archiveHabit(adapter, habit.id);
  saved = (await loadHabits(adapter)).items[0];
  assert.equal(saved.state, 'archived');
  assert.ok(saved.archivedAt);

  await restoreHabit(adapter, habit.id);
  saved = (await loadHabits(adapter)).items[0];
  assert.equal(saved.state, 'active');
  assert.equal(saved.archivedAt, null);
});

test('Habit schedule determines whether an active habit is due on a date', async () => {
  const adapter = emptyHabitAdapter();
  const habit = await createHabitDefinition(adapter, habitInput({ days: [5] }));
  assert.equal(habitIsDueOnDate(habit, '2026-08-28'), true);
  assert.equal(habitIsDueOnDate(habit, '2026-08-29'), false);

  await pauseHabit(adapter, habit.id);
  const paused = (await loadHabits(adapter)).items[0];
  assert.equal(habitIsDueOnDate(paused, '2026-08-28'), false);
});

test('sync adds scheduled active habits once and preserves existing Today task evidence', async () => {
  const adapter = emptyHabitAdapter();
  const due = await createHabitDefinition(adapter, habitInput({ title: 'Friday walk', days: [5] }));
  await createHabitDefinition(adapter, habitInput({ title: 'Monday reading', days: [1], areaId: 'learning', cue: 'After breakfast', context: 'At desk', minimumAction: 'Read one page', targetAction: 'Read 15 pages' }));

  const date = '2026-08-28';
  const record = createDailyRecord(date);
  record.taskEvents.push({
    id: 'exec_existing',
    goalId: 'goal_existing',
    sourcePlanTaskId: 'task_existing',
    title: 'Existing goal action',
    durationMinutes: 20,
    trigger: '',
    doneCondition: 'Finish it.',
    state: 'planned',
    reason: null,
    note: null,
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T01:00:00.000Z',
    resolvedAt: null
  });
  record.importantWinTaskId = 'exec_existing';
  adapter.files.set(recordPath(date), stringify(record));

  const first = await syncHabitEventsForDate(adapter, date);
  assert.equal(first.created, 1);
  assert.equal(first.record.habitEvents.length, 1);
  assert.equal(first.record.habitEvents[0].habitId, due.id);
  assert.equal(first.record.taskEvents.length, 1);

  const second = await syncHabitEventsForDate(adapter, date);
  assert.equal(second.created, 0);
  assert.equal(second.record.habitEvents.length, 1);
  assert.equal(validateHabitDailyRecord(second.record), true);
});

test('Habit result records Done, Partial, Missed or Intentionally Skipped without streak scoring', async () => {
  const adapter = emptyHabitAdapter();
  await createHabitDefinition(adapter, habitInput({ days: [5] }));
  const date = '2026-08-28';
  const synced = await syncHabitEventsForDate(adapter, date);
  const eventId = synced.record.habitEvents[0].id;

  let result = await recordHabitOutcome(adapter, date, eventId, 'partial', { note: 'Minimum version completed.' });
  assert.equal(result.event.state, 'partial');
  assert.equal(result.event.reason, null);

  result = await recordHabitOutcome(adapter, date, eventId, 'missed', { reason: 'low_energy' });
  assert.equal(result.event.state, 'missed');
  assert.equal(result.event.reason, 'low_energy');

  result = await recordHabitOutcome(adapter, date, eventId, 'skipped', { note: 'Intentional rest day.' });
  assert.equal(result.event.state, 'skipped');

  result = await recordHabitOutcome(adapter, date, eventId, 'done');
  assert.equal(result.event.state, 'done');
  assert.ok(result.event.resolvedAt);
  assert.equal('streak' in result.event, false);

  const saved = await loadHabitDayRecord(adapter, date);
  assert.equal(saved.habitEvents.length, 1);
});

test('Missed habit requires a known reason', async () => {
  const adapter = emptyHabitAdapter();
  await createHabitDefinition(adapter, habitInput({ days: [5] }));
  const date = '2026-08-28';
  const synced = await syncHabitEventsForDate(adapter, date);
  const eventId = synced.record.habitEvents[0].id;
  await assert.rejects(recordHabitOutcome(adapter, date, eventId, 'missed'), /Choose why/);
  await assert.rejects(recordHabitOutcome(adapter, date, eventId, 'missed', { reason: 'bad_luck' }), /Choose why/);
});
