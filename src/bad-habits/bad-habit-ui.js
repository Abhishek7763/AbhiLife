import './bad-habits.css';
import { DEFAULT_LIFE_AREAS } from '../core/system.js';
import { localDateISO } from '../execution/today.js';
import { getStorageMode } from '../storage/storage.js';
import { isNativeStorageAvailable, nativeStorageBridge } from '../storage/nativeBridge.js';
import { verifyVault } from '../storage/vault.js';
import {
  addBadHabit,
  archiveBadHabit,
  editBadHabit,
  loadBadHabitDayRecord,
  loadBadHabits,
  logBadHabitEvent,
  pauseBadHabit,
  restoreBadHabit,
  resumeBadHabit,
  summarizeBadHabitDay
} from './bad-habits.js';

const storageMode = getStorageMode();
let mounted = false;
let vaultReady = false;
let items = [];
let todayRecord = null;
let editingId = null;
let loggingId = null;
let loggingType = 'occurred';
let showArchived = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function areaName(areaId) {
  return DEFAULT_LIFE_AREAS.find((area) => area.id === areaId)?.name ?? areaId;
}

function stateLabel(value) {
  return ({ active: 'ACTIVE', paused: 'PAUSED', archived: 'ARCHIVED', occurred: 'OCCURRED', interrupted: 'INTERRUPTED', replaced: 'REPLACED' })[value] ?? String(value).toUpperCase();
}

