import './habits.css';
import { DEFAULT_LIFE_AREAS, MISSED_REASONS } from '../core/system.js';
import { getMissedReasonGuidance, localDateISO } from '../execution/today.js';
import { getStorageMode } from '../storage/storage.js';
import { isNativeStorageAvailable, nativeStorageBridge } from '../storage/nativeBridge.js';
import { verifyVault } from '../storage/vault.js';
import {
  archiveHabit,
  createHabitDefinition,
  editHabitDefinition,
  loadHabits,
  pauseHabit,
  recordHabitOutcome,
  restoreHabit,
  resumeHabit,
  syncHabitEventsForDate
} from './habits.js';

const storageMode = getStorageMode();
const DAY_OPTIONS = Object.freeze([
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
  { value: 0, short: 'S', label: 'Sunday' }
]);
const REASON_LABELS = Object.freeze({
  forgot: 'Forgot',
  no_time: 'No time',
  low_energy: 'Low energy',
  too_difficult: 'Too difficult',
  too_large: 'Too large',
  unclear: 'Unclear next action',
  distraction: 'Distraction',
  unexpected_work: 'Unexpected work',
  not_important_now: 'Not important now',
  other: 'Other'
});

let mounted = false;
let habits = [];
let todayRecord = null;
let editingHabitId = null;
let showArchived = false;
let openMissedEventId = null;
let vaultReady = false;

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

function stateLabel(state) {
  return ({ planned: 'PLANNED', done: 'DONE', partial: 'PARTIAL', missed: 'MISSED', skipped: 'SKIPPED', active: 'ACTIVE', paused: 'PAUSED', archived: 'ARCHIVED' })[state] ?? String(state).toUpperCase();
}

function scheduleLabel(habit) {
  const days = habit.schedule?.days ?? [0, 1, 2, 3, 4, 5, 6];
  if (days.length === 7) return 'Daily';
  return DAY_OPTIONS.filter((day) => days.includes(day.value)).map((day) => day.label.slice(0, 3)).join(' · ');
}

function mount() {
  if (mounted) return true;
  const host = document.querySelector('#habits-screen-content');
  if (!host) return false;
  mounted = true;
  host.innerHTML = `
    <section class="calm-section habit-panel">
      <div class="habit-toolbar">
        <div class="habit-toolbar-copy">
          <strong>Build repeatable behavior.</strong>
          <span>Cue + context + a tiny Minimum Version. No streak pressure.</span>
        </div>
        <button type="button" class="habit-primary" data-habit-action="new">New habit</button>
      </div>

      <div class="habit-notice" id="habit-notice">Checking local vault…</div>

      <form class="habit-editor" id="habit-editor" hidden>
        <div class="habit-field">
          <label for="habit-title">Habit</label>
          <input id="habit-title" name="title" autocomplete="off" placeholder="Example: Evening walk" />
        </div>
        <div class="habit-grid-two">
          <div class="habit-field">
            <label for="habit-area">Life department</label>
            <select id="habit-area" name="areaId">
              <option value="">Choose department</option>
              ${DEFAULT_LIFE_AREAS.map((area) => `<option value="${area.id}">${escapeHtml(area.name)}</option>`).join('')}
            </select>
          </div>
          <div class="habit-field">
            <label for="habit-cue">Cue / trigger</label>
            <input id="habit-cue" name="cue" autocomplete="off" placeholder="After evening tea" />
          </div>
        </div>
        <div class="habit-field">
          <label for="habit-context">Context</label>
          <input id="habit-context" name="context" autocomplete="off" placeholder="At home, shoes kept near the door" />
        </div>
        <div class="habit-grid-two">
          <div class="habit-field">
            <label for="habit-minimum">Minimum Version</label>
            <input id="habit-minimum" name="minimumAction" autocomplete="off" placeholder="Walk for 5 minutes" />
          </div>
          <div class="habit-field">
            <label for="habit-preferred">Preferred Version</label>
            <input id="habit-preferred" name="targetAction" autocomplete="off" placeholder="Walk for 25 minutes" />
          </div>
        </div>
        <div class="habit-field">
          <span class="habit-days-label">Repeat on</span>
          <div class="habit-days">
            ${DAY_OPTIONS.map((day) => `<label class="habit-day" title="${day.label}"><input type="checkbox" name="days" value="${day.value}" checked /><span>${day.short}</span></label>`).join('')}
          </div>
        </div>
        <div class="habit-editor-actions">
          <button type="submit" class="habit-primary" id="habit-save">Save habit</button>
          <button type="button" class="habit-secondary" data-habit-action="cancel-edit">Cancel</button>
        </div>
      </form>

      <div class="habit-section-title"><strong>Today</strong><span id="habit-today-count">0 scheduled</span></div>
      <div class="habit-today-list" id="habit-today-list"></div>

      <div class="habit-section-title">
        <strong>Your habits</strong>
        <button type="button" class="habit-text-button" id="habit-archive-toggle" data-habit-action="toggle-archived">Show archived</button>
      </div>
      <div class="habit-list" id="habit-list"></div>
      <div class="habit-philosophy">A missed habit is evidence, not a broken streak. Use the reason to make the next attempt easier or better timed.</div>
    </section>`;

  host.addEventListener('click', onClick);
  document.querySelector('#habit-editor')?.addEventListener('submit', onSubmit);
  refresh();
  return true;
}

