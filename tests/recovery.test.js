import test from 'node:test';
import assert from 'node:assert/strict';

import { createCollection } from '../src/data/schema.js';
import { validateCollection } from '../src/data/validate.js';
import { recoverySnapshotPath } from '../src/storage/paths.js';
import { safeWriteJson, snapshotLastKnownGood } from '../src/storage/recovery.js';

const validateInbox = (value) => validateCollection(value, 'inbox');

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(seed));
  return {
    files,
    async exists(path) {
      return files.has(path);
    },
    async readText(path) {
      if (!files.has(path)) throw new Error(`Missing ${path}`);
      return files.get(path);
    },
    async writeTextAtomic(path, data) {
      files.set(path, data);
    }
  };
}

test('safeWriteJson keeps previous valid version as last-known-good', async () => {
  const oldValue = createCollection('inbox', [{ id: 'old' }]);
  const adapter = memoryAdapter({
    'inbox/items.json': `${JSON.stringify(oldValue)}\n`
  });
  const next = createCollection('inbox', [{ id: 'new' }]);

  const result = await safeWriteJson(adapter, 'inbox/items.json', next, validateInbox);
  assert.equal(result.snapshotCreated, true);

  const savedSnapshot = JSON.parse(adapter.files.get(recoverySnapshotPath('inbox/items.json')));
  assert.equal(savedSnapshot.items[0].id, 'old');
});

test('snapshot refuses invalid source data', async () => {
  const adapter = memoryAdapter({ 'inbox/items.json': '{bad json' });
  await assert.rejects(
    snapshotLastKnownGood(adapter, 'inbox/items.json', validateInbox),
    /not valid JSON/
  );
  assert.equal(adapter.files.has(recoverySnapshotPath('inbox/items.json')), false);
});

test('safeWriteJson restores snapshot when post-write verification fails', async () => {
  const oldValue = createCollection('inbox', [{ id: 'old' }]);
  const files = new Map([
    ['inbox/items.json', `${JSON.stringify(oldValue)}\n`]
  ]);
  let targetWrites = 0;
  const adapter = {
    files,
    async exists(path) {
      return files.has(path);
    },
    async readText(path) {
      return files.get(path);
    },
    async writeTextAtomic(path, data) {
      if (path === 'inbox/items.json') {
        targetWrites += 1;
        files.set(path, targetWrites === 1 ? '{broken' : data);
      } else {
        files.set(path, data);
      }
    }
  };

  const next = createCollection('inbox', [{ id: 'new' }]);
  await assert.rejects(safeWriteJson(adapter, 'inbox/items.json', next, validateInbox));

  const restored = JSON.parse(files.get('inbox/items.json'));
  assert.equal(restored.items[0].id, 'old');
});
