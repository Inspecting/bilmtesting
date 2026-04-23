import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const rootDir = path.resolve(process.cwd());
const port = Number(process.env.PORT || 8080);
const STATIC_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400';
const DEFAULT_ADMIN_EMAILS = Object.freeze(['watchbilm@gmail.com']);
const DEFAULT_HEALTH_CHECK_ALLOWED_HOSTS = new Set([
  'storage-api.watchbilm.org',
  'data-api.watchbilm.org',
  'chat-api.watchbilm.org',
  'graphql.anilist.co',
  'api.themoviedb.org',
  'www.omdbapi.com',
  'api.tvmaze.com'
]);

function resolveHealthCheckAllowedHosts() {
  const envValue = String(process.env.HEALTH_CHECK_ALLOWED_HOSTS || '').trim();
  const hosts = new Set([...DEFAULT_HEALTH_CHECK_ALLOWED_HOSTS]);
  const supabaseProjectUrl = String(process.env.SUPABASE_PROJECT_URL || '').trim();
  if (supabaseProjectUrl) {
    try {
      const parsedSupabase = new URL(supabaseProjectUrl);
      const supabaseHost = String(parsedSupabase.hostname || '').trim().toLowerCase();
      if (supabaseHost) hosts.add(supabaseHost);
    } catch {}
  }
  if (!envValue) return hosts;
  envValue
    .split(',')
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean)
    .forEach((entry) => hosts.add(entry));
  return hosts;
}

function parseEnvInt(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const rawValue = Number(process.env[name]);
  if (!Number.isFinite(rawValue)) return fallback;
  const normalized = Math.floor(rawValue);
  if (normalized < min || normalized > max) return fallback;
  return normalized;
}

function parseEnvBool(name, fallback = false) {
  const rawValue = String(process.env[name] || '').trim().toLowerCase();
  if (!rawValue) return fallback;
  if (rawValue === '1' || rawValue === 'true' || rawValue === 'yes' || rawValue === 'on') return true;
  if (rawValue === '0' || rawValue === 'false' || rawValue === 'no' || rawValue === 'off') return false;
  return fallback;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveAdminEmailAllowlist() {
  const fromEnv = String(process.env.BILM_ADMIN_EMAILS || '').trim();
  const emails = new Set();
  [...DEFAULT_ADMIN_EMAILS, ...fromEnv.split(',')]
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => Boolean(entry) && isValidEmail(entry))
    .forEach((entry) => emails.add(entry));
  return [...emails];
}

function resolveChatApiBase() {
  const rawValue = String(process.env.CHAT_API_BASE || 'https://chat-api.watchbilm.org').trim();
  if (!rawValue) return 'https://chat-api.watchbilm.org';
  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return 'https://chat-api.watchbilm.org';
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return 'https://chat-api.watchbilm.org';
  }
}

function resolveDataApiBase() {
  const rawValue = String(process.env.DATA_API_BASE || 'https://data-api.watchbilm.org').trim();
  if (!rawValue) return 'https://data-api.watchbilm.org';
  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return 'https://data-api.watchbilm.org';
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return 'https://data-api.watchbilm.org';
  }
}

function resolveSupabaseProjectUrl() {
  const rawValue = String(process.env.SUPABASE_PROJECT_URL || '').trim();
  if (!rawValue) return '';
  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function resolveSupabaseMirrorTable() {
  const rawValue = String(process.env.SUPABASE_MIRROR_TABLE || 'cloudflare_mirror_events').trim().toLowerCase();
  if (!rawValue) return 'cloudflare_mirror_events';
  if (!/^[a-z0-9_.-]{1,128}$/i.test(rawValue)) return 'cloudflare_mirror_events';
  return rawValue;
}

function resolveSupabaseMirrorQueueFile() {
  const rawValue = String(process.env.SUPABASE_MIRROR_QUEUE_FILE || 'runtime/supabase-mirror-queue.jsonl').trim();
  if (!rawValue) {
    return path.resolve(rootDir, 'runtime/supabase-mirror-queue.jsonl');
  }
  if (path.isAbsolute(rawValue)) {
    return path.resolve(rawValue);
  }
  return path.resolve(rootDir, rawValue);
}

const HEALTH_CHECK_ALLOWED_HOSTS = resolveHealthCheckAllowedHosts();
const ADMIN_EMAIL_ALLOWLIST = resolveAdminEmailAllowlist();
const CHAT_API_BASE = resolveChatApiBase();
const DATA_API_BASE = resolveDataApiBase();
const CHAT_PROXY_ALLOW_AUTH_BYPASS = parseEnvBool('CHAT_PROXY_ALLOW_AUTH_BYPASS', false);
const SUPABASE_PROJECT_URL = resolveSupabaseProjectUrl();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_MIRROR_TABLE = resolveSupabaseMirrorTable();
const SUPABASE_MIRROR_ENABLED = parseEnvBool('SUPABASE_MIRROR_ENABLED', true);
const SUPABASE_MIRROR_TIMEOUT_MS = parseEnvInt('SUPABASE_MIRROR_TIMEOUT_MS', 10_000, {
  min: 1000,
  max: 60_000
});
const SUPABASE_MIRROR_RETRY_INTERVAL_MS = parseEnvInt('SUPABASE_MIRROR_RETRY_INTERVAL_MS', 30_000, {
  min: 1000,
  max: 900_000
});
const SUPABASE_MIRROR_QUEUE_FILE = resolveSupabaseMirrorQueueFile();
const SUPABASE_MIRROR_ACTIVE = SUPABASE_MIRROR_ENABLED
  && Boolean(SUPABASE_PROJECT_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_MIRROR_TABLE);
const BILM_OPS_TOKEN = String(process.env.BILM_OPS_TOKEN || '').trim();
const RATE_LIMIT_STORE = new Map();
let nextRateLimitSweepAtMs = 0;
const RATE_LIMIT_STORE_SOFT_CAP = 5000;
let mirrorQueueLoaded = false;
let mirrorQueue = [];
let mirrorQueueLock = Promise.resolve();
let mirrorRetryTimer = null;
let mirrorFlushRunning = false;
let mirrorLastSuccessAtMs = 0;
let mirrorLastErrorAtMs = 0;
let mirrorLastError = '';
const TMDB_PATH_SEGMENT_RE = /^[a-z0-9_-]+$/i;
const TMDB_QUERY_KEY_RE = /^[a-z0-9_.-]+$/i;
const ANILIST_ALLOWED_PAYLOAD_KEYS = new Set(['query', 'variables', 'operationName', 'extensions']);
const VIDSRC_ALLOWED_TYPES = new Set(['movies', 'tvshows', 'episodes']);
const RATE_LIMITS = Object.freeze({
  tmdb: Object.freeze({
    limit: parseEnvInt('TMDB_PROXY_RATE_LIMIT', 120, { min: 10, max: 5000 }),
    windowMs: parseEnvInt('TMDB_PROXY_RATE_WINDOW_MS', 60_000, { min: 1000, max: 3_600_000 })
  }),
  anilist: Object.freeze({
    limit: parseEnvInt('ANILIST_PROXY_RATE_LIMIT', 60, { min: 10, max: 5000 }),
    windowMs: parseEnvInt('ANILIST_PROXY_RATE_WINDOW_MS', 60_000, { min: 1000, max: 3_600_000 })
  }),
  chat: Object.freeze({
    limit: parseEnvInt('CHAT_PROXY_RATE_LIMIT', 120, { min: 10, max: 5000 }),
    windowMs: parseEnvInt('CHAT_PROXY_RATE_WINDOW_MS', 60_000, { min: 1000, max: 3_600_000 })
  }),
  data: Object.freeze({
    limit: parseEnvInt('DATA_PROXY_RATE_LIMIT', 120, { min: 10, max: 5000 }),
    windowMs: parseEnvInt('DATA_PROXY_RATE_WINDOW_MS', 60_000, { min: 1000, max: 3_600_000 })
  }),
  healthcheck: Object.freeze({
    limit: parseEnvInt('HEALTH_CHECK_RATE_LIMIT', 20, { min: 5, max: 2000 }),
    windowMs: parseEnvInt('HEALTH_CHECK_RATE_WINDOW_MS', 60_000, { min: 1000, max: 3_600_000 })
  })
});
const CORS_ALLOWED_ORIGINS = new Set([
  'https://watchbilm.org',
  'https://www.watchbilm.org',
  'https://admin.watchbilm.org',
  'https://cdn.jsdelivr.net'
]);

const CSP_HEADER_VALUE = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
  "connect-src 'self' https: wss:",
  "frame-src https:",
  "media-src 'self' https: blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests'
].join('; ');

