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

const ANILIST_GRAPHQL_URL = 'https://storage-api.watchbilm.org/media/anilist';
const BASE_URL = detectBasePath();
const ROW_APPEND_COUNT = 5;
const ROW_MIN_INITIAL_COUNT = 3;
const TMDB_PAGE_FETCH_SIZE = 20;
const PRIORITY_SECTION_COUNT = 4;
const ANIME_PAGE_FETCH_SIZE = 20;
const ANIME_TV_GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Mystery', 'Romance', 'Sci-Fi'];
const VIDSRC_TVSHOWS_LATEST_API = '/api/vidsrc/latest?type=tvshows';

let allGenres = [];
let genresReadyPromise = Promise.resolve([]);
const genreNameById = new Map();
const regularSectionState = new Map();
const animeSectionState = new Map();
const API_COOLDOWN_MS = 180;
const API_MAX_RETRIES = 2;
const SECTION_API_MAX_RETRIES = 3;
const SECTION_LOAD_INTERVAL_MS = 180;
const API_DEBUG_TIMING = false;
const apiCooldownByHost = new Map();
const apiRequestQueueByHost = new Map();
const inFlightGetRequests = new Map();
const inFlightPostRequests = new Map();
const vidsrcTvPageCache = new Map();
const vidsrcTvDetailsCache = new Map();
const pageRequestController = new AbortController();
let animeSectionsBootstrapped = false;
let animeSectionsLoadPromise = null;

const modeState = { current: 'regular' };
const filterState = {
  genre: '',
  age: '',
  minYear: '',
  maxYear: '',
  minRating: ''
};
const TV_AGE_FILTER_OPTIONS = [
  { value: 'TV-Y', label: 'TV-Y' },
  { value: 'TV-Y7', label: 'TV-Y7' },
  { value: 'TV-G', label: 'TV-G' },
  { value: 'TV-PG', label: 'TV-PG' },
  { value: 'TV-14', label: 'TV-14' },
  { value: 'TV-MA', label: 'TV-MA' }
];
const ANIME_AGE_FILTER_OPTIONS = [
  { value: 'not_adult', label: 'Not Adult' },
  { value: 'adult', label: 'Adult' },
  { value: 'unknown', label: 'Unknown' }
];
const filterElements = {
  toggle: null,
  overlay: null,
  drawer: null,
  close: null,
  yearMin: null,
  yearMax: null,
  ratingMin: null,
  genreOptions: null,
  ageRatingOptions: null,
  clear: null,
  apply: null,
  summary: null
};

function getApiOrigin() {
  return String(window.location.hostname || '').toLowerCase() === 'cdn.jsdelivr.net'
    ? 'https://watchbilm.org'
    : window.location.origin;
}

function setContentMode(mode) {
  const normalizedMode = mode === 'anime' ? 'anime' : 'regular';
  modeState.current = normalizedMode;

  const regularButton = document.getElementById('regularModeButton');
  const animeButton = document.getElementById('animeModeButton');
  const quickFilters = document.getElementById('quickFilters');
  const tvSections = document.getElementById('tvSections');
  const animeQuickFilters = document.getElementById('animeQuickFilters');
  const animeSections = document.getElementById('animeSections');

  const isAnime = normalizedMode === 'anime';
  if (regularButton) {
    regularButton.classList.toggle('is-active', !isAnime);
    regularButton.setAttribute('aria-selected', String(!isAnime));
  }
  if (animeButton) {
    animeButton.classList.toggle('is-active', isAnime);
    animeButton.setAttribute('aria-selected', String(isAnime));
  }
  if (quickFilters) quickFilters.classList.toggle('is-hidden', isAnime);
  if (tvSections) tvSections.classList.toggle('is-hidden', isAnime);
  if (animeQuickFilters) animeQuickFilters.classList.toggle('is-hidden', !isAnime);
  if (animeSections) animeSections.classList.toggle('is-hidden', !isAnime);

  refreshFilterUiForCurrentMode();
}

function bindModeToggleButtons(onAnimeSelected) {
  const regularButton = document.getElementById('regularModeButton');
  const animeButton = document.getElementById('animeModeButton');
  if (regularButton) regularButton.addEventListener('click', () => setContentMode('regular'));
  if (animeButton) {
    animeButton.addEventListener('click', async () => {
      setContentMode('anime');
      if (typeof onAnimeSelected === 'function') {
        await onAnimeSelected();
      }
    });
  }
}

