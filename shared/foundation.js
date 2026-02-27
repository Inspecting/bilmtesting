(function initFoundation(global) {
  const APP_ROOTS = new Set(['home', 'movies', 'tv', 'games', 'search', 'settings', 'random', 'test', 'shared', 'index.html']);

  function detectBasePath() {
    const scriptSrc = document.currentScript?.src;
    if (scriptSrc) {
      try {
        const scriptPath = new URL(scriptSrc, window.location.href).pathname;
        const sharedIndex = scriptPath.lastIndexOf('/shared/');
        if (sharedIndex >= 0) {
          const prefix = scriptPath.slice(0, sharedIndex);
          return prefix || '';
        }
      } catch {
        // fallback to pathname parsing
      }
    }

    const parts = window.location.pathname.split('/').filter(Boolean);
    if (!parts.length || APP_ROOTS.has(parts[0])) return '';
    return `/${parts[0]}`;
  }

  function withBase(path) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${detectBasePath()}${normalized}`;
  }

  function getCurrentSection() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const appSections = ['home', 'movies', 'tv', 'games', 'search', 'settings', 'random', 'test'];
    return pathParts.find((part) => appSections.includes(part)) || 'home';
  }

  function initPage({ bodyClass } = {}) {
    const section = getCurrentSection();
    document.documentElement.dataset.section = section;
    if (bodyClass) document.body.classList.add(bodyClass);
    return section;
  }

  global.BilmFoundation = {
    APP_ROOTS,
    detectBasePath,
    withBase,
    getCurrentSection,
    initPage
  };
})(window);
