(() => {
  const DEFAULT_ADMIN_EMAILS = Object.freeze(['watchbilm@gmail.com']);
  let configuredEmailsPromise = null;

  function detectBasePath() {
    const appRoots = new Set(['home', 'movies', 'tv', 'search', 'settings', 'random', 'test', 'shared', 'index.html']);
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';

    const appRootIndex = parts.findIndex((part) => appRoots.has(part));
    if (appRootIndex >= 0) {
      if (appRootIndex === 0) return '';
      return `/${parts.slice(0, appRootIndex).join('/')}`;
    }

    if (parts[0] === 'gh' && parts.length >= 3) {
      return `/${parts.slice(0, 3).join('/')}`;
    }
    if (parts[0] === 'npm' && parts.length >= 2) {
      return `/${parts.slice(0, 2).join('/')}`;
    }
    if (parts.length === 1) {
      return `/${parts[0]}`;
    }
    return '';
  }

  function withBase(path) {
    const normalized = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
    return `${detectBasePath()}${normalized}`;
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function normalizeAllowlist(values = []) {
    const normalized = new Set();
    values.forEach((entry) => {
      const email = normalizeEmail(entry);
      if (!isValidEmail(email)) return;
      normalized.add(email);
    });
    return [...normalized];
  }

  async function fetchConfiguredAdminEmails() {
    if (configuredEmailsPromise) return configuredEmailsPromise;
    configuredEmailsPromise = (async () => {
      try {
        const response = await fetch(withBase('/api/admin/config'), {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            accept: 'application/json'
          }
        });
        if (!response.ok) return [];
        const payload = await response.json();
        if (!Array.isArray(payload?.adminEmails)) return [];
        return normalizeAllowlist(payload.adminEmails);
      } catch {
        return [];
      }
    })();
    return configuredEmailsPromise;
  }

  function mergeAllowlists(extra = []) {
    return normalizeAllowlist([...DEFAULT_ADMIN_EMAILS, ...extra]);
  }

  function isAdminEmailLocal(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    return mergeAllowlists().includes(normalized);
  }

  async function isAdminEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    const configured = await fetchConfiguredAdminEmails();
    return mergeAllowlists(configured).includes(normalized);
  }

  async function getAdminEmails() {
    const configured = await fetchConfiguredAdminEmails();
    return mergeAllowlists(configured);
  }

  window.bilmAdmin = {
    DEFAULT_ADMIN_EMAILS: [...DEFAULT_ADMIN_EMAILS],
    normalizeEmail,
    getAdminEmails,
    isAdminEmail,
    isAdminEmailLocal
  };
})();