function slugifySectionTitle(title) {
  return (title || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function normalizeFilterToken(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeFilterYear(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1900 || parsed > 2100) return '';
  return parsed;
}

function sanitizeFilterRating(value) {
  const parsed = Number.parseFloat(String(value || '').trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) return '';
  return Math.round(parsed * 10) / 10;
}

function toSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function rotateBySeed(items, seed = '') {
  const list = Array.isArray(items) ? [...items] : [];
  if (list.length <= 1) return list;
  let hash = 0;
  for (const char of String(seed || '')) {
    hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  }
  const offset = hash % list.length;
  return list.slice(offset).concat(list.slice(0, offset));
}

function enableHorizontalWheelScroll(container) {
  if (!container || container.dataset.horizontalWheelBound === 'true') return;
  container.dataset.horizontalWheelBound = 'true';

  container.addEventListener('wheel', (event) => {
    if (event.defaultPrevented) return;
    if (container.scrollWidth <= container.clientWidth + 1) return;

    const absDeltaX = Math.abs(event.deltaX);
    const absDeltaY = Math.abs(event.deltaY);
    if (!absDeltaX && !absDeltaY) return;

    const delta = absDeltaY > absDeltaX ? event.deltaY : event.deltaX;
    if (!delta) return;

    const previousScrollLeft = container.scrollLeft;
    container.scrollLeft += delta;
    if (container.scrollLeft !== previousScrollLeft) {
      event.preventDefault();
    }
  }, { passive: false });
}

function getAdaptiveInitialCount(rowEl, fallbackCardWidth = 140) {
  if (!rowEl) return ROW_MIN_INITIAL_COUNT;
  const rowWidth = Number(rowEl.clientWidth || 0);
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return ROW_MIN_INITIAL_COUNT;
  const computed = window.getComputedStyle(rowEl);
  const gap = Number.parseFloat(computed.columnGap || computed.gap || '12') || 12;
  const sampleCard = rowEl.querySelector('.movie-card');
  const cardWidth = Number(sampleCard?.getBoundingClientRect?.().width || 0)
    || Number.parseFloat(sampleCard ? window.getComputedStyle(sampleCard).width : '')
    || fallbackCardWidth;
  const visibleCount = Math.floor((rowWidth + gap) / (cardWidth + gap));
  return Math.max(ROW_MIN_INITIAL_COUNT, visibleCount + 1);
}

function getRowPreloadDistance(rowEl, fallbackCardWidth = 140) {
  if (!rowEl) return 120;
  const computed = window.getComputedStyle(rowEl);
  const gap = Number.parseFloat(computed.columnGap || computed.gap || '12') || 12;
  const sampleCard = rowEl.querySelector('.movie-card');
  const cardWidth = Number(sampleCard?.getBoundingClientRect?.().width || 0)
    || Number.parseFloat(sampleCard ? window.getComputedStyle(sampleCard).width : '')
    || fallbackCardWidth;
  return Math.max(96, Math.round(cardWidth + gap));
}

function getOrCreateSectionState(stateMap, sectionSlug) {
  const key = String(sectionSlug || '').trim();
  if (!key) {
    return {
      nextPage: 1,
      bufferQueue: [],
      seenIds: new Set(),
      exhausted: false,
      loadingPromise: null
    };
  }
  if (!stateMap.has(key)) {
    stateMap.set(key, {
      nextPage: 1,
      bufferQueue: [],
      seenIds: new Set(),
      exhausted: false,
      loadingPromise: null
    });
  }
  return stateMap.get(key);
}

function isRowVisibleForAdaptiveTopUp(rowEl) {
  if (!rowEl) return false;
  if (rowEl.offsetParent === null) return false;
  return Number(rowEl.clientWidth || 0) > 0;
}

function buildCategoryUrl({
  mode = 'regular',
  section = '',
  genre = '',
  title = '',
  yearMin = '',
  yearMax = '',
  ratingMin = '',
  age = ''
} = {}) {
  const params = new URLSearchParams();
  params.set('mode', mode === 'anime' ? 'anime' : 'regular');
  const normalizedSection = toSlug(section);
  if (normalizedSection) params.set('section', normalizedSection);
  const normalizedGenre = toSlug(genre);
  if (normalizedGenre) params.set('genre', normalizedGenre);
  const normalizedYearMin = sanitizeFilterYear(yearMin);
  const normalizedYearMax = sanitizeFilterYear(yearMax);
  const normalizedRatingMin = sanitizeFilterRating(ratingMin);
  if (normalizedYearMin !== '') params.set('year_min', String(normalizedYearMin));
  if (normalizedYearMax !== '') params.set('year_max', String(normalizedYearMax));
  if (normalizedRatingMin !== '') params.set('rating_min', String(normalizedRatingMin));
  const ageValue = String(age || '').trim();
  if (ageValue) params.set('age', ageValue);
  const titleValue = String(title || '').trim();
  if (titleValue) params.set('title', titleValue);
  return `${BASE_URL}/tv/category.html?${params.toString()}`;
}

function getActiveGenreEntries() {
  if (modeState.current === 'anime') {
    return ANIME_TV_GENRES.map((label) => ({ value: toSlug(label), label }));
  }
  return allGenres
    .map((genre) => String(genre?.name || '').trim())
    .filter(Boolean)
    .map((label) => ({ value: toSlug(label), label }));
}

function getActiveAgeEntries() {
  return modeState.current === 'anime'
    ? [...ANIME_AGE_FILTER_OPTIONS]
    : [...TV_AGE_FILTER_OPTIONS];
}

function renderFilterOptions(container, entries, selectedValue, inputName) {
  if (!container) return;
  container.innerHTML = '';

  const options = [{ value: '', label: 'Any' }, ...entries];
  options.forEach((entry, index) => {
    const optionValue = String(entry.value || '').trim();
    const label = String(entry.label || '').trim() || 'Unknown';
    const wrapper = document.createElement('label');
    wrapper.className = 'filter-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = inputName;
    input.value = optionValue;
    input.id = `${inputName}-${index}`;
    input.checked = optionValue === String(selectedValue || '').trim();

    const text = document.createElement('span');
    text.textContent = label;

    wrapper.appendChild(input);
    wrapper.appendChild(text);
    container.appendChild(wrapper);
  });
}

function collectFilterStateFromUi() {
  if (!filterElements.drawer) return;
  const selectedGenre = String(filterElements.drawer.querySelector('input[name="genreFilterOption"]:checked')?.value || '').trim();
  const selectedAge = String(filterElements.drawer.querySelector('input[name="ageFilterOption"]:checked')?.value || '').trim();

  let minYear = sanitizeFilterYear(filterElements.yearMin?.value);
  let maxYear = sanitizeFilterYear(filterElements.yearMax?.value);
  if (minYear !== '' && maxYear !== '' && minYear > maxYear) {
    const temp = minYear;
    minYear = maxYear;
    maxYear = temp;
  }
  const minRating = sanitizeFilterRating(filterElements.ratingMin?.value);

  filterState.genre = selectedGenre;
  filterState.age = selectedAge;
  filterState.minYear = minYear === '' ? '' : String(minYear);
  filterState.maxYear = maxYear === '' ? '' : String(maxYear);
  filterState.minRating = minRating === '' ? '' : String(minRating);
}

function refreshFilterUiForCurrentMode() {
  if (!filterElements.drawer) return;

  const genreEntries = getActiveGenreEntries();
  const ageEntries = getActiveAgeEntries();
  const allowedGenreValues = new Set(genreEntries.map((entry) => String(entry.value || '').trim()));
  const allowedAgeValues = new Set(ageEntries.map((entry) => String(entry.value || '').trim()));

  if (!allowedGenreValues.has(filterState.genre)) filterState.genre = '';
  if (!allowedAgeValues.has(filterState.age)) filterState.age = '';

  renderFilterOptions(filterElements.genreOptions, genreEntries, filterState.genre, 'genreFilterOption');
  renderFilterOptions(filterElements.ageRatingOptions, ageEntries, filterState.age, 'ageFilterOption');

  if (filterElements.yearMin) filterElements.yearMin.value = filterState.minYear;
  if (filterElements.yearMax) filterElements.yearMax.value = filterState.maxYear;
  if (filterElements.ratingMin) filterElements.ratingMin.value = filterState.minRating;
  if (filterElements.summary) {
    const modeLabel = modeState.current === 'anime' ? 'anime' : 'TV';
    filterElements.summary.textContent = `Apply filters to open ${modeLabel} results in a dedicated page URL.`;
  }
}

function setFiltersDrawerOpen(open) {
  const isOpen = Boolean(open);
  if (!filterElements.drawer || !filterElements.overlay) return;
  filterElements.drawer.classList.toggle('is-hidden', !isOpen);
  filterElements.overlay.classList.toggle('is-hidden', !isOpen);
  filterElements.drawer.setAttribute('aria-hidden', String(!isOpen));
  if (filterElements.toggle) {
    filterElements.toggle.setAttribute('aria-expanded', String(isOpen));
  }
  document.body.classList.toggle('filters-open', isOpen);
}

function clearAllFilters() {
  filterState.genre = '';
  filterState.age = '';
  filterState.minYear = '';
  filterState.maxYear = '';
  filterState.minRating = '';
  refreshFilterUiForCurrentMode();
}

function applyFiltersToResultsPage() {
  const mode = modeState.current === 'anime' ? 'anime' : 'regular';
  const title = mode === 'anime' ? 'Filtered Anime TV Shows' : 'Filtered TV Shows';
  const nextUrl = buildCategoryUrl({
    mode,
    genre: filterState.genre,
    age: filterState.age,
    yearMin: filterState.minYear,
    yearMax: filterState.maxYear,
    ratingMin: filterState.minRating,
    title
  });
  window.location.href = nextUrl;
}

function initializeFiltersUi() {
  filterElements.toggle = document.getElementById('filtersToggleBtn');
  filterElements.overlay = document.getElementById('filtersOverlay');
  filterElements.drawer = document.getElementById('filtersDrawer');
  filterElements.close = document.getElementById('closeFiltersBtn');
  filterElements.yearMin = document.getElementById('filterYearMin');
  filterElements.yearMax = document.getElementById('filterYearMax');
  filterElements.ratingMin = document.getElementById('filterRatingMin');
  filterElements.genreOptions = document.getElementById('filterGenreOptions');
  filterElements.ageRatingOptions = document.getElementById('filterAgeRatingOptions');
  filterElements.clear = document.getElementById('clearFiltersBtn');
  filterElements.apply = document.getElementById('applyFiltersBtn');
  filterElements.summary = document.getElementById('filtersSummary');

  if (!filterElements.toggle || !filterElements.drawer || !filterElements.overlay) return;

  filterElements.toggle.addEventListener('click', async () => {
    await Promise.resolve(genresReadyPromise).catch(() => null);
    refreshFilterUiForCurrentMode();
    setFiltersDrawerOpen(true);
  });

  filterElements.close?.addEventListener('click', () => setFiltersDrawerOpen(false));
  filterElements.overlay.addEventListener('click', () => setFiltersDrawerOpen(false));

  filterElements.clear?.addEventListener('click', () => {
    clearAllFilters();
  });

  const syncFilterStateFromUi = () => {
    collectFilterStateFromUi();
  };
  filterElements.drawer.addEventListener('change', syncFilterStateFromUi);
  filterElements.yearMin?.addEventListener('input', syncFilterStateFromUi);
  filterElements.yearMax?.addEventListener('input', syncFilterStateFromUi);
  filterElements.ratingMin?.addEventListener('change', syncFilterStateFromUi);

  filterElements.apply?.addEventListener('click', () => {
    collectFilterStateFromUi();
    refreshFilterUiForCurrentMode();
    applyFiltersToResultsPage();
  });

  filterElements.drawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setFiltersDrawerOpen(false);
    }
  });

}

