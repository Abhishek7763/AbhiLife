import { DATA_SCHEMA_VERSION } from '../core/system.js';
import { parseAndValidateJson } from '../data/validate.js';
import { planPath } from '../storage/paths.js';
import { safeWriteJson } from '../storage/recovery.js';
import { loadGoals } from './goal-definition.js';

export const PLAN_STATES = Object.freeze(['draft', 'ready']);

function nowISO() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function text(value) {
  return String(value ?? '').trim();
}

function required(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function positiveMinutes(value, label, { optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes <= 0) throw new Error(`${label} must be a positive whole number of minutes.`);
  return minutes;
}

function normalizeOrder(value, fallback) {
  const order = Number(value);
  return Number.isInteger(order) && order >= 0 ? order : fallback;
}

function itemId(value, prefix) {
  const id = text(value);
  return id || makeId(prefix);
}

function normalizeMilestones(items = []) {
  return items.map((item, index) => ({
    id: itemId(item.id, 'milestone'),
    title: required(item.title, `Milestone ${index + 1} title`),
    successCondition: required(item.successCondition, `Milestone ${index + 1} success condition`),
    order: normalizeOrder(item.order, index)
  }));
}

function normalizeProjects(items = [], milestoneIds = new Set()) {
  return items.map((item, index) => {
    const milestoneId = required(item.milestoneId, `Project ${index + 1} milestone`);
    if (!milestoneIds.has(milestoneId)) throw new Error(`Project ${index + 1} references an unknown milestone.`);
    return {
      id: itemId(item.id, 'project'),
      milestoneId,
      title: required(item.title, `Project ${index + 1} title`),
      outcome: required(item.outcome, `Project ${index + 1} outcome`),
      order: normalizeOrder(item.order, index)
    };
  });
}

function normalizeWeeklyActions(items = [], projectIds = new Set()) {
  return items.map((item, index) => {
    const projectId = required(item.projectId, `Weekly action ${index + 1} project`);
    if (!projectIds.has(projectId)) throw new Error(`Weekly action ${index + 1} references an unknown project.`);
    return {
      id: itemId(item.id, 'weekly'),
      projectId,
      title: required(item.title, `Weekly action ${index + 1} title`),
      durationMinutes: positiveMinutes(item.durationMinutes, `Weekly action ${index + 1} duration`),
      order: normalizeOrder(item.order, index)
    };
  });
}

function normalizeTasks(items = [], weeklyIds = new Set()) {
  return items.map((item, index) => {
    const weeklyActionId = required(item.weeklyActionId, `Task ${index + 1} weekly action`);
    if (!weeklyIds.has(weeklyActionId)) throw new Error(`Task ${index + 1} references an unknown weekly action.`);
    return {
      id: itemId(item.id, 'task'),
      weeklyActionId,
      title: required(item.title, `Task ${index + 1} title`),
      durationMinutes: positiveMinutes(item.durationMinutes, `Task ${index + 1} duration`),
      trigger: text(item.trigger),
      doneCondition: required(item.doneCondition, `Task ${index + 1} done condition`),
      order: normalizeOrder(item.order, index)
    };
  });
}

function normalizePlanInput(input = {}, state = 'draft') {
  if (!PLAN_STATES.includes(state)) throw new Error('Unknown plan state.');
  const strategy = text(input.strategy);
  const milestones = normalizeMilestones(input.milestones ?? []);
  const milestoneIds = new Set(milestones.map((item) => item.id));
  const projects = normalizeProjects(input.projects ?? [], milestoneIds);
  const projectIds = new Set(projects.map((item) => item.id));
  const weeklyActions = normalizeWeeklyActions(input.weeklyActions ?? [], projectIds);
  const weeklyIds = new Set(weeklyActions.map((item) => item.id));
  const tasks = normalizeTasks(input.tasks ?? [], weeklyIds);
  const taskIds = new Set(tasks.map((item) => item.id));
  const nextActionTaskId = text(input.nextActionTaskId) || null;

  if (nextActionTaskId && !taskIds.has(nextActionTaskId)) throw new Error('Next Action must reference one of this plan’s tasks.');

  if (state === 'ready') {
    if (!strategy) throw new Error('Strategy is required before marking the breakdown Ready.');
    if (!milestones.length) throw new Error('Add at least one milestone before marking the breakdown Ready.');
    if (!projects.length) throw new Error('Add at least one project/work area before marking the breakdown Ready.');
    if (!weeklyActions.length) throw new Error('Add at least one weekly action before marking the breakdown Ready.');
    if (!tasks.length) throw new Error('Add at least one task before marking the breakdown Ready.');
    if (!nextActionTaskId) throw new Error('Choose one concrete Next Action before marking the breakdown Ready.');
  }

  return { strategy, milestones, projects, weeklyActions, tasks, nextActionTaskId };
}

export function createGoalPlan(goalId) {
  const now = nowISO();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    goalId,
    state: 'draft',
    strategy: '',
    milestones: [],
    projects: [],
    weeklyActions: [],
    tasks: [],
    nextActionTaskId: null,
    createdAt: now,
    updatedAt: now,
    readyAt: null
  };
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid AbhiLife data: ${label} must be an object.`);
}

function requireString(value, label, { empty = false } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim())) throw new Error(`Invalid AbhiLife data: ${label} must be ${empty ? 'a string' : 'a non-empty string'}.`);
}

function uniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    requireString(item.id, `${label} id`);
    if (ids.has(item.id)) throw new Error(`Invalid AbhiLife data: duplicate ${label} id ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}

