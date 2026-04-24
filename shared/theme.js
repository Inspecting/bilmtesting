(() => {
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
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${detectBasePath()}${normalized}`;
}

  const GA_MEASUREMENT_ID = 'G-KJSZFZNESQ';

  const initAnalytics = () => {
    if (!GA_MEASUREMENT_ID || window.__bilmAnalyticsLoaded) return;
    window.__bilmAnalyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  };

  initAnalytics();

  const STORAGE_KEY = 'bilm-theme-settings';
  const INCOGNITO_BACKUP_KEY = 'bilm-incognito-backup';
  const INCOGNITO_STORAGE_KEYS = [
    'bilm-search-history',
    'bilm-watch-history',
    'bilm-continue-watching',
    'bilm-favorites',
    'bilm-watch-later'
  ];
  const INCOGNITO_PREFIXES = ['bilm-tv-progress-'];
  const DEFAULT_SETTINGS = {
    accent: '#34d0ff',
    background: 'deep',
    customBackground: '#050b13',
    motion: true,
    particles: true,
    loading: true,
    defaultServer: 'embedmaster',
    animeDefaultServer: 'vidnest',
    searchHistory: true,
    continueWatching: true,
    incognito: false
  };

  const backgroundColors = {
    deep: '#050b13',
    midnight: '#020710',
    velvet: '#140918',
    aurora: '#052329',
    slate: '#111827',
    sunset: '#151826'
  };

  const hexToRgb = (hex) => {
    if (!hex) return null;
    const clean = hex.replace('#', '').trim();
    if (clean.length !== 6) return null;
    const num = parseInt(clean, 16);
    if (Number.isNaN(num)) return null;
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  };

  const applyAccent = (root, accent) => {
    const safeAccent = accent || DEFAULT_SETTINGS.accent;
    root.style.setProperty('--accent', safeAccent);
    const rgb = hexToRgb(safeAccent);
    if (rgb) {
      root.style.setProperty('--accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
      root.style.setProperty('--accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`);
      root.style.setProperty('--accent-strong', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75)`);
    }
  };

  const applyButtonAccent = (root, accent) => {
    const safeButtonAccent = accent || DEFAULT_SETTINGS.accent;
    root.style.setProperty('--button-accent', safeButtonAccent);
  };

  const GLOBAL_PARTICLE_CANVAS_ID = 'bilmGlobalParticlesCanvas';
  const globalParticlesState = {
    initialized: false,
    canvas: null,
    ctx: null,
    dots: [],
    animationId: null,
    particlesEnabled: true,
    motionEnabled: true
  };

  const hasLocalParticleCanvas = () => Boolean(document.getElementById('bgCanvas'));

  const getAdaptiveDotCount = () => {
    const area = Math.max(1, (window.innerWidth || 0) * (window.innerHeight || 0));
    return Math.max(36, Math.min(120, Math.round(area / 26000)));
  };

  const getParticleAccentColor = () => {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || DEFAULT_SETTINGS.accent;
    } catch {
      return DEFAULT_SETTINGS.accent;
    }
  };

  const ensureGlobalParticleCanvas = () => {
    if (hasLocalParticleCanvas()) {
      if (globalParticlesState.canvas) {
        try {
          globalParticlesState.canvas.remove();
        } catch {
          // Ignore remove failures.
        }
      }
      globalParticlesState.canvas = null;
      globalParticlesState.ctx = null;
      return null;
    }

    if (globalParticlesState.canvas?.isConnected) return globalParticlesState.canvas;

    let canvas = document.getElementById(GLOBAL_PARTICLE_CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = GLOBAL_PARTICLE_CANVAS_ID;
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
    }
    globalParticlesState.canvas = canvas;
    globalParticlesState.ctx = canvas.getContext('2d');
    return canvas;
  };

  const resizeGlobalParticles = ({ reseed = true } = {}) => {
    const canvas = globalParticlesState.canvas;
    if (!canvas) return;
    canvas.width = window.innerWidth || 0;
    canvas.height = window.innerHeight || 0;
    if (!reseed && globalParticlesState.dots.length > 0) return;

    const count = getAdaptiveDotCount();
    globalParticlesState.dots = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (Math.random() * 2) + 1,
      dx: (Math.random() - 0.5) * 0.7,
      dy: (Math.random() - 0.5) * 0.7
    }));
  };

  const renderGlobalParticlesFrame = (shouldMove = true) => {
    const canvas = globalParticlesState.canvas;
    const ctx = globalParticlesState.ctx;
    if (!canvas || !ctx) return;

    const accent = getParticleAccentColor();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.9;

    globalParticlesState.dots.forEach((dot) => {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fill();

      if (!shouldMove) return;
      dot.x += dot.dx;
      dot.y += dot.dy;
      if (dot.x < 0 || dot.x > canvas.width) dot.dx *= -1;
      if (dot.y < 0 || dot.y > canvas.height) dot.dy *= -1;
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  };

  const stopGlobalParticles = () => {
    if (!globalParticlesState.animationId) return;
    cancelAnimationFrame(globalParticlesState.animationId);
    globalParticlesState.animationId = null;
  };

  const animateGlobalParticles = () => {
    stopGlobalParticles();
    const step = () => {
      renderGlobalParticlesFrame(true);
      globalParticlesState.animationId = requestAnimationFrame(step);
    };
    step();
  };

  const applyGlobalParticles = (settings = null) => {
    const effectiveSettings = settings || loadSettings();
    const particlesEnabled = effectiveSettings?.particles !== false;
    const motionEnabled = effectiveSettings?.motion !== false;

    globalParticlesState.particlesEnabled = particlesEnabled;
    globalParticlesState.motionEnabled = motionEnabled;

    const canvas = ensureGlobalParticleCanvas();
    if (!canvas || !globalParticlesState.ctx) {
      stopGlobalParticles();
      return;
    }

    stopGlobalParticles();
    if (!particlesEnabled) {
      canvas.style.display = 'none';
      globalParticlesState.ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    canvas.style.display = 'block';
    resizeGlobalParticles({ reseed: globalParticlesState.dots.length === 0 });

    if (motionEnabled) {
      animateGlobalParticles();
      return;
    }
    renderGlobalParticlesFrame(false);
  };

  const initGlobalParticles = () => {
    if (globalParticlesState.initialized) return;
    globalParticlesState.initialized = true;
    applyGlobalParticles(loadSettings());

    window.addEventListener('resize', () => {
      if (!globalParticlesState.particlesEnabled) return;
      resizeGlobalParticles({ reseed: true });
      if (!globalParticlesState.motionEnabled) {
        renderGlobalParticlesFrame(false);
      }
    }, { passive: true });

    window.addEventListener('orientationchange', () => {
      if (!globalParticlesState.particlesEnabled) return;
      resizeGlobalParticles({ reseed: true });
      if (!globalParticlesState.motionEnabled) {
        renderGlobalParticlesFrame(false);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        stopGlobalParticles();
        return;
      }
      applyGlobalParticles(loadSettings());
    });

    window.addEventListener('bilm:theme-changed', (event) => {
      applyGlobalParticles(event.detail);
    });
  };

  const applyTheme = (settings) => {
    const root = document.documentElement;
    applyAccent(root, settings.accent);
    applyButtonAccent(root, settings.accent);
    root.dataset.background = settings.background || DEFAULT_SETTINGS.background;
    root.dataset.motion = settings.motion === false ? 'off' : 'on';

    if (root.dataset.background === 'custom') {
      root.style.setProperty('--bg-custom', settings.customBackground || DEFAULT_SETTINGS.customBackground);
    }

    const themeColor = root.dataset.background === 'custom'
      ? (settings.customBackground || DEFAULT_SETTINGS.customBackground)
      : (backgroundColors[root.dataset.background] || backgroundColors.deep);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', themeColor);
    }

    window.dispatchEvent(new CustomEvent('bilm:theme-changed', { detail: settings }));
  };

  const loadSettings = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  };

  const safeParse = (value, fallback) => {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const isIncognitoKey = (key) => {
    if (!key) return false;
    if (INCOGNITO_STORAGE_KEYS.includes(key)) return true;
    return INCOGNITO_PREFIXES.some(prefix => key.startsWith(prefix));
  };

  const collectIncognitoKeys = () => {
    const keys = new Set(INCOGNITO_STORAGE_KEYS);
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (isIncognitoKey(key)) {
          keys.add(key);
        }
      }
    } catch {
      return [...keys];
    }
    return [...keys];
  };

  const runWithMutationSuppression = (task) => {
    const guard = window.bilmAuth?.withMutationSuppressed;
    if (typeof guard === 'function') {
      return guard(task);
    }
    return task();
  };

  const handleIncognitoTransition = (prevSettings, nextSettings) => {
    const wasIncognito = prevSettings?.incognito === true;
    const isIncognito = nextSettings?.incognito === true;
    if (wasIncognito === isIncognito) return;
    runWithMutationSuppression(() => {
      if (isIncognito) {
        let backup = null;
        try {
          backup = localStorage.getItem(INCOGNITO_BACKUP_KEY);
        } catch {
          backup = null;
        }
        if (!backup) {
          const snapshot = {};
          const keysToBackup = collectIncognitoKeys();
          keysToBackup.forEach((key) => {
            try {
              const value = localStorage.getItem(key);
              if (value !== null) snapshot[key] = value;
            } catch {
              return;
            }
          });
          try {
            localStorage.setItem(INCOGNITO_BACKUP_KEY, JSON.stringify(snapshot));
          } catch {
            return;
          }
        }
        const keysToClear = collectIncognitoKeys();
        keysToClear.forEach((key) => {
          try {
            localStorage.removeItem(key);
          } catch {
            return;
          }
        });
      } else {
        let backup = {};
        try {
          backup = safeParse(localStorage.getItem(INCOGNITO_BACKUP_KEY), {});
        } catch {
          backup = {};
        }
        const keysToRestore = collectIncognitoKeys();
        keysToRestore.forEach((key) => {
          try {
            if (Object.prototype.hasOwnProperty.call(backup, key)) {
              localStorage.setItem(key, backup[key]);
            } else {
              localStorage.removeItem(key);
            }
          } catch {
            return;
          }
        });
        try {
          localStorage.removeItem(INCOGNITO_BACKUP_KEY);
        } catch {
          return;
        }
        keysToRestore.forEach((key) => {
          try {
            sessionStorage.removeItem(key);
          } catch {
            return;
          }
        });
      }
    });
  };

  let currentSettings = loadSettings();

  const getStorageForKey = (key) => {
    if (currentSettings?.incognito === true && isIncognitoKey(key)) {
      return sessionStorage;
    }
    return localStorage;
  };

  const storageAPI = {
    getItem(key) {
      try {
        return getStorageForKey(key).getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        getStorageForKey(key).setItem(key, value);
      } catch {
        return;
      }
    },
    removeItem(key) {
      try {
        getStorageForKey(key).removeItem(key);
      } catch {
        return;
      }
    },
    getJSON(key, fallback = null) {
      const raw = storageAPI.getItem(key);
      return safeParse(raw, fallback);
    },
    setJSON(key, value) {
      storageAPI.setItem(key, JSON.stringify(value));
    }
  };

  const saveSettings = (settings) => {
    const next = { ...DEFAULT_SETTINGS, ...settings };
    handleIncognitoTransition(currentSettings, next);
    currentSettings = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      return;
    }
    applyTheme(next);
  };

  const resetTheme = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      return;
    }
    applyTheme({ ...DEFAULT_SETTINGS });
  };

  currentSettings = loadSettings();
  applyTheme(currentSettings);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobalParticles, { once: true });
  } else {
    initGlobalParticles();
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = loadSettings();
    handleIncognitoTransition(currentSettings, next);
    currentSettings = next;
    applyTheme(next);
  });

  window.bilmTheme = {
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    getSettings: loadSettings,
    setSettings: saveSettings,
    resetTheme,
    applyTheme,
    storage: storageAPI
  };
})();