function getRequestSignal(signal) {
  return signal || pageRequestController.signal;
}

function debugApiTiming(event, details) {
  if (!API_DEBUG_TIMING) return;
  console.debug(`[api:${event}]`, details);
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getStorageApiBackupGetUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim(), window.location.href);
    if (parsed.origin !== 'https://storage-api.watchbilm.org') return '';
    if (!parsed.pathname.startsWith('/media/tmdb/')) return '';
    const tmdbPath = parsed.pathname.slice('/media/tmdb/'.length);
    const backup = new URL(`/api/tmdb/${tmdbPath}`, getApiOrigin());
    parsed.searchParams.forEach((value, key) => {
      if (String(key || '').toLowerCase() === 'api_key') return;
      backup.searchParams.append(key, value);
    });
    return backup.toString();
  } catch {
    return '';
  }
}

function getStorageApiBackupPostUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim(), window.location.href);
    if (parsed.origin !== 'https://storage-api.watchbilm.org') return '';
    if (parsed.pathname !== '/media/anilist') return '';
    return 'https://graphql.anilist.co';
  } catch {
    return '';
  }
}

function getRetryBackoffMs(response, attempt) {
  const retryAfterHeader = response?.headers?.get('Retry-After');
  const retryAfterSeconds = Number.parseFloat(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(5000, retryAfterSeconds * 1000);
  }
  const exponentialBase = 420 * (2 ** attempt);
  return Math.min(5000, exponentialBase);
}

