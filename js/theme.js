// Light / dark mode toggle. Follows the computer's setting until you press the button; then remembers your choice in this browser.
const KEY = 'rabies.theme';
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const effective = () => document.documentElement.dataset.theme || (mq.matches ? 'dark' : 'light');

function sync(btn) {
  const dark = effective() === 'dark';
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.setAttribute('aria-pressed', String(dark));
  btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

export function initTheme() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  sync(btn);
  btn.addEventListener('click', () => {
    const next = effective() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch {}
    sync(btn);
  });
  if (mq.addEventListener) mq.addEventListener('change', () => sync(btn));
}
