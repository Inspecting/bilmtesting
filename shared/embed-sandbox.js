(function () {
  const EMBED_SANDBOX_VALUE = [
    'allow-forms',
    'allow-scripts',
    'allow-same-origin',
    'allow-popups',
    'allow-popups-to-escape-sandbox',
    'allow-presentation',
    'allow-downloads'
  ].join(' ');

  function applyEmbedAttributes(iframe) {
    if (!iframe) return;
    iframe.setAttribute('sandbox', EMBED_SANDBOX_VALUE);
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('allow', 'fullscreen; encrypted-media; autoplay');
    iframe.setAttribute('allowfullscreen', '');
  }

  function normalizeEmbedUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.href);
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