async function fetchJSON(url, options = {}) {
  const signal = getRequestSignal(options.signal);
  const maxRetries = options.maxRetries ?? API_MAX_RETRIES;
  const cacheKey = `${url}::${signal === pageRequestController.signal ? 'page' : 'custom'}`;
  if (inFlightGetRequests.has(cacheKey)) {
    return inFlightGetRequests.get(cacheKey);
  }

  const request = (async () => {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const queueWaitMs = attempt === 0 ? await waitForApiCooldown(url, signal) : 0;
        const startedAt = performance.now();
        const res = await fetch(url, { signal });
        debugApiTiming('fetch', {
          url,
          method: 'GET',
          attempt,
          queueWaitMs,
          fetchDurationMs: Math.round(performance.now() - startedAt),
          status: res.status
        });
        if (res.ok) {
          return await res.json();
        }

        if (res.status === 429 || res.status >= 500) {
          const backoffMs = getRetryBackoffMs(res, attempt);
          if (attempt < maxRetries) {
            debugApiTiming('retry-backoff', { url, method: 'GET', attempt, backoffMs });
            await sleep(backoffMs);
            continue;
          }
        }

        throw new Error(`HTTP ${res.status}`);
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return null;
        if (attempt >= maxRetries) break;
      }
    }

    return null;
  })();

  inFlightGetRequests.set(cacheKey, request);
  request.finally(() => {
    inFlightGetRequests.delete(cacheKey);
  });

  return request;
}

async function postJSON(url, body, options = {}) {
  const signal = getRequestSignal(options.signal);
  const maxRetries = options.maxRetries ?? API_MAX_RETRIES;
  const cacheKey = `${url}:${JSON.stringify(body)}::${signal === pageRequestController.signal ? 'page' : 'custom'}`;
  if (inFlightPostRequests.has(cacheKey)) {
    return inFlightPostRequests.get(cacheKey);
  }

  const request = (async () => {
    const isAniList = /graphql\.anilist\.co/i.test(url);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const queueWaitMs = attempt === 0 ? await waitForApiCooldown(url, signal) : 0;
        const startedAt = performance.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: isAniList
            ? { 'Content-Type': 'text/plain;charset=UTF-8' }
            : { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          signal
        });
        debugApiTiming('fetch', {
          url,
          method: 'POST',
          attempt,
          queueWaitMs,
          fetchDurationMs: Math.round(performance.now() - startedAt),
          status: res.status
        });
        if (res.ok) {
          return await res.json();
        }

        if (res.status === 429 || res.status >= 500) {
          const backoffMs = getRetryBackoffMs(res, attempt);
          if (attempt < maxRetries) {
            debugApiTiming('retry-backoff', { url, method: 'POST', attempt, backoffMs });
            await sleep(backoffMs);
            continue;
          }
        }

        throw new Error(`HTTP ${res.status}`);
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return null;
        if (attempt >= maxRetries) break;
      }
    }

    const backupUrl = getStorageApiBackupPostUrl(url);
    if (!backupUrl || backupUrl === url) return null;
    try {
      await waitForApiCooldown(backupUrl, signal);
      const fallbackResponse = await fetch(backupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
        signal
      });
      if (!fallbackResponse.ok) return null;
      return await fallbackResponse.json();
    } catch {
      return null;
    }

    return null;
  })();

  inFlightPostRequests.set(cacheKey, request);
  request.finally(() => {
    inFlightPostRequests.delete(cacheKey);
  });

  return request;
}

