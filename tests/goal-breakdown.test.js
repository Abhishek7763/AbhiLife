import test from 'node:test';
import assert from 'node:assert/strict';

import { createCollection, createDefinedGoal } from '../src/data/schema.js';
import { DATA_PATHS, planPath } from '../src/storage/paths.js';
import {
  getPlanSummary,
  listGoalBreakdownCandidates,
  loadGoalPlan,
  saveGoalBreakdown,
  validateGoalPlan
} from '../src/goals/goal-breakdown.js';

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

function definedGoal(title = 'Build sustainable fitness') {
  return createDefinedGoal({
    title,
    areaId: 'health',
    sourceThoughtId: `thought_${crypto.randomUUID()}`,
    why: 'Better energy and long-term health.',
    desiredOutcome: 'Exercise consistently.',
    successCriteria: 'Complete a sustainable routine for 12 weeks.',
    priority: 'high',
    constraints: ['Limited evenings'],
    availableMinutesPerWeek: 180
  });
}

function adapterWithGoals(goals) {
  return memoryAdapter({
    [DATA_PATHS.goals]: stringify(createCollection('goals', goals))
  });
}

function completeInput() {
  return {
    strategy: 'Build consistency with a small repeatable weekly training structure.',
    milestones: [
      { id: 'milestone_1', title: 'Establish baseline routine', successCondition: 'Complete four consistent weeks.' }
    ],
    projects: [
      { id: 'project_1', milestoneId: 'milestone_1', title: 'Walking routine', outcome: 'A repeatable walking schedule exists.' }
    ],
    weeklyActions: [
      { id: 'weekly_1', projectId: 'project_1', title: 'Walk four times this week', durationMinutes: 100 }
    ],
    tasks: [
      { id: 'task_1', weeklyActionId: 'weekly_1', title: 'Tuesday evening walk', durationMinutes: 25, trigger: 'After evening tea', doneCondition: 'Walk for 25 minutes.' }
    ],
    nextActionTaskId: 'task_1'
  };
}

test('defined goals appear as breakdown candidates before a plan exists', async () => {
  const goal = definedGoal();
  const adapter = adapterWithGoals([goal]);
  const candidates = await listGoalBreakdownCandidates(adapter);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].goal.id, goal.id);
  assert.equal(candidates[0].plan, null);
});

test('a draft breakdown is stored in the goal-specific plan file', async () => {
  const goal = definedGoal();
  const adapter = adapterWithGoals([goal]);
  const plan = await saveGoalBreakdown(adapter, goal.id, { strategy: 'Explore a workable approach.' });

  assert.equal(plan.state, 'draft');
  assert.equal(adapter.files.has(planPath(goal.id)), true);
  assert.equal(validateGoalPlan(plan), true);
  assert.deepEqual(getPlanSummary(plan), {
    state: 'draft', milestones: 0, projects: 0, weeklyActions: 0, tasks: 0, hasNextAction: false
  });
});

test('Ready requires the full linked action chain and a Next Action', async () => {
  const goal = definedGoal();
  const adapter = adapterWithGoals([goal]);

  await assert.rejects(
    saveGoalBreakdown(adapter, goal.id, { strategy: 'A strategy only.' }, { markReady: true }),
    /milestone/
  );

  const input = completeInput();
  const ready = await saveGoalBreakdown(adapter, goal.id, input, { markReady: true });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.nextActionTaskId, 'task_1');
  assert.ok(ready.readyAt);
  assert.equal(validateGoalPlan(ready), true);
});

test('parent references are validated instead of allowing orphan actions', async () => {
  const goal = definedGoal();
  const adapter = adapterWithGoals([goal]);
  const input = completeInput();
  input.projects[0].milestoneId = 'missing_milestone';
  await assert.rejects(saveGoalBreakdown(adapter, goal.id, input), /unknown milestone/);
});

test('Ready plan cannot choose a Next Action outside its task list', async () => {
  const goal = definedGoal();
  const adapter = adapterWithGoals([goal]);
  const input = completeInput();
  input.nextActionTaskId = 'task_elsewhere';
  await assert.rejects(saveGoalBreakdown(adapter, goal.id, input, { markReady: true }), /Next Action/);
});

test('plans for separate goals remain isolated files', async () => {
  const first = definedGoal('Fitness goal');
  const second = definedGoal('Career goal');
  second.areaId = 'career';
  const adapter = adapterWithGoals([first, second]);

  await saveGoalBreakdown(adapter, first.id, completeInput(), { markReady: true });
  await saveGoalBreakdown(adapter, second.id, { strategy: 'Build career skills gradually.' });

  const firstPlan = await loadGoalPlan(adapter, first.id);
  const secondPlan = await loadGoalPlan(adapter, second.id);
  assert.equal(firstPlan.state, 'ready');
  assert.equal(secondPlan.state, 'draft');
  assert.notEqual(planPath(first.id), planPath(second.id));
});

test('non-defined goals cannot bypass the definition stage', async () => {
  const goal = definedGoal();
  goal.state = 'active';
  const adapter = adapterWithGoals([goal]);
  await assert.rejects(saveGoalBreakdown(adapter, goal.id, completeInput()), /Only a Defined goal/);
});
