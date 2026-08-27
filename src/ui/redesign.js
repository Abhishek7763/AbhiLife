import './redesign.css';
import { APP_VERSION } from '../core/system.js';

const SCREEN_ORDER = ['today', 'inbox', 'goals', 'habits', 'more'];
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

function todayLabel() {
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

function screenHeader({ eyebrow, title, copy, action = '' }) {
  return `
    <header class="screen-header">
      <div>
        <span class="screen-kicker">${eyebrow}</span>
        <h2>${title}</h2>
        ${copy ? `<p>${copy}</p>` : ''}
      </div>
      ${action}
    </header>
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
      ${screenHeader({
        eyebrow: 'Daily Command Center',
        title: 'Today',
        copy: todayLabel(),
        action: '<span class="status-stamp stamp-blue">FOCUS</span>'
      })}
      <div class="screen-stack" id="today-screen-content"></div>
    </section>

    <section class="app-screen" id="screen-inbox" data-screen="inbox" hidden>
      ${screenHeader({
        eyebrow: 'Life Inbox',
        title: 'Capture first.',
        copy: 'A thought is not a goal. Save it now; decide later.',
        action: '<span class="status-stamp stamp-pink">INBOX</span>'
      })}
      <div class="screen-stack" id="inbox-screen-content"></div>
    </section>

    <section class="app-screen" id="screen-goals" data-screen="goals" hidden>
      ${screenHeader({
        eyebrow: 'Goal System',
        title: 'Think → Define → Plan → Activate',
        copy: 'Turn only meaningful thoughts into executable action chains.'
      })}
      <div class="segment-tabs goal-stage-tabs" role="tablist" aria-label="Goal workflow">
        <button type="button" class="segment-tab active" data-goal-stage="investigate">Investigate</button>
        <button type="button" class="segment-tab" data-goal-stage="define">Define</button>
        <button type="button" class="segment-tab" data-goal-stage="plan">Plan</button>
        <button type="button" class="segment-tab" data-goal-stage="activate">Activate</button>
      </div>
      <div class="screen-stack" id="goals-flow"></div>
    </section>

    <section class="app-screen" id="screen-habits" data-screen="habits" hidden>
      ${screenHeader({
        eyebrow: 'Behaviour',
        title: 'Habits',
        copy: 'Cue, context and repetition will live here — not fake motivation scores.',
        action: '<span class="status-stamp stamp-green">NEXT</span>'
      })}
      <article class="tactile-panel shadow-green empty-feature">
        <span class="panel-label">HABIT ENGINE</span>
        <h3>Coming after daily execution</h3>
        <p>The habit engine will use the same offline AbhiLife data vault. This redesign does not invent placeholder habit data.</p>
        <div class="empty-bars"><span></span><span></span><span></span></div>
      </article>
    </section>

    <section class="app-screen" id="screen-more" data-screen="more" hidden>
      ${screenHeader({
        eyebrow: 'System',
        title: 'More',
        copy: 'Life departments, local data safety and system controls.'
      })}
      <div class="screen-stack" id="more-screen-content"></div>
    </section>
  `;

  if (topbar) topbar.insertAdjacentElement('afterend', workspace);
  else shell.prepend(workspace);

  if (todayCard) {
    todayCard.classList.add('tactile-panel', 'shadow-blue', 'today-panel');
    document.querySelector('#today-screen-content').append(todayCard);
    todayCard.innerHTML = `
      <div class="panel-title-row">
        <div><span class="panel-label label-blue">MOST IMPORTANT WIN</span><h3>Protect one meaningful win.</h3></div>
        <span class="status-stamp stamp-blue">PREVIEW</span>
      </div>
      <div class="action-row featured"><span class="action-dot blue"></span><div><strong>Your first Next Action will appear here.</strong><small>Generated from an Active goal after the activation phase.</small></div><span class="row-arrow">→</span></div>
      <div class="section-rule"><span>MUST DO</span></div>
      <div class="action-row"><span class="action-box"></span><div><strong>Important actions</strong><small>Only a realistic small set will be shown.</small></div></div>
      <div class="section-rule"><span>MAINTAIN</span></div>
      <div class="action-row"><span class="action-box"></span><div><strong>Stability routines</strong><small>Maintenance is protected without artificial points.</small></div></div>
    `;
  }

  if (inboxCard) {
    inboxCard.classList.add('tactile-panel', 'shadow-pink', 'inbox-panel');
    document.querySelector('#inbox-screen-content').append(inboxCard);
    const heading = inboxCard.querySelector('.card-header h3');
    const subtitle = inboxCard.querySelector('.card-subtitle');
    if (heading) heading.textContent = 'New Thought';
    if (subtitle) subtitle.textContent = 'Write it down without organizing or judging it.';
  }

  if (storageCard) {
    storageCard.classList.add('tactile-panel', 'shadow-green', 'system-panel');
    document.querySelector('#more-screen-content').append(storageCard);
  }

  if (departmentsCard) {
    departmentsCard.classList.add('tactile-panel', 'shadow-yellow', 'departments-panel');
    document.querySelector('#more-screen-content').append(departmentsCard);
  }

  const ownership = document.createElement('article');
  ownership.className = 'tactile-panel shadow-pink ownership-panel';
  ownership.innerHTML = `
    <div class="panel-title-row"><div><span class="panel-label">DATA OWNERSHIP</span><h3>Your life data stays yours.</h3></div><span class="status-stamp stamp-green">OFFLINE</span></div>
    <div class="ownership-grid">
      <div><strong>APP CODE</strong><span>GitHub + Vercel</span></div>
      <div><strong>PERSONAL DATA</strong><span>Documents / AbhiLife</span></div>
      <div><strong>VERSION</strong><span>v${APP_VERSION}</span></div>
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
  const brandMark = topbar.querySelector('.brand-mark');
  const title = topbar.querySelector('.brand h1');
  const subtitle = topbar.querySelector('.brand p');
  if (brandMark) brandMark.textContent = 'A';
  if (title) title.textContent = 'ABHILIFE';
  if (subtitle) subtitle.textContent = `PERSONAL LIFE SYSTEM · v${APP_VERSION}`;
  const mode = topbar.querySelector('.mode-pill');
  mode?.classList.add('status-stamp');
}

function showScreen(name) {
  if (!SCREEN_ORDER.includes(name)) return;
  currentScreen = name;
  document.querySelectorAll('.app-screen').forEach((screen) => {
    screen.hidden = screen.dataset.screen !== name;
  });
  document.querySelectorAll('.bottom-nav .nav-item').forEach((button) => {
    const active = button.dataset.screen === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.documentElement.dataset.screen = name;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function configureNavigation() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  const labels = [
    ['today', '⌂', 'Today'],
    ['inbox', '+', 'Inbox'],
    ['goals', '◎', 'Goals'],
    ['habits', '↻', 'Habits'],
    ['more', '≡', 'More']
  ];
  [...nav.querySelectorAll('.nav-item')].forEach((button, index) => {
    const item = labels[index];
    if (!item) return;
    button.dataset.screen = item[0];
    button.innerHTML = `<span class="nav-icon">${item[1]}</span><span>${item[2]}</span>`;
    button.addEventListener('click', () => showScreen(item[0]));
  });
  nav.classList.add('app-dock');
  showScreen(currentScreen);
}

function decorateGoalCard(card, stage) {
  card.classList.add('tactile-panel', 'goal-stage-card');
  card.dataset.goalStage = stage;
  card.classList.toggle('shadow-pink', stage === 'investigate' || stage === 'activate');
  card.classList.toggle('shadow-blue', stage === 'define');
  card.classList.toggle('shadow-green', stage === 'plan');
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
    button.classList.toggle('active', button.dataset.goalStage === stage);
  });
  document.querySelectorAll('.goal-stage-card').forEach((card) => {
    card.hidden = card.dataset.goalStage !== stage;
  });
  const flow = document.querySelector('#goals-flow');
  if (flow && !flow.querySelector(`.goal-stage-card[data-goal-stage="${stage}"]`)) {
    flow.dataset.waitingStage = stage;
  } else if (flow) {
    delete flow.dataset.waitingStage;
  }
}

function configureGoalTabs() {
  document.querySelector('.goal-stage-tabs')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-goal-stage]');
    if (!button) return;
    showGoalStage(button.dataset.goalStage);
  });
}

function observeGoalWorkflow() {
  goalObserver?.disconnect();
  goalObserver = new MutationObserver(() => relocateGoalCards());
  goalObserver.observe(document.body, { childList: true, subtree: true });
  relocateGoalCards();
}

function enhanceCards() {
  document.querySelectorAll('.card').forEach((card) => card.classList.add('tactile-panel'));
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
  document.documentElement.classList.add('neo-app');
  configureTopbar(shell);
  buildScreens(shell);
  configureNavigation();
  configureGoalTabs();
  enhanceCards();
  observeGoalWorkflow();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