function getApiHost(url) {
  try {
    return new URL(url, window.location.origin).host || 'default';
  } catch {
    return 'default';
  }
}

async function waitForApiCooldown(url, signal) {
  if (signal?.aborted) return 0;
  const host = getApiHost(url);
  const previousRequest = apiRequestQueueByHost.get(host) || Promise.resolve();

  const requestTurn = previousRequest
    .catch(() => {})
    .then(async () => {
      const now = Date.now();
      const nextAllowedAt = apiCooldownByHost.get(host) || 0;
      const waitMs = nextAllowedAt - now;
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      apiCooldownByHost.set(host, Date.now() + API_COOLDOWN_MS);
      return Math.max(waitMs, 0);
    });

  apiRequestQueueByHost.set(host, requestTurn);
  return requestTurn;
}

async function fetchGenres() {
  const url = `https://storage-api.watchbilm.org/media/tmdb/genre/tv/list?language=en-US`;
  const data = await fetchJSON(url, { maxRetries: SECTION_API_MAX_RETRIES });
  allGenres = data?.genres || [];
  genreNameById.clear();
  allGenres.forEach((genre) => {
    const id = Number(genre?.id);
    const name = String(genre?.name || '').trim();
    if (Number.isFinite(id) && name) {
      genreNameById.set(id, name);
    }
  });
  return allGenres;
}

async function fetchVidsrcTvPage(page = 1) {
  const numericPage = Math.max(1, Number.parseInt(page, 10) || 1);
  if (vidsrcTvPageCache.has(numericPage)) {
    return vidsrcTvPageCache.get(numericPage);
  }

  const url = new URL(VIDSRC_TVSHOWS_LATEST_API, getApiOrigin());
  url.searchParams.set('page', String(numericPage));
  const data = await fetchJSON(url.toString(), { maxRetries: SECTION_API_MAX_RETRIES });
  const results = Array.isArray(data?.result) ? data.result : [];
  vidsrcTvPageCache.set(numericPage, results);
  return results;
}

async function fetchTmdbTvDetailsForFallback(tmdbId) {
  const numericId = Number.parseInt(String(tmdbId || '').trim(), 10);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;
  if (vidsrcTvDetailsCache.has(numericId)) {
    return vidsrcTvDetailsCache.get(numericId);
  }

  const request = (async () => {
    const url = `https://storage-api.watchbilm.org/media/tmdb/tv/${numericId}`;
    const details = await fetchJSON(url, { maxRetries: SECTION_API_MAX_RETRIES });
    if (!details || !Number.isFinite(Number(details?.id))) return null;
    return details;
  })().catch(() => null);

  vidsrcTvDetailsCache.set(numericId, request);
  return request;
}

function toTvFallbackResult(entry, details) {
  const rawTitle = String(details?.name || entry?.title || '').trim();
  if (!rawTitle) return null;

  const posterPath = String(details?.poster_path || details?.backdrop_path || '').trim();
  if (!posterPath) return null;

  const yearMatch = rawTitle.match(/\b(19|20)\d{2}\b/g);
  const inferredYear = Array.isArray(yearMatch) && yearMatch.length ? yearMatch[yearMatch.length - 1] : '';
  const cleanedTitle = rawTitle.replace(/\s+(19|20)\d{2}\s*$/, '').trim() || rawTitle;
  const showId = Number(details?.id || entry?.tmdb_id);
  if (!Number.isFinite(showId)) return null;

  const genreIds = Array.isArray(details?.genres)
    ? details.genres.map((genre) => Number(genre?.id)).filter((genreId) => Number.isFinite(genreId))
    : [];

  return {
    id: showId,
    name: cleanedTitle,
    poster_path: posterPath,
    first_air_date: details?.first_air_date || (inferredYear ? `${inferredYear}-01-01` : ''),
    vote_average: Number.isFinite(Number(details?.vote_average)) ? Number(details.vote_average) : null,
    genre_ids: genreIds,
    __fallbackSource: 'vidsrc'
  };
}

async function fetchShowsFromVidsrcFallback(page = 1, sectionSeed = '') {
  const fallbackEntries = await fetchVidsrcTvPage(page);
  if (!fallbackEntries.length) return [];

  const rotated = rotateBySeed(fallbackEntries, sectionSeed);
  const mapped = [];
  for (const entry of rotated) {
    const details = await fetchTmdbTvDetailsForFallback(entry?.tmdb_id);
    const normalized = toTvFallbackResult(entry, details);
    if (!normalized) continue;
    mapped.push(normalized);
    if (mapped.length >= TMDB_PAGE_FETCH_SIZE) break;
  }
  return mapped;
}

function getSections() {
  const staticSections = [
    { title: 'Trending', endpoint: '/trending/tv/week' },
    { title: 'Popular', endpoint: '/tv/popular' },
    { title: 'Top Rated', endpoint: '/tv/top_rated' },
    { title: 'Airing Today', endpoint: '/tv/airing_today' }
  ];

  const genreSections = allGenres.map((genre) => ({
    title: genre.name,
    endpoint: `/discover/tv?with_genres=${genre.id}`,
    genreSlug: toSlug(genre.name)
  }));

  return [...staticSections, ...genreSections].map((section) => ({
    ...section,
    slug: slugifySectionTitle(section.title),
    categoryUrl: section.genreSlug
      ? buildCategoryUrl({ mode: 'regular', genre: section.genreSlug, title: section.title })
      : buildCategoryUrl({ mode: 'regular', section: slugifySectionTitle(section.title), title: section.title })
  }));
}

