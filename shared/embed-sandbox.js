(function () {
  const DEFAULT_SANDBOX_TOKENS = Object.freeze([
    'allow-scripts',
    'allow-same-origin',
    'allow-forms',
    'allow-popups',
    'allow-popups-to-escape-sandbox',
    'allow-presentation'
  ]);
  const ALLOWED_SANDBOX_TOKENS = new Set(DEFAULT_SANDBOX_TOKENS);

  function buildSandboxValue(rawSandboxValue = '') {
    const requestedTokens = String(rawSandboxValue || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => ALLOWED_SANDBOX_TOKENS.has(token));
    const tokens = requestedTokens.length ? requestedTokens : [...DEFAULT_SANDBOX_TOKENS];
    return [...new Set(tokens)].join(' ');
  }

  function applyEmbedAttributes(iframe) {
    if (!iframe) return;
    const existingSandbox = iframe.getAttribute('sandbox');
    iframe.setAttribute('sandbox', buildSandboxValue(existingSandbox));
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allow', 'fullscreen; encrypted-media; autoplay; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
  }

  function normalizeEmbedUrl(url) {
    const rawUrl = String(url || '').trim();
    if (!rawUrl || rawUrl.length > 4096) return '';
    try {
      const parsed = new URL(rawUrl, window.location.href);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
      return parsed.toString();
    } catch {
      return '';
    }
  }

  function setSandboxedIframeSrc(iframe, url) {
    if (!iframe) return;
    applyEmbedAttributes(iframe);
    iframe.src = normalizeEmbedUrl(url) || 'about:blank';
  }

  window.BilmEmbedSandbox = {
    applySandboxAttributes: applyEmbedAttributes,
    applyEmbedAttributes,
    setSandboxedIframeSrc
  };
})();
