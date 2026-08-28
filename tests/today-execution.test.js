import test from 'node:test';
import assert from 'node:assert/strict';

import { createCollection, createDailyRecord, createDefinedGoal } from '../src/data/schema.js';
import { DATA_PATHS, recordPath } from '../src/storage/paths.js';
import { saveGoalBreakdown } from '../src/goals/goal-breakdown.js';
import { loadGoals } from '../src/goals/goal-definition.js';
import {
  activateGoal,
  chooseDayRescueTasks,
  createDayRescuePlan,
  ensureGoalNextActionOnDate,
  getMissedReasonGuidance,
  loadTodayRecord,
  recordTaskOutcome,
  setDayRescuePreparationState,
  setImportantWin,
  validateTodayRecord
} from '../src/execution/today.js';

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

function goal() {
  return createDefinedGoal({
    title: 'Build sustainable fitness',
    areaId: 'health',
    sourceThoughtId: `thought_${crypto.randomUUID()}`,
    why: 'Better energy.',
    desiredOutcome: 'Exercise consistently.',
    successCriteria: 'Maintain routine for 12 weeks.',
    priority: 'high',
    constraints: ['Limited evenings'],
    availableMinutesPerWeek: 180
  });
}

function completePlan() {
  return {
    strategy: 'Build a repeatable weekly movement routine.',
    milestones: [
      { id: 'milestone_1', title: 'Baseline routine', successCondition: 'Complete four consistent weeks.' }
    ],
    projects: [
      { id: 'project_1', milestoneId: 'milestone_1', title: 'Walking routine', outcome: 'A repeatable walking schedule exists.' }
    ],
    weeklyActions: [
      { id: 'weekly_1', projectId: 'project_1', title: 'Walk four times', durationMinutes: 100 }
    ],
    tasks: [
      { id: 'task_1', weeklyActionId: 'weekly_1', title: '25 minute evening walk', durationMinutes: 25, trigger: 'After evening tea', doneCondition: 'Walk for 25 minutes.' }
    ],
    nextActionTaskId: 'task_1'
  };
}

function todayEvent(id, title, durationMinutes, createdAt) {
  return {
    id,
    goalId: `goal_${id}`,
    sourcePlanTaskId: `task_${id}`,
    title,
    durationMinutes,
    trigger: '',
    doneCondition: `Finish ${title}.`,
    state: 'planned',
    reason: null,
    note: null,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null
  };
}

function rescueFixture() {
  const date = '2026-08-28';
  const record = createDailyRecord(date);
  record.taskEvents = [
    todayEvent('exec_long', 'Long secondary action', 45, '2026-08-28T01:00:00.000Z'),
    todayEvent('exec_win', 'Important remaining action', 30, '2026-08-28T01:01:00.000Z'),
    todayEvent('exec_short', 'Small useful action', 10, '2026-08-28T01:02:00.000Z'),
    todayEvent('exec_medium', 'Medium action', 20, '2026-08-28T01:03:00.000Z')
  ];
  record.importantWinTaskId = 'exec_win';
  return {
    date,
    adapter: memoryAdapter({ [recordPath(date)]: stringify(record) })
  };
}

async function readyFixture() {
  const item = goal();
  const adapter = memoryAdapter({
    [DATA_PATHS.goals]: stringify(createCollection('goals', [item]))
  });
  await saveGoalBreakdown(adapter, item.id, completePlan(), { markReady: true });
  return { adapter, item };
}

test('Ready defined goal activates and sends its Next Action to Today', async () => {
  const { adapter, item } = await readyFixture();
  const result = await activateGoal(adapter, item.id, '2026-08-27');
  assert.equal(result.activated, true);
  assert.equal(result.created, true);
  assert.equal(result.event.title, '25 minute evening walk');
  assert.equal(result.event.state, 'planned');

  const goals = await loadGoals(adapter);
  assert.equal(goals.items[0].state, 'active');
  assert.ok(goals.items[0].activatedAt);

  const today = await loadTodayRecord(adapter, '2026-08-27');
  assert.equal(today.taskEvents.length, 1);
  assert.equal(today.importantWinTaskId, today.taskEvents[0].id);
  assert.equal(validateTodayRecord(today), true);
  assert.equal(adapter.files.has(recordPath('2026-08-27')), true);
});

test('activation and Today sync are idempotent for the same goal task and date', async () => {
  const { adapter, item } = await readyFixture();
  await activateGoal(adapter, item.id, '2026-08-27');
  const second = await activateGoal(adapter, item.id, '2026-08-27');
  assert.equal(second.activated, false);
  assert.equal(second.created, false);
  const today = await loadTodayRecord(adapter, '2026-08-27');
  assert.equal(today.taskEvents.length, 1);
});

test('active goal can repair a missing Today action without duplicating it', async () => {
  const { adapter, item } = await readyFixture();
  await activateGoal(adapter, item.id, '2026-08-27');
  adapter.files.delete(recordPath('2026-08-28'));
  const synced = await ensureGoalNextActionOnDate(adapter, item.id, '2026-08-28');
  assert.equal(synced.created, true);
  const again = await ensureGoalNextActionOnDate(adapter, item.id, '2026-08-28');
  assert.equal(again.created, false);
});