function getAnimeTvSections() {
  return ANIME_TV_GENRES.map((genre) => ({
    title: genre,
    genre,
    slug: `anime-${slugifySectionTitle(genre)}`,
    genreSlug: toSlug(genre),
    categoryUrl: buildCategoryUrl({
      mode: 'anime',
      genre: toSlug(genre),
      title: `${genre} Anime TV`
    })
  }));
}

async function fetchShows(endpoint, page = 1, sectionSeed = '') {
  const url = endpoint.includes('?')
    ? `https://storage-api.watchbilm.org/media/tmdb${endpoint}&page=${page}`
    : `https://storage-api.watchbilm.org/media/tmdb${endpoint}?page=${page}`;
  const data = await fetchJSON(url, { maxRetries: SECTION_API_MAX_RETRIES });
  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length) return results;
  return fetchShowsFromVidsrcFallback(page, sectionSeed);
}

async function fetchAnimeShowsByGenre(genre, page = 1) {
  const query = `
    query ($page: Int!, $perPage: Int!, $genre: String!) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, format_in: [TV, TV_SHORT], genre_in: [$genre], sort: [POPULARITY_DESC, SCORE_DESC]) {
          id
          title {
            romaji
            english
          }
          genres
          averageScore
          coverImage {
            large
            medium
          }
          startDate {
            year
          }
        }
      }
    }
  `;

  let data = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    data = await postJSON(ANILIST_GRAPHQL_URL, {
      query,
      variables: { page, perPage: ANIME_PAGE_FETCH_SIZE, genre }
    }, { maxRetries: SECTION_API_MAX_RETRIES });
    if (data?.data?.Page?.media?.length) break;
    if (attempt < 2) {
      await sleep(200 * (attempt + 1));
    }
  }

  return data?.data?.Page?.media || [];
}

function createShowCard(show, dataset = {}) {
  return window.BilmMediaCard.createMediaCard({
    item: show,
    className: 'movie-card',
    badgeClassName: 'source-badge-overlay',
    dataset: {
      tmdbId: show.tmdbId,
      year: show.year,
      rating: show.rating,
      ...dataset
    }
  });
}

function createSectionSkeleton(section, container, prefix = '') {
  const sectionEl = document.createElement('section');
  sectionEl.className = 'section';
  sectionEl.id = `${prefix}section-${section.slug}`;

  const headerEl = document.createElement('div');
  headerEl.className = 'section-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'section-title';
  titleEl.textContent = section.title;

  headerEl.appendChild(titleEl);

  if (section.categoryUrl) {
    const viewMoreLink = document.createElement('a');
    viewMoreLink.className = 'view-more-button';
    viewMoreLink.href = section.categoryUrl;
    viewMoreLink.textContent = 'View more';
    viewMoreLink.setAttribute('aria-label', `View more ${section.title} TV shows`);
    headerEl.appendChild(viewMoreLink);
  }

  const rowEl = document.createElement('div');
  rowEl.className = 'scroll-row';
  rowEl.id = `${prefix}row-${section.slug}`;
  rowEl.tabIndex = 0;
  enableHorizontalWheelScroll(rowEl);

  const statusEl = document.createElement('p');
  statusEl.className = 'section-status';
  statusEl.setAttribute('aria-live', 'polite');

  sectionEl.appendChild(headerEl);
  sectionEl.appendChild(rowEl);
  sectionEl.appendChild(statusEl);
  container.appendChild(sectionEl);
}

function renderQuickFilters(sections, containerId = 'quickFilters') {
  const filtersContainer = document.getElementById(containerId);
  if (!filtersContainer) return;

  filtersContainer.innerHTML = '';
  filtersContainer.scrollLeft = 0;
  filtersContainer.tabIndex = 0;
  enableHorizontalWheelScroll(filtersContainer);
  sections.forEach((section) => {
    if (!section.categoryUrl) return;
    const chip = document.createElement('a');
    chip.className = 'filter-chip';
    chip.href = section.categoryUrl;
    chip.textContent = section.title;
    filtersContainer.appendChild(chip);
  });
}

async function fillRegularShowBuffer(section, state) {
  let fetchPasses = 0;
  while (!pageRequestController.signal.aborted && !state.exhausted && state.bufferQueue.length === 0 && fetchPasses < 8) {
    fetchPasses += 1;
    const page = state.nextPage;
    state.nextPage += 1;
    const shows = await fetchShows(section.endpoint, page, section.slug);
    if (!shows.length) {
      state.exhausted = true;
      break;
    }
    shows.forEach((show) => {
      const showId = Number(show?.id || show?.tmdb_id || 0) || 0;
      if (!showId || state.seenIds.has(showId)) return;
      state.seenIds.add(showId);
      state.bufferQueue.push(show);
    });
  }
  return state.bufferQueue.length > 0;
}

