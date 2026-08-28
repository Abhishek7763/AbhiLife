import './redesign.css';
import { APP_VERSION } from '../core/system.js';

const SCREEN_ORDER = ['today', 'inbox', 'goals', 'more', 'habits', 'bad-habits'];
const GOAL_STAGES = {
  investigate: 'goal-investigation-card',
  define: 'goal-definition-card',
  plan: 'goal-breakdown-card',
  activate: 'goal-activation-card'
};

let currentScreen = 'today';
let currentGoalStage = 'investigate';
let mounted = false;
let goalObserver = null;

function byHeading(text) {
  return [...document.querySelectorAll('.card')].find((card) => card.querySelector('h3')?.textContent.trim() === text) ?? null;
}

function localDayLabel() {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(new Date());
  } catch {
    return 'Today';
  }
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function screenHeader({ eyebrow, title, copy }) {
  return `
    <header class="screen-header">
      <span class="screen-kicker">${eyebrow}</span>
      <h2>${title}</h2>
      ${copy ? `<p>${copy}</p>` : ''}
    </header>
  `;
}

function buildMoreMenu() {
  return `
    <section class="calm-menu" aria-label="More tools">
      <button type="button" class="calm-menu-row calm-menu-action" data-open-screen="habits"><div><strong>Habits</strong><span>Build useful behavior with cue and context</span></div><span class="menu-state">Open</span></button>
      <button type="button" class="calm-menu-row calm-menu-action" data-open-screen="bad-habits"><div><strong>Bad Habits</strong><span>Understand triggers, friction and replacements</span></div><span class="menu-state">Open</span></button>
      <div class="calm-menu-row"><div><strong>Maintenance</strong><span>Protect everyday stability</span></div><span class="menu-state">Later</span></div>
      <div class="calm-menu-row"><div><strong>Reviews</strong><span>Weekly and monthly reflection</span></div><span class="menu-state">Later</span></div>
      <div class="calm-menu-row"><div><strong>History</strong><span>Your 365-day evidence timeline</span></div><span class="menu-state">Later</span></div>
      <div class="calm-menu-row"><div><strong>Notes</strong><span>Ideas, lessons and reflections</span></div><span class="menu-state">Later</span></div>
    </section>
  `;
}

function buildScreens(shell) {
  const topbar = shell.querySelector('.topbar');
  const hero = shell.querySelector('.hero');
  const dashboard = shell.querySelector('.dashboard-grid');
  const inboxCard = document.querySelector('#inbox-form')?.closest('.card') ?? null;
  const storageCard = document.querySelector('#local-data-card');
  const todayCard = byHeading('Today');
  const departmentsCard = byHeading('Life Departments');

  const workspace = document.createElement('div');
  workspace.className = 'app-workspace';
  workspace.innerHTML = `
    <section class="app-screen" id="screen-today" data-screen="today">
      ${screenHeader({ eyebrow: greeting(), title: 'Today', copy: localDayLabel() })}
      <div class="screen-stack" id="today-screen-content"></div>
    </section>

    <section class="app-screen" id="screen-inbox" data-screen="inbox" hidden>
      ${screenHeader({ eyebrow: 'Life Inbox', title: 'Capture first.', copy: 'Write it down without deciding what it means yet.' })}
      <div class="screen-stack" id="inbox-screen-content"></div>
    </section>

    <section class="app-screen" id="screen-goals" data-screen="goals" hidden>
      ${screenHeader({ eyebrow: 'Goals', title: 'Think clearly. Act deliberately.', copy: 'Investigate, define, plan and activate only what matters.' })}
      <div class="segment-tabs goal-stage-tabs" role="tablist" aria-label="Goal workflow">
        <button type="button" class="segment-tab active" data-goal-stage="investigate">Investigate</button>
        <button type="button" class="segment-tab" data-goal-stage="define">Define</button>
        <button type="button" class="segment-tab" data-goal-stage="plan">Plan</button>
        <button type="button" class="segment-tab" data-goal-stage="activate">Active</button>
      </div>
      <div class="screen-stack" id="goals-flow"></div>
    </section>

    <section class="app-screen" id="screen-more" data-screen="more" hidden>
      ${screenHeader({ eyebrow: 'System', title: 'More', copy: 'Long-term tools and your local data controls.' })}
      <div class="screen-stack" id="more-screen-content">${buildMoreMenu()}</div>
    </section>

    <section class="app-screen" id="screen-habits" data-screen="habits" hidden>
      <button type="button" class="subscreen-back" data-open-screen="more">← More</button>
      ${screenHeader({ eyebrow: 'Behavior', title: 'Habits', copy: 'Make useful behavior easier to repeat. Keep the minimum version small.' })}
      <div class="screen-stack" id="habits-screen-content"></div>
    </section>

    <section class="app-screen" id="screen-bad-habits" data-screen="bad-habits" hidden>
      <button type="button" class="subscreen-back" data-open-screen="more">← More</button>
      ${screenHeader({ eyebrow: 'Behavior', title: 'Bad Habits', copy: 'Observe the loop without shame, then change cues, friction, environment and replacement behavior.' })}
      <div class="screen-stack" id="bad-habits-screen-content"></div>
    </section>
  `;

  if (topbar) topbar.insertAdjacentElement('afterend', workspace);
  else shell.prepend(workspace);

  workspace.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-screen]');
    if (button) showScreen(button.dataset.openScreen);
  });

  if (todayCard) {
    todayCard.classList.add('calm-section', 'today-panel');
    document.querySelector('#today-screen-content').append(todayCard);
    todayCard.innerHTML = `
      <div class="panel-title-row">
        <div>
          <span class="panel-label">MOST IMPORTANT</span>
          <h3>Your next meaningful action will appear here.</h3>
        </div>
      </div>
      <div class="quiet-placeholder">Activate a Ready goal to begin your daily execution loop.</div>
    `;
  }

  if (inboxCard) {
    inboxCard.classList.add('calm-section', 'inbox-panel');
    document.querySelector('#inbox-screen-content').append(inboxCard);
    const heading = inboxCard.querySelector('.card-header h3');
    const subtitle = inboxCard.querySelector('.card-subtitle');
    if (heading) heading.textContent = 'New thought';
    if (subtitle) subtitle.textContent = 'No labels, no pressure. Capture it first.';
  }

  if (departmentsCard) {
    departmentsCard.classList.add('calm-section', 'departments-panel');
    document.querySelector('#more-screen-content').append(departmentsCard);
  }

  if (storageCard) {
    storageCard.classList.add('calm-section', 'system-panel');
    document.querySelector('#more-screen-content').append(storageCard);
  }

  const ownership = document.createElement('section');
  ownership.className = 'calm-section ownership-panel';
  ownership.innerHTML = `
    <div class="panel-title-row">
      <div><span class="panel-label">DATA OWNERSHIP</span><h3>Your life data stays yours.</h3></div>
      <span class="status-stamp stamp-green">Offline</span>
    </div>
    <div class="ownership-grid">
      <div><strong>Personal data</strong><span>Documents / AbhiLife</span></div>
      <div><strong>App code</strong><span>GitHub + Vercel</span></div>
      <div><strong>Version</strong><span>v${APP_VERSION}</span></div>
    </div>
  `;
  document.querySelector('#more-screen-content').append(ownership);

  hero?.remove();
  dashboard?.remove();
}

