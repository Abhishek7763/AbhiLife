import { DATA_SCHEMA_VERSION, GOAL_STATES, EXECUTION_STATES } from '../core/system.js';

function fail(message) {
  throw new Error(`Invalid AbhiLife data: ${message}`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, name) {
  if (!isPlainObject(value)) fail(`${name} must be an object.`);
}

function requireString(value, name, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    fail(`${name} must be ${allowEmpty ? 'a string' : 'a non-empty string'}.`);
  }
}

function requireSchemaVersion(value) {
  if (value !== DATA_SCHEMA_VERSION) {
    fail(`unsupported schemaVersion ${String(value)}; expected ${DATA_SCHEMA_VERSION}.`);
  }
}

function requireIsoDate(value, name = 'date') {
  requireString(value, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${name} must use YYYY-MM-DD.`);
}

export function validateManifest(value) {
  requireObject(value, 'manifest');
  requireSchemaVersion(value.schemaVersion);
  requireString(value.format, 'manifest.format');
  if (value.format !== 'abhilife-data') fail('manifest.format must be abhilife-data.');
  requireString(value.vaultId, 'manifest.vaultId');
  requireString(value.product, 'manifest.product');
  requireString(value.createdAt, 'manifest.createdAt');
  requireString(value.updatedAt, 'manifest.updatedAt');
  return true;
}

export function validateCollection(value, expectedCollection) {
  requireObject(value, `${expectedCollection} collection`);
  requireSchemaVersion(value.schemaVersion);
  if (value.collection !== expectedCollection) fail(`expected collection ${expectedCollection}.`);
  if (!Array.isArray(value.items)) fail(`${expectedCollection}.items must be an array.`);
  requireString(value.updatedAt, `${expectedCollection}.updatedAt`);
  return true;
}

export function validateInboxThought(value) {
  requireObject(value, 'inbox thought');
  requireSchemaVersion(value.schemaVersion);
  requireString(value.id, 'inbox thought id');
  requireString(value.text, 'inbox thought text');
  requireString(value.state, 'inbox thought state');
  return true;
}

export function validateGoal(value) {
  requireObject(value, 'goal');
  requireSchemaVersion(value.schemaVersion);
  requireString(value.id, 'goal id');
  requireString(value.title, 'goal title');
  if (!GOAL_STATES.includes(value.state)) fail(`unknown goal state ${String(value.state)}.`);
  if (value.areaId !== null) requireString(value.areaId, 'goal areaId');
  return true;
}

export function validateTask(value) {
  requireObject(value, 'task');
  requireSchemaVersion(value.schemaVersion);
  requireString(value.id, 'task id');
  requireString(value.title, 'task title');
  if (!EXECUTION_STATES.includes(value.state) && value.state !== 'planned') {
    fail(`unknown task state ${String(value.state)}.`);
  }
  return true;
}

export function validateDailyRecord(value) {
  requireObject(value, 'daily record');
  requireSchemaVersion(value.schemaVersion);
  requireIsoDate(value.date, 'daily record date');
  if (!Array.isArray(value.taskEvents)) fail('daily record taskEvents must be an array.');
  if (!Array.isArray(value.habitEvents)) fail('daily record habitEvents must be an array.');
  if (!Array.isArray(value.maintenanceEvents)) fail('daily record maintenanceEvents must be an array.');
  return true;
}

export function parseAndValidateJson(text, validator) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('file is not valid JSON.');
  }
  validator(value);
  return value;
}
