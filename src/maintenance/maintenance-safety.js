const MEDICATION_LABEL = 'Medication routine';
const SAFE_GUIDANCE = 'Next adjustment: Follow your existing clinician or pharmacist instructions for a missed medication routine. AbhiLife does not advise dose or timing changes.';

function applyMedicationSafety() {
  document.querySelectorAll('.maintenance-today-item').forEach((item) => {
    const category = item.querySelector('.maintenance-category')?.textContent?.trim();
    if (category !== MEDICATION_LABEL) return;
    item.querySelectorAll('.maintenance-today-copy small').forEach((node) => {
      if (node.textContent?.trim().startsWith('Next adjustment:')) node.textContent = SAFE_GUIDANCE;
    });
  });
}

const observer = new MutationObserver(applyMedicationSafety);
function boot() {
  applyMedicationSafety();
  const host = document.querySelector('#maintenance-screen-content');
  if (!host) return requestAnimationFrame(boot);
  observer.observe(host, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
