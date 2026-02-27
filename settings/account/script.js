function withBase(path) { return (window.BilmFoundation?.withBase || ((p) => p))(path); }

document.addEventListener('DOMContentLoaded', async () => {
  window.BilmFoundation?.initPage?.({ bodyClass: 'page-settings-account' });

  const title = document.getElementById('accountTitle');
  const meta = document.getElementById('accountMeta');
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');

  async function loadAuth() {
    if (window.bilmAuth) return window.bilmAuth;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = withBase('/shared/auth.js');
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return window.bilmAuth;
  }

  try {
    const auth = await loadAuth();
    await auth.init();

    const sync = (user) => {
      if (user) {
        title.textContent = user.displayName || user.email || 'Account';
        meta.textContent = user.email || 'Signed in';
        signInBtn.hidden = true;
        signOutBtn.hidden = false;
      } else {
        title.textContent = 'Signed out';
        meta.textContent = 'Sign in to sync account preferences.';
        signInBtn.hidden = false;
        signOutBtn.hidden = true;
      }
    };

    sync(auth.getCurrentUser());
    auth.onAuthStateChanged(sync);

    signInBtn.addEventListener('click', () => auth.signInWithGoogle?.());
    signOutBtn.addEventListener('click', () => auth.signOut?.());
  } catch {
    meta.textContent = 'Account service unavailable in this environment.';
    signInBtn.hidden = true;
    signOutBtn.hidden = true;
  }
});
