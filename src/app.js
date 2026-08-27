import './styles.css';
import { APP_VERSION, LIFE_AREAS } from './core/system.js';
import {
  archiveInboxThought,
  captureInboxThought,
  editInboxThought,
  listInboxThoughts,
  restoreInboxThought
} from './inbox/inbox.js';
import { DATA_PATHS } from './storage/paths.js';
import { assertNoBrowserPersistence, getStorageMode } from './storage/storage.js';
import { isNativeStorageAvailable, nativeStorageBridge } from './storage/nativeBridge.js';
import { initializeNewVault, repairVault, snapshotVault, verifyVault } from './storage/vault.js';

const storageStatus = assertNoBrowserPersistence();
const storageMode = getStorageMode();

let vaultReady = false;
let editingThoughtId = null;
let showArchived = false;
let visibleInboxThoughts = [];

const areaRows = LIFE_AREAS.map((area) => `
  <div class="area">
    <div>
      <div class="area-name">${area}</div>
      <div class="area-state">No active review yet</div>
    </div>
    <span class="badge">Not assessed</span>
  </div>
`).join('');

document.querySelector('#app').innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">A</div>
        <div>
          <h1>AbhiLife</h1>
          <p>Personal Improvement System · v${APP_VERSION}</p>
        </div>
      </div>
      <div class="mode-pill">${storageMode === 'web-preview' ? 'Web Preview' : 'Android'}</div>
    </header>

    <section class="hero">
      <div class="eyebrow">Life Inbox</div>
      <h2>Capture first. Decide later.</h2>
      <p>Get thoughts out of your head without turning every idea into a goal. The Android app stores them only inside your connected AbhiLife folder.</p>
    </section>

    <section class="grid dashboard-grid">
      <div class="grid">
        <article class="card" id="local-data-card">
          <div class="card-header">
            <div>
              <h3>Local Life Data</h3>
              <p class="card-subtitle">Your master data belongs to your AbhiLife folder, not the web.</p>
            </div>
            <span class="badge" id="storage-badge">Checking</span>
          </div>
          <div id="storage-panel" class="storage-panel">
            <div class="status-line">${storageStatus.message}</div>
          </div>
        </article>

        <article class="card">
          <div class="card-header">
            <div>
              <h3>Life Inbox</h3>
              <p class="card-subtitle">Raw thoughts only. Goal investigation comes later.</p>
            </div>
            <span class="badge" id="inbox-count-badge">Checking</span>
          </div>

          <form class="inbox-compose" id="inbox-form">
            <textarea id="inbox-input" rows="3" placeholder="What is on your mind?" autocomplete="off"></textarea>
            <div class="inbox-compose-actions">
              <button class="primary" id="inbox-submit" type="submit">Capture</button>
              <button class="secondary" id="inbox-cancel" type="button" hidden>Cancel</button>
            </div>
          </form>

          <div class="inbox-toolbar">
            <div class="notice compact" id="inbox-notice">Checking local vault…</div>
            <button class="text-button" id="inbox-archive-toggle" type="button" hidden>Show archived</button>
          </div>
          <div class="inbox-list" id="inbox-list"></div>
        </article>

        <article class="card">
          <div class="card-header">
            <div>
              <h3>Today</h3>
              <p class="card-subtitle">This screen stays intentionally small while the execution engine is built.</p>
            </div>
            <span class="badge">Preview</span>
          </div>
          <div class="task-list">
            <div class="task"><div class="check"></div><div><strong>Most Important Win</strong><span>One meaningful action will be highlighted here.</span></div></div>
            <div class="task"><div class="check"></div><div><strong>Must Do</strong><span>Important actions generated from active goals.</span></div></div>
            <div class="task"><div class="check"></div><div><strong>Maintain</strong><span>Necessary routines that protect stability.</span></div></div>
          </div>
        </article>
      </div>

      <article class="card">
        <div class="card-header">
          <div>
            <h3>Life Departments</h3>
            <p class="card-subtitle">Status, not artificial percentage scores.</p>
          </div>
        </div>
        <div class="area-list">${areaRows}</div>
      </article>
    </section>
  </main>

  <nav class="bottom-nav" aria-label="Primary">
    <button class="nav-item"><span class="nav-icon">⌂</span>Today</button>
    <button class="nav-item active"><span class="nav-icon">＋</span>Inbox</button>
    <button class="nav-item"><span class="nav-icon">◎</span>Goals</button>
    <button class="nav-item"><span class="nav-icon">↻</span>Habits</button>
    <button class="nav-item"><span class="nav-icon">☰</span>More</button>
  </nav>
