import test from 'node:test';
import assert from 'node:assert/strict';

import { createCollection, createDailyRecord, createDefinedGoal } from '../src/data/schema.js';
import { DATA_PATHS, recordPath } from '../src/storage/paths.js';
import { saveGoalBreakdown } from '../src/goals/goal-breakdown.js';
import {
  activateGoal,
  createDayRescuePlan,
  ensureGoalNextActionOnDate,
  loadTodayRecord
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

function unrelatedTodayEvent() {
  const at = '2026-08-28T01:00:00.000Z';
  return {
    id: 'exec_existing',
    goalId: 'goal_existing',
    sourcePlanTaskId: 'task_existing',
    title: 'Existing action already in Today',
    durationMinutes: 20,
    trigger: '',
    doneCondition: 'Finish the existing action.',
    state: 'planned',
    reason: null,
    note: null,
    createdAt: at,
    updatedAt: at,
    resolvedAt: null
  };
}

test('Day Rescue locks the remaining day but a deferred active-goal action can enter a fresh day', async () => {
  const goal = createDefinedGoal({
    title: 'Build a focused learning habit',
    areaId: 'learning',
    sourceThoughtId: `thought_${crypto.randomUUID()}`,
    why: 'Keep learning moving.',
    desiredOutcome: 'Study consistently.',
    successCriteria: 'Complete the planned learning blocks.',
    priority: 'high',
    availableMinutesPerWeek: 120
  });

  const adapter = memoryAdapter({
    [DATA_PATHS.goals]: stringify(createCollection('goals', [goal]))
  });

  await saveGoalBreakdown(adapter, goal.id, {
    strategy: 'Use one clear learning block at a time.',
    milestones: [{ id: 'm1', title: 'Start routine', successCondition: 'Complete the first week.' }],
    projects: [{ id: 'p1', milestoneId: 'm1', title: 'Study project', outcome: 'Routine exists.' }],
    weeklyActions: [{ id: 'w1', projectId: 'p1', title: 'Study three times', durationMinutes: 90 }],
    tasks: [{ id: 't1', weeklyActionId: 'w1', title: '30 minute study block', durationMinutes: 30, trigger: 'After breakfast', doneCondition: 'Study for 30 minutes.' }],
    nextActionTaskId: 't1'
  }, { markReady: true });

  await activateGoal(adapter, goal.id, '2026-08-27');

  const rescueDate = '2026-08-28';
  const record = createDailyRecord(rescueDate);
  record.taskEvents.push(unrelatedTodayEvent());
  record.importantWinTaskId = 'exec_existing';
  adapter.files.set(recordPath(rescueDate), stringify(record));
  await createDayRescuePlan(adapter, rescueDate);

  const deferred = await ensureGoalNextActionOnDate(adapter, goal.id, rescueDate);
  assert.equal(deferred.created, false);
  assert.equal(deferred.deferredByRescue, true);
  assert.equal(deferred.event, null);
  assert.equal((await loadTodayRecord(adapter, rescueDate)).taskEvents.length, 1);

  const fresh = await ensureGoalNextActionOnDate(adapter, goal.id, '2026-08-29');
  assert.equal(fresh.created, true);
  assert.equal(fresh.deferredByRescue, false);
  assert.equal(fresh.event.title, '30 minute study block');
});
