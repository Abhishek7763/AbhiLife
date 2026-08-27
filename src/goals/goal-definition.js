import { createDefinedGoal } from '../data/schema.js';
import { parseAndValidateJson, validateGoalsCollection } from '../data/validate.js';
import { DATA_PATHS } from '../storage/paths.js';
import { safeWriteJson } from '../storage/recovery.js';
import { linkAcceptedThoughtToGoal, loadInbox } from '../inbox/inbox.js';

function nowISO() {
  return new Date().toISOString();
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function normalizeTargetDate(value) {
  const target = String(value ?? '').trim();
  if (!target) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) throw new Error('Target date must use YYYY-MM-DD.');
  const parsed = new Date(`${target}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== target) {
    throw new Error('Target date is not a valid calendar date.');
  }
  return target;
}

function normalizeMinutes(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error('Available weekly time must be a positive whole number of minutes.');
  }
  return minutes;
}

function normalizeConstraints(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split('\n');
  return source.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeDefinition(input = {}) {
  return {
    title: requiredText(input.title, 'Goal title'),
    areaId: requiredText(input.areaId, 'Life department'),
    why: requiredText(input.why, 'Why'),
    desiredOutcome: requiredText(input.desiredOutcome, 'Desired outcome'),
    successCriteria: requiredText(input.successCriteria, 'Success condition'),
    priority: requiredText(input.priority, 'Priority'),
    targetDate: normalizeTargetDate(input.targetDate),
    constraints: normalizeConstraints(input.constraints),
    availableMinutesPerWeek: normalizeMinutes(input.availableMinutesPerWeek)
  };
}

function findAcceptedThought(inbox, thoughtId) {
  const thought = inbox.items.find((item) => item.id === thoughtId);
  if (!thought) throw new Error('Source thought was not found.');
  if (thought.state !== 'accepted' || thought.investigation?.status !== 'completed' || thought.investigation?.decision !== 'real_goal') {
    throw new Error('This thought has not been accepted as a Real Goal candidate.');
  }
  return thought;
}

export async function loadGoals(adapter) {
  const raw = await adapter.readText(DATA_PATHS.goals);
  return parseAndValidateJson(raw, validateGoalsCollection);
}

async function saveGoals(adapter, collection) {
  collection.updatedAt = nowISO();
  await safeWriteJson(adapter, DATA_PATHS.goals, collection, validateGoalsCollection);
  return collection;
}

export async function listDefinedGoals(adapter) {
  const goals = await loadGoals(adapter);
  return goals.items
    .filter((goal) => goal.state === 'defined')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getGoalDefinitionCandidates(adapter) {
  const [inbox, goals] = await Promise.all([loadInbox(adapter), loadGoals(adapter)]);
  const goalsBySource = new Map(goals.items.filter((goal) => goal.sourceThoughtId).map((goal) => [goal.sourceThoughtId, goal]));
  return inbox.items
    .filter((thought) => thought.state === 'accepted' && thought.investigation?.decision === 'real_goal')
    .map((thought) => ({ thought, goal: goalsBySource.get(thought.id) ?? null }))
    .sort((a, b) => b.thought.updatedAt.localeCompare(a.thought.updatedAt));
}

export async function saveGoalDefinition(adapter, thoughtId, input) {
  const definition = normalizeDefinition(input);
  const [inbox, goals] = await Promise.all([loadInbox(adapter), loadGoals(adapter)]);
  const thought = findAcceptedThought(inbox, thoughtId);

  let goal = goals.items.find((item) => item.sourceThoughtId === thoughtId) ?? null;
  let created = false;

  if (goal) {
    if (!['defined', 'investigating'].includes(goal.state)) {
      throw new Error('This goal has moved beyond definition and cannot be changed here.');
    }
    goal.title = definition.title;
    goal.areaId = definition.areaId;
    goal.state = 'defined';
    goal.why = definition.why;
    goal.desiredOutcome = definition.desiredOutcome;
    goal.successCriteria = definition.successCriteria;
    goal.priority = definition.priority;
    goal.targetDate = definition.targetDate;
    goal.constraints = definition.constraints;
    goal.availableMinutesPerWeek = definition.availableMinutesPerWeek;
    goal.updatedAt = nowISO();
  } else {
    goal = createDefinedGoal({ ...definition, sourceThoughtId: thought.id });
    goals.items.unshift(goal);
    created = true;
  }

  await saveGoals(adapter, goals);

  if (thought.convertedToGoalId !== goal.id) {
    await linkAcceptedThoughtToGoal(adapter, thought.id, goal.id);
  }

  return { goal, created };
}

export async function repairGoalSourceLink(adapter, thoughtId) {
  const [inbox, goals] = await Promise.all([loadInbox(adapter), loadGoals(adapter)]);
  const thought = findAcceptedThought(inbox, thoughtId);
  const goal = goals.items.find((item) => item.sourceThoughtId === thoughtId);
  if (!goal) throw new Error('No defined goal exists for this thought.');
  if (thought.convertedToGoalId === goal.id) return { repaired: false, goal };
  await linkAcceptedThoughtToGoal(adapter, thought.id, goal.id);
  return { repaired: true, goal };
}
