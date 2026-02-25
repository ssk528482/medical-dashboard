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
  var items = [
    { href: 'index.html',     icon: '🏠', label: 'Home' },
    { href: 'planner.html',   icon: '📅', label: 'Planner' },
    { href: 'editor.html',    icon: '📚', label: 'Syllabus' },
    { href: 'analytics.html', icon: '📊', label: 'Stats' },
    { href: 'profile.html',   icon: '👤', label: 'Profile' },
    { href: 'review.html',    icon: '🔁', label: 'Review', badge: true },
    { href: 'browse.html',    icon: '🃏', label: 'Cards' },
    { href: 'notes.html',     icon: '📝', label: 'Notes' },
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
  var html =
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

    // Floating toggle button
    var tb       = document.createElement('button');
    tb.id        = 'nav-toggle-btn';
    tb.innerHTML = '&#10095;';
    tb.title     = 'Toggle navigation';
    document.body.appendChild(tb);

    function openNav () {
      nav.classList.add('open');
      overlay.classList.add('open');
      tb.classList.add('open');
      tb.innerHTML = '&#10094;';
    }
    function closeNav () {
      nav.classList.remove('open');
      overlay.classList.remove('open');
      tb.classList.remove('open');
      tb.innerHTML = '&#10095;';
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
