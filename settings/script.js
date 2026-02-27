document.addEventListener('DOMContentLoaded', () => {
  window.BilmFoundation?.initPage?.({ bodyClass: 'page-settings' });
  const get = window.bilmTheme?.getSettings;
  const set = window.bilmTheme?.setSettings;
  const current = (get && get()) || {};

  const bindings = [
    ['particlesToggle', 'particles'],
    ['motionToggle', 'motion'],
    ['loadingToggle', 'loading'],
    ['incognitoToggle', 'incognito'],
    ['searchHistoryToggle', 'searchHistory']
  ];

  bindings.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = current[key] !== false;
    if (key === 'incognito') el.checked = current[key] === true;
    el.addEventListener('change', () => {
      const next = { ...(get?.() || {}) };
      next[key] = key === 'incognito' ? el.checked : el.checked;
      set?.(next);
      window.dispatchEvent(new CustomEvent('bilm:theme-changed', { detail: next }));
    });
  });

  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect.value = document.documentElement.dataset.theme || 'dark';
    themeSelect.addEventListener('change', () => {
      if (window.bilmTheme?.setTheme) window.bilmTheme.setTheme(themeSelect.value);
      else document.documentElement.dataset.theme = themeSelect.value;
    });
  }
});
