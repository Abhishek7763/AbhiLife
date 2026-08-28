import test from 'node:test';
import assert from 'node:assert/strict';

import { createCollection, createDailyRecord } from '../src/data/schema.js';
import { DATA_PATHS, recordPath } from '../src/storage/paths.js';
import {
  addMaintenance,
  archiveMaintenance,
  editMaintenance,
  loadMaintenance,
  loadMaintenanceDayRecord,
  maintenanceIsDueOnDate,
  pauseMaintenance,
  recordMaintenanceOutcome,
  restoreMaintenance,
  resumeMaintenance,
  syncMaintenanceEventsForDate,
  validateMaintenanceCollection,
  validateMaintenanceDailyRecord,
  validateMaintenanceDefinition
} from '../src/maintenance/maintenance.js';

function stringify(value) { return `${JSON.stringify(value, null, 2)}\n`; }

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(seed));
  return {
    files,
    async exists(path) { return files.has(path); },
    async readText(path) { if (!files.has(path)) throw new Error(`Missing ${path}`); return files.get(path); },
    async writeTextAtomic(path, data) { files.set(path, data); }
  };
}

function emptyAdapter() {
  return memoryAdapter({ [DATA_PATHS.maintenance]: stringify(createCollection('maintenance', [])) });
}

function input(overrides = {}) {
  return {
    title: 'Sleep wind-down',
    category: 'sleep',
    areaId: 'health',
    purpose: 'Protect basic sleep readiness and next-day functioning.',
    minimumCondition: 'Screens away and lights dimmed before bed.',
    days: [0, 1, 2, 3, 4, 5, 6],
    ...overrides
  };
}

test('Maintenance definition stores category, purpose, minimum condition and schedule without scores', async () => {
  const adapter = emptyAdapter();
  const item = await addMaintenance(adapter, input({ days: [1, 3, 5] }));
  assert.equal(item.state, 'active');
  assert.equal(item.category, 'sleep');
  assert.equal(item.minimumCondition, 'Screens away and lights dimmed before bed.');
  assert.deepEqual(item.schedule.days, [1, 3, 5]);
  assert.equal(validateMaintenanceDefinition(item), true);
  assert.equal('streak' in item, false);
  assert.equal('score' in item, false);
  const saved = await loadMaintenance(adapter);
  assert.equal(saved.items.length, 1);
  assert.equal(validateMaintenanceCollection(saved), true);
});

test('Maintenance can be edited, paused, resumed, archived and restored without deleting its definition', async () => {
  const adapter = emptyAdapter();
  const item = await addMaintenance(adapter, input());
  await editMaintenance(adapter, item.id, input({ minimumCondition: 'In bed with phone outside reach.', days: [0, 6] }));
  let saved = (await loadMaintenance(adapter)).items[0];
  assert.equal(saved.minimumCondition, 'In bed with phone outside reach.');
  assert.deepEqual(saved.schedule.days, [0, 6]);
  await pauseMaintenance(adapter, item.id);
  saved = (await loadMaintenance(adapter)).items[0];
  assert.equal(saved.state, 'paused');
  await resumeMaintenance(adapter, item.id);
  saved = (await loadMaintenance(adapter)).items[0];
  assert.equal(saved.state, 'active');
  await archiveMaintenance(adapter, item.id);
  saved = (await loadMaintenance(adapter)).items[0];
  assert.equal(saved.state, 'archived');
  await restoreMaintenance(adapter, item.id);
  saved = (await loadMaintenance(adapter)).items[0];
  assert.equal(saved.state, 'active');
});

test('Maintenance schedule controls whether an active item is due', async () => {
  const adapter = emptyAdapter();
  const item = await addMaintenance(adapter, input({ days: [5] }));
  assert.equal(maintenanceIsDueOnDate(item, '2026-08-28'), true);
  assert.equal(maintenanceIsDueOnDate(item, '2026-08-29'), false);
  await pauseMaintenance(adapter, item.id);
  const paused = (await loadMaintenance(adapter)).items[0];
  assert.equal(maintenanceIsDueOnDate(paused, '2026-08-28'), false);
});