export function validateGoalPlan(plan) {
  requireObject(plan, 'goal plan');
  if (plan.schemaVersion !== DATA_SCHEMA_VERSION) throw new Error(`Invalid AbhiLife data: unsupported plan schemaVersion ${String(plan.schemaVersion)}.`);
  requireString(plan.goalId, 'goal plan goalId');
  if (!PLAN_STATES.includes(plan.state)) throw new Error(`Invalid AbhiLife data: unknown goal plan state ${String(plan.state)}.`);
  requireString(plan.strategy, 'goal plan strategy', { empty: true });
  for (const key of ['milestones', 'projects', 'weeklyActions', 'tasks']) {
    if (!Array.isArray(plan[key])) throw new Error(`Invalid AbhiLife data: goal plan ${key} must be an array.`);
  }

  const milestoneIds = uniqueIds(plan.milestones, 'milestone');
  for (const item of plan.milestones) {
    requireString(item.title, 'milestone title');
    requireString(item.successCondition, 'milestone successCondition');
  }

  const projectIds = uniqueIds(plan.projects, 'project');
  for (const item of plan.projects) {
    requireString(item.milestoneId, 'project milestoneId');
    if (!milestoneIds.has(item.milestoneId)) throw new Error('Invalid AbhiLife data: project references an unknown milestone.');
    requireString(item.title, 'project title');
    requireString(item.outcome, 'project outcome');
  }

  const weeklyIds = uniqueIds(plan.weeklyActions, 'weekly action');
  for (const item of plan.weeklyActions) {
    requireString(item.projectId, 'weekly action projectId');
    if (!projectIds.has(item.projectId)) throw new Error('Invalid AbhiLife data: weekly action references an unknown project.');
    requireString(item.title, 'weekly action title');
    if (!Number.isInteger(item.durationMinutes) || item.durationMinutes <= 0) throw new Error('Invalid AbhiLife data: weekly action durationMinutes must be positive.');
  }

  const taskIds = uniqueIds(plan.tasks, 'task');
  for (const item of plan.tasks) {
    requireString(item.weeklyActionId, 'task weeklyActionId');
    if (!weeklyIds.has(item.weeklyActionId)) throw new Error('Invalid AbhiLife data: task references an unknown weekly action.');
    requireString(item.title, 'task title');
    requireString(item.doneCondition, 'task doneCondition');
    requireString(item.trigger ?? '', 'task trigger', { empty: true });
    if (!Number.isInteger(item.durationMinutes) || item.durationMinutes <= 0) throw new Error('Invalid AbhiLife data: task durationMinutes must be positive.');
  }

  if (plan.nextActionTaskId !== null) {
    requireString(plan.nextActionTaskId, 'goal plan nextActionTaskId');
    if (!taskIds.has(plan.nextActionTaskId)) throw new Error('Invalid AbhiLife data: nextActionTaskId references an unknown task.');
  }

  requireString(plan.createdAt, 'goal plan createdAt');
  requireString(plan.updatedAt, 'goal plan updatedAt');
  if (plan.readyAt !== null) requireString(plan.readyAt, 'goal plan readyAt');

  if (plan.state === 'ready') {
    if (!plan.strategy.trim() || !plan.milestones.length || !plan.projects.length || !plan.weeklyActions.length || !plan.tasks.length || !plan.nextActionTaskId) {
      throw new Error('Invalid AbhiLife data: ready goal plan is incomplete.');
    }
  }
  return true;
}

async function findDefinedGoal(adapter, goalId) {
  const goals = await loadGoals(adapter);
  const goal = goals.items.find((item) => item.id === goalId);
  if (!goal) throw new Error('Goal was not found.');
  if (goal.state !== 'defined') throw new Error('Only a Defined goal can be broken down in this phase.');
  return goal;
}

export async function loadGoalPlan(adapter, goalId) {
  const path = planPath(goalId);
  if (!await adapter.exists(path)) return null;
  return parseAndValidateJson(await adapter.readText(path), validateGoalPlan);
}

export async function listGoalBreakdownCandidates(adapter) {
  const goals = await loadGoals(adapter);
  const defined = goals.items.filter((goal) => goal.state === 'defined');
  const result = [];
  for (const goal of defined) result.push({ goal, plan: await loadGoalPlan(adapter, goal.id) });
  return result.sort((a, b) => b.goal.updatedAt.localeCompare(a.goal.updatedAt));
}

export async function saveGoalBreakdown(adapter, goalId, input, { markReady = false } = {}) {
  const goal = await findDefinedGoal(adapter, goalId);
  const state = markReady ? 'ready' : 'draft';
  const normalized = normalizePlanInput(input, state);
  const existing = await loadGoalPlan(adapter, goalId);
  const plan = existing ?? createGoalPlan(goal.id);
  const now = nowISO();

  plan.state = state;
  plan.strategy = normalized.strategy;
  plan.milestones = normalized.milestones;
  plan.projects = normalized.projects;
  plan.weeklyActions = normalized.weeklyActions;
  plan.tasks = normalized.tasks;
  plan.nextActionTaskId = normalized.nextActionTaskId;
  plan.updatedAt = now;
  plan.readyAt = state === 'ready' ? (plan.readyAt ?? now) : null;

  await safeWriteJson(adapter, planPath(goal.id), plan, validateGoalPlan);
  return plan;
}

export function getPlanSummary(plan) {
  if (!plan) return { state: 'not_started', milestones: 0, projects: 0, weeklyActions: 0, tasks: 0, hasNextAction: false };
  return {
    state: plan.state,
    milestones: plan.milestones.length,
    projects: plan.projects.length,
    weeklyActions: plan.weeklyActions.length,
    tasks: plan.tasks.length,
    hasNextAction: Boolean(plan.nextActionTaskId)
  };
}
