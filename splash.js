function isLoadingEnabled() {
  const settings = window.bilmTheme?.getSettings?.();
  if (settings && Object.prototype.hasOwnProperty.call(settings, 'loading')) {
    return settings.loading !== false;
  }
  return localStorage.getItem('bilmDisableLoading') !== 'true';
}

function setLoadingEnabled(enabled) {
  const current = window.bilmTheme?.getSettings?.() || {};
  if (window.bilmTheme?.setSettings) {
    window.bilmTheme.setSettings({ ...current, loading: enabled });
    return;
  }
  localStorage.setItem('bilmDisableLoading', String(!enabled));
}

document.addEventListener('DOMContentLoaded', () => {
  window.BilmFoundation?.initPage?.({ bodyClass: 'page-splash' });

  const homeUrl = (window.BilmFoundation?.withBase || ((path) => path))('/home/');
  const link = document.getElementById('enterAppLink');
  const continueBtn = document.getElementById('continueBtn');
  const toggleBtn = document.getElementById('loadingToggle');

  link.href = homeUrl;

  const syncToggle = () => {
    toggleBtn.textContent = `Loading screen: ${isLoadingEnabled() ? 'On' : 'Off'}`;
  };

  toggleBtn.addEventListener('click', () => {
    setLoadingEnabled(!isLoadingEnabled());
    syncToggle();
  });

  continueBtn.addEventListener('click', () => {
    window.location.href = homeUrl;
  });

  syncToggle();

  if (isLoadingEnabled()) {
    setTimeout(() => {
      window.location.href = homeUrl;
    }, 1400);
  }
});
