import { EXECUTION_STATES, MISSED_REASONS } from '../core/system.js';
import { createDailyRecord } from '../data/schema.js';
import { parseAndValidateJson, validateDailyRecord, validateGoalsCollection } from '../data/validate.js';
import { loadGoals } from '../goals/goal-definition.js';
import { loadGoalPlan } from '../goals/goal-breakdown.js';
import { DATA_PATHS, recordPath } from '../storage/paths.js';
import { safeWriteJson } from '../storage/recovery.js';

export const TODAY_TASK_STATES = Object.freeze(['planned', ...EXECUTION_STATES]);
export const DAY_RESCUE_STATES = Object.freeze(['active', 'completed']);
export const DAY_RESCUE_PREP_STATES = Object.freeze(['planned', 'done', 'skipped']);

export const MISSED_REASON_GUIDANCE = Object.freeze({
  forgot: 'Attach the action to a visible cue or trigger next time.',
  no_time: 'Reduce the scope or reserve a smaller time block next time.',
  low_energy: 'Move it to a higher-energy time or use a smaller version.',
  too_difficult: 'Break it into an easier first physical step.',
  too_large: 'Split it. The next action was too large for one attempt.',
  unclear: 'Rewrite the next physical action before retrying.',
  distraction: 'Reduce the distraction cue or add friction before the next attempt.',
  unexpected_work: 'Replan capacity. Treat the interruption as data, not failure.',
  not_important_now: 'Reconsider whether the goal still deserves active focus.',
  other: 'Add a short note so this pattern can be reviewed later.'
});

function nowISO() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function requireString(value, label, { empty = false } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim())) {
    throw new Error(`Invalid AbhiLife data: ${label} must be ${empty ? 'a string' : 'a non-empty string'}.`);
  }
}

function requireOptionalString(value, label) {
  if (value !== null && value !== undefined) requireString(value, label);
}

function requireStringArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`Invalid AbhiLife data: ${label} must be an array.`);
  const seen = new Set();
  for (const item of value) {
    requireString(item, `${label} item`);
    if (seen.has(item)) throw new Error(`Invalid AbhiLife data: ${label} contains duplicate id ${item}.`);
    seen.add(item);
  }
}

export function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMissedReasonGuidance(reason) {
  return MISSED_REASON_GUIDANCE[reason] ?? '';
}

export function validateTodayTaskEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Invalid AbhiLife data: today task event must be an object.');
  }
  for (const [key, label] of [
    ['id', 'today task event id'],
    ['goalId', 'today task event goalId'],
    ['sourcePlanTaskId', 'today task event sourcePlanTaskId'],
    ['title', 'today task event title'],
    ['doneCondition', 'today task event doneCondition'],
    ['createdAt', 'today task event createdAt'],
    ['updatedAt', 'today task event updatedAt']
  ]) requireString(event[key], label);
  requireString(event.trigger ?? '', 'today task event trigger', { empty: true });
  if (!Number.isInteger(event.durationMinutes) || event.durationMinutes <= 0) {
    throw new Error('Invalid AbhiLife data: today task event durationMinutes must be positive.');
  }
  if (!TODAY_TASK_STATES.includes(event.state)) {
    throw new Error(`Invalid AbhiLife data: unknown today task state ${String(event.state)}.`);
  }
  requireOptionalString(event.reason, 'today task event reason');
  requireOptionalString(event.note, 'today task event note');
  requireOptionalString(event.resolvedAt, 'today task event resolvedAt');
  if (event.state === 'missed' && !MISSED_REASONS.includes(event.reason)) {
    throw new Error('Invalid AbhiLife data: missed today task requires a known reason.');
  }
  if (event.state !== 'missed' && event.reason !== null) {
    throw new Error('Invalid AbhiLife data: only missed today tasks can store missedReason.');
  }
  return true;
}

