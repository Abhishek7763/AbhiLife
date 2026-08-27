import test from 'node:test';
import assert from 'node:assert/strict';

import { initializeNewVault, repairVault, snapshotVault, verifyVault } from '../src/storage/vault.js';
import { DATA_PATHS, REQUIRED_DIRECTORIES, recoverySnapshotPath } from '../src/storage/paths.js';

function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(seed));
  const directories = new Set();
  return {
    files,
    directories,
    async ensureDirectory(path) {
      directories.add(path);
    },
    async exists(path) {
      return files.has(path) || directories.has(path);
    },
    async readText(path) {
      if (!files.has(path)) throw new Error(`Missing ${path}`);
      return files.get(path);
    },
    async writeTextAtomic(path, data) {
      files.set(path, data);
      const parts = path.split('/');
      parts.pop();
      let current = '';
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        directories.add(current);
      }
    }
  };
}

test('new vault initializes required structure and recovery baseline', async () => {
  const adapter = memoryAdapter();
  const manifest = await initializeNewVault(adapter);

  assert.equal(manifest.format, 'abhilife-data');
  assert.equal(adapter.files.has(DATA_PATHS.manifest), true);
  assert.equal(adapter.files.has(DATA_PATHS.settings), true);
  assert.equal(adapter.files.has(DATA_PATHS.departments), true);
  for (const directory of REQUIRED_DIRECTORIES) {
    assert.equal(adapter.directories.has(directory), true);
  }
  assert.equal(adapter.files.has(recoverySnapshotPath(DATA_PATHS.manifest)), true);

  const health = await verifyVault(adapter);
  assert.equal(health.healthy, true);
  assert.equal(health.status, 'healthy');
  assert.equal(health.issues.length, 0);
});

test('vault initialization refuses to overwrite an existing manifest', async () => {
  const adapter = memoryAdapter({ [DATA_PATHS.manifest]: '{"existing":true}' });
  await assert.rejects(
    initializeNewVault(adapter),
    /Refusing to initialize over existing AbhiLife data/
  );
  assert.equal(adapter.files.get(DATA_PATHS.manifest), '{"existing":true}');
});

test('corrupt critical file is recoverable from last-known-good snapshot', async () => {
  const adapter = memoryAdapter();
  await initializeNewVault(adapter);
  adapter.files.set(DATA_PATHS.manifest, '{bad json');

  const health = await verifyVault(adapter);
  assert.equal(health.healthy, false);
  assert.equal(health.status, 'recoverable');
  assert.equal(health.recoverableCount, 1);

  const result = await repairVault(adapter);
  assert.equal(result.ok, true);
  assert.equal(result.after.healthy, true);
  assert.equal(adapter.files.has(`${DATA_PATHS.recoveryDir}/${DATA_PATHS.manifest}.corrupt`), true);
});

test('missing directory is critical and cannot be silently repaired', async () => {
  const adapter = memoryAdapter();
  await initializeNewVault(adapter);
  adapter.directories.delete('records');

  const health = await verifyVault(adapter);
  assert.equal(health.healthy, false);
  assert.equal(health.status, 'critical');
  assert.equal(health.issues.some((issue) => issue.path === 'records'), true);
});

test('snapshotVault refreshes validated critical snapshots', async () => {
  const adapter = memoryAdapter();
  await initializeNewVault(adapter);
  adapter.files.delete(recoverySnapshotPath(DATA_PATHS.settings));

  const result = await snapshotVault(adapter);
  assert.equal(result.ok, true);
  assert.equal(adapter.files.has(recoverySnapshotPath(DATA_PATHS.settings)), true);
});
