import './execution.css';
import { getStorageMode } from '../storage/storage.js';
import { isNativeStorageAvailable, nativeStorageBridge } from '../storage/nativeBridge.js';
import { verifyVault } from '../storage/vault.js';
import {
  activateGoal,
  addPlanTaskToDay,
  listExecutionGoals,
  loadDailyRecord,
  localDateISO,
  recordTaskOutcome,
  removePlannedTaskFromDay,
  setImportantWin
} from './execution.js';

const storageMode = getStorageMode();
let ready = false;
let executionGoals = [];
let todayRecord = null;

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

async function ensureReady() {
  if (storageMode === 'web-preview' || !isNativeStorageAvailable()) return false;
  const health = await verifyVault(nativeStorageBridge);
  return Boolean(health.healthy);
}

function goalCardHtml({ goal, plan }) {
  const active = goal.state === 'active';
  const next = plan?.tasks.find((task) => task.id === plan.nextActionTaskId) ?? null;
  return `
    <article class="execution-goal ${active ? 'is-active' : ''}">
      <div class="execution-goal-head">
        <div>
          <span class="execution-state ${active ? 'active' : 'ready'}">${active ? 'ACTIVE' : 'READY TO ACTIVATE'}</span>
          <strong>${esc(goal.title)}</strong>
          <small>${esc(goal.areaId)} · ${esc(goal.priority)} priority · ${esc(goal.availableMinutesPerWeek)} min/week</small>
        </div>
        ${active ? '<span class="status-stamp stamp-green">LIVE</span>' : `<button class="mini-button execution-activate" data-activate-goal="${esc(goal.id)}">Activate</button>`}
      </div>
      ${next ? `<div class="execution-next"><span>NEXT ACTION</span><strong>${esc(next.title)}</strong><small>${esc(next.durationMinutes)} min${next.trigger ? ` · ${esc(next.trigger)}` : ''}</small></div>` : ''}
      ${active ? `
        <div class="execution-task-pool">
          ${plan.tasks.map((task) => `<button class="task-pick" data-send-today-goal="${esc(goal.id)}" data-send-today-task="${esc(task.id)}"><span>${esc(task.title)}</span><small>${esc(task.durationMinutes)} min · Add to Today</small></button>`).join('')}
        </div>
      ` : ''}
    </article>
  `;
}

function renderActivation() {
  const card = document.querySelector('#goal-activation-card');
  if (!card) return;
  const list = card.querySelector('#goal-activation-list');
  const overview = card.querySelector('#goal-activation-overview');
  if (!ready) {
    overview.textContent = storageMode === 'web-preview' ? 'Android-only: activation writes to your local AbhiLife vault.' : 'Connect a healthy AbhiLife vault to activate goals.';
    list.innerHTML = '';
    return;
  }
  const activeCount = executionGoals.filter(({ goal }) => goal.state === 'active').length;
  overview.textContent = `${activeCount} active goal${activeCount === 1 ? '' : 's'} · activate only goals you truly intend to execute now.`;
  list.innerHTML = executionGoals.length ? executionGoals.map(goalCardHtml).join('') : '<div class="breakdown-empty"><strong>No Ready plans yet.</strong><span>Finish a Goal Breakdown and mark it Ready first.</span></div>';
}

function outcomeButton(event, state, label) {
  const active = event.state === state ? ' active' : '';
  return `<button class="outcome-chip${active}" data-outcome="${state}" data-event-id="${event.id}">${label}</button>`;
}

