import './maintenance.css';
import { DEFAULT_LIFE_AREAS, MISSED_REASONS } from '../core/system.js';
import { getMissedReasonGuidance, localDateISO } from '../execution/today.js';
import { getStorageMode } from '../storage/storage.js';
import { isNativeStorageAvailable, nativeStorageBridge } from '../storage/nativeBridge.js';
import { verifyVault } from '../storage/vault.js';
import {
  MAINTENANCE_CATEGORIES,
  addMaintenance,
  archiveMaintenance,
  editMaintenance,
  loadMaintenance,
  pauseMaintenance,
  recordMaintenanceOutcome,
  restoreMaintenance,
  resumeMaintenance,
  syncMaintenanceEventsForDate
} from './maintenance.js';

const storageMode = getStorageMode();
const DAY_OPTIONS = Object.freeze([
  { value: 1, short: 'M', label: 'Monday' }, { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' }, { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' }, { value: 6, short: 'S', label: 'Saturday' },
  { value: 0, short: 'S', label: 'Sunday' }
]);
const CATEGORY_LABELS = Object.freeze({ sleep: 'Sleep', health: 'Health routine', hygiene: 'Hygiene', meals: 'Meals', medication: 'Medication routine', finance: 'Basic finance', home: 'Home', other: 'Other' });
const REASON_LABELS = Object.freeze({ forgot: 'Forgot', no_time: 'No time', low_energy: 'Low energy', too_difficult: 'Too difficult', too_large: 'Too large', unclear: 'Unclear', distraction: 'Distraction', unexpected_work: 'Unexpected work', not_important_now: 'Not important now', other: 'Other' });

let mounted = false;
let items = [];
let todayRecord = null;
let editingId = null;
let showArchived = false;
let openMissedEventId = null;
let vaultReady = false;

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function areaName(areaId) {
  return DEFAULT_LIFE_AREAS.find((area) => area.id === areaId)?.name ?? areaId;
}

function scheduleLabel(item) {
  const days = item.schedule?.days ?? [0, 1, 2, 3, 4, 5, 6];
  if (days.length === 7) return 'Daily';
  return DAY_OPTIONS.filter((day) => days.includes(day.value)).map((day) => day.label.slice(0, 3)).join(' · ');
}

function stateLabel(state) {
  return ({ planned: 'PLANNED', done: 'DONE', partial: 'PARTIAL', missed: 'MISSED', skipped: 'SKIPPED', active: 'ACTIVE', paused: 'PAUSED', archived: 'ARCHIVED' })[state] ?? String(state).toUpperCase();
}

function mount() {
  if (mounted) return true;
  const host = document.querySelector('#maintenance-screen-content');
  if (!host) return false;
  mounted = true;
  host.innerHTML = `
    <section class="calm-section maintenance-panel">
      <div class="maintenance-toolbar">
        <div class="maintenance-toolbar-copy"><strong>Protect normal functioning.</strong><span>Maintenance is not growth scoring. It keeps basic life systems from drifting.</span></div>
        <button type="button" class="maintenance-primary" data-maintenance-action="new">New maintenance</button>
      </div>
      <div class="maintenance-notice" id="maintenance-notice">Checking local vault…</div>
      <form class="maintenance-editor" id="maintenance-editor" hidden>
        <div class="maintenance-grid-two">
          <div class="maintenance-field"><label for="maintenance-title">Maintenance</label><input id="maintenance-title" name="title" autocomplete="off" placeholder="Example: Wind down for sleep" /></div>
          <div class="maintenance-field"><label for="maintenance-category">Category</label><select id="maintenance-category" name="category"><option value="">Choose category</option>${MAINTENANCE_CATEGORIES.map((key) => `<option value="${key}">${escapeHtml(CATEGORY_LABELS[key])}</option>`).join('')}</select></div>
        </div>
        <div class="maintenance-field"><label for="maintenance-area">Life department</label><select id="maintenance-area" name="areaId"><option value="">Choose department</option>${DEFAULT_LIFE_AREAS.map((area) => `<option value="${area.id}">${escapeHtml(area.name)}</option>`).join('')}</select></div>
        <div class="maintenance-field"><label for="maintenance-purpose">Purpose</label><textarea id="maintenance-purpose" name="purpose" placeholder="What normal functioning does this protect?"></textarea></div>
        <div class="maintenance-field"><label for="maintenance-minimum">Minimum Acceptable Condition</label><textarea id="maintenance-minimum" name="minimumCondition" placeholder="What is the minimum condition that counts as maintained today?"></textarea></div>
        <div class="maintenance-field"><span class="maintenance-days-label">Schedule</span><div class="maintenance-days">${DAY_OPTIONS.map((day) => `<label class="maintenance-day" title="${day.label}"><input type="checkbox" name="days" value="${day.value}" checked /><span>${day.short}</span></label>`).join('')}</div></div>
        <div class="maintenance-medical-note">Medication entries only track a routine you already follow. AbhiLife does not choose medicines, doses, or treatment.</div>
        <div class="maintenance-editor-actions"><button type="submit" class="maintenance-primary" id="maintenance-save">Save maintenance</button><button type="button" class="maintenance-secondary" data-maintenance-action="cancel-edit">Cancel</button></div>
      </form>
      <div class="maintenance-section-title"><strong>Today</strong><span id="maintenance-today-count">0 scheduled</span></div>
      <div class="maintenance-today-list" id="maintenance-today-list"></div>
      <div class="maintenance-section-title"><strong>Your maintenance</strong><button type="button" class="maintenance-text-button" id="maintenance-archive-toggle" data-maintenance-action="toggle-archived">Show archived</button></div>
      <div class="maintenance-list" id="maintenance-list"></div>
      <div class="maintenance-philosophy">Maintenance protects stability. A miss is evidence for review, not a growth score or a failed identity.</div>
    </section>`;
  host.addEventListener('click', onClick);
  document.querySelector('#maintenance-editor')?.addEventListener('submit', onSubmit);
  refresh();
  return true;
}