export function validateDayRescuePlan(plan, record) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('Invalid AbhiLife data: day rescue plan must be an object.');
  }
  requireString(plan.id, 'day rescue plan id');
  if (!DAY_RESCUE_STATES.includes(plan.status)) {
    throw new Error(`Invalid AbhiLife data: unknown day rescue status ${String(plan.status)}.`);
  }
  requireStringArray(plan.selectedTaskIds, 'day rescue selectedTaskIds');
  requireStringArray(plan.releasedTaskIds, 'day rescue releasedTaskIds');
  if (!plan.selectedTaskIds.length) {
    throw new Error('Invalid AbhiLife data: day rescue requires at least one selected task.');
  }
  const allIds = new Set(record.taskEvents.map((event) => event.id));
  const selected = new Set(plan.selectedTaskIds);
  for (const id of plan.selectedTaskIds) {
    if (!allIds.has(id)) throw new Error(`Invalid AbhiLife data: day rescue selected task ${id} is missing.`);
  }
  for (const id of plan.releasedTaskIds) {
    if (!allIds.has(id)) throw new Error(`Invalid AbhiLife data: day rescue released task ${id} is missing.`);
    if (selected.has(id)) throw new Error(`Invalid AbhiLife data: day rescue task ${id} cannot be selected and released.`);
  }
  if (!Number.isInteger(plan.pendingCountBeforeRescue) || plan.pendingCountBeforeRescue < plan.selectedTaskIds.length) {
    throw new Error('Invalid AbhiLife data: day rescue pendingCountBeforeRescue is invalid.');
  }
  if (!plan.preparation || typeof plan.preparation !== 'object' || Array.isArray(plan.preparation)) {
    throw new Error('Invalid AbhiLife data: day rescue preparation must be an object.');
  }
  requireString(plan.preparation.title, 'day rescue preparation title');
  if (!Number.isInteger(plan.preparation.durationMinutes) || plan.preparation.durationMinutes <= 0) {
    throw new Error('Invalid AbhiLife data: day rescue preparation durationMinutes must be positive.');
  }
  if (!DAY_RESCUE_PREP_STATES.includes(plan.preparation.state)) {
    throw new Error(`Invalid AbhiLife data: unknown day rescue preparation state ${String(plan.preparation.state)}.`);
  }
  requireString(plan.preparation.updatedAt, 'day rescue preparation updatedAt');
  requireString(plan.createdAt, 'day rescue createdAt');
  requireString(plan.updatedAt, 'day rescue updatedAt');
  requireOptionalString(plan.completedAt, 'day rescue completedAt');
  if (plan.status === 'completed' && !plan.completedAt) {
    throw new Error('Invalid AbhiLife data: completed day rescue requires completedAt.');
  }
  return true;
}

export function validateTodayRecord(record) {
  validateDailyRecord(record);
  const ids = new Set();
  const sourceKeys = new Set();
  for (const event of record.taskEvents) {
    validateTodayTaskEvent(event);
    if (ids.has(event.id)) throw new Error(`Invalid AbhiLife data: duplicate today task event id ${event.id}.`);
    ids.add(event.id);
    const sourceKey = `${event.goalId}:${event.sourcePlanTaskId}`;
    if (sourceKeys.has(sourceKey)) throw new Error(`Invalid AbhiLife data: duplicate planned task source ${sourceKey}.`);
    sourceKeys.add(sourceKey);
  }
  if (record.importantWinTaskId !== null && record.importantWinTaskId !== undefined) {
    requireString(record.importantWinTaskId, 'daily record importantWinTaskId');
    if (!ids.has(record.importantWinTaskId)) {
      throw new Error('Invalid AbhiLife data: importantWinTaskId must reference a task event in this daily record.');
    }
  }
  if (record.rescuePlan !== null && record.rescuePlan !== undefined) validateDayRescuePlan(record.rescuePlan, record);
  requireString(record.createdAt, 'daily record createdAt');
  requireString(record.updatedAt, 'daily record updatedAt');
  return true;
}

export async function loadTodayRecord(adapter, dateISO = localDateISO()) {
  const path = recordPath(dateISO);
  if (!await adapter.exists(path)) return createDailyRecord(dateISO);
  return parseAndValidateJson(await adapter.readText(path), validateTodayRecord);
}

