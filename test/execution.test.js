import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_SCHEMA_VERSION } from '../src/core/system.js';
import { DATA_PATHS, planPath, recordPath } from '../src/storage/paths.js';
import { activateGoal, addPlanTaskToDay, loadDailyRecord, recordTaskOutcome, setImportantWin } from '../src/execution/execution.js';

class MemoryAdapter {
  constructor(files = {}) { this.files = new Map(Object.entries(files)); }
  async exists(path) { return this.files.has(path); }
  async readText(path) { if (!this.files.has(path)) throw new Error(`missing ${path}`); return this.files.get(path); }
  async writeTextAtomic(path, text) { this.files.set(path, text); }
}

function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function fixture() {
  const now = '2026-08-27T12:00:00.000Z';
  const goal = {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: 'goal_demo', title: 'Build fitness', areaId: 'health', sourceThoughtId: null,
    state: 'defined', why: 'Energy', desiredOutcome: 'Consistent exercise', successCriteria: 'Exercise weekly',
    priority: 'high', targetDate: null, constraints: [], availableMinutesPerWeek: 180,
    createdAt: now, updatedAt: now, completedAt: null, droppedAt: null
  };
  const goals = { schemaVersion: DATA_SCHEMA_VERSION, collection: 'goals', updatedAt: now, items: [goal] };
  const plan = {
    schemaVersion: DATA_SCHEMA_VERSION, goalId: goal.id, state: 'ready', strategy: 'Walk consistently',
    milestones: [{ id: 'm1', title: 'First month', successCondition: 'Four weeks', order: 0 }],
    projects: [{ id: 'p1', milestoneId: 'm1', title: 'Walking', outcome: 'Routine', order: 0 }],
    weeklyActions: [{ id: 'w1', projectId: 'p1', title: 'Walk four times', durationMinutes: 100, order: 0 }],
    tasks: [
      { id: 't1', weeklyActionId: 'w1', title: '25 minute walk', durationMinutes: 25, trigger: 'After tea', doneCondition: 'Walk 25 minutes', order: 0 },
      { id: 't2', weeklyActionId: 'w1', title: 'Second walk', durationMinutes: 25, trigger: '', doneCondition: 'Walk 25 minutes', order: 1 }
    ],
    nextActionTaskId: 't1', createdAt: now, updatedAt: now, readyAt: now
  };
  return new MemoryAdapter({ [DATA_PATHS.goals]: json(goals), [planPath(goal.id)]: json(plan) });
}

test('ready goal activates and its plan task becomes Today evidence', async () => {
  const adapter = fixture();
  const goal = await activateGoal(adapter, 'goal_demo');
  assert.equal(goal.state, 'active');

  const added = await addPlanTaskToDay(adapter, 'goal_demo', 't1', '2026-08-27');
  assert.equal(added.created, true);
  assert.equal(added.record.taskEvents.length, 1);
  assert.equal(added.record.importantWinTaskId, added.event.id);
  assert.equal(await adapter.exists(recordPath('2026-08-27')), true);

  const duplicate = await addPlanTaskToDay(adapter, 'goal_demo', 't1', '2026-08-27');
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.record.taskEvents.length, 1);
});

test('Today outcome records Done, Partial, Missed or Skipped without deleting the day', async () => {
  const adapter = fixture();
  await activateGoal(adapter, 'goal_demo');
  const first = await addPlanTaskToDay(adapter, 'goal_demo', 't1', '2026-08-27');
  const second = await addPlanTaskToDay(adapter, 'goal_demo', 't2', '2026-08-27');
  await setImportantWin(adapter, second.event.id, '2026-08-27');
  await recordTaskOutcome(adapter, first.event.id, 'missed', { missedReason: 'low_energy' }, '2026-08-27');
  await recordTaskOutcome(adapter, second.event.id, 'done', {}, '2026-08-27');
  const record = await loadDailyRecord(adapter, '2026-08-27');
  assert.equal(record.importantWinTaskId, second.event.id);
  assert.equal(record.taskEvents.find((item) => item.id === first.event.id).missedReason, 'low_energy');
  assert.equal(record.taskEvents.find((item) => item.id === second.event.id).state, 'done');
  assert.equal(record.taskEvents.length, 2);
});

test('defined goal without Ready plan cannot activate', async () => {
  const adapter = fixture();
  const plan = JSON.parse(await adapter.readText(planPath('goal_demo')));
  plan.state = 'draft';
  plan.readyAt = null;
  await adapter.writeTextAtomic(planPath('goal_demo'), json(plan));
  await assert.rejects(() => activateGoal(adapter, 'goal_demo'), /mark it Ready/);
});
