import test from 'node:test';
import assert from 'node:assert/strict';

import { createCollection } from '../src/data/schema.js';
import { validateInboxCollection } from '../src/data/validate.js';
import {
  archiveInboxThought,
  captureInboxThought,
  editInboxThought,
  listInboxThoughts,
  restoreInboxThought
} from '../src/inbox/inbox.js';
import { DATA_PATHS } from '../src/storage/paths.js';

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
    async writeTextAtomic(path, data) {
      files.set(path, data);
    }
  };
}

function seededInbox() {
  return stringify(createCollection('inbox'));
}

test('capture writes a validated thought to the native inbox collection', async () => {
  const adapter = memoryAdapter({ [DATA_PATHS.inbox]: seededInbox() });
  const thought = await captureInboxThought(adapter, '  Improve my health  ');

  assert.equal(thought.text, 'Improve my health');
  const saved = JSON.parse(adapter.files.get(DATA_PATHS.inbox));
  assert.equal(validateInboxCollection(saved), true);
  assert.equal(saved.items.length, 1);
  assert.equal(saved.items[0].id, thought.id);
});

test('empty thoughts are rejected without changing the inbox', async () => {
  const original = seededInbox();
  const adapter = memoryAdapter({ [DATA_PATHS.inbox]: original });

  await assert.rejects(captureInboxThought(adapter, '   '), /Write something/);
  assert.equal(adapter.files.get(DATA_PATHS.inbox), original);
});

test('edit updates the same thought and preserves its identity', async () => {
  const adapter = memoryAdapter({ [DATA_PATHS.inbox]: seededInbox() });
  const captured = await captureInboxThought(adapter, 'Learn Python');
  const edited = await editInboxThought(adapter, captured.id, 'Learn JavaScript first');

  assert.equal(edited.id, captured.id);
  assert.equal(edited.text, 'Learn JavaScript first');
  const items = await listInboxThoughts(adapter);
  assert.equal(items[0].text, 'Learn JavaScript first');
});

test('archive hides a thought by default and restore brings it back', async () => {
  const adapter = memoryAdapter({ [DATA_PATHS.inbox]: seededInbox() });
  const captured = await captureInboxThought(adapter, 'Maybe learn guitar');

  await archiveInboxThought(adapter, captured.id);
  assert.equal((await listInboxThoughts(adapter)).length, 0);

  const all = await listInboxThoughts(adapter, { includeArchived: true });
  assert.equal(all.length, 1);
  assert.equal(all[0].state, 'archived');
  assert.ok(all[0].archivedAt);

  await restoreInboxThought(adapter, captured.id);
  const active = await listInboxThoughts(adapter);
  assert.equal(active.length, 1);
  assert.equal(active[0].state, 'inbox');
  assert.equal(active[0].archivedAt, null);
});

test('duplicate or invalid inbox items are rejected by the collection validator', () => {
  const collection = createCollection('inbox', [{
    schemaVersion: 1,
    id: 'thought_same',
    text: 'One',
    state: 'inbox',
    archivedAt: null,
    convertedToGoalId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }]);
  collection.items.push({ ...collection.items[0], text: 'Two' });
  assert.throws(() => validateInboxCollection(collection), /duplicate inbox thought id/);

  collection.items.pop();
  collection.items[0].state = 'unknown';
  assert.throws(() => validateInboxCollection(collection), /unknown inbox thought state/);
});