test('execution result stores Done, Partial, Missed or Intentionally Skipped without a life score', async () => {
  const { adapter, item } = await readyFixture();
  const activation = await activateGoal(adapter, item.id, '2026-08-27');
  const eventId = activation.event.id;

  let result = await recordTaskOutcome(adapter, '2026-08-27', eventId, 'partial', { note: 'Completed 15 minutes.' });
  assert.equal(result.event.state, 'partial');
  assert.equal(result.event.reason, null);

  result = await recordTaskOutcome(adapter, '2026-08-27', eventId, 'missed', { reason: 'low_energy' });
  assert.equal(result.event.state, 'missed');
  assert.equal(result.event.reason, 'low_energy');

  result = await recordTaskOutcome(adapter, '2026-08-27', eventId, 'skipped', { note: 'Intentional recovery day.' });
  assert.equal(result.event.state, 'skipped');

  result = await recordTaskOutcome(adapter, '2026-08-27', eventId, 'done');
  assert.equal(result.event.state, 'done');
  assert.ok(result.event.resolvedAt);
});

test('missed execution requires a known reason', async () => {
  const { adapter, item } = await readyFixture();
  const activation = await activateGoal(adapter, item.id, '2026-08-27');
  await assert.rejects(
    recordTaskOutcome(adapter, '2026-08-27', activation.event.id, 'missed'),
    /Choose why/
  );
  await assert.rejects(
    recordTaskOutcome(adapter, '2026-08-27', activation.event.id, 'missed', { reason: 'bad_luck' }),
    /Choose why/
  );
});

test('goal cannot activate until its breakdown is Ready', async () => {
  const item = goal();
  const adapter = memoryAdapter({ [DATA_PATHS.goals]: stringify(createCollection('goals', [item])) });
  await saveGoalBreakdown(adapter, item.id, { strategy: 'Draft only.' });
  await assert.rejects(activateGoal(adapter, item.id, '2026-08-27'), /Breakdown Ready/);
});

test('important win can be changed only to another task in the same daily record', async () => {
  const { adapter, item } = await readyFixture();
  const activation = await activateGoal(adapter, item.id, '2026-08-27');
  const record = await setImportantWin(adapter, '2026-08-27', activation.event.id);
  assert.equal(record.importantWinTaskId, activation.event.id);
  await assert.rejects(setImportantWin(adapter, '2026-08-27', 'missing_event'), /not found/);
});

test('Day Rescue protects the pending Important Win plus one shortest useful action', async () => {
  const { adapter, date } = rescueFixture();
  const before = await loadTodayRecord(adapter, date);
  assert.deepEqual(chooseDayRescueTasks(before).map((item) => item.id), ['exec_win', 'exec_short']);

  const result = await createDayRescuePlan(adapter, date);
  assert.equal(result.created, true);
  assert.deepEqual(result.plan.selectedTaskIds, ['exec_win', 'exec_short']);
  assert.deepEqual(result.plan.releasedTaskIds.sort(), ['exec_long', 'exec_medium']);
  assert.equal(result.plan.preparation.title, 'Prepare tomorrow');
  assert.equal(result.plan.preparation.durationMinutes, 5);
  assert.equal(result.plan.preparation.state, 'planned');

  const saved = await loadTodayRecord(adapter, date);
  assert.equal(saved.importantWinTaskId, 'exec_win');
  assert.equal(saved.taskEvents.find((item) => item.id === 'exec_long').state, 'skipped');
  assert.match(saved.taskEvents.find((item) => item.id === 'exec_long').note, /not failure/i);
  assert.equal(saved.taskEvents.find((item) => item.id === 'exec_medium').state, 'skipped');
  assert.equal(validateTodayRecord(saved), true);
});

test('Day Rescue is one stable plan per day and does not release more tasks on repeat tap', async () => {
  const { adapter, date } = rescueFixture();
  const first = await createDayRescuePlan(adapter, date);
  const second = await createDayRescuePlan(adapter, date);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.plan.id, first.plan.id);
  assert.deepEqual(second.plan.selectedTaskIds, first.plan.selectedTaskIds);
  assert.deepEqual(second.plan.releasedTaskIds, first.plan.releasedTaskIds);
});

test('Day Rescue completes only after protected actions and tomorrow preparation are resolved', async () => {
  const { adapter, date } = rescueFixture();
  const rescue = await createDayRescuePlan(adapter, date);
  const [importantId, secondId] = rescue.plan.selectedTaskIds;

  let result = await recordTaskOutcome(adapter, date, importantId, 'done');
  assert.equal(result.record.rescuePlan.status, 'active');
  result = await recordTaskOutcome(adapter, date, secondId, 'partial', { note: 'Useful progress was enough for today.' });
  assert.equal(result.record.rescuePlan.status, 'active');

  const prep = await setDayRescuePreparationState(adapter, date, 'done');
  assert.equal(prep.plan.status, 'completed');
  assert.ok(prep.plan.completedAt);

  const saved = await loadTodayRecord(adapter, date);
  assert.equal(saved.rescuePlan.status, 'completed');
  assert.equal(validateTodayRecord(saved), true);
});

test('Day Rescue refuses to invent work when there is no pending Today action', async () => {
  const date = '2026-08-28';
  const record = createDailyRecord(date);
  const event = todayEvent('exec_done', 'Already finished', 15, '2026-08-28T01:00:00.000Z');
  event.state = 'done';
  event.resolvedAt = '2026-08-28T01:20:00.000Z';
  record.taskEvents.push(event);
  record.importantWinTaskId = event.id;
  const adapter = memoryAdapter({ [recordPath(date)]: stringify(record) });
  await assert.rejects(createDayRescuePlan(adapter, date), /no pending/i);
});

test('missed-task guidance turns common failure reasons into deterministic next adjustments', () => {
  assert.match(getMissedReasonGuidance('too_large'), /Split it/i);
  assert.match(getMissedReasonGuidance('low_energy'), /higher-energy time/i);
  assert.match(getMissedReasonGuidance('not_important_now'), /active focus/i);
  assert.equal(getMissedReasonGuidance('unknown_reason'), '');
});