async function saveTodayRecord(adapter, record) {
  record.updatedAt = nowISO();
  await safeWriteJson(adapter, recordPath(record.date), record, validateTodayRecord);
  return record;
}

function nextActionFromPlan(plan) {
  const task = plan.tasks.find((item) => item.id === plan.nextActionTaskId);
  if (!task) throw new Error('Ready plan has no valid Next Action task.');
  return task;
}

function findGoal(goals, goalId) {
  const goal = goals.items.find((item) => item.id === goalId);
  if (!goal) throw new Error('Goal was not found.');
  return goal;
}

function pendingTasks(record) {
  return record.taskEvents.filter((event) => event.state === 'planned');
}

function shortestFirst(items) {
  return [...items].sort((a, b) => a.durationMinutes - b.durationMinutes || a.createdAt.localeCompare(b.createdAt));
}

export function chooseDayRescueTasks(record) {
  const pending = pendingTasks(record);
  if (!pending.length) return [];

  const selected = [];
  const important = pending.find((event) => event.id === record.importantWinTaskId);
  if (important) selected.push(important);
  else selected.push(shortestFirst(pending)[0]);

  const remaining = shortestFirst(pending.filter((event) => event.id !== selected[0].id));
  if (remaining.length) selected.push(remaining[0]);
  return selected;
}

function maybeCompleteDayRescue(record, at = nowISO()) {
  const plan = record.rescuePlan;
  if (!plan || plan.status !== 'active') return false;
  const selectedResolved = plan.selectedTaskIds.every((id) => {
    const event = record.taskEvents.find((item) => item.id === id);
    return event && event.state !== 'planned';
  });
  const prepResolved = plan.preparation.state !== 'planned';
  if (!selectedResolved || !prepResolved) return false;
  plan.status = 'completed';
  plan.completedAt = at;
  plan.updatedAt = at;
  return true;
}

export async function createDayRescuePlan(adapter, dateISO = localDateISO()) {
  const record = await loadTodayRecord(adapter, dateISO);
  if (record.rescuePlan) return { record, plan: record.rescuePlan, created: false };

  const pending = pendingTasks(record);
  if (!pending.length) throw new Error('There are no pending Today actions to rescue.');

  const selected = chooseDayRescueTasks(record);
  const selectedIds = selected.map((event) => event.id);
  const selectedSet = new Set(selectedIds);
  const released = pending.filter((event) => !selectedSet.has(event.id));
  const now = nowISO();

  for (const event of released) {
    event.state = 'skipped';
    event.reason = null;
    event.note = 'Released from the remaining day by Day Rescue. Intentional release is not failure.';
    event.updatedAt = now;
    event.resolvedAt = now;
  }

  record.importantWinTaskId = selectedIds[0];
  record.rescuePlan = {
    id: makeId('rescue'),
    status: 'active',
    selectedTaskIds: selectedIds,
    releasedTaskIds: released.map((event) => event.id),
    pendingCountBeforeRescue: pending.length,
    preparation: {
      title: 'Prepare tomorrow',
      durationMinutes: 5,
      state: 'planned',
      updatedAt: now
    },
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };

  await saveTodayRecord(adapter, record);
  return { record, plan: record.rescuePlan, created: true };
}

export async function setDayRescuePreparationState(adapter, dateISO, state) {
  if (!['done', 'skipped'].includes(state)) throw new Error('Choose Done or Skip for tomorrow preparation.');
  const record = await loadTodayRecord(adapter, dateISO);
  const plan = record.rescuePlan;
  if (!plan) throw new Error('Day Rescue has not been started.');
  if (plan.status === 'completed') return { record, plan, changed: false };

  const now = nowISO();
  plan.preparation.state = state;
  plan.preparation.updatedAt = now;
  plan.updatedAt = now;
  maybeCompleteDayRescue(record, now);
  await saveTodayRecord(adapter, record);
  return { record, plan, changed: true };
}

