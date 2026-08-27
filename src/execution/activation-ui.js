import './execution.css';
import { getStorageMode } from '../storage/storage.js';
import { isNativeStorageAvailable, nativeStorageBridge } from '../storage/nativeBridge.js';
import { verifyVault } from '../storage/vault.js';
import { activateGoal, listActivationCandidates, localDateISO } from './today.js';

const storageMode = getStorageMode();
let mounted = false;
let candidates = [];

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function ensureActivationTab() {
  const tabs = document.querySelector('.goal-stage-tabs');
  if (!tabs || tabs.querySelector('[data-goal-stage="activate"]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'segment-tab';
  button.dataset.goalStage = 'activate';
  button.textContent = 'Activate';
  tabs.append(button);
  tabs.addEventListener('click', (event) => {
    const target = event.target.closest('[data-goal-stage="activate"]');
    if (!target) return;
    tabs.querySelectorAll('[data-goal-stage]').forEach((item) => item.classList.toggle('active', item === target));
    document.querySelectorAll('.goal-stage-card').forEach((card) => {
      card.hidden = card.dataset.goalStage !== 'activate';
    });
  });
}

function mount() {
  if (mounted) return true;
  const flow = document.querySelector('#goals-flow');
  if (!flow) return false;
  mounted = true;
  ensureActivationTab();
  const card = document.createElement('article');
  card.id = 'goal-activation-card';
  card.className = 'card tactile-panel shadow-pink goal-stage-card';
  card.dataset.goalStage = 'activate';
  card.hidden = true;
  card.innerHTML = `
    <div class="card-header">
      <div><h3>Activate</h3><p class="card-subtitle">Start only goals whose breakdown is Ready. Activation sends the current Next Action to Today.</p></div>
      <span class="badge status-stamp" id="activation-count">Checking</span>
    </div>
    <div class="activation-overview" id="activation-overview">Checking local vault…</div>
    <div class="activation-list" id="activation-list"></div>
  `;
  flow.append(card);
  card.addEventListener('click', onClick);
  refresh();
  return true;
}

function renderList() {
  const list = document.querySelector('#activation-list');
  const count = document.querySelector('#activation-count');
  if (!list || !count) return;
  const active = candidates.filter(({goal}) => goal.state === 'active');
  const ready = candidates.filter(({goal}) => goal.state === 'defined');
  count.textContent = `${active.length} active · ${ready.length} ready`;
  if (!candidates.length) {
    list.innerHTML = `<div class="today-empty"><strong>No goal is ready to activate.</strong><span>Finish Goal Definition and mark its Breakdown Ready first.</span></div>`;
    return;
  }
  list.innerHTML = candidates.map(({goal,plan}) => {
    const next = plan?.tasks?.find((task) => task.id === plan.nextActionTaskId);
    const isActive = goal.state === 'active';
    return `<article class="activation-item ${isActive ? 'active-goal' : ''}">
      <div class="activation-copy">
        <strong>${escapeHtml(goal.title)}</strong>
        <small>${escapeHtml(goal.areaId)} · ${escapeHtml(goal.priority)} priority</small>
        <div class="activation-meta">
          <span class="mini-stamp ${isActive ? 'green' : 'blue'}">${isActive ? 'ACTIVE' : 'READY'}</span>
          ${next ? `<span class="mini-stamp pink">NEXT: ${escapeHtml(next.title)}</span>` : ''}
        </div>
      </div>
      <div class="activation-actions">
        ${isActive
          ? `<button type="button" data-activation-action="sync" data-goal-id="${goal.id}">Send to Today</button>`
          : `<button class="activate-button" type="button" data-activation-action="activate" data-goal-id="${goal.id}">Activate Goal</button>`}
      </div>
    </article>`;
  }).join('');
}

function setOverview(text, tone='') {
  const el = document.querySelector('#activation-overview');
  if (!el) return;
  el.textContent = text;
  el.className = `activation-overview ${tone}`.trim();
}

async function refresh() {
  if (storageMode === 'web-preview') {
    setOverview('Web preview does not activate personal goals. Use the Android app with your AbhiLife folder.');
    candidates = [];
    renderList();
    return;
  }
  if (!isNativeStorageAvailable()) {
    setOverview('Android storage bridge is unavailable in this build.', 'danger');
    candidates = [];
    renderList();
    return;
  }
  try {
    const health = await verifyVault(nativeStorageBridge);
    if (!health.healthy) throw new Error('Connect a healthy AbhiLife vault before activating goals.');
    candidates = await listActivationCandidates(nativeStorageBridge);
    setOverview('Activation changes the goal to Active and safely places its current Next Action in today’s daily record.', 'good');
    renderList();
  } catch (error) {
    candidates = [];
    setOverview(error.message, 'danger');
    renderList();
  }
}

async function onClick(event) {
  const button = event.target.closest('[data-activation-action]');
  if (!button || storageMode === 'web-preview') return;
  button.disabled = true;
  try {
    const result = await activateGoal(nativeStorageBridge, button.dataset.goalId, localDateISO());
    setOverview(result.created
      ? 'Goal is active. Its Next Action is now in Today.'
      : 'Goal is active and Today already contains this Next Action.', 'good');
    window.dispatchEvent(new CustomEvent('abhilife:today-changed'));
    await refresh();
  } catch (error) {
    setOverview(error.message, 'danger');
    button.disabled = false;
  }
}

window.addEventListener('abhilife:goals-changed', refresh);

if (!mount()) {
  const observer = new MutationObserver(() => {
    if (mount()) observer.disconnect();
  });
  observer.observe(document.body, { childList:true, subtree:true });
}