function setNotice(text, tone = '') {
  const node = document.querySelector('#habit-notice');
  if (!node) return;
  node.textContent = text;
  node.className = `habit-notice ${tone}`.trim();
}

function setEditorVisible(visible) {
  const form = document.querySelector('#habit-editor');
  if (form) form.hidden = !visible;
}

function resetEditor() {
  editingHabitId = null;
  const form = document.querySelector('#habit-editor');
  if (!form) return;
  form.reset();
  form.querySelectorAll('input[name="days"]').forEach((input) => { input.checked = true; });
  const save = document.querySelector('#habit-save');
  if (save) save.textContent = 'Save habit';
  setEditorVisible(false);
}

function openNewEditor() {
  resetEditor();
  setEditorVisible(true);
  document.querySelector('#habit-title')?.focus();
}

function openEditEditor(habitId) {
  const habit = habits.find((item) => item.id === habitId);
  if (!habit || habit.state === 'archived') return;
  editingHabitId = habit.id;
  document.querySelector('#habit-title').value = habit.title;
  document.querySelector('#habit-area').value = habit.areaId ?? '';
  document.querySelector('#habit-cue').value = habit.cue ?? '';
  document.querySelector('#habit-context').value = habit.context ?? '';
  document.querySelector('#habit-minimum').value = habit.minimumAction ?? '';
  document.querySelector('#habit-preferred').value = habit.targetAction ?? '';
  const days = habit.schedule?.days ?? [0, 1, 2, 3, 4, 5, 6];
  document.querySelectorAll('#habit-editor input[name="days"]').forEach((input) => {
    input.checked = days.includes(Number(input.value));
  });
  document.querySelector('#habit-save').textContent = 'Save changes';
  setEditorVisible(true);
  document.querySelector('#habit-title')?.focus();
}