function setNotice(text, tone = '') {
  const node = document.querySelector('#maintenance-notice');
  if (!node) return;
  node.textContent = text;
  node.className = `maintenance-notice ${tone}`.trim();
}

function resetEditor() {
  editingId = null;
  const form = document.querySelector('#maintenance-editor');
  if (!form) return;
  form.reset();
  form.querySelectorAll('input[name="days"]').forEach((input) => { input.checked = true; });
  document.querySelector('#maintenance-save').textContent = 'Save maintenance';
  form.hidden = true;
}

function openNewEditor() {
  resetEditor();
  document.querySelector('#maintenance-editor').hidden = false;
  document.querySelector('#maintenance-title')?.focus();
}

function openEditEditor(id) {
  const item = items.find((entry) => entry.id === id);
  if (!item || item.state === 'archived') return;
  editingId = item.id;
  document.querySelector('#maintenance-title').value = item.title;
  document.querySelector('#maintenance-category').value = item.category;
  document.querySelector('#maintenance-area').value = item.areaId;
  document.querySelector('#maintenance-purpose').value = item.purpose;
  document.querySelector('#maintenance-minimum').value = item.minimumCondition;
  const days = item.schedule?.days ?? [0, 1, 2, 3, 4, 5, 6];
  document.querySelectorAll('#maintenance-editor input[name="days"]').forEach((input) => { input.checked = days.includes(Number(input.value)); });
  document.querySelector('#maintenance-save').textContent = 'Save changes';
  document.querySelector('#maintenance-editor').hidden = false;
}

function renderToday() {
  const list = document.querySelector('#maintenance-today-list');
  const count = document.querySelector('#maintenance-today-count');
  if (!list || !count) return;
  const events = todayRecord?.maintenanceEvents ?? [];
  count.textContent = `${events.length} scheduled`;
  if (!events.length) { list.innerHTML = '<div class="maintenance-empty">No active maintenance is scheduled for today.</div>'; return; }
  list.innerHTML = events.map((event) => {
    const guidance = event.reason ? getMissedReasonGuidance(event.reason) : '';
    const missedEditor = openMissedEventId === event.id ? `<div class="maintenance-missed-editor"><select data-maintenance-missed-reason="${event.id}"><option value="">Why was it missed?</option>${MISSED_REASONS.map((reason) => `<option value="${reason}" ${event.reason === reason ? 'selected' : ''}>${escapeHtml(REASON_LABELS[reason] ?? reason)}</option>`).join('')}</select><button type="button" data-maintenance-action="save-missed" data-event-id="${event.id}">Save missed</button></div>` : '';
    return `<article class="maintenance-today-item"><div class="maintenance-today-head"><div class="maintenance-today-copy"><strong>${escapeHtml(event.title)}</strong><small class="maintenance-category">${escapeHtml(CATEGORY_LABELS[event.category] ?? event.category)}</small><small>Minimum: ${escapeHtml(event.minimumCondition)}</small>${event.reason ? `<small>Reason: ${escapeHtml(REASON_LABELS[event.reason] ?? event.reason)}</small>` : ''}${guidance ? `<small>Next adjustment: ${escapeHtml(guidance)}</small>` : ''}</div><span class="maintenance-state ${event.state}">${stateLabel(event.state)}</span></div><div class="maintenance-result-actions"><button type="button" class="maintenance-done" data-maintenance-action="done" data-event-id="${event.id}">Done ✓</button><button type="button" data-maintenance-action="partial" data-event-id="${event.id}">Partial ◐</button><button type="button" data-maintenance-action="missed" data-event-id="${event.id}">Missed ×</button><button type="button" data-maintenance-action="skipped" data-event-id="${event.id}">Skip —</button></div>${missedEditor}</article>`;
  }).join('');
}

