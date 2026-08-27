import './goal-breakdown.css';
import { getStorageMode } from '../storage/storage.js';
import { DATA_PATHS } from '../storage/paths.js';
import { isNativeStorageAvailable, nativeStorageBridge } from '../storage/nativeBridge.js';
import { verifyVault } from '../storage/vault.js';
import {
  getPlanSummary,
  listGoalBreakdownCandidates,
  saveGoalBreakdown
} from './goal-breakdown.js';

const storageMode = getStorageMode();
let mounted = false;
let vaultReady = false;
let candidates = [];
let activeGoal = null;
let draft = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function tempId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function clonePlan(goalId, plan) {
  if (plan) return JSON.parse(JSON.stringify(plan));
  return {
    goalId,
    state: 'draft',
    strategy: '',
    milestones: [],
    projects: [],
    weeklyActions: [],
    tasks: [],
    nextActionTaskId: null
  };
}

function mount() {
  if (document.querySelector('#goal-breakdown-card')) return true;
  const anchor = document.querySelector('#goal-definition-card') || document.querySelector('#goal-investigation-card');
  if (!anchor) return false;

  const card = document.createElement('article');
  card.className = 'card';
  card.id = 'goal-breakdown-card';
  card.innerHTML = `
    <div class="card-header">
      <div>
        <h3>Goal Breakdown</h3>
        <p class="card-subtitle">Turn a clear goal into a chain of executable actions.</p>
      </div>
      <span class="badge" id="goal-breakdown-count">Checking</span>
    </div>
    <div class="goal-breakdown-overview" id="goal-breakdown-overview"></div>
    <div class="goal-breakdown-list" id="goal-breakdown-list"></div>
  `;
  anchor.insertAdjacentElement('afterend', card);

  const modal = document.createElement('div');
  modal.className = 'breakdown-backdrop';
  modal.id = 'goal-breakdown-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <section class="breakdown-sheet" role="dialog" aria-modal="true" aria-labelledby="breakdown-title">
      <div class="breakdown-header">
        <div>
          <div class="eyebrow">Goal Breakdown</div>
          <h3 id="breakdown-title">Build the action chain</h3>
        </div>
        <button class="breakdown-close" id="breakdown-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="breakdown-goal" id="breakdown-goal"></div>
      <div class="breakdown-body" id="breakdown-body"></div>
    </section>
  `;
  document.body.append(modal);

  document.querySelector('#goal-breakdown-list').addEventListener('click', handleListClick);
  document.querySelector('#breakdown-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.querySelector('#breakdown-body').addEventListener('click', handleBodyClick);
  document.querySelector('#breakdown-body').addEventListener('input', handleBodyInput);
  document.querySelector('#breakdown-body').addEventListener('change', handleBodyInput);
  return true;
}

async function isVaultReady() {
  if (storageMode === 'web-preview' || !isNativeStorageAvailable()) return false;
  try {
    const root = await nativeStorageBridge.getRootStatus();
    if (!root.connected || !await nativeStorageBridge.exists(DATA_PATHS.manifest)) return false;
    return (await verifyVault(nativeStorageBridge)).healthy;
  } catch {
    return false;
  }
}

function setOverview(message, tone = '') {
  const node = document.querySelector('#goal-breakdown-overview');
  if (!node) return;
  node.className = `goal-breakdown-overview ${tone}`.trim();
  node.textContent = message;
}

function renderList() {
  const badge = document.querySelector('#goal-breakdown-count');
  const list = document.querySelector('#goal-breakdown-list');
  if (!badge || !list) return;

  if (!vaultReady) {
    badge.textContent = storageMode === 'web-preview' ? 'Android only' : 'Locked';
    list.innerHTML = '';
    setOverview(storageMode === 'web-preview'
      ? 'Web preview does not persist personal plans. Use the Android build with your AbhiLife folder.'
      : 'Connect a healthy AbhiLife vault first.');
    return;
  }

  const readyCount = candidates.filter(({ plan }) => plan?.state === 'ready').length;
  const draftCount = candidates.filter(({ plan }) => plan?.state === 'draft').length;
  const untouched = candidates.filter(({ plan }) => !plan).length;
  badge.textContent = `${readyCount} ready`;
  setOverview(`${untouched} not started · ${draftCount} draft · ${readyCount} ready`, 'good');

  if (!candidates.length) {
    list.innerHTML = `<div class="breakdown-empty"><strong>No Defined goals yet</strong><span>Finish Goal Definition first.</span></div>`;
    return;
  }

  list.innerHTML = candidates.map(({ goal, plan }) => {
    const summary = getPlanSummary(plan);
    const label = summary.state === 'ready' ? 'Ready for activation' : summary.state === 'draft' ? 'Draft plan' : 'Not started';
    const action = plan ? 'Edit Breakdown' : 'Start Breakdown';
    return `
      <article class="breakdown-item">
        <div class="breakdown-item-copy">
          <span class="breakdown-state ${escapeHtml(summary.state)}">${escapeHtml(label)}</span>
          <strong>${escapeHtml(goal.title)}</strong>
          <small>${summary.milestones} milestones · ${summary.projects} projects · ${summary.weeklyActions} weekly actions · ${summary.tasks} tasks${summary.hasNextAction ? ' · Next Action chosen' : ''}</small>
        </div>
        <button class="mini-button accent-text" type="button" data-breakdown-goal="${escapeHtml(goal.id)}">${action}</button>
      </article>
    `;
  }).join('');
}

async function refresh() {
  if (!mounted) return;
  vaultReady = await isVaultReady();
  if (!vaultReady) {
    candidates = [];
    renderList();
    return;
  }
  try {
    candidates = await listGoalBreakdownCandidates(nativeStorageBridge);
    renderList();
  } catch (error) {
    candidates = [];
    renderList();
    setOverview(error.message, 'danger');
  }
}

function renderParentOptions(items, selected, placeholder) {
  return `<option value="">${escapeHtml(placeholder)}</option>${items.map((item) => `
    <option value="${escapeHtml(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item.title)}</option>
  `).join('')}`;
}

function renderEditor(message = '') {
  if (!draft || !activeGoal) return;
  const body = document.querySelector('#breakdown-body');
  const nextOptions = draft.tasks.map((task) => `<option value="${escapeHtml(task.id)}" ${task.id === draft.nextActionTaskId ? 'selected' : ''}>${escapeHtml(task.title)}</option>`).join('');

  body.innerHTML = `
    <label class="breakdown-field">
      <span>Strategy</span>
      <textarea rows="4" data-plan-field="strategy" placeholder="What broad approach will move this goal forward?">${escapeHtml(draft.strategy)}</textarea>
      <small>The approach, not a list of tasks.</small>
    </label>

    <section class="breakdown-section">
      <div class="breakdown-section-head"><div><h4>1. Milestones</h4><p>Meaningful intermediate outcomes.</p></div><button class="mini-button" type="button" data-add="milestone">+ Milestone</button></div>
      <div class="breakdown-rows">${draft.milestones.map((item, index) => `
        <div class="breakdown-row two" data-row-kind="milestones" data-row-id="${escapeHtml(item.id)}">
          <label><span>Milestone ${index + 1}</span><input value="${escapeHtml(item.title)}" data-item-field="title" /></label>
          <label><span>Success condition</span><input value="${escapeHtml(item.successCondition)}" data-item-field="successCondition" /></label>
          <button class="row-remove" type="button" data-remove="milestones" data-id="${escapeHtml(item.id)}">Remove</button>
        </div>`).join('') || '<div class="breakdown-hint">Add the first milestone.</div>'}</div>
    </section>

    <section class="breakdown-section">
      <div class="breakdown-section-head"><div><h4>2. Projects / Work Areas</h4><p>Concrete bodies of work that deliver a milestone.</p></div><button class="mini-button" type="button" data-add="project">+ Project</button></div>
      <div class="breakdown-rows">${draft.projects.map((item, index) => `
        <div class="breakdown-row three" data-row-kind="projects" data-row-id="${escapeHtml(item.id)}">
          <label><span>Parent milestone</span><select data-item-field="milestoneId">${renderParentOptions(draft.milestones, item.milestoneId, 'Choose milestone')}</select></label>
          <label><span>Project ${index + 1}</span><input value="${escapeHtml(item.title)}" data-item-field="title" /></label>
          <label><span>Outcome</span><input value="${escapeHtml(item.outcome)}" data-item-field="outcome" /></label>
          <button class="row-remove" type="button" data-remove="projects" data-id="${escapeHtml(item.id)}">Remove</button>
        </div>`).join('') || '<div class="breakdown-hint">Projects become available after you add a milestone.</div>'}</div>
    </section>

    <section class="breakdown-section">
      <div class="breakdown-section-head"><div><h4>3. Weekly Actions</h4><p>What you intend to move this week.</p></div><button class="mini-button" type="button" data-add="weekly">+ Weekly Action</button></div>
      <div class="breakdown-rows">${draft.weeklyActions.map((item, index) => `
        <div class="breakdown-row three" data-row-kind="weeklyActions" data-row-id="${escapeHtml(item.id)}">
          <label><span>Parent project</span><select data-item-field="projectId">${renderParentOptions(draft.projects, item.projectId, 'Choose project')}</select></label>
          <label><span>Weekly action ${index + 1}</span><input value="${escapeHtml(item.title)}" data-item-field="title" /></label>
          <label><span>Time (minutes)</span><input type="number" min="1" inputmode="numeric" value="${escapeHtml(item.durationMinutes ?? '')}" data-item-field="durationMinutes" /></label>
          <button class="row-remove" type="button" data-remove="weeklyActions" data-id="${escapeHtml(item.id)}">Remove</button>
        </div>`).join('') || '<div class="breakdown-hint">Add a project before weekly actions.</div>'}</div>
    </section>

    <section class="breakdown-section">
      <div class="breakdown-section-head"><div><h4>4. Tasks</h4><p>Small executable pieces of a weekly action.</p></div><button class="mini-button" type="button" data-add="task">+ Task</button></div>
      <div class="breakdown-rows">${draft.tasks.map((item, index) => `
        <div class="breakdown-row task-row" data-row-kind="tasks" data-row-id="${escapeHtml(item.id)}">
          <label><span>Parent weekly action</span><select data-item-field="weeklyActionId">${renderParentOptions(draft.weeklyActions, item.weeklyActionId, 'Choose weekly action')}</select></label>
          <label><span>Task ${index + 1}</span><input value="${escapeHtml(item.title)}" data-item-field="title" /></label>
          <label><span>Time (minutes)</span><input type="number" min="1" inputmode="numeric" value="${escapeHtml(item.durationMinutes ?? '')}" data-item-field="durationMinutes" /></label>
          <label><span>Trigger / when <small>optional</small></span><input value="${escapeHtml(item.trigger)}" data-item-field="trigger" placeholder="After dinner / 7:00 PM" /></label>
          <label class="wide"><span>Done condition</span><input value="${escapeHtml(item.doneCondition)}" data-item-field="doneCondition" placeholder="What exactly means done?" /></label>
          <button class="row-remove" type="button" data-remove="tasks" data-id="${escapeHtml(item.id)}">Remove</button>
        </div>`).join('') || '<div class="breakdown-hint">Tasks should be concrete enough to execute without re-planning.</div>'}</div>
    </section>

    <section class="breakdown-section next-action-box">
      <h4>5. Next Physical Action</h4>
      <p>Choose the single task that should become the first executable move.</p>
      <select data-plan-field="nextActionTaskId"><option value="">Choose Next Action</option>${nextOptions}</select>
    </section>

    <div class="breakdown-note">Save Draft anytime. <strong>Mark Breakdown Ready</strong> requires a complete Strategy → Milestone → Project → Weekly Action → Task chain and one Next Action. Ready still does not activate the goal.</div>
    <div class="breakdown-actions">
      <button class="secondary" type="button" data-breakdown-action="save-draft">Save Draft</button>
      <button class="primary" type="button" data-breakdown-action="mark-ready">Mark Breakdown Ready</button>
    </div>
    <div class="breakdown-message ${message ? 'good' : ''}" id="breakdown-message">${escapeHtml(message)}</div>
  `;
}

function openModal(candidate) {
  activeGoal = candidate.goal;
  draft = clonePlan(candidate.goal.id, candidate.plan);
  document.querySelector('#breakdown-goal').innerHTML = `<strong>${escapeHtml(activeGoal.title)}</strong><span>${escapeHtml(activeGoal.successCriteria)}</span>`;
  document.querySelector('#goal-breakdown-modal').hidden = false;
  renderEditor(candidate.plan?.state === 'ready' ? 'This breakdown is Ready. Editing and saving a Draft will move it back to Draft.' : '');
}

function closeModal() {
  document.querySelector('#goal-breakdown-modal').hidden = true;
  activeGoal = null;
  draft = null;
}

function findItem(kind, id) {
  return draft?.[kind]?.find((item) => item.id === id) ?? null;
}

function addItem(kind) {
  if (!draft) return;
  if (kind === 'milestone') draft.milestones.push({ id: tempId('milestone'), title: '', successCondition: '', order: draft.milestones.length });
  if (kind === 'project') {
    if (!draft.milestones.length) return showMessage('Add a milestone first.', true);
    draft.projects.push({ id: tempId('project'), milestoneId: draft.milestones[0].id, title: '', outcome: '', order: draft.projects.length });
  }
  if (kind === 'weekly') {
    if (!draft.projects.length) return showMessage('Add a project first.', true);
    draft.weeklyActions.push({ id: tempId('weekly'), projectId: draft.projects[0].id, title: '', durationMinutes: '', order: draft.weeklyActions.length });
  }
  if (kind === 'task') {
    if (!draft.weeklyActions.length) return showMessage('Add a weekly action first.', true);
    draft.tasks.push({ id: tempId('task'), weeklyActionId: draft.weeklyActions[0].id, title: '', durationMinutes: '', trigger: '', doneCondition: '', order: draft.tasks.length });
  }
  renderEditor();
}

function removeItem(kind, id) {
  if (!draft) return;
  if (kind === 'milestones') {
    const projectIds = new Set(draft.projects.filter((item) => item.milestoneId === id).map((item) => item.id));
    const weeklyIds = new Set(draft.weeklyActions.filter((item) => projectIds.has(item.projectId)).map((item) => item.id));
    const taskIds = new Set(draft.tasks.filter((item) => weeklyIds.has(item.weeklyActionId)).map((item) => item.id));
    draft.milestones = draft.milestones.filter((item) => item.id !== id);
    draft.projects = draft.projects.filter((item) => !projectIds.has(item.id));
    draft.weeklyActions = draft.weeklyActions.filter((item) => !weeklyIds.has(item.id));
    draft.tasks = draft.tasks.filter((item) => !taskIds.has(item.id));
    if (taskIds.has(draft.nextActionTaskId)) draft.nextActionTaskId = null;
  }
  if (kind === 'projects') {
    const weeklyIds = new Set(draft.weeklyActions.filter((item) => item.projectId === id).map((item) => item.id));
    const taskIds = new Set(draft.tasks.filter((item) => weeklyIds.has(item.weeklyActionId)).map((item) => item.id));
    draft.projects = draft.projects.filter((item) => item.id !== id);
    draft.weeklyActions = draft.weeklyActions.filter((item) => !weeklyIds.has(item.id));
    draft.tasks = draft.tasks.filter((item) => !taskIds.has(item.id));
    if (taskIds.has(draft.nextActionTaskId)) draft.nextActionTaskId = null;
  }
  if (kind === 'weeklyActions') {
    const taskIds = new Set(draft.tasks.filter((item) => item.weeklyActionId === id).map((item) => item.id));
    draft.weeklyActions = draft.weeklyActions.filter((item) => item.id !== id);
    draft.tasks = draft.tasks.filter((item) => !taskIds.has(item.id));
    if (taskIds.has(draft.nextActionTaskId)) draft.nextActionTaskId = null;
  }
  if (kind === 'tasks') {
    draft.tasks = draft.tasks.filter((item) => item.id !== id);
    if (draft.nextActionTaskId === id) draft.nextActionTaskId = null;
  }
  renderEditor();
}

function showMessage(message, danger = false) {
  const node = document.querySelector('#breakdown-message');
  if (!node) return;
  node.textContent = message;
  node.className = `breakdown-message ${danger ? 'danger' : 'good'}`;
}

function handleBodyInput(event) {
  if (!draft) return;
  const planField = event.target.dataset.planField;
  if (planField) {
    draft[planField] = event.target.value;
    return;
  }
  const field = event.target.dataset.itemField;
  if (!field) return;
  const row = event.target.closest('[data-row-kind]');
  if (!row) return;
  const item = findItem(row.dataset.rowKind, row.dataset.rowId);
  if (!item) return;
  item[field] = event.target.value;
}

async function persist(markReady) {
  if (!activeGoal || !draft) return;
  showMessage('Saving…');
  try {
    const saved = await saveGoalBreakdown(nativeStorageBridge, activeGoal.id, draft, { markReady });
    draft = clonePlan(activeGoal.id, saved);
    await refresh();
    renderEditor(markReady ? 'Breakdown is Ready for the future activation phase.' : 'Draft saved safely in your AbhiLife folder.');
  } catch (error) {
    showMessage(error.message, true);
  }
}

function handleBodyClick(event) {
  const add = event.target.closest('[data-add]');
  if (add) return addItem(add.dataset.add);

  const remove = event.target.closest('[data-remove]');
  if (remove) return removeItem(remove.dataset.remove, remove.dataset.id);

  const action = event.target.closest('[data-breakdown-action]');
  if (!action) return;
  if (action.dataset.breakdownAction === 'save-draft') persist(false);
  if (action.dataset.breakdownAction === 'mark-ready') persist(true);
}

function handleListClick(event) {
  const button = event.target.closest('[data-breakdown-goal]');
  if (!button || !vaultReady) return;
  const candidate = candidates.find(({ goal }) => goal.id === button.dataset.breakdownGoal);
  if (candidate) openModal(candidate);
}

function observeUpstream() {
  const anchors = [document.querySelector('#goal-definition-card'), document.querySelector('#goal-investigation-card')].filter(Boolean);
  let timer;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  });
  for (const anchor of anchors) observer.observe(anchor, { childList: true, subtree: true });
}

async function init() {
  if (mounted) return;
  if (!mount()) {
    setTimeout(init, 60);
    return;
  }
  mounted = true;
  observeUpstream();
  await refresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
