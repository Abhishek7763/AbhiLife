import {
  createCollection,
  createDefaultDepartments,
  createManifest,
  createSettings
} from '../data/schema.js';
import { validateCollection, validateManifest, validateSettings } from '../data/validate.js';
import { DATA_PATHS, REQUIRED_DIRECTORIES } from './paths.js';
import {
  inspectJsonFile,
  restoreLastKnownGood,
  safeWriteJson,
  snapshotLastKnownGood
} from './recovery.js';

const collectionValidator = (name) => (value) => validateCollection(value, name);

export const CRITICAL_DATA_FILES = Object.freeze([
  Object.freeze({ path: DATA_PATHS.manifest, validator: validateManifest }),
  Object.freeze({ path: DATA_PATHS.settings, validator: validateSettings }),
  Object.freeze({ path: DATA_PATHS.inbox, validator: collectionValidator('inbox') }),
  Object.freeze({ path: DATA_PATHS.departments, validator: collectionValidator('departments') }),
  Object.freeze({ path: DATA_PATHS.goals, validator: collectionValidator('goals') }),
  Object.freeze({ path: DATA_PATHS.habits, validator: collectionValidator('habits') }),
  Object.freeze({ path: DATA_PATHS.maintenance, validator: collectionValidator('maintenance') })
]);

function initialData() {
  return [
    [DATA_PATHS.manifest, createManifest(), validateManifest],
    [DATA_PATHS.settings, createSettings(), validateSettings],
    [DATA_PATHS.inbox, createCollection('inbox'), collectionValidator('inbox')],
    [DATA_PATHS.departments, createDefaultDepartments(), collectionValidator('departments')],
    [DATA_PATHS.goals, createCollection('goals'), collectionValidator('goals')],
    [DATA_PATHS.habits, createCollection('habits'), collectionValidator('habits')],
    [DATA_PATHS.maintenance, createCollection('maintenance'), collectionValidator('maintenance')]
  ];
}

export async function snapshotVault(adapter) {
  const snapshots = [];
  const skipped = [];
  const errors = [];

  for (const descriptor of CRITICAL_DATA_FILES) {
    try {
      const result = await snapshotLastKnownGood(adapter, descriptor.path, descriptor.validator);
      if (result.created) snapshots.push(result);
      else skipped.push(result);
    } catch (error) {
      errors.push({ path: descriptor.path, message: error.message });
    }
  }

  return { ok: errors.length === 0, snapshots, skipped, errors };
}

export async function initializeNewVault(adapter) {
  if (!adapter) throw new Error('A storage adapter is required.');

  for (const directory of REQUIRED_DIRECTORIES) {
    await adapter.ensureDirectory(directory);
  }

  const files = initialData();
  for (const [path] of files) {
    if (await adapter.exists(path)) {
      throw new Error(`Refusing to initialize over existing AbhiLife data: ${path}`);
    }
  }

  for (const [path, value, validator] of files) {
    await safeWriteJson(adapter, path, value, validator);
  }

  const baseline = await snapshotVault(adapter);
  if (!baseline.ok) {
    throw new Error(`Vault created, but recovery baseline failed: ${baseline.errors[0].message}`);
  }

  return files[0][1];
}

export async function verifyVault(adapter) {
  const issues = [];
  const warnings = [];

  for (const directory of REQUIRED_DIRECTORIES) {
    try {
      if (!await adapter.exists(directory)) {
        issues.push({
          path: directory,
          type: 'missing-directory',
          message: `Required directory is missing: ${directory}`,
          recoverable: false
        });
      }
    } catch (error) {
      issues.push({
        path: directory,
        type: 'directory-check-failed',
        message: error.message,
        recoverable: false
      });
    }
  }

  for (const descriptor of CRITICAL_DATA_FILES) {
    const inspection = await inspectJsonFile(adapter, descriptor.path, descriptor.validator);
    if (!inspection.main.valid) {
      issues.push({
        path: descriptor.path,
        type: inspection.main.exists ? 'invalid-file' : 'missing-file',
        message: inspection.main.error ?? `Required file is missing: ${descriptor.path}`,
        recoverable: inspection.recoverable,
        recoveryPath: inspection.recoverable ? inspection.recovery.path : null
      });
    } else if (inspection.recovery.exists && !inspection.recovery.valid) {
      warnings.push({
        path: inspection.recovery.path,
        type: 'invalid-recovery-snapshot',
        message: inspection.recovery.error
      });
    }
  }

  const recoverableCount = issues.filter((issue) => issue.recoverable).length;
  return {
    healthy: issues.length === 0,
    status: issues.length === 0
      ? 'healthy'
      : recoverableCount === issues.length ? 'recoverable' : 'critical',
    issues,
    warnings,
    recoverableCount
  };
}

export async function repairVault(adapter) {
  const before = await verifyVault(adapter);
  const repaired = [];
  const failed = [];

  for (const issue of before.issues.filter((item) => item.recoverable)) {
    const descriptor = CRITICAL_DATA_FILES.find((item) => item.path === issue.path);
    if (!descriptor) continue;
    try {
      repaired.push(await restoreLastKnownGood(adapter, descriptor.path, descriptor.validator));
    } catch (error) {
      failed.push({ path: issue.path, message: error.message });
    }
  }

  const after = await verifyVault(adapter);
  return { ok: failed.length === 0 && after.healthy, repaired, failed, before, after };
}

export async function diagnoseVaultConnection(adapter) {
  if (!adapter?.getRootStatus) {
    throw new Error('Storage adapter does not expose root diagnostics.');
  }

  const root = await adapter.getRootStatus();
  if (!root.connected) {
    return { connected: false, initialized: false, root, health: null };
  }

  const initialized = await adapter.exists(DATA_PATHS.manifest);
  if (!initialized) {
    return { connected: true, initialized: false, root, health: null };
  }

  return { connected: true, initialized: true, root, health: await verifyVault(adapter) };
}
