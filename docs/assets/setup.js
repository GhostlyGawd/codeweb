// Progressive enhancement: all recipes remain readable if JavaScript is unavailable.
(() => {
  const selector = document.getElementById('setup-client');
  if (!selector) return;
  const panels = [...document.querySelectorAll('[data-setup-client]')];
  const select = () => {
    for (const panel of panels) panel.hidden = panel.dataset.setupClient !== selector.value;
    const selected = panels.find(panel => !panel.hidden);
    if (selected) {
      document.getElementById('setup-command').textContent = `npx -y @ghostlygawd/codeweb setup --client ${selected.dataset.setupClient}`;
      document.getElementById('doctor-command').textContent = `npx -y @ghostlygawd/codeweb doctor --client ${selected.dataset.setupClient} --config ${selected.dataset.configPath}`;
    }
  };
  selector.addEventListener('change', select);
  select();
  for (const panel of panels) {
    const button = panel.querySelector('[data-copy-recipe]');
    const code = panel.querySelector('pre code');
    const status = panel.querySelector('[role="status"]');
    button.hidden = false;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        status.textContent = 'Copied. Add the entry to your client configuration.';
      } catch {
        status.textContent = 'Copy unavailable. Select the recipe text and copy it manually.';
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        code.parentElement.focus();
      }
    });
  }
})();