function configureTopbar(shell) {
  const topbar = shell.querySelector('.topbar');
  if (!topbar) return;
  topbar.classList.add('app-header');
  topbar.querySelector('.brand-mark')?.remove();
  const title = topbar.querySelector('.brand h1');
  const subtitle = topbar.querySelector('.brand p');
  if (title) title.textContent = 'AbhiLife';
  if (subtitle) subtitle.textContent = `Personal life system · v${APP_VERSION}`;
  topbar.querySelector('.mode-pill')?.classList.add('status-stamp');
}

function showScreen(name) {
  if (!SCREEN_ORDER.includes(name)) return;
  currentScreen = name;
  document.querySelectorAll('.app-screen').forEach((screen) => {
    screen.hidden = screen.dataset.screen !== name;
  });
  const dockScreen = ['habits', 'bad-habits'].includes(name) ? 'more' : name;
  document.querySelectorAll('.bottom-nav .nav-item').forEach((button) => {
    const active = button.dataset.screen === dockScreen;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.documentElement.dataset.screen = name;
  window.dispatchEvent(new CustomEvent('abhilife:screen-changed', { detail: { screen: name } }));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function configureNavigation() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  nav.classList.add('app-dock');
  nav.innerHTML = [
    ['today', 'Today'],
    ['inbox', 'Inbox'],
    ['goals', 'Goals'],
    ['more', 'More']
  ].map(([screen, label]) => `
    <button class="nav-item" type="button" data-screen="${screen}">
      <span class="nav-dot" aria-hidden="true"></span>
      <span>${label}</span>
    </button>
  `).join('');

  nav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-screen]');
    if (button) showScreen(button.dataset.screen);
  });
  showScreen(currentScreen);
}

function decorateGoalCard(card, stage) {
  card.classList.add('calm-section', 'goal-stage-card');
  card.dataset.goalStage = stage;
}

function relocateGoalCards() {
  const flow = document.querySelector('#goals-flow');
  if (!flow) return;
  Object.entries(GOAL_STAGES).forEach(([stage, id]) => {
    const card = document.querySelector(`#${id}`);
    if (!card) return;
    decorateGoalCard(card, stage);
    if (card.parentElement !== flow) flow.append(card);
  });
  showGoalStage(currentGoalStage);
}

function showGoalStage(stage) {
  if (!Object.hasOwn(GOAL_STAGES, stage)) return;
  currentGoalStage = stage;
  document.querySelectorAll('.goal-stage-tabs [data-goal-stage]').forEach((button) => {
    const active = button.dataset.goalStage === stage;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.goal-stage-card').forEach((card) => {
    card.hidden = card.dataset.goalStage !== stage;
  });
}

function configureGoalTabs() {
  document.querySelector('.goal-stage-tabs')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-goal-stage]');
    if (button) showGoalStage(button.dataset.goalStage);
  });
}

function observeGoalWorkflow() {
  goalObserver?.disconnect();
  goalObserver = new MutationObserver(() => relocateGoalCards());
  goalObserver.observe(document.body, { childList: true, subtree: true });
  relocateGoalCards();
}

function enhanceLegacyUi() {
  document.querySelectorAll('.card').forEach((card) => card.classList.add('calm-section'));
  document.querySelectorAll('.badge').forEach((badge) => badge.classList.add('status-stamp'));
}

function mount() {
  if (mounted) return;
  const shell = document.querySelector('.app-shell');
  if (!shell) {
    requestAnimationFrame(mount);
    return;
  }
  mounted = true;
  document.documentElement.classList.remove('neo-app');
  document.documentElement.classList.add('calm-app');
  configureTopbar(shell);
  buildScreens(shell);
  configureNavigation();
  configureGoalTabs();
  enhanceLegacyUi();
  observeGoalWorkflow();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