export async function listActivationCandidates(adapter) {
  const goals = await loadGoals(adapter);
  const result = [];
  for (const goal of goals.items) {
    if (!['defined', 'active'].includes(goal.state)) continue;
    const plan = await loadGoalPlan(adapter, goal.id);
    if (goal.state === 'defined' && plan?.state !== 'ready') continue;
    result.push({ goal, plan });
  }
  return result.sort((a, b) => {
    if (a.goal.state !== b.goal.state) return a.goal.state === 'active' ? -1 : 1;
    return b.goal.updatedAt.localeCompare(a.goal.updatedAt);
  });
}

export async function ensureGoalNextActionOnDate(adapter, goalId, dateISO = localDateISO()) {
  const goals = await loadGoals(adapter);
  const goal = findGoal(goals, goalId);
  if (goal.state !== 'active') throw new Error('Only an Active goal can send actions to Today.');
  const plan = await loadGoalPlan(adapter, goal.id);
  if (!plan || plan.state !== 'ready') throw new Error('Active goal requires a Ready breakdown.');
  const sourceTask = nextActionFromPlan(plan);
  const record = await loadTodayRecord(adapter, dateISO);

  const existing = record.taskEvents.find((event) => event.goalId === goal.id && event.sourcePlanTaskId === sourceTask.id);
  if (existing) return { record, event: existing, created: false, deferredByRescue: false };

  if (record.rescuePlan) {
    return { record, event: null, created: false, deferredByRescue: true };
  }

  const now = nowISO();
  const event = {
    id: makeId('exec'),
    goalId: goal.id,
    sourcePlanTaskId: sourceTask.id,
    title: sourceTask.title,
    durationMinutes: sourceTask.durationMinutes,
    trigger: sourceTask.trigger ?? '',
    doneCondition: sourceTask.doneCondition,
    state: 'planned',
    reason: null,
    note: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null
  };
  record.taskEvents.push(event);
  if (!record.importantWinTaskId) record.importantWinTaskId = event.id;
  await saveTodayRecord(adapter, record);
  return { record, event, created: true, deferredByRescue: false };
}

export async function activateGoal(adapter, goalId, dateISO = localDateISO()) {
  const goals = await loadGoals(adapter);
  const goal = findGoal(goals, goalId);
  const plan = await loadGoalPlan(adapter, goal.id);
  if (!plan || plan.state !== 'ready') throw new Error('Mark the Goal Breakdown Ready before activation.');

  let activated = false;
  if (goal.state === 'defined') {
    const now = nowISO();
    goal.state = 'active';
    goal.activatedAt = goal.activatedAt ?? now;
    goal.updatedAt = now;
    goals.updatedAt = now;
    await safeWriteJson(adapter, DATA_PATHS.goals, goals, validateGoalsCollection);
    activated = true;
  } else if (goal.state !== 'active') {
    throw new Error('Only a Defined goal can be activated.');
  }

  const today = await ensureGoalNextActionOnDate(adapter, goal.id, dateISO);
  return { goal, plan, activated, ...today };
}

export async function recordTaskOutcome(adapter, dateISO, eventId, state, { reason = null, note = null } = {}) {
  if (!EXECUTION_STATES.includes(state)) throw new Error('Choose a valid execution result.');
  const record = await loadTodayRecord(adapter, dateISO);
  const event = record.taskEvents.find((item) => item.id === eventId);
  if (!event) throw new Error('Today task was not found.');

  if (state === 'missed') {
    if (!MISSED_REASONS.includes(reason)) throw new Error('Choose why this task was missed.');
  } else {
    reason = null;
  }

  const now = nowISO();
  event.state = state;
  event.reason = reason;
  event.note = String(note ?? '').trim() || null;
  event.updatedAt = now;
  event.resolvedAt = now;
  maybeCompleteDayRescue(record, now);
  await saveTodayRecord(adapter, record);
  return { record, event };
}

export async function setImportantWin(adapter, dateISO, eventId) {
  const record = await loadTodayRecord(adapter, dateISO);
  if (!record.taskEvents.some((item) => item.id === eventId)) throw new Error('Today task was not found.');
  record.importantWinTaskId = eventId;
  await saveTodayRecord(adapter, record);
  return record;
}
