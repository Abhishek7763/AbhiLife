import {
  INVESTIGATION_DECISIONS,
  INVESTIGATION_QUESTION_KEYS
} from '../core/system.js';
import { createGoalInvestigation } from '../data/schema.js';
import { findInboxThought, loadInbox, saveInboxCollection } from '../inbox/inbox.js';

export const INVESTIGATION_QUESTIONS = Object.freeze([
  Object.freeze({ key: 'origin', title: 'Where did this desire come from?', prompt: 'Is this genuinely something you want, or is comparison, FOMO, social media, family pressure, or another external influence driving it?', helper: 'Name the source honestly. There is no right answer.' }),
  Object.freeze({ key: 'why', title: 'Why does this matter to you?', prompt: 'What personal reason makes this worth your time and attention?', helper: 'Try to go beyond “it would be good.”' }),
  Object.freeze({ key: 'outcome', title: 'What would actually change?', prompt: 'If you achieve this, what concrete difference would it make in your life?', helper: 'Describe the real outcome, not just the label of the goal.' }),
  Object.freeze({ key: 'cost', title: 'What will this cost?', prompt: 'What time, money, energy, attention, or convenience will this require?', helper: 'A real goal has a real cost.' }),
  Object.freeze({ key: 'process', title: 'Can you accept the process?', prompt: 'Do you want only the result, or are you willing to repeatedly do the work that produces it?', helper: 'Think about the boring and difficult parts too.' }),
  Object.freeze({ key: 'control', title: 'What is under your control?', prompt: 'Which parts of this outcome can your own actions influence, and which parts depend on other people or circumstances?', helper: 'Focus future planning on controllable actions.' }),
  Object.freeze({ key: 'timing', title: 'Is now the right time?', prompt: 'Is this important now, or is another goal or responsibility more important at this stage?', helper: 'A good goal can still have bad timing.' }),
  Object.freeze({ key: 'conflict', title: 'What will this compete with?', prompt: 'Which current goals, responsibilities, routines, or comforts will compete for the same time and energy? What may need to be reduced?', helper: 'Goal conflict is easier to manage when it is visible.' }),
  Object.freeze({ key: 'commitment', title: 'Are you willing to stay with it?', prompt: 'If progress is slow and motivation drops, are you still willing to work on this for the time it realistically needs?', helper: 'Commitment means accepting imperfect progress, not promising perfection.' })
]);

function nowISO() { return new Date().toISOString(); }
function normalizeAnswer(value) { return String(value ?? '').trim(); }
function requireQuestionKey(key) { if (!INVESTIGATION_QUESTION_KEYS.includes(key)) throw new Error('Unknown goal investigation question.'); }
function requireDecision(decision) { if (!INVESTIGATION_DECISIONS.includes(decision)) throw new Error('Unknown goal investigation decision.'); }
function requireInvestigation(thought) { if (!thought.investigation) throw new Error('Start the goal investigation first.'); return thought.investigation; }
function unansweredKeys(investigation) { return INVESTIGATION_QUESTION_KEYS.filter((key) => !normalizeAnswer(investigation.answers[key])); }

export function getInvestigationProgress(thought) {
  const investigation = thought?.investigation;
  if (!investigation) return { answered: 0, total: INVESTIGATION_QUESTION_KEYS.length, complete: false, unanswered: [...INVESTIGATION_QUESTION_KEYS] };
  const unanswered = unansweredKeys(investigation);
  return { answered: INVESTIGATION_QUESTION_KEYS.length - unanswered.length, total: INVESTIGATION_QUESTION_KEYS.length, complete: unanswered.length === 0, unanswered };
}

export async function startGoalInvestigation(adapter, thoughtId) {
  const collection = await loadInbox(adapter);
  const thought = findInboxThought(collection, thoughtId);
  if (thought.state === 'archived') throw new Error('Restore this thought before investigating it.');
  if (!thought.investigation) thought.investigation = createGoalInvestigation();
  if (thought.state === 'inbox') thought.state = 'investigating';
  thought.updatedAt = nowISO();
  await saveInboxCollection(adapter, collection);
  return thought;
}

export async function saveInvestigationAnswer(adapter, thoughtId, key, answer) {
  requireQuestionKey(key);
  const collection = await loadInbox(adapter);
  const thought = findInboxThought(collection, thoughtId);
  const investigation = requireInvestigation(thought);
  const now = nowISO();
  investigation.answers[key] = normalizeAnswer(answer);
  investigation.status = 'draft';
  investigation.decision = null;
  investigation.completedAt = null;
  investigation.updatedAt = now;
  thought.state = 'investigating';
  thought.updatedAt = now;
  await saveInboxCollection(adapter, collection);
  return thought;
}

export async function finalizeGoalInvestigation(adapter, thoughtId, decision) {
  requireDecision(decision);
  const collection = await loadInbox(adapter);
  const thought = findInboxThought(collection, thoughtId);
  const investigation = requireInvestigation(thought);
  const now = nowISO();
  if (decision === 'think_more') {
    investigation.status = 'draft';
    investigation.decision = 'think_more';
    investigation.completedAt = null;
    investigation.updatedAt = now;
    thought.state = 'investigating';
    thought.updatedAt = now;
    await saveInboxCollection(adapter, collection);
    return thought;
  }
  const missing = unansweredKeys(investigation);
  if (missing.length) throw new Error(`Answer all investigation questions before making a final decision. ${missing.length} answer(s) are still missing.`);
  investigation.status = 'completed';
  investigation.decision = decision;
  investigation.completedAt = now;
  investigation.updatedAt = now;
  thought.archivedAt = null;
  thought.preArchiveState = null;
  if (decision === 'real_goal') thought.state = 'accepted';
  if (decision === 'someday') thought.state = 'someday';
  if (decision === 'archive') { thought.preArchiveState = 'inbox'; thought.state = 'archived'; thought.archivedAt = now; }
  thought.updatedAt = now;
  await saveInboxCollection(adapter, collection);
  return thought;
}