const BASE_SECURITY_HEADERS = Object.freeze({
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-permitted-cross-domain-policies': 'none',
  'content-security-policy': CSP_HEADER_VALUE
});

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.map', 'application/json; charset=utf-8']
]);

function safeJoin(base, target) {
  const normalizedBase = path.resolve(base);
  const normalizedTarget = path.resolve(normalizedBase, `.${String(target || '')}`);
  if (normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}${path.sep}`)) {
    return normalizedTarget;
  }
  return null;
}

function sendNoContent(res, status = 204, headers = {}) {
  res.writeHead(status, {
    ...BASE_SECURITY_HEADERS,
    ...headers
  });
  res.end();
}

function sendRedirect(res, location, status = 302, headers = {}) {
  const safeLocation = String(location || '/');
  res.writeHead(status, {
    ...BASE_SECURITY_HEADERS,
    ...headers,
    location: safeLocation
  });
  res.end();
}

function normalizeClientIp(rawValue) {
  const rawText = String(rawValue || '').trim();
  if (!rawText) return '';

  let value = rawText;
  if (value.startsWith('[') && value.includes(']')) {
    value = value.slice(1, value.indexOf(']'));
  }
  if (value.startsWith('::ffff:')) {
    value = value.slice(7);
  }
  if (value === '::1') {
    return '127.0.0.1';
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(value)) {
    value = value.split(':')[0];
  }
  return value.toLowerCase();
}

function getClientIp(req) {
  const realIp = normalizeClientIp(req.headers['x-real-ip']);
  if (realIp) return realIp;

  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) {
    const chain = forwarded
      .split(',')
      .map((part) => normalizeClientIp(part))
      .filter(Boolean);
    if (chain.length) {
      // Use the right-most entry because trusted proxies append to the chain.
      return chain[chain.length - 1];
    }
  }

  return normalizeClientIp(req.socket?.remoteAddress) || 'unknown';
}

function normalizeRequestOrigin(rawOrigin) {
  const normalized = String(rawOrigin || '').trim();
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return '';
  }
}

function appendVary(existingValue, nextValue) {
  const existing = String(existingValue || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const normalizedExisting = new Set(existing.map((part) => part.toLowerCase()));
  if (!normalizedExisting.has(String(nextValue || '').toLowerCase())) {
    existing.push(nextValue);
  }
  return existing.join(', ');
}

function buildCorsHeaders(req, {
  methods = '',
  defaultAllowHeaders = 'content-type',
  includePreflight = false
} = {}) {
  const origin = normalizeRequestOrigin(req.headers.origin);
  if (!origin || !CORS_ALLOWED_ORIGINS.has(origin)) return {};

  const corsHeaders = {
    'access-control-allow-origin': origin,
    vary: 'Origin'
  };

  if (!includePreflight) return corsHeaders;

  if (methods) {
    corsHeaders['access-control-allow-methods'] = methods;
  }

  const requestedHeaders = String(req.headers['access-control-request-headers'] || '').trim().toLowerCase();
  if (requestedHeaders && /^[a-z0-9,_ -]+$/.test(requestedHeaders)) {
    corsHeaders['access-control-allow-headers'] = requestedHeaders;
    corsHeaders.vary = appendVary(corsHeaders.vary, 'Access-Control-Request-Headers');
  } else if (defaultAllowHeaders) {
    corsHeaders['access-control-allow-headers'] = defaultAllowHeaders;
  }
  corsHeaders['access-control-max-age'] = '600';
  corsHeaders.vary = appendVary(corsHeaders.vary, 'Access-Control-Request-Method');

  return corsHeaders;
}

function readOpsTokenFromRequest(req) {
  const directToken = String(req?.headers?.['x-bilm-ops-token'] || '').trim();
  if (directToken) return directToken;
  const authHeader = String(req?.headers?.authorization || '').trim();
  const match = /^bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return '';
  return String(match[1] || '').trim();
}

function requireOpsTokenAuth(req, res, { corsHeaders = {}, rateLimitHeadersMap = {} } = {}) {
  if (!BILM_OPS_TOKEN) {
    sendJson(res, 503, {
      error: 'Ops endpoint unavailable',
      code: 'ops_token_not_configured'
    }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return false;
  }

  const token = readOpsTokenFromRequest(req);
  if (!token) {
    sendJson(res, 401, {
      error: 'Unauthorized',
      code: 'missing_ops_token'
    }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return false;
  }

  if (token !== BILM_OPS_TOKEN) {
    sendJson(res, 403, {
      error: 'Forbidden',
      code: 'invalid_ops_token'
    }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return false;
  }

  return true;
}

function sweepRateLimitStore(nowMs) {
  if (nowMs < nextRateLimitSweepAtMs && RATE_LIMIT_STORE.size < RATE_LIMIT_STORE_SOFT_CAP) return;

  for (const [key, entry] of RATE_LIMIT_STORE.entries()) {
    if (nowMs >= Number(entry?.resetAtMs || 0)) {
      RATE_LIMIT_STORE.delete(key);
    }
  }
  nextRateLimitSweepAtMs = nowMs + 60_000;
}

function consumeRateLimit(bucketName, req) {
  const bucket = RATE_LIMITS[bucketName];
  if (!bucket) {
    return {
      allowed: true,
      limit: 0,
      remaining: 0,
      resetAtEpochSeconds: Math.ceil(Date.now() / 1000),
      retryAfterSeconds: 0
    };
  }

  const nowMs = Date.now();
  sweepRateLimitStore(nowMs);

  const ip = getClientIp(req);
  const key = `${bucketName}:${ip}`;
  let entry = RATE_LIMIT_STORE.get(key);
  if (!entry || nowMs >= Number(entry.resetAtMs || 0)) {
    entry = {
      count: 0,
      resetAtMs: nowMs + bucket.windowMs
    };
  }

  if (entry.count >= bucket.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAtMs - nowMs) / 1000));
    return {
      allowed: false,
      limit: bucket.limit,
      remaining: 0,
      resetAtEpochSeconds: Math.ceil(entry.resetAtMs / 1000),
      retryAfterSeconds
    };
  }

  entry.count += 1;
  RATE_LIMIT_STORE.set(key, entry);
  return {
    allowed: true,
    limit: bucket.limit,
    remaining: Math.max(0, bucket.limit - entry.count),
    resetAtEpochSeconds: Math.ceil(entry.resetAtMs / 1000),
    retryAfterSeconds: 0
  };
}

function rateLimitHeaders(rateLimitState) {
  return {
    'x-ratelimit-limit': String(Math.max(0, Number(rateLimitState?.limit || 0))),
    'x-ratelimit-remaining': String(Math.max(0, Number(rateLimitState?.remaining || 0))),
    'x-ratelimit-reset': String(Math.max(0, Number(rateLimitState?.resetAtEpochSeconds || 0)))
  };
}

function enforceRateLimit(req, res, bucketName, extraHeaders = {}) {
  const rateLimitState = consumeRateLimit(bucketName, req);
  const headers = rateLimitHeaders(rateLimitState);
  if (rateLimitState.allowed) {
    return {
      blocked: false,
      headers
    };
  }

  sendJson(res, 429, {
    error: 'Too Many Requests',
    code: `${bucketName}_rate_limited`,
    retryAfterSeconds: rateLimitState.retryAfterSeconds
  }, {
    ...extraHeaders,
    ...headers,
    'cache-control': 'no-store',
    'retry-after': String(rateLimitState.retryAfterSeconds)
  });
  return {
    blocked: true,
    headers
  };
}

function sanitizeAcceptHeader(rawValue) {
  const fallback = 'application/json, text/plain, */*';
  const value = String(rawValue || '').trim();
  if (!value) return fallback;
  if (value.length > 256) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}

function sanitizeTmdbPath(pathname) {
  const rawPath = String(pathname || '').replace(/^\/api\/tmdb\/?/i, '');
  if (!rawPath.trim()) {
    return { error: 'TMDB path is required' };
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return { error: 'Invalid TMDB path encoding' };
  }

  const normalizedPath = decodedPath
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!normalizedPath) {
    return { error: 'TMDB path is required' };
  }
  if (normalizedPath.length > 256) {
    return { error: 'TMDB path is too long' };
  }
  if (normalizedPath.includes('..')) {
    return { error: 'Invalid TMDB path' };
  }

  const segments = normalizedPath.split('/');
  if (segments.length > 8) {
    return { error: 'TMDB path depth exceeded' };
  }

  for (const segment of segments) {
    if (!segment || segment.length > 64 || !TMDB_PATH_SEGMENT_RE.test(segment)) {
      return { error: 'Invalid TMDB path segment' };
    }
  }

  return { path: normalizedPath };
}

function sanitizeTmdbSearchParams(searchParams) {
  const cleanParams = new URLSearchParams();
  let count = 0;
  let totalChars = 0;
  for (const [rawKey, rawValue] of searchParams.entries()) {
    const key = String(rawKey || '').trim();
    if (!key) continue;
    if (key.toLowerCase() === 'api_key') continue;
    if (!TMDB_QUERY_KEY_RE.test(key) || key.length > 64) {
      return { error: 'Invalid TMDB query parameter key' };
    }

    count += 1;
    if (count > 20) {
      return { error: 'Too many TMDB query parameters' };
    }

    const value = String(rawValue ?? '');
    if (value.length > 512) {
      return { error: 'TMDB query parameter value is too long' };
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      return { error: 'Invalid TMDB query parameter value' };
    }

    totalChars += key.length + value.length;
    if (totalChars > 2048) {
      return { error: 'TMDB query string is too large' };
    }

    cleanParams.append(key, value);
  }
  return { searchParams: cleanParams };
}

function sanitizeAniListPayload(rawBody) {
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { error: 'Invalid JSON payload' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'AniList payload must be a JSON object' };
  }

  for (const key of Object.keys(parsed)) {
    if (!ANILIST_ALLOWED_PAYLOAD_KEYS.has(key)) {
      return { error: 'AniList payload contains unsupported keys' };
    }
  }

  const query = typeof parsed.query === 'string' ? parsed.query.trim() : '';
  if (!query) {
    return { error: 'AniList query is required' };
  }
  if (query.length > 12_000) {
    return { error: 'AniList query is too long' };
  }

  const sanitizedPayload = { query };

  if (typeof parsed.operationName !== 'undefined') {
    if (parsed.operationName === null) {
      sanitizedPayload.operationName = null;
    } else if (typeof parsed.operationName === 'string' && parsed.operationName.length <= 128) {
      sanitizedPayload.operationName = parsed.operationName;
    } else {
      return { error: 'AniList operationName is invalid' };
    }
  }

  if (typeof parsed.variables !== 'undefined') {
    const variables = parsed.variables;
    if (variables === null) {
      sanitizedPayload.variables = null;
    } else if (variables && typeof variables === 'object' && !Array.isArray(variables)) {
      const serializedVariables = JSON.stringify(variables);
      if (serializedVariables.length > 32_000) {
        return { error: 'AniList variables are too large' };
      }
      sanitizedPayload.variables = variables;
    } else {
      return { error: 'AniList variables must be an object or null' };
    }
  }

  if (typeof parsed.extensions !== 'undefined') {
    const extensions = parsed.extensions;
    if (extensions === null) {
      sanitizedPayload.extensions = null;
    } else if (extensions && typeof extensions === 'object' && !Array.isArray(extensions)) {
      const serializedExtensions = JSON.stringify(extensions);
      if (serializedExtensions.length > 8192) {
        return { error: 'AniList extensions are too large' };
      }
      sanitizedPayload.extensions = extensions;
    } else {
      return { error: 'AniList extensions must be an object or null' };
    }
  }

  return {
    body: JSON.stringify(sanitizedPayload)
  };
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...BASE_SECURITY_HEADERS,
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function staticHeaders(filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(ext) || 'application/octet-stream';
  const etag = `W/"${Number(stat.size || 0)}-${Math.trunc(Number(stat.mtimeMs || 0))}"`;
  const isHtml = ext === '.html';
  return {
    etag,
    headers: {
      'content-type': contentType,
      'cache-control': isHtml ? 'no-cache' : STATIC_CACHE_CONTROL,
      'last-modified': stat.mtime.toUTCString(),
      etag,
      ...BASE_SECURITY_HEADERS
    }
  };
}

function streamFile(req, res, filePath, stat) {
  const { etag, headers } = staticHeaders(filePath, stat);
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Failed to read static file' }, { 'cache-control': 'no-store' });
      return;
    }
    res.destroy();
  });
  stream.pipe(res);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method Not Allowed' }, {
      allow: 'GET, HEAD',
      'cache-control': 'no-store'
    });
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname || '/');
  } catch {
    sendJson(res, 400, { error: 'Bad Request' }, { 'cache-control': 'no-store' });
    return;
  }

  const rel = decodedPath === '/' ? '/index.html' : decodedPath;
  const candidate = safeJoin(rootDir, rel);
  if (!candidate) {
    sendJson(res, 403, { error: 'Forbidden' }, { 'cache-control': 'no-store' });
    return;
  }

  let filePath = candidate;
  let stat;
  try {
    stat = await fsp.stat(candidate);
  } catch {
    const folderCandidate = safeJoin(rootDir, path.join(rel, 'index.html'));
    if (!folderCandidate) {
      sendJson(res, 404, { error: 'Not Found' }, { 'cache-control': 'no-store' });
      return;
    }
    try {
      filePath = folderCandidate;
      stat = await fsp.stat(filePath);
    } catch {
      sendJson(res, 404, { error: 'Not Found' }, { 'cache-control': 'no-store' });
      return;
    }
  }

  if (stat.isDirectory()) {
    filePath = path.join(candidate, 'index.html');
    try {
      stat = await fsp.stat(filePath);
    } catch {
      sendJson(res, 404, { error: 'Not Found' }, { 'cache-control': 'no-store' });
      return;
    }
  }

  if (!stat.isFile()) {
    sendJson(res, 404, { error: 'Not Found' }, { 'cache-control': 'no-store' });
    return;
  }

  streamFile(req, res, filePath, stat);
}

async function readRequestBody(req, maxBytes = 256 * 1024) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      const error = new Error('Payload too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf-8');
}

function safeParseJson(rawValue, fallback = null) {
  try {
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

function withMirrorQueueLock(task) {
  const run = async () => task();
  mirrorQueueLock = mirrorQueueLock.then(run, run);
  return mirrorQueueLock;
}

function isMirrorableDataApiPath(pathname) {
  const normalizedPath = String(pathname || '').trim();
  if (!normalizedPath) return false;
  if (normalizedPath === '/') return true;
  if (normalizedPath === '/account/reset') return true;
  if (normalizedPath === '/links' || normalizedPath.startsWith('/links/')) return true;
  if (normalizedPath.startsWith('/sync/lists/')) return true;
  if (normalizedPath.startsWith('/sync/sectors/')) return true;
  return false;
}

function sanitizeMirrorUserId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length > 128) return null;
  if (!/^[a-zA-Z0-9._:@-]+$/.test(normalized)) return null;
  return normalized;
}

function toJsonBodyInfo(rawBody, contentType = '') {
  const bodyText = typeof rawBody === 'string' ? rawBody : '';
  const bytes = Buffer.byteLength(bodyText, 'utf-8');
  if (!bodyText) {
    return { json: null, text: null, bytes };
  }

  const normalizedType = String(contentType || '').toLowerCase();
  const looksJson = normalizedType.includes('application/json')
    || normalizedType.includes('+json')
    || bodyText.trim().startsWith('{')
    || bodyText.trim().startsWith('[');
  if (looksJson) {
    const parsed = safeParseJson(bodyText, null);
    if (parsed && typeof parsed === 'object') {
      return { json: parsed, text: null, bytes };
    }
  }
  return { json: null, text: bodyText, bytes };
}

function toBufferBodyInfo(buffer, contentType = '') {
  if (!buffer || !buffer.length) {
    return { json: null, text: null, bytes: 0 };
  }

  const bytes = Number(buffer.length || 0);
  const normalizedType = String(contentType || '').toLowerCase();
  const isTextual = normalizedType.includes('json')
    || normalizedType.startsWith('text/')
    || normalizedType.includes('javascript')
    || normalizedType.includes('xml');
  if (!isTextual) {
    return { json: null, text: null, bytes };
  }

  const text = buffer.toString('utf-8');
  const looksJson = normalizedType.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('[');
  if (looksJson) {
    const parsed = safeParseJson(text, null);
    if (parsed && typeof parsed === 'object') {
      return { json: parsed, text: null, bytes };
    }
  }
  return { json: null, text, bytes };
}

function sanitizeMirrorHeaders(rawHeaders = {}) {
  const blockedHeaders = new Set([
    'authorization',
    'cookie',
    'x-bilm-ops-token',
    'x-bilm-auth-bypass',
    'x-bilm-auth-email',
    'x-bilm-auth-uid'
  ]);
  const headers = {};
  for (const [rawKey, rawValue] of Object.entries(rawHeaders || {})) {
    const key = String(rawKey || '').trim().toLowerCase();
    if (!key || blockedHeaders.has(key)) continue;
    if (!/^[a-z0-9-]+$/.test(key)) continue;

    if (Array.isArray(rawValue)) {
      headers[key] = rawValue
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(', ')
        .slice(0, 2048);
      continue;
    }
    headers[key] = String(rawValue ?? '').trim().slice(0, 2048);
  }
  return headers;
}

function searchParamsToObject(searchParams) {
  const output = {};
  for (const [key, value] of searchParams.entries()) {
    if (!Object.prototype.hasOwnProperty.call(output, key)) {
      output[key] = value;
      continue;
    }
    if (Array.isArray(output[key])) {
      output[key].push(value);
      continue;
    }
    output[key] = [output[key], value];
  }
  return output;
}

function deriveMirrorUserId(searchParams, requestInfo, responseInfo) {
  const direct = sanitizeMirrorUserId(searchParams.get('userId'));
  if (direct) return direct;

  const requestUser = sanitizeMirrorUserId(requestInfo?.json?.userId || requestInfo?.json?.uid);
  if (requestUser) return requestUser;

  const responseUser = sanitizeMirrorUserId(responseInfo?.json?.userId || responseInfo?.json?.uid);
  if (responseUser) return responseUser;

  return null;
}

function buildMirrorEvent({
  req,
  upstreamUrl,
  requestBody,
  requestContentType,
  responseBuffer,
  responseContentType,
  upstreamStatus
}) {
  const requestInfo = toJsonBodyInfo(requestBody, requestContentType);
  const responseInfo = toBufferBodyInfo(responseBuffer, responseContentType);
  const occurredAt = new Date().toISOString();
  const eventId = randomUUID();
  const idempotencyKey = createHash('sha256')
    .update(`${eventId}:${req.method}:${upstreamUrl.pathname}:${upstreamUrl.search}:${occurredAt}`)
    .digest('hex');

  return {
    event_id: eventId,
    idempotency_key: idempotencyKey,
    source: 'data-api-proxy',
    occurred_at: occurredAt,
    mirrored_at: new Date().toISOString(),
    user_id: deriveMirrorUserId(upstreamUrl.searchParams, requestInfo, responseInfo),
    method: String(req.method || '').toUpperCase(),
    path: upstreamUrl.pathname,
    query_params: searchParamsToObject(upstreamUrl.searchParams),
    request_headers: sanitizeMirrorHeaders(req.headers),
    request_content_type: requestContentType || null,
    request_body_json: requestInfo.json,
    request_body_text: requestInfo.text,
    request_body_bytes: requestInfo.bytes,
    response_status: Number(upstreamStatus || 0),
    response_content_type: responseContentType || null,
    response_body_json: responseInfo.json,
    response_body_text: responseInfo.text,
    response_body_bytes: responseInfo.bytes,
    retry_count: 0
  };
}

function normalizeQueuedMirrorEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') return null;
  const event = rawEntry.event && typeof rawEntry.event === 'object' ? rawEntry.event : null;
  if (!event) return null;
  const eventId = String(event.event_id || '').trim();
  if (!eventId) return null;
  return {
    event,
    retryCount: Math.max(0, Number(rawEntry.retryCount || 0) || 0),
    nextAttemptAtMs: Math.max(0, Number(rawEntry.nextAttemptAtMs || 0) || 0),
    lastError: String(rawEntry.lastError || '').slice(0, 2048)
  };
}

async function persistMirrorQueueLocked() {
  if (!SUPABASE_MIRROR_ACTIVE) return;
  const targetDir = path.dirname(SUPABASE_MIRROR_QUEUE_FILE);
  await fsp.mkdir(targetDir, { recursive: true });
  if (!mirrorQueue.length) {
    try {
      await fsp.rm(SUPABASE_MIRROR_QUEUE_FILE, { force: true });
    } catch {}
    return;
  }

  const serialized = mirrorQueue.map((entry) => JSON.stringify(entry)).join('\n');
  const tempPath = `${SUPABASE_MIRROR_QUEUE_FILE}.tmp`;
  await fsp.writeFile(tempPath, `${serialized}\n`, 'utf-8');
  await fsp.rename(tempPath, SUPABASE_MIRROR_QUEUE_FILE);
}

async function ensureMirrorQueueLoaded() {
  if (!SUPABASE_MIRROR_ACTIVE || mirrorQueueLoaded) return;
  await withMirrorQueueLock(async () => {
    if (mirrorQueueLoaded) return;
    try {
      const rawFile = await fsp.readFile(SUPABASE_MIRROR_QUEUE_FILE, 'utf-8');
      const entries = rawFile
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => normalizeQueuedMirrorEntry(safeParseJson(line, null)))
        .filter(Boolean);
      mirrorQueue = entries;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn('Supabase mirror queue load failed:', error);
      }
      mirrorQueue = [];
    }
    mirrorQueueLoaded = true;
  });
}

function scheduleMirrorRetryFromQueue() {
  if (!SUPABASE_MIRROR_ACTIVE) return;
  if (mirrorRetryTimer) {
    clearTimeout(mirrorRetryTimer);
    mirrorRetryTimer = null;
  }
  if (!mirrorQueue.length) return;

  const nowMs = Date.now();
  const nextAttemptAtMs = mirrorQueue.reduce((min, entry) => {
    const nextAt = Number(entry?.nextAttemptAtMs || 0) || nowMs;
    return Math.min(min, nextAt);
  }, Number.MAX_SAFE_INTEGER);
  const delayMs = Math.max(1000, Math.min(3_600_000, nextAttemptAtMs - nowMs));

  mirrorRetryTimer = setTimeout(() => {
    mirrorRetryTimer = null;
    void flushMirrorQueue();
  }, delayMs);
}

function buildSupabaseMirrorUrl() {
  const url = new URL(`/rest/v1/${encodeURIComponent(SUPABASE_MIRROR_TABLE)}`, `${SUPABASE_PROJECT_URL}/`);
  url.searchParams.set('on_conflict', 'event_id');
  return url.toString();
}

async function postMirrorEventToSupabase(event) {
  if (!SUPABASE_MIRROR_ACTIVE) return;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), SUPABASE_MIRROR_TIMEOUT_MS);
  try {
    const response = await fetch(buildSupabaseMirrorUrl(), {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify([event]),
      signal: abortController.signal
    });
    if (!response.ok) {
      const bodyText = await response.text();
      const error = new Error(`Supabase mirror write failed (${response.status}).`);
      error.statusCode = response.status;
      error.responseBody = bodyText.slice(0, 2048);
      throw error;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Supabase mirror write timed out.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function enqueueMirrorEvent(event, reason = '') {
  if (!SUPABASE_MIRROR_ACTIVE || !event || typeof event !== 'object') return;
  await ensureMirrorQueueLoaded();
  await withMirrorQueueLock(async () => {
    mirrorQueue.push({
      event: {
        ...event,
        retry_count: Number(event.retry_count || 0) || 0
      },
      retryCount: Math.max(0, Number(event.retry_count || 0) || 0),
      nextAttemptAtMs: Date.now() + SUPABASE_MIRROR_RETRY_INTERVAL_MS,
      lastError: String(reason || '').slice(0, 2048)
    });
    await persistMirrorQueueLocked();
  });
  scheduleMirrorRetryFromQueue();
}

async function flushMirrorQueue() {
  if (!SUPABASE_MIRROR_ACTIVE) return;
  await ensureMirrorQueueLoaded();
  if (mirrorFlushRunning) return;

  mirrorFlushRunning = true;
  try {
    await withMirrorQueueLock(async () => {
      if (!mirrorQueue.length) return;
      const nowMs = Date.now();
      let changed = false;
      const nextQueue = [];

      for (const queuedEntry of mirrorQueue) {
        const normalizedEntry = normalizeQueuedMirrorEntry(queuedEntry);
        if (!normalizedEntry) {
          changed = true;
          continue;
        }
        if (normalizedEntry.nextAttemptAtMs > nowMs) {
          nextQueue.push(normalizedEntry);
          continue;
        }

        const nextRetryCount = Math.max(0, normalizedEntry.retryCount);
        try {
          // Keep event retry metadata accurate in Supabase.
          normalizedEntry.event.retry_count = nextRetryCount;
          await postMirrorEventToSupabase(normalizedEntry.event);
          mirrorLastSuccessAtMs = Date.now();
          changed = true;
        } catch (error) {
          const updatedRetryCount = nextRetryCount + 1;
          const backoffMs = Math.min(
            15 * 60_000,
            SUPABASE_MIRROR_RETRY_INTERVAL_MS * (2 ** Math.min(updatedRetryCount, 6))
          );
          mirrorLastErrorAtMs = Date.now();
          mirrorLastError = String(error?.message || 'Supabase mirror queue retry failed.').slice(0, 2048);
          changed = true;
          nextQueue.push({
            event: {
              ...normalizedEntry.event,
              retry_count: updatedRetryCount
            },
            retryCount: updatedRetryCount,
            nextAttemptAtMs: Date.now() + backoffMs,
            lastError: mirrorLastError
          });
        }
      }

      if (changed || nextQueue.length !== mirrorQueue.length) {
        mirrorQueue = nextQueue;
        await persistMirrorQueueLocked();
      } else {
        mirrorQueue = nextQueue;
      }
    });
  } finally {
    mirrorFlushRunning = false;
    scheduleMirrorRetryFromQueue();
  }
}

async function mirrorDataApiTraffic({
  req,
  upstreamUrl,
  requestBody = '',
  requestContentType = '',
  upstreamStatus = 0,
  responseBuffer = Buffer.alloc(0),
  responseContentType = ''
}) {
  if (!SUPABASE_MIRROR_ACTIVE) return;
  if (!isMirrorableDataApiPath(upstreamUrl.pathname)) return;
  if (String(req.method || '').toUpperCase() === 'HEAD') return;
  if (!(upstreamStatus >= 200 && upstreamStatus < 300)) return;

  const event = buildMirrorEvent({
    req,
    upstreamUrl,
    requestBody,
    requestContentType,
    responseBuffer,
    responseContentType,
    upstreamStatus
  });

  try {
    await postMirrorEventToSupabase(event);
    mirrorLastSuccessAtMs = Date.now();
  } catch (error) {
    mirrorLastErrorAtMs = Date.now();
    mirrorLastError = String(error?.message || 'Supabase mirror write failed.').slice(0, 2048);
    await enqueueMirrorEvent(event, mirrorLastError);
  }
}

async function handleAniListProxy(req, res) {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    const preflightCorsHeaders = buildCorsHeaders(req, {
      methods: 'POST, OPTIONS',
      defaultAllowHeaders: 'content-type',
      includePreflight: true
    });
    sendNoContent(res, 204, {
      ...preflightCorsHeaders,
      allow: 'POST, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' }, {
      ...corsHeaders,
      allow: 'POST, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  const { blocked, headers: rateLimitHeadersMap } = enforceRateLimit(req, res, 'anilist', corsHeaders);
  if (blocked) return;

  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    sendJson(res, 415, { error: 'Content-Type must be application/json' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  try {
    const body = await readRequestBody(req, 128 * 1024);
    if (!body.trim()) {
      sendJson(res, 400, { error: 'Request body is required' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }

    const sanitizedPayload = sanitizeAniListPayload(body);
    if (sanitizedPayload.error) {
      sendJson(res, 400, { error: sanitizedPayload.error }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 12000);

    let upstream;
    try {
      upstream = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: sanitizedPayload.body,
        signal: abortController.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const payload = await upstream.text();
    res.writeHead(upstream.status, {
      ...BASE_SECURITY_HEADERS,
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    });
    res.end(payload);
  } catch (error) {
    if (error?.statusCode === 413) {
      sendJson(res, 413, { error: 'Payload too large' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }
    if (error?.name === 'AbortError') {
      sendJson(res, 504, { error: 'AniList upstream timed out' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }
    sendJson(res, 502, { error: 'AniList proxy request failed' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
  }
}

async function handleTmdbProxy(req, res, pathname, searchParams) {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    const preflightCorsHeaders = buildCorsHeaders(req, {
      methods: 'GET, HEAD, OPTIONS',
      defaultAllowHeaders: 'accept, content-type',
      includePreflight: true
    });
    sendNoContent(res, 204, {
      ...preflightCorsHeaders,
      allow: 'GET, HEAD, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method Not Allowed' }, {
      ...corsHeaders,
      allow: 'GET, HEAD, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  const { blocked, headers: rateLimitHeadersMap } = enforceRateLimit(req, res, 'tmdb', corsHeaders);
  if (blocked) return;

  const apiKey = String(process.env.TMDB_API_KEY || '').trim();
  if (!apiKey) {
    sendJson(res, 503, {
      error: 'TMDB proxy unavailable',
      code: 'tmdb_proxy_missing_api_key'
    }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  const sanitizedPath = sanitizeTmdbPath(pathname);
  if (sanitizedPath.error) {
    sendJson(res, 400, { error: sanitizedPath.error }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  const sanitizedSearchParams = sanitizeTmdbSearchParams(searchParams);
  if (sanitizedSearchParams.error) {
    sendJson(res, 400, { error: sanitizedSearchParams.error }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  const upstreamUrl = new URL(`https://api.themoviedb.org/3/${sanitizedPath.path}`);
  sanitizedSearchParams.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });
  upstreamUrl.searchParams.set('api_key', apiKey);

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 12000);
  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: req.method,
      headers: {
        accept: sanitizeAcceptHeader(req.headers.accept)
      },
      signal: abortController.signal
    });
    const headers = {
      ...BASE_SECURITY_HEADERS,
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store',
    };
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers['content-type'] = contentType;
    res.writeHead(upstream.status, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const payload = await upstream.arrayBuffer();
    res.end(Buffer.from(payload));
  } catch (error) {
    if (error?.name === 'AbortError') {
      sendJson(res, 504, { error: 'TMDB upstream timed out' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }
    sendJson(res, 502, { error: 'TMDB proxy request failed' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function sanitizeVidsrcType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!VIDSRC_ALLOWED_TYPES.has(normalized)) return '';
  return normalized;
}

function sanitizeVidsrcPage(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) return null;
  return parsed;
}

async function handleVidsrcLatestProxy(req, res, searchParams) {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    const preflightCorsHeaders = buildCorsHeaders(req, {
      methods: 'GET, HEAD, OPTIONS',
      defaultAllowHeaders: 'accept, content-type',
      includePreflight: true
    });
    sendNoContent(res, 204, {
      ...preflightCorsHeaders,
      allow: 'GET, HEAD, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method Not Allowed' }, {
      ...corsHeaders,
      allow: 'GET, HEAD, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  const { blocked, headers: rateLimitHeadersMap } = enforceRateLimit(req, res, 'tmdb', corsHeaders);
  if (blocked) return;

  const requestedType = sanitizeVidsrcType(searchParams.get('type'));
  if (!requestedType) {
    sendJson(res, 400, { error: 'Invalid VidSrc type. Use movies, tvshows, or episodes.' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  const requestedPage = sanitizeVidsrcPage(searchParams.get('page') || '1');
  if (!requestedPage) {
    sendJson(res, 400, { error: 'Invalid VidSrc page. Use an integer between 1 and 500.' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  const upstreamUrl = `https://vidsrc-embed.ru/${requestedType}/latest/page-${requestedPage}.json`;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 12000);
  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': 'BilmProxy/1.0 (+https://watchbilm.org)'
      },
      signal: abortController.signal
    });

    if (!upstream.ok) {
      sendJson(res, upstream.status, { error: 'VidSrc upstream request failed', status: upstream.status }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }

    if (req.method === 'HEAD') {
      sendNoContent(res, 204, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'public, max-age=60, stale-while-revalidate=120'
      });
      return;
    }

    const payloadText = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      sendJson(res, 502, { error: 'VidSrc upstream returned invalid JSON' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }

    sendJson(res, 200, payload, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'public, max-age=60, stale-while-revalidate=120'
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      sendJson(res, 504, { error: 'VidSrc upstream timed out' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }
    sendJson(res, 502, { error: 'VidSrc proxy request failed' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleDataApiProxy(req, res, rawPathname, url) {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    const preflightCorsHeaders = buildCorsHeaders(req, {
      methods: 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      defaultAllowHeaders: 'accept, content-type, authorization',
      includePreflight: true
    });
    sendNoContent(res, 204, {
      ...preflightCorsHeaders,
      allow: 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  const method = String(req.method || '').toUpperCase();
  const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
  if (!allowedMethods.has(method)) {
    sendJson(res, 405, { error: 'Method Not Allowed' }, {
      ...corsHeaders,
      allow: 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  const { blocked, headers: rateLimitHeadersMap } = enforceRateLimit(req, res, 'data', corsHeaders);
  if (blocked) return;

  const upstreamPath = rawPathname === '/api/data'
    ? '/'
    : rawPathname.replace(/^\/api\/data/, '') || '/';

  let upstreamUrl;
  try {
    upstreamUrl = new URL(upstreamPath, `${DATA_API_BASE}/`);
  } catch {
    sendJson(res, 500, { error: 'Data API base URL is invalid' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  url.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  let requestBody = '';
  const supportsBody = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (supportsBody) {
    try {
      requestBody = await readRequestBody(req, 2 * 1024 * 1024);
    } catch (error) {
      if (error?.statusCode === 413) {
        sendJson(res, 413, { error: 'Payload too large' }, {
          ...corsHeaders,
          ...rateLimitHeadersMap,
          'cache-control': 'no-store'
        });
        return;
      }
      sendJson(res, 400, { error: 'Invalid request payload' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }
  }

  const requestHeaders = {
    accept: sanitizeAcceptHeader(req.headers.accept)
  };
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader) requestHeaders.authorization = authHeader;

  const contentType = String(req.headers['content-type'] || '').trim();
  if (contentType) requestHeaders['content-type'] = contentType;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 12_000);
  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method,
      headers: requestHeaders,
      body: supportsBody && requestBody ? requestBody : undefined,
      signal: abortController.signal
    });

    const responseBuffer = Buffer.from(await upstream.arrayBuffer());
    const responseContentType = String(upstream.headers.get('content-type') || '').trim();

    const responseHeaders = {
      ...BASE_SECURITY_HEADERS,
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    };
    if (responseContentType) {
      responseHeaders['content-type'] = responseContentType;
    }

    res.writeHead(upstream.status, responseHeaders);
    if (method === 'HEAD') {
      res.end();
    } else {
      res.end(responseBuffer);
    }

    void mirrorDataApiTraffic({
      req,
      upstreamUrl,
      requestBody,
      requestContentType: contentType,
      upstreamStatus: upstream.status,
      responseBuffer,
      responseContentType
    }).catch((error) => {
      console.warn('Data API mirror task failed:', error);
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      sendJson(res, 504, { error: 'Data API upstream timed out' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }
    sendJson(res, 502, { error: 'Data API proxy request failed' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleChatApiProxy(req, res, rawPathname, url) {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    const preflightCorsHeaders = buildCorsHeaders(req, {
      methods: 'GET, POST, DELETE, OPTIONS',
      defaultAllowHeaders: 'accept, content-type, authorization',
      includePreflight: true
    });
    sendNoContent(res, 204, {
      ...preflightCorsHeaders,
      allow: 'GET, POST, DELETE, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    sendJson(res, 405, { error: 'Method Not Allowed' }, {
      ...corsHeaders,
      allow: 'GET, POST, DELETE, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  const { blocked, headers: rateLimitHeadersMap } = enforceRateLimit(req, res, 'chat', corsHeaders);
  if (blocked) return;

  const upstreamPath = rawPathname === '/api/chat'
    ? '/conversations'
    : rawPathname.replace(/^\/api\/chat/, '') || '/';

  let upstreamUrl;
  try {
    upstreamUrl = new URL(upstreamPath, `${CHAT_API_BASE}/`);
  } catch {
    sendJson(res, 500, { error: 'Chat API base URL is invalid' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  url.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  let requestBody = null;
  if (req.method === 'POST' || req.method === 'DELETE') {
    try {
      requestBody = await readRequestBody(req, 128 * 1024);
    } catch (error) {
      if (error?.statusCode === 413) {
        sendJson(res, 413, { error: 'Payload too large' }, {
          ...corsHeaders,
          ...rateLimitHeadersMap,
          'cache-control': 'no-store'
        });
        return;
      }
      sendJson(res, 400, { error: 'Invalid request payload' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }
  }

  const headers = {
    accept: sanitizeAcceptHeader(req.headers.accept)
  };
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader) headers.authorization = authHeader;

  const contentType = String(req.headers['content-type'] || '').trim();
  if (contentType) headers['content-type'] = contentType;

  if (CHAT_PROXY_ALLOW_AUTH_BYPASS) {
    const bypassHeader = String(req.headers['x-bilm-auth-bypass'] || '').trim();
    if (bypassHeader) headers['x-bilm-auth-bypass'] = bypassHeader;
    const bypassEmail = String(req.headers['x-bilm-auth-email'] || '').trim();
    if (bypassEmail) headers['x-bilm-auth-email'] = bypassEmail;
    const bypassUid = String(req.headers['x-bilm-auth-uid'] || '').trim();
    if (bypassUid) headers['x-bilm-auth-uid'] = bypassUid;
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 12000);
  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: req.method,
      headers,
      body: requestBody && requestBody.length > 0 ? requestBody : undefined,
      signal: abortController.signal
    });

    const responseHeaders = {
      ...BASE_SECURITY_HEADERS,
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    };
    const upstreamContentType = upstream.headers.get('content-type');
    if (upstreamContentType) responseHeaders['content-type'] = upstreamContentType;
    res.writeHead(upstream.status, responseHeaders);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const payload = await upstream.arrayBuffer();
    res.end(Buffer.from(payload));
  } catch (error) {
    if (error?.name === 'AbortError') {
      sendJson(res, 504, { error: 'Chat API upstream timed out' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }
    sendJson(res, 502, { error: 'Chat API proxy request failed' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function sanitizeHealthTargets(rawTargets = []) {
  if (!Array.isArray(rawTargets)) return [];
  const allowedMethods = new Set(['HEAD', 'GET', 'POST', 'OPTIONS']);
  return rawTargets
    .slice(0, 20)
    .map((target) => {
      const label = String(target?.label || '').trim();
      const rawUrl = String(target?.url || '').trim();
      if (!label || !rawUrl) return null;
      let parsed;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return {
          label,
          url: rawUrl,
          invalid: true
        };
      }
      const normalizedHost = String(parsed.hostname || '').trim().toLowerCase();
      const normalizedProtocol = String(parsed.protocol || '').trim().toLowerCase();
      const protocolAllowed = normalizedProtocol === 'https:';
      const hostAllowed = HEALTH_CHECK_ALLOWED_HOSTS.has(normalizedHost);
      if (!protocolAllowed || !hostAllowed) {
        return {
          label,
          url: rawUrl,
          invalid: true
        };
      }
      const requestedMethod = String(target?.method || 'HEAD').trim().toUpperCase();
      const method = allowedMethods.has(requestedMethod) ? requestedMethod : 'HEAD';
      const timeoutMsRaw = Number(target?.timeoutMs || 7000);
      const timeoutMs = Number.isFinite(timeoutMsRaw)
        ? Math.max(1000, Math.min(15000, Math.floor(timeoutMsRaw)))
        : 7000;
      const expectedStatuses = Array.isArray(target?.expectedStatuses)
        ? [...new Set(
          target.expectedStatuses
            .map((status) => Number(status || 0))
            .filter((status) => Number.isInteger(status) && status >= 100 && status <= 599)
            .slice(0, 10)
        )]
        : [];
      let headers = null;
      if (target?.headers && typeof target.headers === 'object' && !Array.isArray(target.headers)) {
        headers = {};
        for (const [rawKey, rawValue] of Object.entries(target.headers)) {
          const headerKey = String(rawKey || '').trim().toLowerCase();
          if (!headerKey || !/^[a-z0-9-]+$/.test(headerKey)) continue;
          headers[headerKey] = String(rawValue ?? '').slice(0, 1024);
        }
      }
      let body = null;
      if (method === 'POST' || method === 'OPTIONS') {
        if (typeof target?.body === 'string') {
          body = target.body.slice(0, 8192);
        } else if (typeof target?.body !== 'undefined') {
          try {
            body = JSON.stringify(target.body).slice(0, 8192);
            if (headers && typeof headers['content-type'] === 'undefined') {
              headers['content-type'] = 'application/json';
            }
          } catch {
            body = null;
          }
        }
      }
      return {
        label,
        url: parsed.toString(),
        method,
        timeoutMs,
        headers,
        body,
        expectedStatuses,
        invalid: false
      };
    })
    .filter(Boolean);
}

async function checkHealthTarget(target) {
  if (target.invalid) {
    return {
      label: target.label,
      url: target.url,
      ok: false,
      status: null,
      latencyMs: 0,
      error: 'invalid_target'
    };
  }

  const startedAt = Date.now();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), Number(target.timeoutMs || 7000));
  try {
    const requestHeaders = {
      accept: 'application/json, text/plain, */*',
      ...(target.headers || {})
    };
    const requestInit = {
      method: target.method || 'HEAD',
      redirect: 'follow',
      signal: abortController.signal,
      headers: requestHeaders
    };
    if ((requestInit.method === 'POST' || requestInit.method === 'OPTIONS') && typeof target.body === 'string') {
      requestInit.body = target.body;
    }

    let response = await fetch(target.url, requestInit);

    if ((target.method || 'HEAD') === 'HEAD' && (response.status === 405 || response.status === 501)) {
      response = await fetch(target.url, {
        method: 'GET',
        redirect: 'follow',
        signal: abortController.signal,
        headers: requestHeaders
      });
    }
    const expectedStatuses = Array.isArray(target.expectedStatuses) ? target.expectedStatuses : [];
    const ok = expectedStatuses.length
      ? expectedStatuses.includes(Number(response.status || 0))
      : response.ok;

    return {
      label: target.label,
      url: target.url,
      method: target.method || 'HEAD',
      ok,
      status: response.status,
      latencyMs: Math.max(1, Date.now() - startedAt),
      error: ok ? null : `http_${response.status}`
    };
  } catch (error) {
    return {
      label: target.label,
      url: target.url,
      method: target.method || 'HEAD',
      ok: false,
      status: null,
      latencyMs: Math.max(1, Date.now() - startedAt),
      error: error?.name === 'AbortError' ? 'timeout' : 'request_failed'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleHealthCheck(req, res) {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    const preflightCorsHeaders = buildCorsHeaders(req, {
      methods: 'POST, OPTIONS',
      defaultAllowHeaders: 'content-type, authorization, x-bilm-ops-token',
      includePreflight: true
    });
    sendNoContent(res, 204, {
      ...preflightCorsHeaders,
      allow: 'POST, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' }, {
      ...corsHeaders,
      allow: 'POST, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  const { blocked, headers: rateLimitHeadersMap } = enforceRateLimit(req, res, 'healthcheck', corsHeaders);
  if (blocked) return;
  if (!requireOpsTokenAuth(req, res, { corsHeaders, rateLimitHeadersMap })) return;

  let body;
  try {
    body = await readRequestBody(req, 128 * 1024);
  } catch (error) {
    if (error?.statusCode === 413) {
      sendJson(res, 413, { error: 'Payload too large' }, {
        ...corsHeaders,
        ...rateLimitHeadersMap,
        'cache-control': 'no-store'
      });
      return;
    }
    sendJson(res, 400, { error: 'Invalid request payload' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(body || '{}');
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON payload' }, {
      ...corsHeaders,
      ...rateLimitHeadersMap,
      'cache-control': 'no-store'
    });
    return;
  }

  const targets = sanitizeHealthTargets(parsed?.targets || []);
  const results = [];
  for (const target of targets) {
    // Run sequentially to avoid burst traffic.
    // eslint-disable-next-line no-await-in-loop
    const result = await checkHealthTarget(target);
    results.push(result);
  }

  sendJson(res, 200, {
    ok: true,
    checkedAtMs: Date.now(),
    results
  }, {
    ...corsHeaders,
    ...rateLimitHeadersMap,
    'cache-control': 'no-store'
  });
}

async function handleAdminConfig(req, res) {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    const preflightCorsHeaders = buildCorsHeaders(req, {
      methods: 'GET, OPTIONS',
      defaultAllowHeaders: 'content-type, authorization, x-bilm-ops-token',
      includePreflight: true
    });
    sendNoContent(res, 204, {
      ...preflightCorsHeaders,
      allow: 'GET, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' }, {
      ...corsHeaders,
      allow: 'GET, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  const { blocked, headers: rateLimitHeadersMap } = enforceRateLimit(req, res, 'healthcheck', corsHeaders);
  if (blocked) return;
  if (!requireOpsTokenAuth(req, res, { corsHeaders, rateLimitHeadersMap })) return;

  sendJson(res, 200, {
    ok: true,
    adminEmails: ADMIN_EMAIL_ALLOWLIST
  }, {
    ...corsHeaders,
    ...rateLimitHeadersMap,
    'cache-control': 'no-store'
  });
}

async function handleMirrorStatus(req, res) {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    const preflightCorsHeaders = buildCorsHeaders(req, {
      methods: 'GET, OPTIONS',
      defaultAllowHeaders: 'content-type, authorization, x-bilm-ops-token',
      includePreflight: true
    });
    sendNoContent(res, 204, {
      ...preflightCorsHeaders,
      allow: 'GET, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' }, {
      ...corsHeaders,
      allow: 'GET, OPTIONS',
      'cache-control': 'no-store'
    });
    return;
  }

  const { blocked, headers: rateLimitHeadersMap } = enforceRateLimit(req, res, 'healthcheck', corsHeaders);
  if (blocked) return;
  if (!requireOpsTokenAuth(req, res, { corsHeaders, rateLimitHeadersMap })) return;

  if (SUPABASE_MIRROR_ACTIVE) {
    await ensureMirrorQueueLoaded();
  }

  const nowMs = Date.now();
  const queueDepth = Array.isArray(mirrorQueue) ? mirrorQueue.length : 0;
  const oldestQueuedAtMs = queueDepth
    ? mirrorQueue.reduce((min, entry) => {
      const occurredAtMs = Date.parse(String(entry?.event?.occurred_at || '')) || 0;
      return occurredAtMs > 0 ? Math.min(min, occurredAtMs) : min;
    }, Number.MAX_SAFE_INTEGER)
    : 0;
  const nextRetryAtMs = queueDepth
    ? mirrorQueue.reduce((min, entry) => Math.min(min, Number(entry?.nextAttemptAtMs || 0) || nowMs), Number.MAX_SAFE_INTEGER)
    : 0;

  sendJson(res, 200, {
    ok: true,
    enabled: SUPABASE_MIRROR_ENABLED,
    active: SUPABASE_MIRROR_ACTIVE,
    dataApiBase: DATA_API_BASE,
    queueFile: SUPABASE_MIRROR_QUEUE_FILE,
    queueDepth,
    oldestQueuedAgeMs: oldestQueuedAtMs > 0 ? Math.max(0, nowMs - oldestQueuedAtMs) : 0,
    nextRetryAtMs: nextRetryAtMs > 0 ? nextRetryAtMs : null,
    lastSuccessAtMs: mirrorLastSuccessAtMs || null,
    lastErrorAtMs: mirrorLastErrorAtMs || null,
    lastError: mirrorLastError || null
  }, {
    ...corsHeaders,
    ...rateLimitHeadersMap,
    'cache-control': 'no-store'
  });
}

async function routeRequest(req, res) {
  const rawRequestTarget = String(req.url || '/');
  const querySeparatorIndex = rawRequestTarget.indexOf('?');
  const rawPathname = querySeparatorIndex >= 0
    ? rawRequestTarget.slice(0, querySeparatorIndex)
    : rawRequestTarget;
  const apiCorsHeaders = buildCorsHeaders(req);

  let url;
  try {
    url = new URL(rawRequestTarget || '/', 'http://localhost');
  } catch {
    sendJson(res, 400, { error: 'Bad Request' }, { 'cache-control': 'no-store' });
    return;
  }

  if (rawPathname === '/api/anilist') {
    await handleAniListProxy(req, res);
    return;
  }
  if (rawPathname === '/api/admin/config') {
    await handleAdminConfig(req, res);
    return;
  }
  if (rawPathname === '/api/admin/mirror-status') {
    await handleMirrorStatus(req, res);
    return;
  }
  if (rawPathname === '/api/health/check') {
    await handleHealthCheck(req, res);
    return;
  }
  if (rawPathname === '/api/tmdb' || rawPathname.startsWith('/api/tmdb/')) {
    await handleTmdbProxy(req, res, rawPathname, url.searchParams);
    return;
  }
  if (rawPathname === '/api/vidsrc/latest') {
    await handleVidsrcLatestProxy(req, res, url.searchParams);
    return;
  }
  if (rawPathname === '/api/chat' || rawPathname.startsWith('/api/chat/')) {
    await handleChatApiProxy(req, res, rawPathname, url);
    return;
  }
  if (rawPathname === '/api/data' || rawPathname.startsWith('/api/data/')) {
    await handleDataApiProxy(req, res, rawPathname, url);
    return;
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'Not Found' }, {
      ...apiCorsHeaders,
      'cache-control': 'no-store'
    });
    return;
  }
  await serveStatic(req, res, url.pathname);
}

const server = http.createServer((req, res) => {
  routeRequest(req, res).catch((error) => {
    console.error('Unhandled request error:', error);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendJson(res, 500, { error: 'Internal Server Error' }, { 'cache-control': 'no-store' });
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`BILM server listening on http://0.0.0.0:${port}`);
  if (!SUPABASE_MIRROR_ENABLED) return;

  if (!SUPABASE_MIRROR_ACTIVE) {
    console.warn('Supabase mirror disabled: missing SUPABASE_PROJECT_URL and/or SUPABASE_SERVICE_ROLE_KEY.');
    return;
  }

  void ensureMirrorQueueLoaded()
    .then(() => {
      if (mirrorQueue.length) {
        void flushMirrorQueue();
      } else {
        scheduleMirrorRetryFromQueue();
      }
    })
    .catch((error) => {
      console.warn('Supabase mirror startup initialization failed:', error);
    });
});
