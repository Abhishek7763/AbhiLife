import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCollection,
  createDailyRecord,
  createGoal,
  createInboxThought,
  createManifest,
  createTask
} from '../src/data/schema.js';
import {
  validateCollection,
  validateDailyRecord,
  validateGoal,
  validateInboxThought,
  validateManifest,
  validateTask
} from '../src/data/validate.js';
import { planPath, recordPath, monthlyReviewPath, weeklyReviewPath } from '../src/storage/paths.js';


test('manifest factory creates a valid portable vault manifest', () => {
  const manifest = createManifest();
  assert.equal(validateManifest(manifest), true);
  assert.equal(manifest.format, 'abhilife-data');
  assert.match(manifest.vaultId, /^vault_/);
});

test('core collection and entity factories validate', () => {
  assert.equal(validateCollection(createCollection('inbox'), 'inbox'), true);
  assert.equal(validateInboxThought(createInboxThought('Learn something useful')), true);
  assert.equal(validateGoal(createGoal({ title: 'Improve fitness', areaId: 'health' })), true);
  assert.equal(validateTask(createTask({ title: 'Walk for 20 minutes', areaId: 'health' })), true);
  assert.equal(validateDailyRecord(createDailyRecord('2026-08-27')), true);
});

test('daily records map to one portable file per day', () => {
  assert.equal(recordPath('2026-08-27'), 'records/2026/08/27.json');
  assert.equal(monthlyReviewPath(2026, 8), 'reviews/monthly/2026/08.json');
  assert.equal(weeklyReviewPath(2026, 35), 'reviews/weekly/2026/W35.json');
});

test('unsafe ids cannot escape the AbhiLife root', () => {
  assert.throws(() => planPath('../outside'), /Invalid goal id/);
  assert.throws(() => recordPath('27-08-2026'), /YYYY-MM-DD/);
});

test('unsupported schema versions are rejected', () => {
  const manifest = createManifest();
  manifest.schemaVersion = 999;
  assert.throws(() => validateManifest(manifest), /unsupported schemaVersion/);
});