function renderItems() {
  const list = document.querySelector('#maintenance-list');
  const toggle = document.querySelector('#maintenance-archive-toggle');
  if (!list || !toggle) return;
  const archived = items.filter((item) => item.state === 'archived');
  const visible = showArchived ? archived : items.filter((item) => item.state !== 'archived');
  toggle.textContent = showArchived ? `Show current (${items.length - archived.length})` : `Show archived (${archived.length})`;
  if (!visible.length) { list.innerHTML = `<div class="maintenance-empty">${showArchived ? 'No archived maintenance.' : 'No maintenance yet. Add one basic system you want to protect.'}</div>`; return; }
  list.innerHTML = visible.map((item) => `<article class="maintenance-item"><div class="maintenance-item-head"><div class="maintenance-item-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(CATEGORY_LABELS[item.category])} · ${escapeHtml(areaName(item.areaId))} · ${escapeHtml(scheduleLabel(item))}</small><small>Purpose: ${escapeHtml(item.purpose)}</small><small>Minimum: ${escapeHtml(item.minimumCondition)}</small></div><span class="maintenance-state ${item.state}">${stateLabel(item.state)}</span></div><div class="maintenance-item-actions">${item.state === 'active' ? `<button type="button" class="maintenance-mini" data-maintenance-action="edit" data-maintenance-id="${item.id}">Edit</button><button type="button" class="maintenance-mini" data-maintenance-action="pause" data-maintenance-id="${item.id}">Pause</button><button type="button" class="maintenance-mini" data-maintenance-action="archive" data-maintenance-id="${item.id}">Archive</button>` : ''}${item.state === 'paused' ? `<button type="button" class="maintenance-mini" data-maintenance-action="edit" data-maintenance-id="${item.id}">Edit</button><button type="button" class="maintenance-mini" data-maintenance-action="resume" data-maintenance-id="${item.id}">Resume</button><button type="button" class="maintenance-mini" data-maintenance-action="archive" data-maintenance-id="${item.id}">Archive</button>` : ''}${item.state === 'archived' ? `<button type="button" class="maintenance-mini" data-maintenance-action="restore" data-maintenance-id="${item.id}">Restore</button>` : ''}</div></article>`).join('');
}

function render() { renderToday(); renderItems(); }

async function refresh() {
  if (storageMode === 'web-preview') { vaultReady = false; items = []; todayRecord = null; setNotice('Web preview shows Maintenance UI only. Personal data is saved only in the Android AbhiLife vault.'); render(); return; }
  if (!isNativeStorageAvailable()) { vaultReady = false; setNotice('Android storage bridge is unavailable.', 'danger'); render(); return; }
  try {
    const health = await verifyVault(nativeStorageBridge);
    if (!health.healthy) throw new Error('Connect a healthy AbhiLife vault to use Maintenance.');
    vaultReady = true;
    items = (await loadMaintenance(nativeStorageBridge)).items;
    todayRecord = (await syncMaintenanceEventsForDate(nativeStorageBridge, localDateISO())).record;
    setNotice('Maintenance is stored locally and records stability evidence without streaks or scores.', 'good');
    render();
  } catch (error) { vaultReady = false; items = []; todayRecord = null; setNotice(error.message, 'danger'); render(); }
}

function formInput() {
  const data = new FormData(document.querySelector('#maintenance-editor'));
  return { title: data.get('title'), category: data.get('category'), areaId: data.get('areaId'), purpose: data.get('purpose'), minimumCondition: data.get('minimumCondition'), days: data.getAll('days').map(Number) };
}

async function onSubmit(event) {
  event.preventDefault();
  if (!vaultReady) return;
  try {
    if (editingId) await editMaintenance(nativeStorageBridge, editingId, formInput());
    else await addMaintenance(nativeStorageBridge, formInput());
    resetEditor();
    await refresh();
  } catch (error) { setNotice(error.message, 'danger'); }
}

async function onClick(event) {
  const button = event.target.closest('[data-maintenance-action]');
  if (!button) return;
  const action = button.dataset.maintenanceAction;
  const id = button.dataset.maintenanceId;
  const eventId = button.dataset.eventId;
  if (action === 'new') return openNewEditor();
  if (action === 'cancel-edit') return resetEditor();
  if (action === 'toggle-archived') { showArchived = !showArchived; renderItems(); return; }
  if (action === 'edit') return openEditEditor(id);
  if (!vaultReady) return;
  try {
    if (action === 'pause') await pauseMaintenance(nativeStorageBridge, id);
    else if (action === 'resume') await resumeMaintenance(nativeStorageBridge, id);
    else if (action === 'archive') await archiveMaintenance(nativeStorageBridge, id);
    else if (action === 'restore') await restoreMaintenance(nativeStorageBridge, id);
    else if (action === 'missed') { openMissedEventId = eventId; renderToday(); return; }
    else if (action === 'save-missed') {
      const reason = document.querySelector(`[data-maintenance-missed-reason="${CSS.escape(eventId)}"]`)?.value;
      await recordMaintenanceOutcome(nativeStorageBridge, localDateISO(), eventId, 'missed', { reason });
      openMissedEventId = null;
    } else if (['done', 'partial', 'skipped'].includes(action)) {
      await recordMaintenanceOutcome(nativeStorageBridge, localDateISO(), eventId, action);
      openMissedEventId = null;
    }
    await refresh();
  } catch (error) { setNotice(error.message, 'danger'); }
}

function boot() {
  if (!mount()) requestAnimationFrame(boot);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
