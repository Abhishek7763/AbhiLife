import {
  APP_VERSION,
  DATA_FORMAT,
  DATA_SCHEMA_VERSION,
  DEFAULT_LIFE_AREAS,
  INVESTIGATION_QUESTION_KEYS
} from '../core/system.js';

function nowISO() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createManifest() {
  const now = nowISO();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    format: DATA_FORMAT,
    product: 'AbhiLife',
    vaultId: makeId('vault'),
    createdWithAppVersion: APP_VERSION,
    createdAt: now,
    updatedAt: now
  };
}

export function createSettings() {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    collection: 'settings',
    updatedAt: nowISO(),
    locale: 'en-IN',
    weekStartsOn: 1,
    theme: 'system',
    dailyReviewEnabled: true,
    weeklyReviewEnabled: true
  };
}

export function createCollection(collection, items = []) {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    collection,
    updatedAt: nowISO(),
    items
  };
}

export function createDefaultDepartments() {
  return createCollection('departments', DEFAULT_LIFE_AREAS.map((area) => ({
    schemaVersion: DATA_SCHEMA_VERSION,
    id: area.id,
    name: area.name,
    order: area.order,
    state: 'not_assessed',
    archivedAt: null,
    createdAt: nowISO(),
    updatedAt: nowISO()
  })));
}

export function createGoalInvestigation() {
  const now = nowISO();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    status: 'draft',
    answers: Object.fromEntries(INVESTIGATION_QUESTION_KEYS.map((key) => [key, ''])),
    decision: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null
  };
}

export function createInboxThought(text) {
  const now = nowISO();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: makeId('thought'),
    text: String(text ?? '').trim(),
    state: 'inbox',
    investigation: null,
    preArchiveState: null,
    archivedAt: null,
    convertedToGoalId: null,
    createdAt: now,
    updatedAt: now
  };
}

export function createGoal({ title, areaId = null, sourceThoughtId = null } = {}) {
  const now = nowISO();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: makeId('goal'),
    title: String(title ?? '').trim(),
    areaId,
    sourceThoughtId,
    state: 'investigating',
    why: '',
    desiredOutcome: '',
    successCriteria: '',
    priority: null,
    targetDate: null,
    constraints: [],
    availableMinutesPerWeek: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    droppedAt: null
  };
}

export function createTask({ title, goalId = null, areaId = null } = {}) {
  const now = nowISO();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: makeId('task'),
    title: String(title ?? '').trim(),
    goalId,
    areaId,
    milestoneId: null,
    why: '',
    scheduledDate: null,
    scheduledTime: null,
    durationMinutes: null,
    trigger: '',
    doneCondition: '',
    energy: null,
    priority: null,
    state: 'planned',
    missedReason: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
}

export function createHabit({ title, areaId = null, kind = 'build' } = {}) {
  const now = nowISO();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: makeId('habit'),
    title: String(title ?? '').trim(),
    areaId,
    kind,
    state: 'active',
    cue: '',
    context: '',
    minimumAction: '',
    targetAction: '',
    replacementBehavior: '',
    createdAt: now,
    updatedAt: now
  };
}

export function createDailyRecord(dateISO) {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    date: dateISO,
    importantWinTaskId: null,
    taskEvents: [],
    habitEvents: [],
    maintenanceEvents: [],
    notes: '',
    dayReview: null,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };
}

export function createReview({ type, periodStart, periodEnd }) {
  const now = nowISO();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: makeId('review'),
    type,
    periodStart,
    periodEnd,
    wins: [],
    difficulties: [],
    repeatedMisses: [],
    neglectedAreas: [],
    goalDecisions: [],
    nextFocus: '',
    notes: '',
    createdAt: now,
    updatedAt: now
  };
}

export function createNote({ text = '', type = 'thought' } = {}) {
  const now = nowISO();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: makeId('note'),
    type,
    text: text.trim(),
    createdAt: now,
    updatedAt: now,
    convertedToGoalId: null
  };
}