async function fillAnimeShowBuffer(section, state) {
  let fetchPasses = 0;
  while (!pageRequestController.signal.aborted && !state.exhausted && state.bufferQueue.length === 0 && fetchPasses < 8) {
    fetchPasses += 1;
    const page = state.nextPage;
    state.nextPage += 1;
    const animeShows = await fetchAnimeShowsByGenre(section.genre, page);
    if (!animeShows.length) {
      state.exhausted = true;
      break;
    }
    animeShows.forEach((animeShow) => {
      const animeId = Number(animeShow?.id || 0) || 0;
      if (!animeId || state.seenIds.has(animeId)) return;
      state.seenIds.add(animeId);
      state.bufferQueue.push(animeShow);
    });
  }
  return state.bufferQueue.length > 0;
}

async function loadShowsForSection(section, options = {}) {
  if (pageRequestController.signal.aborted) return false;
  const rowEl = document.getElementById(`row-${section.slug}`);
  const statusEl = rowEl?.closest('.section')?.querySelector('.section-status');
  if (!rowEl || pageRequestController.signal.aborted) return false;

  const state = getOrCreateSectionState(regularSectionState, section.slug);
  if (state.loadingPromise) {
    return state.loadingPromise;
  }
  const targetCount = Math.max(1, Number.parseInt(options?.targetCount, 10) || ROW_APPEND_COUNT);
  state.loadingPromise = (async () => {
    let appendedCount = 0;

    while (!pageRequestController.signal.aborted && appendedCount < targetCount) {
      if (!state.bufferQueue.length) {
        const hasBufferedItems = await fillRegularShowBuffer(section, state);
        if (!hasBufferedItems) break;
      }
      const show = state.bufferQueue.shift();
      if (!show) break;

      const showId = Number(show?.id || show?.tmdb_id || 0) || 0;
      if (!showId) continue;

      const poster = show.poster_path
        ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
        : 'https://via.placeholder.com/140x210?text=No+Image';
      const genreTokens = (show.genre_ids || [])
        .map((genreId) => genreNameById.get(Number(genreId)))
        .filter(Boolean)
        .map((genreName) => normalizeFilterToken(genreName));

      const showData = {
        tmdbId: showId,
        title: show.name,
        type: 'tv',
        year: show.first_air_date?.slice(0, 4) || 'N/A',
        img: poster,
        link: `./show.html?id=${showId}`,
        source: show.__fallbackSource === 'vidsrc' ? 'VidSrc' : 'TMDB',
        rating: Number.isFinite(Number(show.vote_average)) ? Number(show.vote_average) : null
      };

      const card = createShowCard(showData, {
        genres: genreTokens.join('|'),
        ageRating: ''
      });
      rowEl.appendChild(card);
      appendedCount += 1;
    }

    if (statusEl) {
      if (appendedCount > 0) {
        statusEl.textContent = '';
      } else if (!rowEl.querySelector('.movie-card')) {
        statusEl.textContent = 'Could not load titles right now. Please refresh in a moment.';
      } else if (state.exhausted) {
        statusEl.textContent = 'No new titles available right now.';
      }
    }

    return appendedCount > 0;
  })();

  try {
    return await state.loadingPromise;
  } finally {
    state.loadingPromise = null;
  }
}

async function loadAnimeShowsForSection(section, options = {}) {
  if (pageRequestController.signal.aborted) return false;
  const rowEl = document.getElementById(`anime-row-${section.slug}`);
  if (!rowEl) return false;
  const statusEl = rowEl.closest('.section')?.querySelector('.section-status');
  const state = getOrCreateSectionState(animeSectionState, section.slug);
  if (state.loadingPromise) {
    return state.loadingPromise;
  }
  const targetCount = Math.max(1, Number.parseInt(options?.targetCount, 10) || ROW_APPEND_COUNT);
  state.loadingPromise = (async () => {
    let appendedCount = 0;

    while (!pageRequestController.signal.aborted && appendedCount < targetCount) {
      if (!state.bufferQueue.length) {
        const hasBufferedItems = await fillAnimeShowBuffer(section, state);
        if (!hasBufferedItems) break;
      }
      const animeShow = state.bufferQueue.shift();
      if (!animeShow) break;
      const animeId = Number(animeShow?.id || 0) || 0;
      if (!animeId) continue;
      const animeGenreTokens = (Array.isArray(animeShow.genres) && animeShow.genres.length
        ? animeShow.genres
        : [section.genre])
        .map((genreName) => normalizeFilterToken(genreName));

      const showData = {
        tmdbId: animeId,
        title: animeShow.title?.english || animeShow.title?.romaji || 'Untitled',
        type: 'tv',
        year: animeShow.startDate?.year || 'N/A',
        img: animeShow.coverImage?.large || animeShow.coverImage?.medium,
        link: `${BASE_URL}/tv/show.html?anime=1&aid=${animeId}&type=tv`,
        source: 'AniList',
        rating: Number.isFinite(Number(animeShow.averageScore)) ? Number(animeShow.averageScore) / 10 : null
      };

      const card = createShowCard(showData, {
        genres: animeGenreTokens.join('|'),
        ageRating: 'N/A'
      });
      rowEl.appendChild(card);
      appendedCount += 1;
    }

    if (statusEl) {
      if (appendedCount > 0) {
        statusEl.textContent = '';
      } else if (!rowEl.querySelector('.movie-card')) {
        statusEl.textContent = 'Could not load anime titles right now. Please try again.';
      } else if (state.exhausted) {
        statusEl.textContent = 'No new titles available right now.';
      }
    }

    return appendedCount > 0;
  })();

  try {
    return await state.loadingPromise;
  } finally {
    state.loadingPromise = null;
  }
}


