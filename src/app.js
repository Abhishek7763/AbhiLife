import './styles.css';
import { APP_VERSION, LIFE_AREAS } from './core/system.js';
import { DATA_PATHS } from './storage/paths.js';
import { assertNoBrowserPersistence, getStorageMode } from './storage/storage.js';
import { isNativeStorageAvailable, nativeStorageBridge } from './storage/nativeBridge.js';
import { initializeNewVault, repairVault, snapshotVault, verifyVault } from './storage/vault.js';

const storageStatus = assertNoBrowserPersistence();
const storageMode = getStorageMode();

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
      <div class="eyebrow">Storage Foundation</div>
      <h2>Do the next right thing.</h2>
      <p>AbhiLife is being built as a private life system: capture what matters, turn real goals into clear actions, execute today, learn from misses, and preserve the history.</p>
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
              <h3>Today</h3>
              <p class="card-subtitle">The final product will keep this screen intentionally small.</p>
            </div>
            <span class="badge">Preview</span>
          </div>
          <div class="task-list">
            <div class="task"><div class="check"></div><div><strong>Most Important Win</strong><span>One meaningful action will be highlighted here.</span></div></div>
            <div class="task"><div class="check"></div><div><strong>Must Do</strong><span>Important actions generated from active goals.</span></div></div>
            <div class="task"><div class="check"></div><div><strong>Maintain</strong><span>Necessary routines that protect stability.</span></div></div>
          </div>
        </article>

        <article class="card">
          <div class="card-header">
            <div>
              <h3>Life Inbox</h3>
              <p class="card-subtitle">Capture first. Investigate later.</p>
            </div>
            <span class="badge">Unlimited thoughts</span>
          </div>
          <form class="quick-input" id="inbox-preview-form">
            <input id="inbox-preview" placeholder="Write anything on your mind…" autocomplete="off" />
            <button class="primary" type="submit">Capture</button>
          </form>
          <div class="notice" id="preview-notice">Inbox persistence is not enabled in this foundation build yet.</div>
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
    <button class="nav-item active"><span class="nav-icon">⌂</span>Today</button>
    <button class="nav-item"><span class="nav-icon">＋</span>Inbox</button>
    <button class="nav-item"><span class="nav-icon">◎</span>Goals</button>
    <button class="nav-item"><span class="nav-icon">↻</span>Habits</button>
    <button class="nav-item"><span class="nav-icon">☰</span>More</button>
  </nav>
`;

const storagePanel = document.querySelector('#storage-panel');
const storageBadge = document.querySelector('#storage-badge');

function renderStoragePanel({ badge, detail, actions = [], tone = '' }) {
  storageBadge.textContent = badge;
  storagePanel.innerHTML = `
    <div class="status-line ${tone}">${detail}</div>
    ${actions.length ? `<div class="storage-actions">${actions.map((action) => `
      <button type="button" class="${action.primary ? 'primary' : 'secondary'}" data-storage-action="${action.id}">${action.label}</button>
    `).join('')}</div>` : ''}
  `;
}

async function refreshStoragePanel() {
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
    return;
  }

  await refreshStoragePanel();
});

document.querySelector('#inbox-preview-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#inbox-preview');
  const value = input.value.trim();
  if (!value) return;

  document.querySelector('#preview-notice').textContent = storageMode === 'web-preview'
    ? 'Preview only: this thought was not saved. Browser persistence is intentionally disabled.'
    : 'Storage foundation is active, but Inbox saving will be enabled in the dedicated Inbox phase.';
  input.value = '';
});

refreshStoragePanel();
