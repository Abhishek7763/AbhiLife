function mountActivateTab() {
  const tabs = document.querySelector('.goal-stage-tabs');
  const activation = document.querySelector('#goal-activation-card');
  if (!tabs || !activation) {
    requestAnimationFrame(mountActivateTab);
    return;
  }
  if (!tabs.querySelector('[data-goal-stage="activate"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'segment-tab';
    button.dataset.goalStage = 'activate';
    button.textContent = 'Activate';
    tabs.append(button);
  }
  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-goal-stage]');
    if (!button || button.dataset.goalStage !== 'activate') return;
    tabs.querySelectorAll('[data-goal-stage]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('.goal-stage-card').forEach((card) => { card.hidden = card.id !== 'goal-activation-card'; });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountActivateTab, { once: true });
else mountActivateTab();
