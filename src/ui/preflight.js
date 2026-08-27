// Preserve goal workflow cards if they mounted inside the legacy dashboard
// before the v0.9 app shell reorganizes the interface.
// This module is intentionally tiny because it runs immediately before redesign.js.
const GOAL_CARD_IDS = [
  'goal-investigation-card',
  'goal-definition-card',
  'goal-breakdown-card'
];

const mountedGoalCards = GOAL_CARD_IDS
  .map((id) => document.querySelector(`#${id}`))
  .filter(Boolean);

if (mountedGoalCards.length) {
  const safeDock = document.createElement('div');
  safeDock.id = 'ui-redesign-preflight';
  safeDock.hidden = true;
  document.body.append(safeDock);
  mountedGoalCards.forEach((card) => safeDock.append(card));
}
