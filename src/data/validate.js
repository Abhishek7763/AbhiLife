import {
  DATA_SCHEMA_VERSION,
  GOAL_STATES,
  EXECUTION_STATES,
  INBOX_THOUGHT_STATES,
  INVESTIGATION_DECISIONS,
  INVESTIGATION_QUESTION_KEYS,
  INVESTIGATION_STATUSES
} from '../core/system.js';

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

export function validateSettings(value) {
  requireObject(value, 'settings');
  requireSchemaVersion(value.schemaVersion);
  if (value.collection !== 'settings') fail('expected collection settings.');
  requireString(value.updatedAt, 'settings.updatedAt');
  requireString(value.locale, 'settings.locale');
  if (!Number.isInteger(value.weekStartsOn) || value.weekStartsOn < 0 || value.weekStartsOn > 6) {
    fail('settings.weekStartsOn must be between 0 and 6.');
  }
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

export function validateGoalInvestigation(value) {
  requireObject(value, 'goal investigation');
  requireSchemaVersion(value.schemaVersion);
  if (!INVESTIGATION_STATUSES.includes(value.status)) {
    fail(`unknown investigation status ${String(value.status)}.`);
  }
  requireObject(value.answers, 'goal investigation answers');
  for (const key of INVESTIGATION_QUESTION_KEYS) {
    requireString(value.answers[key], `goal investigation answer ${key}`, { allowEmpty: true });
  }
  for (const key of Object.keys(value.answers)) {
    if (!INVESTIGATION_QUESTION_KEYS.includes(key)) fail(`unknown investigation answer key ${key}.`);
  }
  if (value.decision !== null && !INVESTIGATION_DECISIONS.includes(value.decision)) {
    fail(`unknown investigation decision ${String(value.decision)}.`);
  }
  requireString(value.startedAt, 'goal investigation startedAt');
  requireString(value.updatedAt, 'goal investigation updatedAt');
  if (value.completedAt !== null) requireString(value.completedAt, 'goal investigation completedAt');
  if (value.status === 'completed' && !value.decision) fail('completed investigation requires a decision.');
  return true;
}

export function validateInboxThought(value) {
  requireObject(value, 'inbox thought');
  requireSchemaVersion(value.schemaVersion);
  requireString(value.id, 'inbox thought id');
  requireString(value.text, 'inbox thought text');
  if (!INBOX_THOUGHT_STATES.includes(value.state)) {
    fail(`unknown inbox thought state ${String(value.state)}.`);
  }
  if (value.investigation !== null && value.investigation !== undefined) {
    validateGoalInvestigation(value.investigation);
  }
  if (value.preArchiveState !== null && value.preArchiveState !== undefined) {
    requireString(value.preArchiveState, 'inbox thought preArchiveState');
    if (!INBOX_THOUGHT_STATES.includes(value.preArchiveState) || value.preArchiveState === 'archived') {
      fail(`invalid inbox thought preArchiveState ${String(value.preArchiveState)}.`);
    }
  }
  requireString(value.createdAt, 'inbox thought createdAt');
  requireString(value.updatedAt, 'inbox thought updatedAt');
  if (value.archivedAt !== null && value.archivedAt !== undefined) {
    requireString(value.archivedAt, 'inbox thought archivedAt');
  }
  if (value.convertedToGoalId !== null && value.convertedToGoalId !== undefined) {
    requireString(value.convertedToGoalId, 'inbox thought convertedToGoalId');
  }
  if (value.state === 'accepted' && value.investigation?.decision !== 'real_goal') {
    fail('accepted thought requires a completed real_goal investigation decision.');
  }
  if (value.state === 'someday' && value.investigation?.decision !== 'someday') {
    fail('someday thought requires a completed someday investigation decision.');
  }
  return true;
}

export function validateInboxCollection(value) {
  validateCollection(value, 'inbox');
  const ids = new Set();
  for (const thought of value.items) {
    validateInboxThought(thought);
    if (ids.has(thought.id)) fail(`duplicate inbox thought id ${thought.id}.`);
    ids.add(thought.id);
  }
  return true;
}

export function validateGoal(value) {
  requireObject(value, 'goal');
  requireSchemaVersion(value.schemaVersion);
  requireString(value.id, 'goal id');
  requireString(value.title, 'goal title');
  if (!GOAL_STATES.includes(value.state)) fail(`unknown goal state ${String(value.state)}.`);
  if (value.areaId !== null) requireString(value.areaId, 'goal areaId');
  if (value.sourceThoughtId !== null && value.sourceThoughtId !== undefined) {
    requireString(value.sourceThoughtId, 'goal sourceThoughtId');
  }
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
