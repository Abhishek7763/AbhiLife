import './goal-definition.css';
import { getStorageMode } from '../storage/storage.js';
import { DATA_PATHS } from '../storage/paths.js';
import { isNativeStorageAvailable, nativeStorageBridge } from '../storage/nativeBridge.js';
import { verifyVault } from '../storage/vault.js';
import { parseAndValidateJson, validateCollection } from '../data/validate.js';
import {
  getGoalDefinitionCandidates,
  listDefinedGoals,
  saveGoalDefinition
} from './goal-definition.js';

const storageMode = getStorageMode();
let mounted = false;
let vaultReady = false;
let candidates = [];
let definedGoals = [];
let departments = [];
let activeThought = null;
let activeGoal = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function mount() {
  if (document.querySelector('#goal-definition-card')) return true;
  const anchor = document.querySelector('#goal-investigation-card') || document.querySelector('#inbox-form')?.closest('.card');
  if (!anchor) return false;

  const card = document.createElement('article');
  card.className = 'card';
  card.id = 'goal-definition-card';
  card.innerHTML = `
    <div class="card-header">
      <div>
        <h3>Goal Definition</h3>
        <p class="card-subtitle">Turn accepted thoughts into clear goals before planning them.</p>
      </div>
      <span class="badge" id="goal-definition-count">Checking</span>
    </div>
    <div class="goal-definition-overview" id="goal-definition-overview"></div>
    <div class="goal-definition-list" id="goal-definition-list"></div>
  `;
  anchor.insertAdjacentElement('afterend', card);

  const modal = document.createElement('div');
  modal.className = 'goal-def-backdrop';
  modal.id = 'goal-definition-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <section class="goal-def-sheet" role="dialog" aria-modal="true" aria-labelledby="goal-def-title">
      <div class="goal-def-header">
        <div>
          <div class="eyebrow">Goal Definition</div>
          <h3 id="goal-def-title">Define the goal clearly</h3>
        </div>
        <button class="goal-def-close" id="goal-def-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="goal-def-source" id="goal-def-source"></div>
      <form id="goal-definition-form" class="goal-def-form">
        <label>
          <span>Goal title</span>
          <input id="goal-def-goal-title" name="title" required />
        </label>
        <label>
          <span>Life department</span>
          <select id="goal-def-area" name="areaId" required></select>
        </label>
        <label>
          <span>Why does this matter?</span>
          <textarea id="goal-def-why" name="why" rows="4" required></textarea>
        </label>
        <label>
          <span>Desired outcome</span>
          <textarea id="goal-def-outcome" name="desiredOutcome" rows="4" required></textarea>
        </label>
        <label>
          <span>Success condition</span>
          <textarea id="goal-def-success" name="successCriteria" rows="4" required placeholder="What observable result will tell you this goal is achieved?"></textarea>
        </label>
        <div class="goal-def-two">
          <label>
            <span>Priority</span>
            <select id="goal-def-priority" name="priority" required>
              <option value="">Choose</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label>
            <span>Available time / week</span>
            <div class="goal-def-inline">
              <input id="goal-def-minutes" name="availableMinutesPerWeek" type="number" min="1" step="1" inputmode="numeric" required />
              <small>minutes</small>
            </div>
          </label>
        </div>
        <label>
          <span>Target date <small>optional</small></span>
          <input id="goal-def-date" name="targetDate" type="date" />
        </label>
        <label>
          <span>Known constraints <small>optional · one per line</small></span>
          <textarea id="goal-def-constraints" name="constraints" rows="4" placeholder="Limited evening time&#10;Budget limit&#10;Travel days"></textarea>
        </label>
        <div class="goal-def-note">A deadline is optional. Clarity is required. The goal stays <strong>Defined</strong>, not Active, until the planning/breakdown phase.</div>
        <div class="goal-def-actions">
          <button class="secondary" type="button" id="goal-def-cancel">Cancel</button>
          <button class="primary" type="submit" id="goal-def-save">Save Defined Goal</button>
        </div>
        <div class="goal-def-message" id="goal-def-message"></div>
      </form>
    </section>
  `;
  document.body.append(modal);

  document.querySelector('#goal-definition-list').addEventListener('click', onListClick);
  document.querySelector('#goal-definition-form').addEventListener('submit', onSubmit);
  document.querySelector('#goal-def-close').addEventListener('click', closeModal);
  document.querySelector('#goal-def-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
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

async function loadDepartments() {
  const raw = await nativeStorageBridge.readText(DATA_PATHS.departments);
  const collection = parseAndValidateJson(raw, (value) => validateCollection(value, 'departments'));
  return collection.items
    .filter((item) => !item.archivedAt)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

function setOverview(message, tone = '') {
  const node = document.querySelector('#goal-definition-overview');
  if (!node) return;
  node.className = `goal-definition-overview ${tone}`.trim();
  node.textContent = message;
}

function suppressConvertedInvestigationRows() {
  const convertedIds = new Set(
    candidates.filter(({ goal }) => Boolean(goal)).map(({ thought }) => thought.id)
  );
  for (const id of convertedIds) {
    const button = document.querySelector(`[data-gi-open="${CSS.escape(id)}"]`);
    if (button) button.closest('.gi-item')?.setAttribute('hidden', '');
  }
}

function render() {
  const count = document.querySelector('#goal-definition-count');
  const list = document.querySelector('#goal-definition-list');
  if (!count || !list) return;

  if (!vaultReady) {
    count.textContent = storageMode === 'web-preview' ? 'Android only' : 'Locked';
    setOverview(storageMode === 'web-preview'
      ? 'Web preview does not save personal goal definitions. Use the Android build.'
      : 'Connect a healthy AbhiLife vault first.');
    list.innerHTML = '';
    return;
  }

  const ready = candidates.filter(({ goal }) => !goal);
  count.textContent = `${ready.length} ready · ${definedGoals.length} defined`;
  setOverview(
    ready.length
      ? `${ready.length} accepted thought${ready.length === 1 ? '' : 's'} ready for clear definition.`
      : 'No accepted thought is waiting for definition.',
    'good'
  );

  const readyHtml = ready.length
    ? `<div class="goal-def-section-title">Ready to define</div>${ready.map(({ thought }) => `
        <article class="goal-def-item">
          <div>
            <span class="goal-def-state ready">Ready for definition</span>
            <strong>${escapeHtml(thought.text)}</strong>
            <small>Investigation completed · Real Goal</small>
          </div>
          <button class="mini-button accent-text" type="button" data-goal-def-thought="${thought.id}">Define</button>
        </article>
      `).join('')}`
    : '';

  const definedHtml = definedGoals.length
    ? `<div class="goal-def-section-title">Defined goals</div>${definedGoals.map((goal) => `
        <article class="goal-def-item">
          <div>
            <span class="goal-def-state defined">Defined · ${escapeHtml(goal.priority)}</span>
            <strong>${escapeHtml(goal.title)}</strong>
            <small>${escapeHtml(departments.find((area) => area.id === goal.areaId)?.name ?? goal.areaId)} · ${goal.availableMinutesPerWeek} min/week${goal.targetDate ? ` · Target ${escapeHtml(goal.targetDate)}` : ''}</small>
          </div>
          <button class="mini-button" type="button" data-goal-def-edit="${goal.id}">Edit</button>
        </article>
      `).join('')}`
    : '';

  list.innerHTML = readyHtml + definedHtml || `
    <div class="goal-def-empty">
      <strong>No goals to define yet</strong>
      <span>Accept a thought as a Real Goal after Goal Investigation.</span>
    </div>
  `;
  suppressConvertedInvestigationRows();
}

async function refresh() {
  if (!mounted) return;
  vaultReady = await isVaultReady();
  if (!vaultReady) {
    candidates = [];
    definedGoals = [];
    departments = [];
    render();
    return;
  }
  try {
    [candidates, definedGoals, departments] = await Promise.all([
      getGoalDefinitionCandidates(nativeStorageBridge),
      listDefinedGoals(nativeStorageBridge),
      loadDepartments()
    ]);
    render();
  } catch (error) {
    setOverview(error.message, 'danger');
  }
}

function fillDepartmentOptions(selected = '') {
  const select = document.querySelector('#goal-def-area');
  select.innerHTML = `<option value="">Choose department</option>${departments.map((area) => `
    <option value="${escapeHtml(area.id)}" ${area.id === selected ? 'selected' : ''}>${escapeHtml(area.name)}</option>
  `).join('')}`;
}

function openModal(thought, goal = null) {
  activeThought = thought;
  activeGoal = goal;
  const investigation = thought.investigation?.answers ?? {};
  document.querySelector('#goal-def-source').textContent = thought.text;
  document.querySelector('#goal-def-goal-title').value = goal?.title ?? thought.text;
  fillDepartmentOptions(goal?.areaId ?? '');
  document.querySelector('#goal-def-why').value = goal?.why ?? investigation.why ?? '';
  document.querySelector('#goal-def-outcome').value = goal?.desiredOutcome ?? investigation.outcome ?? '';
  document.querySelector('#goal-def-success').value = goal?.successCriteria ?? '';
  document.querySelector('#goal-def-priority').value = goal?.priority ?? '';
  document.querySelector('#goal-def-minutes').value = goal?.availableMinutesPerWeek ?? '';
  document.querySelector('#goal-def-date').value = goal?.targetDate ?? '';
  document.querySelector('#goal-def-constraints').value = (goal?.constraints ?? []).join('\n');
  document.querySelector('#goal-def-message').textContent = goal
    ? 'Editing the definition does not activate the goal.'
    : 'Your investigation answers prefill Why and Desired Outcome. Review them before saving.';
  document.querySelector('#goal-definition-modal').hidden = false;
  document.querySelector('#goal-def-goal-title').focus();
}

function closeModal() {
  const modal = document.querySelector('#goal-definition-modal');
  if (modal) modal.hidden = true;
  activeThought = null;
  activeGoal = null;
}

async function onListClick(event) {
  const defineButton = event.target.closest('[data-goal-def-thought]');
  if (defineButton) {
    const item = candidates.find(({ thought }) => thought.id === defineButton.dataset.goalDefThought);
    if (item) openModal(item.thought, item.goal);
    return;
  }

  const editButton = event.target.closest('[data-goal-def-edit]');
  if (editButton) {
    const goal = definedGoals.find((item) => item.id === editButton.dataset.goalDefEdit);
    if (!goal) return;
    const candidate = candidates.find(({ thought }) => thought.id === goal.sourceThoughtId);
    if (candidate) openModal(candidate.thought, goal);
  }
}

async function onSubmit(event) {
  event.preventDefault();
  if (!activeThought || !vaultReady) return;

  const saveButton = document.querySelector('#goal-def-save');
  const message = document.querySelector('#goal-def-message');
  saveButton.disabled = true;
  message.className = 'goal-def-message';

  try {
    const result = await saveGoalDefinition(nativeStorageBridge, activeThought.id, {
      title: document.querySelector('#goal-def-goal-title').value,
      areaId: document.querySelector('#goal-def-area').value,
      why: document.querySelector('#goal-def-why').value,
      desiredOutcome: document.querySelector('#goal-def-outcome').value,
      successCriteria: document.querySelector('#goal-def-success').value,
      priority: document.querySelector('#goal-def-priority').value,
      targetDate: document.querySelector('#goal-def-date').value,
      constraints: document.querySelector('#goal-def-constraints').value,
      availableMinutesPerWeek: document.querySelector('#goal-def-minutes').value
    });
    closeModal();
    await refresh();
    setOverview(
      result.created
        ? 'Goal defined and linked to its original investigation. It is not Active yet.'
        : 'Goal definition updated. It is still waiting for planning/breakdown.',
      'good'
    );
  } catch (error) {
    message.textContent = error.message;
    message.className = 'goal-def-message danger';
  } finally {
    saveButton.disabled = false;
  }
}

function watchRelatedUi() {
  let timer;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  });
  const investigation = document.querySelector('#goal-investigation-card');
  const inbox = document.querySelector('#inbox-list');
  if (investigation) observer.observe(investigation, { childList: true, subtree: true });
  if (inbox) observer.observe(inbox, { childList: true, subtree: true });
}

async function start() {
  if (mounted) return;
  if (!mount()) {
    setTimeout(start, 60);
    return;
  }
  mounted = true;
  watchRelatedUi();
  await refresh();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