function renderToday() {
  const list = document.querySelector('#habit-today-list');
  const count = document.querySelector('#habit-today-count');
  if (!list || !count) return;
  const events = todayRecord?.habitEvents ?? [];
  count.textContent = `${events.length} scheduled`;
  if (!events.length) {
    list.innerHTML = `<div class="habit-empty">No active habit is scheduled for today.</div>`;
    return;
  }

  list.innerHTML = events.map((item) => {
    const guidance = item.reason ? getMissedReasonGuidance(item.reason) : '';
    const missedEditor = openMissedEventId === item.id ? `
      <div class="habit-missed-editor">
        <select data-habit-missed-reason="${item.id}" aria-label="Why was this habit missed?">
          <option value="">Why was it missed?</option>
          ${MISSED_REASONS.map((reason) => `<option value="${reason}" ${item.reason === reason ? 'selected' : ''}>${escapeHtml(REASON_LABELS[reason] ?? reason)}</option>`).join('')}
        </select>
        <button type="button" data-habit-action="save-missed" data-event-id="${item.id}">Save missed</button>
      </div>` : '';
    return `<article class="habit-today-item">
      <div class="habit-today-head">
        <div class="habit-today-copy">
          <strong>${escapeHtml(item.title)}</strong>
          <small>Minimum: ${escapeHtml(item.minimumAction)}</small>
          <small>Preferred: ${escapeHtml(item.preferredAction)}</small>
          ${item.reason ? `<small>Reason: ${escapeHtml(REASON_LABELS[item.reason] ?? item.reason)}</small>` : ''}
          ${guidance ? `<small class="habit-guidance">Next adjustment: ${escapeHtml(guidance)}</small>` : ''}
        </div>
        <span class="habit-state ${item.state}">${stateLabel(item.state)}</span>
      </div>
      <div class="habit-result-actions">
        <button type="button" class="habit-done" data-habit-action="done" data-event-id="${item.id}">Done ✓</button>
        <button type="button" data-habit-action="partial" data-event-id="${item.id}">Partial ◐</button>
        <button type="button" data-habit-action="missed" data-event-id="${item.id}">Missed ×</button>
        <button type="button" data-habit-action="skipped" data-event-id="${item.id}">Skip —</button>
      </div>
      ${missedEditor}
    </article>`;
  }).join('');
}

function renderHabits() {
  const list = document.querySelector('#habit-list');
  const toggle = document.querySelector('#habit-archive-toggle');
  if (!list || !toggle) return;
  const archived = habits.filter((habit) => habit.state === 'archived');
  const visible = showArchived ? archived : habits.filter((habit) => habit.state !== 'archived');
  toggle.textContent = showArchived ? `Show current (${habits.length - archived.length})` : `Show archived (${archived.length})`;

  if (!visible.length) {
    list.innerHTML = `<div class="habit-empty">${showArchived ? 'No archived habits.' : 'No habits yet. Add one behavior you want to repeat.'}</div>`;
    return;
  }

  list.innerHTML = visible.map((habit) => `
    <article class="habit-item">
      <div class="habit-item-head">
        <div class="habit-item-copy">
          <strong>${escapeHtml(habit.title)}</strong>
          <small>${escapeHtml(areaName(habit.areaId))} · ${escapeHtml(scheduleLabel(habit))}</small>
          <small>Cue: ${escapeHtml(habit.cue || 'Not set')} · Context: ${escapeHtml(habit.context || 'Not set')}</small>
          <small>Minimum: ${escapeHtml(habit.minimumAction || 'Not set')}</small>
          <small>Preferred: ${escapeHtml(habit.targetAction || 'Not set')}</small>
        </div>
        <span class="habit-state ${habit.state}">${stateLabel(habit.state)}</span>
      </div>
      <div class="habit-item-actions">
        ${habit.state === 'active' ? `
          <button type="button" class="habit-mini" data-habit-action="edit" data-habit-id="${habit.id}">Edit</button>
          <button type="button" class="habit-mini" data-habit-action="pause" data-habit-id="${habit.id}">Pause</button>
          <button type="button" class="habit-mini" data-habit-action="archive" data-habit-id="${habit.id}">Archive</button>` : ''}
        ${habit.state === 'paused' ? `
          <button type="button" class="habit-mini" data-habit-action="edit" data-habit-id="${habit.id}">Edit</button>
          <button type="button" class="habit-mini" data-habit-action="resume" data-habit-id="${habit.id}">Resume</button>
          <button type="button" class="habit-mini" data-habit-action="archive" data-habit-id="${habit.id}">Archive</button>` : ''}
        ${habit.state === 'archived' ? `<button type="button" class="habit-mini" data-habit-action="restore" data-habit-id="${habit.id}">Restore</button>` : ''}
      </div>
    </article>`).join('');
}

function render() {
  renderToday();
  renderHabits();
}

