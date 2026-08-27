import './execution.css';
import { MISSED_REASONS } from '../core/system.js';
import { getStorageMode } from '../storage/storage.js';
import { isNativeStorageAvailable, nativeStorageBridge } from '../storage/nativeBridge.js';
import { verifyVault } from '../storage/vault.js';
import {
  ensureGoalNextActionOnDate,
  listActivationCandidates,
  loadTodayRecord,
  localDateISO,
  recordTaskOutcome,
  setImportantWin
} from './today.js';

const storageMode = getStorageMode();
let mounted = false;
let record = null;
let openMissedEventId = null;

const REASON_LABELS = Object.freeze({
  forgot:'Forgot', no_time:'No time', low_energy:'Low energy', too_difficult:'Too difficult', too_large:'Too large', unclear:'Unclear next action', distraction:'Distraction', unexpected_work:'Unexpected work', not_important_now:'Not important now', other:'Other'
});

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function mount() {
  if (mounted) return true;
  const panel = document.querySelector('.today-panel');
  if (!panel) return false;
  mounted = true;
  panel.innerHTML = `
    <div class="panel-title-row">
      <div><span class="panel-label label-blue">TODAY EXECUTION</span><h3>Do the next useful thing.</h3></div>
      <span class="status-stamp stamp-blue" id="today-count">0 TASKS</span>
    </div>
    <div class="today-notice" id="today-notice">Checking local vault…</div>
    <div class="today-task-list" id="today-task-list"></div>
    <div class="recovery-copy">One missed task does not make the day a failure. Record what happened, then continue with the remaining day.</div>
  `;
  panel.addEventListener('click', onClick);
  panel.addEventListener('change', onChange);
  refresh();
  return true;
}

function setNotice(text, tone='') {
  const el = document.querySelector('#today-notice');
  if (!el) return;
  el.textContent = text;
  el.className = `today-notice ${tone}`.trim();
}

function stateLabel(state) {
  return ({planned:'PLANNED',done:'DONE',partial:'PARTIAL',missed:'MISSED',skipped:'SKIPPED'})[state] ?? state.toUpperCase();
}

function render() {
  const list = document.querySelector('#today-task-list');
  const count = document.querySelector('#today-count');
  if (!list || !count) return;
  const items = record?.taskEvents ?? [];
  count.textContent = `${items.length} TASK${items.length === 1 ? '' : 'S'}`;
  if (!items.length) {
    list.innerHTML = `<div class="today-empty"><strong>Today is clear.</strong><span>Activate a Ready goal and its current Next Action will appear here.</span></div>`;
    return;
  }
  const importantId = record.importantWinTaskId;
  list.innerHTML = items.map((item) => {
    const important = item.id === importantId;
    const missedEditor = openMissedEventId === item.id ? `
      <div class="missed-editor">
        <select data-missed-reason="${item.id}" aria-label="Why was this missed?">
          <option value="">Why was it missed?</option>
          ${MISSED_REASONS.map((reason) => `<option value="${reason}" ${item.reason === reason ? 'selected' : ''}>${escapeHtml(REASON_LABELS[reason] ?? reason)}</option>`).join('')}
        </select>
        <button type="button" data-today-action="save-missed" data-event-id="${item.id}">Save Missed</button>
      </div>` : '';
    return `<article class="today-task ${important ? 'important' : ''} state-${item.state}">
      <div class="today-status-row">
        <div class="today-task-copy">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.durationMinutes} min${item.trigger ? ` · Trigger: ${escapeHtml(item.trigger)}` : ''}</small>
          <small>Done when: ${escapeHtml(item.doneCondition)}</small>
          ${item.reason ? `<small>Reason: ${escapeHtml(REASON_LABELS[item.reason] ?? item.reason)}</small>` : ''}
        </div>
        <span class="mini-stamp today-state ${item.state}">${stateLabel(item.state)}</span>
      </div>
      <div class="activation-meta">
        ${important ? '<span class="mini-stamp pink">MOST IMPORTANT WIN</span>' : ''}
        <span class="mini-stamp blue">GOAL ACTION</span>
      </div>
      <div class="today-result-actions">
        <button type="button" data-today-action="done" data-event-id="${item.id}">Done ✓</button>
        <button type="button" data-today-action="partial" data-event-id="${item.id}">Partial ◐</button>
        <button type="button" data-today-action="missed" data-event-id="${item.id}">Missed ×</button>
        <button type="button" data-today-action="skipped" data-event-id="${item.id}">Skip —</button>
        ${important ? '' : `<button class="important-button" type="button" data-today-action="important" data-event-id="${item.id}">Make Important Win</button>`}
      </div>
      ${missedEditor}
    </article>`;
  }).join('');
}

async function syncActiveGoals(dateISO) {
  const candidates = await listActivationCandidates(nativeStorageBridge);
  for (const { goal } of candidates) {
    if (goal.state === 'active') await ensureGoalNextActionOnDate(nativeStorageBridge, goal.id, dateISO);
  }
}

async function refresh() {
  const dateISO = localDateISO();
  if (storageMode === 'web-preview') {
    record = null;
    setNotice('Web preview shows the interface only. Daily execution is saved only in the Android AbhiLife vault.');
    render();
    return;
  }
  if (!isNativeStorageAvailable()) {
    record = null;
    setNotice('Android storage bridge is unavailable.', 'danger');
    render();
    return;
  }
  try {
    const health = await verifyVault(nativeStorageBridge);
    if (!health.healthy) throw new Error('Connect a healthy AbhiLife vault to use Today.');
    await syncActiveGoals(dateISO);
    record = await loadTodayRecord(nativeStorageBridge, dateISO);
    setNotice('Today is synced from Active goals. Results are written to this date’s permanent daily record.', 'good');
    render();
  } catch (error) {
    record = null;
    setNotice(error.message, 'danger');
    render();
  }
}

async function onClick(event) {
  const button = event.target.closest('[data-today-action]');
  if (!button || storageMode === 'web-preview') return;
  const action = button.dataset.todayAction;
  const eventId = button.dataset.eventId;
  if (action === 'missed') {
    openMissedEventId = openMissedEventId === eventId ? null : eventId;
    render();
    return;
  }
  button.disabled = true;
  try {
    const dateISO = localDateISO();
    if (action === 'important') await setImportantWin(nativeStorageBridge, dateISO, eventId);
    if (action === 'done' || action === 'partial' || action === 'skipped') {
      await recordTaskOutcome(nativeStorageBridge, dateISO, eventId, action);
    }
    if (action === 'save-missed') {
      const select = document.querySelector(`[data-missed-reason="${CSS.escape(eventId)}"]`);
      const reason = select?.value ?? '';
      await recordTaskOutcome(nativeStorageBridge, dateISO, eventId, 'missed', { reason });
      openMissedEventId = null;
    }
    await refresh();
  } catch (error) {
    setNotice(error.message, 'danger');
    button.disabled = false;
  }
}

function onChange() {}

window.addEventListener('abhilife:today-changed', refresh);

if (!mount()) {
  const observer = new MutationObserver(() => {
    if (mount()) observer.disconnect();
  });
  observer.observe(document.body, { childList:true, subtree:true });
}
