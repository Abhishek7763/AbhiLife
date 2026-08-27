import test from 'node:test';
import assert from 'node:assert/strict';

import { initializeNewVault, verifyVault } from '../src/storage/vault.js';
import { DATA_PATHS, REQUIRED_DIRECTORIES } from '../src/storage/paths.js';

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(seed));
  const directories = new Set();
  return {
    files,
    directories,
    async ensureDirectory(path) { directories.add(path); },
    async exists(path) { return files.has(path); },
    async readText(path) {
      if (!files.has(path)) throw new Error(`Missing ${path}`);
      return files.get(path);
    },
    async writeTextAtomic(path, data) { files.set(path, data); }
  };
}

test('new vault initializes required portable structure', async () => {
  const adapter = memoryAdapter();
  const manifest = await initializeNewVault(adapter);

  assert.equal(manifest.format, 'abhilife-data');
  assert.equal(adapter.files.has(DATA_PATHS.manifest), true);
  assert.equal(adapter.files.has(DATA_PATHS.settings), true);
  assert.equal(adapter.files.has(DATA_PATHS.departments), true);
  for (const directory of REQUIRED_DIRECTORIES) {
    assert.equal(adapter.directories.has(directory), true);
  }

  const health = await verifyVault(adapter);
  assert.deepEqual(health, { healthy: true, issues: [] });
});

test('vault initialization refuses to overwrite an existing manifest', async () => {
  const adapter = memoryAdapter({ [DATA_PATHS.manifest]: '{"existing":true}' });
  await assert.rejects(
    initializeNewVault(adapter),
    /Refusing to initialize over existing AbhiLife data/
  );
  assert.equal(adapter.files.get(DATA_PATHS.manifest), '{"existing":true}');
});

test('health check reports invalid or unreadable manifest', async () => {
  const adapter = memoryAdapter({ [DATA_PATHS.manifest]: '{bad json' });
  const health = await verifyVault(adapter);
  assert.equal(health.healthy, false);
  assert.equal(health.issues.length, 1);
  assert.equal(health.issues[0].path, DATA_PATHS.manifest);
});
