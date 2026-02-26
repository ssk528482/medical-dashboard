// nav.js — Shared side navigation
// Synchronously injects the nav + overlay via document.write(), then wires
// up open/close events after the DOM is ready.
(function () {
  // ── Active-page detection ─────────────────────────────────────────────────
  var page = (window.location.pathname.split('/').pop() || 'index.html');
  // Map pages that belong to another nav item (e.g. create → browse)
  var activeMap = { 'create.html': 'browse.html' };
  var activePage = activeMap[page] || page;

  // ── Nav items ─────────────────────────────────────────────────────────────
  var SVG = {
    home:    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10L10 3l7 7"/><path d="M5 8.5V17h4v-4h2v4h4V8.5"/></svg>',
    cal:     '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="16" height="14" rx="2"/><line x1="2" y1="9" x2="18" y2="9"/><line x1="6" y1="2" x2="6" y2="6"/><line x1="14" y1="2" x2="14" y2="6"/></svg>',
    book:    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h9l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><polyline points="13 2 13 6 17 6"/><line x1="7" y1="9" x2="13" y2="9"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="15" x2="10" y2="15"/></svg>',
    chart:   '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="12" width="3.5" height="6" rx="1"/><rect x="8.25" y="7" width="3.5" height="11" rx="1"/><rect x="14.5" y="3" width="3.5" height="15" rx="1"/></svg>',
    user:    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="6.5" r="3.5"/><path d="M2.5 18c0-4.14 3.36-7.5 7.5-7.5s7.5 3.36 7.5 7.5"/></svg>',
    refresh: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 4.8A7 7 0 1 1 4.5 10"/><polyline points="2 7 4.5 10 7 7"/></svg>',
    cards:   '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="14" height="10" rx="2"/><rect x="1" y="5" width="14" height="10" rx="2" stroke-opacity="0.4"/><rect x="3" y="8" width="14" height="10" rx="2"/><line x1="8" y1="13" x2="12" y2="13"/></svg>',
    notes:   '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><line x1="7" y1="8" x2="13" y2="8"/><line x1="7" y1="11" x2="13" y2="11"/><line x1="7" y1="14" x2="10" y2="14"/></svg>',
  };
  var items = [
    { href: 'index.html',     icon: SVG.home,    label: 'Home' },
    { href: 'planner.html',   icon: SVG.cal,     label: 'Planner' },
    { href: 'editor.html',    icon: SVG.book,    label: 'Syllabus' },
    { href: 'analytics.html', icon: SVG.chart,   label: 'Stats' },
    { href: 'profile.html',   icon: SVG.user,    label: 'Profile' },
    { href: 'review.html',    icon: SVG.refresh, label: 'Review', badge: true },
    { href: 'browse.html',    icon: SVG.cards,   label: 'Cards' },
    { href: 'notes.html',     icon: SVG.notes,   label: 'Notes' },
  ];

  var itemsHtml = items.map(function (item) {
    var cls = 'side-nav-item' + (item.href === activePage ? ' active' : '');
    var badge = item.badge
      ? '<span class="side-nav-review-badge" id="nav-review-badge" style="display:none"></span>'
      : '';
    return (
      '<a href="' + item.href + '" class="' + cls + '" data-label="' + item.label + '">' +
      '<span class="side-nav-icon">' + item.icon + '</span>' +
      '<span class="side-nav-label">' + item.label + '</span>' +
      badge + '</a>'
    );
  }).join('\n    ');

  // ── Build HTML ────────────────────────────────────────────────────────────
  var splashHtml =
    '<div id="app-splash" style="position:fixed;inset:0;z-index:999999;background:#0a1628;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;">' +
    '<div style="font-size:64px;animation:splash-pulse 1.8s ease-in-out infinite;">🩺</div>' +
    '<div style="font-size:18px;font-weight:800;color:#f0f6ff;letter-spacing:-0.01em;">Medical Study OS</div>' +
    '<div style="width:48px;height:3px;background:rgba(59,130,246,0.25);border-radius:20px;overflow:hidden;">' +
    '  <div style="height:100%;background:#3b82f6;border-radius:20px;animation:splash-bar 1.4s ease-in-out infinite;"></div>' +
    '</div>' +
    '</div>' +
    '<style>' +
    '@keyframes splash-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}' +
    '@keyframes splash-bar{0%{width:0%;margin-left:0}50%{width:100%;margin-left:0}100%{width:0%;margin-left:100%}}' +
    'html,body{background:#0a1628}' +
    '</style>';

  var html =
    splashHtml +
    '<div id="nav-overlay"></div>\n' +
    '<nav class="side-nav" id="side-nav">\n' +
    '  <button class="side-nav-toggle" id="side-nav-toggle" title="Toggle sidebar">\u276E</button>\n' +
    '  <div class="side-nav-brand">\n' +
    '    <span class="side-nav-brand-icon">\uD83E\uDE7A</span>\n' +
    '    <span class="side-nav-brand-text">Medical OS</span>\n' +
    '  </div>\n' +
    '  <div class="side-nav-items">\n' +
    '    ' + itemsHtml + '\n' +
    '  </div>\n' +
    '  <div class="nav-rotate-btn-wrap">\n' +
    '<button class="nav-install-pwa-btn" id="nav-install-btn" style="display:none;margin-bottom:6px;"\n' +
    '      onclick="window._navInstallPwa && window._navInstallPwa()" title="Install app">\n' +
    '      <span style="font-size:16px;flex-shrink:0;width:24px;text-align:center;">\u2B07\uFE0F</span>\n' +
    '      <span>Install App</span>\n' +
    '    </button>\n' +
    '    <button class="rotate-screen-btn" onclick="toggleRotation()" title="Switch to Landscape">\n' +
    '      <span class="rotate-screen-icon">\uD83D\uDD04</span>\n' +
    '      <span class="rotate-screen-label">Landscape</span>\n' +
    '    </button>\n' +
    '  </div>\n' +
    '</nav>';

  // Synchronous write — script tag must NOT be async/defer
  document.write(html);

  // ── Wire events after DOM is ready ────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var nav     = document.getElementById('side-nav');
    var overlay = document.getElementById('nav-overlay');

    // Splash screen management
    var splash = document.getElementById('app-splash');
    var splashHidden = false;
    // Hide nav and toggle btn until splash is gone
    if (nav) nav.style.visibility = 'hidden';
    window.hideSplash = function () {
      if (splashHidden || !splash) return;
      splashHidden = true;
      splash.style.transition = 'opacity 0.3s ease';
      splash.style.opacity = '0';
      // Reveal nav elements as splash fades
      if (nav) nav.style.visibility = '';
      var tb2 = document.getElementById('nav-toggle-btn');
      if (tb2) tb2.style.visibility = '';
      var rnToggle = document.getElementById('notes-rn-toggle');
      if (rnToggle) rnToggle.style.visibility = '';
      var rnNav = document.getElementById('notes-right-nav');
      if (rnNav) rnNav.style.visibility = '';
      setTimeout(function () { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); }, 320);
    };
    // Fallback: hide after 5 s if nothing called hideSplash
    setTimeout(window.hideSplash, 5000);

    // Floating toggle button
    var tb       = document.createElement('button');
    tb.id        = 'nav-toggle-btn';
    tb.title     = 'Toggle navigation';
    function _tbHtml(open) {
      return '<span class="ntb-arrow">' + (open ? '&#10094;' : '&#10095;') + '</span>' +
             '<span class="ntb-label">NAV</span>';
    }
    tb.innerHTML = _tbHtml(false);
    tb.style.visibility = 'hidden'; // hidden until splash clears
    document.body.appendChild(tb);

    function openNav () {
      nav.classList.add('open');
      overlay.classList.add('open');
      tb.classList.add('open');
      tb.innerHTML = _tbHtml(true);
    }
    function closeNav () {
      nav.classList.remove('open');
      overlay.classList.remove('open');
      tb.classList.remove('open');
      tb.innerHTML = _tbHtml(false);
    }

    tb.addEventListener('click', function () {
      nav.classList.contains('open') ? closeNav() : openNav();
    });
    overlay.addEventListener('click', closeNav);
    nav.querySelectorAll('.side-nav-item').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
  });
})();