test('sync adds due maintenance once and preserves task, habit and bad-habit evidence', async () => {
  const adapter = emptyAdapter();
  const due = await addMaintenance(adapter, input({ days: [5] }));
  await addMaintenance(adapter, input({ title: 'Monday finance check', category: 'finance', areaId: 'finance', purpose: 'Keep bills visible.', minimumCondition: 'Check upcoming required payments.', days: [1] }));
  const date = '2026-08-28';
  const record = createDailyRecord(date);
  record.taskEvents.push({ id: 'exec_existing', goalId: 'goal_existing', sourcePlanTaskId: 'task_existing', title: 'Existing task', durationMinutes: 20, trigger: '', doneCondition: 'Finish it.', state: 'planned', reason: null, note: null, createdAt: '2026-08-28T01:00:00.000Z', updatedAt: '2026-08-28T01:00:00.000Z', resolvedAt: null });
  record.habitEvents.push({ id: 'habit_event_existing', habitId: 'habit_existing', title: 'Existing habit', minimumAction: 'One page', preferredAction: 'Ten pages', state: 'done', reason: null, note: null, createdAt: '2026-08-28T01:00:00.000Z', updatedAt: '2026-08-28T01:05:00.000Z', resolvedAt: '2026-08-28T01:05:00.000Z' });
  record.badHabitEvents = [{ id: 'bad_event_existing', badHabitId: 'bad_existing', title: 'Phone scrolling', eventType: 'interrupted', trigger: 'Boredom', context: 'Desk', replacementBehavior: 'Stand and drink water', note: null, loggedAt: '2026-08-28T01:10:00.000Z', createdAt: '2026-08-28T01:10:00.000Z' }];
  adapter.files.set(recordPath(date), stringify(record));

  const first = await syncMaintenanceEventsForDate(adapter, date);
  assert.equal(first.created, 1);
  assert.equal(first.record.maintenanceEvents.length, 1);
  assert.equal(first.record.maintenanceEvents[0].maintenanceId, due.id);
  assert.equal(first.record.taskEvents.length, 1);
  assert.equal(first.record.habitEvents.length, 1);
  assert.equal(first.record.badHabitEvents.length, 1);

  const second = await syncMaintenanceEventsForDate(adapter, date);
  assert.equal(second.created, 0);
  assert.equal(second.record.maintenanceEvents.length, 1);
  assert.equal(validateMaintenanceDailyRecord(second.record), true);
});

test('Maintenance outcome records Done, Partial, Missed or Intentionally Skipped and missed needs a reason', async () => {
  const adapter = emptyAdapter();
  await addMaintenance(adapter, input({ days: [5] }));
  const date = '2026-08-28';
  const eventId = (await syncMaintenanceEventsForDate(adapter, date)).record.maintenanceEvents[0].id;

  let result = await recordMaintenanceOutcome(adapter, date, eventId, 'partial', { note: 'Minimum condition partly met.' });
  assert.equal(result.event.state, 'partial');
  await assert.rejects(recordMaintenanceOutcome(adapter, date, eventId, 'missed'), /Choose why/);
  result = await recordMaintenanceOutcome(adapter, date, eventId, 'missed', { reason: 'unexpected_work' });
  assert.equal(result.event.reason, 'unexpected_work');
  result = await recordMaintenanceOutcome(adapter, date, eventId, 'skipped', { note: 'Intentional exception.' });
  assert.equal(result.event.state, 'skipped');
  result = await recordMaintenanceOutcome(adapter, date, eventId, 'done');
  assert.equal(result.event.state, 'done');
  assert.equal('streak' in result.event, false);
  assert.equal((await loadMaintenanceDayRecord(adapter, date)).maintenanceEvents.length, 1);
});

test('Medication category is stored only as a user-authored routine, with no medication or dose recommendation fields', async () => {
  const adapter = emptyAdapter();
  const item = await addMaintenance(adapter, input({ title: 'Existing medication routine', category: 'medication', purpose: 'Track the routine already decided with my clinician.', minimumCondition: 'Follow my existing prescribed routine.' }));
  assert.equal(item.category, 'medication');
  assert.equal('dose' in item, false);
  assert.equal('medicineRecommendation' in item, false);
});
