import test from 'node:test';
import assert from 'node:assert/strict';

import { createCollection, createGoalInvestigation, createInboxThought } from '../src/data/schema.js';
import { validateGoalsCollection, validateInboxCollection } from '../src/data/validate.js';
import { DATA_PATHS } from '../src/storage/paths.js';
import {
  getGoalDefinitionCandidates,
  listDefinedGoals,
  saveGoalDefinition
} from '../src/goals/goal-definition.js';

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

function acceptedThought(text = 'Improve my health') {
  const thought = createInboxThought(text);
  const investigation = createGoalInvestigation();
  for (const key of Object.keys(investigation.answers)) investigation.answers[key] = `Answer for ${key}`;
  investigation.status = 'completed';
  investigation.decision = 'real_goal';
  investigation.completedAt = new Date().toISOString();
  thought.state = 'accepted';
  thought.investigation = investigation;
  return thought;
}

function adapterWithAcceptedThought() {
  const thought = acceptedThought();
  return {
    thought,
    adapter: memoryAdapter({
      [DATA_PATHS.inbox]: stringify(createCollection('inbox', [thought])),
      [DATA_PATHS.goals]: stringify(createCollection('goals'))
    })
  };
}

const definition = {
  title: 'Build sustainable fitness',
  areaId: 'health',
  why: 'I want better energy and long-term health.',
  desiredOutcome: 'Exercise consistently and improve fitness.',
  successCriteria: 'Complete the agreed routine for 12 weeks and review the outcome.',
  priority: 'high',
  targetDate: '',
  constraints: 'Limited evening time\nTravel some weeks',
  availableMinutesPerWeek: 180
};

test('accepted Real Goal thoughts appear as definition candidates', async () => {
  const { adapter, thought } = adapterWithAcceptedThought();
  const items = await getGoalDefinitionCandidates(adapter);
  assert.equal(items.length, 1);
  assert.equal(items[0].thought.id, thought.id);
  assert.equal(items[0].goal, null);
});

test('definition creates a validated defined goal and links the source thought', async () => {
  const { adapter, thought } = adapterWithAcceptedThought();
  const result = await saveGoalDefinition(adapter, thought.id, definition);

  assert.equal(result.created, true);
  assert.equal(result.goal.state, 'defined');
  assert.equal(result.goal.sourceThoughtId, thought.id);
  assert.equal(result.goal.availableMinutesPerWeek, 180);
  assert.deepEqual(result.goal.constraints, ['Limited evening time', 'Travel some weeks']);

  const goals = JSON.parse(adapter.files.get(DATA_PATHS.goals));
  const inbox = JSON.parse(adapter.files.get(DATA_PATHS.inbox));
  assert.equal(validateGoalsCollection(goals), true);
  assert.equal(validateInboxCollection(inbox), true);
  assert.equal(inbox.items[0].convertedToGoalId, result.goal.id);
});

test('saving the same source again updates instead of creating a duplicate goal', async () => {
  const { adapter, thought } = adapterWithAcceptedThought();
  const first = await saveGoalDefinition(adapter, thought.id, definition);
  const second = await saveGoalDefinition(adapter, thought.id, {
    ...definition,
    title: 'Sustainable health routine',
    priority: 'medium'
  });

  assert.equal(second.created, false);
  assert.equal(second.goal.id, first.goal.id);
  const goals = await listDefinedGoals(adapter);
  assert.equal(goals.length, 1);
  assert.equal(goals[0].title, 'Sustainable health routine');
  assert.equal(goals[0].priority, 'medium');
});

test('goal definition rejects missing clarity fields and invalid weekly time', async () => {
  const { adapter, thought } = adapterWithAcceptedThought();
  await assert.rejects(
    saveGoalDefinition(adapter, thought.id, { ...definition, successCriteria: '' }),
    /Success condition is required/
  );
  await assert.rejects(
    saveGoalDefinition(adapter, thought.id, { ...definition, availableMinutesPerWeek: 0 }),
    /weekly time/
  );
});

test('a raw or undecided thought cannot bypass Goal Investigation', async () => {
  const raw = createInboxThought('Random thought');
  const adapter = memoryAdapter({
    [DATA_PATHS.inbox]: stringify(createCollection('inbox', [raw])),
    [DATA_PATHS.goals]: stringify(createCollection('goals'))
  });
  await assert.rejects(saveGoalDefinition(adapter, raw.id, definition), /not been accepted as a Real Goal/);
});
