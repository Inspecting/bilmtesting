(function () {
  function applyEmbedAttributes(iframe) {
    if (!iframe) return;
    iframe.removeAttribute('sandbox');
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
