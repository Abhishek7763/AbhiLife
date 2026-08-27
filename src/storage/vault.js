import {
  createCollection,
  createDefaultDepartments,
  createManifest,
  createSettings
} from '../data/schema.js';
import { validateManifest } from '../data/validate.js';
import { DATA_PATHS, REQUIRED_DIRECTORIES } from './paths.js';

function stringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function initializeNewVault(adapter) {
  if (!adapter) throw new Error('A storage adapter is required.');

  for (const directory of REQUIRED_DIRECTORIES) {
    await adapter.ensureDirectory(directory);
  }

  const manifest = createManifest();
  validateManifest(manifest);

  const initialFiles = [
    [DATA_PATHS.manifest, manifest],
    [DATA_PATHS.settings, createSettings()],
    [DATA_PATHS.inbox, createCollection('inbox')],
    [DATA_PATHS.departments, createDefaultDepartments()],
    [DATA_PATHS.goals, createCollection('goals')],
    [DATA_PATHS.habits, createCollection('habits')],
    [DATA_PATHS.maintenance, createCollection('maintenance')]
  ];

  for (const [path, value] of initialFiles) {
    const exists = await adapter.exists(path);
    if (exists) {
      throw new Error(`Refusing to initialize over existing AbhiLife data: ${path}`);
    }
  }

  for (const [path, value] of initialFiles) {
    await adapter.writeTextAtomic(path, stringify(value));
  }

  return manifest;
}

export async function verifyVault(adapter) {
  const issues = [];
  try {
    const raw = await adapter.readText(DATA_PATHS.manifest);
    const manifest = JSON.parse(raw);
    validateManifest(manifest);
  } catch (error) {
    issues.push({ path: DATA_PATHS.manifest, message: error.message });
  }

  return {
    healthy: issues.length === 0,
    issues
  };
}
