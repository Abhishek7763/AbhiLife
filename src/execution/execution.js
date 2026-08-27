import { createDailyRecord } from '../data/schema.js';
import { parseAndValidateJson, validateDailyRecord, validateGoalsCollection } from '../data/validate.js';
import { DATA_PATHS, recordPath } from '../storage/paths.js';
import { safeWriteJson } from '../storage/recovery.js';
import { loadGoalPlan } from '../goals/goal-breakdown.js';

const OUTCOMES = Object.freeze(['done', 'partial', 'missed', 'skipped']);

function nowISO() { return new Date().toISOString(); }
function makeId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }

export function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function loadGoals(adapter) {
  return parseAndValidateJson(await adapter.readText(DATA_PATHS.goals), validateGoalsCollection);
}

async function saveGoals(adapter, goals) {
  goals.updatedAt = nowISO();
  await safeWriteJson(adapter, DATA_PATHS.goals, goals, validateGoalsCollection);
}

export async function listExecutionGoals(adapter) {
  const goals = await loadGoals(adapter);
  const result = [];
  for (const goal of goals.items.filter((item) => ['defined', 'active'].includes(item.state))) {
    const plan = await loadGoalPlan(adapter, goal.id);
    if (goal.state === 'active' || plan?.state === 'ready') result.push({ goal, plan });
  }
  return result.sort((a, b) => b.goal.updatedAt.localeCompare(a.goal.updatedAt));
}

export async function activateGoal(adapter, goalId) {
  const goals = await loadGoals(adapter);
  const goal = goals.items.find((item) => item.id === goalId);
  if (!goal) throw new Error('Goal was not found.');
  if (goal.state === 'active') return goal;
  if (goal.state !== 'defined') throw new Error('Only a Defined goal can be activated.');
  const plan = await loadGoalPlan(adapter, goalId);
  if (!plan || plan.state !== 'ready') throw new Error('Finish the goal breakdown and mark it Ready before activation.');
  goal.state = 'active';
  goal.activatedAt = goal.activatedAt ?? nowISO();
  goal.updatedAt = nowISO();
  await saveGoals(adapter, goals);
  return goal;
}

export async function loadDailyRecord(adapter, dateISO = localDateISO()) {
  const path = recordPath(dateISO);
  if (!await adapter.exists(path)) return createDailyRecord(dateISO);
  return parseAndValidateJson(await adapter.readText(path), validateDailyRecord);
}

async function saveDailyRecord(adapter, record) {
  record.updatedAt = nowISO();
  await safeWriteJson(adapter, recordPath(record.date), record, validateDailyRecord);
  return record;
}

export async function addPlanTaskToDay(adapter, goalId, taskId, dateISO = localDateISO()) {
  const goals = await loadGoals(adapter);
  const goal = goals.items.find((item) => item.id === goalId);
  if (!goal || goal.state !== 'active') throw new Error('Activate this goal before sending tasks to Today.');
  const plan = await loadGoalPlan(adapter, goalId);
  if (!plan || plan.state !== 'ready') throw new Error('Active goal does not have a Ready plan.');
  const task = plan.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error('Plan task was not found.');

  const record = await loadDailyRecord(adapter, dateISO);
  const existing = record.taskEvents.find((item) => item.sourceTaskId === task.id && item.goalId === goalId);
  if (existing) return { record, event: existing, created: false };

  const event = {
    schemaVersion: record.schemaVersion,
    id: makeId('daytask'),
    sourceTaskId: task.id,
    goalId,
    areaId: goal.areaId,
    title: task.title,
    durationMinutes: task.durationMinutes,
    trigger: task.trigger ?? '',
    doneCondition: task.doneCondition,
    state: 'planned',
    missedReason: null,
    note: '',
    addedAt: nowISO(),
    updatedAt: nowISO(),
    completedAt: null
  };
  record.taskEvents.push(event);
  if (!record.importantWinTaskId) record.importantWinTaskId = event.id;
  await saveDailyRecord(adapter, record);
  return { record, event, created: true };
}

export async function setImportantWin(adapter, eventId, dateISO = localDateISO()) {
  const record = await loadDailyRecord(adapter, dateISO);
  if (!record.taskEvents.some((item) => item.id === eventId)) throw new Error('Today task was not found.');
  record.importantWinTaskId = eventId;
  await saveDailyRecord(adapter, record);
  return record;
}

export async function recordTaskOutcome(adapter, eventId, state, { missedReason = null, note = '' } = {}, dateISO = localDateISO()) {
  if (!OUTCOMES.includes(state)) throw new Error('Unknown execution outcome.');
  const record = await loadDailyRecord(adapter, dateISO);
  const event = record.taskEvents.find((item) => item.id === eventId);
  if (!event) throw new Error('Today task was not found.');
  event.state = state;
  event.missedReason = state === 'missed' ? (String(missedReason ?? '').trim() || 'other') : null;
  event.note = String(note ?? '').trim();
  event.updatedAt = nowISO();
  event.completedAt = state === 'done' ? nowISO() : null;
  await saveDailyRecord(adapter, record);
  return event;
}

export async function removePlannedTaskFromDay(adapter, eventId, dateISO = localDateISO()) {
  const record = await loadDailyRecord(adapter, dateISO);
  const event = record.taskEvents.find((item) => item.id === eventId);
  if (!event) return record;
  if (event.state !== 'planned') throw new Error('Only a still-planned task can be removed from Today.');
  record.taskEvents = record.taskEvents.filter((item) => item.id !== eventId);
  if (record.importantWinTaskId === eventId) record.importantWinTaskId = record.taskEvents[0]?.id ?? null;
  await saveDailyRecord(adapter, record);
  return record;
}
