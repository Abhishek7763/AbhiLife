import './investigation.css';
import { getStorageMode } from '../storage/storage.js';
import { DATA_PATHS } from '../storage/paths.js';
import { isNativeStorageAvailable, nativeStorageBridge } from '../storage/nativeBridge.js';
import { verifyVault } from '../storage/vault.js';
import { listInboxThoughts } from '../inbox/inbox.js';
import {
  INVESTIGATION_QUESTIONS,
  finalizeGoalInvestigation,
  getInvestigationProgress,
  saveInvestigationAnswer,
  startGoalInvestigation
} from './investigation.js';

const storageMode = getStorageMode();
let mounted = false;
let vaultReady = false;
let allThoughts = [];
let activeThought = null;
let stepIndex = 0;
let decisionView = false;

const STATE_LABELS = Object.freeze({ inbox: 'To Process', investigating: 'Investigating', accepted: 'Ready for Goal', someday: 'Someday', archived: 'Archived' });
const DECISION_LABELS = Object.freeze({ real_goal: 'Real Goal', someday: 'Someday', think_more: 'Think More', archive: 'Archive' });

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function formatWhen(value) {
  try { return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
}

function insertInvestigationCard() {
  if (document.querySelector('#goal-investigation-card')) return;
  const inboxCard = document.querySelector('#inbox-form')?.closest('.card');
  if (!inboxCard) return;
  const card = document.createElement('article');
  card.className = 'card';
  card.id = 'goal-investigation-card';
  card.innerHTML = `
    <div class="card-header"><div><h3>Goal Investigation</h3><p class="card-subtitle">Thought ≠ Goal. Investigate before you commit.</p></div><span class="badge" id="investigation-count">Checking</span></div>
    <div class="investigation-overview" id="investigation-overview"></div>
    <div class="investigation-items" id="investigation-items"></div>`;
  inboxCard.insertAdjacentElement('afterend', card);
  const modal = document.createElement('div');
  modal.className = 'gi-modal-backdrop';
  modal.id = 'goal-investigation-modal';
  modal.hidden = true;
  modal.innerHTML = `<section class="gi-sheet" role="dialog" aria-modal="true" aria-labelledby="gi-title"><div class="gi-header"><div><div class="eyebrow">Goal Investigation</div><h3 id="gi-title">Think before you commit</h3></div><button class="gi-close" id="gi-close" type="button" aria-label="Close">×</button></div><div class="gi-thought" id="gi-thought"></div><div id="gi-body"></div></section>`;
  document.body.append(modal);
  document.querySelector('#investigation-items').addEventListener('click', onInvestigationListClick);
  document.querySelector('#gi-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.querySelector('#gi-body').addEventListener('click', onModalClick);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
}

async function checkVault() {
  if (storageMode === 'web-preview' || !isNativeStorageAvailable()) return false;
  try {
    const root = await nativeStorageBridge.getRootStatus();
    if (!root.connected) return false;
    if (!await nativeStorageBridge.exists(DATA_PATHS.manifest)) return false;
    return (await verifyVault(nativeStorageBridge)).healthy;
  } catch { return false; }
}
function setOverview(message, tone = '') {
  const node = document.querySelector('#investigation-overview');
  if (!node) return;
  node.className = `investigation-overview ${tone}`.trim();
  node.textContent = message;
}
function statusChip(thought) {
  const progress = getInvestigationProgress(thought);
  const progressText = thought.state === 'investigating' ? ` · ${progress.answered}/${progress.total}` : '';
  return `${STATE_LABELS[thought.state] ?? thought.state}${progressText}`;
}
function actionLabel(thought) { if (!thought.investigation) return 'Start'; if (thought.investigation.status === 'completed') return 'Review'; return 'Continue'; }

function renderList() {
  const count = document.querySelector('#investigation-count');
  const list = document.querySelector('#investigation-items');
  if (!count || !list) return;
  if (!vaultReady) {
    count.textContent = storageMode === 'web-preview' ? 'Android only' : 'Locked';
    list.innerHTML = '';
    setOverview(storageMode === 'web-preview' ? 'Web preview does not persist personal investigation data. Use the Android build with your AbhiLife folder.' : 'Connect a healthy AbhiLife vault first.');
    return;
  }
  const current = allThoughts.filter((thought) => thought.state !== 'archived');
  const toProcess = current.filter((thought) => thought.state === 'inbox').length;
  const investigating = current.filter((thought) => thought.state === 'investigating').length;
  const decided = current.filter((thought) => ['accepted', 'someday'].includes(thought.state)).length;
  count.textContent = `${current.length} thoughts`;
  setOverview(`${toProcess} to process · ${investigating} investigating · ${decided} decided`, 'good');
  if (!current.length) { list.innerHTML = `<div class="gi-empty"><strong>Nothing to investigate</strong><span>Capture a thought in Life Inbox first.</span></div>`; return; }
  const priority = { investigating: 0, inbox: 1, accepted: 2, someday: 3 };
  current.sort((a, b) => (priority[a.state] ?? 9) - (priority[b.state] ?? 9) || b.updatedAt.localeCompare(a.updatedAt));
  list.innerHTML = current.map((thought) => `<div class="gi-item"><div class="gi-item-copy"><div class="gi-state ${thought.state}">${escapeHtml(statusChip(thought))}</div><strong>${escapeHtml(thought.text)}</strong><span>${escapeHtml(formatWhen(thought.updatedAt))}${thought.investigation?.decision && thought.investigation.decision !== 'think_more' ? ` · ${escapeHtml(DECISION_LABELS[thought.investigation.decision])}` : ''}</span></div><button class="mini-button accent-text" type="button" data-gi-open="${thought.id}">${actionLabel(thought)}</button></div>`).join('');
}

async function refreshPanel() {
  if (!mounted) return;
  vaultReady = await checkVault();
  if (!vaultReady) { allThoughts = []; renderList(); return; }
  try { allThoughts = await listInboxThoughts(nativeStorageBridge, { includeArchived: true }); renderList(); }
  catch (error) { allThoughts = []; renderList(); setOverview(error.message, 'danger'); }
}
function firstUnansweredIndex(thought) {
  const progress = getInvestigationProgress(thought);
  if (progress.complete) return 0;
  const key = progress.unanswered[0];
  return Math.max(0, INVESTIGATION_QUESTIONS.findIndex((question) => question.key === key));
}
async function openThought(thought) {
  try {
    let current = thought;
    if (!current.investigation) current = await startGoalInvestigation(nativeStorageBridge, current.id);
    activeThought = current;
    const progress = getInvestigationProgress(current);
    decisionView = current.investigation?.status === 'completed' || (progress.complete && current.investigation?.decision !== 'think_more');
    stepIndex = firstUnansweredIndex(current);
    document.querySelector('#gi-thought').textContent = current.text;
    document.querySelector('#goal-investigation-modal').hidden = false;
    syncMainInboxAfterStateChange(current);
    await refreshPanel();
    renderModal();
  } catch (error) { setOverview(error.message, 'danger'); }
}
function closeModal() {
  const modal = document.querySelector('#goal-investigation-modal');
  if (modal) modal.hidden = true;
  activeThought = null; stepIndex = 0; decisionView = false;
  const body = document.querySelector('#gi-body'); if (body) body.innerHTML = '';
}
function renderQuestion() {
  if (!activeThought?.investigation) return;
  const body = document.querySelector('#gi-body');
  const question = INVESTIGATION_QUESTIONS[stepIndex];
  const progress = getInvestigationProgress(activeThought);
  const answer = activeThought.investigation.answers[question.key] ?? '';
  const width = Math.round(((stepIndex + 1) / INVESTIGATION_QUESTIONS.length) * 100);
  body.innerHTML = `<div class="gi-progress-copy">Question ${stepIndex + 1} of ${INVESTIGATION_QUESTIONS.length} · ${progress.answered} answered</div><div class="gi-progress"><span style="width:${width}%"></span></div><div class="gi-question"><h4>${escapeHtml(question.title)}</h4><p>${escapeHtml(question.prompt)}</p><small>${escapeHtml(question.helper)}</small><textarea id="gi-answer" rows="7" placeholder="Write your honest answer…">${escapeHtml(answer)}</textarea></div><div class="gi-actions"><button class="secondary" type="button" data-gi-action="back" ${stepIndex === 0 ? 'disabled' : ''}>Back</button><button class="primary" type="button" data-gi-action="next">${stepIndex === INVESTIGATION_QUESTIONS.length - 1 ? 'Review decision' : 'Save & Next'}</button></div><div class="gi-message" id="gi-message">Each answer is saved when you continue. Close anytime and resume later.</div>`;
  document.querySelector('#gi-answer')?.focus();
}
function renderDecision() {
  if (!activeThought?.investigation) return;
  const body = document.querySelector('#gi-body');
  const investigation = activeThought.investigation;
  const currentDecision = investigation.status === 'completed' ? investigation.decision : null;
  body.innerHTML = `<div class="gi-progress-copy">Reflection complete</div><div class="gi-decision"><h4>What should happen to this thought?</h4><p>There is no score and no automatic verdict. Choose the state that matches what you actually want now.</p><div class="gi-summary">${INVESTIGATION_QUESTIONS.map((question) => `<details><summary>${escapeHtml(question.title)}</summary><p>${escapeHtml(investigation.answers[question.key] || 'No answer yet')}</p></details>`).join('')}</div>${currentDecision ? `<div class="gi-message good">Current decision: ${escapeHtml(DECISION_LABELS[currentDecision])}</div>` : ''}<div class="gi-decision-grid"><button type="button" class="gi-decision-card real" data-gi-decision="real_goal"><strong>Real Goal</strong><span>Accept it as meaningful. Goal Definition comes next before activation.</span></button><button type="button" class="gi-decision-card" data-gi-decision="someday"><strong>Someday</strong><span>Keep it without spending current focus.</span></button><button type="button" class="gi-decision-card" data-gi-decision="think_more"><strong>Think More</strong><span>Keep the reasoning open; do not force a verdict.</span></button><button type="button" class="gi-decision-card archive" data-gi-decision="archive"><strong>Archive</strong><span>Preserve the record but stop pursuing it now.</span></button></div><button type="button" class="secondary gi-full" data-gi-action="edit-answers">Review or change answers</button><div class="gi-message" id="gi-message">Decision is stored only in your AbhiLife folder.</div></div>`;
}
function renderModal() { if (decisionView) renderDecision(); else renderQuestion(); }
function syncMainInboxAfterStateChange(thought) {
  if (thought.state === 'inbox') return;
  const button = document.querySelector(`[data-thought-id="${CSS.escape(thought.id)}"]`);
  button?.closest('.inbox-item')?.remove();
}
async function onInvestigationListClick(event) {
  const button = event.target.closest('[data-gi-open]');
  if (!button || !vaultReady) return;
  const thought = allThoughts.find((item) => item.id === button.dataset.giOpen);
  if (thought) await openThought(thought);
}
async function onModalClick(event) {
  if (!activeThought || !vaultReady) return;
  const actionButton = event.target.closest('[data-gi-action]');
  const decisionButton = event.target.closest('[data-gi-decision]');
  if (actionButton) {
    const action = actionButton.dataset.giAction;
    if (action === 'back') { stepIndex = Math.max(0, stepIndex - 1); renderQuestion(); return; }
    if (action === 'edit-answers') { decisionView = false; stepIndex = 0; renderQuestion(); return; }
    if (action === 'next') {
      const answer = document.querySelector('#gi-answer')?.value.trim() ?? '';
      const message = document.querySelector('#gi-message');
      if (!answer) { message.textContent = 'Write an honest answer before continuing.'; message.className = 'gi-message danger'; return; }
      actionButton.disabled = true;
      try {
        const question = INVESTIGATION_QUESTIONS[stepIndex];
        activeThought = await saveInvestigationAnswer(nativeStorageBridge, activeThought.id, question.key, answer);
        syncMainInboxAfterStateChange(activeThought);
        await refreshPanel();
        if (stepIndex >= INVESTIGATION_QUESTIONS.length - 1) decisionView = true; else stepIndex += 1;
        renderModal();
      } catch (error) { message.textContent = error.message; message.className = 'gi-message danger'; actionButton.disabled = false; }
    }
    return;
  }
  if (decisionButton) {
    const decision = decisionButton.dataset.giDecision;
    const message = document.querySelector('#gi-message');
    decisionButton.disabled = true;
    try {
      activeThought = await finalizeGoalInvestigation(nativeStorageBridge, activeThought.id, decision);
      syncMainInboxAfterStateChange(activeThought);
      closeModal();
      await refreshPanel();
      setOverview(decision === 'real_goal' ? 'Accepted as a Real Goal candidate. Goal Definition is next; it is not active yet.' : decision === 'someday' ? 'Moved to Someday without taking current focus.' : decision === 'think_more' ? 'Kept in Investigation. Your answers are preserved.' : 'Archived with its investigation record preserved.', 'good');
    } catch (error) { message.textContent = error.message; message.className = 'gi-message danger'; decisionButton.disabled = false; }
  }
}
function watchInboxUi() {
  const list = document.querySelector('#inbox-list'); if (!list) return;
  let timer;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(refreshPanel, 80); }).observe(list, { childList: true, subtree: true });
}
async function mount() {
  if (mounted) return;
  insertInvestigationCard();
  if (!document.querySelector('#goal-investigation-card')) return;
  mounted = true;
  watchInboxUi();
  await refreshPanel();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
