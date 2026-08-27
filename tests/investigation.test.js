import test from 'node:test';
import assert from 'node:assert/strict';

import { createCollection, createInboxThought } from '../src/data/schema.js';
import { validateInboxCollection } from '../src/data/validate.js';
import { DATA_PATHS } from '../src/storage/paths.js';
import {
  INVESTIGATION_QUESTIONS,
  finalizeGoalInvestigation,
  getInvestigationProgress,
  saveInvestigationAnswer,
  startGoalInvestigation
} from '../src/goals/investigation.js';

function stringify(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function memoryAdapter(thought) {
  const files = new Map([[DATA_PATHS.inbox, stringify(createCollection('inbox', [thought]))]]);
  return {
    files,
    async exists(path) { return files.has(path); },
    async readText(path) { if (!files.has(path)) throw new Error(`Missing ${path}`); return files.get(path); },
    async writeTextAtomic(path, data) { files.set(path, data); }
  };
}
async function answerAll(adapter, id) { for (const question of INVESTIGATION_QUESTIONS) await saveInvestigationAnswer(adapter, id, question.key, `Answer for ${question.key}`); }

test('starting investigation preserves the thought and creates a draft', async () => {
  const thought = createInboxThought('Learn a new skill');
  const adapter = memoryAdapter(thought);
  const result = await startGoalInvestigation(adapter, thought.id);
  assert.equal(result.state, 'investigating');
  assert.equal(result.investigation.status, 'draft');
  assert.equal(getInvestigationProgress(result).answered, 0);
  assert.equal(INVESTIGATION_QUESTIONS.length, 9);
});

test('answers are saved step-by-step and progress is measurable without a score', async () => {
  const thought = createInboxThought('Improve fitness');
  const adapter = memoryAdapter(thought);
  await startGoalInvestigation(adapter, thought.id);
  const result = await saveInvestigationAnswer(adapter, thought.id, 'why', 'More energy and better health');
  assert.equal(result.investigation.answers.why, 'More energy and better health');
  assert.equal(getInvestigationProgress(result).answered, 1);
  assert.equal(validateInboxCollection(JSON.parse(adapter.files.get(DATA_PATHS.inbox))), true);
});

test('real goal decision requires all reflection questions and moves thought to accepted', async () => {
  const thought = createInboxThought('Learn JavaScript');
  const adapter = memoryAdapter(thought);
  await startGoalInvestigation(adapter, thought.id);
  await assert.rejects(finalizeGoalInvestigation(adapter, thought.id, 'real_goal'), /Answer all investigation questions/);
  await answerAll(adapter, thought.id);
  const result = await finalizeGoalInvestigation(adapter, thought.id, 'real_goal');
  assert.equal(result.state, 'accepted');
  assert.equal(result.investigation.status, 'completed');
  assert.equal(result.investigation.decision, 'real_goal');
});

test('someday is a valid completed decision without creating an active goal', async () => {
  const thought = createInboxThought('Learn guitar');
  const adapter = memoryAdapter(thought);
  await startGoalInvestigation(adapter, thought.id);
  await answerAll(adapter, thought.id);
  const result = await finalizeGoalInvestigation(adapter, thought.id, 'someday');
  assert.equal(result.state, 'someday');
  assert.equal(result.convertedToGoalId, null);
});

test('think more keeps the investigation draft and preserves answers', async () => {
  const thought = createInboxThought('Start a business');
  const adapter = memoryAdapter(thought);
  await startGoalInvestigation(adapter, thought.id);
  await saveInvestigationAnswer(adapter, thought.id, 'origin', 'My own long-term interest');
  const result = await finalizeGoalInvestigation(adapter, thought.id, 'think_more');
  assert.equal(result.state, 'investigating');
  assert.equal(result.investigation.status, 'draft');
  assert.equal(result.investigation.answers.origin, 'My own long-term interest');
});

test('archive decision preserves the completed investigation record', async () => {
  const thought = createInboxThought('Buy something I do not need');
  const adapter = memoryAdapter(thought);
  await startGoalInvestigation(adapter, thought.id);
  await answerAll(adapter, thought.id);
  const result = await finalizeGoalInvestigation(adapter, thought.id, 'archive');
  assert.equal(result.state, 'archived');
  assert.equal(result.investigation.decision, 'archive');
  assert.ok(result.archivedAt);
});