`;

const storagePanel = document.querySelector('#storage-panel');
const storageBadge = document.querySelector('#storage-badge');
const inboxForm = document.querySelector('#inbox-form');
const inboxInput = document.querySelector('#inbox-input');
const inboxSubmit = document.querySelector('#inbox-submit');
const inboxCancel = document.querySelector('#inbox-cancel');
const inboxNotice = document.querySelector('#inbox-notice');
const inboxList = document.querySelector('#inbox-list');
const inboxCountBadge = document.querySelector('#inbox-count-badge');
const inboxArchiveToggle = document.querySelector('#inbox-archive-toggle');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatCapturedAt(value) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function renderStoragePanel({ badge, detail, actions = [], tone = '' }) {
  storageBadge.textContent = badge;
  storagePanel.innerHTML = `
    <div class="status-line ${tone}">${escapeHtml(detail)}</div>
    ${actions.length ? `<div class="storage-actions">${actions.map((action) => `
      <button type="button" class="${action.primary ? 'primary' : 'secondary'}" data-storage-action="${action.id}">${escapeHtml(action.label)}</button>
    `).join('')}</div>` : ''}
  `;
}

function setInboxNotice(message, tone = '') {
  inboxNotice.textContent = message;
  inboxNotice.className = `notice compact ${tone}`.trim();
}

function setInboxEnabled(enabled) {
  inboxInput.disabled = !enabled;
  inboxSubmit.disabled = !enabled;
  if (!enabled) resetInboxEditor();
}

function resetInboxEditor() {
  editingThoughtId = null;
  inboxInput.value = '';
  inboxSubmit.textContent = 'Capture';
  inboxCancel.hidden = true;
}

function renderInboxItems(items) {
  visibleInboxThoughts = items;
  if (!items.length) {
    inboxList.innerHTML = `
      <div class="empty-state">
        <strong>${showArchived ? 'No archived thoughts' : 'Your inbox is clear'}</strong>
        <span>${showArchived ? 'Archived thoughts will appear here.' : 'Write anything above. You do not need to organize it yet.'}</span>
      </div>
    `;
    return;
  }

  inboxList.innerHTML = items.map((thought) => `
    <article class="inbox-item ${thought.state === 'archived' ? 'archived' : ''}">
      <div class="inbox-item-copy">
        <p>${escapeHtml(thought.text)}</p>
        <span>${thought.state === 'archived' ? 'Archived' : 'Captured'} · ${escapeHtml(formatCapturedAt(thought.state === 'archived' ? thought.archivedAt : thought.createdAt))}</span>
      </div>
      <div class="inbox-item-actions">
        ${thought.state === 'archived'
          ? `<button class="mini-button" type="button" data-inbox-action="restore" data-thought-id="${thought.id}">Restore</button>`
          : `
            <button class="mini-button" type="button" data-inbox-action="edit" data-thought-id="${thought.id}">Edit</button>
            <button class="mini-button danger-text" type="button" data-inbox-action="archive" data-thought-id="${thought.id}">Archive</button>
          `}
      </div>
    </article>
  `).join('');
}

async function refreshInboxPanel() {
  if (storageMode === 'web-preview') {
    setInboxEnabled(false);
    inboxCountBadge.textContent = 'Native only';
    inboxArchiveToggle.hidden = true;
    setInboxNotice('Web preview does not save personal thoughts. Use the Android build with your connected AbhiLife folder.');
    renderInboxItems([]);
    return;
  }

  if (!isNativeStorageAvailable() || !vaultReady) {
    setInboxEnabled(false);
    inboxCountBadge.textContent = 'Locked';
    inboxArchiveToggle.hidden = true;
    setInboxNotice('Connect a healthy AbhiLife vault before capturing thoughts.');
    renderInboxItems([]);
    return;
  }

  try {
    const allThoughts = await listInboxThoughts(nativeStorageBridge, { includeArchived: true });
    const active = allThoughts.filter((thought) => thought.state === 'inbox');
    const archived = allThoughts.filter((thought) => thought.state === 'archived');
    const items = showArchived ? archived : active;

    setInboxEnabled(true);
    inboxCountBadge.textContent = showArchived ? `${archived.length} archived` : `${active.length} active`;
    inboxArchiveToggle.hidden = archived.length === 0 && !showArchived;
    inboxArchiveToggle.textContent = showArchived
      ? `Show active (${active.length})`
      : `Show archived (${archived.length})`;
    setInboxNotice('Saved locally in your connected AbhiLife folder. Each change uses the recovery-safe write path.', 'good');
    renderInboxItems(items);
  } catch (error) {
    setInboxEnabled(false);
    inboxCountBadge.textContent = 'Read error';
    setInboxNotice(error.message, 'danger');
    renderInboxItems([]);
  }
}

async function refreshStoragePanel() {
  vaultReady = false;

  if (storageMode === 'web-preview') {
    renderStoragePanel({
      badge: 'Web preview',
      detail: 'Personal data is intentionally not saved in this browser preview. The Android app uses a user-owned AbhiLife folder.'
    });
    return;
  }

  if (!isNativeStorageAvailable()) {
    renderStoragePanel({
      badge: 'Unavailable',
      detail: 'The Android storage bridge is not available in this build.',
      tone: 'danger'
    });
    return;
  }

  try {
    const root = await nativeStorageBridge.getRootStatus();
    if (!root.connected) {
      renderStoragePanel({
        badge: root.needsReconnect ? 'Reconnect' : 'Not connected',
        detail: 'Create or select a folder named AbhiLife in Android’s folder picker. AbhiLife will only receive access to that folder.',
        actions: [{ id: 'connect', label: 'Connect AbhiLife Folder', primary: true }]
      });
      return;
    }

    const hasManifest = await nativeStorageBridge.exists(DATA_PATHS.manifest);
    if (!hasManifest) {
      renderStoragePanel({
        badge: 'Folder connected',
        detail: `Connected to ${root.displayName}. No AbhiLife vault exists here yet.`,
        actions: [
          { id: 'initialize', label: 'Create New Vault', primary: true },
          { id: 'disconnect', label: 'Disconnect' }
        ]
      });
      return;
    }

    const health = await verifyVault(nativeStorageBridge);
    if (health.healthy) {
      vaultReady = true;
      renderStoragePanel({
        badge: 'Protected',
        detail: `AbhiLife vault is connected, readable, and recovery-ready in ${root.displayName}.`,
        tone: 'good',
        actions: [
          { id: 'snapshot', label: 'Refresh Safety Snapshot' },
          { id: 'disconnect', label: 'Disconnect' }
        ]
      });
      return;
    }

    const canRepair = health.recoverableCount > 0;
    renderStoragePanel({
      badge: canRepair ? 'Recovery available' : 'Needs repair',
      detail: canRepair
        ? `${health.issues.length} data health issue(s) detected; ${health.recoverableCount} can be restored from validated last-known-good copies.`
        : `${health.issues.length} data health issue(s) detected. Automatic restore is not available for these issue(s).`,
      tone: 'danger',
      actions: [
        ...(canRepair ? [{ id: 'repair', label: 'Restore Safe Copy', primary: true }] : []),
        { id: 'disconnect', label: 'Disconnect' }
      ]
    });
  } catch (error) {
    renderStoragePanel({
      badge: 'Storage error',
      detail: error.message,
      tone: 'danger',
      actions: [{ id: 'connect', label: 'Reconnect Folder', primary: true }]
    });
  }
}

async function refreshAll() {
  await refreshStoragePanel();
  await refreshInboxPanel();
}

storagePanel.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-storage-action]');
  if (!button) return;
  const action = button.dataset.storageAction;
  button.disabled = true;

  try {
    if (action === 'connect') await nativeStorageBridge.chooseRoot();
    if (action === 'initialize') await initializeNewVault(nativeStorageBridge);
    if (action === 'snapshot') {
      const result = await snapshotVault(nativeStorageBridge);
      if (!result.ok) throw new Error(`Safety snapshot failed: ${result.errors[0].message}`);
    }
    if (action === 'repair') {
      const result = await repairVault(nativeStorageBridge);
      if (!result.ok) throw new Error(result.failed[0]?.message ?? 'Vault repair could not restore a healthy state.');
    }
    if (action === 'disconnect') await nativeStorageBridge.releaseRoot();
  } catch (error) {
    renderStoragePanel({ badge: 'Action failed', detail: error.message, tone: 'danger' });
    button.disabled = false;
    return;
  }

  await refreshAll();
});

inboxForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (storageMode === 'web-preview') {
    setInboxNotice('Preview only: browser persistence is intentionally disabled.');
    return;
  }
  if (!vaultReady) {
    setInboxNotice('Connect a healthy AbhiLife vault before saving.', 'danger');
    return;
  }

  inboxSubmit.disabled = true;
  const text = inboxInput.value;

  try {
    if (editingThoughtId) {
      await editInboxThought(nativeStorageBridge, editingThoughtId, text);
    } else {
      await captureInboxThought(nativeStorageBridge, text);
    }
    resetInboxEditor();
    await refreshInboxPanel();
  } catch (error) {
    setInboxNotice(error.message, 'danger');
  } finally {
    inboxSubmit.disabled = !vaultReady;
  }
});

inboxCancel.addEventListener('click', () => {
  resetInboxEditor();
  inboxInput.focus();
});

inboxArchiveToggle.addEventListener('click', async () => {
  showArchived = !showArchived;
  resetInboxEditor();
  await refreshInboxPanel();
});

inboxList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-inbox-action]');
  if (!button || !vaultReady) return;

  const thought = visibleInboxThoughts.find((item) => item.id === button.dataset.thoughtId);
  if (!thought) return;

  const action = button.dataset.inboxAction;
  if (action === 'edit') {
    editingThoughtId = thought.id;
    inboxInput.value = thought.text;
    inboxSubmit.textContent = 'Save changes';
    inboxCancel.hidden = false;
    inboxInput.focus();
    return;
  }

  button.disabled = true;
  try {
    if (action === 'archive') await archiveInboxThought(nativeStorageBridge, thought.id);
    if (action === 'restore') await restoreInboxThought(nativeStorageBridge, thought.id);
    resetInboxEditor();
    await refreshInboxPanel();
  } catch (error) {
    setInboxNotice(error.message, 'danger');
    button.disabled = false;
  }
});

refreshAll();