async function refresh() {
  if (storageMode === 'web-preview') {
    vaultReady = false;
    habits = [];
    todayRecord = null;
    setNotice('Web preview shows Habit Engine UI only. Personal habit data is saved only in the Android AbhiLife vault.');
    render();
    return;
  }
  if (!isNativeStorageAvailable()) {
    vaultReady = false;
    habits = [];
    todayRecord = null;
    setNotice('Android storage bridge is unavailable.', 'danger');
    render();
    return;
  }
  try {
    const health = await verifyVault(nativeStorageBridge);
    if (!health.healthy) throw new Error('Connect a healthy AbhiLife vault to use Habits.');
    vaultReady = true;
    const collection = await loadHabits(nativeStorageBridge);
    habits = collection.items;
    const synced = await syncHabitEventsForDate(nativeStorageBridge, localDateISO());
    todayRecord = synced.record;
    setNotice('Habits are stored locally. Today records behavior evidence without streak scores.', 'good');
    render();
  } catch (error) {
    vaultReady = false;
    habits = [];
    todayRecord = null;
    setNotice(error.message, 'danger');
    render();
  }
}

function formInput() {
  const form = document.querySelector('#habit-editor');
  const data = new FormData(form);
  return {
    title: data.get('title'),
    areaId: data.get('areaId'),
    cue: data.get('cue'),
    context: data.get('context'),
    minimumAction: data.get('minimumAction'),
    targetAction: data.get('targetAction'),
    days: data.getAll('days').map(Number)
  };
}

async function onSubmit(event) {
  event.preventDefault();
  if (!vaultReady || storageMode === 'web-preview') return;
  const button = document.querySelector('#habit-save');
  button.disabled = true;
  try {
    if (editingHabitId) await editHabitDefinition(nativeStorageBridge, editingHabitId, formInput());
    else await createHabitDefinition(nativeStorageBridge, formInput());
    resetEditor();
    await refresh();
    window.dispatchEvent(new CustomEvent('abhilife:habits-changed'));
  } catch (error) {
    setNotice(error.message, 'danger');
  } finally {
    button.disabled = false;
  }
}

async function onClick(event) {
  const button = event.target.closest('[data-habit-action]');
  if (!button) return;
  const action = button.dataset.habitAction;
  if (action === 'new') return openNewEditor();
  if (action === 'cancel-edit') return resetEditor();
  if (action === 'toggle-archived') {
    showArchived = !showArchived;
    renderHabits();
    return;
  }
  if (action === 'edit') return openEditEditor(button.dataset.habitId);
  if (action === 'missed') {
    openMissedEventId = openMissedEventId === button.dataset.eventId ? null : button.dataset.eventId;
    renderToday();
    return;
  }
  if (!vaultReady || storageMode === 'web-preview') return;

  button.disabled = true;
  try {
    if (action === 'pause') await pauseHabit(nativeStorageBridge, button.dataset.habitId);
    if (action === 'resume') await resumeHabit(nativeStorageBridge, button.dataset.habitId);
    if (action === 'archive') await archiveHabit(nativeStorageBridge, button.dataset.habitId);
    if (action === 'restore') await restoreHabit(nativeStorageBridge, button.dataset.habitId);
    if (['done', 'partial', 'skipped'].includes(action)) {
      await recordHabitOutcome(nativeStorageBridge, localDateISO(), button.dataset.eventId, action);
    }
    if (action === 'save-missed') {
      const eventId = button.dataset.eventId;
      const select = document.querySelector(`[data-habit-missed-reason="${CSS.escape(eventId)}"]`);
      await recordHabitOutcome(nativeStorageBridge, localDateISO(), eventId, 'missed', { reason: select?.value ?? '' });
      openMissedEventId = null;
    }
    await refresh();
    window.dispatchEvent(new CustomEvent('abhilife:habits-changed'));
  } catch (error) {
    setNotice(error.message, 'danger');
    button.disabled = false;
  }
}

window.addEventListener('abhilife:screen-changed', (event) => {
  if (event.detail?.screen === 'habits') refresh();
});
window.addEventListener('abhilife:today-changed', () => {
  if (document.documentElement.dataset.screen === 'habits') refresh();
});

if (!mount()) {
  const observer = new MutationObserver(() => {
    if (mount()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