async function runSectionScheduler(prioritySections, deferredSections, loaderFn, rowPrefix = '') {
  const schedule = [...prioritySections, ...deferredSections];
  for (const [index, section] of schedule.entries()) {
    if (pageRequestController.signal.aborted) break;
    const rowEl = document.getElementById(`${rowPrefix}row-${section.slug}`);
    const initialTarget = getAdaptiveInitialCount(rowEl);
    await loaderFn(section, { targetCount: initialTarget, reason: 'initial-load' });
    if (index < schedule.length - 1) {
      // Intentional UX pacing: start one section roughly every 100ms.
      await sleep(SECTION_LOAD_INTERVAL_MS);
    }
  }
}

function setupInfiniteScroll(section, loaderFn, rowPrefix = '') {
  const rowEl = document.getElementById(`${rowPrefix}row-${section.slug}`);
  if (!rowEl) return;

  let loading = false;
  rowEl.addEventListener('scroll', async () => {
    if (loading) return;
    const preloadDistance = getRowPreloadDistance(rowEl);
    if (rowEl.scrollLeft + rowEl.clientWidth >= rowEl.scrollWidth - preloadDistance) {
      loading = true;
      await loaderFn(section, { targetCount: ROW_APPEND_COUNT, reason: 'scroll-append' });
      loading = false;
    }
  }, { passive: true });
}

function topUpSectionRowsToViewport(sections, loaderFn, rowPrefix = '') {
  if (!Array.isArray(sections) || typeof loaderFn !== 'function') return;
  sections.forEach((section) => {
    const rowEl = document.getElementById(`${rowPrefix}row-${section.slug}`);
    if (!isRowVisibleForAdaptiveTopUp(rowEl)) return;
    const desiredCount = getAdaptiveInitialCount(rowEl);
    const renderedCount = rowEl.querySelectorAll('.movie-card').length;
    if (renderedCount >= desiredCount) return;
    const missingCount = desiredCount - renderedCount;
    loaderFn(section, { targetCount: missingCount, reason: 'viewport-top-up' }).catch((error) => {
      console.warn(`Viewport top-up failed for section "${section.slug}":`, error);
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('tvSections');
  const animeContainer = document.getElementById('animeSections');
  if (!container || !animeContainer) {
    console.error('Missing TV section container(s) in HTML');
    return;
  }
  initializeFiltersUi();
  let regularSectionsForResize = [];
  let animeSectionsForResize = [];
  let resizeTopUpTimer = null;

  const queueViewportTopUp = () => {
    if (resizeTopUpTimer) {
      window.clearTimeout(resizeTopUpTimer);
      resizeTopUpTimer = null;
    }
    resizeTopUpTimer = window.setTimeout(() => {
      resizeTopUpTimer = null;
      topUpSectionRowsToViewport(regularSectionsForResize, loadShowsForSection, '');
      topUpSectionRowsToViewport(animeSectionsForResize, loadAnimeShowsForSection, 'anime-');
    }, 150);
  };

  const ensureAnimeSectionsLoaded = async () => {
    if (animeSectionsBootstrapped || animeSectionsLoadPromise) return animeSectionsLoadPromise;

    animeSectionsLoadPromise = (async () => {
      const animeSections = getAnimeTvSections();
      animeSectionsForResize = animeSections;
      renderQuickFilters(animeSections, 'animeQuickFilters');
      animeSections.forEach((section) => createSectionSkeleton(section, animeContainer, 'anime-'));

      const priorityAnimeSections = animeSections.slice(0, PRIORITY_SECTION_COUNT);
      const deferredAnimeSections = animeSections.slice(PRIORITY_SECTION_COUNT);
      await runSectionScheduler(priorityAnimeSections, deferredAnimeSections, loadAnimeShowsForSection, 'anime-');
      animeSections.forEach((section) => setupInfiniteScroll(section, loadAnimeShowsForSection, 'anime-'));
      queueViewportTopUp();
      animeSectionsBootstrapped = true;
    })().finally(() => {
      animeSectionsLoadPromise = null;
    });

    return animeSectionsLoadPromise;
  };

  bindModeToggleButtons(ensureAnimeSectionsLoaded);
  setContentMode('regular');

  genresReadyPromise = fetchGenres();
  await genresReadyPromise;
  if (pageRequestController.signal.aborted) return;
  const sections = getSections();
  regularSectionsForResize = sections;

  renderQuickFilters(sections, 'quickFilters');
  sections.forEach((section) => createSectionSkeleton(section, container));

  const prioritySections = sections.slice(0, PRIORITY_SECTION_COUNT);
  const deferredSections = sections.slice(PRIORITY_SECTION_COUNT);
  await runSectionScheduler(prioritySections, deferredSections, loadShowsForSection, '');

  sections.forEach((section) => setupInfiniteScroll(section, loadShowsForSection));
  queueViewportTopUp();
  window.addEventListener('resize', queueViewportTopUp, { passive: true });
  window.addEventListener('orientationchange', queueViewportTopUp);
  refreshFilterUiForCurrentMode();
});


window.addEventListener('beforeunload', () => {
  pageRequestController.abort();
});
