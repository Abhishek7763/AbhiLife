import { parseAndValidateJson } from '../data/validate.js';
import { recoveryCorruptPath, recoverySnapshotPath } from './paths.js';

function stringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readValidated(adapter, path, validator) {
  const raw = await adapter.readText(path);
  const value = parseAndValidateJson(raw, validator);
  return { raw, value };
}

export async function inspectJsonFile(adapter, path, validator) {
  const snapshotPath = recoverySnapshotPath(path);
  const main = { exists: false, valid: false, error: null };
  const recovery = { path: snapshotPath, exists: false, valid: false, error: null };

  try {
    main.exists = await adapter.exists(path);
    if (main.exists) {
      await readValidated(adapter, path, validator);
      main.valid = true;
    }
  } catch (error) {
    main.error = error.message;
  }

  try {
    recovery.exists = await adapter.exists(snapshotPath);
    if (recovery.exists) {
      await readValidated(adapter, snapshotPath, validator);
      recovery.valid = true;
    }
  } catch (error) {
    recovery.error = error.message;
  }

  return { path, main, recovery, recoverable: !main.valid && recovery.valid };
}

export async function snapshotLastKnownGood(adapter, path, validator) {
  const snapshotPath = recoverySnapshotPath(path);
  if (!await adapter.exists(path)) {
    return { created: false, path, snapshotPath, reason: 'source-missing' };
  }

  const { raw } = await readValidated(adapter, path, validator);
  await adapter.writeTextAtomic(snapshotPath, raw);
  await readValidated(adapter, snapshotPath, validator);
  return { created: true, path, snapshotPath };
}

export async function restoreLastKnownGood(adapter, path, validator, { preserveCorrupt = true } = {}) {
  const snapshotPath = recoverySnapshotPath(path);
  if (!await adapter.exists(snapshotPath)) {
    throw new Error(`No recovery snapshot exists for ${path}.`);
  }

  const { raw: snapshotRaw } = await readValidated(adapter, snapshotPath, validator);

  if (preserveCorrupt && await adapter.exists(path)) {
    try {
      const currentRaw = await adapter.readText(path);
      try {
        parseAndValidateJson(currentRaw, validator);
      } catch {
        await adapter.writeTextAtomic(recoveryCorruptPath(path), currentRaw);
      }
    } catch {
      // If the damaged source cannot be read, continue with the validated recovery copy.
    }
  }

  await adapter.writeTextAtomic(path, snapshotRaw);
  await readValidated(adapter, path, validator);
  return { restored: true, path, snapshotPath };
}

export async function safeWriteJson(adapter, path, value, validator) {
  validator(value);
  let snapshotCreated = false;

  if (await adapter.exists(path)) {
    const snapshot = await snapshotLastKnownGood(adapter, path, validator);
    snapshotCreated = snapshot.created;
  }

  try {
    await adapter.writeTextAtomic(path, stringify(value));
    await readValidated(adapter, path, validator);
    return { written: true, path, snapshotCreated };
  } catch (error) {
    if (snapshotCreated) {
      try {
        await restoreLastKnownGood(adapter, path, validator, { preserveCorrupt: true });
      } catch (restoreError) {
        throw new Error(`${error.message} Recovery also failed: ${restoreError.message}`);
      }
    }
    throw error;
  }
}
