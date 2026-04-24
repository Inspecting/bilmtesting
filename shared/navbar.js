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

const BASE_PATH = detectBasePath();
const NAVBAR_ASSET_CACHE_KEY = 'bilm-navbar-assets-v6';
const NAVBAR_ASSET_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LEGACY_NAVBAR_ASSET_CACHE_KEYS = ['bilm-navbar-assets-v1', 'bilm-navbar-assets-v2', 'bilm-navbar-assets-v3', 'bilm-navbar-assets-v4', 'bilm-navbar-assets-v5'];

function withBase(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}

function ensureFavicon() {
  const iconHref = withBase('/icon.png');
  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.setAttribute('rel', 'icon');
    document.head.appendChild(favicon);
  }
  favicon.setAttribute('type', 'image/png');
  favicon.setAttribute('href', iconHref);

  let touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (!touchIcon) {
    touchIcon = document.createElement('link');
    touchIcon.setAttribute('rel', 'apple-touch-icon');
    document.head.appendChild(touchIcon);
  }
  touchIcon.setAttribute('href', iconHref);
}

function readCachedNavbarAssets() {
  try {
    const raw = localStorage.getItem(NAVBAR_ASSET_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const cachedAtMs = Number(parsed?.cachedAtMs || 0);
    if (!parsed?.html || !parsed?.css || !cachedAtMs) return null;
    if (Date.now() - cachedAtMs > NAVBAR_ASSET_CACHE_MAX_AGE_MS) return null;
    return {
      html: String(parsed.html),
      css: String(parsed.css)
    };
  } catch {
    return null;
  }
}

function writeCachedNavbarAssets(html, css) {
  if (!html || !css) return;
  try {
    localStorage.setItem(NAVBAR_ASSET_CACHE_KEY, JSON.stringify({
      cachedAtMs: Date.now(),
      html,
      css
    }));
  } catch {
    // Ignore storage failures.
  }
}

function purgeLegacyNavbarAssetCache() {
  LEGACY_NAVBAR_ASSET_CACHE_KEYS.forEach((key) => {
    if (!key || key === NAVBAR_ASSET_CACHE_KEY) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  });
}

function normalizeShadowBaseRoutes(shadowRoot) {
  if (!shadowRoot) return;

  shadowRoot.querySelectorAll('a[href]').forEach((anchor) => {
    const explicitRoute = String(anchor.getAttribute('data-route') || '').trim();
    const href = String(anchor.getAttribute('href') || '').trim();
    if (explicitRoute) {
      anchor.setAttribute('href', withBase(explicitRoute));
      return;
    }
    if (href.startsWith('/')) {
      anchor.setAttribute('href', withBase(href));
    }
  });

  shadowRoot.querySelectorAll('form[action]').forEach((form) => {
    const explicitAction = String(form.getAttribute('data-route-action') || '').trim();
    const action = String(form.getAttribute('action') || '').trim();
    if (explicitAction) {
      form.setAttribute('action', withBase(explicitAction));
      return;
    }
    if (action.startsWith('/')) {
      form.setAttribute('action', withBase(action));
    }
  });
}

function renderNavbarSkeleton(shadow) {
  shadow.innerHTML = `
    <style>
      :host {
        display: block;
        font-family: 'Poppins', sans-serif;
      }
      .bilm-navbar-skeleton {
        height: 64px;
        width: 100%;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        background: linear-gradient(90deg, rgba(22, 19, 36, 0.95), rgba(30, 24, 44, 0.95), rgba(22, 19, 36, 0.95));
        background-size: 240% 100%;
        animation: bilm-navbar-skeleton-shimmer 1.2s linear infinite;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        box-sizing: border-box;
      }
      .bilm-navbar-skeleton-logo {
        color: rgba(245, 243, 255, 0.95);
        font-weight: 700;
        font-size: 1.25rem;
        letter-spacing: 0.01em;
      }
      .bilm-navbar-skeleton-pill {
        width: 120px;
        height: 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
      }
      @keyframes bilm-navbar-skeleton-shimmer {
        0% { background-position: 100% 0; }
        100% { background-position: 0 0; }
      }
      @media (max-width: 768px) {
        .bilm-navbar-skeleton {
          height: 58px;
          padding: 10px 14px;
        }
        .bilm-navbar-skeleton-pill {
          width: 88px;
        }
      }
    </style>
    <div class="bilm-navbar-skeleton" role="presentation" aria-hidden="true">
      <div class="bilm-navbar-skeleton-logo">Bilm</div>
      <div class="bilm-navbar-skeleton-pill"></div>
    </div>
  `;
}
function loadAuthScript() {
  return new Promise((resolve, reject) => {
    if (window.bilmAuth) {
      resolve(window.bilmAuth);
      return;
    }
    const src = withBase('/shared/auth.js');
    const existing = document.querySelector(`script[data-bilm-auth="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.bilmAuth), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load auth module.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.bilmAuth = src;
    script.addEventListener('load', () => resolve(window.bilmAuth), { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load auth module.')), { once: true });
    document.head.appendChild(script);
  });
}

function loadToastScript() {
  return new Promise((resolve, reject) => {
    if (window.bilmToast?.show) {
      resolve(window.bilmToast);
      return;
    }
    const src = withBase('/shared/toast.js');
    const existing = document.querySelector(`script[data-bilm-toast="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.bilmToast), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load toast module.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.bilmToast = src;
    script.addEventListener('load', () => resolve(window.bilmToast), { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load toast module.')), { once: true });
    document.head.appendChild(script);
  });
}

(async () => {
  purgeLegacyNavbarAssetCache();
  ensureFavicon();

  const container = document.getElementById('navbar-placeholder') || document.getElementById('navbarContainer');
  if (!container) return;

  document.body.classList.add('has-fixed-navbar');

  const shadow = container.shadowRoot || container.attachShadow({ mode: 'open' });
  renderNavbarSkeleton(shadow);

  let html = '';
  let css = '';
  const cachedAssets = readCachedNavbarAssets();
  if (cachedAssets?.html && cachedAssets?.css) {
    html = cachedAssets.html;
    css = cachedAssets.css;
  } else {
    try {
      const [htmlRes, cssRes] = await Promise.all([
        fetch(withBase('/shared/navbar.html')),
        fetch(withBase('/shared/navbar.css'))
      ]);

      if (!htmlRes.ok || !cssRes.ok) {
        throw new Error(`Navbar assets failed to load (html=${htmlRes.status}, css=${cssRes.status})`);
      }

      html = await htmlRes.text();
      css = await cssRes.text();
      writeCachedNavbarAssets(html, css);
    } catch (error) {
      console.error('Failed to load navbar assets:', error);
      return;
    }
  }

  shadow.innerHTML = `<style>${css}</style>${html}`;
  normalizeShadowBaseRoutes(shadow);

  const globalBanner = shadow.getElementById('globalBanner');
  const globalBannerCloseBtn = shadow.getElementById('globalBannerCloseBtn');
  const accountMenuWrap = shadow.getElementById('navbarAccountMenuWrap');
  const accountMenu = shadow.getElementById('navbarAccountMenu');
  const accountLoginBtn = shadow.getElementById('navbarAccountLoginBtn');
  const accountSignUpBtn = shadow.getElementById('navbarAccountSignUpBtn');
  const accountSettingsBtn = shadow.getElementById('navbarAccountSettingsBtn');
  const accountManualSyncBtn = shadow.getElementById('navbarAccountManualSyncBtn');
  const accountSignOutBtn = shadow.getElementById('navbarAccountSignOutBtn');
  const accountMenuHint = shadow.getElementById('navbarAccountMenuHint');
  const authModal = shadow.getElementById('navbarAuthModal');
  const authModalCloseBtn = shadow.getElementById('navbarAuthCloseBtn');
  const authForm = shadow.getElementById('navbarAuthForm');
  const authEmailInput = shadow.getElementById('navbarAuthEmail');
  const authPasswordInput = shadow.getElementById('navbarAuthPassword');
  const authPasswordToggleBtn = shadow.getElementById('navbarAuthPasswordToggleBtn');
  const authForgotBtn = shadow.getElementById('navbarAuthForgotBtn');
  const authStatus = shadow.getElementById('navbarAuthStatus');
  const authSubmitBtn = shadow.getElementById('navbarAuthSubmitBtn');
  const authSwitchBtn = shadow.getElementById('navbarAuthSwitchBtn');
  const authTitle = shadow.getElementById('navbarAuthTitle');
  const authHint = shadow.getElementById('navbarAuthHint');
  const resetSentModal = shadow.getElementById('navbarResetSentModal');
  const resetSentCloseBtn = shadow.getElementById('navbarResetSentCloseBtn');
  const resetSentDoneBtn = shadow.getElementById('navbarResetSentDoneBtn');
  const resetSentPrimary = shadow.getElementById('navbarResetSentPrimary');

  loadToastScript().catch((error) => {
    console.warn('Toast module unavailable:', error);
  });

  function showToast(message, tone = 'info', duration = 1000) {
    window.bilmToast?.show?.(message, { tone, duration });
  }


  const ACCOUNT_MANUAL_SYNC_COOLDOWN_MS = 5000;
  let authApiInstance = null;
  let accountManualSyncCooldownUntil = 0;
  let accountManualSyncCooldownTimer = null;
  let authDialogMode = 'login';
  let authPasswordVisible = false;

  function cleanupLegacyChatState() {
    const CHAT_STORAGE_KEY = 'bilm-shared-chat';
    const SYNC_META_KEY = 'bilm-sync-meta';
    const CHAT_SYNC_CURSOR_META_KEY = 'lastChatSyncCursorMs';
    const SYNC_USER_STATE_META_KEY = 'userSyncState';

    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }

    try {
      const raw = localStorage.getItem(SYNC_META_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

      let changed = false;
      if (Object.prototype.hasOwnProperty.call(parsed, CHAT_SYNC_CURSOR_META_KEY)) {
        delete parsed[CHAT_SYNC_CURSOR_META_KEY];
        changed = true;
      }

      const scoped = parsed[SYNC_USER_STATE_META_KEY];
      if (scoped && typeof scoped === 'object' && !Array.isArray(scoped)) {
        Object.keys(scoped).forEach((userKey) => {
          const userState = scoped[userKey];
          if (!userState || typeof userState !== 'object' || Array.isArray(userState)) return;
          if (!Object.prototype.hasOwnProperty.call(userState, CHAT_SYNC_CURSOR_META_KEY)) return;
          delete userState[CHAT_SYNC_CURSOR_META_KEY];
          changed = true;
        });
      }

      if (changed) {
        localStorage.setItem(SYNC_META_KEY, JSON.stringify(parsed));
      }
    } catch {
      // Ignore storage failures.
    }
  }

  cleanupLegacyChatState();

  const pathParts = location.pathname.split('/').filter(Boolean);
  const appSections = new Set(['home', 'movies', 'tv', 'search', 'settings', 'random', 'chat', 'test']);
  const section = pathParts.find(part => appSections.has(part)) || 'home';
  const fileName = pathParts.at(-1) || '';
  const isSearchPage = section === 'search' || fileName.startsWith('search');
  const isChatPage = section === 'random' && String(pathParts[1] || '').toLowerCase() === 'chat';
  let page = isChatPage ? 'chat' : section;


  const logoLink = shadow.querySelector('.logo');
  if (logoLink) {
    const homeUrl = withBase('/home/');
    logoLink.setAttribute('href', homeUrl);
    logoLink.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = homeUrl;
    });
  }

  const SEARCH_HISTORY_KEY = 'bilm-search-history';
  const INCOGNITO_SEARCH_MAP_KEY = 'bilm-incognito-search-map';
  const SEARCH_MAX_SUGGESTIONS = 8;
  const SEARCH_SUGGEST_DEBOUNCE_MS = 220;
  const DESKTOP_SEARCH_SUGGEST_DEBOUNCE_MS = 180;
  const MOBILE_SEARCH_MAX_HISTORY_ITEMS = 10;
  const storage = window.bilmTheme?.storage || {
    getJSON: (key, fallback = []) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : fallback;
      } catch {
        return fallback;
      }
    },
    setJSON: (key, value) => {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };


  const GLOBAL_BANNER_DISMISS_KEY = 'bilm-global-message-dismissed-migrating-data';

  function isGlobalBannerDismissed() {
    try {
      return localStorage.getItem(GLOBAL_BANNER_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  function dismissGlobalBanner() {
    if (globalBanner) {
      globalBanner.hidden = true;
      globalBanner.setAttribute('aria-hidden', 'true');
    }
    try {
      localStorage.setItem(GLOBAL_BANNER_DISMISS_KEY, '1');
    } catch {
      // If storage is blocked, keep UI behavior without crashing.
    }
  }

  function setupGlobalBanner() {
    if (!globalBanner) return;
    globalBanner.hidden = true;
    globalBanner.setAttribute('aria-hidden', 'true');
  }

  function loadList(key) {
    const list = storage.getJSON(key, []);
    return Array.isArray(list) ? list : [];
  }

  function saveList(key, list) {
    storage.setJSON(key, list);
  }

  function saveSearchHistoryEntry(query) {
    const settings = window.bilmTheme?.getSettings?.() || {};
    if (settings.searchHistory === false || settings.incognito === true) return;
    const history = loadList(SEARCH_HISTORY_KEY);
    const normalizedQuery = query.toLowerCase();
    const next = [
      { query, updatedAt: Date.now() },
      ...history.filter((entry) => String(entry?.query || '').trim().toLowerCase() !== normalizedQuery)
    ].slice(0, 120);
    saveList(SEARCH_HISTORY_KEY, next);
  }

  function normalizeSearchText(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function getSearchHistoryEntries({ limit = 120 } = {}) {
    const settings = window.bilmTheme?.getSettings?.() || {};
    if (settings.searchHistory === false || settings.incognito === true) return [];
    return loadList(SEARCH_HISTORY_KEY)
      .map((entry) => ({
        query: String(entry?.query || '').trim(),
        updatedAt: Number(entry?.updatedAt || 0) || 0
      }))
      .filter((entry) => entry.query.length > 0)
      .slice(0, Math.max(0, Number(limit || 0) || 0));
  }

  function removeSearchHistoryEntry(query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return;
    const next = getSearchHistoryEntries({ limit: 120 })
      .filter((entry) => normalizeSearchText(entry.query) !== normalizedQuery);
    saveList(SEARCH_HISTORY_KEY, next);
  }

  function getMobileHistoryLimit() {
    const viewportHeight = Math.max(320, Number(window.innerHeight || 0) || 0);
    const estimatedRowHeight = 52;
    const availableRows = Math.floor((viewportHeight - 220) / estimatedRowHeight);
    return Math.max(4, Math.min(MOBILE_SEARCH_MAX_HISTORY_ITEMS, availableRows || 0));
  }

  function levenshteinDistance(left = '', right = '') {
    const a = normalizeSearchText(left);
    const b = normalizeSearchText(right);
    if (!a || !b) return Number.MAX_SAFE_INTEGER;
    if (a === b) return 0;
    const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let row = 0; row <= a.length; row += 1) matrix[row][0] = row;
    for (let column = 0; column <= b.length; column += 1) matrix[0][column] = column;
    for (let row = 1; row <= a.length; row += 1) {
      for (let column = 1; column <= b.length; column += 1) {
        const cost = a[row - 1] === b[column - 1] ? 0 : 1;
        matrix[row][column] = Math.min(
          matrix[row - 1][column] + 1,
          matrix[row][column - 1] + 1,
          matrix[row - 1][column - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }

  function resolveDidYouMeanQuery(query = '', candidates = []) {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length < 3) return '';
    const uniqueCandidates = [...new Set((Array.isArray(candidates) ? candidates : [])
      .map((candidate) => String(candidate || '').trim())
      .filter(Boolean))];
    let bestCandidate = '';
    let bestDistance = Number.MAX_SAFE_INTEGER;
    const maxDistance = Math.max(2, Math.floor(normalizedQuery.length * 0.35));
    uniqueCandidates.forEach((candidate) => {
      const normalizedCandidate = normalizeSearchText(candidate);
      if (!normalizedCandidate || normalizedCandidate === normalizedQuery) return;
      const distance = levenshteinDistance(normalizedQuery, normalizedCandidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCandidate = candidate;
      }
    });
    if (!bestCandidate || bestDistance > maxDistance) return '';
    return bestCandidate;
  }

  async function fetchSearchSuggestions(query, { signal } = {}) {
    const trimmedQuery = String(query || '').trim();
    if (trimmedQuery.length < 2) return [];

    const encodedQuery = encodeURIComponent(trimmedQuery);
    const primaryUrl = `${window.location.origin}${withBase(`/api/tmdb/search/multi?query=${encodedQuery}&include_adult=false&page=1`)}`;
    const fallbackUrl = `https://storage-api.watchbilm.org/media/tmdb/search/multi?query=${encodedQuery}&include_adult=false&page=1`;
    const requestUrls = [primaryUrl, fallbackUrl];

    let payload = null;
    for (const requestUrl of requestUrls) {
      try {
        const response = await fetch(requestUrl, {
          signal,
          headers: { accept: 'application/json' }
        });
        if (!response.ok) continue;
        payload = await response.json();
        break;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
      }
    }
    if (!payload || !Array.isArray(payload?.results)) return [];

    const unique = new Map();
    payload.results.forEach((item) => {
      const mediaType = String(item?.media_type || '').trim().toLowerCase();
      if (mediaType !== 'movie' && mediaType !== 'tv') return;
      const title = String(item?.title || item?.name || '').trim();
      if (!title) return;
      const normalizedTitle = normalizeSearchText(title);
      const year = String(item?.release_date || item?.first_air_date || '').slice(0, 4).trim();
      const typeLabel = mediaType === 'movie' ? 'Movie' : 'TV';
      const key = `${normalizedTitle}:${typeLabel}`;
      if (unique.has(key)) return;
      unique.set(key, {
        label: title,
        meta: [typeLabel, year].filter(Boolean).join(' · '),
        score: Number(item?.popularity || 0) || 0
      });
    });

    return [...unique.values()]
      .sort((left, right) => (Number(right.score || 0) || 0) - (Number(left.score || 0) || 0))
      .slice(0, SEARCH_MAX_SUGGESTIONS);
  }

  function saveIncognitoSearch(query) {
    const token = Math.random().toString(36).slice(2, 12);
    let map = {};
    try {
      map = JSON.parse(sessionStorage.getItem(INCOGNITO_SEARCH_MAP_KEY) || '{}') || {};
    } catch {
      map = {};
    }
    map[token] = query;
    const orderedEntries = Object.entries(map).slice(-50);
    const compactMap = Object.fromEntries(orderedEntries);
    try {
      sessionStorage.setItem(INCOGNITO_SEARCH_MAP_KEY, JSON.stringify(compactMap));
    } catch {
      return query;
    }
    return token;
  }

  function submitSearch(query, { closeMobileOverlay = false } = {}) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    const settings = window.bilmTheme?.getSettings?.() || {};
    saveSearchHistoryEntry(trimmedQuery);
    if (closeMobileOverlay) {
      const overlay = shadow.getElementById('mobileSearchOverlay');
      const input = shadow.getElementById('mobileSearchInput');
      const clearBtn = shadow.getElementById('mobileSearchCloseBtn');
      if (overlay) {
        overlay.classList.remove('active');
      }
      if (input) {
        input.value = '';
      }
      if (clearBtn) {
        clearBtn.style.display = 'none';
      }
      document.body.style.overflow = '';
    }
    const outgoingQuery = settings.incognito === true
      ? saveIncognitoSearch(trimmedQuery)
      : trimmedQuery;
    window.location.href = `${withBase('/search/')}?q=${encodeURIComponent(outgoingQuery)}`;
  }

  setupGlobalBanner();

  // Desktop nav buttons
  const buttons = shadow.querySelectorAll('nav.navbar button[data-page]');
  buttons.forEach(btn => {
    if (btn.dataset.page === page) {
      btn.classList.add('active');
    }
    btn.onclick = () => {
      const target = btn.dataset.page;
      const route = target === 'chat'
        ? '/random/chat/'
        : `/${target === 'home' ? 'home' : target}/`;
      window.location.href = withBase(route);
    };
  });

  let openMobileSearchOverlay = () => {};

  // Mobile nav buttons
  const mobileButtons = shadow.querySelectorAll('nav.mobile-bottom-nav button[data-page]');
  mobileButtons.forEach(btn => {
    if (btn.dataset.page === page || (isSearchPage && btn.dataset.page === 'search')) {
      btn.classList.add('active');
    }
    btn.onclick = () => {
      const target = btn.dataset.page;
      if (target === 'search') {
        openMobileSearchOverlay();
        return;
      }
      const route = target === 'chat'
        ? '/random/chat/'
        : `/${target === 'home' ? 'home' : target}/`;
      window.location.href = withBase(route);
    };
  });


  const accountBtn = shadow.getElementById('navbarAccountBtn');
  function closeAccountMenu() {
    if (!accountMenu || !accountBtn) return;
    accountMenu.hidden = true;
    accountBtn.setAttribute('aria-expanded', 'false');
  }

  function openAccountMenu() {
    if (!accountMenu || !accountBtn) return;
    accountMenu.hidden = false;
    accountBtn.setAttribute('aria-expanded', 'true');
  }

  function setAuthPasswordVisibility(visible) {
    const shouldShow = Boolean(visible);
    authPasswordVisible = shouldShow;
    if (!authPasswordInput) return;

    authPasswordInput.type = shouldShow ? 'text' : 'password';
    if (!authPasswordToggleBtn) return;
    authPasswordToggleBtn.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
    authPasswordToggleBtn.setAttribute('title', shouldShow ? 'Hide password' : 'Show password');
  }

  function setAuthModalMode(mode = 'login') {
    const normalized = mode === 'signup' ? 'signup' : 'login';
    authDialogMode = normalized;
    if (!authTitle || !authHint || !authSubmitBtn || !authSwitchBtn || !authPasswordInput) return;
    if (normalized === 'signup') {
      authTitle.textContent = 'Sign Up';
      authHint.textContent = 'Create an account with your email and password.';
      authSubmitBtn.textContent = 'Create Account';
      authSwitchBtn.textContent = 'Already have an account?';
      authPasswordInput.autocomplete = 'new-password';
    } else {
      authTitle.textContent = 'Log In';
      authHint.textContent = 'Use your email and password.';
      authSubmitBtn.textContent = 'Log In';
      authSwitchBtn.textContent = 'Create account';
      authPasswordInput.autocomplete = 'current-password';
    }
    if (authForgotBtn) {
      authForgotBtn.hidden = normalized === 'signup';
      authForgotBtn.disabled = false;
    }
    setAuthPasswordVisibility(false);
    if (authStatus) authStatus.textContent = '';
  }

  function openAuthModal(mode = 'login') {
    if (!authModal) return;
    setAuthModalMode(mode);
    authModal.hidden = false;
    if (authEmailInput) {
      authEmailInput.focus();
    }
  }

  function closeAuthModal() {
    if (!authModal) return;
    authModal.hidden = true;
    if (authStatus) authStatus.textContent = '';
    if (authPasswordInput) authPasswordInput.value = '';
    setAuthPasswordVisibility(false);
  }

  function openResetSentModal(email) {
    if (!resetSentModal) return;
    const safeEmail = String(email || '').trim();
    if (resetSentPrimary) {
      resetSentPrimary.textContent = safeEmail
        ? `A password reset link was sent to ${safeEmail}.`
        : 'A password reset link was sent to your email.';
    }
    closeAuthModal();
    resetSentModal.hidden = false;
  }

  function closeResetSentModal() {
    if (!resetSentModal) return;
    resetSentModal.hidden = true;
  }

  window.bilmAuthUi = window.bilmAuthUi || {};
  window.bilmAuthUi.open = (mode = 'login') => openAuthModal(mode);
  window.bilmAuthUi.close = () => closeAuthModal();
  window.dispatchEvent(new CustomEvent('bilm:auth-modal-ready'));
  window.addEventListener('bilm:open-auth-modal', (event) => {
    const mode = String(event?.detail?.mode || '').trim().toLowerCase() === 'signup'
      ? 'signup'
      : 'login';
    openAuthModal(mode);
  });

  function updateManualSyncCooldownUi() {
    if (!accountManualSyncBtn) return;
    const remainingMs = accountManualSyncCooldownUntil - Date.now();
    if (remainingMs <= 0) {
      accountManualSyncBtn.disabled = false;
      accountManualSyncBtn.textContent = 'Manual Sync';
      return;
    }
    const seconds = Math.ceil(remainingMs / 1000);
    accountManualSyncBtn.disabled = true;
    accountManualSyncBtn.textContent = `Manual Sync (${seconds}s)`;
  }

  function startManualSyncCooldown() {
    accountManualSyncCooldownUntil = Date.now() + ACCOUNT_MANUAL_SYNC_COOLDOWN_MS;
    if (accountManualSyncCooldownTimer) {
      window.clearInterval(accountManualSyncCooldownTimer);
      accountManualSyncCooldownTimer = null;
    }
    updateManualSyncCooldownUi();
    accountManualSyncCooldownTimer = window.setInterval(() => {
      if (Date.now() < accountManualSyncCooldownUntil) {
        updateManualSyncCooldownUi();
        return;
      }
      window.clearInterval(accountManualSyncCooldownTimer);
      accountManualSyncCooldownTimer = null;
      updateManualSyncCooldownUi();
    }, 250);
  }

  async function runNavbarManualSync(authApi) {
    if (!authApi) {
      showToast('Sync services unavailable.', 'error');
      return;
    }
    if (Date.now() < accountManualSyncCooldownUntil) return;
    authApi.noteUserActivity?.('navbar-manual-sync');
    const currentUser = authApi.getCurrentUser?.() || null;
    if (!currentUser) {
      if (accountMenuHint) accountMenuHint.textContent = 'Log in required for manual sync.';
      showToast('Log in required.', 'error');
      return;
    }
    startManualSyncCooldown();
    showToast('Syncing...', 'info', 0);
    try {
      const result = await authApi.runManualSync?.({ source: 'navbar-account-menu' });
      const pullStatus = result?.pullApplied ? 'pulled updates' : 'no pull changes';
      const pushStatus = result?.pushApplied ? 'pushed updates' : 'no push changes';
      const fallbackNote = result?.fallbackMode === 'snapshot-merge'
        ? ' (snapshot fallback)'
        : '';
      showToast(`Sync complete${fallbackNote}: ${pullStatus}, ${pushStatus}.`, 'success');
    } catch (error) {
      console.warn('Navbar manual sync failed:', error);
      const message = String(error?.message || 'Manual sync failed.');
      showToast(message, 'error');
      if (accountMenuHint) accountMenuHint.textContent = message;
    }
  }

  if (accountBtn) {
    accountBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      authApiInstance?.noteUserActivity?.('account-menu-toggle');
      const nextOpen = accountMenu?.hidden !== false;
      if (nextOpen) {
        openAccountMenu();
      } else {
        closeAccountMenu();
      }
    });
  }

  if (accountSettingsBtn) {
    accountSettingsBtn.addEventListener('click', () => {
      closeAccountMenu();
      window.location.href = withBase('/settings/account/');
    });
  }

  if (accountLoginBtn) {
    accountLoginBtn.addEventListener('click', () => {
      closeAccountMenu();
      openAuthModal('login');
    });
  }

  if (accountSignUpBtn) {
    accountSignUpBtn.addEventListener('click', () => {
      closeAccountMenu();
      openAuthModal('signup');
    });
  }

  if (accountManualSyncBtn) {
    accountManualSyncBtn.addEventListener('click', async () => {
      await runNavbarManualSync(authApiInstance);
    });
  }

  if (accountSignOutBtn) {
    accountSignOutBtn.addEventListener('click', async () => {
      if (!authApiInstance) {
        showToast('Sign out unavailable right now.', 'error');
        return;
      }
      try {
        showToast('Signing out and clearing local data...', 'info', 0);
        await authApiInstance.signOut?.();
        closeAccountMenu();
        showToast('Signed out. Reloading...', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 200);
      } catch (error) {
        console.warn('Navbar sign out failed:', error);
        showToast('Sign out failed.', 'error');
      }
    });
  }

  if (authSwitchBtn) {
    authSwitchBtn.addEventListener('click', () => {
      setAuthModalMode(authDialogMode === 'login' ? 'signup' : 'login');
    });
  }

  if (authPasswordToggleBtn) {
    authPasswordToggleBtn.addEventListener('click', () => {
      setAuthPasswordVisibility(!authPasswordVisible);
      authPasswordInput?.focus();
    });
  }

  if (authForgotBtn) {
    authForgotBtn.addEventListener('click', async () => {
      if (!authApiInstance || typeof authApiInstance.sendPasswordReset !== 'function') {
        if (authStatus) authStatus.textContent = 'Password reset is unavailable right now.';
        showToast('Password reset unavailable.', 'error');
        return;
      }
      const email = String(authEmailInput?.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (authStatus) authStatus.textContent = 'Enter your account email first.';
        authEmailInput?.focus();
        return;
      }
      if (authStatus) authStatus.textContent = 'Sending reset email...';
      authForgotBtn.disabled = true;
      try {
        await authApiInstance.sendPasswordReset(email);
        if (authStatus) authStatus.textContent = 'If this account exists, a reset link was sent.';
        showToast('Reset email sent.', 'success');
        openResetSentModal(email);
      } catch (error) {
        const message = String(error?.message || 'Password reset failed.');
        if (authStatus) authStatus.textContent = message;
        showToast(message, 'error');
      } finally {
        authForgotBtn.disabled = false;
      }
    });
  }

  if (authModalCloseBtn) {
    authModalCloseBtn.addEventListener('click', () => {
      closeAuthModal();
    });
  }

  if (authModal) {
    authModal.addEventListener('click', (event) => {
      if (event.target === authModal) {
        closeAuthModal();
      }
    });
  }

  if (resetSentCloseBtn) {
    resetSentCloseBtn.addEventListener('click', () => {
      closeResetSentModal();
    });
  }

  if (resetSentDoneBtn) {
    resetSentDoneBtn.addEventListener('click', () => {
      closeResetSentModal();
    });
  }

  if (resetSentModal) {
    resetSentModal.addEventListener('click', (event) => {
      if (event.target === resetSentModal) {
        closeResetSentModal();
      }
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!authApiInstance) {
        if (authStatus) authStatus.textContent = 'Account services are unavailable right now.';
        showToast('Account services unavailable.', 'error');
        return;
      }
      const email = String(authEmailInput?.value || '').trim();
      const password = String(authPasswordInput?.value || '');
      if (!email || !password) {
        if (authStatus) authStatus.textContent = 'Email and password are required.';
        return;
      }
      if (authStatus) authStatus.textContent = authDialogMode === 'signup' ? 'Creating account...' : 'Signing in...';
      try {
        if (authDialogMode === 'signup') {
          const signUpResult = await authApiInstance.signUp?.(email, password);
          const signupMessage = String(signUpResult?.message || 'Account created.');
          if (authStatus) authStatus.textContent = signupMessage;
          showToast(signupMessage, signUpResult?.seededCloudData === false ? 'error' : 'success');
        } else {
          const signInResult = await authApiInstance.signIn?.(email, password);
          const loginMessage = String(signInResult?.message || 'Logged in.');
          if (authStatus) authStatus.textContent = loginMessage;
          showToast(loginMessage, signInResult?.syncOk === false ? 'error' : 'success');
        }
        closeAuthModal();
        closeAccountMenu();
      } catch (error) {
        const message = String(error?.message || 'Authentication failed.');
        if (authStatus) authStatus.textContent = message;
        showToast(message, 'error');
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (!accountMenu || accountMenu.hidden) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.includes(accountMenuWrap)) return;
    closeAccountMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAccountMenu();
      closeAuthModal();
      closeResetSentModal();
    }
  });

  setAuthModalMode('login');
  updateManualSyncCooldownUi();

  loadAuthScript().then(async (authApi) => {
    authApiInstance = authApi;
    await authApi.init();

    const syncAccountButton = (user) => {
      if (!accountBtn) return;
      accountBtn.textContent = user ? (user.displayName || user.email || 'Account') : 'Account';
      accountBtn.title = user ? 'Open account settings / log out' : 'Log in or create account';
      if (accountLoginBtn) accountLoginBtn.hidden = Boolean(user);
      if (accountSignUpBtn) accountSignUpBtn.hidden = Boolean(user);
      if (accountSignOutBtn) accountSignOutBtn.hidden = !user;
      if (accountMenuHint) {
        accountMenuHint.textContent = user
          ? `Signed in as ${user.displayName || user.email || 'account user'}.`
          : 'Log in for cloud sync.';
      }
    };

    syncAccountButton(authApi.getCurrentUser());
    authApi.onAuthStateChanged?.(syncAccountButton);
    updateManualSyncCooldownUi();
  }).catch((error) => {
    console.warn('Auth module unavailable in navbar:', error);
    closeAccountMenu();
    if (accountBtn) {
      accountBtn.textContent = 'Account';
      accountBtn.title = 'Open account settings';
    }
    if (accountLoginBtn) accountLoginBtn.hidden = true;
    if (accountSignUpBtn) accountSignUpBtn.hidden = true;
    if (accountSignOutBtn) accountSignOutBtn.hidden = true;
    if (accountManualSyncBtn) accountManualSyncBtn.disabled = true;
    if (accountMenuHint) {
      accountMenuHint.textContent = 'Account services unavailable. Use Account Settings.';
    }
  });

  const searchInput = shadow.querySelector('#searchInput');
  const navbarSearchForm = shadow.getElementById('navbarSearchForm');
  const desktopClearBtn = shadow.getElementById('desktopSearchClearBtn');
  const desktopSuggestPanel = shadow.getElementById('desktopSearchSuggestPanel');
  const desktopSuggestList = shadow.getElementById('desktopSearchSuggestList');
  const desktopSuggestHint = shadow.getElementById('desktopSearchSuggestHint');
  if (navbarSearchForm && searchInput) {
    let desktopSuggestDebounceTimer = null;
    let desktopSuggestAbortController = null;
    let desktopSuggestToken = 0;

    const clearDesktopSuggestRequest = () => {
      desktopSuggestToken += 1;
      if (desktopSuggestDebounceTimer) {
        window.clearTimeout(desktopSuggestDebounceTimer);
        desktopSuggestDebounceTimer = null;
      }
      if (desktopSuggestAbortController) {
        try {
          desktopSuggestAbortController.abort();
        } catch {
          // Ignore abort failures.
        }
        desktopSuggestAbortController = null;
      }
    };

    const hideDesktopSuggestions = () => {
      if (desktopSuggestPanel) desktopSuggestPanel.hidden = true;
      if (desktopSuggestList) desktopSuggestList.innerHTML = '';
      if (desktopSuggestHint) desktopSuggestHint.innerHTML = '';
    };

    const renderDesktopHint = ({ text = '', didYouMeanQuery = '' } = {}) => {
      if (!desktopSuggestHint) return;
      desktopSuggestHint.innerHTML = '';
      if (didYouMeanQuery) {
        const prefix = document.createTextNode('Did you mean ');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `"${didYouMeanQuery}"`;
        button.addEventListener('click', () => {
          submitSearch(didYouMeanQuery);
        });
        desktopSuggestHint.append(prefix, button, document.createTextNode('?'));
        return;
      }
      desktopSuggestHint.textContent = String(text || '').trim();
    };

    const renderDesktopSuggestions = ({
      query = '',
      suggestions = [],
      didYouMean = ''
    } = {}) => {
      if (!desktopSuggestPanel || !desktopSuggestList) return;
      const trimmedQuery = String(query || '').trim();
      desktopSuggestList.innerHTML = '';
      suggestions.forEach((entry) => {
        const label = String(entry?.label || '').trim();
        if (!label) return;
        const listItem = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'desktop-search-suggest-item';
        button.setAttribute('role', 'option');
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        button.addEventListener('click', () => {
          submitSearch(label);
        });

        const labelEl = document.createElement('span');
        labelEl.className = 'desktop-search-suggest-label';
        labelEl.textContent = label;
        button.appendChild(labelEl);

        const meta = String(entry?.meta || '').trim();
        if (meta) {
          const metaEl = document.createElement('span');
          metaEl.className = 'desktop-search-suggest-meta';
          metaEl.textContent = meta;
          button.appendChild(metaEl);
        }

        listItem.appendChild(button);
        desktopSuggestList.appendChild(listItem);
      });

      if (!trimmedQuery || trimmedQuery.length < 2) {
        desktopSuggestPanel.hidden = true;
        return;
      }

      desktopSuggestPanel.hidden = false;
      if (didYouMean) {
        renderDesktopHint({ didYouMeanQuery: didYouMean });
      } else if (!suggestions.length) {
        renderDesktopHint({ text: 'No suggestions yet. Press Enter to search.' });
      } else {
        renderDesktopHint({ text: 'Pick a suggestion or press Enter to search.' });
      }
    };

    const refreshDesktopSuggestions = async (query = '') => {
      const trimmedQuery = String(query || '').trim();
      if (trimmedQuery.length < 2) {
        hideDesktopSuggestions();
        return;
      }

      const settings = window.bilmTheme?.getSettings?.() || {};
      if (settings.incognito === true) {
        if (desktopSuggestPanel) desktopSuggestPanel.hidden = false;
        if (desktopSuggestList) desktopSuggestList.innerHTML = '';
        renderDesktopHint({ text: 'Incognito is on. Press Enter to search privately.' });
        return;
      }

      const requestToken = desktopSuggestToken + 1;
      desktopSuggestToken = requestToken;
      if (desktopSuggestAbortController) {
        try {
          desktopSuggestAbortController.abort();
        } catch {
          // Ignore abort failures.
        }
      }
      desktopSuggestAbortController = new AbortController();
      const signal = desktopSuggestAbortController.signal;
      try {
        const suggestions = await fetchSearchSuggestions(trimmedQuery, { signal });
        if (requestToken !== desktopSuggestToken) return;
        const didYouMean = resolveDidYouMeanQuery(trimmedQuery, suggestions.map((entry) => entry.label));
        renderDesktopSuggestions({
          query: trimmedQuery,
          suggestions,
          didYouMean
        });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        if (requestToken !== desktopSuggestToken) return;
        renderDesktopSuggestions({
          query: trimmedQuery,
          suggestions: [],
          didYouMean: ''
        });
      }
    };

    const scheduleDesktopSuggestRefresh = () => {
      if (desktopSuggestDebounceTimer) {
        window.clearTimeout(desktopSuggestDebounceTimer);
      }
      desktopSuggestDebounceTimer = window.setTimeout(() => {
        desktopSuggestDebounceTimer = null;
        void refreshDesktopSuggestions(searchInput.value);
      }, DESKTOP_SEARCH_SUGGEST_DEBOUNCE_MS);
    };

    navbarSearchForm.setAttribute('action', withBase('/search/'));
    navbarSearchForm.addEventListener('submit', event => {
      event.preventDefault();
      clearDesktopSuggestRequest();
      hideDesktopSuggestions();
      submitSearch(searchInput.value);
    });

    const toggleDesktopClear = () => {
      if (!desktopClearBtn) return;
      const hasText = searchInput.value.trim().length > 0;
      desktopClearBtn.hidden = !hasText;
      desktopClearBtn.style.display = hasText ? 'flex' : 'none';
      if (!hasText) {
        hideDesktopSuggestions();
      }
    };

    toggleDesktopClear();
    searchInput.addEventListener('input', () => {
      toggleDesktopClear();
      scheduleDesktopSuggestRefresh();
    });
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length >= 2) {
        scheduleDesktopSuggestRefresh();
      }
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideDesktopSuggestions();
      }
    });
    searchInput.addEventListener('blur', () => {
      window.setTimeout(() => {
        const activeElement = shadow.activeElement;
        if (activeElement && desktopSuggestPanel?.contains(activeElement)) return;
        hideDesktopSuggestions();
      }, 120);
    });
    if (desktopClearBtn) {
      desktopClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        toggleDesktopClear();
        clearDesktopSuggestRequest();
        hideDesktopSuggestions();
        searchInput.focus();
      });
    }
  }

  // Mobile search overlay handlers
  const overlay = shadow.getElementById('mobileSearchOverlay');
  if (overlay) {
    const input = shadow.getElementById('mobileSearchInput');
    const clearBtn = shadow.getElementById('mobileSearchCloseBtn');
    const topCloseBtn = shadow.getElementById('mobileSearchTopCloseBtn');
    const historySection = shadow.getElementById('mobileSearchHistorySection');
    const historyList = shadow.getElementById('mobileSearchHistoryList');
    const suggestSection = shadow.getElementById('mobileSearchSuggestSection');
    const suggestList = shadow.getElementById('mobileSearchSuggestList');
    const suggestTitle = shadow.getElementById('mobileSearchSuggestTitle');
    const hintText = shadow.getElementById('mobileSearchHint');
    let mobileSuggestDebounceTimer = null;
    let mobileSuggestAbortController = null;
    let mobileSuggestToken = 0;

    const clearMobileSuggestRequest = () => {
      mobileSuggestToken += 1;
      if (mobileSuggestDebounceTimer) {
        window.clearTimeout(mobileSuggestDebounceTimer);
        mobileSuggestDebounceTimer = null;
      }
      if (mobileSuggestAbortController) {
        try {
          mobileSuggestAbortController.abort();
        } catch {
          // Ignore abort failures.
        }
        mobileSuggestAbortController = null;
      }
    };

    const setMobileSearchHint = (text, { didYouMeanQuery = '' } = {}) => {
      if (!hintText) return;
      hintText.innerHTML = '';
      hintText.classList.toggle('mobile-search-did-you-mean', Boolean(didYouMeanQuery));
      if (didYouMeanQuery) {
        const prefix = document.createTextNode('Did you mean ');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `"${didYouMeanQuery}"`;
        button.addEventListener('click', () => {
          submitSearch(didYouMeanQuery, { closeMobileOverlay: true });
        });
        hintText.append(prefix, button, document.createTextNode('?'));
        return;
      }
      hintText.textContent = String(text || '').trim();
    };

    const createMobileSearchRow = ({
      label = '',
      meta = '',
      removable = false,
      onSelect = null,
      onRemove = null
    } = {}) => {
      const item = document.createElement('li');
      item.className = 'mobile-search-item';

      const mainButton = document.createElement('button');
      mainButton.type = 'button';
      mainButton.className = 'mobile-search-item-main';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'mobile-search-item-label';
      labelSpan.textContent = String(label || '').trim();
      mainButton.appendChild(labelSpan);
      if (meta) {
        const metaSpan = document.createElement('span');
        metaSpan.className = 'mobile-search-item-meta';
        metaSpan.textContent = String(meta || '').trim();
        mainButton.appendChild(metaSpan);
      }
      mainButton.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect();
      });
      item.appendChild(mainButton);

      if (removable) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'mobile-search-item-remove';
        removeBtn.setAttribute('aria-label', `Remove ${String(label || '').trim()} from search history`);
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (typeof onRemove === 'function') onRemove();
        });
        item.appendChild(removeBtn);
      }
      return item;
    };

    const renderMobileSearchHistory = (query = '') => {
      if (!historySection || !historyList || !suggestSection || !suggestList) return;
      const normalizedQuery = normalizeSearchText(query);
      const historyLimit = getMobileHistoryLimit();
      const entries = getSearchHistoryEntries({ limit: 120 })
        .filter((entry) => {
          if (!normalizedQuery) return true;
          return normalizeSearchText(entry.query).includes(normalizedQuery);
        })
        .slice(0, historyLimit);

      historyList.innerHTML = '';
      entries.forEach((entry) => {
        const row = createMobileSearchRow({
          label: entry.query,
          meta: 'Recent',
          removable: true,
          onSelect: () => submitSearch(entry.query, { closeMobileOverlay: true }),
          onRemove: () => {
            removeSearchHistoryEntry(entry.query);
            renderMobileSearchHistory(input?.value || '');
          }
        });
        historyList.appendChild(row);
      });

      historySection.hidden = false;
      suggestSection.hidden = true;
      suggestList.innerHTML = '';

      if (entries.length === 0) {
        setMobileSearchHint(
          normalizedQuery
            ? 'No recent searches match that text.'
            : 'No recent searches yet.'
        );
      } else {
        setMobileSearchHint('Tap a recent search or type to see suggestions.');
      }
    };

    const renderMobileSearchSuggestions = ({
      query = '',
      historyMatches = [],
      remoteSuggestions = [],
      didYouMean = ''
    } = {}) => {
      if (!historySection || !historyList || !suggestSection || !suggestList || !suggestTitle) return;
      const combined = [];
      const seen = new Set();

      historyMatches.forEach((entry) => {
        const label = String(entry?.query || '').trim();
        if (!label) return;
        const key = normalizeSearchText(label);
        if (!key || seen.has(key)) return;
        seen.add(key);
        combined.push({
          label,
          meta: 'Recent',
          removable: true
        });
      });

      remoteSuggestions.forEach((entry) => {
        const label = String(entry?.label || '').trim();
        if (!label) return;
        const key = normalizeSearchText(label);
        if (!key || seen.has(key)) return;
        seen.add(key);
        combined.push({
          label,
          meta: String(entry?.meta || '').trim(),
          removable: false
        });
      });

      suggestList.innerHTML = '';
      combined.forEach((entry) => {
        const row = createMobileSearchRow({
          label: entry.label,
          meta: entry.meta,
          removable: entry.removable,
          onSelect: () => submitSearch(entry.label, { closeMobileOverlay: true }),
          onRemove: entry.removable
            ? () => {
              removeSearchHistoryEntry(entry.label);
              renderMobileSearchHistory(query);
            }
            : null
        });
        suggestList.appendChild(row);
      });

      historySection.hidden = true;
      suggestSection.hidden = false;
      suggestTitle.textContent = combined.length > 0 ? 'Suggestions' : 'No Suggestions';

      if (didYouMean) {
        setMobileSearchHint('', { didYouMeanQuery: didYouMean });
      } else if (combined.length === 0) {
        setMobileSearchHint('No suggestions yet. Press Enter to search.');
      } else {
        setMobileSearchHint('Tap a suggestion or press Enter to search.');
      }
    };

    const refreshMobileSearchFromInput = async (query = '') => {
      const trimmedQuery = String(query || '').trim();
      if (!trimmedQuery) {
        renderMobileSearchHistory('');
        return;
      }

      const settings = window.bilmTheme?.getSettings?.() || {};
      if (settings.incognito === true) {
        historySection.hidden = true;
        suggestSection.hidden = true;
        if (historyList) historyList.innerHTML = '';
        if (suggestList) suggestList.innerHTML = '';
        setMobileSearchHint('Incognito is on. Press Enter to search privately.');
        return;
      }

      const requestToken = mobileSuggestToken + 1;
      mobileSuggestToken = requestToken;
      if (mobileSuggestAbortController) {
        try {
          mobileSuggestAbortController.abort();
        } catch {
          // Ignore abort failures.
        }
      }
      mobileSuggestAbortController = new AbortController();
      const signal = mobileSuggestAbortController.signal;
      const normalizedQuery = normalizeSearchText(trimmedQuery);
      const historyMatches = getSearchHistoryEntries({ limit: 120 })
        .filter((entry) => normalizeSearchText(entry.query).includes(normalizedQuery))
        .slice(0, 3);

      try {
        const remoteSuggestions = await fetchSearchSuggestions(trimmedQuery, { signal });
        if (requestToken !== mobileSuggestToken) return;
        const didYouMean = resolveDidYouMeanQuery(trimmedQuery, [
          ...historyMatches.map((entry) => entry.query),
          ...remoteSuggestions.map((entry) => entry.label)
        ]);
        renderMobileSearchSuggestions({
          query: trimmedQuery,
          historyMatches,
          remoteSuggestions,
          didYouMean
        });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        if (requestToken !== mobileSuggestToken) return;
        renderMobileSearchSuggestions({
          query: trimmedQuery,
          historyMatches,
          remoteSuggestions: [],
          didYouMean: resolveDidYouMeanQuery(trimmedQuery, historyMatches.map((entry) => entry.query))
        });
      }
    };

    const scheduleMobileSearchRefresh = () => {
      if (!input) return;
      if (mobileSuggestDebounceTimer) {
        window.clearTimeout(mobileSuggestDebounceTimer);
      }
      mobileSuggestDebounceTimer = window.setTimeout(() => {
        mobileSuggestDebounceTimer = null;
        void refreshMobileSearchFromInput(input.value);
      }, SEARCH_SUGGEST_DEBOUNCE_MS);
    };

    const closeOverlay = () => {
      clearMobileSuggestRequest();
      overlay.classList.remove('active');
      if (input) input.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      if (historyList) historyList.innerHTML = '';
      if (suggestList) suggestList.innerHTML = '';
      if (historySection) historySection.hidden = false;
      if (suggestSection) suggestSection.hidden = true;
      setMobileSearchHint('Type to search.');
      document.body.style.overflow = '';
    };

    openMobileSearchOverlay = () => {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      if (input) {
        input.focus();
        input.select();
      }
      if (clearBtn) {
        clearBtn.style.display = input && input.value.length > 0 ? 'block' : 'none';
      }
      void refreshMobileSearchFromInput(input?.value || '');
    };

    input?.addEventListener('input', () => {
      if (clearBtn) clearBtn.style.display = input.value.length > 0 ? 'block' : 'none';
      scheduleMobileSearchRefresh();
    });

    clearBtn?.addEventListener('click', () => {
      if (!input) return;
      input.value = '';
      clearBtn.style.display = 'none';
      renderMobileSearchHistory('');
      input.focus();
    });

    topCloseBtn?.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeOverlay();
    });

    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const query = input.value.trim();
        if (query) {
          submitSearch(query, { closeMobileOverlay: true });
        }
      } else if (e.key === 'Escape') {
        closeOverlay();
      }
    });
  }
})();