function renderToday() {
  const host = document.querySelector('#today-screen-content');
  if (!host) return;
  let panel = document.querySelector('#daily-execution-panel');
  if (!panel) {
    panel = document.createElement('article');
    panel.id = 'daily-execution-panel';
    panel.className = 'tactile-panel shadow-blue daily-execution-panel';
    host.replaceChildren(panel);
  }
  if (!ready) {
    panel.innerHTML = `<div class="panel-title-row"><div><span class="panel-label label-blue">TODAY</span><h3>Daily execution</h3></div><span class="status-stamp">LOCKED</span></div><div class="empty-execution">${storageMode === 'web-preview' ? 'Web preview does not write personal execution data.' : 'Connect a healthy AbhiLife vault first.'}</div>`;
    return;
  }
  const events = todayRecord?.taskEvents ?? [];
  const win = events.find((item) => item.id === todayRecord?.importantWinTaskId) ?? null;
  panel.innerHTML = `
    <div class="panel-title-row">
      <div><span class="panel-label label-blue">${esc(todayRecord.date)}</span><h3>Today’s execution</h3></div>
      <span class="status-stamp stamp-blue">${events.length} TASK${events.length === 1 ? '' : 'S'}</span>
    </div>
    ${win ? `<div class="important-win"><span>MOST IMPORTANT WIN</span><strong>${esc(win.title)}</strong><small>${esc(win.durationMinutes)} min · ${esc(win.state)}</small></div>` : `<div class="empty-execution">Activate a goal and add one concrete task to Today. The first task becomes your Most Important Win automatically.</div>`}
    <div class="today-task-list">
      ${events.map((event) => `
        <article class="today-task ${event.state}">
          <div class="today-task-copy">
            <div class="today-task-top"><strong>${esc(event.title)}</strong>${todayRecord.importantWinTaskId === event.id ? '<span class="win-mark">WIN</span>' : ''}</div>
            <small>${esc(event.durationMinutes)} min${event.trigger ? ` · ${esc(event.trigger)}` : ''}</small>
            <span>Done when: ${esc(event.doneCondition)}</span>
          </div>
          <div class="outcome-row">
            ${outcomeButton(event, 'done', 'Done ✓')}
            ${outcomeButton(event, 'partial', 'Partial ◐')}
            ${outcomeButton(event, 'missed', 'Missed ×')}
            ${outcomeButton(event, 'skipped', 'Skipped —')}
          </div>
          <div class="today-task-actions">
            ${todayRecord.importantWinTaskId !== event.id ? `<button class="text-action" data-set-win="${event.id}">Make Most Important Win</button>` : ''}
            ${event.state === 'planned' ? `<button class="text-action danger" data-remove-day-task="${event.id}">Remove</button>` : ''}
          </div>
        </article>
      `).join('')}
    </div>
    <div class="day-principle">One bad hour ≠ one bad day. Record what happened, then use the remaining day.</div>
  `;
}

async function refresh() {
  try {
    ready = await ensureReady();
    if (ready) {
      [executionGoals, todayRecord] = await Promise.all([
        listExecutionGoals(nativeStorageBridge),
        loadDailyRecord(nativeStorageBridge, localDateISO())
      ]);
    } else {
      executionGoals = [];
      todayRecord = null;
    }
  } catch {
    ready = false;
    executionGoals = [];
    todayRecord = null;
  }
  renderActivation();
  renderToday();
}

function mountActivationCard() {
  if (document.querySelector('#goal-activation-card')) return;
  const flow = document.querySelector('#goals-flow');
  if (!flow) return;
  const card = document.createElement('article');
  card.id = 'goal-activation-card';
  card.className = 'card tactile-panel goal-stage-card shadow-yellow';
  card.dataset.goalStage = 'activate';
  card.innerHTML = `
    <div class="card-header"><div><h3>Goal Activation</h3><p class="card-subtitle">Move a Ready plan into real execution. Activation is a commitment state, not a reward.</p></div><span class="badge status-stamp">EXECUTE</span></div>
    <div class="activation-overview" id="goal-activation-overview">Checking…</div>
    <div class="activation-list" id="goal-activation-list"></div>
  `;
  flow.append(card);
}

function handleClick(event) {
  const activate = event.target.closest('[data-activate-goal]');
  const send = event.target.closest('[data-send-today-task]');
  const outcome = event.target.closest('[data-outcome]');
  const win = event.target.closest('[data-set-win]');
  const remove = event.target.closest('[data-remove-day-task]');
  if (!activate && !send && !outcome && !win && !remove) return;

  (async () => {
    try {
      if (activate) await activateGoal(nativeStorageBridge, activate.dataset.activateGoal);
      if (send) await addPlanTaskToDay(nativeStorageBridge, send.dataset.sendTodayGoal, send.dataset.sendTodayTask);
      if (win) await setImportantWin(nativeStorageBridge, win.dataset.setWin);
      if (remove) await removePlannedTaskFromDay(nativeStorageBridge, remove.dataset.removeDayTask);
      if (outcome) {
        let reason = null;
        if (outcome.dataset.outcome === 'missed') {
          reason = window.prompt('Why was it missed? (forgot / no_time / low_energy / too_difficult / too_large / unclear / distraction / unexpected_work / not_important_now / other)', 'other') || 'other';
        }
        await recordTaskOutcome(nativeStorageBridge, outcome.dataset.eventId, outcome.dataset.outcome, { missedReason: reason });
      }
      await refresh();
    } catch (error) {
      window.alert(error.message);
    }
  })();
}

function mount() {
  const flow = document.querySelector('#goals-flow');
  const today = document.querySelector('#today-screen-content');
  if (!flow || !today) {
    requestAnimationFrame(mount);
    return;
  }
  mountActivationCard();
  document.addEventListener('click', handleClick);
  refresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