function formatTime(value) {
  try {
    return new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function mount() {
  if (mounted) return true;
  const host = document.querySelector('#bad-habits-screen-content');
  if (!host) return false;
  mounted = true;
  host.innerHTML = `
    <section class="calm-section bad-habit-panel">
      <div class="bad-habit-toolbar">
        <div class="bad-habit-toolbar-copy">
          <strong>Understand the loop before fighting it.</strong>
          <span>Trigger → context → immediate reward → long-term cost → better environment.</span>
        </div>
        <button type="button" class="bad-habit-primary" data-bad-habit-action="new">New pattern</button>
      </div>
      <div class="bad-habit-notice" id="bad-habit-notice">Checking local vault…</div>

      <form class="bad-habit-editor" id="bad-habit-editor" hidden>
        <div class="bad-habit-grid-two">
          <div class="bad-habit-field"><label for="bad-habit-title">Unwanted behavior</label><input id="bad-habit-title" name="title" placeholder="Example: Late-night scrolling" /></div>
          <div class="bad-habit-field"><label for="bad-habit-area">Life department</label><select id="bad-habit-area" name="areaId"><option value="">Choose department</option>${DEFAULT_LIFE_AREAS.map((area) => `<option value="${area.id}">${escapeHtml(area.name)}</option>`).join('')}</select></div>
        </div>
        <div class="bad-habit-grid-two">
          <div class="bad-habit-field"><label for="bad-habit-trigger">Trigger</label><input id="bad-habit-trigger" name="trigger" placeholder="Feeling bored after dinner" /></div>
          <div class="bad-habit-field"><label for="bad-habit-time">Time pattern</label><input id="bad-habit-time" name="timePattern" placeholder="10:30 PM–12:00 AM" /></div>
        </div>
        <div class="bad-habit-field"><label for="bad-habit-context">Place / context</label><input id="bad-habit-context" name="placeContext" placeholder="In bed with phone within reach" /></div>
        <div class="bad-habit-grid-two">
          <div class="bad-habit-field"><label for="bad-habit-reward">Immediate reward</label><textarea id="bad-habit-reward" name="immediateReward" rows="3" placeholder="Entertainment and escape from boredom"></textarea></div>
          <div class="bad-habit-field"><label for="bad-habit-cost">Long-term cost</label><textarea id="bad-habit-cost" name="longTermCost" rows="3" placeholder="Less sleep, poor next-day energy"></textarea></div>
        </div>
        <div class="bad-habit-field"><label for="bad-habit-remove-cue">Remove cue</label><textarea id="bad-habit-remove-cue" name="removeCuePlan" rows="2" placeholder="Charge phone outside bedroom"></textarea></div>
        <div class="bad-habit-field"><label for="bad-habit-friction">Increase friction</label><textarea id="bad-habit-friction" name="frictionPlan" rows="2" placeholder="Log out of distracting apps after 10 PM"></textarea></div>
        <div class="bad-habit-field"><label for="bad-habit-environment">Environment change</label><textarea id="bad-habit-environment" name="environmentPlan" rows="2" placeholder="Keep a book and alarm clock near bed instead"></textarea></div>
        <div class="bad-habit-field"><label for="bad-habit-replacement">Replacement behavior</label><textarea id="bad-habit-replacement" name="replacementBehavior" rows="2" placeholder="Read 5 pages or listen to calm audio"></textarea></div>
        <div class="bad-habit-editor-actions">
          <button type="submit" class="bad-habit-primary" id="bad-habit-save">Save pattern</button>
          <button type="button" class="bad-habit-secondary" data-bad-habit-action="cancel-edit">Cancel</button>
        </div>
      </form>

      <form class="bad-habit-log-editor" id="bad-habit-log-editor" hidden>
        <div class="bad-habit-field"><label>Evidence type</label><div class="bad-habit-event-type">
          <button type="button" data-bad-habit-event-type="occurred">Behavior occurred</button>
          <button type="button" data-bad-habit-event-type="interrupted">Interrupted it</button>
          <button type="button" data-bad-habit-event-type="replaced">Used replacement</button>
        </div></div>
        <div class="bad-habit-field"><label for="bad-log-trigger">Observed trigger</label><input id="bad-log-trigger" name="trigger" /></div>
        <div class="bad-habit-field"><label for="bad-log-context">Observed context</label><input id="bad-log-context" name="context" /></div>
        <div class="bad-habit-field"><label for="bad-log-note">Short note <span style="text-transform:none;font-weight:450">optional</span></label><textarea id="bad-log-note" name="note" rows="2" placeholder="What happened just before or after?"></textarea></div>
        <div class="bad-habit-log-actions">
          <button type="submit" class="bad-habit-primary">Save evidence</button>
          <button type="button" class="bad-habit-secondary" data-bad-habit-action="cancel-log">Cancel</button>
        </div>
      </form>

      <div class="bad-habit-section-title"><strong>Today’s evidence</strong><span id="bad-habit-today-count">0 events</span></div>
      <div class="bad-habit-summary" id="bad-habit-summary"></div>
      <div class="bad-habit-today-list" id="bad-habit-today-list"></div>

      <div class="bad-habit-section-title"><strong>Patterns</strong><button type="button" class="bad-habit-text-button" data-bad-habit-action="toggle-archived" id="bad-habit-archive-toggle">Show archived</button></div>
      <div class="bad-habit-list" id="bad-habit-list"></div>
      <div class="bad-habit-philosophy">The goal is not shame or a perfect streak. Log the loop accurately, then change cues, friction, environment and the available replacement.</div>
    </section>`;

  host.addEventListener('click', onClick);
  document.querySelector('#bad-habit-editor')?.addEventListener('submit', onDefinitionSubmit);
  document.querySelector('#bad-habit-log-editor')?.addEventListener('submit', onLogSubmit);
  refresh();
  return true;
}

function setNotice(text, tone = '') {
  const node = document.querySelector('#bad-habit-notice');
  if (!node) return;
  node.textContent = text;
  node.className = `bad-habit-notice ${tone}`.trim();
}

function setDefinitionEditor(visible) {
  const form = document.querySelector('#bad-habit-editor');
  if (form) form.hidden = !visible;
}

function setLogEditor(visible) {
  const form = document.querySelector('#bad-habit-log-editor');
  if (form) form.hidden = !visible;
}

function resetDefinitionEditor() {
  editingId = null;
  const form = document.querySelector('#bad-habit-editor');
  form?.reset();
  const save = document.querySelector('#bad-habit-save');
  if (save) save.textContent = 'Save pattern';
  setDefinitionEditor(false);
}

function definitionInput() {
  const data = new FormData(document.querySelector('#bad-habit-editor'));
  return Object.fromEntries(['title', 'areaId', 'trigger', 'timePattern', 'placeContext', 'immediateReward', 'longTermCost', 'removeCuePlan', 'frictionPlan', 'environmentPlan', 'replacementBehavior'].map((key) => [key, data.get(key)]));
}

function openDefinition(item = null) {
  resetDefinitionEditor();
  if (item) {
    editingId = item.id;
    for (const key of ['title', 'areaId', 'trigger', 'timePattern', 'placeContext', 'immediateReward', 'longTermCost', 'removeCuePlan', 'frictionPlan', 'environmentPlan', 'replacementBehavior']) {
      const node = document.querySelector(`#bad-habit-editor [name="${key}"]`);
      if (node) node.value = item[key] ?? '';
    }
    document.querySelector('#bad-habit-save').textContent = 'Save changes';
  }
  setDefinitionEditor(true);
  document.querySelector('#bad-habit-title')?.focus();
}

function setLoggingType(type) {
  loggingType = type;
  document.querySelectorAll('[data-bad-habit-event-type]').forEach((button) => button.classList.toggle('active', button.dataset.badHabitEventType === type));
}

function openLog(item) {
  loggingId = item.id;
  const form = document.querySelector('#bad-habit-log-editor');
  form.reset();
  document.querySelector('#bad-log-trigger').value = item.trigger;
  document.querySelector('#bad-log-context').value = item.placeContext;
  setLoggingType('occurred');
  setLogEditor(true);
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeLog() {
  loggingId = null;
  setLogEditor(false);
}

function renderToday() {
  const summary = summarizeBadHabitDay(todayRecord ?? { badHabitEvents: [] });
  const summaryNode = document.querySelector('#bad-habit-summary');
  const count = document.querySelector('#bad-habit-today-count');
  const list = document.querySelector('#bad-habit-today-list');
  if (!summaryNode || !count || !list) return;
  count.textContent = `${summary.total} event${summary.total === 1 ? '' : 's'}`;
  summaryNode.innerHTML = `<div><strong>${summary.occurred}</strong><span>Occurred</span></div><div><strong>${summary.interrupted}</strong><span>Interrupted</span></div><div><strong>${summary.replaced}</strong><span>Replaced</span></div>`;
  const events = [...(todayRecord?.badHabitEvents ?? [])].reverse();
  if (!events.length) {
    list.innerHTML = '<div class="bad-habit-empty">No unwanted-behavior evidence logged today. Zero events is not auto-scored as success; it simply means no evidence was logged.</div>';
    return;
  }
  list.innerHTML = events.map((event) => `<article class="bad-habit-event"><div class="bad-habit-event-head"><div class="bad-habit-copy"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(formatTime(event.loggedAt))} · Trigger: ${escapeHtml(event.trigger)}</small><small>Context: ${escapeHtml(event.context)}</small>${event.eventType === 'replaced' ? `<small>Replacement: ${escapeHtml(event.replacementBehavior)}</small>` : ''}${event.note ? `<small>Note: ${escapeHtml(event.note)}</small>` : ''}</div><span class="bad-habit-state ${event.eventType}">${stateLabel(event.eventType)}</span></div></article>`).join('');
}

function renderDefinitions() {
  const list = document.querySelector('#bad-habit-list');
  const toggle = document.querySelector('#bad-habit-archive-toggle');
  if (!list || !toggle) return;
  const archived = items.filter((item) => item.state === 'archived');
  const visible = showArchived ? archived : items.filter((item) => item.state !== 'archived');
  toggle.textContent = showArchived ? `Show current (${items.length - archived.length})` : `Show archived (${archived.length})`;
  if (!visible.length) {
    list.innerHTML = `<div class="bad-habit-empty">${showArchived ? 'No archived patterns.' : 'No unwanted behavior patterns defined yet.'}</div>`;
    return;
  }
  list.innerHTML = visible.map((item) => `<article class="bad-habit-item"><div class="bad-habit-item-head"><div class="bad-habit-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(areaName(item.areaId))} · ${escapeHtml(item.timePattern)}</small><small>Trigger: ${escapeHtml(item.trigger)}</small><small>Context: ${escapeHtml(item.placeContext)}</small><div class="bad-habit-plan"><small><b>Immediate reward:</b> ${escapeHtml(item.immediateReward)}</small><small><b>Long-term cost:</b> ${escapeHtml(item.longTermCost)}</small><small><b>Remove cue:</b> ${escapeHtml(item.removeCuePlan)}</small><small><b>Increase friction:</b> ${escapeHtml(item.frictionPlan)}</small><small><b>Environment:</b> ${escapeHtml(item.environmentPlan)}</small><small><b>Replacement:</b> ${escapeHtml(item.replacementBehavior)}</small></div></div><span class="bad-habit-state ${item.state}">${stateLabel(item.state)}</span></div><div class="bad-habit-item-actions">${item.state === 'active' ? `<button type="button" class="bad-habit-primary" data-bad-habit-action="log" data-bad-habit-id="${item.id}">Log evidence</button><button type="button" class="bad-habit-mini" data-bad-habit-action="edit" data-bad-habit-id="${item.id}">Edit</button><button type="button" class="bad-habit-mini" data-bad-habit-action="pause" data-bad-habit-id="${item.id}">Pause</button><button type="button" class="bad-habit-mini" data-bad-habit-action="archive" data-bad-habit-id="${item.id}">Archive</button>` : ''}${item.state === 'paused' ? `<button type="button" class="bad-habit-mini" data-bad-habit-action="edit" data-bad-habit-id="${item.id}">Edit</button><button type="button" class="bad-habit-mini" data-bad-habit-action="resume" data-bad-habit-id="${item.id}">Resume</button><button type="button" class="bad-habit-mini" data-bad-habit-action="archive" data-bad-habit-id="${item.id}">Archive</button>` : ''}${item.state === 'archived' ? `<button type="button" class="bad-habit-mini" data-bad-habit-action="restore" data-bad-habit-id="${item.id}">Restore</button>` : ''}</div></article>`).join('');
}

function render() {
  renderToday();
  renderDefinitions();
}

async function refresh() {
  if (storageMode === 'web-preview') {
    vaultReady = false;
    items = [];
    todayRecord = null;
    setNotice('Web preview shows the Bad Habit Engine interface only. Personal behavior evidence stays in the Android AbhiLife vault.');
    render();
    return;
  }
  if (!isNativeStorageAvailable()) {
    vaultReady = false;
    items = [];
    todayRecord = null;
    setNotice('Android storage bridge is unavailable.', 'danger');
    render();
    return;
  }
  try {
    const health = await verifyVault(nativeStorageBridge);
    if (!health.healthy) throw new Error('Connect a healthy AbhiLife vault to use Bad Habits.');
    vaultReady = true;
    items = (await loadBadHabits(nativeStorageBridge)).items;
    todayRecord = await loadBadHabitDayRecord(nativeStorageBridge, localDateISO());
    setNotice('Behavior loops and daily evidence are stored locally. No shame score and no automatic success from missing data.', 'good');
    render();
  } catch (error) {
    vaultReady = false;
    items = [];
    todayRecord = null;
    setNotice(error.message, 'danger');
    render();
  }
}

async function onDefinitionSubmit(event) {
  event.preventDefault();
  if (!vaultReady || storageMode === 'web-preview') return;
  const save = document.querySelector('#bad-habit-save');
  save.disabled = true;
  try {
    if (editingId) await editBadHabit(nativeStorageBridge, editingId, definitionInput());
    else await addBadHabit(nativeStorageBridge, definitionInput());
    resetDefinitionEditor();
    await refresh();
  } catch (error) {
    setNotice(error.message, 'danger');
  } finally {
    save.disabled = false;
  }
}

async function onLogSubmit(event) {
  event.preventDefault();
  if (!vaultReady || !loggingId || storageMode === 'web-preview') return;
  const data = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await logBadHabitEvent(nativeStorageBridge, localDateISO(), loggingId, loggingType, { trigger: data.get('trigger'), context: data.get('context'), note: data.get('note') });
    closeLog();
    await refresh();
  } catch (error) {
    setNotice(error.message, 'danger');
  } finally {
    button.disabled = false;
  }
}

async function onClick(event) {
  const typeButton = event.target.closest('[data-bad-habit-event-type]');
  if (typeButton) return setLoggingType(typeButton.dataset.badHabitEventType);
  const button = event.target.closest('[data-bad-habit-action]');
  if (!button) return;
  const action = button.dataset.badHabitAction;
  if (action === 'new') return openDefinition();
  if (action === 'cancel-edit') return resetDefinitionEditor();
  if (action === 'cancel-log') return closeLog();
  if (action === 'toggle-archived') {
    showArchived = !showArchived;
    renderDefinitions();
    return;
  }
  const item = items.find((entry) => entry.id === button.dataset.badHabitId);
  if (!item) return;
  if (action === 'edit') return openDefinition(item);
  if (action === 'log') return openLog(item);
  if (!vaultReady || storageMode === 'web-preview') return;
  button.disabled = true;
  try {
    if (action === 'pause') await pauseBadHabit(nativeStorageBridge, item.id);
    if (action === 'resume') await resumeBadHabit(nativeStorageBridge, item.id);
    if (action === 'archive') await archiveBadHabit(nativeStorageBridge, item.id);
    if (action === 'restore') await restoreBadHabit(nativeStorageBridge, item.id);
    await refresh();
  } catch (error) {
    setNotice(error.message, 'danger');
    button.disabled = false;
  }
}

window.addEventListener('abhilife:screen-changed', (event) => {
  if (event.detail?.screen === 'bad-habits') refresh();
});

if (!mount()) {
  const observer = new MutationObserver(() => {
    if (mount()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
