import './styles.css';
import { APP_VERSION, LIFE_AREAS } from './core/system.js';
import { assertNoBrowserPersistence, getStorageMode } from './storage/storage.js';

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
      <div class="eyebrow">Foundation Build</div>
      <h2>Do the next right thing.</h2>
      <p>AbhiLife is being built as a private life system: capture what matters, turn real goals into clear actions, execute today, learn from misses, and preserve the history.</p>
    </section>

    <section class="grid dashboard-grid">
      <div class="grid">
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
          <div class="notice" id="preview-notice">${storageStatus.message}</div>
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

document.querySelector('#inbox-preview-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#inbox-preview');
  const value = input.value.trim();
  if (!value) return;

  document.querySelector('#preview-notice').textContent =
    'Preview only: this thought was not saved. Persistent personal data will only be written through the Android AbhiLife folder storage engine.';
  input.value = '';
});
