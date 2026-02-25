// pwa.js — Service Worker registration + PWA install prompt
(function () {
  // ── Service Worker ────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js')
        .then(function (reg) { console.log('[SW] Registered:', reg.scope); })
        .catch(function (err) { console.warn('[SW] Registration failed:', err); });
    });
  }

  // ── PWA Install Prompt ────────────────────────────────────────────────────
  var deferredPrompt = null;

  // Show the install button in the nav when the browser is ready to install
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var btn = document.getElementById('nav-install-btn');
    if (btn) { btn.style.display = 'flex'; }
  });

  // Called by the install button in the nav
  window._navInstallPwa = function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (result) {
      console.log('[PWA] Install choice:', result.outcome);
      deferredPrompt = null;
      var btn = document.getElementById('nav-install-btn');
      if (btn) { btn.style.display = 'none'; }
    });
  };

  // Hide button after the app is installed
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    var btn = document.getElementById('nav-install-btn');
    if (btn) { btn.style.display = 'none'; }
  });
})();
